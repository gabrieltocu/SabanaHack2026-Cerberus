import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';

import type { ItemAgenda } from '../../../club/types';
import {
  Button,
  Icon,
  IconButton,
  MobileHeader,
  Text,
  TextField,
  colors,
  space,
} from '../../../design-system';
import { useAvisar } from '../edecan/Guardia';
import { HAIRLINE } from '../edecan/ui';
import { useSession } from '../session';
import { addDays, esHora, formatoHora } from '../socio/dates';
import { describir } from '../socio/errors';
import { Frame } from '../socio/ui/Frame';
import { ListaCarga, Vacio } from '../socio/ui/States';
import { Segmentado } from '../ui/Segmentado';
import { useRecurso } from '../ui/useRecurso';
import { useHoy, usePantallaActiva } from '../ui/visible';
import { porHora, TIPO_AGENDA } from './model';

type Dia = 'hoy' | 'manana';

function Fila({
  item,
  ultimo,
  onBorrar,
}: {
  item: ItemAgenda;
  ultimo: boolean;
  onBorrar?: () => void;
}) {
  const tipo = TIPO_AGENDA[item.tipo];
  return (
    <View style={{ flexDirection: 'row', gap: space[3] }}>
      <View style={{ width: 52, paddingTop: 2 }}>
        <Text variant="label" style={{ fontSize: 15 }}>
          {item.hora_desde}
        </Text>
        {item.hora_hasta ? (
          <Text variant="caption" tone="muted">
            {item.hora_hasta}
          </Text>
        ) : null}
      </View>
      <View style={{ alignItems: 'center', width: 12 }}>
        <View
          style={{
            width: 10,
            height: 10,
            marginTop: 6,
            backgroundColor: item.tipo === 'RECORDATORIO' ? colors.gold : colors.ink,
          }}
        />
        {!ultimo ? <View style={{ flex: 1, width: 1, backgroundColor: HAIRLINE }} /> : null}
      </View>
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: space[2],
          paddingBottom: space[4],
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label" style={{ fontSize: 16 }}>
            {item.titulo}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
            <Icon name={tipo.icon} size={14} color={colors.gold} />
            <Text variant="caption" tone="muted">
              {[tipo.etiqueta, item.lugar].filter(Boolean).join(' · ')}
            </Text>
          </View>
          {item.nota ? <Text style={{ fontSize: 14 }}>{item.nota}</Text> : null}
        </View>
        {onBorrar ? (
          <IconButton
            icon="trash-outline"
            label={`Borrar recordatorio ${item.titulo}`}
            onPress={onBorrar}
          />
        ) : null}
      </View>
    </View>
  );
}

/** Day agenda: shift, meetings, services and reminders in one timeline. */
export function AgendaScreen() {
  const { client } = useSession();
  const avisar = useAvisar();
  const activa = usePantallaActiva();
  const hoy = useHoy();
  const [dia, setDia] = useState<Dia>('hoy');
  const fecha = dia === 'hoy' ? hoy : addDays(hoy, 1);
  const [creando, setCreando] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [hora, setHora] = useState('');
  const [nota, setNota] = useState('');
  const [faltan, setFaltan] = useState<{ titulo?: string; hora?: string }>({});
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(() => client.agenda(fecha), [client, fecha]);
  const { datos, error, cargando, recargar } = useRecurso(cargar, {
    activo: activa,
    cadaMs: 30_000,
    clave: fecha,
  });
  const items = useMemo(() => (datos ? porHora(datos) : null), [datos]);

  const guardar = async () => {
    const f = {
      titulo: titulo.trim() ? undefined : 'Escribe qué quieres recordar.',
      hora: esHora(hora) ? undefined : 'Escribe la hora como 09:30.',
    };
    setFaltan(f);
    if (f.titulo || f.hora || enviando) return;
    setEnviando(true);
    try {
      await client.crearRecordatorio({
        titulo: titulo.trim(),
        fecha,
        hora_desde: hora,
        ...(nota.trim() ? { nota: nota.trim() } : {}),
      });
      avisar('Recordatorio guardado', 'success');
      setTitulo('');
      setHora('');
      setNota('');
      setCreando(false);
      await recargar();
    } catch (e) {
      avisar(describir(e).detalle, 'error');
    } finally {
      setEnviando(false);
    }
  };

  const borrar = async (id: string) => {
    try {
      await client.borrarRecordatorio(id);
      avisar('Recordatorio borrado', 'success');
      await recargar();
    } catch (e) {
      avisar(describir(e).detalle, 'error');
    }
  };

  return (
    <Frame
      header={
        <MobileHeader title="Agenda">
          <Segmentado
            opciones={[
              { clave: 'hoy', etiqueta: 'Hoy' },
              { clave: 'manana', etiqueta: 'Mañana' },
            ]}
            valor={dia}
            onCambio={setDia}
          />
        </MobileHeader>
      }
      onRefresh={() => void recargar()}
      footer={
        creando ? undefined : (
          <Button label="Nuevo recordatorio" size="lg" fullWidth onPress={() => setCreando(true)} />
        )
      }
    >
      {creando ? (
        <View style={{ gap: space[3] }}>
          <TextField
            label="Recordatorio"
            value={titulo}
            onChangeText={(v) => {
              setTitulo(v);
              setFaltan((f) => ({ ...f, titulo: undefined }));
            }}
            error={faltan.titulo}
          />
          <TextField
            label="Hora"
            hint="24 horas, por ejemplo 14:30."
            value={hora}
            onChangeText={(v) => {
              setHora(formatoHora(v));
              setFaltan((f) => ({ ...f, hora: undefined }));
            }}
            error={faltan.hora}
            keyboardType="number-pad"
            maxLength={5}
          />
          <TextField label="Nota (opcional)" value={nota} onChangeText={setNota} />
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            <Button label="Guardar" loading={enviando} onPress={() => void guardar()} />
            <Button label="Cancelar" variant="ghost" onPress={() => setCreando(false)} />
          </View>
        </View>
      ) : null}
      <ListaCarga
        datos={items}
        cargando={cargando}
        error={error ? describir(error) : null}
        onRetry={() => void recargar()}
        vacio={
          <Vacio
            icon="calendar-outline"
            texto={
              dia === 'hoy' ? 'No tienes nada agendado hoy.' : 'No tienes nada agendado mañana.'
            }
          />
        }
      >
        {(lista) => (
          <View>
            {lista.map((it, i) => (
              <Fila
                key={it.id}
                item={it}
                ultimo={i === lista.length - 1}
                onBorrar={it.tipo === 'RECORDATORIO' ? () => void borrar(it.id) : undefined}
              />
            ))}
          </View>
        )}
      </ListaCarga>
    </Frame>
  );
}
