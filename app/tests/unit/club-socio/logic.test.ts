import { ClubApiError } from '@/features/club/client';
import { aAviso, aAvisos } from '@/features/club/socio/avisos';
import {
  addDays,
  diaFrase,
  esFecha,
  esHora,
  fechasRapidas,
  formatoHora,
  horaBogota,
  horaDe,
  horasPorDefecto,
  hoyBogota,
} from '@/features/club/socio/dates';
import { describir } from '@/features/club/socio/errors';
import {
  accionLabel,
  cuando,
  cuandoCorto,
  cuandoFrase,
  cuentaActivas,
  esProxima,
  nivelDe,
  porFecha,
  tierLabel,
} from '@/features/club/socio/model';
import { enlaceInvitacion, mensajeInvitacion } from '@/features/club/socio/share';
import { aCuerpo, validar, type FormValues } from '@/features/club/socio/validation';
import { frasesVisita, progresoVisita } from '@/features/club/socio/visitas';
import { ANDRES, SOFIA, evento, inv, visita } from './support';

const ok: FormValues = {
  nombre: 'Laura',
  apellido: 'Díaz',
  trato: 'senora',
  fecha: '2026-10-24',
  hora_desde: '10:00',
  hora_hasta: '12:00',
  lugar: 'Terraza',
  nota: ' ',
  preferencias_bebida: [],
  asistencia: [],
  punto_encuentro: '',
  documento: '',
};

describe('fechas y horas de Bogotá', () => {
  it('convierte un instante a fecha y hora civil', () => {
    const t = new Date('2026-10-24T03:30:00Z'); // 22:30 del 23 en Bogotá
    expect(hoyBogota(t)).toBe('2026-10-23');
    expect(horaBogota(t)).toBe('22:30');
  });

  it('suma días, valida y formatea', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(esFecha('2026-02-31')).toBe(false);
    expect(esFecha('2026-10-24')).toBe(true);
    expect(esHora('24:00')).toBe(false);
    expect(esHora('09:05')).toBe(true);
    expect(formatoHora('1030')).toBe('10:30');
    expect(formatoHora('10')).toBe('10');
    expect(formatoHora('a1b2c3d4e5')).toBe('12:34');
  });

  it('horaDe respeta -05:00 y convierte otros desfases', () => {
    expect(horaDe('2026-10-24T10:02:11-05:00')).toBe('10:02');
    expect(horaDe('2026-10-24T15:02:11Z')).toBe('10:02');
    expect(horaDe('no es fecha')).toBe('');
  });

  it('propone la próxima media hora y dos horas después, sin pasar de medianoche', () => {
    expect(horasPorDefecto(new Date('2026-10-23T20:10:00Z'))).toEqual({
      desde: '15:30',
      hasta: '17:30',
    });
    expect(horasPorDefecto(new Date('2026-10-23T20:40:00Z'))).toEqual({
      desde: '16:00',
      hasta: '18:00',
    });
    const tarde = horasPorDefecto(new Date('2026-10-24T03:50:00Z'));
    expect(tarde.desde < tarde.hasta).toBe(true);
  });

  it('ofrece cinco fechas rápidas', () => {
    const f = fechasRapidas('2026-10-23');
    expect(f.map((x) => x.label).slice(0, 3)).toEqual(['Hoy', 'Mañana', 'dom 25']);
    expect(f).toHaveLength(5);
  });
});

describe('validación del formulario', () => {
  it('acepta un formulario correcto y normaliza el cuerpo', () => {
    expect(validar(ok, '2026-10-23')).toEqual({});
    expect(aCuerpo(ok)).toMatchObject({ nombre: 'Laura', trato: 'senora', nota: null });
  });

  it('exige nombre, apellido, trato y lugar', () => {
    const e = validar({ ...ok, nombre: ' ', apellido: '', trato: '', lugar: '' }, '2026-10-23');
    expect(Object.keys(e).sort()).toEqual(['apellido', 'lugar', 'nombre', 'trato']);
  });

  it('rechaza fecha pasada o mal escrita', () => {
    expect(validar({ ...ok, fecha: '2026-10-22' }, '2026-10-23').fecha).toBeDefined();
    expect(validar({ ...ok, fecha: '24/10' }, '2026-10-23').fecha).toBeDefined();
    expect(validar({ ...ok, fecha: '2026-10-23' }, '2026-10-23').fecha).toBeUndefined();
  });

  it('hasta debe ser posterior a desde', () => {
    expect(validar({ ...ok, hora_hasta: '10:00' }, '2026-10-23').hora_hasta).toMatch(/después/);
    expect(validar({ ...ok, hora_hasta: '09:00' }, '2026-10-23').hora_hasta).toBeDefined();
    expect(validar({ ...ok, hora_desde: '99:00' }, '2026-10-23').hora_desde).toBeDefined();
    expect(validar({ ...ok, hora_hasta: 'x' }, '2026-10-23').hora_hasta).toMatch(/HH:MM/);
  });
});

