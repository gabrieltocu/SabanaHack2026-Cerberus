import { useState } from 'react';

import { Banner, Button } from '../../../design-system';
import { hoyBogota } from './dates';
import { describir, type ErrorInfo } from './errors';
import { formularioFoto } from './photo';
import { useSocio } from './SocioContext';
import { useInvitationForm } from './useInvitationForm';
import { aCuerpo } from './validation';
import { Frame } from './ui/Frame';
import { InvitationFields } from './ui/InvitationFields';

/**
 * Nueva invitación. The guest's photo and the cédula (number + photo of its front) are optional;
 * each photo needs its authorization box ticked or the button stays disabled. If an upload fails
 * after the invitation exists, the detail screen opens with the reason so the socio can retry.
 */
export function NewInvitationScreen({
  onBack,
  onCreada,
}: {
  onBack: () => void;
  onCreada: (id: string, fotoError?: string) => void;
}) {
  const { client, ahora, recargarInvitaciones } = useSocio();
  const hoy = hoyBogota(ahora());
  const form = useInvitationForm(hoy, ahora());
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [arriba, setArriba] = useState(0);

  const enviar = async () => {
    if (!form.intentar()) {
      setArriba((n) => n + 1);
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const inv = await client.crearInvitacion(aCuerpo(form.values));
      // The invitation exists; a failed upload only opens the detail with its reason.
      const fallos: string[] = [];
      if (form.foto) {
        try {
          await client.subirFoto(inv.id, await formularioFoto(form.foto));
        } catch (e) {
          fallos.push(describir(e).detalle);
        }
      }
      if (form.fotoDoc) {
        try {
          await client.subirDocumento(
            inv.id,
            await formularioFoto(form.fotoDoc, { numero: form.values.documento.trim() }),
          );
        } catch (e) {
          fallos.push(`Cédula: ${describir(e).detalle}`);
        }
      }
      const fotoError = fallos.length ? fallos.join(' ') : undefined;
      void recargarInvitaciones();
      onCreada(inv.id, fotoError);
    } catch (e) {
      setError(describir(e));
      setArriba((n) => n + 1);
    } finally {
      setEnviando(false);
    }
  };

  const hayErrores = form.intentos > 0 && Object.keys(form.errores).length > 0;
  return (
    <Frame
      title="Nueva invitación"
      onBack={onBack}
      scrollTopKey={arriba}
      footer={
        <Button
          label="Enviar invitación"
          size="lg"
          fullWidth
          loading={enviando}
          disabled={form.falta}
          onPress={() => void enviar()}
        />
      }
    >
      {error ? <Banner kind="error">{error.detalle}</Banner> : null}
      {hayErrores ? <Banner kind="error">Revisa los campos marcados.</Banner> : null}
      <InvitationFields form={form} hoy={hoy} conFoto disabled={enviando} />
    </Frame>
  );
}
