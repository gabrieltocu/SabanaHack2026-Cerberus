import { expect, test } from '@playwright/test';

test('la app abre en Entrar y, desde el acceso rápido, enlaza la elección de perfil de los 5 visitantes', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.getByRole('img', { name: 'N Club' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Elegir perfil' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Acceso rápido' }).click();
  await page.getByRole('button', { name: 'Elegir perfil' }).click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByText('¿Quién eres hoy?')).toBeVisible();
  expect(errors).toEqual([]);
});
