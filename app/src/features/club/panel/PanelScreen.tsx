import { useCallback, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';

import {
  BottomTabBar,
  OfflineBanner,
  TAB_BAR_HEIGHT,
  Text,
  Touchable,
  colors,
  fonts,
  space,
  useInsets,
  useToast,
} from '../../../design-system';
import { useSession } from '../session';
import { useRecurso } from '../ui/useRecurso';
import { useHoy, usePantallaActiva } from '../ui/visible';
import { AlertasView } from './AlertasView';
import { ColaView } from './ColaView';
import { EquipoView } from './EquipoView';
import { EvaluacionesView } from './EvaluacionesView';
import { EventosView } from './EventosView';
import {
  ESCRITORIO_MIN,
  SONDEO_COLA_MS,
  SONDEO_MS,
  ayerDe,
  rolTexto,
  type DiaElegido,
  type Seccion,
} from './format';
import { HistorialView } from './HistorialView';
import { GRUPOS, ItemLateral, MenuMas, SECCIONES, TITULOS, Usuario } from './Navegacion';
import { RegistrosView } from './RegistrosView';
import { ResumenView } from './ResumenView';
import { RobotView } from './RobotView';
import { sembrarDemo } from './sembrar';
import { VisitasView } from './VisitasView';
import { BotonIcono, LINEA, Logotipo } from './ui';

/** Sections that follow the Hoy / Ayer switch. */
const CON_DIA: readonly Seccion[] = ['resumen', 'visitas', 'evaluaciones', 'historial'];

/** Hoy / Ayer: two square buttons on a black line; the chosen one is black with a gold label. */
function SelectorDia({
  valor,
  onCambio,
}: {
  valor: DiaElegido;
  onCambio: (d: DiaElegido) => void;
}) {
  return (
    <View role="tablist" style={{ flexDirection: 'row', borderWidth: 1, borderColor: LINEA }}>
      {(['hoy', 'ayer'] as const).map((d) => {
        const activo = d === valor;
        return (
          <Touchable
            key={d}
            role="tab"
            label={d === 'hoy' ? 'Hoy' : 'Ayer'}
            onPress={() => onCambio(d)}
            accessibilityState={{ selected: activo }}
            style={{
              minWidth: 88,
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: activo ? colors.forest : 'transparent',
            }}
          >
            <Text variant="label" style={{ color: activo ? colors.goldOnDark : colors.ink }}>
              {d === 'hoy' ? 'Hoy' : 'Ayer'}
            </Text>
          </Touchable>
        );
      })}
    </View>
  );
}

/** The web panel: sidebar on wide windows, bottom bar below 900 px. */
export function PanelScreen() {
  const { client, usuario, logout } = useSession();
  const insets = useInsets();
  const escritorio = useWindowDimensions().width >= ESCRITORIO_MIN;
  const hoy = useHoy();
  const [elegida, setSeccion] = useState<Seccion | 'mas'>('resumen');
  // "Más" only exists on phones; a window widened to desktop falls back to the summary.
  const seccion = elegida === 'mas' && escritorio ? 'resumen' : elegida;
  const [sembrando, setSembrando] = useState(false);
  const { show, toast } = useToast({ bottomOffset: escritorio ? 0 : TAB_BAR_HEIGHT });
  const [dia, setDia] = useState<DiaElegido>('hoy');
  const fecha = dia === 'hoy' ? hoy : ayerDe(hoy);

  // One poll feeds the KPIs, the charts and the open-alerts count of the navigation.
  const cargar = useCallback(() => client.panelResumen(fecha), [client, fecha]);
  const resumen = useRecurso(cargar, {
    activo: usePantallaActiva(),
    cadaMs: SONDEO_MS,
    clave: fecha,
  });
  const datos = resumen.datos?.fecha === fecha ? resumen.datos : null;
  const abiertas = dia === 'hoy' ? (datos?.kpis.alertas_abiertas ?? 0) : 0;

  // The queue is polled here (5 s) so its badge is alive in every section.
  const cola = useRecurso(
    useCallback(() => client.cola(), [client]),
    { activo: usePantallaActiva(), cadaMs: SONDEO_COLA_MS },
  );
  const enEspera = cola.datos?.length ?? 0;

  const sembrar = async () => {
    setSembrando(true);
    try {
      const r = await sembrarDemo();
      show(
        r.ya_sembrado
          ? 'Los datos iniciales ya estaban cargados.'
          : 'Listo: cargamos visitas, equipo y alertas del día.',
        'success',
      );
      await Promise.all([resumen.recargar(), cola.recargar()]);
    } catch (e) {
      show(e instanceof Error ? e.message : 'No se pudieron cargar los datos.', 'error');
    } finally {
      setSembrando(false);
    }
  };

  const nombre = usuario ? `${usuario.nombre} ${usuario.apellido}`.trim() : 'Administración';
  const rol = rolTexto(usuario?.rol ?? 'ADMIN', usuario?.trato);
  const { titulo, sub } = TITULOS[seccion];
  const conDia = seccion !== 'mas' && CON_DIA.includes(seccion);

  const contenido = (
    <>
      {resumen.sinConexion && datos !== null ? (
        <OfflineBanner onRetry={() => void resumen.recargar()} />
      ) : null}
      {seccion === 'resumen' ? (
        <ResumenView
          datos={datos}
          fecha={fecha}
          cola={cola.datos}
          esHoy={dia === 'hoy'}
          error={datos === null ? resumen.error : null}
          sinConexion={resumen.sinConexion}
          onReintentar={() => void resumen.recargar()}
          onSembrar={usuario?.rol === 'ADMIN' ? () => void sembrar() : undefined}
          sembrando={sembrando}
        />
      ) : seccion === 'visitas' ? (
        <VisitasView fecha={fecha} />
      ) : seccion === 'alertas' ? (
        <AlertasView />
      ) : seccion === 'cola' ? (
        <ColaView cola={cola} onAsignada={(m) => show(m, 'success')} />
      ) : seccion === 'equipo' ? (
        <EquipoView />
      ) : seccion === 'eventos' ? (
        <EventosView avisar={show} />
      ) : seccion === 'registros' ? (
        <RegistrosView hoy={hoy} />
      ) : seccion === 'evaluaciones' ? (
        <EvaluacionesView fecha={fecha} />
      ) : seccion === 'historial' ? (
        <HistorialView fecha={fecha} />
      ) : seccion === 'mas' ? (
        <MenuMas onElegir={setSeccion} />
      ) : (
        <RobotView />
      )}
    </>
  );

  const cabeceraPagina = (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: space[4],
      }}
    >
      <View style={{ flexShrink: 1, gap: space[1] }}>
        <Text
          role="heading"
          aria-level={1}
          style={{ fontFamily: fonts.bodyStrong, fontSize: 28, lineHeight: 34 }}
        >
          {titulo}
        </Text>
        <Text tone="muted">{sub}</Text>
      </View>
      {conDia ? <SelectorDia valor={dia} onCambio={setDia} /> : null}
    </View>
  );

  const cuerpo = (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        padding: escritorio ? 32 : 16,
        paddingTop: escritorio ? 28 : 20,
        gap: space[5],
      }}
    >
      <View style={{ width: '100%', maxWidth: 1180, alignSelf: 'center', gap: space[5] }}>
        {cabeceraPagina}
        {contenido}
      </View>
    </ScrollView>
  );

  if (!escritorio) {
    return (
      <View role="main" style={{ flex: 1, backgroundColor: colors.bg }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: insets.top + space[2],
            paddingBottom: space[2],
            paddingHorizontal: 16,
            backgroundColor: colors.paper,
            borderBottomWidth: 1,
            borderBottomColor: LINEA,
          }}
        >
          <Logotipo />
          <View style={{ flexDirection: 'row' }}>
            <BotonIcono
              icono="notifications-outline"
              label="Alertas"
              contador={abiertas}
              onPress={() => setSeccion('alertas')}
            />
            <BotonIcono
              icono="log-out-outline"
              label="Cerrar sesión"
              onPress={() => void logout()}
            />
          </View>
        </View>
        {cuerpo}
        {toast}
        <BottomTabBar
          items={[
            ...SECCIONES.filter((s) => s.principal).map((s) => ({
              key: s.clave,
              label: s.etiqueta === 'Cola de atención' ? 'Cola' : s.etiqueta,
              icon: s.icono,
              badge: s.clave === 'alertas' ? abiertas : s.clave === 'cola' ? enEspera : undefined,
            })),
            { key: 'mas', label: 'Más', icon: 'ellipsis-horizontal-outline' as const },
          ]}
          activeKey={SECCIONES.some((s) => s.clave === seccion && s.principal) ? seccion : 'mas'}
          onSelect={(k) => setSeccion(k as Seccion | 'mas')}
        />
      </View>
    );
  }

  return (
    <View role="main" style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg }}>
      <View
        role="navigation"
        accessibilityLabel="Panel de administración"
        style={{
          width: 248,
          paddingVertical: space[5],
          paddingHorizontal: space[4],
          gap: space[5],
          backgroundColor: colors.paper,
          borderRightWidth: 1,
          borderRightColor: LINEA,
        }}
      >
        <View style={{ paddingHorizontal: space[3] }}>
          <Logotipo />
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: space[4] }}>
          {GRUPOS.map((g) => (
            <View key={g} role="tablist" accessibilityLabel={g} style={{ gap: space[1] }}>
              <Text
                variant="eyebrow"
                tone="muted"
                style={{ paddingHorizontal: space[3], paddingBottom: space[1] }}
              >
                {g.toUpperCase()}
              </Text>
              {SECCIONES.filter((s) => s.grupo === g).map((s) => (
                <ItemLateral
                  key={s.clave}
                  icono={s.icono}
                  etiqueta={s.etiqueta}
                  activo={s.clave === seccion}
                  contador={
                    s.clave === 'alertas' ? abiertas : s.clave === 'cola' ? enEspera : undefined
                  }
                  unidad={s.clave === 'cola' ? 'en espera' : 'abiertas'}
                  onPress={() => setSeccion(s.clave)}
                />
              ))}
            </View>
          ))}
        </ScrollView>
        <ItemLateral
          icono="log-out-outline"
          etiqueta="Cerrar sesión"
          onPress={() => void logout()}
        />
      </View>
      <View style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: space[4],
            paddingHorizontal: 32,
            paddingVertical: space[3],
            borderBottomWidth: 1,
            borderBottomColor: LINEA,
          }}
        >
          <BotonIcono
            icono="notifications-outline"
            label="Alertas"
            contador={abiertas}
            onPress={() => setSeccion('alertas')}
          />
          <Usuario nombre={nombre} rol={rol} />
        </View>
        {cuerpo}
        {toast}
      </View>
    </View>
  );
}
