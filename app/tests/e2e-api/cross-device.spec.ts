import { expect, test } from '@playwright/test';
import {
  arriveAs,
  click,
  collectErrors,
  expectKioskReady,
  heading,
  openDevice,
  resetDemo,
} from './helpers';

// Kiosco (/robot) y panel del edecán (/edecan) en dispositivos distintos: dos contextos sin
// almacenamiento compartido. Todo lo que uno ve del otro llega por el servidor (sondeo de 3 s).

test.describe('robot y edecán en dispositivos distintos', () => {
  test.beforeEach(({ request }) => resetDemo(request));

  test('VIP por rostro, falla de R2, el relevo llega a Sofía por el servidor y el kiosco la muestra como responsable', async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    const kiosk = await openDevice(browser, baseURL, '/robot');
    const edecan = await openDevice(browser, baseURL, '/edecan');
    const errors = [collectErrors(kiosk), collectErrors(edecan)];
    expect(kiosk.context()).not.toBe(edecan.context());
    await expectKioskReady(kiosk);
    await expect(edecan.getByText('No hay tareas pendientes.')).toBeVisible();

    await arriveAs(kiosk, 'Andrés · miembro', 'Andrés');
    await click(kiosk, 'Café');
    await click(kiosk, 'Continuar');
    await click(kiosk, 'Ir a mi reserva del salón');
    await click(kiosk, 'Sí, con R2');
    await expect(kiosk.getByText('Robot R2 · Acompañando')).toBeVisible();

    await click(kiosk, 'Operación');
    await click(kiosk, 'Reportar falla del robot');
    await expect(heading(kiosk, 'Tengo un inconveniente')).toBeVisible();

    // Otro dispositivo, sin BroadcastChannel compartido: el relevo aparece por el sondeo.
    await expect(edecan.getByText('Relevo solicitado')).toBeVisible({ timeout: 10_000 });
    await expect(edecan.getByText('Andrés · Socio VIP')).toBeVisible();
    await expect(edecan.getByText('Motivo: Falla de R2')).toBeVisible();

    await click(edecan, 'Aceptar relevo');
    await expect(
      edecan.getByText(/Aceptaste el relevo\. R2 sigue siendo el responsable/),
    ).toBeVisible();
    await expect(kiosk.getByText('Soy Sofía, voy a ayudarte. ¿Estás junto al robot?')).toBeVisible({
      timeout: 10_000,
    });
    await click(edecan, 'Recibí el contexto');
    await expect(edecan.getByText('Andrés Mejía · V-201')).toBeVisible();
    await click(edecan, 'Confirmar relevo');
    await click(edecan, 'Sí, asumo la visita');
    await expect(edecan.getByText('Eres la responsable de la visita de Andrés.')).toBeVisible();

    await expect(kiosk.getByText('Yo sigo contigo; nuestro equipo revisará el robot.')).toBeVisible(
      { timeout: 10_000 },
    );
    await expect(kiosk.getByText('Sofía · Acompañando')).toBeVisible();
    for (const list of errors) expect(list).toEqual([]);
  });

  test('dos edecanes en dispositivos distintos aceptan el mismo relevo: solo una gana y la otra recibe HANDOFF_ALREADY_ACCEPTED', async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    const kiosk = await openDevice(browser, baseURL, '/robot');
    await expectKioskReady(kiosk);
    await arriveAs(kiosk, 'Andrés · miembro', 'Andrés');
    await click(kiosk, 'Nada por ahora');
    await click(kiosk, 'Continuar');
    await click(kiosk, 'Ir a mi reserva del salón');
    await click(kiosk, 'Sí, con R2');
    await click(kiosk, 'Operación');
    await click(kiosk, 'Reportar falla del robot');
    await expect(heading(kiosk, 'Tengo un inconveniente')).toBeVisible();

    const sofia = await openDevice(browser, baseURL, '/edecan');
    await expect(sofia.getByText('Relevo solicitado')).toBeVisible({ timeout: 10_000 });
    // Las lecturas de Sofía quedan en espera (sin responder), así que su lista no se actualiza y
    // sigue ofreciendo la tarea aunque otra persona la tome: el choque real entre dos dispositivos.
    await sofia.route('**/api/v1/handoffs**', (route) =>
      route.request().method() === 'GET' ? undefined : route.continue(),
    );

    const sara = await openDevice(browser, baseURL, '/edecan?perfil=U-01');
    await expect(sara.getByRole('heading', { name: 'Hola, Sara', level: 1 })).toBeVisible();
    await click(sara, 'Aceptar relevo');
    await expect(sara.getByText(/Aceptaste el relevo/)).toBeVisible();

    await click(sofia, 'Aceptar relevo');
    await expect(sofia.getByText('Otra persona del equipo ya aceptó este relevo.')).toBeVisible();
    await expect(sofia.getByText('Código: HANDOFF_ALREADY_ACCEPTED')).toBeVisible();
    await expect(kiosk.getByText('Soy Sara, voy a ayudarte. ¿Estás junto al robot?')).toBeVisible({
      timeout: 10_000,
    });

    // Al actualizar la lista, Sofía ve que ya no hay tareas para ella.
    await sofia.unroute('**/api/v1/handoffs**');
    await click(sofia, 'Actualizar lista');
    await expect(sofia.getByText('No hay tareas pendientes.')).toBeVisible();
  });
});
