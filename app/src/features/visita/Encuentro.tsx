// Pantalla 8: encuentro con el anfitrión. El plano existente resalta el destino.
import type { PaseVista } from '../../club/types';
import { destinoDe, pisoDe, puntoEncuentro } from './paseVista';
import { Cuerpo, Datos, Encabezado, type FilaDato } from './ui';
import { PlanoClub } from './VisitaSections';

export function Encuentro({ p }: { p: PaseVista }) {
  const destino = destinoDe(p);
  const punto = puntoEncuentro(p);
  const ubicacion = p.visita?.ubicacion_anfitrion ?? null;
  const filas: FilaDato[] = [
    {
      icon: 'flag-outline',
      etiqueta: 'Punto de encuentro',
      valor: punto ?? 'Lo acuerdas con tu anfitrión',
    },
    ...(ubicacion
      ? [
          {
            icon: 'navigate-outline' as const,
            etiqueta: `${p.anfitrion.nombre} está en`,
            valor: ubicacion,
          },
        ]
      : []),
  ];
  return (
    <>
      <Encabezado titulo={`Encuentro con ${p.anfitrion.nombre}`} subtitulo={destino} />
      <Cuerpo>
        <Datos filas={filas} />
        <PlanoClub destino={destino} piso={pisoDe(destino)} origen="Recepción principal" />
      </Cuerpo>
    </>
  );
}
