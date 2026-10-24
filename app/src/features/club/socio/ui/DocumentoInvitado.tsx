import { useState } from 'react';
import { Image, View } from 'react-native';

import { Banner, Button, Text, TextField, colors, space } from '../../../../design-system';
import type { Invitacion } from '../../../../club/types';
import type { ClubClient } from '../../client';
import { describir, type ErrorInfo } from '../errors';
import { formularioFoto, type FotoLista } from '../photo';
import { useFoto } from '../useFoto';
import { Subtitulo } from './Frame';
import { PhotoField, TEXTOS_CEDULA } from './PhotoField';

/**
 * Cédula of the guest: number, photo of the front (when stored) and, while the invitation has
 * not been used, replace or remove. The photo is kept encrypted and deleted when the visit ends.
 */
export function DocumentoInvitado({
  client,
  inv,
  editable,
  onInvitacion,
}: {
  client: ClubClient;
  inv: Invitacion;
  editable: boolean;
  onInvitacion: (nueva: Invitacion) => void;
}) {
  const guardada = inv.documento_foto === 'GUARDADA';
  const [version, setVersion] = useState(0);
  const imagen = useFoto(client, guardada ? `/invitaciones/${inv.id}/documento` : null, version);
  const [cambiando, setCambiando] = useState(false);
  const [foto, setFoto] = useState<FotoLista | null>(null);
  const [consentimiento, setConsentimiento] = useState(false);
  const [numero, setNumero] = useState(inv.documento ?? '');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

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
      onInvitacion(
        await client.subirDocumento(inv.id, await formularioFoto(foto, { numero: numero.trim() })),
      );
      setVersion((n) => n + 1);
      setCambiando(false);
      setFoto(null);
      setConsentimiento(false);
      setAviso('Cédula guardada. Se borra al terminar la visita.');
    });
  const quitar = () =>
    accion(async () => {
      onInvitacion(await client.quitarDocumento(inv.id));
      setVersion((n) => n + 1);
      setAviso('Foto de la cédula quitada.');
    });

  const formulario = editable && (cambiando || !guardada);
  const numeroMal = !!foto && !/^[A-Za-z0-9]{5,15}$/.test(numero.trim());
  return (
    <View style={{ gap: space[4] }}>
      <Subtitulo>Cédula</Subtitulo>
      <Text tone="muted">
        {inv.documento
          ? `Número ${inv.documento}${guardada ? ' · foto guardada' : ''}.`
          : 'Sin número. Si lo tienes a mano, agiliza el ingreso.'}
      </Text>
      {guardada && imagen.uri ? (
        <Image
          source={{ uri: imagen.uri }}
          accessibilityLabel="Foto del frente de la cédula del invitado"
          style={{
            width: '100%',
            aspectRatio: 1.6,
            backgroundColor: colors.surfaceMuted,
          }}
          resizeMode="contain"
        />
      ) : null}
      {guardada && imagen.estado === 'error' ? (
        <Banner kind="warning">No pudimos mostrar la foto de la cédula. Intenta de nuevo.</Banner>
      ) : null}
      {aviso ? <Banner kind="info">{aviso}</Banner> : null}
      {error ? <Banner kind="error">{error.detalle}</Banner> : null}
      {!editable ? (
        <Text variant="caption" tone="muted">
          La cédula no se puede cambiar una vez que el invitado llegó. Se borra al terminar la
          visita.
        </Text>
      ) : null}

      {formulario ? (
        <View style={{ gap: space[3] }}>
          <TextField
            label="Número de cédula"
            value={numero}
            editable={!ocupado}
            autoComplete="off"
            maxLength={15}
            onChangeText={(t) => setNumero(t.replace(/[^A-Za-z0-9]/g, ''))}
            error={numeroMal ? 'Revisa el número: solo letras y números, de 5 a 15.' : undefined}
          />
          <PhotoField
            textos={TEXTOS_CEDULA}
            foto={foto}
            onFoto={setFoto}
            consentimiento={consentimiento}
            onConsentimiento={setConsentimiento}
            disabled={ocupado}
          />
          <Button
            label="Guardar cédula"
            fullWidth
            loading={ocupado}
            disabled={!foto || !consentimiento || numeroMal || !numero.trim()}
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
      ) : null}
      {editable && guardada && !cambiando ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          <Button
            label="Reemplazar foto"
            variant="secondary"
            size="sm"
            disabled={ocupado}
            onPress={() => setCambiando(true)}
          />
          <Button
            label="Quitar foto"
            variant="ghost"
            size="sm"
            disabled={ocupado}
            onPress={() => void quitar()}
          />
        </View>
      ) : null}
    </View>
  );
}
