import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Text, colors, space, useBreakpoint, useInsets } from '../../design-system';
import { PaseGrande } from './Pase';
import { VisitaSections, type VisitaNavigation } from './VisitaSections';
import { Hoja } from './Hoja';
import { Datos, Marca, type FilaDato } from './ui';
import { horaCorta } from './pase';
import { horarioTexto, lineaVisita, type Visita } from './visita';

export const ENLACE_INVALIDO = 'Este enlace no contiene un pase válido.';

type PaseVisita = Extract<Visita, { clase: 'pase' }>;

// ---------- piezas ----------

/** «p. m.» ya termina en punto: no se duplica al cerrar la frase. */
const punto = (hora: string) => (hora.endsWith('.') ? hora : `${hora}.`);

/** Pase que aún no sirve: vencido o fuera de horario. Sin QR, con el siguiente paso. */
function Aviso({ pase, extra }: { pase: PaseVisita; extra: string }) {
  const { estado, inicioMs, finMs } = pase.vigencia;
  const vencido = estado === 'vencido';
  const texto = vencido
    ? `Este pase venció a las ${punto(horaCorta(finMs))} ${extra}`
    : `Fuera de horario. Tu horario autorizado empieza a las ${punto(horaCorta(inicioMs!))} No te presentes antes.`;
  return (
    <View
      role="alert"
      style={{
        borderWidth: 1,
        borderColor: vencido ? colors.danger : colors.ink,
        padding: space[5],
        gap: space[2],
      }}
    >
      <Text variant="label" tone={vencido ? 'danger' : 'default'}>
        {vencido ? 'Pase vencido' : 'Fuera de horario'}
      </Text>
      <Text>{texto}</Text>
    </View>
  );
}

const useQrSize = () => Math.min(260, useBreakpoint().width - space[4] * 2 - space[3] * 2 - 2);

// ---------- invitado ----------

function Invitado({ v, now }: { v: PaseVisita; now: number }) {
  const [hoja, setHoja] = useState(false);
  const qr = useQrSize();
  const { nombre } = v.pase;
  const { lugar, genero } = v.datos;
  const vigente = v.vigencia.estado === 'vigente';
  const bienvenida =
    genero === 'f' ? 'Bienvenida' : genero === 'm' ? 'Bienvenido' : 'Te damos la bienvenida';
  return (
    <>
      <Marca />
      <ScrollViewBody>
        {vigente ? (
          <>
            <PaseGrande
              saludo={bienvenida}
              nombre={nombre.split(' ')[0] ?? nombre}
              qr={v.payload}
              lado={qr}
              etiquetaQr="Código QR de tu pase de visita. Muéstralo al robot en la entrada."
              linea={lineaVisita(v.vigencia, now, lugar)}
              ayuda="Muéstralo al robot en la entrada"
            />
            <Button
              label="Cómo llegar"
              variant="secondary"
              size="lg"
              fullWidth
              onPress={() => setHoja(true)}
            />
          </>
        ) : (
          <Aviso pase={v} extra="Pide uno nuevo a tu anfitrión." />
        )}
      </ScrollViewBody>
      <Hoja
        visible={hoja}
        title="Cómo llegar"
        direccion={['N Club · Entrada principal']}
        consejosTitulo="Recomendaciones"
        consejos={[
          'Llega unos 10 minutos antes de tu hora.',
          'Ten este pase a la mano y sube el brillo de la pantalla.',
          'Si no tienes tu teléfono, dilo al robot: te ayudaremos en recepción.',
        ]}
        onClose={() => setHoja(false)}
      />
    </>
  );
}

// ---------- trabajador externo ----------

