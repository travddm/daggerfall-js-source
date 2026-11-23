// The `?raw` hook must hand Node the same shader text that Vite hands the browser: the file's bytes, unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { RETRO_FS, RETRO_VS } from '../../src/render/retroPass.js';
import { runnerEnv } from '../../tools/testShards.mjs';

const ROOT = join(import.meta.dirname, '../..');
const SHADER_FILE = /\.(vert|frag|glsl)$/;

test('a ?raw import is the file text, byte for byte', () => {
  assert.equal(RETRO_VS, readFileSync(join(ROOT, 'src/render/retro-pass.vert'), 'utf8'));
  assert.equal(RETRO_FS, readFileSync(join(ROOT, 'src/render/retro-pass.frag'), 'utf8'));
  assert.ok(RETRO_FS.startsWith('#version 300 es\n'));
});

test('every shader file under src/ has LF line ends, as the template literals it replaces had', () => {
  const files = readdirSync(join(ROOT, 'src'), { recursive: true, encoding: 'utf8' }).filter((f) =>
    SHADER_FILE.test(f),
  );
  assert.ok(files.length > 0);
  for (const f of files) assert.ok(!readFileSync(join(ROOT, 'src', f), 'utf8').includes('\r'), `${f} has a CR`);
});

test('the test runner environment preloads the hook and keeps the NODE_OPTIONS it was given', (t) => {
  const before = process.env.NODE_OPTIONS;
  t.after(() => {
    if (before === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = before;
  });
  process.env.NODE_OPTIONS = '--max-old-space-size=4096';
  const options = runnerEnv(ROOT).NODE_OPTIONS;
  assert.match(options, /^--max-old-space-size=4096 --import=file:\/\/\S+\/tools\/raw-import-hooks\.ts$/);
});
