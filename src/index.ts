#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { invariant } from "@epic-web/invariant";
import { parseArgs } from "util";
import { execFile } from 'child_process';
import { promisify } from 'util';

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

// Register a scraping tool that runs the existing TypeScript scraper as a child process.
// We explicitly do not modify src/scripts/scrape.ts — we call it and parse its stdout.
server.registerTool(
  "scrape",
  {
    title: "Scrape DB Schenker Tracking",
    description: "Runs src/scripts/scrape.ts and returns parsed shipment data.",

    inputSchema: {
      reference: z.string().describe('Tracking/reference number to scrape'),
    },

    outputSchema: {
      reference: z.string(),
      sender: z.object({ name: z.string(), address: z.string() }),
      receiver: z.object({ name: z.string(), address: z.string() }),
      packages: z.array(
        z.object({
          pieceId: z.string().optional(),
          weight: z.number().optional(),
          dimensions: z.string().optional(),
          trackingEvents: z.array(
            z.object({
              date: z.string(),
              location: z.string(),
              event: z.string(),
              reason: z.string().optional(),
            })
          ).optional(),
        })
      ),
      trackingHistory: z.array(
        z.object({
          date: z.string(),
          location: z.string(),
          event: z.string(),
          reason: z.string().optional(),
        })
      ),
    },
  },

  async (params) => {
    const reference = params.reference;
    try {
      // Use npx tsx to execute the TypeScript scraper file; capture stdout.
      const cmd = 'npx';
      const args = ['tsx', 'src/scripts/scrape.ts', reference];

      const { stdout, stderr } = await execFileP(cmd, args, { timeout: 120000 });
      if (stderr && String(stderr).trim()) console.error('scraper stderr:', String(stderr).trim());

      const out = String(stdout || '');

      // Robustly extract a JSON object/array from mixed stdout. Find the first
      // '{' or '[' then find the matching closing brace while honoring strings
      // and escapes so we don't accidentally cut inside a string.
      function extractJson(s: string): string | null {
        const idxBrace = s.indexOf('{');
        const idxBracket = s.indexOf('[');
        let start = -1;
        let openChar = '';
        if (idxBrace === -1 && idxBracket === -1) return null;
        if (idxBrace === -1) { start = idxBracket; openChar = '['; }
        else if (idxBracket === -1) { start = idxBrace; openChar = '{'; }
        else { start = Math.min(idxBrace, idxBracket); openChar = start === idxBrace ? '{' : '['; }

        const closeChar = openChar === '{' ? '}' : ']';

        let depth = 0;
        let inString = false;
        let quoteChar = '';
        let escaped = false;

        for (let i = start; i < s.length; i++) {
          const ch = s[i];
          if (inString) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === quoteChar) inString = false;
            continue;
          }

          if (ch === '"' || ch === "'") {
            inString = true;
            quoteChar = ch;
            continue;
          }

          if (ch === openChar) depth++;
          else if (ch === closeChar) {
            depth--;
            if (depth === 0) return s.slice(start, i + 1);
          }
        }

        return null;
      }

      const jsonLine = extractJson(out);
      if (!jsonLine) {
        console.error('Scraper stdout (no JSON found):\n', out);
        throw new Error('No JSON found in scraper output');
      }

      let parsed: any;
      try {
        parsed = JSON.parse(jsonLine);
      } catch (e) {
        console.error('Failed to parse JSON from scraper output. Snippet:\n', jsonLine);
        throw e;
      }

      // Normalize parsed output to match the outputSchema strictly.
      const normalized = {
        reference: parsed?.reference || reference,
        sender: {
          name: parsed?.sender?.name || '',
          address: parsed?.sender?.address || ''
        },
        receiver: {
          name: parsed?.receiver?.name || '',
          address: parsed?.receiver?.address || ''
        },
        packages: Array.isArray(parsed?.packages)
          ? parsed.packages.map((p: any) => ({
            pieceId: p?.pieceId || undefined,
            weight: typeof p?.weight === 'number' ? p.weight : p?.weight ? Number(p.weight) : undefined,
            dimensions: p?.dimensions || undefined,
            trackingEvents: Array.isArray(p?.trackingEvents) ? p.trackingEvents : undefined,
          }))
          : [
            {
              pieceId: parsed?.packages?.pieceId || undefined,
              weight: typeof parsed?.packages === 'number' ? parsed.packages : parsed?.packages?.weight ? Number(parsed.packages.weight) : undefined,
              dimensions: parsed?.packages?.dimensions || undefined,
              trackingEvents: Array.isArray(parsed?.trackingHistory) ? parsed.trackingHistory : undefined,
            },
          ],
        trackingHistory: Array.isArray(parsed?.trackingHistory) ? parsed.trackingHistory : Array.isArray(parsed?.packages?.trackingEvents) ? parsed.packages.trackingEvents : [],
      };

      return {
        content: [{ type: 'text', text: `Scraped reference ${normalized.reference}` }],
        structuredContent: normalized,
      };
    } catch (err: any) {
      console.error('scrape tool error:', err);
      const reference = params?.reference || '';
      return {
        content: [{ type: 'text', text: `Scrape failed: ${err?.message || String(err)}` }],
        structuredContent: {
          reference,
          sender: { name: '', address: '' },
          receiver: { name: '', address: '' },
          packages: [],
          trackingHistory: [],
          error: String(err),
        },
      };
    }
  }
);


// Register an AI prompt template that instructs a model to run the scraper and return a summary.
// This does not execute the tools itself — it returns messages that an LLM client can use to
// decide to call the `scrape` and `summarize_shipment` tools.
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
  console.error("Joke API MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
