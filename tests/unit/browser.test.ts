import { chromium } from 'playwright';
import { createBrowser } from '../../src/scrape-logic';

describe('Browser Utilities', () => {
  describe('createBrowser with configurations', () => {
    test('should launch browser in headless mode when specified', async () => {
      const browser = await chromium.launch({ headless: true });
      expect(browser).toBeDefined();
      await browser.close();
    });

    test('should set the correct user agent in the browser context', async () => {
      const { browser, page } = await createBrowser();
      const userAgent = await page.evaluate(() => navigator.userAgent);
      expect(userAgent).toContain('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36');
      await browser.close();
    });
  });
});