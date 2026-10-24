// `/visita?qr=<payload>`: el QR firmado es la credencial. Elige la pantalla según la pestaña.
import { View } from 'react-native';
import { Acompanamiento } from './Acompanamiento';
import { Actividades } from './Actividades';
import { Encuentro } from './Encuentro';
import { Evaluacion } from './Evaluacion';
import { MiPase, MiVisita } from './MiVisita';
import { usePase } from './PaseContext';
import { PerfilInvitado } from './PerfilInvitado';
import { errorPase, estadoVista, ERRORES_DEL_PASE } from './paseVista';
import { Cargando, ErrorDelPase, Nota } from './ui';

export type ApiSection = 'inicio' | 'pase' | 'mapa' | 'actividades' | 'acompanamiento' | 'perfil';

export type IrA = {
  /** Cambia de pantalla conservando el enlace (`qr`). */
  ir: (s: ApiSection | 'membresia') => void;
  onExit?: () => void;
};

export function VisitaApi({ section, ir, onExit }: { section: ApiSection } & IrA) {
  const { datos: p, error, qr, recargar } = usePase();
  if (!p || (error && ERRORES_DEL_PASE.includes(error.code))) {
    if (!p && !error) return <Cargando />;
    const e = errorPase(error?.code ?? 'error');
    return (
      <View role="main" style={{ flex: 1, minHeight: 0 }}>
        <ErrorDelPase
          titulo={e.titulo}
          texto={e.texto}
          onReintentar={e.reintentar ? recargar : undefined}
        />
      </View>
    );
  }
  const cerrada = estadoVista(p).clave === 'cerrada';
  return (
    <View role="main" style={{ flex: 1, minHeight: 0 }}>
      {error ? (
        <View style={{ padding: 12 }}>
          <Nota tono="warning" titulo="Sin conexión">
            Mostramos lo último que supimos. Volvemos a intentar solos.
          </Nota>
        </View>
      ) : null}
      {section === 'mapa' ? (
        <Encuentro p={p} />
      ) : section === 'actividades' ? (
        <Actividades p={p} />
      ) : section === 'acompanamiento' ? (
        <Acompanamiento p={p} qr={qr} />
      ) : section === 'perfil' ? (
        <PerfilInvitado p={p} onMembresia={() => ir('membresia')} onExit={onExit} />
      ) : section === 'pase' ? (
        <MiPase p={p} qr={qr} onBack={() => ir('inicio')} />
      ) : cerrada ? (
        <Evaluacion p={p} qr={qr} onMembresia={() => ir('membresia')} />
      ) : (
        <MiVisita
          p={p}
          qr={qr}
          onAcompanamiento={() => ir('acompanamiento')}
          onPase={() => ir('pase')}
        />
      )}
    </View>
  );
}
