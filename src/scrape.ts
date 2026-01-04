import { chromium, Page, Browser, BrowserContext } from 'playwright';
import type { TrackingEvent, ShipmentData } from './types';

const TRACKING_URL = 'https://www.dbschenker.com/app/tracking-public/';

/**
 * Initializes the Playwright browser instance and creates a new page context.
 * * @param headedOverride - If true, forces the browser to launch in non-headless mode.
 * @returns A promise resolving to an object containing the {@link Browser} and {@link Page} instances.
 * * @example
 * ```ts
 * const { browser, page } = await initializeBrowser(true);
 * ```
 */
export async function initializeBrowser(headedOverride: boolean = false): Promise<{ browser: Browser; page: Page }> {
  const envVal = process.env.SCRAPER_HEADLESS;
  let headless = !(envVal === 'false' || envVal === '0');
  if (headedOverride) headless = false;

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
  });
  const page = await context.newPage();

  return { browser, page };
}

/**
 * Navigates to the DB Schenker tracking portal and performs a search for a specific shipment.
 * This function also handles common UI obstacles like privacy consent banners.
 * * @param page - The Playwright page instance to perform actions on.
 * @param reference - The shipment reference number or tracking ID.
 * @throws Will throw an error if the navigation fails or search elements are missing.
 */
export async function performSearch(page: Page, reference: string): Promise<void> {
  try {
    await page.goto(TRACKING_URL, { waitUntil: 'networkidle' });

    // Handle Privacy Banner
    try {
      await page.locator('shell-privacy-overview shell-button')
        .filter({ hasText: /Required cookies|Accept|Acceptera/i })
        .first()
        .click({ timeout: 5000 });
    } catch (error) {
      console.warn('Privacy banner not found or could not be clicked:', error);
    }

    // Input reference and search
    await page.fill('input[matinput]', reference);
    await page.click('button.hero.primary');

    // Expand details if "See more" exists
    const seeMore = page.locator('button:has-text("See more")');
    if (await seeMore.isVisible().catch(() => false)) {
      await seeMore.click();
      await page.waitForTimeout(500);
    }

    await page.waitForTimeout(2000); // Wait for results to settle
  } catch (error) {
    console.error('Error during performSearch:', error);
    throw new Error(`Failed to perform search for reference ${reference}`);
  }
}

/**
 * Scrapes the shipment details and tracking history from the current page state.
 * * @remarks
 * This function uses {@link page.$$eval} to execute logic within the browser context. 
 * It targets `data-test` attributes for high-resiliency scraping.
 * * @param page - The page instance currently displaying the tracking results.
 * @param reference - The reference used for the search (to be included in the return object).
 * @returns A promise resolving to a structured {@link ShipmentData} object.
 */
export async function extractShipmentData(page: Page, reference: string): Promise<ShipmentData> {
  try {
    const history = await page.$$eval('tbody tr.ng-star-inserted', (rows) => {
      return rows.map((row, index) => {
        const eventEl = row.querySelector(`[data-test^="shipment_status_history_event_${index}"]`);
        const dateEl = row.querySelector(`[data-test^="shipment_status_history_date_${index}"]`);
        const locEl = row.querySelector(`[data-test^="shipment_status_history_location_${index}"]`);
        const reasonEl = row.querySelector(`[data-test^="shipment_status_history_reasons_${index}"]`);

        const dateText = dateEl?.textContent?.trim() || '';
        const locText = locEl?.textContent?.trim() || '';

        if (!dateText && !locText) return null;

        return {
          event: eventEl?.textContent?.trim() || 'Status Update',
          date: dateText,
          location: locText,
          reason: reasonEl?.textContent?.trim() || undefined,
        };
      }).filter(Boolean);
    }) as TrackingEvent[];

    const safeGetText = async (selector: string) => {
      try {
        return await page.$eval(selector, (el) => el.textContent?.trim() || '');
      } catch (error) {
        console.warn(`Failed to get text for selector ${selector}:`, error);
        return '';
      }
    };

    const shipper = await safeGetText('[data-test="shipper_place_value"]');
    const consignee = await safeGetText('[data-test="consignee_place_value"]');
    const weightStr = await safeGetText('[data-test="total_weight_value"]');

    return {
      reference,
      sender: { address: shipper },
      receiver: { address: consignee },
      packages: [{
        weight: parseFloat(weightStr.replace(/[^0-9.]/g, '')) || 0,
        trackingEvents: history
      }],
      trackingHistory: history,
    };
  } catch (error) {
    console.error('Error during extractShipmentData:', error);
    throw new Error(`Failed to extract shipment data for reference ${reference}`);
  }
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

export async function extractTrackingHistory(page: Page): Promise<TrackingEvent[]> {
  return page.$$eval('tbody tr.ng-star-inserted', rows =>
    rows.map(r => ({
      event: r.querySelector('[data-test^="shipment_status_history_event_"]')?.textContent?.trim() || 'Status Update',
      date: r.querySelector('[data-test^="shipment_status_history_date_"]')?.textContent?.trim() || '',
      location: r.querySelector('[data-test^="shipment_status_history_location_"]')?.textContent?.trim() || '',
      reason: r.querySelector('[data-test^="shipment_status_history_reasons_"]')?.textContent?.trim() || undefined,
    }))
  );
}

export async function acceptCookies(page: Page) {
  const consent = page.locator(
    'shell-privacy-overview >> shadow=shell-button:has-text("Accept")'
  );

  if (await consent.isVisible({ timeout: 8000 }).catch(() => false)) {
    await consent.click();
    await page.waitForSelector('shell-privacy-overview', { state: 'detached', timeout: 8000 });
  }
}

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

export function resolveHeadless(): boolean {
  const env = process.env.SCRAPER_HEADLESS;
  const cli = process.argv;

  if (cli.includes('--headed')) return false;
  if (cli.includes('--headless')) return true;
  if (env === 'false' || env === '0') return false;
  return true;
}

export async function createBrowser(): Promise<{ browser: Browser; page: Page }> {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
  });
  return { browser, page: await context.newPage() };
}