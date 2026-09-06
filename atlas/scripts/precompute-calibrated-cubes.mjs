import fs from 'node:fs';
import { createRequire } from 'node:module';
fs.writeFileSync('work/test-build/package.json', JSON.stringify({ type: 'commonjs' }));
const require = createRequire(import.meta.url);
const { statistics } = require('../work/test-build/server/atlas/population.js');
const { source } = require('../work/test-build/server/atlas/source.js');
const previous = JSON.parse(
  fs.readFileSync('server/data/atlas-cubes.json', 'utf8'),
);
const data = {};
let i = 0;
for (const key of Object.keys(previous.data)) {
  data[key] = statistics(key ? key.split('~') : []);
  if (++i % 300 === 0) console.log('Calibrated cubes', i);
}
fs.writeFileSync(
  'server/data/atlas-calibrated-cubes.json',
  JSON.stringify({
    version: 'survey-calibrated-cubes-v1',
    indexDigest: source.dataFingerprint,
    featureKeys: source.features.map((f) => f.id),
    data,
  }) + '\n',
);
console.log('Wrote', i, 'calibrated aggregate cubes.');
