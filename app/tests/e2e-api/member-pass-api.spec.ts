import { expect, test } from '@playwright/test';
import { click, collectErrors, heading, openDevice, resetDemo } from './helpers';

// Tres dispositivos: Camila (socia) crea la invitación, el invitado abre su pase en otro y el
// robot valida el QR en un tercero. Los tres solo comparten el servidor.

test('el pase de una invitación viaja entre dispositivos y pasa a «Usado» cuando el robot lo valida', async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(120_000);
  await resetDemo(request);

  // A: la socia crea la invitación y copia el enlace del pase.
  const camila = await openDevice(browser, baseURL, '/socio/invitar?perfil=V-202', {
    clipboard: true,
  });
  const errors = collectErrors(camila);
  await camila.getByLabel('Nombre de tu invitado').fill('Sebastián Lozano');
  await click(camila, 'Crear invitación');
  await expect(camila.getByText('Invitación creada para Sebastián.')).toBeVisible();
  await click(camila, 'Copiar enlace del pase');
  await expect(camila.getByText('Enlace copiado.')).toBeVisible();
  const link = await camila.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/pase\/nq_[A-Za-z0-9_-]{22}$/);
  const token = link.split('/').pop() as string;

  // B: el invitado, en otro dispositivo, abre el enlace y ve el pase vigente con su QR.
  const guest = await openDevice(browser, baseURL, new URL(link).pathname);
  const guestErrors = collectErrors(guest);
  await expect(guest.getByText('Hola, Sebastián')).toBeVisible();
  await expect(guest.getByText('Vigente', { exact: true })).toBeVisible();
  await expect(guest.getByRole('img', { name: /Código QR de tu pase/ })).toBeVisible();

  // C: el robot valida el QR del pase y el servidor lo concede.
  const robot = await openDevice(browser, baseURL, '/robot');
  await click(robot, 'Comenzar');
  await click(robot, 'Usar mi QR');
  await robot.getByLabel('O escribe el código de tu pase').fill(token);
  const verify = robot.waitForResponse(
    (r) => r.url().endsWith('/api/v1/access/verify') && r.request().method() === 'POST',
  );
  await click(robot, 'Comprobar');
  const verdict = await (await verify).json();
  expect(verdict).toMatchObject({ decision: 'GRANTED' });
  await expect(heading(robot, 'Sebastián, ¿eres tú?')).toBeVisible();

  // B se entera por el sondeo: el pase ya se usó y deja de mostrar el QR.
  await expect(guest.getByText('Usado', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(guest.getByRole('img', { name: /Código QR/ })).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(guestErrors).toEqual([]);
});
