import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import type { Tarea } from '../../../club/types';
import {
  Button,
  MobileHeader,
  Text,
  TextField,
  Touchable,
  colors,
  fonts,
  space,
} from '../../../design-system';
import { describir } from '../socio/errors';
import { Frame } from '../socio/ui/Frame';
import { ListaCarga, Vacio } from '../socio/ui/States';
import { useSession } from '../session';
import { Destacado, Fila, Lista, Progreso, Textos } from '../ui/lux';
import { useAvisar } from './Guardia';
import { progresoVisita, tareasAbiertas } from './model';
import { useTareas } from './TareasContext';
import { useEnCurso, type ItemEnCurso } from './useEnCurso';

const TITULO: Record<Tarea['tipo'], (nombre: string) => string> = {
  ACOMPANAR: (n) => `Acompañar a ${n}`,
  RELEVO: (n) => `Recibir el relevo de ${n}`,
  AYUDA: (n) => `Ayudar con ${n}`,
};

/** Accept / reject calls of one task; the accepted one opens its visit. */
function useAcciones(tarea: Tarea, onAceptada: (t: Tarea) => void) {
  const { client } = useSession();
  const { recargar } = useTareas();
  const avisar = useAvisar();
  const [ocupada, setOcupada] = useState<'aceptar' | 'rechazar' | null>(null);
  const correr = async (
    cual: 'aceptar' | 'rechazar',
    accion: () => Promise<unknown>,
    ok: string,
  ) => {
    setOcupada(cual);
    try {
      await accion();
      avisar(ok, 'success');
      await recargar();
      if (cual === 'aceptar') onAceptada(tarea);
    } catch (e) {
      avisar(describir(e).detalle, 'error');
    } finally {
      setOcupada(null);
    }
  };
  return {
    ocupada,
    aceptar: () => void correr('aceptar', () => client.aceptarTarea(tarea.id), 'Tarea aceptada'),
    rechazar: (motivo: string) =>
      void correr('rechazar', () => client.rechazarTarea(tarea.id, motivo), 'Tarea rechazada'),
  };
}

/** The task to do now: who, where, and Rechazar / Aceptar (rejecting asks for a reason). */
function TareaDestacada({ tarea, onAceptada }: { tarea: Tarea; onAceptada: (t: Tarea) => void }) {
  const { ocupada, aceptar, rechazar } = useAcciones(tarea, onAceptada);
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [falta, setFalta] = useState<string>();
  const enviar = () => {
    if (motivo.trim().length < 3) return setFalta('Cuéntanos el motivo para rechazarla.');
    rechazar(motivo.trim());
  };
  return (
    <Destacado>
      <Text variant="eyebrow" tone="muted">
        {tarea.prioridad === 'urgente' ? 'TAREA URGENTE' : 'NUEVA TAREA'}
      </Text>
      <View style={{ gap: space[1] }}>
        <Text
          variant="label"
          level={2}
          style={{ fontFamily: fonts.bodyStrong, fontSize: 20, lineHeight: 27 }}
        >
          {TITULO[tarea.tipo](tarea.nombre_visitante)}
        </Text>
        <Text tone="muted" style={{ fontSize: 15 }}>
          {tarea.punto_encuentro}
        </Text>
        {tarea.motivo ? (
          <Text tone="muted" style={{ fontSize: 15 }}>
            {tarea.motivo}
          </Text>
        ) : null}
      </View>
      {rechazando ? (
        <View style={{ gap: space[3] }}>
          <TextField
            label="Motivo del rechazo"
            value={motivo}
            onChangeText={(v) => {
              setMotivo(v);
              setFalta(undefined);
            }}
            error={falta}
            multiline
          />
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            <View style={{ flex: 1 }}>
              <Button
                label="Enviar rechazo"
                fullWidth
                loading={ocupada === 'rechazar'}
                onPress={enviar}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="Cancelar"
                variant="secondary"
                fullWidth
                onPress={() => setRechazando(false)}
              />
            </View>
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <View style={{ flex: 1 }}>
            <Button
              label="Rechazar"
              variant="secondary"
              fullWidth
              disabled={ocupada !== null}
              onPress={() => setRechazando(true)}
              accessibilityLabel={`Rechazar tarea de ${tarea.nombre_visitante}`}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label="Aceptar"
              fullWidth
              loading={ocupada === 'aceptar'}
              disabled={ocupada !== null}
              onPress={aceptar}
              accessibilityLabel={`Aceptar tarea de ${tarea.nombre_visitante}`}
            />
          </View>
        </View>
      )}
    </Destacado>
  );
}

