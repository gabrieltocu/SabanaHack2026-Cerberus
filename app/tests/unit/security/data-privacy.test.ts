// Privacy and secrets gate (Ley 1581 de 2012): the repository holds only fictitious, non-biometric
// data, and no secret can reach the browser bundle through `EXPO_PUBLIC_*`.
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createSeed } from '@/domain/seed';

const ROOT = path.resolve(__dirname, '../../..');
const SELF = 'tests/unit/security/';

/** Tracked and not-yet-committed (but not ignored) files, like `npm run format:check` sees them. */
const files = execFileSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  {
    cwd: ROOT,
    encoding: 'utf8',
  },
)
  .split('\0')
  .filter(Boolean)
  .filter((f) => lstatSync(path.join(ROOT, f)).isFile());

const BINARY = /\.(png|jpe?g|gif|webp|ico|icns|woff2?|ttf|otf|pdf|zip|mp4|mp3)$/i;
const textFiles = files.filter((f) => !BINARY.test(f) && !f.startsWith(SELF));
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');

describe('datos mock: ficticios y sin biometría', () => {
  const seed = createSeed();
  const dump = JSON.stringify(seed);

  const FORBIDDEN: [string, RegExp][] = [
    ['correo electrónico', /[\w.+-]+@[\w-]+\.[\w.-]+/],
    ['teléfono con prefijo', /\+\s?\d{1,3}[\s-]?\d{3}/],
    ['celular colombiano', /\b3\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/],
    ['teléfono (7+ dígitos seguidos)', /\d{7,}/],
    ['teléfono con separadores', /\b\d{3}[\s.-]\d{3}[\s.-]\d{4}\b/],
    ['documento de identidad', /\b(?:c\.?c\.?|c[eé]dula|nit|passport|pasaporte|dni|ti)\b\W*\d/i],
    ['URL', /https?:\/\//i],
    ['imagen incrustada', /data:image|base64,/i],
    ['archivo de imagen', /\.(png|jpe?g|gif|webp|heic|bmp|tiff?)\b/i],
    [
      'campo biométrico',
      /embedding|descriptor|biometr|faceprint|face_?(?:id|vector|template|data)|huella|fingerprint|template|landmark/i,
    ],
    ['foto o rostro', /photo|foto|image|imagen|selfie|avatar|picture|rostro/i],
    ['coordenadas', /\b-?\d{1,2}\.\d{4,}\b/],
  ];

  test('los detectores del seed detectan muestras reales', () => {
    const samples = [
      'ana@correo.co',
      '+57 310 1234567',
      '3101234567',
      '1020304050',
      '310-123-4567',
      'C.C. 1020',
      'https://x.co/f.jpg',
      'data:image/png;base64,AAAA',
      'rostro.jpeg',
      '{"embedding":[1]}',
      '"photoUrl"',
      '4.711111',
    ];
    const missed = samples.filter((x) => !FORBIDDEN.some(([, re]) => re.test(x)));
    expect(missed).toEqual([]);
  });

  test.each(FORBIDDEN)('el seed no contiene %s', (_name, re) => {
    expect(re.exec(dump)?.[0]).toBeUndefined();
  });

  test('los nombres de campo del seed son una lista cerrada', () => {
    const keys = new Set<string>();
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') {
        for (const [k, child] of Object.entries(v)) {
          keys.add(k);
          walk(child);
        }
      }
    };
    walk(seed);
    expect([...keys].sort()).toEqual(
      [
        'area',
        'company',
        'defaultDestination',
        'end',
        'from',
        'id',
        'invitations',
        'kind',
        'meetingPoint',
        'memberships',
        'name',
        'people',
        'permits',
        'personId',
        'preferences',
        'purpose',
        'shifts',
        'sponsorId',
        'start',
        'status',
        'tier',
        'to',
        'validFrom',
        'validTo',
        'weekdays',
      ].sort(),
    );
  });

  test('los nombres son ficticios: una o dos palabras, sin dígitos ni identificadores', () => {
    for (const p of seed.people) expect(p.name).toMatch(/^[\p{L}\d]+(?: [\p{L}]+)?$/u);
  });

  test('el seed es determinista y se serializa idéntico en cada creación', () => {
    expect(JSON.stringify(createSeed())).toBe(dump);
  });
});

