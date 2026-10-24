import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import type { QrVerificado, Visita } from '../../../club/types';
import {
  Banner,
  Button,
  MobileHeader,
  Text,
  TextField,
  colors,
  space,
} from '../../../design-system';
import { dateLabel } from '../../shared/dates';
import { CATEGORIAS, categoriaDe } from '../categorias';
import { useSession } from '../session';
import { describir } from '../socio/errors';
import { Frame } from '../socio/ui/Frame';
import { useAvisar } from './Guardia';
import { motivoQr } from './model';
import { Dato, FotoPersona, Seccion, TenPresente } from './ui';

function Contexto({ r }: { r: QrVerificado }) {
  const { client } = useSession();
  const inv = r.invitacion;
  const v = r.visita;
  const nombre = r.nombre ?? (inv ? `${inv.nombre} ${inv.apellido}` : 'Visitante');
  const cat = v ? categoriaDe(v.categoria) : inv ? CATEGORIAS.INVITADO : categoriaDe(r.tipo);
  const ultimo = v?.recorrido[v.recorrido.length - 1];
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
          invitacionId={v?.invitacion_id ?? inv?.id}
          nombre={nombre}
          categoria={cat}
        />
        <View style={{ flex: 1, gap: space[2] }}>
          <Text variant="h3" level={2} style={{ fontSize: 26, lineHeight: 30 }}>
            {nombre}
          </Text>
        </View>
      </View>
      <TenPresente
        asistencia={v?.asistencia ?? inv?.asistencia ?? []}
        bebidas={v?.preferencias_bebida ?? inv?.preferencias_bebida ?? []}
      />
      <Seccion titulo="Lo que ya sabemos">
        <View style={{ gap: space[3] }}>
          {inv ? (
            <Dato
              etiqueta="Invitación"
              valor={`${dateLabel(inv.fecha)} · ${inv.hora_desde} a ${inv.hora_hasta}`}
              icon="calendar-outline"
            />
          ) : null}
          {inv?.lugar ? <Dato etiqueta="Lugar" valor={inv.lugar} icon="business-outline" /> : null}
          {(v?.punto_encuentro ?? inv?.punto_encuentro) ? (
            <Dato
              etiqueta="Punto de encuentro"
              valor={(v?.punto_encuentro ?? inv?.punto_encuentro) as string}
              icon="location-outline"
            />
          ) : null}
          {v ? <Dato etiqueta="Destino" valor={v.destino} icon="flag-outline" /> : null}
          {v?.acompanante ? (
            <Dato etiqueta="Lo acompaña" valor={v.acompanante.nombre} icon="walk-outline" />
          ) : null}
          {ultimo ? (
            <Dato
              etiqueta="Último paso"
              valor={ultimo.detalle ?? ultimo.tipo}
              icon="time-outline"
            />
          ) : null}
          {inv?.nota ? (
            <Dato etiqueta="Nota del anfitrión" valor={inv.nota} icon="chatbubble-outline" />
          ) : null}
        </View>
      </Seccion>
    </>
  );
}

/** Verify a pass by its code: shows the person's full context and starts or receives the visit. */
export function EscanearScreen() {
  const router = useRouter();
  const { client, usuario } = useSession();
  const avisar = useAvisar();
  const [codigo, setCodigo] = useState('');
  const [falta, setFalta] = useState<string>();
  const [resultado, setResultado] = useState<QrVerificado | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<'verificar' | 'accion' | null>(null);

  const verificar = async () => {
    const payload = codigo.trim();
    if (!payload) return setFalta('Pega o escribe el código del pase.');
    setOcupado('verificar');
    setFallo(null);
    setResultado(null);
    try {
      setResultado(await client.verificarQr(payload));
    } catch (e) {
      setFallo(describir(e).detalle);
    } finally {
      setOcupado(null);
    }
  };

  const irAEnCurso = (v: Visita) => {
    setCodigo('');
    setResultado(null);
    router.navigate({ pathname: '/app/edecan/en-curso', params: { visita: v.id } });
  };

  const actuar = async (accion: () => Promise<Visita>, ok: string) => {
    setOcupado('accion');
    try {
      const v = await accion();
      avisar(ok, 'success');
      irAEnCurso(v);
    } catch (e) {
      avisar(describir(e).detalle, 'error');
    } finally {
      setOcupado(null);
    }
  };

  const r = resultado?.valido ? resultado : null;
  const visita = r?.visita ?? null;
  const iniciar = async () => {
    if (!r || !usuario) throw new Error('sin sesión');
    const nueva = await client.crearVisita(
      r.invitacion
        ? { invitacion_id: r.invitacion.id }
        : { persona_id: r.persona_id ?? undefined, nombre: r.nombre ?? undefined },
    );
    return client.asignarAcompanante(nueva.id, usuario.id);
  };

  return (
    <Frame header={<MobileHeader title="Escanear pase" />}>
      <View style={{ gap: space[3] }}>
        <TextField
          label="Código del pase"
          hint="Pégalo o escríbelo tal como aparece bajo el QR."
          value={codigo}
          onChangeText={(v) => {
            setCodigo(v);
            setFalta(undefined);
          }}
          error={falta}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => void verificar()}
        />
        <Button
          label="Verificar"
          fullWidth
          loading={ocupado === 'verificar'}
          onPress={() => void verificar()}
        />
      </View>

      {fallo ? <Banner kind="error">{fallo}</Banner> : null}
      {resultado && !resultado.valido ? (
        <Banner kind="error" title="Pase no válido">
          {motivoQr(resultado.motivo)}
        </Banner>
      ) : null}

      {r ? (
        <>
          <Contexto r={r} />
          {visita?.estado === 'EN_RELEVO' ? (
            <Button
              label={`Recibir a ${visita.nombre}`}
              size="lg"
              fullWidth
              loading={ocupado === 'accion'}
              onPress={() =>
                void actuar(() => client.recibirVisita(visita.id), `Recibiste a ${visita.nombre}`)
              }
            />
          ) : visita ? (
            visita.estado === 'CERRADA' ? (
              <Banner kind="info">Esta visita ya terminó.</Banner>
            ) : (
              <Button
                label="Abrir visita en curso"
                size="lg"
                variant="secondary"
                fullWidth
                onPress={() => irAEnCurso(visita)}
              />
            )
          ) : (
            <Button
              label="Iniciar visita"
              size="lg"
              fullWidth
              loading={ocupado === 'accion'}
              onPress={() => void actuar(iniciar, 'Visita iniciada')}
            />
          )}
        </>
      ) : null}
    </Frame>
  );
}
