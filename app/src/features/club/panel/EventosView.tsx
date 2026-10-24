import { useCallback, useState } from 'react';
import { View } from 'react-native';

import type { ReservaRobot } from '../../../club/types';
import { Banner, Button, StatusChip, Text, TextField, space } from '../../../design-system';
import { useSession } from '../session';
import { Checkbox } from '../socio/ui/Checkbox';
import { useRecurso } from '../ui/useRecurso';
import { useHoy } from '../ui/visible';
import type { Avisar } from './format';
import { Bloque, Cargable, Panel, Tabla, Vacio, useEscritorio } from './ui';

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const diaTexto = (fecha: string, hoy: string) =>
  fecha === hoy
    ? 'Hoy'
    : new Date(`${fecha}T12:00:00-05:00`).toLocaleDateString('es-CO', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'America/Bogota',
      });

const porHorario = (a: ReservaRobot, b: ReservaRobot) =>
  (a.fecha + a.hora_desde).localeCompare(b.fecha + b.hora_desde);

/** Robot bookings for events and special guests, with the reception-coverage warning. */
export function EventosView({ avisar }: { avisar: Avisar }) {
  const { client } = useSession();
  const escritorio = useEscritorio();
  const hoy = useHoy();
  const [creando, setCreando] = useState(false);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const cargar = useCallback(() => client.reservasRobot(), [client]);
  const recurso = useRecurso(cargar);

  const cancelar = async (r: ReservaRobot) => {
    try {
      await client.cancelarReserva(r.id);
      avisar(`Reserva «${r.evento}» cancelada.`);
      setConfirmar(null);
      void recurso.recargar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo cancelar.', 'error');
    }
  };

  return (
    <View style={{ gap: space[5] }}>
      <Cargable
        recurso={recurso}
        etiqueta="Cargando reservas"
        errorTitulo="No pudimos cargar las reservas"
      >
        {(datos) => {
          const filas = datos.filter((r) => r.fecha >= hoy).sort(porHorario);
          const sinCobertura = filas.filter((r) => !r.cobertura_recepcion).length;
          return (
            <>
              {sinCobertura > 0 ? (
                <Banner kind="warning" title="Recepción sin cobertura">
                  {sinCobertura === 1
                    ? 'Una reserva deja la recepción sin robot ni persona de apoyo en su horario.'
                    : `${sinCobertura} reservas dejan la recepción sin robot ni persona de apoyo en su horario.`}
                </Banner>
              ) : null}
              <Panel
                titulo="Reservas del robot"
                accion={
                  creando ? null : (
                    <Button size="sm" label="Nueva reserva" onPress={() => setCreando(true)} />
                  )
                }
              >
                {creando ? (
                  <Formulario
                    hoy={hoy}
                    onCerrar={() => setCreando(false)}
                    onCreada={(r) => {
                      setCreando(false);
                      avisar(`Reservamos a ${r.robot} para «${r.evento}».`);
                      void recurso.recargar();
                    }}
                  />
                ) : null}
                {filas.length === 0 ? (
                  <Vacio
                    titulo="Sin reservas próximas"
                    detalle="Reserva al robot para un evento o un invitado especial."
                  />
                ) : (
                  <Tabla
                    filas={filas}
                    escritorio={escritorio}
                    id={(r) => r.id}
                    cols={[
                      {
                        t: 'Evento',
                        flex: 3,
                        ver: (r) => (
                          <View>
                            <Text variant="label" numberOfLines={1}>
                              {r.evento}
                            </Text>
                            <Text variant="caption" tone="muted" numberOfLines={1}>
                              {r.lugar}
                            </Text>
                          </View>
                        ),
                      },
                      { t: 'Día', flex: 1.4, ver: (r) => diaTexto(r.fecha, hoy) },
                      { t: 'Horario', flex: 1.6, ver: (r) => `${r.hora_desde} – ${r.hora_hasta}` },
                      { t: 'Robot', flex: 1.2, ver: (r) => r.robot },
                      { t: 'Recepción', flex: 1.8, ver: (r) => <Cobertura r={r} /> },
                      {
                        t: '',
                        flex: 2,
                        ver: (r) => (
                          <Cancelar
                            r={r}
                            confirmar={confirmar}
                            setConfirmar={setConfirmar}
                            onSi={cancelar}
                          />
                        ),
                      },
                    ]}
                    movil={(r) => (
                      <View style={{ flex: 1, gap: space[2] }}>
                        <View>
                          <Text variant="label">{r.evento}</Text>
                          <Text variant="caption" tone="muted">
                            {diaTexto(r.fecha, hoy)} · {r.hora_desde} – {r.hora_hasta} · {r.robot} ·{' '}
                            {r.lugar}
                          </Text>
                        </View>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <Cobertura r={r} />
                          <Cancelar
                            r={r}
                            confirmar={confirmar}
                            setConfirmar={setConfirmar}
                            onSi={cancelar}
                          />
                        </View>
                      </View>
                    )}
                  />
                )}
              </Panel>
            </>
          );
        }}
      </Cargable>
    </View>
  );
}

function Cobertura({ r }: { r: ReservaRobot }) {
  return r.cobertura_recepcion ? (
    <StatusChip kind="success" label="Cubierta" />
  ) : (
    <StatusChip kind="warning" icon="warning-outline" label="Sin cobertura" />
  );
}

