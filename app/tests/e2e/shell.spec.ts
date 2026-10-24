import { expect, test } from '@playwright/test';

test('la portada carga sin errores de consola y una ruta profunda recarga', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/demo');
  await expect(page.getByRole('heading', { name: '¿Quién eres hoy?' })).toBeVisible();
  await page.goto('/ruta/profunda');
  await expect(page.locator('body')).toBeVisible();
  expect(errors).toEqual([]);
});
