import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Smoke de despliegue (`*.vercel.app`): solo lectura salvo el recorrido de SMOKE_WRITE=1.
// Las aserciones de UI usan solo el heading principal.

const API = '/api/v1';
const DEEP_ROUTES = ['/robot', '/edecan', '/socio/invitar', '/design'];
// Socios del directorio; si uno agotó su cupo diario (5 invitaciones por fecha) se usa el siguiente.
const HOSTS = ['V-202', 'V-201', 'V-206', 'V-207', 'V-208', 'V-209'];

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  return errors;
}

test.describe('interfaz', () => {
  test('la portada carga el JS, muestra el heading sin errores', async ({ page }) => {
    const errors = watchErrors(page);
    const res = await page.goto('/demo');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });

  test('la portada indica el modo de datos (API cuando producción lo está) y el almacenamiento', async ({
    page,
    request,
  }) => {
    const errors = watchErrors(page);
    const health = await (await request.get(`${API}/health`)).json();
    await page.goto('/demo');
    await page.getByRole('button', { name: 'Ajustes' }).click();
    const api = page.getByText(/^Modo API · almacenamiento: /);
    const local = page.getByText(/^Datos en este navegador · /);
    await expect(api.or(local)).toBeVisible();
    // Registra el modo en la salida; no falla si el despliegue sigue en modo local.
    const mode = (await api.count()) > 0 ? 'api' : 'local';
    console.log(`portada: modo=${mode} storage=${health.storage}`);
    test.info().annotations.push({ type: 'data-mode', description: mode });
    if (mode === 'api') {
      await expect(page.getByText(`Modo API · almacenamiento: ${health.storage}`)).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  for (const route of DEEP_ROUTES) {
    test(`la ruta profunda ${route} recarga con 200 y renderiza`, async ({ page }) => {
      const errors = watchErrors(page);
      const res = await page.goto(route);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole('heading').first()).toBeVisible();
      await page.reload();
      await expect(page.getByRole('heading').first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(errors).toEqual([]);
    });
  }
});

test.describe('cabeceras y estáticos', () => {
  test('la portada envía las cabeceras de seguridad', async ({ request }) => {
    const h = (await request.get('/')).headers();
    expect(h['content-security-policy']).toContain("script-src 'self'");
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['strict-transport-security']).toMatch(/max-age=\d+/);
  });

  test('un asset inexistente da 404 y no la SPA', async ({ request }) => {
    expect((await request.get('/_expo/static/js/no-existe.js')).status()).toBe(404);
  });

  test('manifest.json responde 200', async ({ request }) => {
    const res = await request.get('/manifest.json');
    expect(res.status()).toBe(200);
    expect(await res.json()).toHaveProperty('name');
  });
});

test.describe('API v1', () => {
  test('health responde con el contrato v1 y registra el almacenamiento', async ({ request }) => {
    const res = await request.get(`${API}/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.contract).toBe('v1');
    console.log(`health: storage=${body.storage} clock=${body.clock?.now}`);
    test.info().annotations.push({ type: 'storage', description: String(body.storage) });
  });

  test('people devuelve al menos 5 personas', async ({ request }) => {
    const res = await request.get(`${API}/people`);
    expect(res.status()).toBe(200);
    expect((await res.json()).items.length).toBeGreaterThanOrEqual(5);
  });

  test('una escritura con text/plain recibe 415', async ({ request }) => {
    const res = await request.post(`${API}/invitations`, {
      headers: { 'Content-Type': 'text/plain', 'Idempotency-Key': `smoke-415-${Date.now()}` },
      data: '{}',
    });
    expect(res.status()).toBe(415);
    expect((await res.json()).error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });
});

async function createInvitation(request: APIRequestContext, date: string, guest: string) {
  const run = Date.now();
  for (const hostId of HOSTS) {
    const res = await request.post(`${API}/invitations`, {
      headers: { 'Idempotency-Key': `smoke-inv-${hostId}-${run}`, 'X-Demo-Actor': hostId },
      data: { hostId, guest: { fullName: guest }, meetingPoint: 'Recepción', date },
    });
    if (res.status() === 409 && (await res.json()).error?.code === 'INVITATION_DAILY_LIMIT') {
      continue;
    }
    return res;
  }
  throw new Error('Todos los socios de prueba agotaron su cupo diario de invitaciones.');
}

test.describe('recorrido de escritura mínima', () => {
  test.skip(process.env.SMOKE_WRITE !== '1', 'Escritura desactivada: define SMOKE_WRITE=1');

  test('invitación → verificación GRANTED → reuso QR_ALREADY_USED', async ({ request }) => {
    // La fecha civil sale del reloj de demostración, que no es la del sistema.
    const health = await (await request.get(`${API}/health`)).json();
    const date = String(health.clock.now).slice(0, 10);
    const guest = `Smoke ${Date.now()}`;

    const created = await createInvitation(request, date, guest);
    expect(created.status(), await created.text()).toBe(201);
    const token = (await created.json()).qr.token as string;

    let n = 0;
    const verify = () =>
      request.post(`${API}/access/verify`, {
        headers: { 'Idempotency-Key': `smoke-verify-${Date.now()}-${n++}` },
        data: { token },
      });
    const first = await verify();
    expect(first.status(), await first.text()).toBe(200);
    expect((await first.json()).decision).toBe('GRANTED');

    const second = await verify();
    expect(second.status()).toBe(200);
    const denied = await second.json();
    expect(denied.decision).toBe('DENIED');
    expect(denied.reason).toBe('QR_ALREADY_USED');
  });
});
