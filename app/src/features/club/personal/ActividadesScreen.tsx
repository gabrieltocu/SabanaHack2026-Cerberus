import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';

import type { Actividad } from '../../../club/types';
import { Button, Icon, MobileHeader, Text, TextField, colors, space } from '../../../design-system';
import { useAvisar } from '../edecan/Guardia';
import { AccionTexto, HAIRLINE } from '../edecan/ui';
import { useSession } from '../session';
import { addDays } from '../socio/dates';
import { describir } from '../socio/errors';
import { Checkbox } from '../socio/ui/Checkbox';
import { Frame } from '../socio/ui/Frame';
import { ListaCarga, Vacio } from '../socio/ui/States';
import { Segmentado } from '../ui/Segmentado';
import { useRecurso } from '../ui/useRecurso';
import { useHoy, usePantallaActiva } from '../ui/visible';
import { CampoFecha, CamposHorario } from './Campos';
import { aActividad, deActividad, porHora, validarActividad, type FormActividad } from './model';

type Dia = 'hoy' | 'manana';

function Formulario({
  hoy,
  fechaInicial,
  actividad,
  onListo,
  onCancelar,
}: {
  hoy: string;
  fechaInicial: string;
  actividad: Actividad | null;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const { client } = useSession();
  const avisar = useAvisar();
  const [f, setF] = useState<FormActividad>(() =>
    actividad
      ? deActividad(actividad)
      : {
          nombre: '',
          descripcion: '',
          lugar: '',
          fecha: fechaInicial,
          hora_desde: '',
          hora_hasta: '',
          cupo: '',
          robot_puede_ofrecer: false,
        },
  );
  const [errores, setErrores] = useState<ReturnType<typeof validarActividad>>({});
  const [enviando, setEnviando] = useState(false);
  const poner = <K extends keyof FormActividad>(k: K, v: FormActividad[K]) => {
    setF((a) => ({ ...a, [k]: v }));
    setErrores((e) => ({ ...e, [k]: undefined }));
  };

  const guardar = async () => {
    const e = validarActividad(f);
    setErrores(e);
    if (Object.keys(e).length || enviando) return;
    setEnviando(true);
    try {
      if (actividad) await client.editarActividad(actividad.id, aActividad(f));
      else await client.crearActividad(aActividad(f));
      avisar(actividad ? 'Actividad actualizada' : 'Actividad creada', 'success');
      onListo();
    } catch (err) {
      avisar(describir(err).detalle, 'error');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Frame
      header={
        <MobileHeader
          title={actividad ? 'Editar actividad' : 'Nueva actividad'}
          onBack={onCancelar}
        />
      }
      footer={
        <Button
          label={actividad ? 'Guardar cambios' : 'Crear actividad'}
          size="lg"
          fullWidth
          loading={enviando}
          onPress={() => void guardar()}
        />
      }
    >
      <View style={{ gap: space[4] }}>
        <TextField
          label="Nombre"
          value={f.nombre}
          onChangeText={(v) => poner('nombre', v)}
          error={errores.nombre}
        />
        <TextField
          label="Descripción (opcional)"
          value={f.descripcion}
          onChangeText={(v) => poner('descripcion', v)}
          multiline
        />
        <TextField
          label="Lugar"
          value={f.lugar}
          onChangeText={(v) => poner('lugar', v)}
          error={errores.lugar}
        />
        <CampoFecha
          hoy={hoy}
          valor={f.fecha}
          onCambio={(v) => poner('fecha', v)}
          error={errores.fecha}
        />
        <CamposHorario
          desde={f.hora_desde}
          hasta={f.hora_hasta}
          onCambio={(k, v) => poner(k, v)}
          errores={errores}
        />
        <TextField
          label="Cupo (opcional)"
          hint="Déjalo vacío si no hay límite."
          value={f.cupo}
          onChangeText={(v) => poner('cupo', v.replace(/\D/g, ''))}
          error={errores.cupo}
          keyboardType="number-pad"
          maxLength={4}
        />
        <Checkbox
          label="El robot puede ofrecerla a los visitantes"
          checked={f.robot_puede_ofrecer}
          onChange={(v) => poner('robot_puede_ofrecer', v)}
        />
      </View>
    </Frame>
  );
}

function Fila({
  actividad: a,
  onEditar,
  onBorrar,
}: {
  actividad: Actividad;
  onEditar: () => void;
  onBorrar: () => Promise<void>;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  return (
    <View
      style={{
        paddingVertical: space[4],
        gap: space[2],
        borderBottomWidth: 1,
        borderBottomColor: HAIRLINE,
      }}
    >
      <Text variant="label" style={{ fontSize: 16 }}>
        {a.nombre}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
        <Icon name="time-outline" size={16} color={colors.gold} />
        <Text variant="caption" tone="muted">
          {`${a.hora_desde} a ${a.hora_hasta} · ${a.lugar}`}
        </Text>
      </View>
      {a.descripcion ? <Text style={{ fontSize: 14 }}>{a.descripcion}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2], alignItems: 'center' }}>
        <Text variant="caption" tone="muted">
          {a.cupo === null
            ? `${a.inscritos.length} inscritos`
            : `${a.inscritos.length} de ${a.cupo} inscritos`}
        </Text>
        {a.robot_puede_ofrecer ? (
          <Text variant="caption" tone="muted">
            El robot la ofrece
          </Text>
        ) : null}
      </View>
      {confirmando ? (
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}
        >
          <Text variant="label" style={{ flexShrink: 1 }}>
            ¿Borrar esta actividad?
          </Text>
          <Button
            label="Sí, borrar"
            variant="danger"
            size="sm"
            loading={borrando}
            onPress={() => {
              setBorrando(true);
              void onBorrar().finally(() => setBorrando(false));
            }}
            accessibilityLabel={`Confirmar borrar ${a.nombre}`}
          />
          <AccionTexto label="No" onPress={() => setConfirmando(false)} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <Button
            label="Editar"
            variant="secondary"
            size="sm"
            onPress={onEditar}
            accessibilityLabel={`Editar ${a.nombre}`}
          />
          <AccionTexto
            label="Borrar"
            danger
            onPress={() => setConfirmando(true)}
            accessibilityLabel={`Borrar ${a.nombre}`}
          />
        </View>
      )}
    </View>
  );
}

