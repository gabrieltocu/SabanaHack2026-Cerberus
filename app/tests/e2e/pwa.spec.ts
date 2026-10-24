import { expect, test } from '@playwright/test';

test('el manifest declara una app instalable y sus iconos responden como PNG', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe('/manifest.json');

  const res = await request.get('/manifest.json');
  expect(res.status()).toBe(200);
  const manifest = await res.json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/');
  expect(manifest.short_name).toBe('Cerberus');

  const sizes = new Set<string>();
  const purposes = new Set<string>();
  for (const icon of manifest.icons) {
    const png = await request.get(icon.src);
    expect(png.status(), icon.src).toBe(200);
    expect(png.headers()['content-type'], icon.src).toContain('image/png');
    sizes.add(icon.sizes);
    purposes.add(icon.purpose);
  }
  expect([...sizes]).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect([...purposes]).toEqual(expect.arrayContaining(['any', 'maskable']));
});

test('el service worker se registra y nunca atiende ni guarda /api', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  const responsePromise = page.waitForResponse((r) => r.url().endsWith('/api/v1/health'));
  const status = await page.evaluate(() => fetch('/api/v1/health').then((r) => r.status));
  const response = await responsePromise;
  expect(status).toBe(200);
  expect(response.fromServiceWorker()).toBe(false);

  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      for (const req of await (await caches.open(name)).keys()) urls.push(req.url);
    }
    return urls;
  });
  expect(cached.length).toBeGreaterThan(0);
  expect(cached.filter((u) => u.includes('/api/'))).toEqual([]);
});
