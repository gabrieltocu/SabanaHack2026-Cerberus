import { DEMO_CLAVE as SEED_CLAVE } from '../../../src/club/seed';
import {
  CATEGORIAS,
  categoriaDe,
  coloresAvatar,
  iniciales,
} from '../../../src/features/club/categorias';
import { CUENTAS_DEMO, DEMO_CLAVE } from '../../../src/features/club/demo';
import { rutaPorRol } from '../../../src/features/club/session';
import {
  agruparEsperados,
  atendidoPorTexto,
  diaBogota,
  frasesEvidencia,
  haceCuanto,
  historial,
  horaBogota,
  llegadasDelDia,
  metodoTexto,
  ordenarAlertas,
  paraQuien,
  pendientes,
  resumenEvidencia,
  unirEventos,
} from '../../../src/features/club/eventos';
import { evento, invitacion } from './fake-club';

test('la clave de demostración copiada coincide con la del seed', () => {
  expect(DEMO_CLAVE).toBe(SEED_CLAVE);
  expect(CUENTAS_DEMO.map((c) => c.email)).toEqual([
    'sofia@nclub.demo',
    'andres@nclub.demo',
    'camila@nclub.demo',
    'concierge@nclub.demo',
    'admin@nclub.demo',
    'edecan@nclub.demo',
    'personal@nclub.demo',
  ]);
});

test('hora y día se leen en Bogotá (UTC-5)', () => {
  expect(horaBogota('2026-10-24T14:05:00-05:00')).toBe('14:05');
  expect(horaBogota('2026-10-24T19:05:00Z')).toBe('14:05');
  expect(horaBogota('basura')).toBe('--:--');
  expect(diaBogota('2026-10-25T02:00:00Z')).toBe('2026-10-24');
  expect(diaBogota(Date.parse('2026-10-24T23:30:00-05:00'))).toBe('2026-10-24');
});

test('unirEventos reemplaza por id y ordena por seq', () => {
  const a = evento({ seq: 1 });
  const b = evento({ seq: 2 });
  const b2 = { ...b, estado: 'ATENDIDO' as const };
  expect(unirEventos([a, b], [])).toEqual([a, b]);
  expect(unirEventos([b, a], [b2, evento({ seq: 3 })]).map((e) => [e.seq, e.estado])).toEqual([
    [1, 'NUEVO'],
    [2, 'ATENDIDO'],
    [3, 'NUEVO'],
  ]);
});

test('alertas: urgentes arriba, luego atención, luego info; atendidas al final; resueltas fuera', () => {
  const lista = [
    evento({ seq: 1, severidad: 'info' }),
    evento({ seq: 2, severidad: 'urgente' }),
    evento({ seq: 3, severidad: 'atencion' }),
    evento({ seq: 4, severidad: 'urgente', estado: 'ATENDIDO' }),
    evento({ seq: 5, severidad: 'urgente', estado: 'RESUELTO' }),
    evento({ seq: 6, tipo: 'LLEGADA', requiere_atencion: false }),
    evento({ seq: 7, severidad: 'atencion' }),
  ];
  expect(ordenarAlertas(lista).map((e) => e.seq)).toEqual([2, 7, 3, 1, 4]);
  expect(historial(lista).map((e) => e.seq)).toEqual([5]);
  expect(pendientes(lista)).toBe(4);
});

test('llegadas del día: solo LLEGADA de hoy, la más reciente primero', () => {
  const lista = [
    evento({ seq: 1, tipo: 'LLEGADA', ts: '2026-10-24T09:00:00-05:00' }),
    evento({ seq: 2, tipo: 'LLEGADA', ts: '2026-10-23T09:00:00-05:00' }),
    evento({ seq: 3, tipo: 'ALERTA' }),
    evento({ seq: 4, tipo: 'LLEGADA', ts: '2026-10-24T11:00:00-05:00' }),
  ];
  expect(llegadasDelDia(lista, '2026-10-24').map((e) => e.seq)).toEqual([4, 1]);
});

test('«para:» deja fuera al anfitrión y nombra a quien se avisó', () => {
  expect(paraQuien({ avisar: ['anfitrion'] })).toBeNull();
  expect(paraQuien({ avisar: ['anfitrion', 'concierge'] })).toBe('Concierge');
  expect(paraQuien({ avisar: ['anfitrion:u-sofia', 'u-sofia', 'Seguridad'] })).toBe(
    'Sofía Restrepo, Seguridad',
  );
  expect(paraQuien({ avisar: [] })).toBeNull();
});

