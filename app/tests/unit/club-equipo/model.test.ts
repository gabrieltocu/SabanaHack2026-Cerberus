import type { Tarea } from '@/club/types';
import {
  minutosDesde,
  motivoQr,
  ordenarTareas,
  tareasAbiertas,
  tareasAceptadas,
  textoEspera,
  visitaTerminada,
  etiquetaAsistencia,
} from '@/features/club/edecan/model';
import {
  aActividad,
  deActividad,
  porHora,
  validarActividad,
  validarServicio,
  type FormActividad,
  type FormServicio,
} from '@/features/club/personal/model';
import { tarea } from './fake';

describe('tareas del edecán', () => {
  const t = (id: string, p: Partial<Tarea>) => tarea({ id, ...p });

  it('ordena urgente, alta y normal; a igual prioridad, la que espera más', () => {
    const orden = ordenarTareas([
      t('a', { prioridad: 'normal', creada_at: '2026-10-24T10:00:00-05:00' }),
      t('b', { prioridad: 'urgente', creada_at: '2026-10-24T10:05:00-05:00' }),
      t('c', { prioridad: 'alta' }),
      t('d', { prioridad: 'urgente', creada_at: '2026-10-24T10:01:00-05:00' }),
    ]).map((x) => x.id);
    expect(orden).toEqual(['d', 'b', 'c', 'a']);
  });

  it('abiertas: mías o de cualquiera, sin las que ya rechacé ni las aceptadas', () => {
    const lista = [
      t('1', {}),
      t('2', { asignada_a: 'u-mateo' }),
      t('3', { asignada_a: 'u-otra' }),
      t('4', { rechazos: ['u-mateo'] }),
      t('5', { estado: 'ACEPTADA', asignada_a: 'u-mateo' }),
    ];
    expect(tareasAbiertas(lista, 'u-mateo').map((x) => x.id)).toEqual(['1', '2']);
    expect(tareasAceptadas(lista, 'u-mateo').map((x) => x.id)).toEqual(['5']);
  });

  it('dice cuánto lleva esperando', () => {
    expect(textoEspera(0)).toBe('Ahora');
    expect(textoEspera(7)).toBe('Hace 7 min');
    expect(textoEspera(60)).toBe('Hace 1 h');
    expect(textoEspera(70)).toBe('Hace 1 h 10 min');
    const ahora = Date.parse('2026-10-24T15:00:00-05:00');
    expect(minutosDesde('2026-10-24T14:53:30-05:00', ahora)).toBe(6);
    expect(minutosDesde('2026-10-24T15:10:00-05:00', ahora)).toBe(0);
    expect(minutosDesde('basura', ahora)).toBe(0);
  });

  it('palabras de asistencia, visita terminada y QR rechazado', () => {
    expect(etiquetaAsistencia('silla_ruedas')).toBe('Silla de ruedas');
    expect(etiquetaAsistencia('otra_cosa')).toBe('Otra cosa');
    expect(visitaTerminada({ estado: 'EN_DESTINO' })).toBe(true);
    expect(visitaTerminada({ estado: 'ACOMPANANDO' })).toBe(false);
    expect(motivoQr('vencido')).toMatch(/venció/);
    expect(motivoQr('firma_invalida')).toMatch(/auténtico/);
    expect(motivoQr(null)).toMatch(/No pudimos validar/);
  });
});

describe('formularios del personal', () => {
  const servicio: FormServicio = {
    empresa: 'Mantenimientos Andinos',
    nombre: 'Laura',
    apellido: 'Pérez',
    trato: 'senora',
    trabajo: 'Revisión de aires',
    solicitado_por: 'Marta Ruiz',
    responsable: 'Carlos Mendoza',
    area: 'Operaciones',
    fecha: '2026-10-24',
    hora_desde: '08:00',
    hora_hasta: '12:00',
    punto_presentacion: 'Recepción',
  };

  it('acepta un servicio completo y señala cada campo que falta', () => {
    expect(validarServicio(servicio)).toEqual({});
    const e = validarServicio({
      ...servicio,
      empresa: ' ',
      trato: null,
      fecha: '24/10',
      hora_hasta: '07:00',
    });
    expect(Object.keys(e).sort()).toEqual(['empresa', 'fecha', 'hora_hasta', 'trato']);
    expect(e.hora_hasta).toMatch(/después/);
  });

  const act: FormActividad = {
    nombre: 'Cata de vinos',
    descripcion: '',
    lugar: 'Salón Principal',
    fecha: '2026-10-24',
    hora_desde: '19:00',
    hora_hasta: '21:00',
    cupo: '',
    robot_puede_ofrecer: true,
  };

  it('valida la actividad y arma el cuerpo con cupo y descripción opcionales', () => {
    expect(validarActividad(act)).toEqual({});
    expect(validarActividad({ ...act, cupo: '0' }).cupo).toBeDefined();
    expect(validarActividad({ ...act, hora_desde: '25:00' }).hora_desde).toBeDefined();
    expect(aActividad(act)).toMatchObject({
      descripcion: null,
      cupo: null,
      robot_puede_ofrecer: true,
    });
    expect(aActividad({ ...act, cupo: '12', descripcion: ' Maridaje ' })).toMatchObject({
      descripcion: 'Maridaje',
      cupo: 12,
    });
    const guardada = { ...aActividad({ ...act, cupo: '12' }), id: 'a1', inscritos: [] };
    expect(deActividad(guardada).cupo).toBe('12');
    expect(deActividad({ ...guardada, cupo: null, descripcion: null })).toMatchObject({
      cupo: '',
      descripcion: '',
    });
  });

  it('ordena por hora de inicio', () => {
    expect(
      porHora([{ hora_desde: '10:00' }, { hora_desde: '08:30' }]).map((x) => x.hora_desde),
    ).toEqual(['08:30', '10:00']);
  });
});
