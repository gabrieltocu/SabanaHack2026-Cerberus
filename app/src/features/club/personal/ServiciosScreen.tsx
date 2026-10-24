import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';

import type { OrdenServicio } from '../../../club/types';
import {
  Button,
  MobileHeader,
  Text,
  TextField,
  Touchable,
  colors,
  space,
} from '../../../design-system';
import { useAvisar } from '../edecan/Guardia';
import { Opciones } from '../edecan/ui';
import { useSession } from '../session';
import { describir } from '../socio/errors';
import { Frame } from '../socio/ui/Frame';
import { ListaCarga, Vacio } from '../socio/ui/States';
import { Fila as FilaLista, IconoDorado, Lista, Textos } from '../ui/lux';
import { useRecurso } from '../ui/useRecurso';
import { useHoy, usePantallaActiva } from '../ui/visible';
import { CampoFecha, CamposHorario } from './Campos';
import { ESTADOS_SERVICIO, TRATOS, validarServicio, type FormServicio } from './model';

const vacio = (fecha: string): FormServicio => ({
  empresa: '',
  nombre: '',
  apellido: '',
  trato: null,
  trabajo: '',
  solicitado_por: '',
  responsable: '',
  area: '',
  fecha,
  hora_desde: '',
  hora_hasta: '',
  punto_presentacion: '',
});

