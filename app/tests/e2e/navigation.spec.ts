import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// Captures go outside the repository on purpose.
// Optional visual evidence: set E2E_SHOTS=<dir> to save screenshots of every screen.
const SHOTS = process.env.E2E_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, name), fullPage: true });
};
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const SIZES = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
] as const;

const ROUTES = [
  { name: 'portada', path: '/' },
  { name: 'robot', path: '/robot' },
  { name: 'edecan', path: '/edecan' },
  { name: 'socio-andres', path: '/socio' },
  { name: 'socio-camila', path: '/socio?perfil=V-202' },
  { name: 'socio-invitar', path: '/socio/invitar' },
  { name: 'pase-vigente', path: 'pase' },
  { name: 'pase-cancelado', path: 'pase-cancelado' },
  { name: 'pase-no-valido', path: '/pase/no-existe' },
  { name: 'personal', path: '/personal' },
  { name: 'personal-martes', path: 'martes:/personal' },
  { name: 'actividades', path: '/actividades' },
] as const;

/** Creates a real invitation for Camila through the screens and leaves the browser on its pass. */
async function openOwnPass(page: Page, cancel = false) {
  await page.goto('/socio/invitar?perfil=V-202');
  await page.getByLabel('Nombre de tu invitado').fill('Sebastián Lozano');
  await page.getByRole('button', { name: 'Crear invitación' }).click();
  await page.getByRole('button', { name: 'Ver pase' }).click();
  await expect(page.getByText('Vigente', { exact: true })).toBeVisible();
  if (!cancel) return;
  await page.goto('/socio?perfil=V-202');
  await page.getByRole('button', { name: 'Cancelar invitación de Sebastián Lozano' }).click();
  await page.getByRole('button', { name: 'Cancelar invitación', exact: true }).click();
  await expect(page.getByText('Cancelada', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ver pase de Sebastián Lozano' }).click();
}

/** Opens a route; some need data first (an invitation, or the demo clock on a Tuesday). */
async function open(page: Page, path: string) {
  if (path === 'pase' || path === 'pase-cancelado') return openOwnPass(page, path !== 'pase');
  if (path.startsWith('martes:')) {
    await page.goto('/demo');
    await expect(page.getByRole('link', { name: 'Mario, Personal del club' })).toBeVisible();
    // On phones the controls sit in a closed block.
    const radio = page.getByRole('radio', { name: 'Martes 27 oct 2026' });
    if (!(await radio.isVisible())) {
      await page.getByRole('button', { name: 'Ajustes' }).click();
    }
    await radio.click();
    await expect(page.getByText('Fecha de trabajo: Martes 27 oct 2026.')).toBeVisible();
    return page.goto(path.slice('martes:'.length));
  }
  return page.goto(path);
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

/** Presses Tab until the focused element carries `label` (aria-label or text). */
async function tabTo(page: Page, label: string | RegExp, max = 60) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const current = await page.evaluate(
      () =>
        document.activeElement?.getAttribute('aria-label') ??
        document.activeElement?.textContent ??
        '',
    );
    if (typeof label === 'string' ? current === label : label.test(current)) return;
  }
  throw new Error(`No se llegó con Tab a «${String(label)}»`);
}

test.describe('navegación con teclado desde la portada', () => {
  const roles = [
    { label: 'Sofía, Socio VIP', url: /\/app\/socio$/ },
    { label: 'Camila, Socia regular', url: /\/app\/socio$/ },
    { label: 'Mario, Personal del club', url: /\/app\/personal$/ },
    { label: 'Sofía, Edecán', url: /\/app\/edecan$/ },
    { label: 'Robot R1, Recepción', url: /\/robot$/ },
  ];
  for (const role of roles) {
    test(`Tab y Enter llevan a «${role.label}»`, async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto('/demo');
      await expect(page.getByRole('link', { name: role.label })).toBeVisible();
      await tabTo(page, role.label);
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(role.url);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      expect(errors).toEqual([]);
    });
  }

  test('desde el socio se llega a invitar y a actividades; desde la portada, al pase', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto('/socio');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await tabTo(page, 'Invitar a alguien');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/socio\/invitar/);

    await page.goto('/socio');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await tabTo(page, 'Ver actividades');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/actividades$/);

    await page.goto('/demo');
    await expect(page.getByRole('button', { name: 'Abrir su pase' })).toBeVisible();
    await tabTo(page, 'Abrir su pase');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/pase\/nq_[A-Za-z0-9_-]{22}$/);
    await expect(page.getByText('Vigente', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('pantallas a 375, 768 y 1440', () => {
  for (const size of SIZES) {
    for (const route of ROUTES) {
      test(`${route.name} a ${size.width} px`, async ({ page }) => {
        const errors = collectErrors(page);
        await page.setViewportSize(size);
        await open(page, route.path);
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
        await page.waitForTimeout(400);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
        await shot(page, `${route.name}-${size.width}.png`);
        expect(errors).toEqual([]);
      });
    }
  }
});

test.describe('recorridos', () => {
  test('invitar: errores de validación y pase creado', async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/socio/invitar');
    await page.getByRole('button', { name: 'Crear invitación' }).click();
    await expect(page.getByText('Escribe el nombre de tu invitado.')).toBeVisible();
    await shot(page, `invitar-01-errores.png`);
    await page.getByLabel('Nombre de tu invitado').fill('Valentina');
    await page.getByRole('button', { name: 'Crear invitación' }).click();
    await expect(page.getByText('Invitación creada para Valentina.')).toBeVisible();
    await expect(page.getByRole('img', { name: /Código QR/ })).toBeVisible();
    await shot(page, `invitar-02-creada.png`);
    await page.getByRole('button', { name: 'Ver pase' }).click();
    await expect(page).toHaveURL(/\/pase\/nq_/);
    await expect(page.getByText('Vigente', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
});
