#!/usr/bin/env tsx
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execFileP = promisify(execFile);

async function extractJsonFromStdout(out: string): Promise<string | null> {
  const startTag = '---JSON-START---';
  const endTag = '---JSON-END---';
  const start = out.indexOf(startTag);
  const end = out.indexOf(endTag);
  if (start !== -1 && end !== -1 && end > start) {
    return out.slice(start + startTag.length, end).trim();
  }

  // fallback: find first { or [ and match braces (simple balanced parser)
  const idxBrace = out.indexOf('{');
  const idxBracket = out.indexOf('[');
  let startIdx = -1;
  let openChar = '';
  if (idxBrace === -1 && idxBracket === -1) return null;
  if (idxBrace === -1) { startIdx = idxBracket; openChar = '['; }
  else if (idxBracket === -1) { startIdx = idxBrace; openChar = '{'; }
  else { startIdx = Math.min(idxBrace, idxBracket); openChar = startIdx === idxBrace ? '{' : '['; }
  const closeChar = openChar === '{' ? '}' : ']';

  let depth = 0; let inString = false; let esc = false; let quote = '';
  for (let i = startIdx; i < out.length; i++) {
    const ch = out[i];
    if (inString) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === quote) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") { inString = true; quote = ch; continue; }
    if (ch === openChar) depth++; else if (ch === closeChar) { depth--; if (depth === 0) return out.slice(startIdx, i+1); }
  }

  return null;
}

function sortKeysDeep(v: any): any {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v && typeof v === 'object') {
    const keys = Object.keys(v).sort();
    const obj: any = {};
    for (const k of keys) obj[k] = sortKeysDeep(v[k]);
    return obj;
  }
  return v;
}

async function main() {
  const ref = process.argv[2] || '1806203236';
  const cmd = 'npx';
  const args = ['tsx', 'src/scrape.ts', ref];

  console.error(`Running scraper: ${cmd} ${args.join(' ')}`);
  const { stdout, stderr } = await execFileP(cmd, args, { timeout: 180000 });
  if (stderr && String(stderr).trim()) console.error('scraper stderr:', String(stderr).trim());
  const out = String(stdout || '');

  const jsonStr = await extractJsonFromStdout(out);
  if (!jsonStr) {
    console.error('Failed to extract JSON from scraper stdout. Raw stdout:\n', out);
    process.exit(2);
  }

  let parsed: any;
  try { parsed = JSON.parse(jsonStr); } catch (e) { console.error('Scraper JSON parse failed:', e); process.exit(2); }

  // Unwrap wrapper if present
  const actualStructured = parsed.structuredContent || parsed;

  const expectedPath = path.join('test_values', `${ref}.json`);
  if (!fs.existsSync(expectedPath)) {
    console.error('Expected JSON not found at', expectedPath);
    console.error('Run the scraper once and save the JSON between ---JSON-START--- / ---JSON-END--- to that file.');
    process.exit(2);
  }

  const expectedRaw = fs.readFileSync(expectedPath, 'utf8');
  let expectedObj: any;
  try { expectedObj = JSON.parse(expectedRaw); } catch (e) { console.error('Expected JSON invalid:', e); process.exit(2); }
  const expectedStructured = expectedObj.structuredContent || expectedObj;

  const a = JSON.stringify(sortKeysDeep(actualStructured), null, 2);
  const b = JSON.stringify(sortKeysDeep(expectedStructured), null, 2);

  if (a === b) {
    console.log(`E2E test PASSED for ${ref}`);
    process.exit(0);
  }

  console.error(`E2E test FAILED for ${ref} — actual output differs from expected.`);
  // Write actual for inspection
  const actualPath = path.join('test_values', `${ref}.actual.json`);
  fs.writeFileSync(actualPath, JSON.stringify(actualStructured, null, 2), 'utf8');
  console.error('Wrote actual output to', actualPath);
  console.error('--- Expected ---\n', b);
  console.error('--- Actual ---\n', a);
  process.exit(1);
}

main().catch((err) => { console.error('E2E test error:', err); process.exit(2); });
