import { chromium, Page, Browser, BrowserContext } from 'playwright';
import type { TrackingEvent, ShipmentData } from './types';
import {initializeBrowser, performSearch, extractShipmentData} from './scrape-logic'

const TRACKING_URL = 'https://www.dbschenker.com/app/tracking-public/';

// CLI Execution
const isMain = process.argv[1]?.endsWith('scrape.ts') || process.argv[1]?.endsWith('scrape.js');

if (isMain) {
  const ref = process.argv[2];
  if (!ref) {
    console.error('Usage: ts-node main.ts <REFERENCE_NUMBER>');
    process.exit(1);
  }
  runScraper(ref).catch(console.error);
}

/**
 * The main orchestration function that runs the full scraping lifecycle.
 * Handles browser lifecycle management (open/close) and error reporting.
 * * @param reference - The shipment reference ID passed via CLI or parent function.
 */
export async function runScraper(reference: string) {
  const isHeaded = process.argv.includes('--headed');
  const { browser, page } = await initializeBrowser(isHeaded);

  try {
    console.error(`Scraping reference: ${reference}`);
    await performSearch(page, reference);

    const data = await extractShipmentData(page, reference);
    process.stdout.write(JSON.stringify(data, null, 2));

    return data;
  } catch (error) {
    console.error('Scrape failed:', error);
    throw new Error(`Scraper failed for reference ${reference}`);
  } finally {
    await browser.close();
  }
}

