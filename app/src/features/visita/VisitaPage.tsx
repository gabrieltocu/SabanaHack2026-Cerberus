import { useEffect, useState } from 'react';
import type { VisitaNavigation } from './VisitaSections';
import { VisitaScreen } from './VisitaScreen';
import type { VisitaParams } from './pase';
import { resolverVisita } from './visita';

const TICK_MS = 30_000;

/** `/visita`: lee el enlace y deja que el reloj venza el pase sin recargar la página. */
export function VisitaPage({ params, ...navigation }: { params: VisitaParams } & VisitaNavigation) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  return <VisitaScreen visita={resolverVisita(params, now)} now={now} {...navigation} />;
}
