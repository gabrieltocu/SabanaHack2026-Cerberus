// Pantalla 10: niveles y beneficios (`membresiaInfo`) y solicitud (`solicitarMembresia`). Sin cuenta.
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  Button,
  ErrorState,
  Icon,
  Skeleton,
  Text,
  TextField,
  colors,
  space,
} from '../../design-system';
import { club, ClubApiError, type ClubClient } from '../club/client';
import { Segmentado } from '../club/ui/Segmentado';
import { Cuerpo, Encabezado, FINA, Nota, Seccion } from './ui';

type Niveles = Awaited<ReturnType<ClubClient['membresiaInfo']>>['niveles'];
type Interes = 'individual' | 'familiar' | 'empresarial';

const INTERESES = [
  { clave: 'individual', etiqueta: 'Individual' },
  { clave: 'familiar', etiqueta: 'Familiar' },
  { clave: 'empresarial', etiqueta: 'Empresarial' },
] as const;

const NOMBRE_NIVEL: Record<string, string> = { VIP: 'Socio VIP', REGULAR: 'Socio Regular' };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Membresia({
  client = club,
  nombreInicial = '',
  onBack,
}: {
  client?: ClubClient;
  nombreInicial?: string;
  onBack: () => void;
}) {
  const [niveles, setNiveles] = useState<Niveles | null>(null);
  const [falla, setFalla] = useState(false);
  const [nombre, setNombre] = useState(nombreInicial);
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [interes, setInteres] = useState<Interes>('individual');
  const [mensaje, setMensaje] = useState('');
  const [errores, setErrores] = useState<{ nombre?: string; email?: string }>({});
  const [enviando, setEnviando] = useState(false);
  const [enviada, setEnviada] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

  const [intento, setIntento] = useState(0);
  useEffect(() => {
    let vivo = true;
    client
      .membresiaInfo()
      .then((r) => vivo && setNiveles(r.niveles))
      .catch(() => vivo && setFalla(true));
    return () => {
      vivo = false;
    };
  }, [client, intento]);
  const cargar = () => {
    setFalla(false);
    setIntento((i) => i + 1);
  };

  async function enviar() {
    const e = {
      nombre: nombre.trim().length < 2 ? 'Escribe tu nombre.' : undefined,
      email: EMAIL.test(email.trim()) ? undefined : 'Escribe un correo válido.',
    };
    setErrores(e);
    if (e.nombre || e.email) return;
    setEnviando(true);
    setErrorEnvio(null);
    try {
      await client.solicitarMembresia({
        nombre: nombre.trim(),
        email: email.trim(),
        telefono: telefono.trim() || null,
        interes,
        mensaje: mensaje.trim() || null,
      });
      setEnviada(true);
    } catch (x) {
      setErrorEnvio(x instanceof ClubApiError ? x.detalle : 'No pudimos enviar tu solicitud.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Encabezado titulo="Hazte socio" onBack={onBack} />
      <Cuerpo>
        {enviada ? (
          <View style={{ gap: space[4] }}>
            <Nota tono="success" titulo="Recibimos tu solicitud">
              {`Gracias, ${nombre.trim().split(/\s+/)[0]}. Te escribiremos a ${email.trim()} para contarte los siguientes pasos.`}
            </Nota>
            <Button label="Volver" variant="secondary" size="lg" fullWidth onPress={onBack} />
          </View>
        ) : (
          <>
            <Seccion titulo="Niveles">
              {falla ? (
                <ErrorState title="No pudimos cargar los niveles" onRetry={cargar} />
              ) : !niveles ? (
                <View
                  accessibilityLabel="Cargando niveles"
                  role="progressbar"
                  style={{ gap: space[3] }}
                >
                  <Skeleton height={24} width="40%" />
                  <Skeleton height={60} />
                </View>
              ) : (
                niveles.map((n, i) => (
                  <View
                    key={n.nivel}
                    style={{
                      gap: space[2],
                      paddingBottom: space[4],
                      borderBottomWidth: i === niveles.length - 1 ? 0 : 1,
                      borderBottomColor: FINA,
                    }}
                  >
                    <Text variant="h2">{NOMBRE_NIVEL[n.nivel] ?? n.nivel}</Text>
                    {n.beneficios.map((b) => (
                      <View key={b} style={{ flexDirection: 'row', gap: space[3] }}>
                        <Icon name="checkmark-outline" size={20} color={colors.gold} />
                        <Text style={{ flex: 1, fontSize: 15, lineHeight: 22 }}>{b}</Text>
                      </View>
                    ))}
                    <Text variant="caption" tone="muted">
                      {`Hasta ${n.invitados_activos} invitados a la vez`}
                    </Text>
                  </View>
                ))
              )}
            </Seccion>
            <Seccion titulo="Quiero información">
              <TextField
                label="Nombre"
                required
                value={nombre}
                onChangeText={setNombre}
                autoComplete="name"
                error={errores.nombre}
              />
              <TextField
                label="Correo"
                required
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                error={errores.email}
              />
              <TextField
                label="Teléfono (opcional)"
                value={telefono}
                onChangeText={setTelefono}
                keyboardType="phone-pad"
                autoComplete="tel"
              />
              <View style={{ gap: space[2] }}>
                <Text variant="label">Tipo de membresía</Text>
                <Segmentado opciones={INTERESES} valor={interes} onCambio={setInteres} />
              </View>
              <TextField
                label="Mensaje (opcional)"
                value={mensaje}
                onChangeText={setMensaje}
                multiline
                maxLength={500}
              />
              {errorEnvio ? (
                <Text role="alert" tone="danger" variant="caption">
                  {errorEnvio}
                </Text>
              ) : null}
              <Button
                label="Enviar solicitud"
                size="lg"
                fullWidth
                loading={enviando}
                onPress={enviar}
              />
            </Seccion>
          </>
        )}
      </Cuerpo>
    </>
  );
}
