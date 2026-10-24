// Scale, stacking and grouping logic of the panel charts, and the charts that draw it.
import { render, screen } from '@testing-library/react-native';
import '@testing-library/react-native/matchers';

import {
  acumulado,
  alturasApiladas,
  distribucion,
  indiceMaximo,
  marcas,
  maximoEscala,
  promedio,
  proporciones,
  puntosLinea,
  suma,
} from '../../../src/features/club/panel/escalas';
import {
  BarraApilada100,
  BarrasHorizontales,
  Columnas,
  Linea,
  SERIE,
} from '../../../src/features/club/panel/Charts';
import {
  cuentaInvitaciones,
  partesEquipo,
  partesEventos,
  partesInvitaciones,
  partesVisitas,
} from '../../../src/features/club/panel/partes';
import {
  contar,
  horaEtiqueta,
  minutosEntre,
  ORDEN_ESTADO_VISITA,
} from '../../../src/features/club/panel/format';
import type { MiembroEquipo, Visita } from '../../../src/club/types';

describe('escala del eje', () => {
  it('el tope son 4 pasos iguales de tamaño redondo, nunca menor que el dato y al menos 4', () => {
    expect(maximoEscala(0)).toBe(4);
    expect(maximoEscala(3)).toBe(4);
    expect(maximoEscala(4)).toBe(4);
    expect(maximoEscala(5)).toBe(8);
    expect(maximoEscala(9)).toBe(12);
    expect(maximoEscala(20)).toBe(20);
    expect(maximoEscala(21)).toBe(40);
    expect(maximoEscala(56)).toBe(80);
    expect(maximoEscala(66)).toBe(80);
    expect(maximoEscala(101)).toBe(200);
  });

  it('cada etiqueta es un número entero y la última es el tope (sin valores intermedios inventados)', async () => {
    for (let dato = 0; dato <= 300; dato++) {
      const max = maximoEscala(dato);
      const m = marcas(max);
      expect(m).toHaveLength(5);
      expect(m[0]).toBe(0);
      expect(m[4]).toBe(max);
      expect(m.every(Number.isInteger)).toBe(true);
      expect(max).toBeGreaterThanOrEqual(dato);
      // Not wasteful: the axis never goes past twice the data (once it is above the minimum of 4).
      if (dato >= 4) expect(max).toBeLessThanOrEqual(dato * 2);
      // Evenly spaced: the same step between every pair of gridlines.
      expect(new Set(m.slice(1).map((v, i) => v - m[i]!)).size).toBe(1);
    }
  });
});

describe('barras apiladas', () => {
  it('las alturas de los segmentos suman la altura del total en la misma escala', async () => {
    const alturas = alturasApiladas([3, 2, 1], 8, 80);
    expect(alturas).toEqual([30, 20, 10]);
    expect(suma(alturas)).toBe((suma([3, 2, 1]) / 8) * 80);
  });

  it('un tope de 0 o valores negativos no producen alturas rotas', async () => {
    expect(alturasApiladas([1, 2], 0, 80)).toEqual([0, 0]);
    expect(alturasApiladas([-3, 4], 8, 80)).toEqual([0, 40]);
  });

  it('la columna más alta ocupa todo el eje cuando el total es el tope', async () => {
    const max = maximoEscala(8);
    expect(suma(alturasApiladas([5, 2, 1], max, 100))).toBe(100);
  });

  it('indiceMaximo da la primera hora pico y -1 si no hay nada que destacar', async () => {
    expect(indiceMaximo([1, 4, 4, 2])).toBe(1);
    expect(indiceMaximo([0, 0, 0])).toBe(-1);
    expect(indiceMaximo([])).toBe(-1);
  });

  it('el acumulado nunca baja y termina en el total', async () => {
    expect(acumulado([1, 0, 3, 2])).toEqual([1, 1, 4, 6]);
    expect(acumulado([])).toEqual([]);
  });
});

