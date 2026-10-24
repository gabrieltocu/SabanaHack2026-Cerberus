import { expect, test } from '@playwright/test';
import { collectErrors, resetDemo } from './helpers';

test('la portada indica modo API y el almacenamiento en memoria del servidor local', async ({
  page,
  request,
}) => {
  await resetDemo(request);
  const health = await (await request.get('/api/v1/health')).json();
  expect(health).toMatchObject({ contract: 'v1', storage: 'memory' });

  const errors = collectErrors(page);
  await page.goto('/demo');
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await expect(page.getByText('Modo API · almacenamiento: memory')).toBeVisible();
  await expect(page.getByText(/Datos en este navegador/)).toHaveCount(0);
  await expect(page.getByText('Fecha de trabajo: Sábado 24 oct 2026')).toBeVisible();
  expect(errors).toEqual([]);
});
