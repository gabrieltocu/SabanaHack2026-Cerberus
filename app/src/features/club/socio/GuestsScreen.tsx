import { useState } from 'react';

import { hoyBogota } from './dates';
import { useWhileFocused } from './hooks';
import { esProxima, porFecha } from './model';
import { useSocio } from './SocioContext';
import { activa, esDeHoy, esPropia } from './visitas';
import { Grupo } from './ui/Fila';
import { Frame, IconoBoton } from './ui/Frame';
import { Pestanas } from './ui/Opciones';
import { FilaInvitacion } from './ui/Rows';
import { ListaCarga, Vacio } from './ui/States';
import { FilaVisita } from './ui/VisitaRows';

const PESTANAS = [
  { value: 'proximas', label: 'Próximas' },
  { value: 'historial', label: 'Historial' },
];

/** Invitados: Próximas (who is in the club now, then upcoming) and Historial; "+" invites. */
export function GuestsScreen({
  onInvitar,
  onAbrir,
  onAbrirVisita,
}: {
  onInvitar: () => void;
  onAbrir: (id: string) => void;
  onAbrirVisita: (id: string) => void;
}) {
  const s = useSocio();
  const { invitaciones, usuario, visitas } = s;
  const [pestana, setPestana] = useState('proximas');
  useWhileFocused(s.recargarInvitaciones);
  useWhileFocused(s.recargarVisitas, 5000);
  const hoy = hoyBogota(s.ahora());
  // Guests in the club, plus the ones that left today (still to rate).
  const enElClub = (visitas.datos ?? []).filter(
    (v) => !esPropia(v, usuario) && (activa(v) || (esDeHoy(v, hoy) && !s.evaluadas.has(v.id))),
  );
  return (
    <Frame
      title="Invitados"
      right={<IconoBoton icon="add-outline" label="Invitar" onPress={onInvitar} />}
      onRefresh={() => {
        void s.recargarInvitaciones();
        void s.recargarVisitas();
      }}
      refreshing={invitaciones.cargando && !!invitaciones.datos}
    >
      <Pestanas label="Invitados" options={PESTANAS} value={pestana} onChange={setPestana} />
      <ListaCarga
        datos={invitaciones.datos}
        cargando={invitaciones.cargando}
        error={invitaciones.error}
        onRetry={() => void s.recargarInvitaciones()}
        vacio={<Vacio texto="Aún no tienes invitados. Toca Invitar." />}
      >
        {(todas) => {
          const proximas = todas.filter((i) => esProxima(i, hoy)).sort(porFecha);
          const anteriores = todas.filter((i) => !esProxima(i, hoy)).sort((a, b) => porFecha(b, a));
          // Guests already in the club appear once, as their visit.
          const dentroIds = new Set(enElClub.map((v) => v.invitacion_id));
          const lista =
            pestana === 'proximas' ? proximas.filter((i) => !dentroIds.has(i.id)) : anteriores;
          const dentro = pestana === 'proximas' ? enElClub : [];
          return dentro.length + lista.length ? (
            <Grupo>
              {dentro.map((v, n) => (
                <FilaVisita
                  key={v.id}
                  v={v}
                  primero={n === 0}
                  onPress={() => onAbrirVisita(v.id)}
                />
              ))}
              {lista.map((i, n) => (
                <FilaInvitacion
                  key={i.id}
                  inv={i}
                  hoy={hoy}
                  primero={dentro.length === 0 && n === 0}
                  onPress={() => onAbrir(i.id)}
                />
              ))}
            </Grupo>
          ) : (
            <Vacio
              texto={
                pestana === 'proximas'
                  ? 'No tienes invitaciones próximas.'
                  : 'Aún no hay historial.'
              }
            />
          );
        }}
      </ListaCarga>
    </Frame>
  );
}
