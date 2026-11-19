// The boot's programs started early (render/boot-programs.ts) are the programs the hosts build later: on a context
// that compiles beside the page, a start adds no link to the boot, because each build takes the program started for
// it. And a world set's five programs are all handed to the driver before the first one is read.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// The renderer's modules use browser types that the node type pass does not load, so they are imported by a path the
// type pass does not follow.
// A browser's storage, so the terrain clip's record (render/terrain-clip-hint.ts) can be written and read.
const stored = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => stored.set(key, String(value)),
  removeItem: (key: string) => stored.delete(key),
};

const paths = {
  renderer: '../../src/render/renderer.js',
  boot: '../../src/render/boot-programs.ts',
  lighting: '../../src/render/enhancedLighting.js',
  clouds: '../../src/render/volumetricClouds.js',
  prefs: '../../src/systems/uiPrefs.js',
  clipHint: '../../src/render/terrain-clip-hint.ts',
};
const { Renderer } = await import(paths.renderer);
const { bootPrograms, startBootPrograms, cloudsExpected, terrainClipExpected } = await import(paths.boot);
const { syncLightingLane } = await import(paths.lighting);
const { VolumetricClouds } = await import(paths.clouds);
const { setPref } = await import(paths.prefs);
const { noteTerrainClipBuilt } = await import(paths.clipHint);

const COMPLETION_STATUS_KHR = 0x91b1;
const LINK_STATUS = 0x8b82;

/** A WebGL2 context that draws nothing, offers KHR_parallel_shader_compile when `parallel`, and logs links and reads. */
function fakeContext(parallel: boolean) {
  const log: string[] = [];
  let ids = 0;
  const constants: Record<string, number> = {
    TEXTURE0: 1000,
    DEPTH_BUFFER_BIT: 256,
    COLOR_BUFFER_BIT: 16384,
    FRAMEBUFFER: 36160,
    LINK_STATUS,
  };
  const creators = new Set([
    'createShader',
    'createProgram',
    'createBuffer',
    'createVertexArray',
    'createTexture',
    'createFramebuffer',
    'createRenderbuffer',
  ]);
  const gl = new Proxy(
    {},
    {
      get(_target, key) {
        if (typeof key !== 'string') return undefined;
        if (key in constants) return constants[key];
        if (key === 'getExtension') {
          return (name: string) =>
            parallel && name === 'KHR_parallel_shader_compile' ? { COMPLETION_STATUS_KHR } : null;
        }
        if (key === 'linkProgram') return () => log.push('link');
        if (key === 'getProgramParameter') {
          return (_program: unknown, name: number) => {
            if (name === LINK_STATUS) log.push('read');
            return true;
          };
        }
        if (key === 'getShaderParameter') return () => true;
        if (key === 'getUniformLocation') return (_program: unknown, name: string) => name;
        if (key === 'getAttribLocation') return () => 0;
        if (creators.has(key)) return () => ({ id: ++ids });
        if (key === 'getParameter') return () => new Float32Array(4);
        if (key === 'drawingBufferWidth' || key === 'drawingBufferHeight') return 64;
        if (key.toUpperCase() === key) return 1;
        return () => undefined;
      },
    },
  );
  const canvas = { getContext: () => gl, clientWidth: 320, clientHeight: 200, width: 320, height: 200 };
  return { gl, canvas, links: () => log.filter((entry) => entry === 'link').length, log };
}

/** What the hosts build after the renderer's constructor, by the same switches the start reads. */
function hostBuilds(renderer: { gl: unknown; prepareTerrainClip: () => void }, search: string): void {
  syncLightingLane(renderer, search);
  renderer.prepareTerrainClip();
  if (cloudsExpected(search)) new VolumetricClouds(renderer.gl, 'default', [0, 0, 64, 64]);
}

const search = '?world';
setPref('enhancedLighting', true);
setPref('enhancedEnvironments', true);
noteTerrainClipBuilt();

test('the boot starts the lane world set, the terrain clip and the clouds, and each build takes its started program', () => {
  // Without the extension nothing starts early anywhere, so this counts the programs the builds make.
  const plain = fakeContext(false);
  const plainRenderer = new Renderer(plain.canvas);
  const linksAfterConstructor = plain.links();
  hostBuilds(plainRenderer, search);
  const hostLinks = plain.links() - linksAfterConstructor;

  const early = fakeContext(true);
  const earlyRenderer = new Renderer(early.canvas);
  const before = early.links();
  const started = bootPrograms(earlyRenderer, search, true).length;
  assert.equal(startBootPrograms(earlyRenderer, search), true);
  assert.equal(early.links() - before, started, 'one link for each program started');
  assert.ok(started >= 5 + 1 + 7, `the lane set, the clip and the clouds (${started})`);
  hostBuilds(earlyRenderer, search);
  assert.equal(early.links() - before, hostLinks, 'the builds that follow link nothing the start already linked');
});

test('without the extension nothing is started early', () => {
  const context = fakeContext(false);
  const renderer = new Renderer(context.canvas);
  const before = context.links();
  assert.equal(startBootPrograms(renderer, search), false);
  assert.equal(context.links(), before);
});

test('a world set hands all five programs to the driver before it reads the first', () => {
  const context = fakeContext(true);
  new Renderer(context.canvas);
  const firstRead = context.log.indexOf('read');
  const linksBeforeFirstRead = context.log.slice(0, firstRead).filter((entry) => entry === 'link').length;
  assert.ok(linksBeforeFirstRead >= 5, `the classic set's five linked before its first read (${linksBeforeFirstRead})`);
});

test('the boot takes the terrain clip record: a second ask in the same page answers no', () => {
  stored.set('dfo.terrainClipBuilt', '1');
  assert.equal(terrainClipExpected(), true);
  assert.equal(terrainClipExpected(), false);
});
