// Seguimiento de una visita: quién acompaña ahora, el recorrido, punto de encuentro, ayuda y,
// al salir, la evaluación. Se actualiza cada 5 s mientras la pantalla está enfocada.
import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';

import { Banner, Button, Text, TextField, colors, fonts, space } from '../../../design-system';
import type { Visita } from '../../../club/types';
import { PUNTOS_ENCUENTRO } from './catalogos';
import { horaDe } from './dates';
import { describir, type ErrorInfo } from './errors';
import { useWhileFocused } from './hooks';
import { useSocio } from './SocioContext';
import { activa, esPropia, frasesVisita, motivoRelevo, tipoAcompanante } from './visitas';
import { EvaluationForm } from './ui/EvaluationForm';
import { Fila, Grupo } from './ui/Fila';
import { Frame, Subtitulo } from './ui/Frame';
import { Opciones } from './ui/Opciones';
import { Recorrido } from './ui/Recorrido';
import { Cargando, Fallo } from './ui/States';

export const SEGUIMIENTO_MS = 5000;

const MOTIVOS_AYUDA = [
  'No lo encuentro',
  'Necesita ayuda para moverse',
  'Quiero cambiar de acompañante',
];

export function VisitFollowScreen({ id, onBack }: { id: string; onBack: () => void }) {
  const { client, usuario } = useSocio();
  const [visita, setVisita] = useState<Visita | null>(null);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [cambio, setCambio] = useState<string | null>(null);
  const anterior = useRef<string | null>(null);

  const cargar = useCallback(
    () =>
      client.visita(id).then(
        (v) => {
          const ahora = v.acompanante?.id ?? null;
          if (anterior.current && ahora && ahora !== anterior.current) {
            setCambio(`Ahora lo acompaña ${v.acompanante?.nombre}.`);
          }
          anterior.current = ahora ?? anterior.current;
          setVisita(v);
          setError(null);
        },
        (e: unknown) => setError(describir(e)),
      ),
    [client, id],
  );
  useWhileFocused(cargar, SEGUIMIENTO_MS);

  if (!visita) {
    return (
      <Frame title="Acompañamiento" onBack={onBack}>
        {error ? <Fallo error={error} onRetry={() => void cargar()} /> : <Cargando filas={3} />}
      </Frame>
    );
  }
  return (
    <Seguimiento
      visita={visita}
      propia={esPropia(visita, usuario)}
      cambio={cambio}
      error={error}
      onBack={onBack}
      onVisita={setVisita}
    />
  );
}

