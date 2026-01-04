import { chromium } from 'playwright';
import { resolveHeadless, createBrowser } from '../../src/scrape';

describe('Browser Utilities', () => {
  test('resolveHeadless should return true when --headless is passed', () => {
    process.argv.push('--headless');
    expect(resolveHeadless()).toBe(true);
    process.argv.pop();
  });

  test('resolveHeadless should return false when --headed is passed', () => {
    process.argv.push('--headed');
    expect(resolveHeadless()).toBe(false);
    process.argv.pop();
  });

  test('createBrowser should launch a browser instance', async () => {
    const { browser, page } = await createBrowser();
    expect(browser).toBeDefined();
    expect(page).toBeDefined();
    await browser.close();
  });

  describe('resolveHeadless with environment variables', () => {
    test('should return false when SCRAPER_HEADLESS is set to false', () => {
      process.env.SCRAPER_HEADLESS = 'false';
      expect(resolveHeadless()).toBe(false);
      delete process.env.SCRAPER_HEADLESS;
    });

    test('should return true when SCRAPER_HEADLESS is set to true', () => {
      process.env.SCRAPER_HEADLESS = 'true';
      expect(resolveHeadless()).toBe(true);
      delete process.env.SCRAPER_HEADLESS;
    });
  });

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