function Cancelar({
  r,
  confirmar,
  setConfirmar,
  onSi,
}: {
  r: ReservaRobot;
  confirmar: string | null;
  setConfirmar: (id: string | null) => void;
  onSi: (r: ReservaRobot) => Promise<void>;
}) {
  // Cancelling is not undoable: one extra tap, inline, instead of a modal.
  return confirmar === r.id ? (
    <View style={{ flexDirection: 'row', gap: space[2] }}>
      <Button
        size="sm"
        variant="danger"
        label="Sí, cancelar"
        accessibilityLabel={`Sí, cancelar ${r.evento}`}
        onPress={() => void onSi(r)}
      />
      <Button
        size="sm"
        variant="ghost"
        label="No"
        accessibilityLabel="No cancelar"
        onPress={() => setConfirmar(null)}
      />
    </View>
  ) : (
    <Button
      size="sm"
      variant="ghost"
      label="Cancelar"
      accessibilityLabel={`Cancelar reserva ${r.evento}`}
      onPress={() => setConfirmar(r.id)}
    />
  );
}

type Errores = Partial<Record<'evento' | 'fecha' | 'desde' | 'hasta' | 'lugar', string>>;

function Formulario({
  hoy,
  onCerrar,
  onCreada,
}: {
  hoy: string;
  onCerrar: () => void;
  onCreada: (r: ReservaRobot) => void;
}) {
  const { client } = useSession();
  const robots = useRecurso(
    useCallback(() => client.equipo().then((e) => e.filter((m) => m.tipo === 'ROBOT')), [client]),
  );
  const [evento, setEvento] = useState('');
  const [fecha, setFecha] = useState(hoy);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [lugar, setLugar] = useState('');
  const [robotElegido, setRobotElegido] = useState<string | null>(null);
  const [cobertura, setCobertura] = useState(false);
  const [errores, setErrores] = useState<Errores>({});
  const [falla, setFalla] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const lista = robots.datos ?? [];
  const robot = robotElegido ?? lista[0]?.nombre ?? 'R1';

  const enviar = async () => {
    const e: Errores = {};
    if (!evento.trim()) e.evento = 'Dale un nombre al evento.';
    if (!FECHA.test(fecha) || fecha < hoy)
      e.fecha = 'Usa una fecha de hoy en adelante (AAAA-MM-DD).';
    if (!HORA.test(desde)) e.desde = 'Escribe la hora como HH:MM.';
    if (!HORA.test(hasta)) e.hasta = 'Escribe la hora como HH:MM.';
    else if (HORA.test(desde) && hasta <= desde) e.hasta = 'Debe ser después de la hora de inicio.';
    if (!lugar.trim()) e.lugar = 'Indica dónde será.';
    setErrores(e);
    if (Object.keys(e).length > 0) return;
    setEnviando(true);
    setFalla(null);
    try {
      onCreada(
        await client.reservarRobot({
          evento: evento.trim(),
          fecha,
          hora_desde: desde,
          hora_hasta: hasta,
          robot,
          lugar: lugar.trim(),
          cobertura_recepcion: cobertura,
        }),
      );
    } catch (x) {
      setEnviando(false);
      setFalla(x instanceof Error ? x.message : 'No se pudo reservar.');
    }
  };

  return (
    <Bloque titulo="Nueva reserva">
      <View style={{ gap: space[3], maxWidth: 560 }}>
        <TextField
          label="Evento o invitado especial"
          value={evento}
          onChangeText={setEvento}
          error={errores.evento}
        />
        <TextField label="Lugar" value={lugar} onChangeText={setLugar} error={errores.lugar} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
          <View style={{ flexGrow: 1, flexBasis: 150 }}>
            <TextField
              label="Día"
              value={fecha}
              onChangeText={setFecha}
              hint="AAAA-MM-DD"
              error={errores.fecha}
            />
          </View>
          <View style={{ flexGrow: 1, flexBasis: 100 }}>
            <TextField
              label="Desde"
              value={desde}
              onChangeText={setDesde}
              hint="HH:MM"
              error={errores.desde}
            />
          </View>
          <View style={{ flexGrow: 1, flexBasis: 100 }}>
            <TextField
              label="Hasta"
              value={hasta}
              onChangeText={setHasta}
              hint="HH:MM"
              error={errores.hasta}
            />
          </View>
        </View>
        {lista.length > 1 ? (
          <View role="radiogroup" accessibilityLabel="Robot" style={{ gap: space[2] }}>
            <Text variant="label">Robot</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
              {lista.map((m) => (
                <Button
                  key={m.id}
                  size="sm"
                  variant={robot === m.nombre ? 'primary' : 'secondary'}
                  label={m.nombre}
                  onPress={() => setRobotElegido(m.nombre)}
                />
              ))}
            </View>
          </View>
        ) : null}
        <Checkbox
          label="Otro robot o una persona cubre la recepción mientras tanto"
          checked={cobertura}
          onChange={setCobertura}
        />
        {!cobertura ? (
          <Banner kind="warning" title="La recepción quedará sin cobertura">
            Durante este horario nadie recibirá a los visitantes. Marca la casilla si alguien más lo
            hará.
          </Banner>
        ) : null}
        {falla ? (
          <Text role="alert" tone="danger">
            {falla}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: space[3] }}>
          <Button label="Reservar" loading={enviando} onPress={() => void enviar()} />
          <Button label="Cancelar" variant="ghost" onPress={onCerrar} />
        </View>
      </View>
    </Bloque>
  );
}
