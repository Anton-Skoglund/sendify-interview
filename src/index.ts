#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { z } from "zod";
import { execFile } from 'child_process';
import { promisify } from 'util';

import { ShipmentData, ShipmentSchema } from './types'

function returnShipment(data: ShipmentData) {
  return ShipmentSchema.parse(data); // runtime + compile-time safety
}

const execFileP = promisify(execFile);


const server = new McpServer(
  {
    name: "db-schenker-server",
    version: "1.0.0",
    title: "DB Schenker scraper",
  },
  {
    // High-level server instructions to help models / users understand available tools
    instructions:
      "This MCP server exposes tools to fetch and summarise DB Schenker shipment tracking information.\n" +
      "Tools available: `scrape` (accepts { reference }) — runs a Playwright scraper and returns structured shipment data;\n" +
      "`summarize_shipment` (accepts { reference } or { data }) — returns a short human-friendly summary of the shipment.\n" +
      "When a user asks about the status of a shipment, call `scrape` with the provided reference, then call `summarize_shipment` on the result to produce a concise summary.\n" +
      "If the scrape fails, return a helpful error message and suggest the user retry or check the reference number.",
  }
);

server.registerTool(
  "scrape",
  {
    title: "Scrape DB Schenker Tracking",
    description: "Runs src/scripts/scrape.ts and returns parsed shipment data.",

    inputSchema: {
      reference: z.string().describe('Tracking/reference number to scrape'),
    },
    outputSchema: ShipmentSchema,
  },

  async (params) => {
    const reference = params.reference;

    try {
      const { stdout } = await execFileP(
        'npx',
        ['tsx', 'src/scrape.ts', reference],
        { timeout: 120000 }
      );

      const out = String(stdout || '');

      // Prefer explicit delimiters
      function extractJson(s: string): string | null {
        const startTag = '---JSON-START---';
        const endTag = '---JSON-END---';
        const start = s.indexOf(startTag);
        const end = s.indexOf(endTag);
        if (start !== -1 && end !== -1 && end > start) {
          return s.slice(start + startTag.length, end).trim();
        }

        // fallback: balanced-brace extractor
        const idxBrace = s.indexOf('{');
        const idxBracket = s.indexOf('[');
        if (idxBrace === -1 && idxBracket === -1) return null;
        let startIdx = -1;
        let openChar = '';
        if (idxBrace === -1) { startIdx = idxBracket; openChar = '['; }
        else if (idxBracket === -1) { startIdx = idxBrace; openChar = '{'; }
        else { startIdx = Math.min(idxBrace, idxBracket); openChar = startIdx === idxBrace ? '{' : '['; }
        const closeChar = openChar === '{' ? '}' : ']';

        let depth = 0;
        let inString = false;
        let quote = '';
        let esc = false;
        for (let i = startIdx; i < s.length; i++) {
          const ch = s[i];
          if (inString) {
            if (esc) esc = false;
            else if (ch === '\\') esc = true;
            else if (ch === quote) inString = false;
            continue;
          }
          if (ch === '"' || ch === "'") { inString = true; quote = ch; continue; }
          if (ch === openChar) depth++;
          else if (ch === closeChar) {
            depth--;
            if (depth === 0) return s.slice(startIdx, i + 1);
          }
        }

        return null;
      }

      const jsonSnippet = extractJson(out);
      if (!jsonSnippet) {
        throw new Error('No JSON found in scraper stdout');
      }

      let parsed: any;
      try {
        parsed = JSON.parse(jsonSnippet);
      } catch (e) {
        throw new Error('Failed to parse JSON from scraper: ' + String(e));
      }

      const structured = parsed.structuredContent || parsed;

      // This line enforces the MCP contract at runtime
      const validated = returnShipment(structured);

      return {
        structuredContent: validated,
        content: [{ type: 'text', text: `Scraped reference ${validated.reference}` }],
      };
    } catch (err: any) {
      return {
        structuredContent: {
          reference,
          sender: { name: '', address: '' },
          receiver: { name: '', address: '' },
          packages: [],
          trackingHistory: [],
        },
        content: [{ type: 'text', text: `Scrape failed: ${err?.message || err}` }],
      };
    }
  }
);


server.registerPrompt?.(
  "track_and_summarize",
  {
    title: "Track & Summarize Shipment",
    description: "Fetch a DB Schenker shipment using the scrape tool and return a short summary.",
    argsSchema: {
      reference: z.string().describe("DB Schenker tracking reference"),
    },
  },

  async (args: any) => {
    const reference = args.reference;


    return {
      messages: [
        {
          role: "assistant",
          content: {
            type: "text",
            text: "You are an assistant that MUST use the provided MCP tools to fetch and summarise DB Schenker shipments."
          }
        },
        {
          role: "user",
          content: {
            type: "text",
            text: `
                Call the MCP tool named "scrape" with the following JSON input exactly:
                { "reference": "${reference}" }

                When the tool returns structured shipment data, call the MCP tool named "summarize_shipment" and pass the returned data as the "data" parameter.

                Return ONLY:
                - the final summarized text
                - the structured summary object

                Do not include intermediate steps, tool logs, or explanations.

                If the scrape fails, retry once. If it fails again, return a clear error message suggesting the reference number be verified.
                `
          }
        }
      ]
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Schenker DB API MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
