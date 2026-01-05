import { Page } from 'playwright';
import { acceptCookies } from '../../src/scrape-logic';

describe('acceptCookies', () => {
  let page: any;
  let mockLocator: any;

  beforeEach(() => {
    // 1. Create a shared mock locator with common Playwright methods
    mockLocator = {
      isVisible: jest.fn(),
      click: jest.fn().mockResolvedValue(undefined),
      first: jest.fn().mockReturnThis(),
      filter: jest.fn().mockReturnThis(),
    };

    // 2. Mock the page object
    page = {
      locator: jest.fn().mockReturnValue(mockLocator),
      waitForSelector: jest.fn().mockResolvedValue(undefined),
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
    } as unknown as Page;
  });

  test('clicks the accept button when visible', async () => {
    // Setup: Element IS visible
    mockLocator.isVisible.mockResolvedValue(true);

    await acceptCookies(page);

    // Verify the correct selector was used
    expect(page.locator).toHaveBeenCalledWith(
      expect.stringContaining('shell-button')
    );
    
    // Check click on the mock instance, NOT by calling page.locator() again
    expect(mockLocator.click).toHaveBeenCalled();
  });

  test('does nothing when the accept button is not visible', async () => {
    // Setup: Element is NOT visible
    mockLocator.isVisible.mockResolvedValue(false);

    await acceptCookies(page);

    // Verify click was never called
    expect(mockLocator.click).not.toHaveBeenCalled();
  });
});