/** A task waiting behind the featured one: name, place and Aceptar. */
function TareaEnCola({ tarea, onAceptada }: { tarea: Tarea; onAceptada: (t: Tarea) => void }) {
  const { ocupada, aceptar } = useAcciones(tarea, onAceptada);
  return (
    <Fila>
      <Textos titulo={tarea.nombre_visitante} detalle={tarea.punto_encuentro} />
      <Button
        label="Aceptar"
        variant="secondary"
        size="sm"
        loading={ocupada === 'aceptar'}
        onPress={aceptar}
        accessibilityLabel={`Aceptar tarea de ${tarea.nombre_visitante}`}
      />
    </Fila>
  );
}

/** A visit I am escorting: where to, a gold progress line and Llegamos. */
function VisitaEnCurso({
  item,
  onAbrir,
  onLlegamos,
}: {
  item: ItemEnCurso;
  onAbrir: () => void;
  onLlegamos: () => Promise<void>;
}) {
  const { visita, tarea } = item;
  const [ocupado, setOcupado] = useState(false);
  // Same rule as the visit screen: only the escort who is not waiting on a handover closes it.
  const puedeCerrar = tarea?.tipo !== 'AYUDA' && visita.estado !== 'EN_RELEVO';
  return (
    <View
      style={{
        gap: space[3],
        padding: space[4],
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
      <Touchable
        label={`Abrir la visita de ${visita.nombre}`}
        onPress={onAbrir}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Text variant="label" style={{ fontSize: 16 }}>
          {`${visita.nombre} → ${visita.destino}`}
        </Text>
      </Touchable>
      <Progreso valor={progresoVisita(visita.estado)} etiqueta={`Avance hacia ${visita.destino}`} />
      {puedeCerrar ? (
        <Button
          label="Llegamos"
          variant="secondary"
          fullWidth
          loading={ocupado}
          accessibilityLabel={`Llegamos a ${visita.destino}`}
          onPress={() => {
            setOcupado(true);
            void onLlegamos().finally(() => setOcupado(false));
          }}
        />
      ) : (
        <Button label="Abrir" variant="secondary" fullWidth onPress={onAbrir} />
      )}
    </View>
  );
}

/** Tareas: the one waiting for me, the visit in progress and, quietly, what comes next. */
export function TareasScreen() {
  const router = useRouter();
  const { client } = useSession();
  const avisar = useAvisar();
  const { yo, tareas, error, cargando, recargar } = useTareas();
  const { datos: visitas, recargar: recargarVisitas } = useEnCurso();
  const abiertas = useMemo(() => (tareas ? tareasAbiertas(tareas, yo.id) : null), [tareas, yo.id]);
  const enCurso = visitas ?? [];

  const abrirVisita = (id: string) =>
    router.navigate({ pathname: '/app/edecan/en-curso', params: { visita: id } });
  const llegamos = async (id: string) => {
    try {
      await client.confirmarLlegada(id);
      avisar('Acompañamiento cerrado', 'success');
      await Promise.all([recargar(), recargarVisitas()]);
    } catch (e) {
      avisar(describir(e).detalle, 'error');
    }
  };

  return (
    <Frame header={<MobileHeader title={`Hola, ${yo.nombre}`} />} onRefresh={() => void recargar()}>
      <ListaCarga
        datos={abiertas}
        cargando={cargando}
        error={error ? describir(error) : null}
        onRetry={() => void recargar()}
        vacio={
          enCurso.length ? null : (
            <Vacio
              icon="checkmark-done-outline"
              texto="No tienes tareas por ahora. Esta lista se actualiza sola y te avisamos si llega una urgente."
            />
          )
        }
      >
        {(lista) => (
          <TareaDestacada
            key={lista[0]!.id}
            tarea={lista[0]!}
            onAceptada={(a) => abrirVisita(a.visita_id)}
          />
        )}
      </ListaCarga>
      {enCurso.map((item) => (
        <VisitaEnCurso
          key={item.visita.id}
          item={item}
          onAbrir={() => abrirVisita(item.visita.id)}
          onLlegamos={() => llegamos(item.visita.id)}
        />
      ))}
      {abiertas && abiertas.length > 1 ? (
        <Lista>
          {abiertas.slice(1).map((t) => (
            <TareaEnCola key={t.id} tarea={t} onAceptada={(a) => abrirVisita(a.visita_id)} />
          ))}
        </Lista>
      ) : null}
    </Frame>
  );
}
