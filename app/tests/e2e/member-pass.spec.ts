import { expect, test, type Page } from '@playwright/test';

// Socio, invitación y pase con datos reales: en el modo local la misma API corre dentro del
// navegador, con el estado en localStorage (cada prueba tiene su propio contexto, vacío).

const PASS_URL = /\/pase\/nq_[A-Za-z0-9_-]{22}$/;

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

async function openInviteForm(page: Page, perfil = 'V-202') {
  await page.goto(`/socio/invitar?perfil=${perfil}`);
  await expect(page.getByLabel('Nombre de tu invitado')).toBeVisible();
}

async function invite(page: Page, name: string) {
  await page.getByLabel('Nombre de tu invitado').fill(name);
  await page.getByRole('button', { name: 'Crear invitación' }).click();
}

test.describe('socio e invitación', () => {
  test('Camila invita a Sebastián, ve el pase, lo ve vigente en su inicio y al cancelarlo el pase lo refleja', async ({
    page,
    context,
  }) => {
    const errors = collectErrors(page);
    await openInviteForm(page);
    await invite(page, 'Sebastián Lozano');
    await expect(page.getByText('Invitación creada para Sebastián.')).toBeVisible();
    await expect(page.getByRole('img', { name: /Código QR/ })).toBeVisible();
    await page.getByRole('button', { name: 'Ver pase' }).click();

    await expect(page).toHaveURL(PASS_URL);
    await expect(page.getByText('Hola, Sebastián')).toBeVisible();
    await expect(page.getByText('Vigente', { exact: true })).toBeVisible();
    await expect(page.getByText('Invitación de Camila')).toBeVisible();
    await expect(page.getByRole('img', { name: /Código QR de tu pase/ })).toBeVisible();
    const passUrl = page.url();

    // El pase se abre en otra pestaña, como lo haría el invitado.
    const guest = await context.newPage();
    await guest.goto(passUrl);
    await expect(guest.getByText('Vigente', { exact: true })).toBeVisible();

    await page.goto('/socio?perfil=V-202');
    await expect(page.getByRole('heading', { name: /Camila/ })).toBeVisible();
    await expect(page.getByText('Sebastián Lozano')).toBeVisible();
    await expect(page.getByText('Vigente', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Cancelar invitación de Sebastián Lozano' }).click();
    await expect(page.getByText('¿Cancelar la invitación de Sebastián Lozano?')).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar invitación', exact: true }).click();
    await expect(page.getByText('Invitación de Sebastián Lozano cancelada.')).toBeVisible();
    await expect(page.getByText('Cancelada', { exact: true })).toBeVisible();

    // La otra pestaña se entera sin recargar (BroadcastChannel) y el pase deja de mostrar el QR.
    await expect(guest.getByText('Cancelado', { exact: true })).toBeVisible();
    await expect(guest.getByText('Tu anfitrión canceló esta invitación.')).toBeVisible();
    await expect(guest.getByRole('img')).toHaveCount(0);

    await page.getByRole('button', { name: 'Ver pase de Sebastián Lozano' }).click();
    await expect(page).toHaveURL(PASS_URL);
    await expect(page.getByText('Cancelado', { exact: true })).toBeVisible();
    await expect(page.getByRole('img')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('un invitado repetido dice INVITATION_DUPLICATE y conserva lo escrito', async ({ page }) => {
    const errors = collectErrors(page);
    await openInviteForm(page);
    await invite(page, 'Sebastián Lozano');
    await expect(page.getByText('Invitación creada para Sebastián.')).toBeVisible();
    await page.getByRole('button', { name: 'Invitar a otra persona' }).click();
    await invite(page, 'sebastián  lozano');
    await expect(
      page.getByText('Ya existe una invitación para este invitado en esa fecha.'),
    ).toBeVisible();
    await expect(page.getByText('Código: INVITATION_DUPLICATE')).toBeVisible();
    await expect(page.getByLabel('Nombre de tu invitado')).toHaveValue('sebastián  lozano');
    expect(errors).toEqual([]);
  });

  test('una fecha pasada se corrige sin crear la invitación', async ({ page }) => {
    const errors = collectErrors(page);
    await openInviteForm(page);
    await page.getByLabel('Fecha de la visita').fill('2026-10-20');
    await invite(page, 'Sebastián Lozano');
    await expect(page.getByText('Elige una fecha desde hoy en adelante.')).toBeVisible();
    await expect(page.getByText('Invitación creada')).toHaveCount(0);
    await page.goto('/socio?perfil=V-202');
    await expect(page.getByText('Aún no has invitado a nadie.')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('el límite diario de cinco invitaciones se explica con el mensaje del contrato', async ({
    page,
  }) => {
    await openInviteForm(page);
    for (const name of ['Ana', 'Beto', 'Carla', 'Diego', 'Elena']) {
      await invite(page, name);
      await expect(page.getByText(`Invitación creada para ${name}.`)).toBeVisible();
      await page.getByRole('button', { name: 'Invitar a otra persona' }).click();
    }
    await invite(page, 'Fabián');
    await expect(page.getByText(/Ya tienes 5 invitaciones para esa fecha/)).toBeVisible();
    await expect(page.getByText('Código: INVITATION_DAILY_LIMIT')).toBeVisible();
  });

  test('el socio ve su destino habitual y las actividades reales del día', async ({ page }) => {
    await page.goto('/socio?perfil=V-201');
    await expect(page.getByRole('heading', { name: /Andrés/ })).toBeVisible();
    await expect(page.getByText('Tu destino habitual: Salón reservado')).toBeVisible();
    await expect(page.getByText('Clase abierta de tenis')).toBeVisible();
    await page.getByRole('button', { name: 'Ver actividades' }).click();
    await expect(page).toHaveURL(/\/actividades$/);
    await expect(page.getByText('Sábado 24 oct 2026')).toBeVisible();
    await expect(page.getByText('Cata de cafés de origen')).toBeVisible();
  });
});

test.describe('pase del invitado', () => {
  test('un pase con el token manipulado o desconocido es «No válido»; el enlace viejo con ?inv= se ignora', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await openInviteForm(page);
    await invite(page, 'Sebastián Lozano');
    await page.getByRole('button', { name: 'Ver pase' }).click();
    await expect(page).toHaveURL(PASS_URL);
    const url = new URL(page.url());
    const token = url.pathname.split('/').pop() as string;
    const flipped = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;

    await page.goto(`/pase/${flipped}`);
    await expect(page.getByText('No válido', { exact: true })).toBeVisible();
    await expect(page.getByText('No encontramos este pase.')).toBeVisible();
    await expect(page.getByText(/Hola,/)).toHaveCount(0);
    await expect(page.getByRole('img')).toHaveCount(0);

    await page.goto('/pase/nq_AAAAAAAAAAAAAAAAAAAAAA');
    await expect(page.getByText('No válido', { exact: true })).toBeVisible();
    await expect(page.getByRole('img')).toHaveCount(0);

    // El token basta: el enlace sin `?inv=` y el viejo, con cualquier `?inv=`, muestran el pase.
    await page.goto(`/pase/${token}`);
    await expect(page.getByText('Hola, Sebastián')).toBeVisible();
    await page.goto(`/pase/${token}?inv=inv-00000000`);
    await expect(page.getByText('Hola, Sebastián')).toBeVisible();
    await expect(page.getByText('Vigente', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('portada con datos reales', () => {
  test('cambiar a martes reinicia los datos, la portada indica la fecha y el personal lo ve', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto('/demo');
    await expect(page.getByRole('link', { name: 'Mario, Personal del club' })).toBeVisible();
    await page.getByRole('button', { name: 'Ajustes' }).click();
    await expect(page.getByText('Fecha de trabajo: Sábado 24 oct 2026')).toBeVisible();
    await expect(page.getByText(/Datos en este navegador/)).toBeVisible();

    await page.getByRole('radio', { name: 'Martes 27 oct 2026' }).click();
    await expect(page.getByText('Fecha de trabajo: Martes 27 oct 2026.')).toBeVisible();
    await expect(
      page.getByText('Fecha de trabajo: Martes 27 oct 2026', { exact: true }),
    ).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: 'Ajustes' }).click();
    await expect(page.getByText('Fecha de trabajo: Martes 27 oct 2026')).toBeVisible();
    await page.getByRole('link', { name: 'Mario, Personal del club' }).click();
    await expect(page).toHaveURL(/\/app\/personal/);
    await page.goto('/personal');
    await expect(page.getByText('No autorizada hoy')).toBeVisible();
    await expect(page.getByText(/Código: EXTERNAL_DAY_NOT_ALLOWED/)).toBeVisible();

    await page.goto('/demo');
    await page.getByRole('button', { name: 'Ajustes' }).click();
    await page.getByRole('button', { name: 'Reiniciar datos' }).click();
    await expect(page.getByText('¿Reiniciar los datos?')).toBeVisible();
    await page.getByRole('button', { name: 'Reiniciar', exact: true }).click();
    await expect(page.getByText('Datos reiniciados.')).toBeVisible();
    await expect(page.getByText('Fecha de trabajo: Sábado 24 oct 2026')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('Mario ve su turno y a Laura autorizada el sábado', async ({ page }) => {
    await page.goto('/personal');
    await expect(page.getByRole('heading', { name: 'Hola, Mario' })).toBeVisible();
    await expect(page.getByText('Operaciones · turno de 8:00 a. m. a 8:00 p. m.')).toBeVisible();
    await expect(page.getByText('Laura · Mantenimientos Andinos')).toBeVisible();
    await expect(page.getByText('Autorizada hoy')).toBeVisible();
  });
});
