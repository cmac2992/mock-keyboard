import { expect, test, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { promises as fs } from 'node:fs';
import { resolve, extname, join } from 'node:path';
import { tmpdir } from 'node:os';

const extensionPath = resolve(process.cwd(), 'dist');
const fixtureDir = resolve(process.cwd(), 'test/fixtures');

let server: Server;
let origin: string;
let context: BrowserContext;
let extensionId: string;
let serviceWorker: Worker;

test.beforeAll(async () => {
  server = createFixtureServer();
  await new Promise<void>((resolveReady) => {
    server.listen(0, '127.0.0.1', () => resolveReady());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Fixture server failed to start.');
  }

  origin = `http://127.0.0.1:${address.port}`;
  context = await chromium.launchPersistentContext(join(tmpdir(), `mock-keyboard-${Date.now()}`), {
    channel: 'chromium',
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  serviceWorker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  extensionId = new URL(serviceWorker.url()).host;
});

test.afterAll(async () => {
  await context?.close();
  await new Promise<void>((resolveReady, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolveReady();
    });
  });
});

test.afterEach(async () => {
  await Promise.all(
    context
      .pages()
      .filter((page) => !page.isClosed())
      .map((page) => page.close())
  );
});

test('enables the simulator and reacts to input focus', async () => {
  const page = await openFixture('basic-form.html');
  const panel = await openPanelFor(page.url());
  const baselineViewportHeight = await page.evaluate(
    () => window.visualViewport?.height ?? window.innerHeight
  );

  await enableSimulator(panel);
  await page.locator('#field-a').focus();

  await expect(page.locator('#__mock-keyboard-host')).toBeVisible();
  await expect.poll(async () => {
    return page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--mock-keyboard-height').trim()
    );
  }).not.toBe('0px');

  const lastEvent = await page.evaluate(() => {
    const events = (window as typeof window & { mockKeyboardEvents: Array<Record<string, unknown>> }).mockKeyboardEvents;
    return {
      count: events.length,
      last: events[events.length - 1]
    };
  });

  expect(lastEvent.count).toBe(1);
  expect(lastEvent.last).toMatchObject({ visible: true, source: 'auto-focus' });
  await expect
    .poll(async () => page.evaluate(() => window.visualViewport?.height ?? window.innerHeight))
    .toBeLessThan(baselineViewportHeight);
  await expect
    .poll(async () =>
      page.evaluate(() =>
        Math.round(
          Math.max(
            0,
            window.innerHeight -
              (window.visualViewport?.height ?? window.innerHeight) -
              (window.visualViewport?.offsetTop ?? 0)
          )
        )
      )
    )
    .toBeGreaterThan(0);
});

test('disables cleanly and can be re-enabled', async () => {
  const page = await openFixture('basic-form.html');
  const panel = await openPanelFor(page.url());

  await enableSimulator(panel);
  await page.locator('#field-a').focus();

  await expect(page.locator('#__mock-keyboard-host')).toBeVisible();
  await panel.getByLabel('Enabled').uncheck();

  await expect(page.locator('#__mock-keyboard-host')).toHaveCount(0);
  await expect
    .poll(async () =>
      page.evaluate(() => document.documentElement.getAttribute('data-mock-keyboard'))
    )
    .toBe('closed');
  await expect
    .poll(async () =>
      page.evaluate(() => document.documentElement.hasAttribute('data-mock-keyboard-bridge'))
    )
    .toBe(false);

  await enableSimulator(panel);
  await page.locator('#field-a').focus();
  await expect(page.locator('#__mock-keyboard-host')).toBeVisible();
});

async function openFixture(fileName: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${origin}/${fileName}`);
  return page;
}

async function openPanelFor(targetUrl: string): Promise<Page> {
  const tabId = await serviceWorker.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({ url });
    return tabs[0]?.id ?? null;
  }, targetUrl);

  if (!tabId) {
    throw new Error(`Unable to resolve tab id for ${targetUrl}`);
  }

  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/src/devtools/panel.html?tabId=${tabId}`);
  return panel;
}

async function enableSimulator(panel: Page): Promise<void> {
  await panel.getByLabel('Enabled').check();
  await expect(panel.locator('#status')).toContainText('Enabled');
  await expect(panel.locator('#visibilityMode')).toBeEnabled();
}

function createFixtureServer(): Server {
  return createServer(async (request, response) => {
    const path = request.url && request.url !== '/' ? request.url : '/basic-form.html';
    const filePath = resolve(fixtureDir, `.${path}`);
    try {
      const file = await fs.readFile(filePath);
      response.statusCode = 200;
      response.setHeader('Content-Type', mimeType(filePath));
      response.end(file);
    } catch {
      response.statusCode = 404;
      response.end('Not found');
    }
  });
}

function mimeType(filePath: string): string {
  switch (extname(filePath)) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    default:
      return 'text/plain; charset=utf-8';
  }
}
