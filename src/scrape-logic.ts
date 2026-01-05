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
    await acceptCookies(page);

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
    const history = await extractTrackingHistory(page);

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
    return createEmptyShipment(reference);
  }
}

/**
 * Scrapes the tracking history table.
 *
 * @param page Playwright page instance containing tracking results.
 * @returns Array of TrackingEvent objects.
 *
 * @throws Selector evaluation errors bubble to the caller and are handled as soft-failures.
 */
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

/**
 * Attempts to accept the privacy / cookie consent banner if it is present.
 *
 * @param page Playwright page instance currently displaying the tracking site.
 * @returns Resolves when the click attempt has completed.
 *
 * @remarks
 * Absence of the consent banner or inability to click it is non-fatal and is intentionally ignored.
 */
export async function acceptCookies(page: Page) {
  try {
    const consent = page.locator('shell-privacy-overview shell-button')
      .filter({ hasText: /Required cookies|Accept|Acceptera/i })
      .first();

    if (await consent.isVisible({ timeout: 5000 }).catch(() => false)) {
      await consent.click();
    }
  } catch {
    // intentionally ignored
  }
}

/**
 * Creates a browser and page using canonical scraper settings.
 *
 * @returns Object containing Browser and Page.
 *
 * @throws Infrastructure failures are fatal and must propagate.
 */
export async function createBrowser(): Promise<{ browser: Browser; page: Page }> {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
  });
  return { browser, page: await context.newPage() };
}

/**
 * Creates the canonical empty ShipmentData fallback.
 *
 * @param reference Shipment reference identifier.
 * @returns Empty ShipmentData structure.
 */
export function createEmptyShipment(reference: string): ShipmentData {
  return {
    reference,
    sender: { address: '' },
    receiver: { address: '' },
    packages: [{ weight: 0, trackingEvents: [] }],
    trackingHistory: []
  };
}