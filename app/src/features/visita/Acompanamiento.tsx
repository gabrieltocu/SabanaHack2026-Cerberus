// Pantallas 6 (Mi acompañamiento) y 7 (cambio de acompañante) del invitado con QR firmado.
import { useState } from 'react';
import { View } from 'react-native';
import {
  Button,
  EmptyState,
  Icon,
  Text,
  TextField,
  Touchable,
  colors,
  space,
} from '../../design-system';
import type { PaseVista, Visita } from '../../club/types';
import { ClubApiError } from '../club/client';
import { usePase } from './PaseContext';
import {
  destinoDe,
  estadoAcompanamiento,
  horaDe,
  pasoTexto,
  relevo,
  visitaActiva,
} from './paseVista';
import { Cuerpo, Encabezado, FINA, Nota } from './ui';

const MOTIVOS = ['Me perdí', 'Necesito asistencia', 'El robot no me responde'] as const;

function Acompanante({ v }: { v: Visita }) {
  const a = v.acompanante;
  if (!a) return <Text tone="muted">{estadoAcompanamiento(v)}</Text>;
  const robot = a.tipo === 'ROBOT';
  return (
    <View style={{ gap: space[1] }}>
      <Text variant="caption" tone="muted">
        {robot ? 'Te acompaña el robot' : 'Te acompaña un edecán'}
      </Text>
      <Text variant="display" level={2}>
        {a.nombre}
      </Text>
    </View>
  );
}

/** Pasos del recorrido en orden; el último, el actual, va marcado. */
function Recorrido({ v }: { v: Visita }) {
  return (
    <View>
      {v.recorrido.map((paso, i) => {
        const ultimo = i === v.recorrido.length - 1;
        return (
          <View key={`${paso.ts}-${i}`} style={{ flexDirection: 'row', gap: space[3] }}>
            <View aria-hidden style={{ alignItems: 'center', width: 12 }}>
              <View
                style={{
                  width: 12,
                  height: 12,
                  marginTop: 5,
                  backgroundColor: ultimo ? colors.gold : colors.ivory,
                  borderWidth: 1,
                  borderColor: ultimo ? colors.gold : colors.ink,
                }}
              />
              {ultimo ? null : <View style={{ flex: 1, width: 1, backgroundColor: FINA }} />}
            </View>
            <View style={{ flex: 1, paddingBottom: ultimo ? 0 : space[4] }}>
              <Text variant={ultimo ? 'label' : 'body'} style={{ fontSize: 15, lineHeight: 22 }}>
                {pasoTexto(paso, v.destino)}
              </Text>
              <Text variant="caption" tone="muted">
                {horaDe(paso.ts)}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Pedir ayuda sin salir de la pantalla: motivo rápido, detalle opcional y un solo botón. */
function Ayuda({ qr }: { qr: string }) {
  const { client, recargar } = usePase();
  const [abierta, setAbierta] = useState(false);
  const [motivo, setMotivo] = useState<string>(MOTIVOS[1]);
  const [detalle, setDetalle] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviada, setEnviada] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    setEnviando(true);
    setError(null);
    try {
      await client.pedirAyudaConPase(qr, [motivo, detalle.trim()].filter(Boolean).join(': '));
      setEnviada(true);
      setAbierta(false);
      setDetalle('');
      recargar();
    } catch (e) {
      setError(e instanceof ClubApiError ? e.detalle : 'No pudimos avisar. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  if (!abierta) {
    return (
      <View style={{ gap: space[2] }}>
        {enviada ? (
          <Nota tono="success" titulo="Avisamos al equipo">
            Quédate donde estás: alguien llegará pronto.
          </Nota>
        ) : null}
        <Button
          label="Pedir ayuda"
          size="lg"
          variant={enviada ? 'secondary' : 'primary'}
          fullWidth
          onPress={() => {
            setEnviada(false);
            setAbierta(true);
          }}
        />
      </View>
    );
  }
  return (
    <View style={{ gap: space[3] }}>
      <View role="radiogroup" accessibilityLabel="Qué necesitas">
        {MOTIVOS.map((m) => (
          <Touchable
            key={m}
            role="radio"
            label={m}
            accessibilityState={{ checked: m === motivo }}
            onPress={() => setMotivo(m)}
            style={{
              minHeight: 44,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space[3],
              paddingVertical: space[2],
            }}
          >
            <Icon
              name={m === motivo ? 'radio-button-on-outline' : 'radio-button-off-outline'}
              size={22}
              color={m === motivo ? colors.gold : colors.ink}
            />
            <Text>{m}</Text>
          </Touchable>
        ))}
      </View>
      <TextField
        label="Cuéntanos más (opcional)"
        value={detalle}
        onChangeText={setDetalle}
        maxLength={140}
      />
      {error ? (
        <Text role="alert" tone="danger" variant="caption">
          {error}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: space[3] }}>
        <View style={{ flex: 1 }}>
          <Button
            label="Cancelar"
            variant="secondary"
            fullWidth
            onPress={() => setAbierta(false)}
          />
        </View>
        <View style={{ flex: 2 }}>
          <Button label="Avisar al equipo" fullWidth loading={enviando} onPress={enviar} />
        </View>
      </View>
    </View>
  );
}

export function Acompanamiento({ p, qr }: { p: PaseVista; qr: string }) {
  const activa = visitaActiva(p);
  const v = p.visita;
  if (!v) {
    return (
      <>
        <Encabezado titulo="Mi acompañamiento" />
        <Cuerpo>
          <EmptyState
            title="Aún no estás en el club"
            description="Cuando llegues, el robot te recibe en la entrada y aquí verás quién te acompaña y por dónde van."
          />
        </Cuerpo>
      </>
    );
  }
  const aviso = activa ? relevo(activa) : null;
  const enDestino = v.estado === 'EN_DESTINO';
  return (
    <>
      <Encabezado titulo="Mi acompañamiento" subtitulo={`Destino: ${destinoDe(p)}`} />
      <Cuerpo pie={activa ? <Ayuda qr={qr} /> : undefined}>
        {aviso?.tipo === 'nuevo' ? (
          <Nota
            tono="success"
            titulo={`Ahora te acompaña ${aviso.nombre}`}
            icon="swap-horizontal-outline"
          >
            Siguen hacia tu destino.
          </Nota>
        ) : aviso?.tipo === 'en_camino' ? (
          <Nota tono="warning" titulo="Cambio de acompañante" icon="swap-horizontal-outline">
            Un edecán va a recibirte. Quédate donde estás.
          </Nota>
        ) : aviso?.tipo === 'pendiente' ? (
          <Nota tono="warning" titulo="Cambio de acompañante" icon="swap-horizontal-outline">
            Estamos buscando a quién te reciba. Quédate donde estás.
          </Nota>
        ) : null}
        {enDestino ? (
          <Nota tono="success" titulo={`Llegaste a ${v.destino}`}>
            El acompañamiento terminó. Tu visita sigue hasta que salgas del club.
          </Nota>
        ) : (
          <View style={{ gap: space[3] }}>
            <Acompanante v={v} />
            <Text tone="muted">{estadoAcompanamiento(v)}</Text>
          </View>
        )}
        <Recorrido v={v} />
      </Cuerpo>
    </>
  );
}
