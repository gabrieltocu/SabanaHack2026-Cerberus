// Category of an event or person, mapped onto the design system's chip kinds (the same colours
// as the robot's LED: VIP gold, Regular blue, Invitado green, Personal white, Externo orange,
// Escalamiento soft red).
import { colors, type ChipKind } from '../../design-system/tokens';

export type CategoriaClave =
  'VIP' | 'REGULAR' | 'INVITADO' | 'PERSONAL' | 'EXTERNO' | 'ESCALAMIENTO' | 'OTRA';

export interface Categoria {
  clave: CategoriaClave;
  etiqueta: string;
  /** Kind for `StatusChip`; `neutral` when the robot sent no known category. */
  kind: ChipKind | 'neutral';
  /** Who this is, in plain words ("Socio VIP"). */
  tipoPersona: string;
}

export const CATEGORIAS: Record<CategoriaClave, Categoria> = {
  VIP: { clave: 'VIP', etiqueta: 'VIP', kind: 'VIP', tipoPersona: 'Socio VIP' },
  REGULAR: { clave: 'REGULAR', etiqueta: 'Regular', kind: 'REGULAR', tipoPersona: 'Socio' },
  INVITADO: { clave: 'INVITADO', etiqueta: 'Invitado', kind: 'GUEST', tipoPersona: 'Invitado' },
  PERSONAL: {
    clave: 'PERSONAL',
    etiqueta: 'Personal',
    kind: 'STAFF',
    tipoPersona: 'Personal del club',
  },
  EXTERNO: {
    clave: 'EXTERNO',
    etiqueta: 'Externo',
    kind: 'EXTERNAL',
    tipoPersona: 'Visita externa',
  },
  ESCALAMIENTO: {
    clave: 'ESCALAMIENTO',
    etiqueta: 'Escalamiento',
    kind: 'ESCALATION',
    tipoPersona: 'Requiere a una persona',
  },
  OTRA: {
    clave: 'OTRA',
    etiqueta: 'Sin categoría',
    kind: 'neutral',
    tipoPersona: 'Sin identificar',
  },
};

// The robot and the demo domain name categories in Spanish or English.
const ALIAS: Record<string, CategoriaClave> = {
  VIP: 'VIP',
  REGULAR: 'REGULAR',
  MIEMBRO: 'REGULAR',
  INVITADO: 'INVITADO',
  GUEST: 'INVITADO',
  PERSONAL: 'PERSONAL',
  STAFF: 'PERSONAL',
  EXTERNO: 'EXTERNO',
  EXTERNAL: 'EXTERNO',
  ESCALAMIENTO: 'ESCALAMIENTO',
  ESCALATION: 'ESCALAMIENTO',
};

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').trim().toUpperCase();

/** Category of an event; an escalation event is red whatever the person's category. */
export function categoriaDe(categoria?: string | null, tipo?: string | null): Categoria {
  if (tipo && norm(tipo).startsWith('ESCALA')) return CATEGORIAS.ESCALAMIENTO;
  return CATEGORIAS[(categoria && ALIAS[norm(categoria)]) || 'OTRA'];
}

/** Colours for the initials square: one soft surface for everyone, category is never shown by colour. */
export function coloresAvatar(_categoria?: Categoria): { bg: string; fg: string; border: string } {
  return { bg: colors.surfaceSoft, fg: colors.ink, border: colors.surfaceSoft };
}

/** "Natalia Ríos" -> "NR"; empty -> "". */
export function iniciales(nombre?: string | null): string {
  const p = (nombre ?? '').trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return '';
  return (p[0]![0]! + (p.length > 1 ? p[p.length - 1]![0]! : '')).toUpperCase();
}
