import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import {
  Banner,
  Button,
  Icon,
  Logo,
  Text,
  TextField,
  Touchable,
  colors,
  fonts,
  layout,
  space,
  useInsets,
} from '../../design-system';
import { ClubApiError } from './client';
import { CUENTAS_DEMO, DEMO_CLAVE } from './demo';
import { rutaPorRol, useSession } from './session';
import { IconoBoton } from './socio/ui/Frame';

/** The contract's error codes, said the way a person would. */
export function mensajeDeLogin(e: unknown): string {
  const code = e instanceof ClubApiError ? e.code : '';
  switch (code) {
    case 'credenciales_invalidas':
      return 'Correo o clave incorrectos. Revisa los datos e intenta de nuevo.';
    case 'demasiados_intentos':
      return 'Demasiados intentos. Espera unos minutos antes de probar otra vez.';
    case 'sin_conexion':
      return 'Sin conexión. Revisa tu red e intenta de nuevo.';
    default:
      return 'No pudimos iniciar sesión. Intenta de nuevo en un momento.';
  }
}

function Formulario({
  initialEmail = '',
  initialError = null,
}: {
  initialEmail?: string;
  initialError?: string | null;
}) {
  const { login } = useSession();
  const router = useRouter();
  const insets = useInsets();
  const [email, setEmail] = useState(initialEmail);
  const [clave, setClave] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [rapido, setRapido] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [faltan, setFaltan] = useState<{ email?: string; clave?: string }>({});

  async function entrar() {
    const f = {
      email: email.trim() ? undefined : 'Escribe tu correo.',
      clave: clave ? undefined : 'Escribe tu clave.',
    };
    setFaltan(f);
    if (f.email || f.clave || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const signedIn = await login(email, clave);
      router.replace(rutaPorRol(signedIn.rol));
    } catch (e) {
      setError(mensajeDeLogin(e));
      setEnviando(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: 'center',
          paddingTop: insets.top + space[6],
          paddingBottom: insets.bottom + space[6],
          paddingHorizontal: layout.gutter.mobile,
        }}
      >
        <View
          role="main"
          style={{ flexGrow: 1, width: '100%', maxWidth: 360, justifyContent: 'space-between' }}
        >
          <View
            style={{
              flexGrow: 1,
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: space[7],
            }}
          >
            <Text
              variant="title"
              style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}
            >
              Entrar a N Club
            </Text>
            <Logo size={112} wordmark="stack" />
          </View>

          <View style={{ gap: space[5] }}>
            {error ? <Banner kind="error">{error}</Banner> : null}
            <TextField
              label="Correo"
              value={email}
              onChangeText={setEmail}
              error={faltan.email}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              editable={!enviando}
            />
            <View>
              <TextField
                label="Clave"
                value={clave}
                onChangeText={setClave}
                error={faltan.clave}
                secureTextEntry={!verClave}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={() => void entrar()}
                editable={!enviando}
              />
              <View style={{ position: 'absolute', top: 30, right: 2 }}>
                <IconoBoton
                  icon={verClave ? 'eye-off-outline' : 'eye-outline'}
                  label={verClave ? 'Ocultar clave' : 'Mostrar clave'}
                  onPress={() => setVerClave((v) => !v)}
                />
              </View>
            </View>
            <Button
              label="Entrar"
              size="lg"
              fullWidth
              loading={enviando}
              onPress={() => void entrar()}
            />

            <Touchable
              label="Acceso rápido"
              accessibilityState={{ expanded: rapido }}
              onPress={() => setRapido((r) => !r)}
              style={{
                minHeight: 44,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: space[1],
              }}
            >
              <Text variant="caption" tone="muted" style={{ fontFamily: fonts.bodyMedium }}>
                Acceso rápido
              </Text>
              <Icon
                name={rapido ? 'chevron-up-outline' : 'chevron-down-outline'}
                size={16}
                color={colors.textMuted}
              />
            </Touchable>
            {rapido ? (
              <View style={{ gap: space[2] }}>
                {CUENTAS_DEMO.map((c) => (
                  <Touchable
                    key={c.email}
                    label={`Usar ${c.email}`}
                    onPress={() => {
                      setEmail(c.email);
                      setClave(DEMO_CLAVE);
                      setFaltan({});
                      setError(null);
                    }}
                    style={({ pressed }) => ({
                      minHeight: 56,
                      justifyContent: 'center',
                      paddingHorizontal: space[3],
                      paddingVertical: space[2],
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: pressed ? colors.surfaceSoft : colors.surface,
                    })}
                  >
                    <Text variant="label">{c.email}</Text>
                    <Text variant="caption" tone="muted">
                      {c.quien}
                    </Text>
                  </Touchable>
                ))}
                <Text variant="caption" tone="muted">
                  Clave de todas: {DEMO_CLAVE}
                </Text>
                <Button
                  label="Elegir perfil"
                  variant="ghost"
                  fullWidth
                  onPress={() => router.push('/demo')}
                />
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** `/entrar`: the seal, email, password and one black button. Nothing else. */
export function LoginScreen() {
  const router = useRouter();
  const { cuenta: rawCuenta } = useLocalSearchParams<{ cuenta?: string | string[] }>();
  const email = Array.isArray(rawCuenta) ? rawCuenta[0] : rawCuenta;
  const cuenta =
    email && (CUENTAS_DEMO.some((c) => c.email === email) || email === 'admin@nclub.demo')
      ? email
      : undefined;
  const { estado, usuario, login, logout } = useSession();
  const [failure, setFailure] = useState<{ cuenta: string; message: string }>();
  const attempted = useRef<string | undefined>(undefined);
  const autoError = failure?.cuenta === cuenta ? failure?.message : undefined;

  useEffect(() => {
    if (estado === 'cargando') return;
    if (autoError) return;
    if (cuenta) {
      if (attempted.current === cuenta) return;
      attempted.current = cuenta;
      void (async () => {
        try {
          if (usuario && usuario.email !== cuenta) await logout();
          const signedIn = usuario?.email === cuenta ? usuario : await login(cuenta, DEMO_CLAVE);
          router.replace(rutaPorRol(signedIn.rol));
        } catch (e) {
          setFailure({ cuenta, message: mensajeDeLogin(e) });
        }
      })();
    } else if (estado === 'activo' && usuario) {
      router.replace(rutaPorRol(usuario.rol));
    }
  }, [cuenta, estado, usuario, login, logout, router, autoError]);

  if (cuenta && !autoError) {
    const name =
      CUENTAS_DEMO.find((c) => c.email === cuenta)?.quien.split(' · ')[0] ?? 'Administración';
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: space[5],
          padding: space[5],
          backgroundColor: colors.bg,
        }}
      >
        <Logo size={72} wordmark="stack" />
        <Text variant="body" align="center" role="status" accessibilityLiveRegion="polite">
          Entrando como {name}…
        </Text>
      </View>
    );
  }

  return <Formulario initialEmail={cuenta} initialError={autoError} />;
}
