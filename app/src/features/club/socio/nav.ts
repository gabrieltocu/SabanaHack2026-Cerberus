/** Sub-screens of Perfil, one route: `/app/socio/cuenta/<seccion>`. */
export const SECCIONES = ['info', 'foto', 'bebidas', 'asistencia', 'membresia'] as const;
export type Seccion = (typeof SECCIONES)[number];

export const RUTAS = {
  inicio: '/app/socio',
  invitados: '/app/socio/invitados',
  avisos: '/app/socio/avisos',
  actividades: '/app/socio/actividades',
  qr: '/app/socio/mi-qr',
  perfil: '/app/socio/perfil',
  nueva: '/app/socio/nueva',
  entrar: '/entrar',
  cuenta: (seccion: Seccion) => ({
    pathname: '/app/socio/cuenta/[seccion]',
    params: { seccion },
  }),
  actividad: (id: string, fecha: string) => ({
    pathname: '/app/socio/actividad/[id]',
    params: { id, fecha },
  }),
  visita: (id: string) => ({ pathname: '/app/socio/visita/[id]', params: { id } }),
  detalle: (id: string, params?: Record<string, string>) => ({
    pathname: '/app/socio/invitacion/[id]',
    params: { id, ...params },
  }),
} as const;

/** Back, or `a` when the screen was opened directly (deep link, reload). */
export function volver(
  router: { canGoBack(): boolean; back(): void; replace(href: string): void },
  a: string = RUTAS.inicio,
) {
  if (router.canGoBack()) router.back();
  else router.replace(a);
}
