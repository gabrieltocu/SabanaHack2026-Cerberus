import { useEffect, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import {
  Button,
  Icon,
  MobileHeader,
  Text,
  TextField,
  colors,
  space,
  type IconName,
} from '../../../design-system';
import type { Evento } from '../../../club/types';
import { frasesEvidencia, horaBogota, metodoTexto, paraQuien } from '../eventos';
import { Lista } from '../ui/lux';
import { usePantallaActiva } from '../ui/visible';

export interface DetalleProps {
  evento: Evento | null;
  atendidoPor: string | null;
  ocupado: boolean;
  onCerrar: () => void;
  onAtender: (e: Evento) => void;
  onResolver: (e: Evento, nota: string) => void;
}

function Dato({ icono, titulo, texto }: { icono: IconName; titulo: string; texto: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: space[3],
        alignItems: 'flex-start',
        padding: space[3],
      }}
    >
      <Icon name={icono} size={22} color={colors.gold} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="caption" tone="muted">
          {titulo}
        </Text>
        <Text variant="label" selectable>
          {texto}
        </Text>
      </View>
    </View>
  );
}

/** Everything the robot knew about the alert, in plain lines. Sober: no chips, no colours. */
export function DetalleAlerta({
  evento,
  atendidoPor,
  ocupado,
  onCerrar,
  onAtender,
  onResolver,
}: DetalleProps) {
  const [nota, setNota] = useState('');
  const activa = usePantallaActiva();
  useEffect(() => {
    if (!activa || !evento) return;
    const suscripcion = BackHandler.addEventListener('hardwareBackPress', () => {
      onCerrar();
      return true;
    });
    return () => suscripcion.remove();
  }, [activa, evento, onCerrar]);
  if (!evento) return null;
  const e = evento;
  const evidencia = frasesEvidencia(e.evidencia);
  const metodo = metodoTexto(e);
  return (
    <KeyboardAvoidingView
      role="main"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <MobileHeader
        title={e.nombre ?? 'Persona sin identificar'}
        subtitle={`Alerta · ${horaBogota(e.ts)}`}
        onBack={onCerrar}
        backLabel="Volver"
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: space[5] }}
      >
        <Lista>
          <Dato
            icono="alert-circle-outline"
            titulo="Motivo"
            texto={e.motivo || 'El robot pide que alguien revise.'}
          />
          <Dato
            icono="location-outline"
            titulo="Destino"
            texto={e.destino || 'Sin destino indicado'}
          />
          <Dato icono="people-outline" titulo="Para" texto={paraQuien(e) || 'Recepción'} />
          {metodo ? <Dato icono="scan-outline" titulo="Identificado por" texto={metodo} /> : null}
          <Dato
            icono="eye-outline"
            titulo="Evidencia"
            texto={evidencia.length ? evidencia.join(' · ') : 'Sin evidencia adicional'}
          />
          {e.estado !== 'NUEVO' ? (
            <Dato
              icono="person-outline"
              titulo="Atendido por / hora"
              texto={`${atendidoPor ?? 'el concierge'}${e.atendido_at ? ` · ${horaBogota(e.atendido_at)}` : ''}`}
            />
          ) : null}
          {e.nota ? <Dato icono="chatbubble-outline" titulo="Nota" texto={e.nota} /> : null}
        </Lista>
        {e.estado === 'ATENDIDO' ? (
          <TextField
            label="Nota para cerrar"
            hint="Una línea: qué se hizo."
            value={nota}
            onChangeText={setNota}
            multiline
            maxLength={280}
            editable={!ocupado}
          />
        ) : null}
      </ScrollView>
      <View
        style={{
          flexDirection: 'row',
          gap: space[2],
          padding: space[4],
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        {e.estado === 'NUEVO' ? (
          <View style={{ flex: 2 }}>
            <Button label="Atender" fullWidth loading={ocupado} onPress={() => onAtender(e)} />
          </View>
        ) : null}
        {e.estado === 'ATENDIDO' ? (
          <View style={{ flex: 2 }}>
            <Button
              label="Resolver"
              fullWidth
              loading={ocupado}
              disabled={!nota.trim()}
              onPress={() => onResolver(e, nota.trim())}
            />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Button label="Cerrar" variant="secondary" fullWidth onPress={onCerrar} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
