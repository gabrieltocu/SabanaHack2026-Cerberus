import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import type { PasoVisita, Visita } from '../../../club/types';
import {
  Banner,
  Button,
  Icon,
  MobileHeader,
  Text,
  TextField,
  Touchable,
  colors,
  space,
} from '../../../design-system';
import { categoriaDe } from '../categorias';
import { useSession } from '../session';
import { describir } from '../socio/errors';
import { horaDe } from '../socio/dates';
import { Frame } from '../socio/ui/Frame';
import { Cargando, Fallo, Vacio } from '../socio/ui/States';
import { useAvisar } from './Guardia';
import { PASO, minutosDesde } from './model';
import { useTareas } from './TareasContext';
import { useEnCurso } from './useEnCurso';
import { AccionTexto, Dato, FotoPersona, Seccion, TenPresente } from './ui';

function Recorrido({ pasos }: { pasos: readonly PasoVisita[] }) {
  return (
    <View accessibilityLabel="Avance del recorrido">
      {pasos.map((p, i) => {
        const ultimo = i === pasos.length - 1;
        return (
          <View key={`${p.ts}-${i}`} style={{ flexDirection: 'row', gap: space[3] }}>
            <View style={{ alignItems: 'center', width: 12 }}>
              <View
                style={{
                  width: ultimo ? 12 : 8,
                  height: ultimo ? 12 : 8,
                  marginTop: 6,
                  backgroundColor: ultimo ? colors.gold : colors.ink,
                }}
              />
              {!ultimo ? (
                <View style={{ flex: 1, width: 1, backgroundColor: colors.borderStrong }} />
              ) : null}
            </View>
            <View style={{ flex: 1, paddingBottom: ultimo ? 0 : space[3] }}>
              <Text variant="label" style={{ fontSize: 15 }}>
                {PASO[p.tipo]}
              </Text>
              <Text variant="caption" tone="muted">
                {[horaDe(p.ts), p.detalle].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Detalle({ visita }: { visita: Visita }) {
  const { client } = useSession();
  const cat = categoriaDe(visita.categoria);
  return (
    <>
      <View
        style={{
          flexDirection: 'row',
          gap: space[4],
          alignItems: 'center',
          padding: space[4],
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        }}
      >
        <FotoPersona
          client={client}
          invitacionId={visita.invitacion_id}
          nombre={visita.nombre}
          categoria={cat}
        />
        <View style={{ flex: 1, gap: space[2] }}>
          <Text variant="h3" level={2} style={{ fontSize: 26, lineHeight: 30 }}>
            {visita.nombre}
          </Text>
          <Text tone="muted" style={{ fontSize: 15 }}>
            Hacia {visita.destino}
          </Text>
        </View>
      </View>

      <TenPresente asistencia={visita.asistencia} bebidas={visita.preferencias_bebida} />

      <Seccion titulo="Encuentro">
        <View style={{ gap: space[3] }}>
          {visita.punto_encuentro ? (
            <Dato
              etiqueta="Punto de encuentro"
              valor={visita.punto_encuentro}
              icon="location-outline"
            />
          ) : null}
          {visita.ubicacion_anfitrion ? (
            <Dato
              etiqueta="El anfitrión está en"
              valor={visita.ubicacion_anfitrion}
              icon="person-outline"
            />
          ) : null}
          <Dato etiqueta="Destino" valor={visita.destino} icon="flag-outline" />
          {visita.permisos.length ? (
            <Dato etiqueta="Permisos" valor={visita.permisos.join(', ')} icon="key-outline" />
          ) : null}
        </View>
      </Seccion>

      <Seccion titulo="Recorrido">
        {visita.recorrido.length ? (
          <Recorrido pasos={visita.recorrido} />
        ) : (
          <Text tone="muted">Aún no hay pasos registrados.</Text>
        )}
      </Seccion>
    </>
  );
}

type Modo = 'relevo' | 'ayuda' | null;

/** Visit in progress: who they are, what to keep in mind, and how to close or hand it over. */
export function EnCursoScreen() {
  const router = useRouter();
  const { visita: param } = useLocalSearchParams<{ visita?: string }>();
  const { client } = useSession();
  const { error: errorTareas, recargar: recargarTareas } = useTareas();
  const avisar = useAvisar();
  // A chip chosen by hand only holds while no newer visit arrives through `?visita=`.
  const [elegida, setElegida] = useState<{ id: string; param?: string } | null>(null);
  const [modo, setModo] = useState<Modo>(null);
  const [motivo, setMotivo] = useState('');
  const [falta, setFalta] = useState<string>();
  const [ocupado, setOcupado] = useState(false);
  const [cierre, setCierre] = useState<{ nombre: string; destino: string; min: number } | null>(
    null,
  );

  const { datos, error, cargando, recargar } = useEnCurso(param);

  const items = datos ?? [];
  const id = elegida?.param === param ? elegida?.id : param;
  const actual = items.find((i) => i.visita.id === id) ?? items[0];

  const correr = async (accion: () => Promise<unknown>, ok: string, despues?: () => void) => {
    setOcupado(true);
    try {
      await accion();
      avisar(ok, 'success');
      despues?.();
      await Promise.all([recargar(), recargarTareas()]);
    } catch (e) {
      avisar(describir(e).detalle, 'error');
    } finally {
      setOcupado(false);
    }
  };

  const cerrarModo = () => {
    setModo(null);
    setMotivo('');
    setFalta(undefined);
  };

  const enviarPedido = (v: Visita) => {
    if (motivo.trim().length < 3) return setFalta('Cuéntanos el motivo.');
    const m = motivo.trim();
    void correr(
      () => (modo === 'relevo' ? client.pedirRelevo(v.id, m) : client.pedirAyuda(v.id, m)),
      modo === 'relevo'
        ? 'Relevo solicitado. Sigue con la visita hasta que alguien la reciba.'
        : 'Ayuda solicitada',
      cerrarModo,
    );
  };

  const header = <MobileHeader title="En curso" />;

  if (cierre)
    return (
      <Frame
        header={<MobileHeader title="Listo" />}
        footer={
          <Button
            label="Ver tareas"
            size="lg"
            fullWidth
            onPress={() => {
              setCierre(null);
              router.navigate('/app/edecan');
            }}
          />
        }
      >
        <View style={{ gap: space[4], paddingTop: space[5] }}>
          <Icon name="checkmark-circle-outline" size={56} color={colors.gold} />
          <Text variant="h2" level={2}>
            Llegaron a {cierre.destino}
          </Text>
          <Text tone="muted">
            Cerraste el acompañamiento de {cierre.nombre}
            {cierre.min > 0 ? ` después de ${cierre.min} min` : ''}. La visita sigue abierta hasta
            que salga del club.
          </Text>
        </View>
      </Frame>
    );

  if (!datos) {
    const fallo = error ?? errorTareas;
    return (
      <Frame header={header}>
        {fallo ? (
          <Fallo error={describir(fallo)} onRetry={() => void recargar()} retrying={cargando} />
        ) : (
          <Cargando filas={2} label="Cargando visita" />
        )}
      </Frame>
    );
  }

  if (!actual)
    return (
      <Frame header={header}>
        <Vacio
          icon="walk-outline"
          texto="No acompañas a nadie ahora. Acepta una tarea o escanea el pase de quien llega."
          accion="Ver tareas"
          onAccion={() => router.navigate('/app/edecan')}
        />
      </Frame>
    );

  const { visita, tarea } = actual;
  const recibir = tarea?.tipo === 'RELEVO' && visita.estado === 'EN_RELEVO';
  const esperandoRelevo = visita.estado === 'EN_RELEVO' && !recibir;
  const apoyo = tarea?.tipo === 'AYUDA';

  const footer = modo ? (
    <View style={{ gap: space[2], paddingBottom: space[2] }}>
      <TextField
        label={modo === 'relevo' ? 'Motivo del relevo' : '¿En qué necesitas ayuda?'}
        value={motivo}
        onChangeText={(v) => {
          setMotivo(v);
          setFalta(undefined);
        }}
        error={falta}
        multiline
      />
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        <Button
          label={modo === 'relevo' ? 'Pedir relevo' : 'Pedir ayuda'}
          loading={ocupado}
          onPress={() => enviarPedido(visita)}
        />
        <Button label="Cancelar" variant="ghost" onPress={cerrarModo} />
      </View>
    </View>
  ) : recibir ? (
    <Button
      label={`Confirmar que recibí a ${visita.nombre}`}
      size="lg"
      fullWidth
      loading={ocupado}
      onPress={() =>
        void correr(() => client.recibirVisita(visita.id), `Recibiste a ${visita.nombre}`)
      }
    />
  ) : apoyo ? null : (
    <>
      {esperandoRelevo ? (
        <Text tone="muted" style={{ fontSize: 14 }}>
          Esperando a quien reciba a {visita.nombre}. Sigues con ella o él hasta la entrega.
        </Text>
      ) : (
        <Button
          label={`Llegamos a ${visita.destino}`}
          size="lg"
          fullWidth
          loading={ocupado}
          onPress={() =>
            void correr(
              () => client.confirmarLlegada(visita.id),
              'Acompañamiento cerrado',
              () =>
                setCierre({
                  nombre: visita.nombre,
                  destino: visita.destino,
                  min: minutosDesde(visita.inicio),
                }),
            )
          }
        />
      )}
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        {!esperandoRelevo ? (
          <AccionTexto label="Pedir relevo" onPress={() => setModo('relevo')} />
        ) : null}
        <AccionTexto label="Pedir ayuda" onPress={() => setModo('ayuda')} />
      </View>
    </>
  );

  return (
    <Frame
      header={
        <>
          <MobileHeader title="En curso" />
          {items.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: space[4], gap: space[2] }}
              style={{ flexGrow: 0, paddingBottom: space[3] }}
            >
              {items.map((i) => {
                const activa = i.visita.id === visita.id;
                return (
                  <Touchable
                    key={i.visita.id}
                    role="tab"
                    label={i.visita.nombre}
                    accessibilityState={{ selected: activa }}
                    onPress={() => {
                      cerrarModo();
                      setElegida({ id: i.visita.id, param });
                    }}
                    style={{
                      minHeight: 44,
                      paddingHorizontal: space[4],
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: activa ? colors.primary : colors.surface,
                    }}
                  >
                    <Text variant="label" tone={activa ? 'onPrimary' : 'default'}>
                      {i.visita.nombre}
                    </Text>
                  </Touchable>
                );
              })}
            </ScrollView>
          ) : null}
        </>
      }
      footer={footer}
    >
      {error ? <Banner kind="error">{describir(error).detalle}</Banner> : null}
      {esperandoRelevo ? (
        <Banner kind="info">Relevo solicitado. Aún nadie lo ha recibido.</Banner>
      ) : null}
      {apoyo ? <Banner kind="info">Vas de apoyo. Quien acompaña cierra la llegada.</Banner> : null}
      <Detalle visita={visita} />
    </Frame>
  );
}
