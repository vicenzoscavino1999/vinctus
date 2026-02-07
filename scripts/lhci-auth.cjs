const DEFAULT_EMAIL = process.env.LHCI_AUTH_EMAIL || 'alice@vinctus.local';
const DEFAULT_PASSWORD = process.env.LHCI_AUTH_PASSWORD || 'password123';

const isLoggedIn = async (page) => {
  const selectors = ['button[aria-label*="Crear"]', '[aria-label*="Descub"]', '[aria-label*="Convers"]'];
  for (const selector of selectors) {
    if (await page.$(selector)) {
      return true;
    }
  }
  return false;
};

module.exports = async (browser, context = {}) => {
  const targetUrl = context.url || process.env.LHCI_BASE_URL || 'http://127.0.0.1:4173';
  const parsedUrl = new URL(targetUrl);
  const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
  const page = await browser.newPage();

  try {
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('vinctus_onboarding_complete', 'true');
    });

    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await page
      .waitForFunction(
        () =>
          Boolean(document.querySelector('input[type="email"]')) ||
          Boolean(document.querySelector('button[aria-label*="Crear"]')) ||
          Boolean(document.querySelector('[aria-label*="Descub"]')) ||
          Boolean(document.querySelector('[aria-label*="Convers"]')),
        { timeout: 15000 },
      )
      .catch(() => undefined);

    if (await isLoggedIn(page)) {
      return;
    }

    const emailInput = await page.$('input[type="email"]');
    if (!emailInput) {
      return;
    }

    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.type('input[type="email"]', DEFAULT_EMAIL, { delay: 10 });
    await page.type('input[type="password"]', DEFAULT_PASSWORD, { delay: 10 });

    await page.waitForSelector('form button[type="submit"]', { timeout: 10000 });
    await page.click('form button[type="submit"]');

    await page.waitForFunction(
      () =>
        Boolean(document.querySelector('button[aria-label*="Crear"]')) ||
        Boolean(document.querySelector('[aria-label*="Descub"]')) ||
        !document.querySelector('input[type="email"]'),
      { timeout: 20000 },
    );
  } finally {
    await page.close();
  }
};
