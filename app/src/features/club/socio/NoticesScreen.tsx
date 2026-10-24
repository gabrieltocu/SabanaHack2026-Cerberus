import { aAvisos } from './avisos';
import { POLL_MS, useWhileFocused } from './hooks';
import { useSocio } from './SocioContext';
import { TarjetaConfirmacion } from './ui/ConfirmationCard';
import { Frame } from './ui/Frame';
import { Grupo } from './ui/Fila';
import { FilaAviso } from './ui/Rows';
import { ListaCarga, Vacio } from './ui/States';

/** Avisos: confirmations waiting for an answer, then the feed (newest first), refreshed every 3 s while visible. */
export function NoticesScreen({ onBack }: { onBack?: () => void }) {
  const s = useSocio();
  const { avisos, tarjetas, invitaciones } = s;
  // The invitations tell us "lo/la"; load them once if Inicio was not opened first.
  useWhileFocused(() => {
    if (!invitaciones.datos && !invitaciones.cargando) void s.recargarInvitaciones();
  });
  useWhileFocused(s.actualizarAvisos, POLL_MS);

  const lista = aAvisos(avisos.eventos, invitaciones.datos);
  const hayDatos = avisos.cargado && !(avisos.error && !avisos.eventos.length && !tarjetas.length);
  return (
    <Frame title="Avisos" onBack={onBack}>
      {tarjetas.map((t) => (
        <TarjetaConfirmacion
          key={t.confirmacion.id}
          tarjeta={t}
          onResponder={(aprueba) => void s.responder(t.confirmacion, aprueba)}
        />
      ))}
      <ListaCarga
        datos={hayDatos ? lista : null}
        cargando={!avisos.cargado}
        error={avisos.error}
        onRetry={() => void s.actualizarAvisos()}
        vacio={
          tarjetas.length ? null : (
            <Vacio
              icon="notifications-outline"
              texto="Sin avisos por ahora. Te avisamos cuando llegue tu invitado."
            />
          )
        }
      >
        {(items) => (
          <Grupo>
            {items.map((a, n) => (
              <FilaAviso key={a.seq} aviso={a} primero={n === 0} />
            ))}
          </Grupo>
        )}
      </ListaCarga>
    </Frame>
  );
}
