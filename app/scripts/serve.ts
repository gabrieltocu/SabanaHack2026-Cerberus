// Serves dist/ (or $DIST) with SPA fallback, mounts the API at /api/v1 and the club API at /api/*,
// and applies the security headers declared in vercel.json, so local E2E runs under the same contract
// as production. It is also the self-hosted production server (Docker image): HOST/PORT, SQLITE_PATH
// for the database file, SEED_FIXED=1 for the fixed demo data, request log on stdout (method, path,
// status, ms; never query, headers or bodies) and a clean shutdown on SIGTERM/SIGINT.
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';

import { API_PREFIX, toFetchHandler } from '../src/api/http';
import { clubPath, createClubServer } from '../src/club/server';
import { sembrarFijos } from '../src/club/fijos';
import { createServerApp } from '../src/api/server';
import { closeSqliteStores, createSqliteStore } from '../src/infrastructure/stores/sqlite-store';

let api: ReturnType<typeof toFetchHandler>;
let club: ReturnType<typeof createClubServer>;
try {
  api = toFetchHandler(createServerApp(process.env));
  club = createClubServer(process.env);
} catch (e) {
  abort(e);
}
function abort(e: unknown): never {
  console.error(`No se pudo iniciar: ${e instanceof Error ? e.message : 'error de configuración'}`);
  return process.exit(1);
}
const dist = process.env.DIST ?? 'dist';
const root = join(process.cwd(), dist);
const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? '0.0.0.0';
const MAX_BODY_BYTES = 32 * 1024;
// Photo uploads (multipart) may reach ~6 MB here; the club API itself rejects what exceeds 600 KB.
const MAX_CLUB_BODY_BYTES = 6 * 1024 * 1024;
const securityHeaders: Record<string, string> = Object.fromEntries(
  (
    JSON.parse(readFileSync('vercel.json', 'utf8')).headers[0].headers as {
      key: string;
      value: string;
    }[]
  ).map((h) => [h.key, h.value]),
);
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

const server = createServer(async (req, res) => {
  const started = Date.now();
  res.on('close', () => {
    const path = (req.url ?? '').split('?')[0];
    console.log(`${req.method} ${path} ${res.statusCode} ${Date.now() - started}ms`);
  });
  try {
    await handle(req, res);
  } catch {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});

async function handle(req: IncomingMessage, res: ServerResponse) {
  if (req.url?.startsWith('/api/') && !req.url.startsWith(API_PREFIX)) {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of req) {
      size += (c as Buffer).length;
      if (size > MAX_CLUB_BODY_BYTES) {
        res.writeHead(413).end();
        return;
      }
      chunks.push(c as Buffer);
    }
    const url = new URL(`http://localhost${req.url}`);
    const response = await club(
      new Request(url, {
        method: req.method,
        // Without a TLS proxy in front the club would build https links (robot photo URLs) for the IP.
        headers: { 'x-forwarded-proto': 'http', ...(req.headers as Record<string, string>) },
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
      }),
      clubPath(url),
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }
  if (req.url?.startsWith(API_PREFIX)) {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of req) {
      size += (c as Buffer).length;
      if (size > MAX_BODY_BYTES) {
        res.writeHead(413).end();
        return;
      }
      chunks.push(c as Buffer);
    }
    const response = await api(
      new Request(`http://localhost${req.url}`, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
      }),
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }
  let path: string;
  try {
    path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname));
  } catch {
    res.writeHead(400).end();
    return;
  }
  let file = join(root, path);
  const inside = file === root || file.startsWith(root + sep);
  if (!inside || !existsSync(file) || statSync(file).isDirectory()) {
    // Same as vercel.json: unknown paths with an extension are 404, routes fall back to the SPA.
    if (inside && extname(path)) {
      res.writeHead(404, securityHeaders).end();
      return;
    }
    file = join(root, 'index.html');
  }
  res.writeHead(200, {
    ...securityHeaders,
    'Content-Type': types[extname(file)] ?? 'application/octet-stream',
  });
  createReadStream(file)
    .on('error', () => res.destroy())
    .pipe(res);
}

const seed =
  process.env.SQLITE_PATH && process.env.SEED_FIXED === '1'
    ? sembrarFijos(createSqliteStore(process.env.SQLITE_PATH), new Date())
    : Promise.resolve();
seed
  .then(() =>
    server.listen(port, host, () => console.log(`serving ${dist} on http://${host}:${port}`)),
  )
  .catch(abort);
// ponytail: hourly re-seed so the fixed invitations move to the new day without a restart.
if (process.env.SQLITE_PATH && process.env.SEED_FIXED === '1')
  setInterval(
    () =>
      void sembrarFijos(createSqliteStore(process.env.SQLITE_PATH!), new Date()).catch((e) =>
        console.error('seed', e instanceof Error ? e.message : e),
      ),
    3_600_000,
  );

function shutdown() {
  console.log('shutting down');
  setTimeout(() => process.exit(1), 10_000); // forced exit if a connection never closes
  server.close(() => {
    closeSqliteStores();
    process.exit(0);
  });
  server.closeIdleConnections();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
