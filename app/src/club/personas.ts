import { z } from 'zod';

import type { Route } from './app';
import { fail, json, readJson } from './http';
import { isoBogota } from './qr';
import { update } from './repo';
import { isSabanaDataSource, usuarios } from './seed';
import type { KeyValueStore } from '../infrastructure/stores/types';

export interface PersonaRobot {
  id: string;
  nombre: string;
  categoria: 'VIP' | 'REGULAR' | 'EXTERNO';
  activo: boolean;
  consentimiento_at?: string;
  origenregistro?: 'robot' | 'catalogo';
}

const KEY = 'club:robot:personas-extra';
const MAX_PERSONAS = 500;
const personaSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z0-9_-]{1,40}$/)
      .refine((id) => !id.startsWith('inv-') && !id.startsWith('personal')),
    nombre: z.string().trim().min(1).max(120),
    categoria: z.enum(['VIP', 'REGULAR']),
    activo: z.boolean().default(true),
    consentimiento: z.boolean().optional(),
  })
  .strict();

export async function listPersonasRobot(store: KeyValueStore): Promise<PersonaRobot[]> {
  const personas = (await store.get<PersonaRobot[]>(KEY))?.value ?? [];
  return personas.filter((persona) => persona.activo);
}

export function personasExternasRobot(): PersonaRobot[] {
  if (!isSabanaDataSource()) return [];
  return [
    { id: 'vale', nombre: 'Vale', categoria: 'EXTERNO', activo: true, origenregistro: 'catalogo' },
  ];
}

export const personasRoutes: Route[] = [
  {
    method: 'POST',
    path: '/bot/personas',
    auth: 'BOT',
    handler: async (ctx) => {
      const parsed = personaSchema.safeParse(await readJson(ctx.req));
      if (!parsed.success) throw fail(422, 'persona_invalida', 'Revisa los datos de la persona.');
      const persona = parsed.data;
      if (
        persona.id === 'vale' ||
        usuarios().some((seed) => seed.id === persona.id || seed.persona_id === persona.id)
      ) {
        throw fail(409, 'persona_id_reservado', 'El id corresponde a una identidad reservada.');
      }
      if (!persona.activo) {
        await update<PersonaRobot[]>(ctx.store, KEY, (items) =>
          (items ?? []).filter((item) => item.id !== persona.id),
        );
        return json(200, { persona: { id: persona.id, activo: false } });
      }
      if (persona.consentimiento !== true)
        throw fail(
          422,
          'consentimiento_requerido',
          'Se requiere consentimiento para registrar la identidad.',
        );
      const current = (await ctx.store.get<PersonaRobot[]>(KEY))?.value ?? [];
      const created = !current.some((item) => item.id === persona.id);
      const stored: PersonaRobot = {
        id: persona.id,
        nombre: persona.nombre,
        categoria: persona.categoria,
        activo: true,
        consentimiento_at: isoBogota(ctx.now),
        origenregistro: 'robot',
      };
      const personas = await update<PersonaRobot[]>(ctx.store, KEY, (items) => {
        const list = items ?? [];
        const index = list.findIndex((item) => item.id === persona.id);
        if (index < 0) {
          if (list.length >= MAX_PERSONAS)
            throw fail(409, 'limite_personas', 'Se alcanzó el límite de identidades adicionales.');
          return [...list, stored];
        }
        return list.map((item, i) => (i === index ? stored : item));
      });
      return json(created ? 201 : 200, {
        persona: personas.find((item) => item.id === persona.id),
      });
    },
  },
  {
    method: 'GET',
    path: '/robot/personas',
    auth: ['CONCIERGE', 'ADMIN'],
    handler: async (ctx) => json(200, { items: await listPersonasRobot(ctx.store) }),
  },
];