describe('repositorio: sin secretos ni material personal', () => {
  const SECRETS: [string, RegExp][] = [
    ['clave privada PEM', /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/],
    ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
    ['token de GitHub', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/],
    ['clave estilo sk-', /\bsk-(?:ant-|proj-|live-|test-)?[A-Za-z0-9_-]{20,}/],
    ['token de Slack', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
    ['clave de Google API', /\bAIza[0-9A-Za-z_-]{35}\b/],
    ['JWT', /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/],
    ['credenciales en URL', /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@'"]+:[^\s/@'"]{3,}@[^\s/'"]+/i],
    ['token de Vercel Blob', /\bvercel_blob_rw_[A-Za-z0-9_-]{20,}/],
  ];

  test('los detectores de secretos detectan muestras con forma real', () => {
    // Built by concatenation so the CI secret scan (git grep) does not flag these canaries.
    const samples = [
      '-----BEGIN RSA ' + 'PRIVATE KEY-----',
      'AKIA' + 'ABCDEFGHIJKLMNOP',
      'ghp_' + 'a'.repeat(36),
      'sk-ant-' + 'a'.repeat(30),
      'xoxb' + '-1234567890-abc',
      'AIza' + 'a'.repeat(35),
      'eyJhbGciOiJI.eyJzdWIiOiIx.abcdefghijk',
      'postgres://user:hunter22@db.example/x',
      'vercel_blob_rw_' + 'a'.repeat(24),
    ];
    const missed = samples.filter((x) => !SECRETS.some(([, re]) => re.test(x)));
    expect(missed).toEqual([]);
  });

  test.each(SECRETS)('ningún archivo contiene %s', (_name, re) => {
    const hits = textFiles.filter((f) => re.test(read(f)));
    expect(hits).toEqual([]);
  });

  test('ninguna asignación literal de secreto (clave = "valor largo")', () => {
    const assign =
      /\b[\w-]*(?:secret|token|passw(?:or)?d|api[_-]?key|private[_-]?key|credential)[\w-]*["']?\s*[:=]\s*["'`](?!nq_)[^"'`\s${}]{16,}["'`]/i;
    // `nq_…` values are opaque single-use demo pass ids (docs/adr/0004-qr-handoff.md), not credentials.
    const hits = textFiles
      .filter((f) => f !== 'package-lock.json' && !f.startsWith('tests/')) // tests carry canary values
      .filter((f) => assign.test(read(f)));
    expect(hits).toEqual([]);
  });

  test('no se versionan archivos .env, claves ni certificados', () => {
    const bad = files.filter((f) =>
      /(^|\/)\.env(\.|$)/.test(f) && !/\.example$/.test(f)
        ? true
        : /\.(pem|key|p8|p12|jks|keystore|pfx)$/i.test(f),
    );
    expect(bad).toEqual([]);
  });

  test('las plantillas .env.example, si existen, no traen valores', () => {
    for (const f of files.filter((x) =>
      /(^|\/)\.env\..*\.example$|(^|\/)\.env\.example$/.test(x),
    )) {
      for (const line of read(f).split('\n')) {
        if (/^\s*(#|$)/.test(line)) continue;
        expect(line).toMatch(/^[A-Z0-9_]+=\s*$/);
      }
    }
  });

  test('ninguna variable EXPO_PUBLIC_ lleva nombre de secreto', () => {
    const names = new Set<string>();
    for (const f of textFiles) {
      for (const m of read(f).matchAll(/EXPO_PUBLIC_[A-Z0-9_]*/g)) names.add(m[0]);
    }
    expect(names.size).toBeGreaterThan(0); // the scan really sees the repo (EXPO_PUBLIC_DATA_MODE)
    const secretLike = [...names].filter((n) =>
      /TOKEN|SECRET|KEY|PASSW|PRIVATE|CREDENTIAL|AUTH|SALT|SIGN/.test(n),
    );
    expect(secretLike).toEqual([]);
  });

  test('las credenciales de servidor se leen del entorno sin prefijo público', () => {
    // process.env.X with a secret-like name is fine on the server, never under EXPO_PUBLIC_.
    const bad = textFiles.filter((f) =>
      /process\.env\.EXPO_PUBLIC_\w*(?:TOKEN|SECRET|KEY|PASSW)/i.test(read(f)),
    );
    expect(bad).toEqual([]);
  });

  test('no hay fotografías: imágenes solo en assets/ o public/, sin formato foto ni nombre de rostro', () => {
    const images = files.filter((f) =>
      /\.(png|jpe?g|gif|webp|heic|heif|bmp|tiff?|svg|ico)$/i.test(f),
    );
    const outside = images.filter((f) => !/^(assets|public)\//.test(f));
    expect(outside).toEqual([]);
    expect(images.filter((f) => /\.(jpe?g|heic|heif|bmp|tiff?)$/i.test(f))).toEqual([]);
    expect(
      images.filter((f) =>
        /foto|photo|face|rostro|selfie|retrato|portrait|biometr|avatar/i.test(f),
      ),
    ).toEqual([]);
  });

  test('el texto versionado no embebe imágenes ni vectores faciales', () => {
    const re = /data:image\/(?!svg)|embedding\s*[:=]\s*\[|faceDescriptor|face_?encoding/i;
    expect(textFiles.filter((f) => f !== 'package-lock.json' && re.test(read(f)))).toEqual([]);
  });
});