function Seguimiento({
  visita: v,
  propia,
  cambio,
  error,
  onBack,
  onVisita,
}: {
  visita: Visita;
  propia: boolean;
  cambio: string | null;
  error: ErrorInfo | null;
  onBack: () => void;
  onVisita: (v: Visita) => void;
}) {
  const s = useSocio();
  const { client, invitaciones } = s;
  // The invitation tells «lo/la» for the sentence; load it if Inicio was not opened first.
  useWhileFocused(() => {
    if (!invitaciones.datos && !invitaciones.cargando) void s.recargarInvitaciones();
  });
  const abierta = activa(v);
  const trato = invitaciones.datos?.find((i) => i.id === v.invitacion_id)?.trato;
  const frase = frasesVisita(v, propia, trato);
  const acompanando =
    v.estado === 'ACOMPANANDO' || v.estado === 'EN_RELEVO' || v.estado === 'EN_RECEPCION';
  const [ayudaAbierta, setAyudaAbierta] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [punto, setPunto] = useState(v.punto_encuentro ?? '');
  const [ubicacion, setUbicacion] = useState(v.ubicacion_anfitrion ?? '');
  const [ocupado, setOcupado] = useState<'ayuda' | 'encuentro' | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [fallo, setFallo] = useState<ErrorInfo | null>(null);
  const [arriba, setArriba] = useState(0);

  const hacer = async (que: 'ayuda' | 'encuentro', fn: () => Promise<string>) => {
    setOcupado(que);
    setFallo(null);
    setAviso(null);
    try {
      setAviso(await fn());
    } catch (e) {
      setFallo(describir(e));
    } finally {
      setOcupado(null);
      setArriba((n) => n + 1);
    }
  };
  const pedirAyuda = () =>
    hacer('ayuda', async () => {
      await client.pedirAyuda(v.id, motivo.trim());
      setAyudaAbierta(false);
      setMotivo('');
      return 'Pedimos ayuda. Un edecán va hacia ustedes.';
    });
  const compartir = () =>
    hacer('encuentro', async () => {
      onVisita(
        await client.compartirEncuentro(v.id, {
          punto_encuentro: punto.trim() || null,
          ubicacion_anfitrion: ubicacion.trim() || null,
        }),
      );
      return 'Compartido. Tu invitado y quien lo acompaña ya lo ven.';
    });

  const sinCambios =
    punto.trim() === (v.punto_encuentro ?? '') &&
    ubicacion.trim() === (v.ubicacion_anfitrion ?? '');
  return (
    <Frame
      title={propia ? 'Mi visita' : v.nombre}
      onBack={onBack}
      scrollTopKey={arriba}
      footer={
        abierta && !ayudaAbierta ? (
          <Button
            label="Pedir ayuda"
            variant="secondary"
            size="lg"
            fullWidth
            onPress={() => {
              setAyudaAbierta(true);
              setArriba((n) => n + 1);
            }}
          />
        ) : null
      }
    >
      {error ? <Banner kind="error">{error.detalle}</Banner> : null}
      {fallo ? <Banner kind="error">{fallo.detalle}</Banner> : null}
      {aviso ? (
        <Banner kind="info" title="Listo">
          {aviso}
        </Banner>
      ) : null}

      <View style={{ gap: space[2] }} role="status" accessibilityLiveRegion="polite">
        <Text style={{ fontFamily: fonts.bodyStrong, fontSize: 20, lineHeight: 28 }}>
          {frase.titulo}
        </Text>
        {v.estado === 'EN_RELEVO' ? null : (
          <Text tone="muted" style={{ fontSize: 16, lineHeight: 24 }}>
            {frase.detalle}
          </Text>
        )}
      </View>

      {v.estado === 'EN_RELEVO' ? (
        <View
          role="alert"
          style={{
            borderWidth: 1,
            borderColor: colors.gold,
            padding: space[4],
            gap: space[1],
          }}
        >
          <Text variant="label">Cambio de acompañante en curso</Text>
          <Text variant="caption">
            {`${(motivoRelevo(v) ?? 'Otra persona del equipo toma el relevo').replace(/[.\s]+$/, '')}. ${propia ? 'No tienes' : 'No tiene'} que hacer nada.`}
          </Text>
        </View>
      ) : cambio && abierta ? (
        <Banner kind="info" title="Cambió el acompañante">
          {cambio}
        </Banner>
      ) : null}

      {ayudaAbierta ? (
        <View style={{ gap: space[3] }}>
          <Subtitulo>¿Qué pasa?</Subtitulo>
          <Opciones
            label="Motivo rápido"
            options={MOTIVOS_AYUDA.map((m) => ({ value: m, label: m }))}
            value={MOTIVOS_AYUDA.includes(motivo) ? motivo : ''}
            disabled={ocupado === 'ayuda'}
            onChange={setMotivo}
          />
          <TextField
            label="Cuéntanos (opcional)"
            value={motivo}
            multiline
            maxLength={140}
            editable={ocupado !== 'ayuda'}
            onChangeText={setMotivo}
          />
          <Button
            label="Enviar aviso"
            size="lg"
            fullWidth
            loading={ocupado === 'ayuda'}
            disabled={!motivo.trim()}
            onPress={() => void pedirAyuda()}
          />
          <Button
            label="Ahora no"
            variant="ghost"
            size="sm"
            disabled={ocupado === 'ayuda'}
            onPress={() => setAyudaAbierta(false)}
          />
        </View>
      ) : null}

      {v.acompanante && acompanando ? (
        <View style={{ gap: space[2] }}>
          <Subtitulo>{propia ? 'Te acompaña' : 'Lo acompaña'}</Subtitulo>
          <Grupo>
            <Fila
              primero
              icono={v.acompanante.tipo === 'ROBOT' ? 'hardware-chip-outline' : 'person-outline'}
              titulo={v.acompanante.nombre}
              detalle={tipoAcompanante(v.acompanante)}
            />
          </Grupo>
        </View>
      ) : null}

      <Grupo>
        <Fila primero icono="location-outline" titulo="Destino" detalle={v.destino} />
        {v.punto_encuentro ? (
          <Fila icono="flag-outline" titulo="Punto de encuentro" detalle={v.punto_encuentro} />
        ) : null}
        {v.ubicacion_anfitrion ? (
          <Fila
            icono="navigate-outline"
            titulo={propia ? 'Ubicación de tu anfitrión' : 'Tu ubicación compartida'}
            detalle={v.ubicacion_anfitrion}
          />
        ) : null}
        <Fila icono="time-outline" titulo="Llegó" detalle={horaDe(v.inicio)} />
      </Grupo>

      <View style={{ gap: space[3] }}>
        <Subtitulo>Recorrido</Subtitulo>
        <Recorrido visita={v} />
      </View>

      {abierta && !propia ? (
        <View style={{ gap: space[3] }}>
          <Subtitulo>Encuentro contigo</Subtitulo>
          <Opciones
            label="Punto de encuentro"
            options={PUNTOS_ENCUENTRO.map((p) => ({ value: p, label: p }))}
            value={punto}
            disabled={ocupado === 'encuentro'}
            onChange={setPunto}
          />
          <TextField
            label="Dónde estás ahora (opcional)"
            hint="Por ejemplo: Terraza, mesa 4"
            value={ubicacion}
            maxLength={60}
            editable={ocupado !== 'encuentro'}
            onChangeText={setUbicacion}
          />
          <Button
            label="Compartir"
            variant="secondary"
            fullWidth
            loading={ocupado === 'encuentro'}
            disabled={sinCambios}
            onPress={() => void compartir()}
          />
        </View>
      ) : null}

      {v.estado === 'CERRADA' ? <EvaluationForm visita={v} /> : null}
    </Frame>
  );
}
