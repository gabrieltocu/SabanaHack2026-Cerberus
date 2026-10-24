// Harness for the club API unit tests: in-memory store, mutable clock and a `call` helper.
import { createClubApp, type Route } from '@/club/app';
import { clubConfig, type ClubConfig } from '@/club/config';
import { DEMO_CLAVE } from '@/club/seed';
import { createMemoryStore } from '@/infrastructure/stores/memory-store';

/** 2026-10-24 10:00 in Bogotá. */
export const NOW = new Date('2026-10-24T15:00:00Z');
export const BOT_KEY = 'local-CERBERUS_BOT_KEY';

type Init = {
  body?: unknown;
  form?: FormData;
  token?: string;
  bot?: string;
  headers?: Record<string, string>;
};

export function makeClub(routes: Route[], override: Partial<ClubConfig> = {}) {
  let now = NOW;
  const store = createMemoryStore();
  const cfg = { ...clubConfig({}), ...override };
  const app = createClubApp({ store, cfg, clock: () => now, routes });
  const call = async (method: string, path: string, init: Init = {}) => {
    const headers: Record<string, string> = { ...init.headers };
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    if (init.token) headers.authorization = `Bearer ${init.token}`;
    if (init.bot) headers['x-bot-key'] = init.bot;
    const res = await app(
      new Request(`http://x/api${path}`, {
        method,
        headers,
        body: init.form ?? (init.body === undefined ? undefined : JSON.stringify(init.body)),
      }),
      path.split('?')[0]!,
    );
    const isJson = (res.headers.get('content-type') ?? '').includes('json');
    return { status: res.status, res, body: isJson ? await res.json() : null };
  };
  const login = async (email: string) =>
    (await call('POST', '/auth/login', { body: { email, clave: DEMO_CLAVE } })).body
      .token as string;
  return { call, login, store, cfg, setNow: (d: Date) => (now = d) };
}

/** A tiny but valid JPEG (magic bytes FF D8 FF). */
export const jpeg = (size = 64) =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(size, 7)]);

export function fotoForm(bytes: Buffer, consentimiento?: string) {
  const form = new FormData();
  if (consentimiento !== undefined) form.set('consentimiento', consentimiento);
  form.set('foto', new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }), 'foto.jpg');
  return form;
}

export const INVITACION = {
  nombre: 'Laura',
  apellido: 'Diaz',
  trato: 'senora',
  documento: null,
  fecha: '2026-10-24',
  hora_desde: '10:00',
  hora_hasta: '14:00',
  lugar: 'INVITADO',
  nota: 'Almuerzo',
};
