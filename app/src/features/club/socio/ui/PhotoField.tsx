import { useState } from 'react';
import { Image, Linking, View } from 'react-native';

import { Banner, Button, Icon, Text, colors, space } from '../../../../design-system';
import { describir } from '../errors';
import { CONSENTIMIENTO, SIN_FOTO_AVISO } from '../model';
import { DOCUMENTO_ANCHO, elegirFoto, type FotoLista } from '../photo';
import { Checkbox } from './Checkbox';

type Origen = 'camara' | 'galeria';

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Wording and shape of each use: a guest's face (default), the socio's own face, an ID card. */
export interface TextosFoto {
  titulo: string;
  ayuda: string;
  vistaPrevia: string;
  consentimiento: string;
  /** Shown while nothing is attached; `null` hides it. */
  sinFoto: string | null;
  camara: 'front' | 'back';
  /** Button names; distinct per use so a screen with two fields stays unambiguous. */
  galeria: string;
  quitar: string;
  /** `tarjeta` is a landscape preview for ID cards. */
  forma: 'cuadrada' | 'tarjeta';
  ancho?: number;
}

export const TEXTOS_INVITADO: TextosFoto = {
  titulo: 'Agregar foto',
  ayuda: 'Con foto, el robot lo reconoce al llegar.',
  vistaPrevia: 'Vista previa de la foto del invitado',
  consentimiento: CONSENTIMIENTO,
  sinFoto: SIN_FOTO_AVISO,
  camara: 'front',
  galeria: 'Galería',
  quitar: 'Quitar foto',
  forma: 'cuadrada',
};

export const TEXTOS_MI_FOTO: TextosFoto = {
  titulo: 'Foto de tu rostro',
  ayuda: 'De frente, con buena luz y sin lentes oscuros.',
  vistaPrevia: 'Vista previa de tu foto',
  consentimiento:
    'Autorizo al club a usar mi foto para que el robot me reconozca. Puedo quitarla cuando quiera',
  sinFoto: null,
  camara: 'front',
  galeria: 'Galería',
  quitar: 'Quitar foto',
  forma: 'cuadrada',
};

export const TEXTOS_CEDULA: TextosFoto = {
  titulo: 'Foto de la cédula (frente)',
  ayuda: 'Que se lea el número. Se guarda cifrada y se borra al terminar la visita.',
  vistaPrevia: 'Vista previa de la cédula',
  consentimiento:
    'El invitado me autorizó a guardar la foto de su cédula para su ingreso; se borra al terminar la visita',
  sinFoto: null,
  camara: 'back',
  galeria: 'Galería (cédula)',
  quitar: 'Quitar cédula',
  forma: 'tarjeta',
  ancho: DOCUMENTO_ANCHO,
};

/**
 * Optional photo: camera or gallery, preview, and the consent checkbox that must be ticked while
 * a photo is attached. For guests, without a photo the robot asks for a QR instead.
 */
export function PhotoField({
  foto,
  onFoto,
  consentimiento,
  onConsentimiento,
  mostrarError = false,
  disabled = false,
  textos = TEXTOS_INVITADO,
}: {
  foto: FotoLista | null;
  onFoto: (f: FotoLista | null) => void;
  consentimiento: boolean;
  onConsentimiento: (v: boolean) => void;
  /** Show the "tick the box" message (after a submit attempt). */
  mostrarError?: boolean;
  disabled?: boolean;
  textos?: TextosFoto;
}) {
  const [ocupado, setOcupado] = useState<Origen | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; ajustes: boolean } | null>(null);

  const elegir = async (origen: Origen) => {
    setOcupado(origen);
    setAviso(null);
    try {
      const r = await elegirFoto(origen, { camara: textos.camara, ancho: textos.ancho });
      if (r.estado === 'ok') {
        onFoto(r.foto);
        onConsentimiento(false); // every new photo needs its own authorization
      } else if (r.estado === 'permiso') {
        setAviso({
          texto:
            'Sin permiso de cámara no podemos tomar la foto. Actívalo en Ajustes o elige una de la galería.',
          ajustes: !r.puedePreguntar,
        });
      }
    } catch (e) {
      setAviso({ texto: describir(e).detalle, ajustes: false });
    } finally {
      setOcupado(null);
    }
  };

  const sinConsentir = !!foto && !consentimiento;
  const botones = (
    <View style={{ flexDirection: 'row', gap: space[3] }}>
      <View style={{ flex: 1 }}>
        <Button
          label={textos.camara === 'back' ? 'Cámara trasera' : 'Cámara frontal'}
          variant="secondary"
          size="sm"
          fullWidth
          loading={ocupado === 'camara'}
          disabled={disabled || ocupado !== null}
          accessibilityHint={
            textos.camara === 'back' ? 'Abre la cámara trasera' : 'Abre la cámara frontal'
          }
          onPress={() => void elegir('camara')}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Button
          label={textos.galeria}
          variant="secondary"
          size="sm"
          fullWidth
          loading={ocupado === 'galeria'}
          disabled={disabled || ocupado !== null}
          onPress={() => void elegir('galeria')}
        />
      </View>
    </View>
  );
  return (
    <View style={{ gap: space[3] }}>
      {foto ? (
        <View style={{ gap: space[3] }}>
          <View style={{ flexDirection: 'row', gap: space[4], alignItems: 'center' }}>
            <Image
              source={{ uri: foto.uri }}
              accessibilityLabel={textos.vistaPrevia}
              style={
                textos.forma === 'tarjeta'
                  ? { width: 132, height: 88, backgroundColor: colors.surfaceMuted }
                  : { width: 88, height: 88, backgroundColor: colors.surfaceMuted }
              }
            />
            <View style={{ flex: 1, gap: space[2] }}>
              <Text variant="caption" tone="muted">
                {kb(foto.bytes)}
              </Text>
              <Button
                label={textos.quitar}
                variant="ghost"
                size="sm"
                disabled={disabled}
                onPress={() => {
                  onFoto(null);
                  onConsentimiento(false);
                }}
              />
            </View>
          </View>
          <Checkbox
            label={textos.consentimiento}
            checked={consentimiento}
            onChange={onConsentimiento}
            disabled={disabled}
            invalid={mostrarError && sinConsentir}
          />
          {sinConsentir ? (
            <Text
              variant="caption"
              tone={mostrarError ? 'danger' : 'muted'}
              role={mostrarError ? 'alert' : undefined}
            >
              Marca la autorización para usar la foto.
            </Text>
          ) : null}
          {botones}
        </View>
      ) : (
        <>
          <View
            style={{
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: colors.border,
              alignItems: 'center',
              gap: space[2],
              padding: space[4],
            }}
          >
            <Icon name="camera-outline" size={24} color={colors.textMuted} />
            <Text variant="label" tone="muted">
              {textos.titulo}
            </Text>
            <Text variant="caption" tone="muted" align="center">
              {textos.ayuda}
            </Text>
            <View style={{ alignSelf: 'stretch', marginTop: space[2] }}>{botones}</View>
          </View>
          {textos.sinFoto ? (
            <Text variant="caption" tone="muted">
              {textos.sinFoto}
            </Text>
          ) : null}
        </>
      )}
      {aviso ? (
        <View style={{ gap: space[2] }}>
          <Banner kind="warning">{aviso.texto}</Banner>
          {aviso.ajustes ? (
            <Button
              label="Abrir ajustes"
              variant="ghost"
              size="sm"
              onPress={() => void Linking.openSettings()}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
