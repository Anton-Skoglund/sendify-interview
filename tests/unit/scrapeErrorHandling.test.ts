import { Page } from 'playwright';
import { performSearch, extractShipmentData, runScraper } from '../../src/scrape';

describe('Scrape function error handling', () => {
  let page: jest.Mocked<Page>;

  beforeEach(() => {
    page = {
      goto: jest.fn(),
      locator: jest.fn().mockImplementation(() => ({
        filter: jest.fn().mockReturnThis(),
        first: jest.fn().mockReturnThis(),
        click: jest.fn().mockRejectedValue(new Error('Click failed')),
        isVisible: jest.fn().mockResolvedValue(true),
      })),
      fill: jest.fn(),
      click: jest.fn(),
      waitForTimeout: jest.fn(),
      $$eval: jest.fn().mockRejectedValue(new Error('Evaluation failed')),
      $eval: jest.fn().mockRejectedValue(new Error('Evaluation failed')),
    } as unknown as jest.Mocked<Page>;
  });

  test('performSearch throws if navigation/search fails', async () => {
    await expect(performSearch(page, 'TEST_REF'))
      .rejects.toThrow('Failed to perform search for reference TEST_REF');
  });

  test('extractShipmentData returns safe empty structure on DOM failure', async () => {
    const data = await extractShipmentData(page, 'TEST_REF');

    expect(data).toEqual({
      reference: 'TEST_REF',
      sender: { address: '' },
      receiver: { address: '' },
      packages: [{ weight: 0, trackingEvents: [] }],
      trackingHistory: []
    });
  });

  test('runScraper returns empty shipment when page fails but still closes browser', async () => {
    const mockBrowser = { close: jest.fn() };

    jest.spyOn(require('../../src/scrape'), 'initializeBrowser')
      .mockResolvedValue({ browser: mockBrowser as any, page: page });

    const result = await runScraper('TEST_REF');

    expect(result.trackingHistory).toEqual([]);
    expect(result.packages[0].weight).toBe(0);
    expect(mockBrowser.close).toHaveBeenCalled();
  });

  test('runScraper handles errors and still closes browser', async () => {
    const mockBrowser = { close: jest.fn() };

    jest.spyOn(require('../../src/scrape'), 'initializeBrowser')
      .mockResolvedValue({ browser: mockBrowser as any, page: page });
    jest.spyOn(require('../../src/scrape'), 'performSearch').mockImplementation(() => {
      throw new Error('Search failed');
    });
    jest.spyOn(require('../../src/scrape'), 'extractShipmentData').mockImplementation(() => {
      throw new Error('Data extraction failed');
    });

    await expect(runScraper('TEST_REF')).rejects.toThrow('Scraper failed for reference TEST_REF');
    expect(mockBrowser.close).toHaveBeenCalled();

    // Ensure browser closes even on error
    mockBrowser.close.mockClear();
    jest.spyOn(require('../../src/scrape'), 'performSearch').mockRejectedValue(new Error('Search failed'));
    await expect(runScraper('TEST_REF')).rejects.toThrow('Scraper failed for reference TEST_REF');
    expect(mockBrowser.close).toHaveBeenCalled();
  });
});
