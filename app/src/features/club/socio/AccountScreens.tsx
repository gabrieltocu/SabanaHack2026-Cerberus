// Perfil sub-screens: personal data, drink preferences, assistance needs and membership.
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { Banner, Button, Text, TextField, space } from '../../../design-system';
import type { Perfil } from '../../../club/types';
import type { Seccion } from './nav';
import { ASISTENCIA, BEBIDAS, type Opcion } from './catalogos';
import { describir, type ErrorInfo } from './errors';
import { useCarga, useWhileFocused } from './hooks';
import { BENEFICIO, accionLabel, cuentaActivas, nivelDe, nombreCompleto, tierLabel } from './model';
import { useSocio } from './SocioContext';
import { useFoto } from './useFoto';
import { Avatar } from './ui/Avatar';
import { ChipsField } from './ui/ChipsField';
import { Fila, Grupo } from './ui/Fila';
import { Frame, Subtitulo } from './ui/Frame';
import { Cargando, Fallo } from './ui/States';
import { TarjetaSocio } from './ui/TarjetaSocio';

/** Información personal: read-only. Changes go through reception. */
export function ProfileInfoScreen({ onBack }: { onBack: () => void }) {
  const { client, usuario, perfil } = useSocio();
  const p = perfil.datos;
  const foto = useFoto(
    client,
    p?.foto_estado === 'LISTA' || p?.foto_estado === 'PENDIENTE' ? '/me/foto' : null,
    p?.foto_estado,
  );
  return (
    <Frame title="Mis datos" onBack={onBack}>
      <View style={{ alignItems: 'center', gap: space[3], paddingVertical: space[2] }}>
        <Avatar nombre={usuario.nombre} apellido={usuario.apellido} size={96} uri={foto.uri} />
        <Text variant="h2" level={2}>
          {nombreCompleto(usuario)}
        </Text>
      </View>
      <Grupo>
        <Fila primero titulo="Nombre" detalle={nombreCompleto(usuario)} />
        <Fila titulo="Correo" detalle={usuario.email} />
        <Fila titulo="Trato" detalle={usuario.trato === 'senora' ? 'Señora' : 'Señor'} />
        <Fila titulo="Nivel" detalle={tierLabel(usuario)} />
        {accionLabel(usuario) ? <Fila titulo="Acción" detalle={accionLabel(usuario)} /> : null}
      </Grupo>
      <Text variant="caption" tone="muted">
        Para cambiar estos datos, escríbele al concierge de recepción.
      </Text>
    </Frame>
  );
}

const CHIPS = {
  bebidas: {
    titulo: 'Preferencias',
    label: 'Bebidas que prefieres',
    hint: 'El robot y los edecanes las ofrecen sin preguntarte.',
    opciones: BEBIDAS,
    campo: 'preferencias_bebida',
  },
  asistencia: {
    titulo: 'Asistencia',
    label: 'Qué necesitas',
    hint: 'Solo lo usa el equipo para acompañarte mejor.',
    opciones: ASISTENCIA,
    campo: 'asistencia',
  },
} as const satisfies Record<
  string,
  { titulo: string; label: string; hint: string; opciones: readonly Opcion[]; campo: string }
>;

/** Drinks or assistance: waits for the saved profile, then edits a draft of it. */
export function ProfileChipsScreen({
  tipo,
  onBack,
}: {
  tipo: keyof typeof CHIPS;
  onBack: () => void;
}) {
  const s = useSocio();
  useWhileFocused(s.recargarPerfil);
  if (!s.perfil.datos) {
    return (
      <Frame title={CHIPS[tipo].titulo} onBack={onBack}>
        {s.perfil.error ? (
          <Fallo error={s.perfil.error} onRetry={() => void s.recargarPerfil()} />
        ) : (
          <Cargando filas={2} />
        )}
      </Frame>
    );
  }
  // The draft starts from what is saved, once; later reloads must not overwrite what is typed.
  return <ChipsForm tipo={tipo} guardado={s.perfil.datos} onBack={onBack} />;
}