describe('proporciones y distribución', () => {
  it('las partes de una barra al 100 % suman 1; sin datos suman 0', async () => {
    expect(suma(proporciones([2, 1, 1]))).toBeCloseTo(1);
    expect(proporciones([2, 1, 1])).toEqual([0.5, 0.25, 0.25]);
    expect(proporciones([0, 0])).toEqual([0, 0]);
  });

  it('distribución de notas del 1 al 5 ignora lo que cae fuera', async () => {
    expect(distribucion([5, 5, 4, 1, 9, 0])).toEqual([1, 0, 0, 1, 2]);
    expect(suma(distribucion([5, 4, 3, 3]))).toBe(4);
    expect(promedio([5, 4, 3])).toBe(4);
    expect(promedio([])).toBeNull();
  });

  it('los puntos de la línea quedan dentro de la caja y el 0 va en el piso', async () => {
    const p = puntosLinea([0, 2, 4], 100, 50, 4);
    expect(p).toEqual([
      { x: 0, y: 50 },
      { x: 50, y: 25 },
      { x: 100, y: 0 },
    ]);
    expect(puntosLinea([3], 100, 50, 0)).toEqual([{ x: 50, y: 50 }]);
  });
});

describe('partes de las barras', () => {
  const visita = (estado: Visita['estado']) => ({ estado }) as Visita;
  it('cuenta cada estado y los que no llegaron valen 0', async () => {
    const v = partesVisitas([visita('ACOMPANANDO'), visita('ACOMPANANDO'), visita('CERRADA')]);
    expect(v.map((p) => [p.id, p.valor])).toEqual([
      ['EN_RECEPCION', 0],
      ['ACOMPANANDO', 2],
      ['EN_RELEVO', 0],
      ['EN_DESTINO', 0],
      ['CERRADA', 1],
    ]);
    expect(suma(v.map((p) => p.valor))).toBe(3);
    expect(contar(['A', 'B', 'A'], ['A', 'B', 'C'])).toEqual([2, 1, 0]);
  });

  it('el relevo y los disponibles son los únicos en oro; nada de arcoíris', async () => {
    const v = partesVisitas([]);
    expect(v.filter((p) => p.color === SERIE.oro).map((p) => p.id)).toEqual(['EN_RELEVO']);
    const e = partesEquipo([
      { estado: 'DISPONIBLE' },
      { estado: 'ACOMPANANDO' },
    ] as MiembroEquipo[]);
    expect(e.map((p) => p.id)).toEqual(['ACOMPANANDO', 'DISPONIBLE']);
    expect(e.find((p) => p.id === 'DISPONIBLE')?.color).toBe(SERIE.oro);
  });

  it('eventos e invitaciones suman lo que llegó de la API', async () => {
    expect(suma(partesEventos(['NUEVO', 'NUEVO', 'RESUELTO']).map((p) => p.valor))).toBe(3);
    const inv = partesInvitaciones(cuentaInvitaciones(['LLEGO', 'LLEGO', 'SALIO']));
    expect(inv.map((p) => p.valor)).toEqual([0, 2, 1, 0, 0]);
    expect(partesInvitaciones({ PROGRAMADA: 4 }).map((p) => p.valor)).toEqual([4, 0, 0, 0, 0]);
  });

  it('cada estado de visita conocido tiene su parte', async () => {
    expect(partesVisitas([]).map((p) => p.id)).toEqual([...ORDEN_ESTADO_VISITA]);
  });
});

describe('ayudas de formato', () => {
  it('etiqueta de hora cada dos horas y minutos entre dos instantes', async () => {
    expect([6, 7, 8].map(horaEtiqueta)).toEqual(['06', '', '08']);
    expect(minutosEntre('2026-10-24T14:00:00-05:00', '2026-10-24T14:40:00-05:00')).toBe(40);
    expect(minutosEntre('2026-10-24T14:00:00-05:00', null)).toBeNull();
    expect(minutosEntre('2026-10-24T14:40:00-05:00', '2026-10-24T14:00:00-05:00')).toBeNull();
  });
});

