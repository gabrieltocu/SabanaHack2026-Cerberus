import { useCallback } from 'react';
import { View } from 'react-native';

import type {
  EstadoInvitacion,
  OrdenServicio,
  RegistrosAdmin,
  SolicitudMembresia,
} from '../../../club/types';
import { StatusChip, Text, space } from '../../../design-system';
import { diaBogota } from '../eventos';
import { useSession } from '../session';
import { useRecurso } from '../ui/useRecurso';
import { usePantallaActiva } from '../ui/visible';
import { ETIQUETA_INTERES, ETIQUETA_ROL, ORDEN_ROLES, SONDEO_MS, type ChipPanel } from './format';
import { BarrasHorizontales } from './Charts';
import { indiceMaximo, maximoEscala } from './escalas';
import { BarraConLeyenda } from './Graficas';
import { partesInvitaciones } from './partes';
import { Bloque, Cargable, Cifra, Quien, Tabla, Vacio, useEscritorio } from './ui';

type Usuario = RegistrosAdmin['usuarios'][number];

const CHIP_SERVICIO: Record<OrdenServicio['estado'], ChipPanel> = {
  PROGRAMADA: { kind: 'info', label: 'Programada' },
  EN_CURSO: { kind: 'success', label: 'En curso' },
  TERMINADA: { kind: 'neutral', label: 'Terminada' },
  CANCELADA: { kind: 'danger', label: 'Cancelada' },
};
const ORDEN_INVITACION: readonly EstadoInvitacion[] = [
  'PROGRAMADA',
  'LLEGO',
  'SALIO',
  'VENCIDA',
  'CANCELADA',
];

/** Users by role, invitations by state, today's service orders, destinations and membership requests. */
export function RegistrosView({ hoy }: { hoy: string }) {
  const { client } = useSession();
  const activa = usePantallaActiva();
  const registros = useRecurso(
    useCallback(() => client.registrosAdmin(), [client]),
    {
      activo: activa,
      cadaMs: SONDEO_MS * 3,
    },
  );
  const solicitudes = useRecurso(
    useCallback(() => client.solicitudesMembresia(), [client]),
    {
      activo: activa,
      cadaMs: SONDEO_MS * 3,
    },
  );
  return (
    <Cargable
      recurso={registros}
      etiqueta="Cargando registros"
      errorTitulo="No pudimos cargar los registros"
      alto={360}
    >
      {(r) => {
        const servicios = r.servicios.filter((s) => s.fecha === hoy);
        const invitaciones = ORDEN_INVITACION.reduce(
          (n, k) => n + (r.invitaciones_por_estado[k] ?? 0),
          0,
        );
        return (
          <View style={{ gap: space[5] }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[4] }}>
              <Cifra
                etiqueta="Usuarios"
                valor={String(r.usuarios.length)}
                nota={`${r.usuarios.filter((u) => u.activo).length} activos`}
              />
              <Cifra
                etiqueta="Invitaciones"
                valor={String(invitaciones)}
                nota="Todas las registradas"
              />
              <Cifra etiqueta="Órdenes de servicio hoy" valor={String(servicios.length)} />
              <Cifra
                etiqueta="Solicitudes de membresía"
                valor={String(solicitudes.datos?.filter((s) => s.estado === 'NUEVA').length ?? 0)}
                nota="Nuevas por contactar"
              />
            </View>
            <Usuarios usuarios={r.usuarios} />
            <Bloque titulo="Invitaciones por estado">
              {invitaciones === 0 ? (
                <Text tone="muted">Aún no hay invitaciones registradas.</Text>
              ) : (
                <BarraConLeyenda
                  partes={partesInvitaciones(r.invitaciones_por_estado)}
                  descripcion={`Invitaciones por estado: ${invitaciones} en total`}
                />
              )}
            </Bloque>
            <Servicios servicios={servicios} />
            <Bloque
              titulo="Destinos autorizados"
              nota="Lugares a los que un invitado puede ser llevado."
            >
              {r.destinos.length === 0 ? (
                <Text tone="muted">No hay destinos configurados.</Text>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
                  {r.destinos.map((d) => (
                    <StatusChip key={d} kind="neutral" label={d} />
                  ))}
                </View>
              )}
            </Bloque>
            <Bloque titulo="Solicitudes de membresía">
              <Cargable
                recurso={solicitudes}
                etiqueta="Cargando solicitudes"
                errorTitulo="No pudimos cargar las solicitudes"
                alto={120}
              >
                {(s) => <Solicitudes items={s} />}
              </Cargable>
            </Bloque>
          </View>
        );
      }}
    </Cargable>
  );
}

