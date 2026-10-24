// Fake Upstash REST backend with Redis single-threaded semantics, shared by the store tests and the
// API integration tests. It interprets only the commands the adapter emits.
import { CAS_SCRIPT, INCREMENT_SCRIPT } from '@/infrastructure/stores/upstash-store';
import type { TestClock } from '../unit/stores/store-contract';

export const FAKE_URL = 'https://fake-region.upstash.io';
export const FAKE_TOKEN = 'tok_SECRET_do_not_leak_0123456789';

type Fetch = typeof fetch;
type Command = string[];

/** Interprets only the commands the adapter emits, with Redis single-threaded semantics. */
export function createFakeUpstash(clock: TestClock, pageSize = 2) {
  const data = new Map<string, string>();
  const expiry = new Map<string, number>();
  const commands: Command[] = [];

  const live = (k: string): string | null => {
    const exp = expiry.get(k);
    if (exp !== undefined && exp <= clock.now()) {
      data.delete(k);
      expiry.delete(k);
    }
    return data.get(k) ?? null;
  };
  const unescape = (glob: string) => glob.replace(/\\(.)/g, '$1');

  function run(cmd: Command): unknown {
    const [name, ...a] = cmd as [string, ...string[]];
    switch (name) {
      case 'GET':
        return live(a[0] as string);
      case 'MGET':
        return a.map((k) => live(k));
      case 'DEL': {
        let n = 0;
        for (const k of a) if (live(k) !== null && data.delete(k)) n++;
        return n;
      }
      case 'SCAN': {
        const cursor = Number(a[0]);
        expect(a[1]).toBe('MATCH');
        const prefix = unescape((a[2] as string).slice(0, -1));
        const all = [...data.keys()].filter((k) => live(k) !== null && k.startsWith(prefix));
        const page = all.slice(cursor, cursor + pageSize);
        const next = cursor + pageSize >= all.length ? 0 : cursor + pageSize;
        return [String(next), page];
      }
      case 'EVAL': {
        const [script, numKeys, key, ...argv] = a as [string, string, string, ...string[]];
        expect(numKeys).toBe('1');
        if (script === CAS_SCRIPT) {
          const cur = live(key);
          const ver = cur === null ? 0 : (JSON.parse(cur) as { v: number }).v;
          if (ver !== Number(argv[0])) return -1;
          data.set(key, `{"v":${ver + 1},"d":${argv[1]}}`);
          return ver + 1;
        }
        if (script === INCREMENT_SCRIPT) {
          const n = Number(live(key) ?? 0) + 1;
          data.set(key, String(n));
          if (n === 1) expiry.set(key, clock.now() + Number(argv[0]) * 1000);
          return n;
        }
        throw new Error('ERR script desconocido');
      }
      default:
        throw new Error(`ERR comando no soportado: ${name}`);
    }
  }

  const fakeFetch: Fetch = async (input, init) => {
    expect(String(input)).toBe(FAKE_URL);
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    if (headers.Authorization !== `Bearer ${FAKE_TOKEN}`) {
      return new Response('{"error":"unauthorized"}', { status: 401 });
    }
    const cmd = JSON.parse(String(init?.body)) as Command;
    commands.push(cmd);
    try {
      return new Response(JSON.stringify({ result: run(cmd) }), { status: 200 });
    } catch (e) {
      return new Response(JSON.stringify({ error: (e as Error).message }), { status: 400 });
    }
  };
  return { fetch: fakeFetch, commands, data };
}