function Externo({ v, now }: { v: PaseVisita; now: number }) {
  const [hoja, setHoja] = useState(false);
  const qr = useQrSize();
  const { nombre } = v.pase;
  const { orden, empresa, motivo, area, supervisor } = v.datos;
  const filas: FilaDato[] = [
    ...(orden
      ? [{ icon: 'document-text-outline' as const, etiqueta: 'Orden de servicio', valor: orden }]
      : []),
    ...(empresa
      ? [{ icon: 'business-outline' as const, etiqueta: 'Empresa', valor: empresa }]
      : []),
    ...(motivo ? [{ icon: 'construct-outline' as const, etiqueta: 'Motivo', valor: motivo }] : []),
    ...(area
      ? [{ icon: 'location-outline' as const, etiqueta: 'Área autorizada', valor: area }]
      : []),
    ...(supervisor
      ? [
          {
            icon: 'person-outline' as const,
            etiqueta: 'Supervisor o responsable',
            valor: supervisor,
          },
        ]
      : []),
  ];
  return (
    <>
      <Marca />
      <ScrollViewBody>
        {v.vigencia.estado === 'vigente' ? (
          <>
            <PaseGrande
              saludo="Bienvenido"
              nombre={nombre.split(' ')[0] ?? nombre}
              qr={v.payload}
              lado={qr}
              etiquetaQr="Código QR de tu pase de acceso. Muéstralo al robot o en recepción de proveedores."
              linea={lineaVisita(v.vigencia, now, area)}
              ayuda="Preséntate en recepción de proveedores"
            />
            <Button
              label="Cómo llegar"
              variant="secondary"
              size="lg"
              fullWidth
              onPress={() => setHoja(true)}
            />
          </>
        ) : (
          <Aviso pase={v} extra="Pide uno nuevo a tu supervisor o responsable." />
        )}
        {filas.length ? <Datos filas={filas} /> : null}
        {v.vigencia.estado !== 'vigente' ? (
          <Text variant="caption" tone="muted">
            {horarioTexto(v.vigencia)}
          </Text>
        ) : null}
      </ScrollViewBody>
      <Hoja
        visible={hoja}
        title="Cómo llegar"
        direccion={['N Club · Recepción de proveedores', 'Acceso de servicio, costado norte']}
        consejosTitulo="Antes de entrar"
        consejos={[
          'Lleva tu documento y el número de la orden de servicio.',
          'Anúnciate en recepción: el responsable confirmará tu ingreso.',
          'Mantente en el área autorizada durante todo tu trabajo.',
        ]}
        onClose={() => setHoja(false)}
      />
    </>
  );
}

// ---------- enlace sin pase válido ----------

function Invalido() {
  return (
    <>
      <Marca />
      <ScrollViewBody>
        <View
          role="alert"
          style={{
            borderWidth: 1,
            borderColor: colors.danger,
            padding: space[5],
            gap: space[2],
          }}
        >
          <Text variant="label" level={1} tone="danger">
            Pase no válido
          </Text>
          <Text>{ENLACE_INVALIDO}</Text>
          <Text tone="muted">Pide a tu anfitrión o a tu responsable que te lo envíe de nuevo.</Text>
        </View>
      </ScrollViewBody>
    </>
  );
}

function ScrollViewBody({ children }: { children: ReactNode }) {
  const insets = useInsets();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingHorizontal: space[4],
        paddingTop: space[5],
        paddingBottom: space[6] + insets.bottom,
        gap: space[5],
      }}
    >
      {children}
    </ScrollView>
  );
}

/** `/visita`: la experiencia sin cuenta de un invitado o de un trabajador externo. */
export function VisitaScreen({
  visita,
  now,
  section = 'inicio',
  onExit,
  onMembership,
}: { visita: Visita; now: number } & VisitaNavigation) {
  return (
    <View role="main" style={{ flex: 1, minHeight: 0 }}>
      {visita.clase === 'invalido' ? (
        <Invalido />
      ) : section !== 'inicio' ? (
        <VisitaSections
          v={visita}
          now={now}
          section={section}
          onExit={onExit}
          onMembership={onMembership}
        />
      ) : visita.tipo === 'invitado' ? (
        <Invitado v={visita} now={now} />
      ) : (
        <Externo v={visita} now={now} />
      )}
    </View>
  );
}
