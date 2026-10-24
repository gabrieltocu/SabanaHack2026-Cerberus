// Fails if a tracked or new (non-ignored) file contains a credential-shaped string.
import { execSync } from 'node:child_process';

const pattern =
  '(BEGIN [A-Z ]*PRIVATE KEY|gh[pousr]_[A-Za-z0-9]{36}|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{32,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35})';
try {
  const hits = execSync(`git grep -nIE --untracked '${pattern}' -- . ':!package-lock.json'`, {
    encoding: 'utf8',
  });
  console.error(hits);
  console.error('::error::Possible secret committed');
  process.exit(1);
} catch (e) {
  if (e.status !== 1) throw e; // 1 = no matches
  console.log('secret scan: clean');
}
