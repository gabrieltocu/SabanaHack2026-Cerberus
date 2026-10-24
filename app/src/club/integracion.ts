// API bridge for the robot's live session and online QR checks.
import { createHash } from 'node:crypto';
import { z } from 'zod';

import { nowS, requireSecret, type Route } from './app';
import { fail, json, readJson } from './http';
import { estadoDe, bogotaHoy, vista } from './invitaciones';
import { leerQr, bogotaExp, isoBogota, qrSocioActual } from './qr';
import { K, listInvitaciones, update } from './repo';
import { isSabanaDataSource, ORDENES, TURNOS, usuarios } from './seed';
import { listServicios, servicioVigente } from './servicios';
import { listPersonasRobot, personasExternasRobot } from './personas';
import type { Categoria, Perfil } from './types';

const categorias = ['VIP', 'REGULAR', 'INVITADO', 'PERSONAL', 'EXTERNO'] as const;
const fases = [
  'esperando',
  'identificando',
  'reintento',
  'qr',
  'confirmacion',
  'orientando',
  'acompanando',
  'destino',
  'recepcion',
  'salida',
] as const;
const sesionSchema = z
  .object({
    robot: z.string().trim().min(1).max(100),
    sesion_id: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[\w.:-]+$/),
    secuencia: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    fase: z.enum(fases),
    persona_id: z.string().trim().min(1).max(120).nullable().optional(),
    nombre: z.string().trim().min(1).max(120).nullable().optional(),
    categoria: z.enum(categorias).nullable().optional(),
    metodo: z.string().trim().min(1).max(40).nullable().optional(),
    confianza: z.number().min(0).max(1).nullable().optional(),
    mensaje: z.string().max(300).nullable().optional(),
  })
  .strict();

type Sesion = z.infer<typeof sesionSchema> & { actualizado_at: string };
const SESION_KEY = 'club:robot:sesion';
const keySesionVista = (id: string) =>
  `club:robot:sesion-vista:${createHash('sha256').update(id).digest('hex')}`;

async function guardarSesion(
  ctx: Parameters<Route['handler']>[0],
  entrada: z.infer<typeof sesionSchema>,
) {
  const actual = (await ctx.store.get<Sesion>(SESION_KEY))?.value ?? null;
  if (actual?.sesion_id === entrada.sesion_id) {
    return update<Sesion>(ctx.store, SESION_KEY, (current) => {
      if (!current || current.sesion_id !== entrada.sesion_id) {
        throw fail(409, 'sesion_reemplazada', 'Llegó una sesión más reciente.');
      }
      if (entrada.secuencia <= current.secuencia) {
        throw fail(409, 'secuencia_repetida', 'La secuencia debe ser mayor a la última recibida.');
      }
      return { ...entrada, actualizado_at: isoBogota(ctx.now) };
    });
  }

  const vistaKey = keySesionVista(entrada.sesion_id);
  if ((await ctx.store.compareAndSet(vistaKey, 0, true)) === null) {
    if ((await ctx.store.get<Sesion>(SESION_KEY))?.value?.sesion_id === entrada.sesion_id) {
      return guardarSesion(ctx, entrada);
    }
    throw fail(409, 'sesion_anterior', 'La sesión ya fue reemplazada.');
  }
  const vigente = await ctx.store.get<Sesion>(SESION_KEY);
  const nueva: Sesion = { ...entrada, actualizado_at: isoBogota(ctx.now) };
  if ((await ctx.store.compareAndSet(SESION_KEY, vigente?.version ?? 0, nueva)) !== null)
    return nueva;

  const concurrente = (await ctx.store.get<Sesion>(SESION_KEY))?.value;
  if (concurrente?.sesion_id === entrada.sesion_id && entrada.secuencia > concurrente.secuencia) {
    return guardarSesion(ctx, entrada);
  }
  throw fail(409, 'sesion_reemplazada', 'Llegó una sesión más reciente.');
}

function mismaPersona(nombre: string, esperado: string) {
  return (
    nombre.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es') ===
    esperado.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es')
  );
}

