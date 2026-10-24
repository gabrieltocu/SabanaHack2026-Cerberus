import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';

import { Banner, Button, Text, colors, space } from '../../../design-system';
import { ConfirmDialog } from '../../shared/ConfirmDialog';
import { describir, type ErrorInfo } from './errors';
import { useWhileFocused } from './hooks';
import { formularioFoto, type FotoLista } from './photo';
import { useSocio } from './SocioContext';
import { useFoto } from './useFoto';
import { Avatar } from './ui/Avatar';
import { Frame } from './ui/Frame';
import { PhotoField, TEXTOS_MI_FOTO } from './ui/PhotoField';
import { Cargando, Fallo } from './ui/States';

const TEXTO = {
  NINGUNA: 'Sin foto. Con ella, el robot te reconoce al llegar y no te pide el QR.',
  PENDIENTE: 'Procesando. El robot la prepara; esta pantalla se actualiza sola.',
  LISTA: 'Lista. El robot te reconocerá al llegar.',
  RECHAZADA: 'No sirvió para reconocerte. Prueba con otra.',
} as const;

/** Mi foto para reconocimiento: see it, replace it, remove it. Consent travels with each upload. */
export function MyPhotoScreen({ onBack }: { onBack: () => void }) {
  const s = useSocio();
  const { client, usuario, perfil } = s;
  useWhileFocused(s.recargarPerfil);
  const p = perfil.datos;
  const [cambiando, setCambiando] = useState(false);
  const [foto, setFoto] = useState<FotoLista | null>(null);
  const [consentimiento, setConsentimiento] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [quitando, setQuitando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<ErrorInfo | null>(null);

  // The robot processes it in seconds: follow the state while it says PENDIENTE.
  const procesando = p?.foto_estado === 'PENDIENTE';
  const { recargarPerfil } = s;
  useEffect(() => {
    if (!procesando) return;
    const t = setInterval(() => void recargarPerfil(), 3000);
    return () => clearInterval(t);
  }, [procesando, recargarPerfil]);

  const verla = p?.foto_estado === 'LISTA' || p?.foto_estado === 'PENDIENTE';
  const actual = useFoto(client, verla ? '/me/foto' : null, p?.foto_estado);

  if (!p) {
    return (
      <Frame title="Mi foto" onBack={onBack}>
        {perfil.error ? (
          <Fallo error={perfil.error} onRetry={() => void s.recargarPerfil()} />
        ) : (
          <Cargando filas={2} />
        )}
      </Frame>
    );
  }

  const accion = async (fn: () => Promise<void>) => {
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      await fn();
    } catch (e) {
      setError(describir(e));
    } finally {
      setOcupado(false);
    }
  };
  const subir = () =>
    accion(async () => {
      if (!foto) return;
      s.aplicarPerfil(await client.subirMiFoto(await formularioFoto(foto)));
      setCambiando(false);
      setFoto(null);
      setConsentimiento(false);
      setAviso('Foto enviada. El robot la está procesando.');
    });
  const quitar = () =>
    accion(async () => {
      setQuitando(false);
      s.aplicarPerfil(await client.quitarMiFoto());
      setAviso('Foto quitada. El robot te pedirá el QR al llegar.');
    });

  const mostrandoForm = cambiando || p.foto_estado === 'NINGUNA' || p.foto_estado === 'RECHAZADA';
  return (
    <Frame title="Mi foto" onBack={onBack}>
      <View style={{ alignItems: 'center', gap: space[3] }}>
        {actual.uri ? (
          <Image
            source={{ uri: actual.uri }}
            accessibilityLabel="Tu foto para reconocimiento"
            style={{ width: 168, height: 168, backgroundColor: colors.surfaceSoft }}
          />
        ) : (
          <Avatar nombre={usuario.nombre} apellido={usuario.apellido} size={168} anillo />
        )}
        <Text tone="muted" align="center">
          {TEXTO[p.foto_estado]}
        </Text>
      </View>
      {aviso ? <Banner kind="info">{aviso}</Banner> : null}
      {error ? <Banner kind="error">{error.detalle}</Banner> : null}
      {p.foto_estado === 'RECHAZADA' && p.foto_motivo ? (
        <Banner kind="error">{p.foto_motivo}</Banner>
      ) : null}

      {mostrandoForm ? (
        <View style={{ gap: space[3] }}>
          <PhotoField
            textos={TEXTOS_MI_FOTO}
            foto={foto}
            onFoto={setFoto}
            consentimiento={consentimiento}
            onConsentimiento={setConsentimiento}
            mostrarError={false}
            disabled={ocupado}
          />
          <Button
            label="Guardar foto"
            size="lg"
            fullWidth
            loading={ocupado}
            disabled={!foto || !consentimiento}
            onPress={() => void subir()}
          />
          {cambiando ? (
            <Button
              label="Ahora no"
              variant="ghost"
              size="sm"
              disabled={ocupado}
              onPress={() => {
                setCambiando(false);
                setFoto(null);
                setConsentimiento(false);
              }}
            />
          ) : null}
        </View>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          <Button
            label="Cambiar foto"
            variant="secondary"
            disabled={ocupado}
            onPress={() => setCambiando(true)}
          />
          <Button
            label="Quitar foto"
            variant="ghost"
            disabled={ocupado}
            onPress={() => setQuitando(true)}
          />
        </View>
      )}
      {p.foto_estado === 'RECHAZADA' ? null : (
        <Text variant="caption" tone="muted">
          Es opcional. Solo la usa el robot para reconocerte y puedes quitarla cuando quieras.
        </Text>
      )}
      <ConfirmDialog
        visible={quitando}
        danger
        title="¿Quitar tu foto?"
        body="El robot volverá a pedirte el QR al llegar."
        confirmLabel="Sí, quitar"
        cancelLabel="No, mantener"
        onConfirm={() => void quitar()}
        onCancel={() => setQuitando(false)}
      />
    </Frame>
  );
}
