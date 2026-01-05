import { Page } from 'playwright';
// Import the real function we want to test
import { runScraper } from '../../src/scrape';
// Import the helpers so we can manipulate their mocks
import * as scrapeHelpers from '../../src/scrape-logic';



// 1. Force the module to be mocked
jest.mock('../../src/scrape-logic', () => {
  const actual = jest.requireActual('../../src/scrape-logic');
  return {
    ...actual,
    initializeBrowser: jest.fn(),
    performSearch: jest.fn(),
    extractShipmentData: jest.fn(),
  };
});

describe('Scrape function error handling', () => {
  let mockBrowser: any;
  let mockPage: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPage = { /* ... your page mock ... */ };
    mockBrowser = { close: jest.fn().mockResolvedValue(undefined) };

    // Link the mock to initializeBrowser
    (scrapeHelpers.initializeBrowser as jest.Mock).mockResolvedValue({
      browser: mockBrowser,
      page: mockPage,
    });
  });

  test('runScraper handles errors and still closes browser', async () => {
    // 2. Mock the internal call to FAIL
    (scrapeHelpers.performSearch as jest.Mock).mockRejectedValue(new Error('Search failed'));

    await expect(runScraper('TEST_REF')).rejects.toThrow('Scraper failed for reference TEST_REF');

    // 3. This will now pass because Jest intercepted the internal call
    expect(mockBrowser.close).toHaveBeenCalled();
  });
});