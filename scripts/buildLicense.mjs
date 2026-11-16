// The build carries its licences: the repository's LICENSE, with the third-party terms it lists, and the licences of
// the npm packages bundled into the JavaScript.
//
// The MIT License, and the licences of most bundled packages, require their notice in every copy, and the website and
// the desktop app are copies. Both carry dist/: the site is dist/ copied whole (deploy.yml), and the desktop app packs
// dist/ into app.asar. The desktop app also copies the repository's LICENSE to its install folder as LICENSE.txt,
// beside Electron's own licence files (app/package.json extraFiles). That copy comes from LICENSE, not from dist/,
// because every file of dist/ stays inside the archive (DA11).
//
//   LICENSE.txt               the repository's LICENSE, unchanged (this plugin)
//   THIRD-PARTY-LICENSES.txt  each bundled package with its version and licence text (Vite's build.license)
//
// Both names end in .txt so that a web host serves them as text/plain, which a browser shows. A file without an
// extension is served as a download.
import { readFileSync } from 'node:fs';

/** The repository's LICENSE in the build. */
export const LICENSE_FILE = 'LICENSE.txt';
/** The bundled packages' licences in the build. Vite writes Markdown to any name that does not end in `.json`. */
export const THIRD_PARTY_FILE = 'THIRD-PARTY-LICENSES.txt';

const LICENSE_SOURCE = new URL('../LICENSE', import.meta.url);

/**
 * A Vite plugin that writes the repository's LICENSE into the build as LICENSE.txt.
 * @returns {import('vite').Plugin}
 */
export function buildLicense() {
  return {
    name: 'build-license',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: LICENSE_FILE, source: readFileSync(LICENSE_SOURCE, 'utf8') });
    },
  };
}