test('evidencia en frases simples', () => {
  const ev = { metodo: 'rostro', veredicto: 'no_coincide', reintentos: 2, pase: 'vencido' };
  expect(frasesEvidencia(ev)).toEqual(['rostro no coincide', '2 reintentos', 'pase vencido']);
  expect(resumenEvidencia(ev)).toBe('Rostro no coincide · 2 reintentos · pase vencido');
  expect(frasesEvidencia({ reintentos: 1, confianza: 0.426 })).toEqual([
    '1 reintento',
    'parecido 43 %',
  ]);
  expect(frasesEvidencia({ cos: 1.7, pase: 'valido', veredicto: 'raro_nuevo' })).toEqual([
    'raro nuevo',
    'pase vigente',
    'parecido 100 %',
  ]);
  expect(frasesEvidencia({ reintentos: 0, pase: 'misterio' })).toEqual(['pase misterio']);
  expect(frasesEvidencia(null)).toEqual([]);
  expect(resumenEvidencia(null)).toBe('');
});

test('método de identificación y quién atendió', () => {
  expect(metodoTexto({ evidencia: { metodo: 'qr' } })).toBe('Pase QR');
  expect(metodoTexto({ evidencia: { metodo: 'huella' } })).toBe('Huella');
  expect(metodoTexto({ evidencia: null })).toBeNull();
  expect(atendidoPorTexto({ atendido_por: 'u-natalia' }, 'u-natalia')).toBe('ti');
  expect(atendidoPorTexto({ atendido_por: 'u-natalia' }, 'otro')).toBe('Natalia Ríos');
  expect(atendidoPorTexto({ atendido_por: 'u-x' })).toBe('el concierge');
  expect(atendidoPorTexto({ atendido_por: null })).toBeNull();
});

test('esperados: agrupados por socio, VIP primero, sin canceladas, por hora', () => {
  const g = agruparEsperados([
    invitacion({ id: '1', anfitrion_id: 'u-andres', hora_desde: '15:00' }),
    invitacion({ id: '2', anfitrion_id: 'u-sofia', hora_desde: '18:00' }),
    invitacion({ id: '3', anfitrion_id: 'u-andres', hora_desde: '09:00' }),
    invitacion({ id: '4', anfitrion_id: 'u-sofia', estado: 'CANCELADA' }),
    invitacion({ id: '5', anfitrion_id: 'u-desconocido' }),
  ]);
  expect(g.map((x) => [x.nombre, x.nivel, x.items.map((i) => i.id)])).toEqual([
    ['Sofía Restrepo', 'VIP', ['2']],
    ['Andrés Mejía', 'REGULAR', ['3', '1']],
    ['Socio', null, ['5']],
  ]);
});

test('hace cuánto', () => {
  expect(haceCuanto(1000, 3000)).toBe('ahora mismo');
  expect(haceCuanto(0, 12_000)).toBe('hace 12 s');
  expect(haceCuanto(0, 180_000)).toBe('hace 3 min');
  expect(haceCuanto(0, 7_300_000)).toBe('hace 2 h');
  expect(haceCuanto(9000, 0)).toBe('ahora mismo');
});

test('categorías: alias en español e inglés, escalamiento rojo, iniciales', () => {
  expect(categoriaDe('VIP').kind).toBe('VIP');
  expect(categoriaDe('guest').kind).toBe('GUEST');
  expect(categoriaDe('Invitado').kind).toBe('GUEST');
  expect(categoriaDe('staff').kind).toBe('STAFF');
  expect(categoriaDe('Externo').kind).toBe('EXTERNAL');
  expect(categoriaDe('REGULAR', 'ESCALAMIENTO').kind).toBe('ESCALATION');
  expect(categoriaDe(null).etiqueta).toBe('Sin categoría');
  expect(categoriaDe('???').clave).toBe('OTRA');
  expect(coloresAvatar(CATEGORIAS.VIP).fg).toMatch(/^#/);
  expect(coloresAvatar(CATEGORIAS.OTRA).bg).toMatch(/^#/);
  expect(iniciales('Natalia Ríos')).toBe('NR');
  expect(iniciales('Ana')).toBe('A');
  expect(iniciales(' ')).toBe('');
  expect(iniciales(null)).toBe('');
});

test('cada rol aterriza en su pantalla de inicio', () => {
  expect(rutaPorRol('ADMIN')).toBe('/app/panel');
  expect(rutaPorRol('CONCIERGE')).toBe('/app/concierge');
  expect(rutaPorRol('SOCIO')).toBe('/app/socio');
});
