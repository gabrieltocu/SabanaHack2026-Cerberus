import { act, fireEvent, render, screen } from '@testing-library/react-native';
import '@testing-library/react-native/matchers';
import { type VisitaParams } from '@/features/visita/pase';
import { resolverVisita } from '@/features/visita/visita';
import { VisitaPage } from '@/features/visita/VisitaPage';
import { VisitaScreen } from '@/features/visita/VisitaScreen';

const t = (hhmm: string) => Date.parse(`2026-10-24T${hhmm}:00-05:00`);
const NOW = t('15:20');
const FIRMA = 'a1b2c3d4e5f6a7b8c9d0';
const payload = (tipo: string, hhmm: string, nombre = 'Ana María Gómez') =>
  `NCLUB1|${tipo}|P-1|${nombre}|${t(hhmm) / 1000}|${FIRMA}`;

const pantalla = (params: VisitaParams, now = NOW) =>
  render(<VisitaScreen visita={resolverVisita(params, now)} now={now} />);

describe('resolverVisita', () => {
  it('sin `p` arma el ejemplo del tipo pedido (invitado por omisión)', () => {
    expect(resolverVisita({}, NOW)).toMatchObject({ tipo: 'invitado', ejemplo: true });
    expect(resolverVisita({ tipo: 'externo' }, NOW)).toMatchObject({
      tipo: 'externo',
      ejemplo: true,
    });
    expect(resolverVisita({ tipo: 'otro' }, NOW)).toMatchObject({ tipo: 'invitado' });
  });

  it('con `p` manda el tipo firmado; socio/personal o un `p` roto son inválidos', () => {
    const v = resolverVisita({ tipo: 'invitado', p: payload('externo', '18:00') }, NOW);
    expect(v).toMatchObject({ clase: 'pase', tipo: 'externo', ejemplo: false });
    expect(resolverVisita({ p: payload('socio', '18:00') }, NOW)).toEqual({ clase: 'invalido' });
    expect(resolverVisita({ p: payload('personal', '18:00') }, NOW)).toEqual({ clase: 'invalido' });
    expect(resolverVisita({ p: 'basura' }, NOW)).toEqual({ clase: 'invalido' });
  });

  it('acota los textos del enlace y descarta un género raro', () => {
    const v = resolverVisita(
      { p: payload('invitado', '18:00'), lugar: ` ${'x'.repeat(200)} `, genero: 'z' },
      NOW,
    );
    expect(v.clase === 'pase' && v.datos.lugar).toHaveLength(80);
    expect(v.clase === 'pase' && v.datos.genero).toBeUndefined();
  });
});

