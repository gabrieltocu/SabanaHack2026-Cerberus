import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// The kiosk (/robot) and the attendant panel (/edecan) run on the same API, here inside the
// browser: two pages of one context share the state and tell each other about every write.
// Optional visual evidence: set E2E_SHOTS=<dir> (outside the repository).
const SHOTS = process.env.E2E_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, name), fullPage: true });
};
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const SIZE = { width: 768, height: 1024 } as const;

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

const click = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' }).click();
const heading = (page: Page, name: string | RegExp) => page.getByRole('heading', { name });

/** `/robot` ready to start: the kiosk finished loading. */
async function openKiosk(page: Page) {
  await page.setViewportSize(SIZE);
  await page.goto('/robot');
  await expect(heading(page, 'Bienvenido a N Club')).toBeVisible();
}

async function recognize(page: Page, face: string) {
  await click(page, 'Comenzar');
  await click(page, face);
}

/** Recognise and confirm; leaves the greeting on screen. */
async function arriveAs(page: Page, face: string, who: string) {
  await recognize(page, face);
  await expect(heading(page, `${who}, ¿eres tú?`)).toBeVisible();
  await click(page, 'Confirmar y notificar');
}

test.describe('robot y edecán sobre la API', () => {
  test('(a) VIP por rostro, falla de R2, relevo a Sofía desde otra pestaña, cierre y evaluación', async ({
    page: kiosk,
    context,
  }) => {
    test.setTimeout(120_000);
    const errors = collectErrors(kiosk);
    const edecan = await context.newPage();
    const edecanErrors = collectErrors(edecan);
    await edecan.setViewportSize(SIZE);
    await edecan.goto('/edecan');
    await expect(edecan.getByText('No hay tareas pendientes.')).toBeVisible();

    await openKiosk(kiosk);
    await arriveAs(kiosk, 'Andrés · miembro', 'Andrés');
    await expect(kiosk.getByText(/Andrés, bienvenido\. ¿Te apetece un café/)).toBeVisible();
    await click(kiosk, 'Café');
    await click(kiosk, 'Continuar');
    await click(kiosk, 'Ir a mi reserva del salón');
    await click(kiosk, 'Sí, con R2');
    await expect(kiosk.getByText('Robot R2 · Acompañando')).toBeVisible();
    await expect(kiosk.getByText(/Vamos hacia tu salón, Andrés/)).toBeVisible();
    await shot(kiosk, 'robot-ruta-vip.png');

    // The robot fails; Sofía's other tab shows the task without a reload.
    await click(kiosk, 'Operación');
    await click(kiosk, 'Reportar falla del robot');
    await expect(heading(kiosk, 'Tengo un inconveniente')).toBeVisible();
    await expect(kiosk.getByLabel('Ayuda solicitada, ahora')).toBeVisible();
    await shot(kiosk, 'robot-falla.png');
    await expect(edecan.getByText('Relevo solicitado')).toBeVisible();
    await expect(edecan.getByText('Andrés · Socio VIP')).toBeVisible();
    await expect(edecan.getByText('Motivo: Falla de R2')).toBeVisible();
    await expect(edecan.getByText('1 tarea pendiente')).toBeVisible();
    await expect(edecan.getByText('No tienes una visita en curso.')).toBeVisible();
    await shot(edecan, 'edecan-solicitado.png');

    // Accept, receive the context: the kiosk follows and R2 is still the responsible.
    await click(edecan, 'Aceptar relevo');
    await expect(
      edecan.getByText(/Aceptaste el relevo\. R2 sigue siendo el responsable/),
    ).toBeVisible();
    await expect(
      kiosk.getByText('Soy Sofía, voy a ayudarte. ¿Estás junto al robot?'),
    ).toBeVisible();
    await click(edecan, 'Recibí el contexto');
    await expect(edecan.getByText('Contexto de la visita')).toBeVisible();
    await expect(edecan.getByText('Andrés Mejía · V-201')).toBeVisible();
    await expect(kiosk.getByText('Ya tengo tu destino. Continuaremos desde aquí.')).toBeVisible();
    await expect(edecan.getByText('No tienes una visita en curso.')).toBeVisible();
    await shot(edecan, 'edecan-contexto.png');

    // Confirm: only now does the visit appear under «Visita en curso» with Sofía responsible.
    await click(edecan, 'Confirmar relevo');
    await expect(edecan.getByText('¿Ya estás con Andrés?')).toBeVisible();
    await click(edecan, 'Sí, asumo la visita');
    await expect(edecan.getByText('Eres la responsable de la visita de Andrés.')).toBeVisible();
    await expect(
      edecan.getByText('Eres la responsable de esta visita. R2 queda liberado.'),
    ).toBeVisible();
    await expect(
      kiosk.getByText('Yo sigo contigo; nuestro equipo revisará el robot.'),
    ).toBeVisible();
    await expect(kiosk.getByText('Sofía · Acompañando')).toBeVisible();
    await shot(edecan, 'edecan-confirmado.png');

    // Sofía confirms the arrival; the kiosk shows it.
    await click(edecan, 'Confirmar llegada a Salón reservado');
    await click(edecan, 'Sí, llegamos');
    await expect(edecan.getByText('Llegada a Salón reservado registrada.')).toBeVisible();
    await expect(kiosk.getByText(/Llegamos al salón de tu reserva/)).toBeVisible();
    await click(kiosk, 'Entendido');
    await expect(kiosk.getByText('Visita en curso · Andrés · Salón reservado')).toBeVisible();

    // Assisted exit: the kiosk waits for Sofía to close the visit.
    await click(kiosk, 'Marcar regreso a recepción');
    await expect(
      kiosk.getByText(/Andrés, ya casi terminamos\. Sofía confirmará tu salida\./),
    ).toBeVisible();
    await click(edecan, 'Cerrar visita');
    await expect(edecan.getByText('¿Cerrar la visita de Andrés?')).toBeVisible();
    await edecan.getByRole('button', { name: 'Cerrar visita', exact: true }).last().click();
    await expect(edecan.getByText('Visita cerrada.')).toBeVisible();
    await expect(edecan.getByText('No tienes una visita en curso.')).toBeVisible();

    // Evaluation and goodbye.
    await expect(kiosk.getByText('Servicio de los robots', { exact: true })).toBeVisible();
    await shot(kiosk, 'robot-evaluacion.png');
    await kiosk.getByRole('radio', { name: 'Servicio de los robots: 5 · Muy bueno' }).click();
    await kiosk.getByRole('radio', { name: 'Servicios del club: 4' }).click();
    await click(kiosk, 'Enviar');
    await expect(kiosk.getByText(/Hasta pronto, Andrés/)).toBeVisible();
    await shot(kiosk, 'robot-despedida.png');
    await click(kiosk, 'Listo');
    await expect(heading(kiosk, 'Bienvenido a N Club')).toBeVisible();

    expect(errors).toEqual([]);
    expect(edecanErrors).toEqual([]);
  });

  test('dos edecanes no aceptan el mismo relevo: la segunda recibe HANDOFF_ALREADY_ACCEPTED', async ({
    page: kiosk,
    context,
  }) => {
    test.setTimeout(90_000);
    await openKiosk(kiosk);
    await arriveAs(kiosk, 'Andrés · miembro', 'Andrés');
    await click(kiosk, 'Nada por ahora');
    await click(kiosk, 'Continuar');
    await click(kiosk, 'Ir a mi reserva del salón');
    await click(kiosk, 'Sí, con R2');
    await click(kiosk, 'Operación');
    await click(kiosk, 'Reportar falla del robot');
    await expect(heading(kiosk, 'Tengo un inconveniente')).toBeVisible();

    // Sofía's page does not hear about other tabs' writes, so it still offers the task.
    const sofia = await context.newPage();
    await sofia.addInitScript(() => {
      (window as unknown as { BroadcastChannel?: unknown }).BroadcastChannel = undefined;
    });
    await sofia.setViewportSize(SIZE);
    await sofia.goto('/edecan');
    await expect(sofia.getByText('Relevo solicitado')).toBeVisible();

    const sara = await context.newPage();
    await sara.setViewportSize(SIZE);
    await sara.goto('/edecan?perfil=U-01');
    await expect(sara.getByRole('heading', { name: 'Hola, Sara', level: 1 })).toBeVisible();
    await click(sara, 'Aceptar relevo');
    await expect(sara.getByText(/Aceptaste el relevo/)).toBeVisible();

    await click(sofia, 'Aceptar relevo');
    await expect(sofia.getByText('Otra persona del equipo ya aceptó este relevo.')).toBeVisible();
    await expect(sofia.getByText('Código: HANDOFF_ALREADY_ACCEPTED')).toBeVisible();
    await shot(sofia, 'edecan-ya-aceptado.png');
    await click(sofia, 'Actualizar lista');
    await expect(sofia.getByText('No hay tareas pendientes.')).toBeVisible();
    await expect(kiosk.getByText('Soy Sara, voy a ayudarte. ¿Estás junto al robot?')).toBeVisible();
  });

  test('(b) rostro desconocido, QR válido y continuar como invitada; (c) el mismo pase ya no sirve', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const errors = collectErrors(page);
    await openKiosk(page);
    await recognize(page, 'Rostro desconocido');
    await expect(heading(page, 'No pude confirmar tu identidad')).toBeVisible();
    await shot(page, 'robot-desconocido.png');
    await click(page, 'Usar mi QR');
    await click(page, 'Operación');
    await click(page, 'Usar el pase de Valentina');
    await expect(heading(page, 'Valentina, ¿eres tú?')).toBeVisible();
    await expect(page.getByText('Invitación de Male para hoy')).toBeVisible();
    await shot(page, 'robot-qr-valido.png');
    await click(page, 'Confirmar y notificar');
    await expect(page.getByText(/Hola, Valentina, bienvenida\. Male indicó/)).toBeVisible();

    // (c) The same pass again: spent.
    await click(page, 'Operación');
    await click(page, 'Reiniciar esta visita');
    await click(page, 'Tengo un código QR');
    await click(page, 'Operación');
    await click(page, 'Probar un pase ya usado');
    await expect(
      page.getByText(
        'Este pase ya se usó. Si necesitas entrar de nuevo, recepción puede ayudarte.',
      ),
    ).toBeVisible();
    await expect(page.getByText('Código: QR_ALREADY_USED')).toBeVisible();
    await shot(page, 'robot-qr-usado.png');
    expect(errors).toEqual([]);
  });

  test('(d) la externa V-205 es confirmada un sábado y denegada, con explicación, un martes', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const errors = collectErrors(page);
    await openKiosk(page);
    await recognize(page, 'Laura · no miembro');
    await expect(heading(page, 'Laura, ¿eres tú?')).toBeVisible();
    await expect(page.getByText('Visita de servicio registrada para hoy')).toBeVisible();
    await shot(page, 'robot-externa-sabado.png');

    await openKiosk(page);
    await click(page, 'Comenzar');
    await click(page, 'Martes 27 oct 2026');
    await expect(page.getByText(/Datos reiniciados/)).toBeVisible();
    await recognize(page, 'Laura · no miembro');
    await expect(
      page.getByText('Su permiso de acceso aplica los sábados y hoy es martes.'),
    ).toBeVisible();
    await expect(heading(page, 'No puedo confirmar su visita hoy')).toBeVisible();
    await shot(page, 'robot-externa-martes.png');

    // No dead end: back to the start, and «Reiniciar datos» asks first and restores Saturday.
    await click(page, 'Volver al inicio');
    await click(page, 'Operación');
    await click(page, 'Reiniciar datos');
    await expect(page.getByText('¿Reiniciar los datos?')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Reiniciar', exact: true }).click();
    await expect(page.getByText(/Datos reiniciados/)).toBeVisible();
    await expect(page.getByText('Hoy: Sábado 24 oct 2026')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('(e) un fallo del almacenamiento no rompe la pantalla y se recupera al reintentar', async ({
    page,
  }) => {
    await openKiosk(page);
    await click(page, 'Comenzar');
    await page.evaluate(() => {
      const original = Storage.prototype.getItem;
      (window as unknown as { __getItem: typeof original }).__getItem = original;
      Storage.prototype.getItem = () => {
        throw new Error('almacenamiento no disponible');
      };
    });
    await click(page, 'Rostro desconocido');
    await expect(page.getByText('Código: SERVER_ERROR')).toBeVisible();
    await expect(
      page.getByText('No pudimos completar la acción. No se hizo ningún cambio.'),
    ).toBeVisible();
    await shot(page, 'robot-error.png');
    await page.evaluate(() => {
      Storage.prototype.getItem = (
        window as unknown as { __getItem: Storage['getItem'] }
      ).__getItem;
    });
    await click(page, 'Reintentar');
    await expect(heading(page, 'No pude confirmar tu identidad')).toBeVisible();
    await expect(page.getByText('Código: SERVER_ERROR')).toHaveCount(0);
  });

  test('cinco categorías: saludo y destino distintos', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = collectErrors(page);
    const greetings: string[] = [];
    const destinations: string[] = [];
    const faces = [
      { face: 'Andrés · miembro', dest: 'Salón reservado', slug: 'vip' },
      { face: 'Camila · miembro', dest: 'Cancha de tenis', slug: 'regular' },
      { face: 'Valentina · no miembro', dest: 'Terraza', slug: 'invitada' },
      { face: 'Mario · no miembro', dest: 'Operaciones', slug: 'personal' },
      { face: 'Laura · no miembro', dest: 'Recepción de proveedores', slug: 'externa' },
    ];
    for (const f of faces) {
      await openKiosk(page);
      await arriveAs(page, f.face, f.face.split(' ')[0] as string);
      greetings.push(await page.getByRole('heading', { level: 1 }).last().innerText());
      await shot(page, `robot-saludo-${f.slug}.png`);
      const next = page.getByRole('button', {
        name: /^(Café|Té|Agua aromática|Verlo en mi teléfono|Continuar|Ir a mi reserva del salón|Voy a mi reserva de tenis|Sí, acompáñame|Sí, vamos|Entendido|Sigo por mi cuenta)$/,
      });
      for (let i = 0; i < 5; i++) {
        if (await page.getByText('Destino registrado').isVisible()) break;
        await next.first().click();
      }
      await expect(page.getByText('Destino registrado')).toBeVisible();
      await expect(page.getByText(f.dest, { exact: true }).first()).toBeVisible();
      destinations.push(f.dest);
      await shot(page, `robot-destino-${f.slug}.png`);
    }
    expect(new Set(greetings).size).toBe(5);
    expect(new Set(destinations).size).toBe(5);
    expect(errors).toEqual([]);
  });

  test('el edecán valida un QR desde su panel y la visita queda a su nombre', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize(SIZE);
    await page.goto('/edecan');
    await expect(page.getByText('No hay tareas pendientes.')).toBeVisible();
    await page.getByLabel('Código del pase').fill(['nq', 'y'.repeat(22)].join('_'));
    await click(page, 'Validar QR');
    await expect(page.getByText('No encontramos este pase.')).toBeVisible();
    await shot(page, 'edecan-qr-invalido.png');
    expect(errors).toEqual([]);
  });
});
