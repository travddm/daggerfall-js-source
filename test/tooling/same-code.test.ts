import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canCheck, sameCode } from '../../tools/same-code.ts';

const js = `// ═══ THE SPEED ═══
// SPD1 (2026-10-14): the old cap.
const speed = 3; /* a block */
export const label = \`speed \${speed}\`;
`;

test('a comment-only edit to JavaScript keeps the same code', () => {
  const after = `// The walk speed, in metres a second.
const speed = 3;
export const label = \`speed \${speed}\`;
`;
  assert.equal(sameCode('a.js', js, after), true);
});

test('a changed value, string or template is a code change', () => {
  assert.equal(sameCode('a.js', js, js.replace('= 3', '= 4')), false);
  assert.equal(sameCode('a.js', js, js.replace('speed ${', 'speed  ${')), false);
  assert.equal(sameCode('a.js', 'const a = "x // y";', 'const a = "x";'), false);
});

test('a TypeScript type change is a code change and a comment change is not', () => {
  const ts = 'export function f(n: number): number {\n  // AUDIT 7: doubles.\n  return n * 2;\n}\n';
  assert.equal(sameCode('a.ts', ts, ts.replace('// AUDIT 7: doubles.', '// Doubled for the two hands.')), true);
  assert.equal(sameCode('a.ts', ts, ts.replace('n: number)', 'n: string)')), false);
});

test('a regular expression that holds slashes is read as code', () => {
  const before = 'const re = /\\/\\/x/; // tail\n';
  assert.equal(sameCode('a.js', before, 'const re = /\\/\\/x/;\n'), true);
  assert.equal(sameCode('a.js', before, 'const re = /\\/\\/y/;\n'), false);
});

test('a YAML whole-line comment can change and a value cannot', () => {
  const yml = '# INT1 (bible/x.md): the judge\nrun: echo hi # keep\n';
  assert.equal(sameCode('a.yml', yml, '# The judge.\nrun: echo hi # keep\n'), true);
  assert.equal(sameCode('a.yml', yml, '# INT1\nrun: echo bye # keep\n'), false);
});

test('a shell shebang is code and the comment under it is not', () => {
  const sh = '#!/bin/sh\n# HARD3: greet\necho hi\n';
  assert.equal(sameCode('a.sh', sh, '#!/bin/sh\n# Greets.\necho hi\n'), true);
  assert.equal(sameCode('a.sh', sh, '#!/bin/bash\n# HARD3: greet\necho hi\n'), false);
});

test('JSON with comments keeps its values', () => {
  const json = '{\n  // HARD3 (bible/x.md)\n  "strict": true\n}\n';
  assert.equal(sameCode('tsconfig.json', json, '{\n  "strict": true\n}\n'), true);
  assert.equal(sameCode('tsconfig.json', json, json.replace('true', 'false')), false);
});

test('files it cannot read are named, not guessed', () => {
  assert.equal(canCheck('page.html'), false);
  assert.equal(canCheck('tools/x.mjs'), true);
  assert.throws(() => sameCode('page.html', '', ''));
});
