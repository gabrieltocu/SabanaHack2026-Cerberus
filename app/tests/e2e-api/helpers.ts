import { expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';

// Modo API: la interfaz habla HTTP con el servidor local (compartido por todos los contextos).
// Cada `browser.newContext()` es un dispositivo distinto: sin localStorage ni BroadcastChannel
// compartidos, así que solo se enteran de lo que pasa a través del servidor (sondeo cada 3 s).

export const SIZE = { width: 768, height: 1024 } as const;

/** Estado inicial conocido: reinicia los datos del servidor como operador. */
export async function resetDemo(request: APIRequestContext) {
  const res = await request.post('/api/v1/demo/reset', {
    headers: { 'X-Demo-Actor': 'O-01' },
    data: {},
  });
  expect(res.status(), await res.text()).toBe(200);
}

/** Un «dispositivo» nuevo (contexto aislado) con su página abierta en `path`. */
export async function openDevice(
  browser: Browser,
  baseURL: string | undefined,
  path: string,
  options: { clipboard?: boolean } = {},
): Promise<Page> {
  const context = await browser.newContext({
    baseURL,
    viewport: SIZE,
    ...(options.clipboard ? { permissions: ['clipboard-read', 'clipboard-write'] } : {}),
  });
  const page = await context.newPage();
  await page.goto(path);
  return page;
}

export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

export const click = (page: Page, name: string | RegExp) =>
  page.getByRole('button', { name, exact: typeof name === 'string' }).click();
export const heading = (page: Page, name: string | RegExp) => page.getByRole('heading', { name });

/** `/robot` listo para empezar: el quiosco terminó de cargar. */
export async function expectKioskReady(page: Page) {
  await expect(heading(page, 'Bienvenido a N Club')).toBeVisible();
}

/** Reconoce el rostro y confirma «Sí, soy yo»; deja el saludo en pantalla. */
export async function arriveAs(page: Page, face: string, who: string) {
  await click(page, 'Comenzar');
  await click(page, face);
  await expect(heading(page, `${who}, ¿eres tú?`)).toBeVisible();
  await click(page, 'Confirmar y notificar');
}