function ChipsForm({
  tipo,
  guardado,
  onBack,
}: {
  tipo: keyof typeof CHIPS;
  guardado: Perfil;
  onBack: () => void;
}) {
  const s = useSocio();
  const c = CHIPS[tipo];
  const [valores, setValores] = useState<string[]>([...guardado[c.campo]]);
  const [nota, setNota] = useState(guardado.nota_asistencia ?? '');
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);

  const cambio =
    valores.join('\n') !== guardado[c.campo].join('\n') ||
    (tipo === 'asistencia' && nota.trim() !== (guardado.nota_asistencia ?? ''));

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    setAviso(false);
    try {
      const nuevo = await s.guardarPerfil(
        tipo === 'bebidas'
          ? { preferencias_bebida: valores }
          : { asistencia: valores, nota_asistencia: nota.trim() || null },
      );
      setValores([...nuevo[c.campo]]);
      setAviso(true);
    } catch (e) {
      setError(describir(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Frame
      title={c.titulo}
      onBack={onBack}
      footer={
        <Button
          label="Guardar"
          size="lg"
          fullWidth
          loading={guardando}
          disabled={!cambio}
          onPress={() => void guardar()}
        />
      }
    >
      {error ? <Banner kind="error">{error.detalle}</Banner> : null}
      {aviso && !cambio ? (
        <Banner kind="info" title="Guardado">
          Quedó en tu perfil y se usará desde tu próxima visita.
        </Banner>
      ) : null}
      <ChipsField
        label={c.label}
        hint={c.hint}
        opciones={c.opciones}
        value={valores}
        disabled={guardando}
        onChange={(v) => {
          setAviso(false);
          setValores(v);
        }}
      />
      {tipo === 'asistencia' ? (
        <TextField
          label="Nota para el equipo (opcional)"
          value={nota}
          multiline
          maxLength={140}
          editable={!guardando}
          onChangeText={(t) => {
            setAviso(false);
            setNota(t);
          }}
        />
      ) : null}
    </Frame>
  );
}

/** Membresía: the card, the active-guest limit and the benefits the API lists for the level. */
export function MembershipScreen({
  onBack,
  onAbrir,
}: {
  onBack: () => void;
  onAbrir?: (seccion: Seccion) => void;
}) {
  const s = useSocio();
  const { client, usuario, invitaciones } = s;
  useWhileFocused(s.recargarInvitaciones);
  const nivel = nivelDe(usuario);
  const load = useCallback(() => client.membresiaInfo(), [client]);
  const { carga, recargar } = useCarga(load);
  const info =
    carga.estado === 'lista'
      ? carga.datos.niveles.find((n) => n.nivel.toUpperCase() === nivel)
      : undefined;
  const activos = invitaciones.datos ? cuentaActivas(invitaciones.datos) : null;
  return (
    <Frame title="Membresía" onBack={onBack}>
      <TarjetaSocio usuario={usuario} activos={activos} />
      <View style={{ gap: space[2] }}>
        <Subtitulo>Tus beneficios</Subtitulo>
        {carga.estado === 'cargando' ? <Cargando filas={2} label="Cargando beneficios" /> : null}
        {carga.estado === 'error' ? (
          <>
            <Text tone="muted">{BENEFICIO[nivel]}</Text>
            <Fallo error={carga.error} onRetry={() => void recargar()} />
          </>
        ) : null}
        {carga.estado === 'lista' ? (
          <Grupo>
            {(info?.beneficios.length ? info.beneficios : [BENEFICIO[nivel]]).map((b, i) => (
              <Fila key={b} primero={i === 0} icono="checkmark-circle-outline" titulo={b} />
            ))}
          </Grupo>
        ) : null}
      </View>
      {onAbrir ? (
        <Grupo>
          <Fila primero icono="person-outline" titulo="Mis datos" onPress={() => onAbrir('info')} />
        </Grupo>
      ) : null}
    </Frame>
  );
}