function Formulario({
  hoy,
  onListo,
  onCancelar,
}: {
  hoy: string;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const { client } = useSession();
  const avisar = useAvisar();
  const [f, setF] = useState<FormServicio>(() => vacio(hoy));
  const [personaId, setPersonaId] = useState<string | null>(null);
  const [errores, setErrores] = useState<ReturnType<typeof validarServicio>>({});
  const [enviando, setEnviando] = useState(false);
  const cargarPersonas = useCallback(() => client.personasServicio(), [client]);
  const personas = useRecurso(cargarPersonas);
  const poner = <K extends keyof FormServicio>(k: K, v: FormServicio[K]) => {
    setF((a) => ({ ...a, [k]: v }));
    setErrores((e) => ({ ...e, [k]: undefined }));
  };
  const texto = (
    k: Exclude<keyof FormServicio, 'trato' | 'fecha' | 'hora_desde' | 'hora_hasta'>,
    label: string,
  ) => (
    <TextField label={label} value={f[k]} onChangeText={(v) => poner(k, v)} error={errores[k]} />
  );

  const guardar = async () => {
    const e = validarServicio(f);
    setErrores(e);
    if (Object.keys(e).length || !f.trato || enviando) return;
    setEnviando(true);
    try {
      await client.crearServicio({
        empresa: f.empresa.trim(),
        nombre: f.nombre.trim(),
        apellido: f.apellido.trim(),
        trato: f.trato,
        trabajo: f.trabajo.trim(),
        solicitado_por: f.solicitado_por.trim(),
        responsable: f.responsable.trim(),
        area: f.area.trim(),
        fecha: f.fecha,
        hora_desde: f.hora_desde,
        hora_hasta: f.hora_hasta,
        punto_presentacion: f.punto_presentacion.trim(),
        ...(personaId ? { persona_id: personaId } : {}),
      });
      avisar(`Servicio registrado para ${f.nombre.trim()}`, 'success');
      onListo();
    } catch (err) {
      avisar(describir(err).detalle, 'error');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Frame
      header={<MobileHeader title="Nueva visita de servicio" onBack={onCancelar} />}
      footer={
        <Button
          label="Registrar"
          size="lg"
          fullWidth
          loading={enviando}
          onPress={() => void guardar()}
        />
      }
    >
      <View style={{ gap: space[4] }}>
        <View style={{ gap: space[2] }}>
          <Text variant="label">Persona registrada</Text>
          <Text variant="caption" tone="muted">
            Al elegir una persona se completa el nombre. Registra los demás datos del servicio según
            la información recibida.
          </Text>
          <View role="radiogroup" accessibilityLabel="Persona registrada" style={{ gap: space[2] }}>
            <Touchable
              role="radio"
              label="Crear como trabajador nuevo"
              accessibilityState={{ checked: personaId === null }}
              onPress={() => {
                setPersonaId(null);
                poner('nombre', '');
              }}
              style={{
                minHeight: 44,
                justifyContent: 'center',
                paddingHorizontal: space[3],
                borderWidth: 1,
                borderColor: colors.borderStrong,
                backgroundColor: personaId === null ? colors.surfaceSoft : colors.surface,
              }}
            >
              <Text variant="label">Crear como trabajador nuevo</Text>
            </Touchable>
            {personas.datos?.map((persona) => (
              <Touchable
                key={persona.id}
                role="radio"
                label={persona.nombre}
                accessibilityState={{ checked: personaId === persona.id }}
                onPress={() => {
                  setPersonaId(persona.id);
                  poner('nombre', persona.nombre);
                }}
                style={{
                  minHeight: 44,
                  justifyContent: 'center',
                  paddingHorizontal: space[3],
                  borderWidth: 1,
                  borderColor: colors.borderStrong,
                  backgroundColor: personaId === persona.id ? colors.surfaceSoft : colors.surface,
                }}
              >
                <Text variant="label">{persona.nombre}</Text>
              </Touchable>
            ))}
          </View>
          {personas.error ? (
            <View style={{ gap: space[2] }}>
              <Text variant="caption" tone="danger" role="alert">
                No se pudieron cargar las personas registradas. Puedes crear un trabajador nuevo o
                intentar de nuevo.
              </Text>
              <Button
                label="Reintentar carga de personas"
                variant="secondary"
                size="sm"
                loading={personas.cargando}
                onPress={() => void personas.recargar()}
              />
            </View>
          ) : null}
        </View>
        {texto('empresa', 'Empresa')}
        {texto('nombre', 'Nombre del trabajador')}
        {texto('apellido', 'Apellido del trabajador')}
        <View style={{ gap: space[1] }}>
          <Opciones
            etiqueta="Trato"
            opciones={TRATOS}
            valor={f.trato}
            onCambio={(v) => poner('trato', v)}
          />
          {errores.trato ? (
            <Text variant="caption" tone="danger" role="alert">
              {errores.trato}
            </Text>
          ) : null}
        </View>
        {texto('trabajo', 'Trabajo a realizar')}
        {texto('solicitado_por', 'Solicitado por')}
        {texto('responsable', 'Responsable en el club')}
        {texto('area', 'Área')}
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
        {texto('punto_presentacion', 'Punto de presentación')}
      </View>
    </Frame>
  );
}

/** One order: gold icon, what and where/when; the button takes it (Tomar) or closes it (Terminar). */
function Orden({
  servicio,
  onEstado,
}: {
  servicio: OrdenServicio;
  onEstado: (e: OrdenServicio['estado']) => Promise<void>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const siguiente = servicio.estado === 'PROGRAMADA' ? 'EN_CURSO' : 'TERMINADA';
  const cambiar = (e: OrdenServicio['estado']) => {
    setOcupado(true);
    void onEstado(e).finally(() => setOcupado(false));
  };
  return (
    <View>
      <FilaLista>
        <Touchable
          label={`Detalle de ${servicio.trabajo}`}
          accessibilityState={{ expanded: abierto }}
          onPress={() => setAbierto((v) => !v)}
          style={{
            flex: 1,
            minHeight: 44,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[3],
          }}
        >
          <IconoDorado name="construct-outline" />
          <Textos
            titulo={servicio.trabajo}
            detalle={`${servicio.punto_presentacion} · ${servicio.hora_desde}`}
          />
        </Touchable>
        <Button
          label={siguiente === 'EN_CURSO' ? 'Tomar' : 'Terminar'}
          variant="secondary"
          size="sm"
          loading={ocupado}
          accessibilityLabel={`${siguiente === 'EN_CURSO' ? 'Tomar' : 'Terminar'} ${servicio.trabajo}`}
          onPress={() => cambiar(siguiente)}
        />
      </FilaLista>
      {abierto ? (
        <View
          style={{
            gap: space[3],
            paddingHorizontal: space[3],
            paddingBottom: space[3],
            borderTopWidth: 1,
            borderTopColor: colors.border,
            paddingTop: space[3],
          }}
        >
          <Text variant="caption" tone="muted">
            {`${servicio.empresa} · ${servicio.nombre} ${servicio.apellido}`}
          </Text>
          <Text variant="caption" tone="muted">
            {`${servicio.area} · responsable ${servicio.responsable} · ${servicio.hora_desde} a ${servicio.hora_hasta}`}
          </Text>
          <Opciones
            etiqueta="Estado"
            opciones={ESTADOS_SERVICIO}
            valor={servicio.estado}
            onCambio={(e) => {
              if (e !== servicio.estado) void onEstado(e).then(() => setAbierto(false));
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

/** Service visits of outside companies: the list and the form that registers a worker. */
export function ServiciosScreen() {
  const { client } = useSession();
  const avisar = useAvisar();
  const activa = usePantallaActiva();
  const hoy = useHoy();
  const [creando, setCreando] = useState(false);
  const cargar = useCallback(() => client.servicios(), [client]);
  const { datos, error, cargando, recargar } = useRecurso(cargar, { activo: activa });
  // Today's open orders by time; finished and cancelled ones leave the list.
  const lista = useMemo(
    () =>
      datos
        ? datos
            .filter(
              (o) => o.fecha === hoy && (o.estado === 'PROGRAMADA' || o.estado === 'EN_CURSO'),
            )
            .sort((a, b) => a.hora_desde.localeCompare(b.hora_desde))
        : null,
    [datos, hoy],
  );

  const cambiarEstado = async (id: string, estado: OrdenServicio['estado']) => {
    try {
      await client.editarServicio(id, { estado });
      avisar('Estado actualizado', 'success');
      await recargar();
    } catch (e) {
      avisar(describir(e).detalle, 'error');
    }
  };

  if (creando)
    return (
      <Formulario
        hoy={hoy}
        onCancelar={() => setCreando(false)}
        onListo={() => {
          setCreando(false);
          void recargar();
        }}
      />
    );

  return (
    <Frame header={<MobileHeader title="Órdenes de hoy" />} onRefresh={() => void recargar()}>
      <ListaCarga
        datos={lista}
        cargando={cargando}
        error={error ? describir(error) : null}
        onRetry={() => void recargar()}
        vacio={<Vacio icon="construct-outline" texto="No hay órdenes para hoy." />}
      >
        {(items) => (
          <Lista>
            {items.map((s) => (
              <Orden key={s.id} servicio={s} onEstado={(e) => cambiarEstado(s.id, e)} />
            ))}
          </Lista>
        )}
      </ListaCarga>
      <Button
        label="Registrar visita de servicio"
        variant="secondary"
        fullWidth
        onPress={() => setCreando(true)}
      />
    </Frame>
  );
}