describe('modelo y avisos', () => {
  it('etiquetas por nivel y límite', () => {
    expect(tierLabel(SOFIA)).toBe('Socia VIP');
    expect(tierLabel(ANDRES)).toBe('Socio regular');
    expect(nivelDe({ nivel: null })).toBe('REGULAR');
    expect(accionLabel(SOFIA)).toBe('Acción empresarial');
    expect(accionLabel({ accion: null })).toBe('');
  });

  it('cuenta activas, próximas y ordena por fecha', () => {
    const l = [
      inv({ id: 'a', estado: 'PROGRAMADA' }),
      inv({ id: 'b', estado: 'LLEGO', fecha: '2026-10-23', hora_desde: '09:00' }),
      inv({ id: 'c', estado: 'SALIO' }),
      inv({ id: 'd', estado: 'CANCELADA' }),
    ];
    expect(cuentaActivas(l)).toBe(2);
    expect(esProxima(l[0]!, '2026-10-23')).toBe(true);
    expect(esProxima(l[2]!, '2026-10-23')).toBe(false);
    expect(esProxima(l[0]!, '2026-10-25')).toBe(false);
    expect([...l].sort(porFecha)[0]!.id).toBe('b');
    expect(cuando(l[0]!)).toBe('sáb 24 oct 2026 · 10:00–12:00');
    expect(cuandoCorto(l[0]!)).toBe('sáb 24 oct · 10:00–12:00');
  });

  it('frases del feed', () => {
    expect(aAviso(evento(), 'senora').texto).toBe(
      'Laura Díaz llegó (10:02). El robot la acompaña a Sala de anfitriones.',
    );
    expect(aAviso(evento(), 'senor').texto).toContain('lo acompaña');
    expect(aAviso(evento({ destino: null, nombre: null })).texto).toBe(
      'Tu invitado llegó (10:02). El robot le acompaña.',
    );
    expect(aAviso(evento({ tipo: 'SALIDA' })).texto).toBe('Laura Díaz salió (10:02).');
    expect(aAviso(evento({ tipo: 'ESCALADO_RECEPCION' })).tono).toBe('alerta');
    const urgente = aAviso(evento({ tipo: 'EMERGENCIA', motivo: 'Alarma en el lounge.' }));
    expect(urgente).toMatchObject({ tono: 'urgente', texto: 'Alarma en el lounge (10:02).' });
    expect(aAviso(evento({ tipo: 'IMPREVISTO', motivo: null })).texto).toContain(
      'aviso importante',
    );
    expect(aAviso(evento({ tipo: 'RARO', motivo: null })).texto).toBe('Laura Díaz (10:02).');
  });

  it('lista los avisos de más nuevo a más viejo con el trato del invitado', () => {
    const l = aAvisos(
      [evento({ seq: 1 }), evento({ seq: 2, persona_id: 'inv-2', nombre: 'Pedro Gómez' })],
      [inv({ persona_id: 'inv-2', trato: 'senor' })],
    );
    expect(l.map((a) => a.seq)).toEqual([2, 1]);
    expect(l[0]!.texto).toContain('lo acompaña');
    expect(l[1]!.texto).toContain('le acompaña');
    expect(aAvisos([], null)).toEqual([]);
  });
});

describe('errores de la API', () => {
  it('usa el detalle de la API y marca sesión y red', () => {
    expect(describir(new ClubApiError(409, 'limite_invitaciones', 'Llegaste a 3.'))).toMatchObject({
      detalle: 'Llegaste a 3.',
      sesion: false,
    });
    expect(describir(new ClubApiError(401, 'token_vencido', 'Entra.'))).toMatchObject({
      sesion: true,
    });
    expect(describir(new ClubApiError(0, 'sin_conexion', ''))).toMatchObject({
      sinConexion: true,
      detalle: expect.stringContaining('Sin conexión'),
    });
    expect(describir(new ClubApiError(500, 'otro', '')).detalle).toBe(
      'No se pudo completar. Intenta de nuevo.',
    );
    expect(describir(new Error('x'))).toMatchObject({ code: 'error', sesion: false });
  });
});

