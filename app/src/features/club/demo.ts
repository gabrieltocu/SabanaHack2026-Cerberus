// Demo accounts of the club seed (src/club/seed.ts). Copied, not imported: the seed pulls
// node:crypto into the bundle. tests/unit/club-ui/demo.test.ts fails if the password drifts.
import type { Nivel } from '../../club/types';

export const DEMO_CLAVE = 'nclub-demo-2026';

export const CUENTAS_DEMO = [
  { email: 'sofia@nclub.demo', quien: 'Sofía · socia VIP' },
  { email: 'andres@nclub.demo', quien: 'Andrés · socio' },
  { email: 'camila@nclub.demo', quien: 'Camila · socia' },
  { email: 'concierge@nclub.demo', quien: 'Natalia · concierge' },
  { email: 'admin@nclub.demo', quien: 'Luciana · administración' },
  { email: 'edecan@nclub.demo', quien: 'Mateo · edecán' },
  { email: 'personal@nclub.demo', quien: 'Marta · personal del club' },
] as const;

/** Who is behind each seeded id, until the API returns host names with the invitations. */
export const PERSONAS_DEMO: Record<string, { nombre: string; nivel: Nivel | null }> = {
  'u-sofia': { nombre: 'Sofía Restrepo', nivel: 'VIP' },
  'u-andres': { nombre: 'Andrés Mejía', nivel: 'REGULAR' },
  'u-camila': { nombre: 'Camila Torres', nivel: 'REGULAR' },
  'u-natalia': { nombre: 'Natalia Ríos', nivel: null },
  'u-luciana': { nombre: 'Luciana Vargas', nivel: null },
  'u-mateo': { nombre: 'Mateo Gil', nivel: null },
  'u-marta': { nombre: 'Marta Ruiz', nivel: null },
};
