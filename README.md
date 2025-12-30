# Sendify Code Challenge — DB Schenker Shipment Tracker MCP Server

This repository contains an MCP server and a Playwright-based scraper that extracts shipment information
from DB Schenker's public tracking page.

Features
- MCP server exposing a `scrape` tool which accepts a `reference` and returns structured shipment data.
- Playwright scraper at `src/scripts/scrape.ts` that visits https://www.dbschenker.com/app/tracking-public/ and extracts shipment details.
- CLI wrapper `src/scripts/cli-scrape.ts` to run the scraper locally and print JSON.
- Robust MCP-side JSON extraction and normalization in `src/index.ts`.
- Minimal parser test that runs against a saved HTML dump (uses jsdom).

Quick start

1. Install dependencies

```bash
npm install
```

2. Run the scraper directly (prints JSON)

```bash
npm run scrape 1806203236
# or directly
npx tsx src/scripts/cli-scrape.ts 1806203236
```

3. Run the MCP server (inspector available via `npm run start`)

```bash
npm run dev   # development server (uses tsx)
# or
npm run start # inspector + server
```

Call the `scrape` tool with input:

```json
{ "reference": "1806203236" }
```

Design notes and debugging
- The scraper prints a clearly delimited JSON block between the markers
  `---JSON-START---` and `---JSON-END---`. The MCP tool looks for these markers first
  when extracting JSON from the scraper stdout (very robust for IPC).
- The scraper defaults to headless mode for server/CI usage. To run headed for debugging:

```bash
SCRAPER_HEADLESS=false npx tsx src/scripts/cli-scrape.ts 1806203236
# or
npx tsx src/scripts/cli-scrape.ts 1806203236 --headed
```

- On failures the scraper logs details. If you want automatic screenshots or HTML dumps
  on failure, I can add `--dump-on-fail` behaviour.

Tests

The repository includes a lightweight parser test that runs against the saved HTML dump in `html-dumps/`.
Run it with:

```bash
npm test
```

If the test fails, ensure `html-dumps/1806203236.html` exists (it is created by the scraper when run).

Submission checklist (for Sendify)
- README with setup/run/test instructions (this file)
- Working MCP tool `scrape` (see `src/index.ts`)
- Scraper code `src/scripts/scrape.ts` and CLI `src/scripts/cli-scrape.ts`

Next improvements (optional)
- Add integration tests mocking Playwright network requests.
- Add caching/queueing around Playwright to avoid launching a browser per request.
- Add screenshot+HTML dump on failure and more aggressive retry/polling.

If you want, I can add any of the improvements above and prepare a PR-ready README for your GitHub submission.
