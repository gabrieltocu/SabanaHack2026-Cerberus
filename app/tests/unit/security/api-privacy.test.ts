// La API no acepta ni guarda imágenes ni vectores faciales: solo la señal reducida del contrato
// (estado, pista de clase, candidato y confianza). El directorio contiene únicamente datos ficticios.
import { setup, type Harness } from '../../support/api-harness';

const MARKER = 'SECRETFACEDATA';
const vector = Array.from({ length: 128 }, (_, i) => i / 128);
const dataUri = `data:image/jpeg;base64,${'A'.repeat(200)}`;
const source = { kind: 'ROBOT', id: 'R1' };

const EXTRAS: [string, (b: any) => any][] = [
  ['embedding en la raíz', (b) => ({ ...b, embedding: vector })],
  ['image en la raíz', (b) => ({ ...b, image: dataUri })],
  ['photo en la raíz', (b) => ({ ...b, photo: MARKER })],
  ['campo en source', (b) => ({ ...b, source: { ...b.source, snapshot: MARKER } })],
  ['embedding en face', (b) => ({ ...b, face: { ...b.face, embedding: vector } })],
  [
    'imagen en evidence',
    (b) => ({ ...b, evidence: { qrToken: 'nq_AAAAAAAAAAAAAAAAAAAAAA', image: dataUri } }),
  ],
  ['landmarks en face', (b) => ({ ...b, face: { ...b.face, landmarks: [[1, 2]] } })],
];

describe('POST /recognition/events solo admite la señal reducida', () => {
  const base = {
    source,
    face: { status: 'MATCH', classHint: 'MEMBER', candidateId: 'V-201', confidence: 0.97 },
  };
  const visitCount = async (h: Harness) => (await h.store.list('visit:')).length;

  test.each(EXTRAS)('rechaza %s con 422 y no guarda nada', async (_n, mutate) => {
    const h = setup();
    await h.call('GET', '/health');
    const before = await visitCount(h);
    const res = await h.call('POST', '/recognition/events', { actor: 'R1', body: mutate(base) });
    expect([res.status, res.body.error.code]).toEqual([422, 'VALIDATION_ERROR']);
    expect(JSON.stringify(res.body)).not.toContain(MARKER);
    expect(JSON.stringify(res.body)).not.toContain('base64');
    expect(await visitCount(h)).toBe(before);
  });

  test('rechaza también un estado UNKNOWN o ERROR con campos extra', async () => {
    const h = setup();
    for (const face of [
      { status: 'UNKNOWN', embedding: vector },
      { status: 'ERROR', code: 'X', image: dataUri },
    ]) {
      const res = await h.call('POST', '/recognition/events', {
        actor: 'R1',
        body: { source, face },
      });
      expect(res.status).toBe(422);
    }
  });

  test('la señal válida se guarda sin material biométrico: solo claves del contrato y sin vectores', async () => {
    const h = setup();
    const res = await h.call('POST', '/recognition/events', { actor: 'R1', body: base });
    expect(res.status).toBe(201);
    const allowed = new Set([
      'source',
      'kind',
      'id',
      'simulated',
      'face',
      'status',
      'classHint',
      'candidateId',
      'confidence',
      'observedAt',
    ]);
    const stored = await h.store.get<{ recognition: unknown }>(`visit:${res.body.visit.id}`);
    const walk = (v: unknown, path: string[], out: string[]) => {
      if (Array.isArray(v)) {
        if (v.length >= 8 && v.every((x) => typeof x === 'number'))
          out.push(`${path.join('.')} vector`);
        v.forEach((x, i) => walk(x, [...path, String(i)], out));
      } else if (v && typeof v === 'object') {
        for (const [k, x] of Object.entries(v)) {
          if (!allowed.has(k)) out.push(`${[...path, k].join('.')} clave no prevista`);
          walk(x, [...path, k], out);
        }
      }
    };
    const problems: string[] = [];
    walk(stored!.value.recognition, ['recognition'], problems);
    expect(problems).toEqual([]);
    expect(JSON.stringify(res.body)).not.toMatch(/data:|base64|embedding/);
  });
});

describe('otras entradas del robot también son estrictas', () => {
  test('POST /access/verify y POST /robots/{id}/failure rechazan campos desconocidos', async () => {
    const h = setup();
    const v = await h.call('POST', '/access/verify', {
      actor: 'R1',
      body: { token: 'nq_AAAAAAAAAAAAAAAAAAAAAA', image: dataUri },
    });
    expect(v.status).toBe(422);
    const f = await h.call('POST', '/robots/R2/failure', {
      actor: 'R2',
      body: { code: 'MOTOR_FAULT', snapshot: dataUri },
    });
    expect(f.status).toBe(422);
    expect(JSON.stringify([v.body, f.body])).not.toContain('base64');
  });
});

describe('el directorio solo expone datos ficticios del contrato', () => {
  test('personas, detalles e invitaciones: sin imágenes, vectores ni claves fuera del contrato', async () => {
    const h = setup();
    const list = await h.call('GET', '/people');
    const details = await Promise.all(
      (list.body.items as { id: string }[]).map((p) => h.call('GET', `/people/${p.id}`)),
    );
    const allowed = new Set([
      'items',
      'count',
      'id',
      'displayName',
      'roles',
      'membership',
      'tier',
      'status',
      'validTo',
      'staff',
      'department',
      'shifts',
      'date',
      'from',
      'to',
      'external',
      'company',
      'orderCode',
      'responsibleId',
      'permit',
      'daysOfWeek',
      'validFrom',
      'robot',
      'role',
      'canEscort',
      'defaultDestination',
      'preferences',
    ]);
    const bad: string[] = [];
    const walk = (v: unknown, path: string) => {
      if (typeof v === 'string' && /data:|base64,|^[A-Za-z0-9+/=]{80,}$/.test(v))
        bad.push(`${path} imagen`);
      if (Array.isArray(v)) {
        if (v.length >= 8 && v.every((x) => typeof x === 'number')) bad.push(`${path} vector`);
        v.forEach((x, i) => walk(x, `${path}[${i}]`));
      } else if (v && typeof v === 'object') {
        for (const [k, x] of Object.entries(v)) {
          if (!allowed.has(k)) bad.push(`${path}.${k}`);
          walk(x, `${path}.${k}`);
        }
      }
    };
    walk(list.body, 'people');
    details.forEach((d, i) => walk(d.body, `person${i}`));
    expect(bad).toEqual([]);
    // Ningún identificador real: ids del directorio de demostración.
    for (const p of list.body.items as { id: string }[])
      expect(p.id).toMatch(/^(V-2\d\d|U-0\d|R\d|O-\d\d)$/);
  });
});