describe('invitado', () => {
  const params: VisitaParams = { tipo: 'invitado' };

  it('muestra el ejemplo: saludo, QR y una línea con cuándo y dónde', async () => {
    await pantalla(params);
    expect(screen.getByRole('heading', { name: /^Bienvenida,\s+Laura$/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: /Código QR de tu pase de visita/ })).toBeTruthy();
    expect(screen.getByText('Hoy · hasta 8:00 p. m. · Sala de anfitriones')).toBeTruthy();
    expect(screen.getByText('Muéstralo al robot en la entrada')).toBeTruthy();
    // Poca información: sin chips, textos de ánimo, pasos ni tarjetas de datos.
    expect(screen.queryByLabelText('Invitada')).toBeNull();
    expect(screen.queryByText('Pase de visita')).toBeNull();
    expect(screen.queryByText('Te invita Sofía')).toBeNull();
    expect(screen.queryByText('Qué esperar al llegar')).toBeNull();
  });

  it('el QR codifica el payload exacto del enlace', async () => {
    const p = payload('invitado', '18:00', 'Laura Díaz');
    await pantalla({ p });
    expect(screen.getByRole('img', { name: /Código QR de tu pase de visita/ })).toBeTruthy();
    // El payload no se imprime en pantalla: solo viaja dentro del símbolo.
    expect(screen.queryByText(new RegExp(FIRMA))).toBeNull();
    expect(resolverVisita({ p }, NOW)).toMatchObject({ payload: p });
  });

  it('el género del enlace elige el saludo', async () => {
    await pantalla({ p: payload('invitado', '18:00'), genero: 'f' });
    expect(screen.getByRole('heading', { name: /^Bienvenida,\s+Ana$/ })).toBeTruthy();
  });

  it('«Cómo llegar» abre la hoja con la entrada y las recomendaciones, y se cierra', async () => {
    await pantalla(params);
    expect(screen.queryByText('Recomendaciones')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Cómo llegar' }));
    expect(screen.getByText('N Club · Entrada principal')).toBeTruthy();
    expect(screen.getByText('Recomendaciones')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByText('Recomendaciones')).toBeNull();
  });

  it('sin género ni lugar usa un trato neutro y solo la hora', async () => {
    await pantalla({ p: payload('invitado', '18:00', 'Pat Soto') });
    expect(screen.getByRole('heading', { name: /^Te damos la bienvenida,\s+Pat$/ })).toBeTruthy();
    expect(screen.getByText('Hoy · hasta 6:00 p. m.')).toBeTruthy();
  });

  it('vencido: sin QR, con el aviso y a quién pedir otro', async () => {
    await pantalla({ p: payload('invitado', '14:00'), genero: 'm' });
    expect(screen.getByText('Pase vencido')).toBeTruthy();
    expect(
      screen.getByText('Este pase venció a las 2:00 p. m. Pide uno nuevo a tu anfitrión.'),
    ).toBeTruthy();
    expect(screen.queryByRole('img', { name: /Código QR/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cómo llegar' })).toBeNull();
  });

  it('un pase de otro día dice la fecha en la línea', async () => {
    const p = `NCLUB1|invitado|P-1|Ana Ruiz|${Date.parse('2026-10-26T12:00:00-05:00') / 1000}|${FIRMA}`;
    await pantalla({ p });
    expect(screen.getByText('lun 26 oct 2026 · hasta 12:00 p. m.')).toBeTruthy();
  });
});

describe('trabajador externo', () => {
  it('muestra el saludo, el QR y los datos de la orden de servicio', async () => {
    await pantalla({ tipo: 'externo' });
    expect(screen.getByRole('heading', { name: /^Bienvenido,\s+Luis$/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: /Código QR de tu pase de acceso/ })).toBeTruthy();
    expect(screen.getByText('OT-1042')).toBeTruthy();
    expect(screen.getByText('Climatec')).toBeTruthy();
    expect(screen.getByText('Mantenimiento del aire acondicionado')).toBeTruthy();
    expect(screen.getByText('Jorge')).toBeTruthy();
    expect(screen.getByText('Preséntate en recepción de proveedores')).toBeTruthy();
    expect(screen.getByText(/^Hoy · 3:00 p. m. · Cuarto de máquinas, nivel -1$/)).toBeTruthy();
  });

  it('solo muestra los datos que trae el enlace', async () => {
    await pantalla({ p: payload('externo', '18:00') });
    expect(screen.queryByText('Empresa')).toBeNull();
    expect(screen.queryByText('Orden de servicio')).toBeNull();
    expect(screen.getByText('Hoy · hasta 6:00 p. m.')).toBeTruthy();
  });

  it('fuera de horario (aún no empieza): sin QR y con la hora de inicio', async () => {
    await pantalla({
      p: payload('externo', '18:00'),
      fecha: '2026-10-24',
      desde: '16:30',
      hasta: '18:00',
    });
    expect(screen.getByText('Fuera de horario')).toBeTruthy();
    expect(
      screen.getByText(
        'Fuera de horario. Tu horario autorizado empieza a las 4:30 p. m. No te presentes antes.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('img', { name: /Código QR/ })).toBeNull();
  });

  it('vencido: pide el pase nuevo al supervisor', async () => {
    await pantalla({ p: payload('externo', '15:00') });
    expect(screen.getByText('Pase vencido')).toBeTruthy();
    expect(
      screen.getByText(
        'Este pase venció a las 3:00 p. m. Pide uno nuevo a tu supervisor o responsable.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('img', { name: /Código QR/ })).toBeNull();
  });

  it('«Cómo llegar» abre la hoja de proveedores', async () => {
    await pantalla({ tipo: 'externo' });
    await fireEvent.press(screen.getByRole('button', { name: 'Cómo llegar' }));
    expect(screen.getByText('N Club · Recepción de proveedores')).toBeTruthy();
    expect(screen.getByText('Antes de entrar')).toBeTruthy();
  });
});

describe('enlace inválido', () => {
  it('dice que no hay un pase válido y no dibuja QR', async () => {
    await pantalla({ p: 'NCLUB1|invitado|roto' });
    expect(screen.getByRole('heading', { name: 'Pase no válido' })).toBeTruthy();
    expect(screen.getByText('Este enlace no contiene un pase válido.')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });
});

describe('VisitaPage', () => {
  beforeEach(() => jest.useFakeTimers({ now: NOW }));
  afterEach(() => jest.useRealTimers());

  it('vence el pase solo con el paso del tiempo, sin recargar', async () => {
    await render(<VisitaPage params={{ p: payload('invitado', '15:30') }} />);
    expect(screen.getByRole('img', { name: /Código QR/ })).toBeTruthy();
    await act(async () => {
      jest.setSystemTime(t('15:31'));
      jest.advanceTimersByTime(30_000);
    });
    expect(screen.getByText('Pase vencido')).toBeTruthy();
    expect(screen.queryByRole('img', { name: /Código QR/ })).toBeNull();
  });
});

describe('secciones del pase', () => {
  it('el mapa conserva el destino y muestra indicaciones desde recepción', async () => {
    await render(
      <VisitaScreen visita={resolverVisita({ tipo: 'externo' }, NOW)} now={NOW} section="mapa" />,
    );
    expect(screen.getByText('Tu destino · Piso -1')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Cómo llegar' }));
    expect(screen.getByText('Anúnciate en recepción de proveedores.')).toBeTruthy();
  });

  it('los mensajes usan el anfitrión y el horario del pase', async () => {
    await render(
      <VisitaScreen
        visita={resolverVisita({ tipo: 'invitado' }, NOW)}
        now={NOW}
        section="mensajes"
      />,
    );
    expect(screen.getByText('Te invita Sofía')).toBeTruthy();
    expect(screen.getByText('Muestra tu QR al robot')).toBeTruthy();
    expect(screen.queryByLabelText('Tu visita')).toBeNull();
  });

  it('el perfil externo muestra empresa, supervisor y permite salir', async () => {
    const salir = jest.fn();
    await render(
      <VisitaScreen
        visita={resolverVisita({ tipo: 'externo' }, NOW)}
        now={NOW}
        section="perfil"
        onExit={salir}
      />,
    );
    expect(screen.getByText('Climatec')).toBeTruthy();
    expect(screen.getByText('Jorge')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Salir de la visita' }));
    expect(salir).toHaveBeenCalledTimes(1);
  });
});
