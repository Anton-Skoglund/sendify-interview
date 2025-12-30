import { chromium, Page } from 'playwright';
import type { TrackingEvent, ShipmentData } from './types';

const TRACKING_URL = 'https://www.dbschenker.com/app/tracking-public/';

async function runScraper(reference: string) {
  // Configure headless mode from env or CLI flags (defaults to headless)
  const envVal = process.env.SCRAPER_HEADLESS;
  let headless = true;
  if (typeof envVal === 'string') headless = !(envVal === 'false' || envVal === '0');
  if (process.argv.includes('--headed')) headless = false;
  if (process.argv.includes('--headless')) headless = true;

  console.error(`Launching browser (headless=${headless})`);
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    console.error(`Navigating to ${TRACKING_URL}...`);
    await page.goto(TRACKING_URL, { waitUntil: 'networkidle' });

    // Dismiss privacy/consent banner if present (shadow DOM aware)
    try {
      const acceptBtn = page.locator('shell-privacy-overview shell-button').filter({ hasText: /Required cookies|Accept|Acceptera/i });
      await acceptBtn.first().click({ timeout: 5000 }).catch(() => {});
      console.error('Privacy banner dismissed (if it was present).');
    } catch {
      // ignore
    }

    // Perform search
    console.error(`Searching for reference: ${reference}`);
    await page.fill('input[matinput]', reference);
    await page.click('button.hero.primary');

    // Optionally expand details
    const seeMore = page.locator('button:has-text("See more")');
    if (await seeMore.isVisible().catch(() => false)) {
      await seeMore.click().catch(() => {});
      await page.waitForTimeout(500);
    }

    // Wait briefly for results to render
    await page.waitForTimeout(2000);

    // Parse the page into structured data
    const data = await parseSchenkerHtml(page, reference);

process.stdout.write(JSON.stringify(data));

    return data;

  } catch (err) {
    console.error('Scrape failed:', err);
  } finally {
    await browser.close();
  }
}

async function parseSchenkerHtml(page: Page, reference: string): Promise<ShipmentData> {
  // Use small page-side evaluations to avoid CSP/addScriptTag issues.
  // Extract history rows in the page context.
  const history = (await page.$$eval('tbody tr.ng-star-inserted', (rows: Element[]) => {
    return rows.map((row, index) => {
      const eventEl = row.querySelector(`[data-test^="shipment_status_history_event_${index}"]`);
      const dateEl = row.querySelector(`[data-test^="shipment_status_history_date_${index}"]`);
      const locEl = row.querySelector(`[data-test^="shipment_status_history_location_${index}"]`);
      const reasonEl = row.querySelector(`[data-test^="shipment_status_history_reasons_${index}"]`);

      const eventText = eventEl && eventEl.textContent ? eventEl.textContent.trim() : '';
      const dateText = dateEl && dateEl.textContent ? dateEl.textContent.trim() : '';
      const locText = locEl && locEl.textContent ? locEl.textContent.trim() : '';
      const reasonText = reasonEl && reasonEl.textContent ? reasonEl.textContent.trim() : undefined;

      if (dateText || locText) {
        return {
          event: eventText || 'Status Update',
          date: dateText || '',
          location: locText || '',
          reason: reasonText || undefined,
        };
      }
      return null;
    }).filter(Boolean as any);
  })) as TrackingEvent[];

  // Get shipper/consignee/weight via small $eval calls (safe under CSP)
  const getText = async (selector: string) => {
    try {
      return await page.$eval(selector, (el: Element) => (el.textContent || '').trim());
    } catch (e) {
      return '';
    }
  };

  const shipper = await getText('[data-test="shipper_place_value"]');
  const consignee = await getText('[data-test="consignee_place_value"]');
  const weightStr = (await getText('[data-test="total_weight_value"]')) || '';

  return {
    reference,
    sender: {address: shipper },
    receiver: { address: consignee },
    packages: [{ weight: parseFloat((weightStr || '').replace(/[^0-9.]/g, '')) || 0, trackingEvents: history }],
    trackingHistory: history,
  };
}

// CLI Execution
const ref = process.argv[2];
if (!ref) {
  console.error('Usage: ts-node main.ts <REFERENCE_NUMBER>');
  process.exit(1);
}

runScraper(ref);