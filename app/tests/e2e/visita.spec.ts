import { expect, test, type Page } from '@playwright/test';

// /visita: la experiencia sin cuenta de invitado y trabajador externo. Los pases de estas
// pruebas llevan una firma de relleno: el navegador solo valida la forma, la firma es del robot.

const FIRMA = 'a1b2c3d4e5f6a7b8c9d0';
const enHoras = (h: number) => Math.floor(Date.now() / 1000) + h * 3600;
const pase = (tipo: string, exp: number, nombre: string) =>
  `NCLUB1|${tipo}|P-9|${nombre}|${exp}|${FIRMA}`;

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

const enlace = (params: Record<string, string>) => `/visita?${new URLSearchParams(params)}`;

test.describe('invitado', () => {
  test('sin pase muestra el saludo, el QR y la hoja «Cómo llegar»', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/visita?tipo=invitado');
    await expect(page.getByRole('heading', { name: /Bienvenida,\s+Laura/ })).toBeVisible();
    await expect(page.getByText(/^Hoy · hasta .* · Sala de anfitriones$/)).toBeVisible();
    await expect(page.getByText('Muéstralo al robot en la entrada')).toBeVisible();
    await expect(page.getByRole('img', { name: /Código QR de tu pase de visita/ })).toBeVisible();

    await page.getByRole('button', { name: 'Cómo llegar' }).click();
    await expect(page.getByRole('dialog', { name: 'Cómo llegar' })).toBeVisible();
    await expect(page.getByText('N Club · Entrada principal')).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('un pase firmado y vigente usa el nombre del pase y los datos del enlace', async ({
    page,
  }) => {
    // Reloj fijo a las 10:00 de Bogotá: el pase vence ese mismo día y «Válido por hoy» no depende
    // de la hora a la que corra la prueba (cerca de medianoche, now + 2 h cae al día siguiente).
    const ahora = Date.parse('2026-10-24T15:00:00Z');
    await page.clock.setFixedTime(ahora);
    await page.goto(
      enlace({
        tipo: 'invitado',
        p: pase('invitado', Math.floor(ahora / 1000) + 2 * 3600, 'Camilo Ortiz'),
        lugar: 'Terraza',
        anfitrion: 'Andrés',
      }),
    );
    await expect(page.getByRole('heading', { name: /Camilo/ })).toBeVisible();
    await expect(page.getByText(/^Hoy · hasta .* · Terraza$/)).toBeVisible();
    await expect(page.getByRole('img', { name: /Código QR/ })).toBeVisible();
  });

  test('un pase vencido no muestra el QR y pide uno nuevo al anfitrión', async ({ page }) => {
    await page.goto(enlace({ tipo: 'invitado', p: pase('invitado', enHoras(-1), 'Camilo Ortiz') }));
    await expect(page.getByText('Pase vencido')).toBeVisible();
    await expect(
      page.getByText(/^Este pase venció a las .*Pide uno nuevo a tu anfitrión\.$/),
    ).toBeVisible();
    await expect(page.getByRole('img')).toHaveCount(0);
  });

  test('un enlace con un pase mal formado o de socio dice que no es válido', async ({ page }) => {
    for (const p of ['NCLUB1|invitado|roto', pase('socio', enHoras(1), 'Ana Ruiz')]) {
      await page.goto(enlace({ tipo: 'invitado', p }));
      await expect(page.getByText('Este enlace no contiene un pase válido.')).toBeVisible();
      await expect(page.getByRole('img')).toHaveCount(0);
    }
  });
});

test.describe('trabajador externo', () => {
  test('sin pase muestra el saludo, el QR y los datos de la orden de servicio', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto('/visita?tipo=externo');
    await expect(page.getByRole('heading', { name: /Bienvenido,\s+Luis/ })).toBeVisible();
    await expect(page.getByRole('img', { name: /Código QR de tu pase de acceso/ })).toBeVisible();
    await expect(page.getByText('OT-1042')).toBeVisible();
    await expect(page.getByText('Climatec')).toBeVisible();
    await expect(page.getByText('Jorge', { exact: true })).toBeVisible();
    await expect(page.getByText('Preséntate en recepción de proveedores')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('un pase fuera de su horario no muestra el QR', async ({ page }) => {
    const dia = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
    // `desde` 23:59 de hoy en Bogotá: salvo en ese minuto, todavía no ha empezado.
    await page.goto(
      enlace({
        p: pase('externo', enHoras(30), 'Luis Peña'),
        fecha: dia,
        desde: '23:59',
        hasta: '23:59',
        orden: 'OT-77',
      }),
    );
    await expect(page.getByText('OT-77')).toBeVisible();
    await expect(page.getByRole('img')).toHaveCount(0);
  });

  test('un pase vencido pide uno nuevo al supervisor', async ({ page }) => {
    await page.goto(enlace({ p: pase('externo', enHoras(-2), 'Luis Peña') }));
    await expect(page.getByText('Pase vencido')).toBeVisible();
    await expect(page.getByText(/Pide uno nuevo a tu supervisor o responsable\.$/)).toBeVisible();
    await expect(page.getByRole('img')).toHaveCount(0);
  });
});

test('a 360 px no hay desborde horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  for (const tipo of ['invitado', 'externo']) {
    await page.goto(`/visita?tipo=${tipo}`);
    await expect(page.getByRole('img', { name: /Código QR/ })).toBeVisible();
    const ancho = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      vista: window.innerWidth,
    }));
    expect(ancho.doc).toBeLessThanOrEqual(ancho.vista);
  }
});
