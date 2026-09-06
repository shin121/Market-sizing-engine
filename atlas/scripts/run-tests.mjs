import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
const out = path.resolve('work/test-build');
fs.writeFileSync(
  path.join(out, 'package.json'),
  JSON.stringify({ type: 'commonjs' }),
);
const r = cp.spawnSync(
  process.execPath,
  [
    '--test',
    ...fs
      .readdirSync('tests')
      .filter((f) => f.endsWith('.test.ts'))
      .map((f) => path.join(out, 'tests', f.replace(/\.ts$/, '.js'))),
  ],
  {
    stdio: 'inherit',
    env: { ...process.env, NEMOTRON_ARTIFACT_DIR: path.resolve('data') },
  },
);
process.exit(r.status ?? 1);
