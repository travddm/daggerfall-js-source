// Compiles every complete shader file under src/ with glslangValidator, the Khronos reference compiler, so a GLSL
// error fails CI instead of the first frame that builds the program. A `.vert` or `.frag` file is a whole stage
// (`#version 300 es` first) and is checked alone; glslang takes the stage from the extension. A `.glsl` file is a
// chunk that only compiles inside a stage, so it is checked through the stages that include it.
//
//   node tools/glsl-check.ts            check every stage file
//   GLSLANG=<path> node tools/glsl-check.ts   use that glslangValidator
//
// CI installs glslang-tools (verify.yml). The exit status is glslang's, or 2 when it is not installed.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { isMain } from './lib/isMain.mjs';

const ROOT = join(import.meta.dirname, '..');
const STAGE_FILE = /\.(vert|frag)$/;

export function stageFiles(root = ROOT): string[] {
  return readdirSync(join(root, 'src'), { recursive: true, encoding: 'utf8' })
    .filter((f) => STAGE_FILE.test(f))
    .map((f) => join('src', f).split('\\').join('/'))
    .sort();
}

function main(): void {
  const files = stageFiles();
  if (files.length === 0) {
    console.log('[glsl-check] no shader files under src/');
    return;
  }
  const compiler = process.env.GLSLANG || 'glslangValidator';
  const run = spawnSync(compiler, files, { cwd: ROOT, encoding: 'utf8' });
  if (run.error) {
    console.error(
      `[glsl-check] ${compiler} did not start (${run.error.message}). Install glslang-tools, or set GLSLANG.`,
    );
    process.exitCode = 2;
    return;
  }
  process.stdout.write(run.stdout);
  process.stderr.write(run.stderr);
  if (run.status === 0) console.log(`[glsl-check] ${files.length} shader files compile`);
  process.exitCode = run.status ?? 1;
}

if (isMain(import.meta.url)) main();