async function qrVinculado(
  ctx: Parameters<Route['handler']>[0],
  qr: NonNullable<ReturnType<typeof leerQr>['qr']>,
) {
  const hoy = bogotaHoy(ctx.now);
  if (qr.tipo === 'socio') {
    const socio = usuarios().find(
      (u) => u.rol === 'SOCIO' && u.activo && u.persona_id === qr.persona_id,
    );
    const nombre = socio && `${socio.nombre} ${socio.apellido}`.trim();
    if (socio && nombre && mismaPersona(qr.nombre, nombre)) return true;
    const extra = [...personasExternasRobot(), ...(await listPersonasRobot(ctx.store))].find(
      (p) => p.id === qr.persona_id,
    );
    return Boolean(extra && extra.categoria !== 'EXTERNO' && mismaPersona(qr.nombre, extra.nombre));
  }
  if (qr.tipo === 'invitado') {
    const inv = (await listInvitaciones(ctx.store)).find((i) => i.persona_id === qr.persona_id);
    return Boolean(
      inv &&
      inv.fecha === hoy &&
      ['PROGRAMADA', 'LLEGO'].includes(estadoDe(inv, ctx.now)) &&
      ctx.now.getTime() >= bogotaExp(inv.fecha, inv.hora_desde) * 1000 &&
      ctx.now.getTime() <= bogotaExp(inv.fecha, inv.hora_hasta) * 1000 &&
      mismaPersona(qr.nombre, `${inv.nombre} ${inv.apellido}`),
    );
  }
  if (qr.tipo === 'personal') {
    const turno = isSabanaDataSource() ? undefined : TURNOS[qr.persona_id as keyof typeof TURNOS];
    const cuenta = usuarios().find(
      (u) => u.persona_id === qr.persona_id && ['PERSONAL', 'EDECAN'].includes(u.rol) && u.activo,
    );
    const hora = isoBogota(ctx.now).slice(11, 16);
    const minutos = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
    return Boolean(
      turno &&
      cuenta &&
      mismaPersona(qr.nombre, `${turno.nombre} ${turno.apellido}`) &&
      minutos(hora) >= minutos(turno.inicio) - 30 &&
      minutos(hora) <= minutos(turno.fin),
    );
  }
  if (qr.tipo === 'externo') {
    if (
      (await listServicios(ctx.store, hoy)).some(
        (o) =>
          o.persona === qr.persona_id &&
          servicioVigente(o, ctx.now) &&
          mismaPersona(qr.nombre, `${o.nombre} ${o.apellido}`),
      )
    )
      return true;
    if (isSabanaDataSource()) return false;
    const orden = Object.values(ORDENES).find((o) => o.persona === qr.persona_id);
    return Boolean(
      orden &&
      mismaPersona(qr.nombre, `${orden.nombre} ${orden.apellido}`) &&
      qr.exp > Math.floor(ctx.now.getTime() / 1000),
    );
  }
  return false;
}

const qrSchema = z.object({ payload: z.string().min(1).max(1000) }).strict();

