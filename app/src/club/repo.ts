// Persistence helpers for the club API over the shared KeyValueStore (Upstash in production).
// Every write is a compare-and-set; counters retry on conflict.
import { randomBytes } from 'node:crypto';
import { z, type ZodType } from 'zod';

import type { KeyValueStore } from '../infrastructure/stores/types';
import { fail } from './http';
import type { Invitacion, PasoVisita, Perfil, Usuario, Visita } from './types';

export const K = {
  inv: (id: string) => `club:inv:${id}`,
  invIds: 'club:inv-ids',
  seq: 'club:seq',
  version: 'club:version',
  foto: (id: string) => `club:foto:${id}`,
  doc: (id: string) => `club:doc:${id}`,
  mifoto: (usuarioId: string) => `club:mifoto:${usuarioId}`,
  perfil: (usuarioId: string) => `club:perfil:${usuarioId}`,
  // v3: one record per id plus a per-date index of ids (agenda-style lookups with one getMany).
  act: (id: string) => `club:act:${id}`,
  actDia: (fecha: string) => `club:act-dia:${fecha}`,
  ot: (id: string) => `club:ot:${id}`,
  otDia: (fecha: string) => `club:ot-dia:${fecha}`,
  rr: (id: string) => `club:rr:${id}`,
  rrDia: (fecha: string) => `club:rr-dia:${fecha}`,
  agenda: (usuarioId: string) => `club:agenda:${usuarioId}`,
  sol: (id: string) => `club:sol:${id}`,
  solIds: 'club:sol-ids',
  demo: (fecha: string) => `club:demo:${fecha}`,
} as const;

const MAX_RETRIES = 8;

/** Applies `change` to the value at `key` with CAS, retrying on conflicts. */
export async function update<T>(
  store: KeyValueStore,
  key: string,
  change: (current: T | null) => T,
): Promise<T> {
  for (let i = 0; i < MAX_RETRIES; i++) {
    const cur = await store.get<T>(key);
    const next = change(cur?.value ?? null);
    if ((await store.compareAndSet(key, cur?.version ?? 0, next)) !== null) return next;
  }
  throw fail(503, 'almacen_ocupado', 'Hay demasiadas operaciones a la vez. Intenta de nuevo.');
}

export const nextSeq = (store: KeyValueStore) => update<number>(store, K.seq, (n) => (n ?? 0) + 1);

/** `/bot/registros` cache key for the robot: bump on every change that affects the agenda. */
export const bumpVersion = (store: KeyValueStore) =>
  update<number>(store, K.version, (n) => (n ?? 0) + 1);

export async function currentVersion(store: KeyValueStore): Promise<number> {
  return (await store.get<number>(K.version))?.value ?? 0;
}

export async function getInvitacion(store: KeyValueStore, id: string) {
  return (await store.get<Invitacion>(K.inv(id)))?.value ?? null;
}

export async function listInvitaciones(store: KeyValueStore): Promise<Invitacion[]> {
  const ids = (await store.get<string[]>(K.invIds))?.value ?? [];
  const rows = await store.getMany<Invitacion>(ids.map(K.inv));
  return rows.flatMap((r) => (r ? [r.value] : []));
}

/** Creates a new invitation (fails if the id exists) and indexes it. */
export async function insertInvitacion(store: KeyValueStore, inv: Invitacion) {
  if ((await store.compareAndSet(K.inv(inv.id), 0, inv)) === null) {
    throw fail(409, 'invitacion_duplicada', 'La invitación ya existe.');
  }
  await update<string[]>(store, K.invIds, (ids) => [...(ids ?? []), inv.id]);
  await bumpVersion(store);
}

/** Changes an existing invitation with CAS. `change` may throw ClubError to reject. */
export async function updateInvitacion(
  store: KeyValueStore,
  id: string,
  change: (inv: Invitacion) => Invitacion,
): Promise<Invitacion> {
  const next = await update<Invitacion>(store, K.inv(id), (cur) => {
    if (!cur) throw fail(404, 'invitacion_no_encontrada', 'La invitación no existe.');
    return change(cur);
  });
  await bumpVersion(store);
  return next;
}

/** Removes the stored (encrypted) photo of an invitation; a no-op when there is none. */
export const deleteFoto = (store: KeyValueStore, invId: string) => store.delete(K.foto(invId));

/** Removes the stored (encrypted) ID-card photo of an invitation; a no-op when there is none. */
export const deleteDocumento = (store: KeyValueStore, invId: string) => store.delete(K.doc(invId));

/** Removes the socio's own stored (encrypted) profile photo. */
export const deleteMiFoto = (store: KeyValueStore, usuarioId: string) =>
  store.delete(K.mifoto(usuarioId));

export const perfilVacio = (usuarioId: string): Perfil => ({
  usuario_id: usuarioId,
  preferencias_bebida: [],
  asistencia: [],
  nota_asistencia: null,
  foto_estado: 'NINGUNA',
  foto_motivo: null,
});

export async function getPerfil(store: KeyValueStore, usuarioId: string): Promise<Perfil> {
  return (await store.get<Perfil>(K.perfil(usuarioId)))?.value ?? perfilVacio(usuarioId);
}

