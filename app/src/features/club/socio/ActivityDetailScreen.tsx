import { useCallback, useState } from 'react';
import { Banner, Button, Text } from '../../../design-system';
import { dateLabel } from '../../shared/dates';
import type { Actividad } from '../../../club/types';
import { cuposLibres, cupoTexto, horario, inscrito, terminada } from './actividades';
import { describir, type ErrorInfo } from './errors';
import { useCarga } from './hooks';
import { useSocio } from './SocioContext';
import { Fila, Grupo } from './ui/Fila';
import { Frame } from './ui/Frame';
import { Cargando, Fallo } from './ui/States';

/** Detalle de actividad: place, hours, seats and one button to enrol or cancel. */
export function ActivityDetailScreen({
  id,
  fecha,
  onBack,
}: {
  id: string;
  fecha: string;
  onBack: () => void;
}) {
  const { client, usuario, ahora } = useSocio();
  const load = useCallback(async () => {
    const a = (await client.actividades(fecha)).find((x) => x.id === id);
    if (!a) throw new Error('no existe');
    return a;
  }, [client, fecha, id]);
  const { carga, recargar, setCarga } = useCarga<Actividad>(load);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<ErrorInfo | null>(null);

  if (carga.estado !== 'lista') {
    return (
      <Frame title="Actividad" onBack={onBack}>
        {carga.estado === 'cargando' ? (
          <Cargando filas={2} />
        ) : (
          <Fallo
            error={{
              ...carga.error,
              detalle: 'No encontramos esta actividad. Puede haber cambiado.',
            }}
            onRetry={() => void recargar()}
          />
        )}
      </Frame>
    );
  }
  const a = carga.datos;
  const yo = inscrito(a, usuario.id);
  const fin = terminada(a, ahora());
  const llena = cuposLibres(a) === 0;

  const cambiar = async () => {
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      const nueva = yo ? await client.desinscribirme(a.id) : await client.inscribirme(a.id);
      setCarga({ estado: 'lista', datos: nueva });
      setAviso(
        yo
          ? 'Cancelaste tu inscripción. El cupo quedó libre.'
          : `Quedaste inscrito: ${dateLabel(nueva.fecha)}, ${horario(nueva)}.`,
      );
    } catch (e) {
      setError(describir(e));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Frame
      title={a.nombre}
      onBack={onBack}
      footer={
        <Button
          label={
            fin ? 'Ya terminó' : yo ? 'Cancelar inscripción' : llena ? 'Cupo lleno' : 'Inscribirme'
          }
          variant={yo ? 'secondary' : 'primary'}
          size="lg"
          fullWidth
          loading={ocupado}
          disabled={fin || (llena && !yo)}
          onPress={() => void cambiar()}
        />
      }
    >
      {aviso ? (
        <Banner kind="info" title="Listo">
          {aviso}
        </Banner>
      ) : null}
      {error ? <Banner kind="error">{error.detalle}</Banner> : null}
      {a.descripcion ? <Text>{a.descripcion}</Text> : null}
      <Grupo>
        <Fila primero icono="calendar-outline" titulo="Fecha" detalle={dateLabel(a.fecha)} />
        <Fila icono="time-outline" titulo="Horario" detalle={horario(a)} />
        <Fila icono="location-outline" titulo="Lugar" detalle={a.lugar} />
        <Fila
          icono="people-outline"
          titulo="Cupo"
          detalle={
            a.cupo === null
              ? cupoTexto(a)
              : `${a.inscritos.length} de ${a.cupo} inscritos · ${cupoTexto(a)}`
          }
        />
      </Grupo>
    </Frame>
  );
}