export const integracionRoutes: Route[] = [
  {
    method: 'GET',
    path: '/bot/pases',
    auth: 'BOT',
    handler: async (ctx) => {
      const ahora = nowS(ctx);
      const secret = requireSecret(ctx.cfg, 'qrSecret');
      const socios = await Promise.all(
        usuarios()
          .filter((u) => u.rol === 'SOCIO' && u.activo && u.persona_id)
          .map(async (u) => {
            const nombreQr = `${u.nombre} ${u.apellido}`;
            const nombre = nombreQr.trim();
            const qr_payload = await qrSocioActual(
              ctx.store,
              ctx.now,
              secret,
              u.persona_id!,
              nombreQr,
            );
            const vence = leerQr(qr_payload, secret, nowS(ctx)).qr!.exp;
            return {
              tipo: 'socio' as const,
              persona_id: u.persona_id!,
              nombre,
              qr_payload,
              vence_at: isoBogota(new Date(vence * 1000)),
            };
          }),
      );
      const invitados = (await listInvitaciones(ctx.store))
        .filter(
          (inv) =>
            inv.fecha >= bogotaHoy(ctx.now) &&
            ['PROGRAMADA', 'LLEGO'].includes(estadoDe(inv, ctx.now)) &&
            bogotaExp(inv.fecha, inv.hora_hasta) > ahora,
        )
        .map((inv) => {
          const { qr_payload } = vista(inv, ctx);
          return {
            tipo: 'invitado' as const,
            persona_id: inv.persona_id,
            nombre: `${inv.nombre} ${inv.apellido}`.trim(),
            qr_payload,
            vence_at: isoBogota(new Date(bogotaExp(inv.fecha, inv.hora_hasta) * 1000)),
          };
        });
      const extras = await Promise.all(
        [...personasExternasRobot(), ...(await listPersonasRobot(ctx.store))].map(async (p) => {
          const tipo = p.categoria === 'EXTERNO' ? ('externo' as const) : ('socio' as const);
          const orden =
            tipo === 'externo'
              ? (await listServicios(ctx.store, bogotaHoy(ctx.now))).find(
                  (o) => o.persona === p.id && servicioVigente(o, ctx.now),
                )
              : undefined;
          const nombre = orden ? `${orden.nombre} ${orden.apellido}`.trim() : p.nombre;
          const qr_payload = await qrSocioActual(
            ctx.store,
            ctx.now,
            secret,
            p.id,
            nombre,
            false,
            tipo,
          );
          return {
            tipo,
            persona_id: p.id,
            nombre,
            qr_payload,
            vence_at: isoBogota(new Date(leerQr(qr_payload, secret, ahora).qr!.exp * 1000)),
          };
        }),
      );
      return json(200, { items: [...socios, ...extras, ...invitados] });
    },
  },
  {
    method: 'POST',
    path: '/bot/sesion',
    auth: 'BOT',
    handler: async (ctx) => {
      const parsed = sesionSchema.safeParse(await readJson(ctx.req));
      if (!parsed.success)
        throw fail(422, 'sesion_invalida', 'Revisa los datos de la sesión del robot.');
      return json(200, { sesion: await guardarSesion(ctx, parsed.data) });
    },
  },
  {
    method: 'GET',
    path: '/robot/sesion',
    auth: ['CONCIERGE', 'ADMIN'],
    handler: async (ctx) => {
      const sesion = (await ctx.store.get<Sesion>(SESION_KEY))?.value ?? null;
      return json(200, {
        sesion,
        desactualizada: !sesion || ctx.now.getTime() - Date.parse(sesion.actualizado_at) > 15_000,
      });
    },
  },
  {
    method: 'POST',
    path: '/bot/qr/verificar',
    auth: 'BOT',
    handler: async (ctx) => {
      const parsed = qrSchema.safeParse(await readJson(ctx.req));
      if (!parsed.success) throw fail(422, 'qr_invalido', 'El payload del QR no es válido.');
      const result = leerQr(
        parsed.data.payload,
        requireSecret(ctx.cfg, 'qrSecret'),
        Math.floor(ctx.now.getTime() / 1000),
      );
      if (!result.qr) return json(200, { valido: false, motivo: result.motivo });
      if (result.motivo === 'vencido') return json(200, { valido: false, motivo: 'vencido' });
      if (!(await qrVinculado(ctx, result.qr)))
        return json(200, { valido: false, motivo: 'registro_no_vigente' });
      return json(200, {
        valido: true,
        tipo: result.qr.tipo,
        persona_id: result.qr.persona_id,
        nombre: result.qr.nombre,
        categoria:
          result.qr.tipo === 'socio'
            ? (usuarios().find((u) => u.persona_id === result.qr!.persona_id)?.nivel ??
              (await listPersonasRobot(ctx.store)).find((p) => p.id === result.qr!.persona_id)
                ?.categoria ??
              'REGULAR')
            : result.qr.tipo === 'invitado'
              ? 'INVITADO'
              : result.qr.tipo === 'personal'
                ? 'PERSONAL'
                : 'EXTERNO',
      });
    },
  },
  {
    method: 'GET',
    path: '/bot/personas',
    auth: 'BOT',
    handler: async (ctx) => {
      const socios = usuarios().filter((u) => u.rol === 'SOCIO' && u.activo && u.persona_id);
      const perfiles = await ctx.store.getMany<Perfil>(socios.map((u) => K.perfil(u.id)));
      return json(200, {
        items: [
          ...socios.map((u, i) => ({
            id: u.persona_id!,
            nombre: u.nombre,
            categoria: u.nivel as Categoria,
            foto_estado: perfiles[i]?.value.foto_estado ?? 'NINGUNA',
          })),
          ...(await Promise.all(
            [...personasExternasRobot(), ...(await listPersonasRobot(ctx.store))].map(async (p) => {
              const socio = usuarios().find((u) => u.persona_id === p.id);
              const perfilId = socio?.id ?? (p.id === 'vale' ? 'u-vale' : null);
              const perfil = socio
                ? (await ctx.store.get<Perfil>(K.perfil(socio.id)))?.value
                : perfilId
                  ? (await ctx.store.get<Perfil>(K.perfil(perfilId)))?.value
                  : undefined;
              return {
                id: p.id,
                nombre: p.nombre,
                categoria: p.categoria,
                foto_estado: perfil?.foto_estado ?? 'NINGUNA',
                ...(perfil?.consentimiento_foto_at !== undefined
                  ? { consentimiento_at: perfil.consentimiento_foto_at }
                  : {}),
                ...(p.origenregistro === 'robot' ? { origen_registro: 'robot' } : {}),
              };
            }),
          )),
        ],
      });
    },
  },
];