function Usuarios({ usuarios }: { usuarios: Usuario[] }) {
  const escritorio = useEscritorio();
  const filas = [...usuarios].sort(
    (a, b) =>
      ORDEN_ROLES.indexOf(a.rol as (typeof ORDEN_ROLES)[number]) -
      ORDEN_ROLES.indexOf(b.rol as (typeof ORDEN_ROLES)[number]),
  );
  const rol = (u: Usuario) => ETIQUETA_ROL[u.rol] ?? u.rol;
  const estado = (u: Usuario) => (
    <StatusChip kind={u.activo ? 'success' : 'neutral'} label={u.activo ? 'Activo' : 'Inactivo'} />
  );
  const resumen = ORDEN_ROLES.map((r) => ({ r, n: usuarios.filter((u) => u.rol === r).length }))
    .filter((x) => x.n > 0)
    .map((x) => `${ETIQUETA_ROL[x.r]} ${x.n}`)
    .join(' · ');
  const porRol = ORDEN_ROLES.map((r) => ({
    id: r,
    etiqueta: ETIQUETA_ROL[r] ?? r,
    valor: usuarios.filter((u) => u.rol === r).length,
  })).filter((x) => x.valor > 0);
  return (
    <Bloque titulo="Usuarios por rol" nota={resumen}>
      <BarrasHorizontales
        filas={porRol}
        max={maximoEscala(Math.max(0, ...porRol.map((x) => x.valor)))}
        destacar={indiceMaximo(porRol.map((x) => x.valor))}
        descripcion={`Usuarios por rol: ${usuarios.length} en total`}
        anchoEtiqueta={120}
      />
      <Tabla
        filas={filas}
        escritorio={escritorio}
        id={(u) => u.id}
        cols={[
          {
            t: 'Nombre',
            flex: 3,
            ver: (u) => (
              <Quien
                nombre={`${u.nombre} ${u.apellido}`}
                sub={u.nivel ? `Socio ${u.nivel === 'VIP' ? 'VIP' : 'regular'}` : null}
              />
            ),
          },
          { t: 'Rol', flex: 2, ver: rol },
          { t: 'Correo', flex: 3, ver: (u) => u.email },
          { t: 'Destino', flex: 2, ver: (u) => u.destino ?? '—' },
          { t: 'Estado', flex: 1.4, ver: estado },
        ]}
        movil={(u) => (
          <>
            <Quien grow nombre={`${u.nombre} ${u.apellido}`} sub={`${rol(u)} · ${u.email}`} />
            {estado(u)}
          </>
        )}
      />
    </Bloque>
  );
}

function Servicios({ servicios }: { servicios: OrdenServicio[] }) {
  const escritorio = useEscritorio();
  const filas = [...servicios].sort((a, b) => a.hora_desde.localeCompare(b.hora_desde));
  return (
    <Bloque
      titulo="Órdenes de servicio de hoy"
      nota="Trabajadores externos con su responsable y punto de presentación."
    >
      {filas.length === 0 ? (
        <Vacio titulo="Sin órdenes para hoy" detalle="Las de otros días no se muestran aquí." />
      ) : (
        <Tabla
          filas={filas}
          escritorio={escritorio}
          id={(s) => s.id}
          cols={[
            {
              t: 'Trabajador',
              flex: 3,
              ver: (s) => <Quien nombre={`${s.nombre} ${s.apellido}`} sub={s.empresa} />,
            },
            { t: 'Trabajo', flex: 3, ver: (s) => `${s.trabajo} · ${s.area}` },
            { t: 'Horario', flex: 1.6, ver: (s) => `${s.hora_desde} – ${s.hora_hasta}` },
            { t: 'Presentarse en', flex: 2, ver: (s) => s.punto_presentacion },
            {
              t: 'Estado',
              flex: 1.4,
              ver: (s) => (
                <StatusChip
                  kind={CHIP_SERVICIO[s.estado].kind}
                  label={CHIP_SERVICIO[s.estado].label}
                />
              ),
            },
          ]}
          movil={(s) => (
            <>
              <Quien
                grow
                nombre={`${s.nombre} ${s.apellido}`}
                sub={`${s.trabajo} · ${s.hora_desde} – ${s.hora_hasta} · ${s.punto_presentacion}`}
              />
              <StatusChip
                kind={CHIP_SERVICIO[s.estado].kind}
                label={CHIP_SERVICIO[s.estado].label}
              />
            </>
          )}
        />
      )}
    </Bloque>
  );
}

function Solicitudes({ items }: { items: SolicitudMembresia[] }) {
  const escritorio = useEscritorio();
  if (items.length === 0)
    return (
      <Vacio titulo="Sin solicitudes" detalle="Las personas que pidan membresía aparecerán aquí." />
    );
  const chip = (s: SolicitudMembresia) => (
    <StatusChip
      kind={s.estado === 'NUEVA' ? 'warning' : 'success'}
      label={s.estado === 'NUEVA' ? 'Nueva' : 'Contactada'}
    />
  );
  return (
    <Tabla
      filas={[...items].sort((a, b) => b.creada_at.localeCompare(a.creada_at))}
      escritorio={escritorio}
      id={(s) => s.id}
      cols={[
        { t: 'Solicitante', flex: 3, ver: (s) => <Quien nombre={s.nombre} sub={s.mensaje} /> },
        { t: 'Contacto', flex: 3, ver: (s) => [s.email, s.telefono].filter(Boolean).join(' · ') },
        { t: 'Interés', flex: 1.4, ver: (s) => ETIQUETA_INTERES[s.interes] },
        { t: 'Fecha', flex: 1.2, ver: (s) => diaBogota(s.creada_at) },
        { t: 'Estado', flex: 1.4, ver: chip },
      ]}
      movil={(s) => (
        <>
          <Quien grow nombre={s.nombre} sub={`${ETIQUETA_INTERES[s.interes]} · ${s.email}`} />
          {chip(s)}
        </>
      )}
    />
  );
}
