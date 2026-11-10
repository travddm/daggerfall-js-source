// Node has no `?raw` import. Vite turns `import text from './x.frag?raw'` into the file's text, so a module that
// keeps its shaders in files cannot load under `node --test` without this hook. Preload it with
// `node --import ./tools/raw-import-hooks.ts`; tools/testShards.mjs does that for every test run.
//
// The text is the file's bytes decoded as UTF-8, with nothing normalised, which is what Vite's `?raw` gives. A shader
// file must therefore be checked out with LF line ends (.gitattributes), or Node and the browser would compile a
// different source from the one a JavaScript template literal gave before the move.
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

registerHooks({
  load(url, context, nextLoad) {
    if (!url.startsWith('file:') || new URL(url).search !== '?raw') return nextLoad(url, context);
    const text = readFileSync(fileURLToPath(url), 'utf8');
    return { format: 'module', source: `export default ${JSON.stringify(text)};\n`, shortCircuit: true };
  },
});
