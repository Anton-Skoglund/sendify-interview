import { chromium, Page } from 'playwright';

interface TrackingEvent {
  date: string;
  location: string;
  event: string;
  reason?: string;
}

interface ShipmentData {
  reference: string;
  sender: { name: string; address: string };
  receiver: { name: string; address: string };
  packages: Array<{
    pieceId?: string;
    weight?: number;
    dimensions?: string;
    trackingEvents?: TrackingEvent[];
  }>;
  trackingHistory: TrackingEvent[];
}

const TRACKING_URL = 'https://www.dbschenker.com/app/tracking-public/';

async function runScraper(reference: string) {
  // Determine headless mode:
  // - If SCRAPER_HEADLESS env var is set, use it ("false" or "0" => headed)
  // - Otherwise default to headless=true to avoid X server errors in CI/servers
  // - CLI flags: --headed forces headed mode, --headless forces headless
  const envVal = process.env.SCRAPER_HEADLESS;
  let headless = true;
  if (typeof envVal === 'string') {
    headless = !(envVal === 'false' || envVal === '0');
  }
  if (process.argv.includes('--headed')) headless = false;
  if (process.argv.includes('--headless')) headless = true;

  console.log(`Launching browser (headless=${headless})`);
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    console.log(`Navigating to ${TRACKING_URL}...`);
    await page.goto(TRACKING_URL, { waitUntil: 'networkidle' });

    // 1. Handle Shadow DOM Privacy Banner
    try {
      const acceptBtn = page.locator('shell-privacy-overview shell-button').filter({ hasText: /Required cookies|Accept|Acceptera/i });
      await acceptBtn.waitFor({ state: 'visible', timeout: 5000 });
      await acceptBtn.first().click();
      console.log('Privacy banner dismissed.');
    } catch (e) {
      console.log('Privacy banner did not appear or was already dismissed.');
    }

    // 2. Perform Search
    console.log(`Searching for reference: ${reference}`);
    await page.fill('input[matinput]', reference);
    await page.click('button.hero.primary');

    
    // Optional: Click "See More" if you want expanded details
    const seeMore = page.locator('button:has-text("See more")');
    if (await seeMore.isVisible()) {
      await seeMore.click();
      await page.waitForTimeout(500); // Wait for animation
    }


    // 3. Wait for results to load (wait for the status history table to appear)
    await page.waitForTimeout(5000);

    // 4. Run the Parser logic
    const data = await parseSchenkerHtml(page, reference);
    
  console.log('--- Extracted Data ---');
  // Print JSON with explicit delimiters so the MCP server can reliably extract it.
  console.log('---JSON-START---');
  console.log(JSON.stringify(data, null, 2));
  console.log('---JSON-END---');

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
  const history = await page.$$eval('tbody tr.ng-star-inserted', (rows: Element[]) => {
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
  });

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
    sender: { name: 'Shipper', address: shipper },
    receiver: { name: 'Consignee', address: consignee },
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