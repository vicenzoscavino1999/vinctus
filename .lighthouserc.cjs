const baseUrl = process.env.LHCI_BASE_URL || 'http://127.0.0.1:4173';
const strictMode = process.env.LHCI_STRICT === 'true';
const throttlingMethod = process.env.LHCI_THROTTLING_METHOD || 'provided';

const withBaseUrl = (path) => new URL(path, `${baseUrl.replace(/\/$/, '')}/`).toString();

module.exports = {
  ci: {
    collect: {
      numberOfRuns: 1,
      chromePath: process.env.LHCI_CHROME_PATH,
      staticDistDir: './dist',
      isSinglePageApplication: true,
      puppeteerLaunchOptions: {
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      },
      puppeteerScript: 'scripts/lhci-auth.cjs',
      url: [withBaseUrl('/discover'), withBaseUrl('/feed'), withBaseUrl('/messages'), withBaseUrl('/group/1')],
      settings: {
        onlyCategories: ['performance'],
        formFactor: 'desktop',
        throttlingMethod,
        screenEmulation: {
          mobile: false,
          width: 1350,
          height: 940,
          deviceScaleFactor: 1,
          disabled: false,
        },
        maxWaitForLoad: 90000,
      },
    },
    assert: {
      assertions: {
        'categories:performance': [strictMode ? 'error' : 'warn', { minScore: 0.9 }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: '.lighthouseci',
      reportFilenamePattern: '%%PATHNAME%%-%%DATETIME%%-report.%%EXTENSION%%',
    },
  },
};
