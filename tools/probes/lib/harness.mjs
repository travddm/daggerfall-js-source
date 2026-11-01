// Shared harness of the end-to-end probes (docs/testing/game-probes.md): one Vite server per plugin set, one
// browser, and a Game per probe that reads state through the `?shot` hooks and fails on any console error that
// ALLOWED_ERRORS does not name.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ALLOWED_ERRORS } from './allowedErrors.mjs';
import { fakePointerLock } from './fakePointerLock.mjs';

export const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
export const SHOTS = process.env.SHOT_DIR || join(ROOT, 'scratch', 'probe-shots');
export const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

const SWIFTSHADER_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

/** Starts a Vite dev server on `port`. HMR and the watcher are off: a reload under a probe destroys its page. */
export async function serve({ port, plugins = [] }) {
  const server = await createServer({
    root: ROOT, configFile: join(ROOT, 'vite.config.js'), plugins,
    server: { port, strictPort: true, hmr: false, watch: null }, logLevel: 'error',
  });
  await server.listen();
  return { base: `http://localhost:${port}`, close: () => server.close() };
}

/** PW_CHANNEL=msedge uses the installed Edge (local runs); unset uses Playwright's Chromium on SwiftShader (CI). */
export function launchBrowser() {
  const channel = process.env.PW_CHANNEL;
  const args = ['--autoplay-policy=no-user-gesture-required', ...(channel ? [] : SWIFTSHADER_ARGS)];
  return chromium.launch({ headless: true, args, ...(channel ? { channel } : {}) });
}

/** The dev server, the local account service and the local relay: everything a probe is allowed to reach. */
const isLocal = (href) => /^(https?|wss?):\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(href);

const isAllowed = (text) => ALLOWED_ERRORS.some((a) => a.match.test(text));

/** One probe's results: `check` prints `ok`/`FAIL`, `failed()` lists the failed rows. */
export function ledger(name) {
  const rows = [];
  const check = (label, ok, detail = '') => {
    rows.push({ label, ok: !!ok, detail: String(detail) });
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} [${name}] ${label}${detail ? ` - ${detail}` : ''}`);
    return !!ok;
  };
  return { rows, check, failed: () => rows.filter((r) => !r.ok) };
}

/**
 * A game page in its own context. Errors from the page (uncaught exceptions, console.error, failed requests,
 * HTTP errors from a local origin) are collected; `noErrors()` checks them against ALLOWED_ERRORS.
 */
export class Game {
  constructor(browser, base, { viewport = { width: 1280, height: 800 }, ...ctxOpts } = {}) {
    this.browser = browser;
    this.base = base;
    this.viewport = viewport;
    this.ctxOpts = ctxOpts;
    this.errors = [];
  }

  /** Opens `path` (relative to the server) and waits until `wait` is true: 'frame' (the frame counter runs) or 'mode'. */
  async open(path, { wait = 'frame', timeout = 420000, init = null } = {}) {
    if (!this.context) {
      this.context = await this.browser.newContext({ viewport: this.viewport, ...this.ctxOpts });
      await fakePointerLock(this.context);
      // first-use tutorial pages open over the window a probe has just opened and swallow its clicks (systems/tutorials.js)
      await this.context.addInitScript(() => {
        try { const k = 'dagger.ui.v1'; localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) ?? '{}'), tutorialPopups: false })); } catch { /* no storage */ }
      });
      if (init) await this.context.addInitScript(init.fn, init.arg);
      // hermetic: the game phones the live account service (/v1/poi/live) even offline; a probe never reaches it
      await this.context.route((url) => !isLocal(url.href) && !/^(data|blob):/.test(url.protocol), (route) => route.abort('blockedbyclient'));
      this.page = await this.context.newPage();
      // the game's leave-page guard would otherwise hold a reload
      this.page.on('dialog', (d) => { d.accept().catch(() => {}); });
      this.page.on('pageerror', (e) => this.errors.push(`[pageerror] ${e.message}`));
      this.page.on('console', (m) => { if (m.type() === 'error' && (!m.location().url || isLocal(m.location().url))) this.errors.push(`[console] ${m.text()} ${m.location().url ?? ''}`.trim()); });
      this.page.on('requestfailed', (r) => isLocal(r.url()) && this.errors.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText ?? ''}`));
      this.page.on('response', (r) => { if (r.status() >= 400 && isLocal(r.url())) this.errors.push(`[http ${r.status()}] ${r.url()}`); });
    }
    await this.page.goto(`${this.base}${path}`);
    if (wait === 'frame') return this.until(() => this.page.evaluate(() => (window.__frame ?? 0) > 3), timeout);
    if (wait === 'mode') return this.until(() => this.page.evaluate(() => (window.__mode ? window.__mode() : null)), timeout);
    return true;
  }

  /** Errors the run has not allowed (see lib/allowedErrors.mjs). */
  unexpectedErrors() { return this.errors.filter((e) => !isAllowed(e)); }

  noErrors(ck, what) {
    const bad = this.unexpectedErrors();
    // one line per kind of error: digits folded, so BOK00001.TXT and BOK00002.TXT are one kind
    const kinds = new Map();
    for (const e of bad) { const k = e.replace(/\d+/g, 'N').slice(0, 220); kinds.set(k, (kinds.get(k) ?? 0) + 1); }
    return ck(`${what}: no console or page errors`, bad.length === 0, [...kinds].slice(0, 5).map(([k, n]) => `${k} (x${n})`).join(' | '));
  }

  frame() { return this.page.evaluate(() => window.__frame ?? 0); }

  async waitFrames(n, cap = 90000) {
    const f0 = await this.frame();
    const t0 = Date.now();
    while (Date.now() - t0 < cap) {
      if ((await this.frame()) >= f0 + n) return true;
      await sleep(100);
    }
    return false;
  }

  /** Polls `fn` until it answers something truthy; null after `cap` ms. */
  async until(fn, cap = 90000, every = 250) {
    const t0 = Date.now();
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() - t0 > cap) return null;
      await sleep(every);
    }
  }

  async key(k, frames = 2) { await this.page.keyboard.press(k, { delay: 40 }); await this.waitFrames(frames); }

  /** Calls a hook that answers a JSON string (the `?shot` hooks' habit). */
  async J(fn, arg) { return JSON.parse((await this.page.evaluate(fn, arg)) ?? 'null'); }

  mode() { return this.page.evaluate(() => (window.__mode ? window.__mode() : null)); }

  overlayKind() { return this.page.evaluate(() => (window.__overlayKind ? window.__overlayKind() : null)); }

  /** The character as the game holds it. */
  entity() {
    return this.page.evaluate(() => {
      const p = window.__playerEntity;
      const items = p.items ?? [];
      return {
        name: p.name, level: p.level ?? null, health: p.health, maxHealth: p.maxHealth, chargenDone: !!p.chargenDone,
        gold: JSON.parse(window.__travelProbe()).gold,
        items: items.length,
        qty: items.reduce((n, i) => n + (i.stackCount ?? 1), 0),
        itemNames: items.filter((i) => i.group !== 'Currency').map((i) => `${i.name ?? i.uid}x${i.stackCount ?? 1}`).sort(),
      };
    });
  }

  async shot(name) {
    mkdirSync(SHOTS, { recursive: true });
    try { await this.page.screenshot({ path: join(SHOTS, `${name}.png`), timeout: 60000 }); } catch { /* a screenshot never fails a probe */ }
  }

  async close() { try { await this.context?.close(); } catch { /* gone */ } }
}
