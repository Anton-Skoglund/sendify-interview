import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execFileP = promisify(execFile);
const TEST_TIMEOUT = 10000; // 3 minutes for slow scrapers

async function extractJsonFromStdout(out: string): Promise<any> {
  const startTag = '---JSON-START---';
  const endTag = '---JSON-END---';
  const start = out.indexOf(startTag);
  const end = out.indexOf(endTag);

  let jsonStr: string;
  if (start !== -1 && end !== -1 && end > start) {
    jsonStr = out.slice(start + startTag.length, end).trim();
  } else {
    const startIdx = out.indexOf('{');
    const endIdx = out.lastIndexOf('}');
    if (startIdx === -1 || endIdx === -1) throw new Error('No JSON found in stdout');
    jsonStr = out.slice(startIdx, endIdx + 1);
  }

  const parsed = JSON.parse(jsonStr);
  return parsed.structuredContent || parsed;
}

/**
 * Main test runner function
 */
async function runTestForReference(ref: string) {
  // Use path.resolve with __dirname to stay portable
  const expectedPath = path.resolve(__dirname, '../../test_values', `${ref}.json`);
  const actualPath = path.resolve(__dirname, '../../test_values', `${ref}.actual.json`);

  // 1. Check if expected file exists before running expensive scraper
  if (!fs.existsSync(expectedPath)) {
    throw new Error(`Expected JSON not found at ${expectedPath}`);
  }

  // 2. Run the actual scraper
  // We use tsx to run the source directly
  const { stdout } = await execFileP('npx', ['tsx', 'src/scrape.ts', ref], {
    timeout: TEST_TIMEOUT
  });

  // 3. Parse outputs
  const actualData = await extractJsonFromStdout(stdout);
  const expectedDataRaw = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
  const expectedData = expectedDataRaw.structuredContent || expectedDataRaw;

  // 4. Compare and Write .actual.json on Failure
  try {
    expect(actualData).toEqual(expectedData);
    
    // Cleanup old failure files if it passes now
    if (fs.existsSync(actualPath)) fs.unlinkSync(actualPath);
  } catch (error) {
    fs.writeFileSync(actualPath, JSON.stringify(actualData, null, 2), 'utf8');
    console.error(`\n[!] E2E FAILED: ${ref}. Compare files for diff:`);
    console.error(`Expected: ${expectedPath}`);
    console.error(`Actual:   ${actualPath}\n`);
    throw error; 
  }
}

describe('Scraper E2E Tests', () => {
  test('should scrape reference 1806203236 correctly', async () => {
    await runTestForReference('1806203236');
  }, TEST_TIMEOUT);

  test('should return empty for 9876543210', async () => {
    await runTestForReference('9876543210');
  }, TEST_TIMEOUT);
});