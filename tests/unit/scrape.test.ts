import { chromium, Page } from 'playwright';
import { initializeBrowser, performSearch, extractShipmentData } from '../../src/scrape';

describe('Scrape Utilities', () => {
  describe('initializeBrowser', () => {
    test('should launch browser in headless mode by default', async () => {
      const { browser } = await initializeBrowser();
      expect(browser).toBeDefined();
      await browser.close();
    });

    test('should launch browser in non-headless mode when headedOverride is true', async () => {
      const { browser } = await initializeBrowser(true);
      expect(browser).toBeDefined();
      await browser.close();
    });
  });

  describe('extractShipmentData', () => {
    let page: Page;

    beforeEach(() => {
      page = {
        $$eval: jest.fn().mockResolvedValue([
          {
            event: 'Delivered',
            date: '2026-01-01',
            location: 'Stockholm',
            reason: undefined,
          },
        ]),
        $eval: jest.fn().mockResolvedValue('Test Address'),
      } as unknown as Page;
    });

    test('should extract shipment data correctly', async () => {
      const data = await extractShipmentData(page, 'TEST_REF');

      expect(data).toEqual({
        reference: 'TEST_REF',
        sender: { address: 'Test Address' },
        receiver: { address: 'Test Address' },
        packages: [
          {
            weight: 0,
            trackingEvents: [
              {
                event: 'Delivered',
                date: '2026-01-01',
                location: 'Stockholm',
                reason: undefined,
              },
            ],
          },
        ],
        trackingHistory: [
          {
            event: 'Delivered',
            date: '2026-01-01',
            location: 'Stockholm',
            reason: undefined,
          },
        ],
      });
    });
  });
});