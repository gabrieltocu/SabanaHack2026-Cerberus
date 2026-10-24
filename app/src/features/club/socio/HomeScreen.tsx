import { View } from 'react-native';

import { Button, Logo, Text, colors, layout, space, useInsets } from '../../../design-system';
import { hoyBogota } from './dates';
import { esProxima, porFecha } from './model';
import { useWhileFocused, POLL_MS } from './hooks';
import { useSocio } from './SocioContext';
import { activa, esDeHoy, esPropia } from './visitas';
import { TarjetaConfirmacion } from './ui/ConfirmationCard';
import { Grupo } from './ui/Fila';
import { Frame, IconoBoton } from './ui/Frame';
import { FilaInvitacion, Seccion } from './ui/Rows';
import { ListaCarga, Vacio } from './ui/States';
import { FilaVisita, TarjetaVisita } from './ui/VisitaRows';

export type HomeScreenProps = {
  onInvitar: () => void;
  onAbrir: (id: string) => void;
  onVerAvisos: () => void;
  onVerQr: () => void;
  onVerVisita: (id: string) => void;
};

/**
 * Inicio, with little on it: the greeting, the visit in progress as one sentence with its gold
 * bar, the next guests and "Invitar". Pase and avisos are one tap away in the header; the rest
 * (agenda, membership, notices) lives in its own tab or in Perfil.
 */
export function HomeScreen({
  onInvitar,
  onAbrir,
  onVerAvisos,
  onVerQr,
  onVerVisita,
}: HomeScreenProps) {
  const s = useSocio();
  const insets = useInsets();
  const { usuario, invitaciones, visitas, tarjetas, porResponder } = s;
  useWhileFocused(s.recargarInvitaciones);
  useWhileFocused(s.recargarVisitas, 5000);
  useWhileFocused(s.recargarPerfil);
  useWhileFocused(s.actualizarAvisos, POLL_MS);

  const hoy = hoyBogota(s.ahora());
  const lasVisitas = visitas.datos ?? [];
  // Mine: active, or closed today and not yet rated. Guests': active ones only.
  const mia = lasVisitas.find(
    (v) => esPropia(v, usuario) && (activa(v) || (esDeHoy(v, hoy) && !s.evaluadas.has(v.id))),
  );
  const invitadosAdentro = lasVisitas.filter((v) => !esPropia(v, usuario) && activa(v));
  // One highlighted visit: mine first, otherwise the first guest who is inside.
  const destacada = mia ?? invitadosAdentro[0];
  const otrosAdentro = invitadosAdentro.filter((v) => v !== destacada);
  const tratoDe = (invitacionId: string | null) =>
    invitaciones.datos?.find((i) => i.id === invitacionId)?.trato;
  // The first card still waiting; otherwise the last answered one, so its confirmation stays readable.
  const pendiente =
    tarjetas.find((t) => !t.respuesta || ['ENVIANDO', 'ERROR'].includes(t.respuesta.estado)) ??
    tarjetas[0];

  const header = (
    <View
      style={{
        paddingTop: insets.top + space[3],
        paddingHorizontal: layout.gutter.mobile,
        paddingBottom: space[2],
        gap: space[4],
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottomWidth: 1,
          borderBottomColor: colors.gold,
          paddingBottom: space[2],
        }}
      >
        <Logo size={28} wordmark="row" />
        <View style={{ flexDirection: 'row', marginRight: -space[3] }}>
          <IconoBoton icon="qr-code-outline" label="Mi pase" onPress={onVerQr} />
          <View>
            <IconoBoton
              icon="notifications-outline"
              label={porResponder ? `Avisos, ${porResponder} por confirmar` : 'Avisos'}
              onPress={onVerAvisos}
            />
            {porResponder ? (
              <View
                pointerEvents="none"
                aria-hidden
                style={{
                  position: 'absolute',
                  top: 9,
                  right: 9,
                  width: 8,
                  height: 8,
                  backgroundColor: colors.danger,
                }}
              />
            ) : null}
          </View>
        </View>
      </View>
      <Text variant="h1" level={1} numberOfLines={1}>
        {`Hola, ${usuario.nombre}`}
      </Text>
    </View>
  );

  return (
    <Frame header={header}>
      {pendiente ? (
        <TarjetaConfirmacion
          tarjeta={pendiente}
          onResponder={(aprueba) => void s.responder(pendiente.confirmacion, aprueba)}
        />
      ) : null}

      {destacada ? (
        <TarjetaVisita
          v={destacada}
          propia={destacada === mia}
          trato={tratoDe(destacada.invitacion_id)}
          onPress={() => onVerVisita(destacada.id)}
        />
      ) : null}

      {otrosAdentro.length ? (
        <Seccion titulo="En el club">
          <Grupo>
            {otrosAdentro.map((v, i) => (
              <FilaVisita key={v.id} v={v} primero={i === 0} onPress={() => onVerVisita(v.id)} />
            ))}
          </Grupo>
        </Seccion>
      ) : null}

      <Seccion titulo="Próximas">
        <ListaCarga
          datos={
            invitaciones.datos
              ? invitaciones.datos
                  // Already in the club: they are the highlighted visit or listed under "En el club".
                  .filter(
                    (i) =>
                      esProxima(i, hoy) && !invitadosAdentro.some((v) => v.invitacion_id === i.id),
                  )
                  .sort(porFecha)
                  .slice(0, 3)
              : null
          }
          cargando={invitaciones.cargando}
          error={invitaciones.error}
          onRetry={() => void s.recargarInvitaciones()}
          filas={2}
          vacio={<Vacio texto="Aún no tienes invitados. Toca Invitar." />}
        >
          {(lista) => (
            <Grupo>
              {lista.map((i, n) => (
                <FilaInvitacion
                  key={i.id}
                  inv={i}
                  hoy={hoy}
                  conLugar={false}
                  primero={n === 0}
                  onPress={() => onAbrir(i.id)}
                />
              ))}
            </Grupo>
          )}
        </ListaCarga>
      </Seccion>

      <Button label="Invitar" size="lg" fullWidth onPress={onInvitar} />
    </Frame>
  );
}
