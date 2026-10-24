import { expect, test } from '@playwright/test';

test('la app carga bajo la CSP de producción sin violaciones', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && /Content Security Policy|Refused to/i.test(m.text())) {
      violations.push(m.text());
    }
  });
  const res = await page.goto('/design');
  expect(res?.headers()['content-security-policy']).toContain("script-src 'self'");
  expect(res?.headers()['x-frame-options']).toBe('DENY');
  await expect(page.getByRole('heading', { name: /Sistema de diseño/ })).toBeVisible();
  expect(violations).toEqual([]);
});

test('un recurso estático inexistente da 404 y no la SPA', async ({ request }) => {
  expect((await request.get('/_expo/static/js/no-existe.js')).status()).toBe(404);
  expect((await request.get('/socio/invitar')).status()).toBe(200);
});
