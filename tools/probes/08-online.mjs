// Probe 8: online. Two clients join one room on the real relay and the real account service (local workerd), each sees
// the other move, and one chat line arrives.
//
// The services stand as tools/loadHarness.mjs stands them (a throwaway signing pair, every migration, both Workers). Each
// player is a guest with a realm character whose first save is one offline boot at the classic start, composed by the world
// host; both boot `?world&online&realm=<id>&load&server=ws://127.0.0.1:<relay>` into that dungeon, so both are in its room.
//
// Three probe-only edits of the served source (tools/onlineFrameProbe.mjs ONLINE_PROBE_EDITS, the repository untouched):
// the account base may be the local service, `?shot` survives an online boot (it installs the `__` hooks), and the save
// composer's hook. A fourth, here, reads the peers the session draws (`__probePeers`).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Game, sleep } from './lib/harness.mjs';
import { editsPlugin } from '../frameProbe.mjs';
import { ONLINE_PROBE_EDITS } from '../onlineFrameProbe.mjs';
import { standServices, stopAll, localFetch, botStorage, LOAD_SERVICE } from '../loadHarness.mjs';
import { SESSION_KEY, SERVICE_KEY } from '../../src/net/accountClient.js';
import { realmIo, realmCreate, createRealmSession } from '../../src/systems/realmSaves.js';
import { ACCEPTED } from '../../src/net/legalLaw.js';

export const name = 'online';

const SVC_PORT = Number(process.env.PROBE_SVC_PORT || 8872);
// the classic start, inside the starting dungeon: software GL cannot stream a town in minutes, and a dungeon is the cheap place
// two clients can meet (tools/partyLootProbe.mjs does the same)
const START = '/play/?world&classic&class=1&novideo&shot&play';
const standing = () => window.__probeSaveText && window.__foes?.() != null && (window.__frame | 0) > 30;

/** The peers the session draws, beside the composer's hook: id, name and the pose the relay last gave. */
const PEERS_EDIT = [
  '    window.__probeOnline = () => ({',
  `    window.__probePeers = () => online ? JSON.stringify(online.drawable().map((p) => ({ id: p.id, name: p.name, pose: p.pose ? { x: p.pose.x, y: p.pose.y, z: p.pose.z } : null }))) : null;
    window.__probeOnline = () => ({`,
];

export const plugins = () => [
  editsPlugin(
    'online-probe-transforms',
    ONLINE_PROBE_EDITS.map((row) =>
      row.file === 'src/scenes/world.js' ? { ...row, edits: [...row.edits, PEERS_EDIT] } : row,
    ),
  ),
];

const peersOf = async (g) => JSON.parse((await g.page.evaluate(() => window.__probePeers?.())) ?? 'null') ?? [];
const statusOf = (g) => g.page.evaluate(() => window.__probeOnline?.() ?? null);

