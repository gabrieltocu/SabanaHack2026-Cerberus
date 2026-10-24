// Fails on high/critical production advisories, except the reviewed build-time chain of the Expo CLI
// (@expo/cli is the bundler/dev server: it never ships to the browser bundle nor runs on Vercel functions).
import { execSync } from 'node:child_process';

// Reviewed install paths (exact), all pulled only by @expo/cli; a new path or package still blocks.
const reviewed = new Set([
  'node_modules/expo',
  'node_modules/expo/node_modules/@expo/cli',
  'node_modules/expo/node_modules/zod',
  'node_modules/@expo/code-signing-certificates',
  'node_modules/node-forge',
]);
let out;
try {
  out = execSync('npm audit --omit=dev --json', { encoding: 'utf8' });
} catch (e) {
  out = e.stdout; // npm audit exits 1 when it finds anything
}
const vulns = Object.entries(JSON.parse(out).vulnerabilities ?? {});
const blocking = vulns.filter(
  ([name, v]) =>
    ['high', 'critical'].includes(v.severity) && !v.nodes.every((n) => reviewed.has(n)),
);
for (const [name, v] of vulns)
  console.log(`${blocking.some(([n]) => n === name) ? 'BLOCK' : 'reviewed'} ${v.severity} ${name}`);
if (blocking.length) process.exit(1);