/** Changes a user's profile with CAS, starting from the empty profile. `change` may throw ClubError. */
export const updatePerfil = (
  store: KeyValueStore,
  usuarioId: string,
  change: (p: Perfil) => Perfil,
) => update<Perfil>(store, K.perfil(usuarioId), (cur) => change(cur ?? perfilVacio(usuarioId)));
/** `prefix` + 8 random hex digits (`act-3f9a1c2b`). */
export const idHex = (prefix: string, bytes = 4) =>
  `${prefix}${randomBytes(bytes).toString('hex')}`;

/** Reads the records listed in an index key, skipping dangling ids. */
export async function leerIndice<T>(
  store: KeyValueStore,
  indice: string,
  clave: (id: string) => string,
): Promise<T[]> {
  const ids = (await store.get<string[]>(indice))?.value ?? [];
  const rows = await store.getMany<T>(ids.map(clave));
  return rows.flatMap((r) => (r ? [r.value] : []));
}

export const agregarAIndice = (store: KeyValueStore, indice: string, id: string) =>
  update<string[]>(store, indice, (ids) => (ids?.includes(id) ? ids : [...(ids ?? []), id]));

export const quitarDeIndice = (store: KeyValueStore, indice: string, id: string) =>
  update<string[]>(store, indice, (ids) => (ids ?? []).filter((x) => x !== id));

/** Creates a record (CAS 0) and lists it in its date index; `false` when the id already exists. */
export async function insertarIndexado<T>(
  store: KeyValueStore,
  clave: string,
  indice: string,
  id: string,
  valor: T,
): Promise<boolean> {
  if ((await store.compareAndSet(clave, 0, valor)) === null) return false;
  await agregarAIndice(store, indice, id);
  return true;
}

// ---------------------------------------------------------------------------------------------
// v3: visits, tasks, incidents and ratings. One document per key plus an index of ids per day
// (and `abiertas` for visits still open), so every listing is two round trips (index, getMany).
// ---------------------------------------------------------------------------------------------
export const KV = {
  vis: (id: string) => `club:vis:${id}`,
  visDia: (fecha: string) => `club:vis:ids:${fecha}`,
  visAbiertas: 'club:vis:abiertas',
  tarea: (id: string) => `club:tarea:${id}`,
  tareaDia: (fecha: string) => `club:tarea:ids:${fecha}`,
  inc: (id: string) => `club:inc:${id}`,
  incDia: (fecha: string) => `club:inc:ids:${fecha}`,
  eva: (id: string) => `club:eva:${id}`,
  evaDia: (fecha: string) => `club:eva:ids:${fecha}`,
  equipo: (usuarioId: string) => `club:equipo:${usuarioId}`,
} as const;

/** Trimmed, non-empty text of at most `max` characters. */
export const texto = (max: number) => z.string().trim().min(1).max(max);

export function parsear<T>(schema: ZodType<T>, data: unknown, code: string, detalle: string): T {
  const r = schema.safeParse(data);
  if (!r.success) throw fail(422, code, detalle);
  return r.data;
}

export const addId = (store: KeyValueStore, key: string, id: string) =>
  update<string[]>(store, key, (ids) => (ids?.includes(id) ? ids : [...(ids ?? []), id]));

export const removeId = (store: KeyValueStore, key: string, id: string) =>
  update<string[]>(store, key, (ids) => (ids ?? []).filter((x) => x !== id));

/** Documents listed by one or more index keys: two `getMany` whatever the size. */
export async function leerIndices<T>(
  store: KeyValueStore,
  indices: string[],
  key: (id: string) => string,
): Promise<T[]> {
  const lists = await store.getMany<string[]>(indices);
  const ids = [...new Set(lists.flatMap((l) => l?.value ?? []))];
  if (!ids.length) return [];
  const rows = await store.getMany<T>(ids.map(key));
  return rows.flatMap((r) => (r ? [r.value] : []));
}

/** Creates a document (fails if the key exists) and adds its id to every index. */
export async function insertarDoc<T>(
  store: KeyValueStore,
  key: string,
  id: string,
  doc: T,
  indices: string[],
) {
  if ((await store.compareAndSet(key, 0, doc)) === null) {
    throw fail(409, 'id_duplicado', 'El registro ya existe.');
  }
  await Promise.all(indices.map((i) => addId(store, i, id)));
}

export async function getVisita(store: KeyValueStore, id: string) {
  return (await store.get<Visita>(KV.vis(id)))?.value ?? null;
}

/** Changes a visit with CAS; `change` may throw ClubError to reject (it can run again on conflict). */
export const updateVisita = (store: KeyValueStore, id: string, change: (v: Visita) => Visita) =>
  update<Visita>(store, KV.vis(id), (cur) => {
    if (!cur) throw fail(404, 'visita_no_encontrada', 'La visita no existe.');
    return change(cur);
  });

export const conPaso = (
  v: Visita,
  ts: string,
  tipo: PasoVisita['tipo'],
  actor: string,
  detalle: string | null = null,
): Visita => ({ ...v, recorrido: [...v.recorrido, { ts, tipo, actor, detalle }] });

/** Who may read a visit: socio (own and their guests), edecán (active ones or ones they touched), staff. */
export function puedeVer(u: Usuario, v: Visita): boolean {
  if (u.rol === 'CONCIERGE' || u.rol === 'ADMIN') return true;
  if (u.rol === 'EDECAN')
    return v.estado !== 'CERRADA' || v.recorrido.some((p) => p.actor === u.id);
  if (u.rol === 'SOCIO') {
    return v.anfitrion_id === u.id || (v.persona_id !== null && v.persona_id === u.persona_id);
  }
  return false;
}