export async function run({ browser, base, ck }) {
  const t0 = Date.now();
  const lap = (what) => console.log(`   [${Math.round((Date.now() - t0) / 1000)}s] ${what}`);
  const state = mkdtempSync(join(tmpdir(), 'game-probe-online-'));
  const players = [];
  try {
    // the first save, an offline boot of the classic start composed by the world host, is made while the services start
    const composeSave = async () => {
      const compose = new Game(browser, base, {});
      try {
        await compose.open(START, { wait: 'frame' });
        await compose.until(() => compose.page.evaluate(standing), 900000);
        await compose.waitFrames(3);
        return await compose.page.evaluate(() => window.__probeSaveText());
      } finally {
        await compose.close();
      }
    };
    const [svc, saveText] = await Promise.all([standServices({ port: SVC_PORT }, state), composeSave()]);
    lap('services up and first save composed');
    const io = { fetch: localFetch({ port: svc.accountPort, ip: '10.9.9.9' }) };
    ck('the world host composes a first save', !!saveText, `${((saveText?.length ?? 0) / 1024).toFixed(0)} KB`);
    if (!saveText) return;

    /** A player: a guest, a realm character holding the save, and a page that boots online into it. */
    const join_ = async (label) => {
      const made = await io
        .fetch(`${LOAD_SERVICE}/v1/auth/guest`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ label, ...ACCEPTED }),
        })
        .then((r) => r.json());
      if (!made?.secret) throw new Error(`no guest for ${label}`);
      const pio = realmIo({
        fetch: io.fetch,
        storage: botStorage({
          [SESSION_KEY]: JSON.stringify({ secret: made.secret, id: made.id, name: made.name }),
          [SERVICE_KEY]: LOAD_SERVICE,
        }),
      });
      const c = await realmCreate(pio, made.name || label, null);
      if (!c.ok) throw new Error(`no realm character for ${label} (${c.error})`);
      const rs = createRealmSession({
        io: pio,
        id: c.data.id,
        lease: c.data.lease,
        seq: c.data.seq ?? 0,
        gzip: c.data.gzip === true,
        hidden: () => false,
        watchHidden: () => {},
      });
      const first = await rs.checkpoint(saveText);
      if (!first?.ok) throw new Error(`${label}'s first save did not land (${first?.error})`);
      const g = new Game(browser, base, {});
      players.push(g);
      g.label = label;
      g.accountName = made.name;
      await g.open(
        `/play/?world&online&realm=${c.data.id}&load&server=ws://127.0.0.1:${svc.relayPort}&novideo&shot&play`,
        {
          wait: 'frame',
          init: {
            fn: ({ sk, sv, sess, base: svcBase }) => {
              try {
                localStorage.setItem(sk, sess);
                localStorage.setItem(sv, svcBase);
              } catch {
                /* no storage */
              }
            },
            arg: {
              sk: SESSION_KEY,
              sv: SERVICE_KEY,
              sess: JSON.stringify({ secret: made.secret, id: made.id, name: made.name }),
              base: `http://127.0.0.1:${svc.accountPort}`,
            },
          },
        },
      );
      await g.until(() => g.page.evaluate(standing), 900000);
      return g;
    };

    const [a, b] = await Promise.all([join_('alice'), join_('bob')]);
    lap('both clients booted');
    const open = async (g) => g.until(async () => (await statusOf(g))?.status === 'open', 120000, 500);
    ck(
      'both clients hold an open session',
      !!(await open(a)) && !!(await open(b)),
      `${JSON.stringify(await statusOf(a))} ${JSON.stringify(await statusOf(b))}`,
    );

    // each sees the other in the room
    const sees = (g) => g.until(async () => (await peersOf(g)).length === 1, 120000, 500);
    ck('alice sees one peer', !!(await sees(a)), JSON.stringify(await peersOf(a)));
    ck('bob sees one peer', !!(await sees(b)), JSON.stringify(await peersOf(b)));

    // each sees the other move: a pose that the sender changes arrives changed
    const moves = async (mover, watcher, d) => {
      const before = (await peersOf(watcher))[0]?.pose;
      await mover.page.evaluate((d) => {
        const p = window.__player.pos;
        window.__warpTo([p[0] + d, p[1], p[2] + d], 1.5);
      }, d);
      const seen = await watcher.until(
        async () => {
          const now = (await peersOf(watcher))[0]?.pose;
          return now && before && Math.hypot(now.x - before.x, now.z - before.z) > 5 ? now : null;
        },
        60000,
        500,
      );
      return { before, seen };
    };
    const m1 = await moves(a, b, 30);
    ck('bob sees alice move', !!m1.seen, `${JSON.stringify(m1.before)} -> ${JSON.stringify(m1.seen)}`);
    const m2 = await moves(b, a, -30);
    ck('alice sees bob move', !!m2.seen, `${JSON.stringify(m2.before)} -> ${JSON.stringify(m2.seen)}`);

    // one chat line: typed in alice's chat field (Enter focuses it, Enter sends), read from bob's chat log
    const line = `probe line ${Math.random().toString(36).slice(2, 8)}`;
    // the opening story page of the classic start holds the keys: put it away first, as a player does
    for (const g of [a, b]) {
      for (let i = 0; i < 12 && (await g.overlayKind()); i++) {
        await g.page.waitForTimeout(600);
        await g.key(i % 2 ? 'Escape' : 'Enter');
      }
    }
    const say = async (g) => {
      await g.page.keyboard.press('Enter');
      // the key is handled on a frame, and a frame takes seconds in software GL: type only once the field has the focus,
      // or the letters fall on the key bindings (the journal opens)
      await g.until(
        () => g.page.evaluate(() => ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)),
        120000,
        250,
      );
      await g.page.keyboard.type(line, { delay: 20 });
      await g.page.keyboard.press('Enter');
    };
    await say(a);
    // a first line is held behind the code of conduct (SAFE1): agree to it, then say the line again
    const agree = a.page.getByRole('button', { name: 'I agree' });
    if (
      await agree.waitFor({ timeout: 60000 }).then(
        () => true,
        () => false,
      )
    ) {
      // world notices float over the card in CI's slow frames; click the button itself, not the point it covers
      await agree.evaluate((b) => b.click());
      await sleep(800);
      await say(a);
    }
    await a.shot('07-alice-chat');
    const heard = await b.until(() => b.page.evaluate((t) => document.body.innerText.includes(t), line), 180000, 500);
    await b.shot('07-bob-chat');
    ck('the chat line reaches bob', !!heard, line);
    const sent = await a.page.evaluate((t) => document.body.innerText.includes(t), line);
    ck("and stands in alice's own log", sent, line);

    for (const g of players) g.noErrors(ck, `${g.label}'s page`);
  } finally {
    for (const g of players) await g.close();
    try {
      stopAll();
    } catch {
      /* gone */
    }
    try {
      rmSync(state, { recursive: true, force: true });
    } catch {
      /* gone */
    }
  }
}