/** Club activities of the day: list, create, edit and delete. */
export function ActividadesScreen() {
  const { client } = useSession();
  const avisar = useAvisar();
  const activa = usePantallaActiva();
  const hoy = useHoy();
  const [dia, setDia] = useState<Dia>('hoy');
  const fecha = dia === 'hoy' ? hoy : addDays(hoy, 1);
  const [form, setForm] = useState<{ actividad: Actividad | null } | null>(null);

  const cargar = useCallback(() => client.actividades(fecha), [client, fecha]);
  const { datos, error, cargando, recargar } = useRecurso(cargar, { activo: activa, clave: fecha });
  const lista = useMemo(() => (datos ? porHora(datos) : null), [datos]);

  const borrar = async (id: string) => {
    try {
      await client.borrarActividad(id);
      avisar('Actividad borrada', 'success');
      await recargar();
    } catch (e) {
      avisar(describir(e).detalle, 'error');
    }
  };

  if (form)
    return (
      <Formulario
        hoy={hoy}
        fechaInicial={fecha}
        actividad={form.actividad}
        onCancelar={() => setForm(null)}
        onListo={() => {
          setForm(null);
          void recargar();
        }}
      />
    );

  return (
    <Frame
      header={
        <MobileHeader title="Actividades">
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
        <Button
          label="Nueva actividad"
          size="lg"
          fullWidth
          onPress={() => setForm({ actividad: null })}
        />
      }
    >
      <ListaCarga
        datos={lista}
        cargando={cargando}
        error={error ? describir(error) : null}
        onRetry={() => void recargar()}
        vacio={
          <Vacio
            icon="albums-outline"
            texto={
              dia === 'hoy' ? 'No hay actividades para hoy.' : 'No hay actividades para mañana.'
            }
          />
        }
      >
        {(items) => (
          <View>
            {items.map((a) => (
              <Fila
                key={a.id}
                actividad={a}
                onEditar={() => setForm({ actividad: a })}
                onBorrar={() => borrar(a.id)}
              />
            ))}
          </View>
        )}
      </ListaCarga>
    </Frame>
  );
}
