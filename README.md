# Sendify Code Challenge — DB Schenker Shipment Tracker MCP Server

This repository contains an MCP server and a Playwright-based scraper that extracts shipment information
from DB Schenker's public tracking page.

Features
- MCP server exposing a `scrape` tool which accepts a `reference` and returns structured shipment data.
- Playwright scraper at `src/scrape.ts` that visits https://www.dbschenker.com/app/tracking-public/ and extracts shipment details.
- CLI wrapper `src/cli-scrape.ts` to run the scraper locally and print JSON.
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
```

3. Run the MCP server (inspector available via `npm run start`)

Call the `scrape` tool with input:

```json
 1806203236
```

Design notes and debugging
- The scraper defaults to headless mode for server/CI usage. To run headed for debugging:

```bash
SCRAPER_HEADLESS=false npx tsx src/scrape.ts 1806203236
# or
npx tsx src/scrape.ts 1806203236 --headed
```

- On failures the scraper logs details. If you want automatic screenshots or HTML dumps
  on failure, I can add `--dump-on-fail` behaviour.

Tests

Run it with:

```bash
npm test
```