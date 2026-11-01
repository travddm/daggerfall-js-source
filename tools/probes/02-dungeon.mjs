// Probe 2: chargen to a new character, the starting dungeon, a kill, the loot, the way out.
//
// The real chargen wizard (keyboard, as tools/firstHourProbe.mjs drives it), then the hooks of `?shot`:
// `__foes`/`__damageFoe` (the game's own damage door, which mints the corpse and rolls the loot), `__lootTargets`/
// `__takeLoot` (the loot door a press makes), `__warpTo` + `__dungeonExit` (the exit door's own activation).
import { Game } from './lib/harness.mjs';

export const name = 'dungeon';

const KEYBOUND_WINDOWS = /Automap|CharSheet|Inventory|Spellbook|Rest|Journal|Notebook|Pause|TravelMap/i;

export async function run({ browser, base, ck }) {
  const g = new Game(browser, base);
  try {
    // the classic start: the world host at the settings' start cell, with the real chargen wizard
    await g.open('/play/?world&shot&classic&skin=classic&novideo&play', { wait: 'mode' });
    ck('a new game opens on the race screen', await g.until(() => g.page.evaluate(() => window.__chargenFlow?.()?.state === 'race'), 120000));

    // The wizard's boxes have no default button (DaggerfallMessageBox): Y confirms a race or class, M picks male.
    // The driver reads the flow's own state and presses what that state takes, and fails when a state does not move.
    const flow = () => g.page.evaluate(() => { const f = window.__chargenFlow?.(); return f ? { state: f.state, box: !!(f.raceConfirm || f.classConfirm || f.qConfirm || f.biogRepBox) } : null; });
    const seen = [];
    const spend = async () => { for (let i = 0; i < 30; i++) await g.page.keyboard.press('='); await g.waitFrames(2); };
    let stuck = 0, last = '';
    for (let step = 0; step < 80; step++) {
      const f = await flow();
      if (!f) break;
      const tag = f.state + (f.box ? '+box' : '');
      if (seen[seen.length - 1] !== f.state) seen.push(f.state);
      stuck = tag === last ? stuck + 1 : 0;
      last = tag;
      if (stuck > 4) break;
      if (f.state === 'race' || f.state === 'class') await g.key(f.box ? 'y' : 'Enter', 4);
      else if (f.state === 'gender') await g.key('m', 4);
      else if (f.state === 'name') { for (const c of 'MAC') await g.key(c); await g.key('Enter', 4); }
      else if (f.state === 'stats') { await spend(); await g.key('Enter', 4); }
      else if (f.state === 'skills') { for (let row = 0; row < 9; row++) { await spend(); await g.page.keyboard.press('ArrowDown'); } await g.key('Enter', 4); }
      else await g.key('Enter', 4);
    }
    ck('the wizard walks race, sex, class, history, name, face, stats and skills',
      ['race', 'gender', 'class', 'name', 'face', 'stats', 'skills'].every((s) => seen.includes(s)), seen.join(' > ') + (stuck > 4 ? ` (stuck at ${last})` : ''));

    const born = await g.entity();
    ck('chargen made a character', born.chargenDone && born.name === 'MAC' && born.maxHealth > 0, `${born.name}, hp ${born.maxHealth}`);
    ck('the character has gear', born.items >= 4, `${born.items} items`);
    ck('the character starts at full health', born.health === born.maxHealth, `${born.health}/${born.maxHealth}`);
    const stray = await g.overlayKind();
    ck('finishing chargen opens no window a key binding would open', !KEYBOUND_WINDOWS.test(stray ?? ''), `overlay: ${stray ?? 'none'}`);
    // a modal holds the dungeon's clock; read the opening quest box and put it away like a player
    // the page ignores a key pressed in its first moments, so wait in real time between presses
    for (let i = 0; i < 12 && await g.overlayKind(); i++) { await g.page.waitForTimeout(600); await g.key(i % 2 ? 'Escape' : 'Enter'); }
    console.log('   flow:', await g.page.evaluate(() => window.__serviceFlow?.())); await g.shot('02-opening');
    ck('the opening box can be dismissed', (await g.overlayKind()) === null, `still up: ${await g.overlayKind()}`);

    ck('the new game begins inside the starting dungeon', (await g.mode()) === 'dungeon', await g.mode());
    const dungeon = await g.J(() => window.__dungeon());
    ck('the dungeon has a way out', (dungeon?.exits?.length ?? 0) > 0, `${dungeon?.exits?.length ?? 0} exit(s)`);
    const foes = await g.J(() => window.__foes());
    const target = (foes ?? []).find((f) => !f.dead && f.pos);
    ck('the dungeon holds a live foe', !!target, `${foes?.length ?? 0} foes`);

    // move: through the motor, to a point on the line between the player and the foe
    if (target) {
      const here = await g.J(() => JSON.stringify(window.__player.pos));
      const [fx, fy, fz] = target.pos;
      let dx = here[0] - fx, dz = here[2] - fz;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len; dz /= len;
      const back = Math.min(3, len * 0.6);
      await g.page.evaluate(([p, y]) => window.__warpTo(p, y), [[fx + dx * back, fy + 0.4, fz + dz * back], Math.atan2(-dx, -dz)]);
      await g.waitFrames(3);
      const there = await g.J(() => JSON.stringify(window.__player.pos));
      ck('the player moved', Math.hypot(there[0] - here[0], there[2] - here[2]) > 0.1, `${here.map((v) => v.toFixed(1))} -> ${there.map((v) => v.toFixed(1))}`);

      const dead = await g.J((i) => window.__damageFoe(i, 9999), target.i);
      ck('the foe dies through the damage door', !!dead?.dead, `health ${dead?.health}`);
      const corpsed = await g.until(async () => (await g.J(() => window.__foes()))[target.i]?.corpse, 30000);
      ck('the dead foe leaves a corpse', !!corpsed);

      const targets = await g.J(() => window.__lootTargets());
      const corpseKey = `corpse:${target.i}`;
      console.log('   targets:', JSON.stringify(targets), JSON.stringify(foes[target.i]), JSON.stringify((await g.J(() => window.__foes()))[target.i]));
      ck('the corpse is a loot target', (targets ?? []).includes(corpseKey), `${(targets ?? []).length} target(s)`);
      const before = await g.entity();
      const held = await g.page.evaluate((k) => window.__takeLoot(k), corpseKey);
      ck('the corpse holds loot', held > 0, `${held} item(s)`);
      await g.waitFrames(4);
      ck('reaching in opens the container window', /Inventory/i.test((await g.overlayKind()) ?? ''), await g.overlayKind());
      if (held > 0) {
        await g.page.evaluate(() => window.__dungeonPickRemote(0));
        await g.waitFrames(3);
        const after = await g.entity();
        ck('an item moves into the pack', after.items > before.items || after.gold > before.gold,
          `${before.items} items/${before.gold}g -> ${after.items} items/${after.gold}g`);
      }
      await g.key('Escape', 4);
    }

    if (dungeon?.exits?.length) {
      const { pos, normal } = dungeon.exits[0];
      await g.page.evaluate(([p, y]) => window.__warpTo(p, y), [
        [pos[0] + normal[0] * 0.8, pos[1] - 0.5, pos[2] + normal[2] * 0.8], Math.atan2(-normal[0], -normal[2]),
      ]);
      await g.waitFrames(2);
      ck('the exit door answers the activation', (await g.page.evaluate(() => window.__dungeonExit())) === true);
      const out = await g.until(async () => (await g.mode()) === 'exterior', 120000);
      ck('the player stands in the world', !!out, await g.mode());
    }
    const e = await g.entity();
    ck('the character is alive at the end', e.health > 0 && e.health <= e.maxHealth, `hp ${e.health}/${e.maxHealth}`);
    g.noErrors(ck, 'chargen, the dungeon and the way out');
  } finally {
    await g.close();
  }
}