describe('enlace para compartir', () => {
  const i = inv();
  it('lleva el QR firmado como credencial del pase', () => {
    expect(enlaceInvitacion('NCLUB1|invitado|inv-1|Laura Díaz|1|abc', 'https://x.test')).toBe(
      'https://x.test/visita?qr=NCLUB1%7Cinvitado%7Cinv-1%7CLaura%20D%C3%ADaz%7C1%7Cabc',
    );
  });

  it('usa el dominio de producción en nativo', () => {
    expect(enlaceInvitacion('p')).toMatch(/^https:\/\/n-club-five\.vercel\.app\/visita\?qr=/);
  });

  it('el texto es corto y lleva el enlace', () => {
    expect(mensajeInvitacion(i, 'https://x.test/visita?p=1')).toBe(
      'Te invito a N Club el sáb 24 oct 2026 de 10:00 a 12:00. Muestra este pase al robot: https://x.test/visita?p=1',
    );
  });
});

describe('frases cortas de las pantallas', () => {
  it('día en palabras: hoy, mañana, día de la semana y fecha corta', () => {
    expect(diaFrase('2026-10-23', '2026-10-23')).toBe('Hoy');
    expect(diaFrase('2026-10-24', '2026-10-23')).toBe('Mañana');
    expect(diaFrase('2026-10-25', '2026-10-23')).toBe('Domingo');
    expect(diaFrase('2026-10-29', '2026-10-23')).toBe('Jueves');
    expect(diaFrase('2026-10-30', '2026-10-23')).toBe('30 oct');
    expect(diaFrase('2026-10-21', '2026-10-23')).toBe('21 oct');
  });

  it('una línea por invitado; solo cancelada o vencida lo dicen, como palabra', () => {
    const i = inv({ fecha: '2026-10-23', hora_desde: '15:00', lugar: 'Terraza' });
    expect(cuandoFrase(i, '2026-10-23')).toBe('Hoy · 15:00 · Terraza');
    expect(cuandoFrase(i, '2026-10-23', false)).toBe('Hoy · 15:00');
    expect(cuandoFrase({ ...i, estado: 'LLEGO' }, '2026-10-23')).toBe('Hoy · 15:00 · Terraza');
    expect(cuandoFrase({ ...i, estado: 'CANCELADA' }, '2026-10-23')).toBe(
      'Cancelada · Hoy · 15:00 · Terraza',
    );
  });

  it('la visita en curso se dice en dos líneas, con «lo/la» y el artículo del lugar', () => {
    const v = visita({ destino: 'Terraza' });
    expect(frasesVisita(v, false, 'senora')).toEqual({
      titulo: 'Laura Díaz llegó',
      detalle: 'El robot la lleva a la Terraza.',
    });
    expect(frasesVisita({ ...v, destino: 'Lounge VIP' }, true).detalle).toBe(
      'El robot te lleva al Lounge VIP.',
    );
    expect(frasesVisita(v, false, 'senor').detalle).toBe('El robot lo lleva a la Terraza.');
    expect(frasesVisita(v).detalle).toBe('El robot le lleva a la Terraza.');
    expect(
      frasesVisita({
        ...v,
        acompanante: { tipo: 'HUMANO', id: 'u-mateo', nombre: 'Mateo' },
        destino: 'Plaza',
      }).detalle,
    ).toBe('Mateo le lleva a Plaza.');
    expect(frasesVisita({ ...v, estado: 'EN_DESTINO' }).titulo).toBe(
      'Laura Díaz llegó a la Terraza',
    );
    expect(frasesVisita({ ...v, estado: 'CERRADA', fin: '2026-10-23T15:30:00-05:00' }).titulo).toBe(
      'Laura Díaz salió a las 15:30',
    );
  });

  it('progreso dorado: pasos hechos más la mitad del que está en curso', () => {
    expect(progresoVisita(visita())).toBeCloseTo((2 + 0.5) / 3);
    expect(progresoVisita(visita({ estado: 'CERRADA' }))).toBe(1);
  });
});
