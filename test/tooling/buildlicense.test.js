// The build's licences (scripts/buildLicense.mjs): the repository's LICENSE written into the build as LICENSE.txt, the
// bundled packages' licences written by Vite as THIRD-PARTY-LICENSES.txt, and LICENSE.txt in the desktop app's install
// folder. The website is dist/ copied whole, so what dist/ holds, the site serves. The desktop app packs dist/ into
// app.asar, and takes its loose LICENSE.txt from the repository's LICENSE, not from dist/ (DA11 keeps every copy of
// dist/ inside the archive: test/tooling/da11_install_whole.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import viteConfig from '../../vite.config.js';
import { buildLicense, LICENSE_FILE, THIRD_PARTY_FILE } from '../../scripts/buildLicense.mjs';

const root = new URL('../../', import.meta.url);

test('BUILD-LICENSE: the plugin writes the repository LICENSE into the build, unchanged, as LICENSE.txt', () => {
  const emitted = [];
  const plugin = buildLicense();
  assert.equal(plugin.apply, 'build', 'the dev server has no build to write into');
  plugin.generateBundle.call({ emitFile: (file) => emitted.push(file) });
  assert.deepEqual(emitted, [
    { type: 'asset', fileName: LICENSE_FILE, source: readFileSync(new URL('LICENSE', root), 'utf8') },
  ]);
});

test("BUILD-LICENSE: the web build runs the plugin and writes the bundled packages' licences", () => {
  assert.equal(viteConfig.plugins.filter((plugin) => plugin.name === 'build-license').length, 1);
  assert.equal(viteConfig.build.license.fileName, THIRD_PARTY_FILE);
});

test("BUILD-LICENSE: the desktop app copies the repository's LICENSE to its install folder as LICENSE.txt", () => {
  const app = JSON.parse(readFileSync(new URL('app/package.json', root), 'utf8'));
  assert.deepEqual(app.build.extraFiles, [{ from: '../LICENSE', to: LICENSE_FILE }]);
});
