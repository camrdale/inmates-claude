// Bundle the game into one self-contained HTML fragment for the Artifact:
// naive module concatenation (strip `import` lines, drop `export ` prefixes)
// works because modules only use single-line imports of local files and
// top-level names are globally unique across src/.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const MODULES = ['src/rng.js', 'src/dictionary.js', 'src/words.js',
  'src/clues.js', 'src/solver.js', 'src/generator.js', 'src/app.js'];

const js = MODULES.map((m) =>
  read(m)
    .split('\n')
    .filter((line) => !/^import /.test(line))
    .map((line) => line.replace(/^export /, ''))
    .join('\n')
).join('\n\n');

const body = read('index.html').match(/<!-- BODY-START -->([\s\S]*)<!-- BODY-END -->/)[1];

const out = `<title>Cellmates</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
${read('fonts.css')}
${read('styles.css')}
</style>
${body}
<script>
${js}
</script>
`;

const dest = process.argv[2] || join(root, 'dist-cellmates.html');
writeFileSync(dest, out);
console.log(`wrote ${dest} (${(out.length / 1024).toFixed(0)} KB)`);