describe('gráficas dibujadas', () => {
  it('Columnas apiladas rotula el eje con valores alcanzados y el total de la hora pico', async () => {
    await render(
      <Columnas
        columnas={[
          { id: '9', etiqueta: '09', valores: [3, 1, 0] },
          { id: '10', etiqueta: '10', valores: [4, 2, 2] },
        ]}
        series={[
          { texto: 'Socios', color: SERIE.tinta },
          { texto: 'Invitados', color: SERIE.gris },
          { texto: 'Personal', color: SERIE.claro },
        ]}
        modo="apilado"
        max={maximoEscala(8)}
        etiquetaX={(i) => ['09', '10'][i]!}
        destacar={1}
        descripcion="Flujo de prueba"
      />,
    );
    expect(screen.getByLabelText('Flujo de prueba')).toBeOnTheScreen();
    for (const t of ['0', '2', '4', '6', '8'])
      expect(screen.getAllByText(t).length).toBeGreaterThan(0);
    // 8 is both the top of the axis and the total of the peak hour.
    expect(screen.getAllByText('8')).toHaveLength(2);
    expect(screen.getByText('09')).toBeOnTheScreen();
    expect(screen.queryByText('3')).toBeNull();
  });

  it('Columnas agrupadas escriben el número sobre cada barra', async () => {
    await render(
      <Columnas
        columnas={[{ id: '5', etiqueta: '5', valores: [7, 3] }]}
        series={[
          { texto: 'Robot', color: SERIE.tinta },
          { texto: 'Club', color: SERIE.claro },
        ]}
        modo="agrupado"
        max={8}
        etiquetaX={() => '5'}
        valores
        descripcion="Notas"
      />,
    );
    expect(screen.getByText('7')).toBeOnTheScreen();
    expect(screen.getByText('3')).toBeOnTheScreen();
  });

  it('Barras horizontales: todas las filas con su valor y la escala 0 a tope', async () => {
    await render(
      <BarrasHorizontales
        filas={[
          { id: 'a', etiqueta: 'VIP', valor: 12 },
          { id: 'b', etiqueta: 'Regular', valor: 4 },
        ]}
        max={maximoEscala(12)}
        destacar={0}
        descripcion="Categorías"
      />,
    );
    expect(screen.getByLabelText('Categorías')).toBeOnTheScreen();
    for (const t of ['VIP', 'Regular', '12', '4', '0', '3', '6', '9']) {
      expect(screen.getAllByText(t).length).toBeGreaterThan(0);
    }
  });

  it('Barra al 100 %: escribe el conteo solo en los tramos anchos', async () => {
    await render(
      <BarraApilada100
        partes={[
          { id: 'a', texto: 'A', valor: 19, color: SERIE.tinta },
          { id: 'b', texto: 'B', valor: 1, color: SERIE.claro },
          { id: 'c', texto: 'C', valor: 0, color: SERIE.gris },
        ]}
        descripcion="Estados"
      />,
    );
    expect(screen.getByText('19')).toBeOnTheScreen();
    expect(screen.queryByText('1')).toBeNull();
    expect(screen.getByText('100 %')).toBeOnTheScreen();
  });

  it('Línea: etiqueta el último valor y no se rompe sin datos', async () => {
    await render(
      <Linea
        valores={[0, 2, 5]}
        max={maximoEscala(5)}
        etiquetaX={(i) => `h${i}`}
        descripcion="Acumulado"
      />,
    );
    expect(screen.getByText('5')).toBeOnTheScreen();
    expect(screen.getByText('h2')).toBeOnTheScreen();
    await render(<Linea valores={[]} max={4} etiquetaX={() => ''} descripcion="Vacía" />);
    expect(screen.getByLabelText('Vacía')).toBeOnTheScreen();
  });
});
