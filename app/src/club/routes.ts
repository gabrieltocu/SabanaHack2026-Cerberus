// Module route tables. Each module adds ONE line here.
import { actividadesRoutes } from './actividades';
import { adminRoutes } from './admin';
import { agendaRoutes } from './agenda';
import type { Route } from './app';
import { confirmacionesRoutes } from './confirmaciones';
import { demoRoutes } from './demo';
import { equipoRoutes } from './equipo';
import { evaluacionesRoutes } from './evaluaciones';
import { eventosRoutes } from './eventos';
import { fotosRoutes } from './fotos';
import { incidenciasRoutes } from './incidencias';
import { integracionRoutes } from './integracion';
import { invitacionesRoutes } from './invitaciones';
import { membresiaRoutes } from './membresia';
import { panelRoutes } from './panel';
import { perfilRoutes } from './perfil';
import { personasRoutes } from './personas';
import { paseRoutes } from './pase';
import { qrRoutes } from './qr';
import { registrosRoutes } from './registros';
import { reservasRoutes } from './reservas';
import { robotRoutes } from './robot';
import { serviciosRoutes } from './servicios';
import { tareasRoutes } from './tareas';
import { telemetriaRoutes } from './telemetria';
import { visitasBotRoutes, visitasRoutes } from './visitas';

export const moduleRoutes: Route[] = [
  ...invitacionesRoutes,
  ...qrRoutes,
  ...fotosRoutes,
  ...registrosRoutes,
  ...eventosRoutes,
  ...confirmacionesRoutes,
  ...robotRoutes,
  ...integracionRoutes,
  ...telemetriaRoutes,
  ...panelRoutes,
  ...perfilRoutes,
  ...personasRoutes,
  ...actividadesRoutes,
  ...serviciosRoutes,
  ...agendaRoutes,
  ...reservasRoutes,
  ...membresiaRoutes,
  ...adminRoutes,
  ...demoRoutes,
  ...visitasRoutes,
  ...visitasBotRoutes,
  ...tareasRoutes,
  ...equipoRoutes,
  ...incidenciasRoutes,
  ...evaluacionesRoutes,
  ...paseRoutes,
];
