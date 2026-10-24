import type { PaseVista, PasoVisita } from '@/club/types';
import {
  bienvenidaDe,
  errorPase,
  estadoVista,
  horarioInvitacion,
  lineaPase,
  pasoTexto,
  pisoDe,
  puntoEncuentro,
  relevo,
  visitaActiva,
} from '@/features/visita/paseVista';
import { pase, visita } from './fixtures';

const paso = (tipo: PasoVisita['tipo']): PasoVisita => ({
  ts: '2026-10-24T15:06:00-05:00',
  tipo,
  actor: 'x2-1',
  detalle: 'interno',
});

describe('estadoVista', () => {
  it('Programada · En el club · En destino · Cerrada', () => {
    expect(estadoVista(pase()).etiqueta).toBe('Programada');
    expect(estadoVista(pase({ visita: visita() })).etiqueta).toBe('En el club');
    expect(estadoVista(pase({ visita: visita({ estado: 'EN_RELEVO' }) })).etiqueta).toBe(
      'En el club',
    );
    expect(estadoVista(pase({ visita: visita({ estado: 'EN_DESTINO' }) })).etiqueta).toBe(
      'En destino',
    );
    expect(estadoVista(pase({ visita: visita({ estado: 'CERRADA' }) })).etiqueta).toBe('Cerrada');
  });

  it('invitación sin visita: llegó, salió, cancelada o vencida', () => {
    const con = (estado: PaseVista['invitacion']['estado']) =>
      estadoVista(pase({ invitacion: { ...pase().invitacion, estado } })).clave;
    expect(con('LLEGO')).toBe('en_club');
    expect(con('SALIO')).toBe('cerrada');
    expect(con('CANCELADA')).toBe('cancelada');
    expect(con('VENCIDA')).toBe('vencida');
  });

  it('visitaActiva ignora la visita cerrada', () => {
    expect(visitaActiva(pase({ visita: visita() }))).not.toBeNull();
    expect(visitaActiva(pase({ visita: visita({ estado: 'CERRADA' }) }))).toBeNull();
    expect(visitaActiva(pase())).toBeNull();
  });
});

describe('relevo', () => {
  it('solicitado → pendiente; aceptado → en camino', () => {
    const r = (ultimo: PasoVisita['tipo']) =>
      relevo(visita({ estado: 'EN_RELEVO', recorrido: [paso('LLEGADA'), paso(ultimo)] }));
    expect(r('RELEVO_SOLICITADO')).toEqual({ tipo: 'pendiente' });
    expect(r('RELEVO_ACEPTADO')).toEqual({ tipo: 'en_camino' });
  });

  it('entrega confirmada → «ahora te acompaña» con el nombre del nuevo acompañante', () => {
    const v = visita({
      acompanante: { tipo: 'HUMANO', id: 'u-mateo', nombre: 'Mateo' },
      recorrido: [paso('RELEVO_ACEPTADO'), paso('ENTREGA_CONFIRMADA'), paso('AYUDA')],
    });
    expect(relevo(v)).toEqual({ tipo: 'nuevo', nombre: 'Mateo' });
  });

  it('llegar al destino cierra el acompañamiento: sin aviso', () => {
    const v = visita({ estado: 'EN_DESTINO', recorrido: [paso('ENTREGA_CONFIRMADA')] });
    expect(relevo(v)).toBeNull();
    expect(relevo(visita({ recorrido: [paso('LLEGADA')] }))).toBeNull();
  });
});

describe('textos', () => {
  it('muestra horario de Bogotá y el punto de encuentro de la visita antes que el de la invitación', () => {
    expect(horarioInvitacion(pase().invitacion)).toMatch(
      /^sáb 24 oct 2026 · 3:00\sp\.\sm\. – 8:00\sp\.\sm\.$/,
    );
    const p = pase({
      invitacion: { ...pase().invitacion, punto_encuentro: 'Lobby' },
      visita: visita({ punto_encuentro: 'Terraza, mesa 4' }),
    });
    expect(puntoEncuentro(p)).toBe('Terraza, mesa 4');
    expect(
      puntoEncuentro(pase({ invitacion: { ...pase().invitacion, punto_encuentro: 'Lobby' } })),
    ).toBe('Lobby');
  });

  it('el recorrido usa texto fijo y no filtra el detalle interno', () => {
    expect(pasoTexto(paso('EN_DESTINO'), 'Terraza')).toBe('Llegaste a Terraza');
    expect(pasoTexto(paso('AYUDA'), 'Terraza')).not.toMatch(/interno/);
  });

  it('piso del destino', () => {
    expect(pisoDe('Salón, piso 2')).toBe('2');
    expect(pisoDe('Terraza')).toBe('1');
  });

  it('errores del pase: qué pasó y qué hacer', () => {
    expect(errorPase('qr_invalido')).toMatchObject({ tipo: 'invalido', reintentar: false });
    expect(errorPase('qr_vencido')).toMatchObject({ tipo: 'vencido', reintentar: false });
    expect(errorPase('sin_conexion')).toMatchObject({ tipo: 'conexion', reintentar: true });
    expect(errorPase('otra')).toMatchObject({ tipo: 'otro', reintentar: true });
  });
});

describe('lineaPase y bienvenidaDe', () => {
  it('cuándo y dónde en una línea: «Hoy» el mismo día, la fecha si no', () => {
    const mismoDia = Date.parse('2026-10-24T09:00:00-05:00');
    const otroDia = Date.parse('2026-10-20T09:00:00-05:00');
    expect(lineaPase(pase(), mismoDia)).toBe('Hoy · 3:00\u00a0p.\u00a0m. · Terraza');
    expect(lineaPase(pase(), otroDia)).toBe('sáb 24 oct 2026 · 3:00\u00a0p.\u00a0m. · Terraza');
  });

  it('el saludo sigue el trato del pase y es neutro si no viene', () => {
    const con = (trato?: string) =>
      bienvenidaDe(pase({ invitacion: { ...pase().invitacion, trato } as never }));
    expect(con('senora')).toBe('Bienvenida');
    expect(con('senor')).toBe('Bienvenido');
    expect(con()).toBe('Te damos la bienvenida');
  });
});
