// Probe 6: every pane of the pause menu opens and closes without errors, on the default (enhanced) skin.
//
// Escape in the running town opens the pause door (`#enhanced-pause`). Its top tabs (Quests, Stats, ...) and the side rows
// of each tab (`.px-qrow`) are each clicked once; every pane must draw text. Rows that leave the game (Resume, Exit) are
// not clicked, and neither are a pane's own action buttons (Save, Load). Escape must close the door and give the game back.
import { Game } from './lib/harness.mjs';
import { enterTown } from './lib/town.mjs';

export const name = 'pause';

const LEAVES_THE_GAME = /resume|exit|quit|leave/i;
const URL = '/play/?world&region=Daggerfall&loc=Daggerfall&class=1&novideo&play&shot&tod=12:00';

const clean = (t) => t.replace(/[◆◇]/g, '').trim();

export async function run({ browser, base, ck }) {
  const g = new Game(browser, base);
  try {
    await enterTown(g, URL);
    // a quest box at the start swallows Escape; put it away first
    for (let i = 0; i < 8 && await g.overlayKind(); i++) await g.key('Escape', 3);
    const up = () => g.page.evaluate(() => !!document.getElementById('enhanced-pause'));
    const labelsOf = (sel) => g.page.$$eval(sel, (ns) => ns.map((n) => n.textContent));
    const TABS = '#enhanced-pause button:not(.px-qrow):not(.act):not(.px-profile)';
    const ROWS = '#enhanced-pause .px-qrow';
    /** Clicks the nth button of `sel` and reads how much the door draws. */
    const open = async (sel, i) => {
      await g.page.locator(sel).nth(i).click();
      await g.page.waitForTimeout(400);
      return g.page.evaluate(() => {
        const root = document.getElementById('enhanced-pause');
        const r = root?.getBoundingClientRect();
        return { up: !!root, text: (root?.innerText ?? '').replace(/\s+/g, ' ').length, w: Math.round(r?.width ?? 0), h: Math.round(r?.height ?? 0) };
      });
    };
    const drawn = (p) => p.up && p.text > 40 && p.w > 100 && p.h > 100;

    await g.key('Escape', 6);
    ck('Escape opens the pause menu', await g.until(up, 15000));
    await g.page.waitForSelector(TABS, { timeout: 15000 }).catch(() => {});
    const tabs = (await labelsOf(TABS)).map(clean);
    ck('the menu has its tabs', tabs.length >= 5, tabs.join(' / '));
    await g.shot('06-pause');

    let panes = 0;
    for (let t = 0; t < tabs.length; t++) {
      const p = await open(TABS, t);
      ck(`the "${tabs[t]}" tab opens and draws`, drawn(p), `${p.text} chars, ${p.w}x${p.h}`);
      panes++;
      const rows = (await labelsOf(ROWS)).map(clean);
      // the Tutorials tab alone has dozens of rows: the first three, the middle one and the last two stand for them
      const picked = rows.length > 8 ? [0, 1, 2, Math.floor(rows.length / 2), rows.length - 2, rows.length - 1] : rows.map((_, r) => r);
      for (const r of picked) {
        if (LEAVES_THE_GAME.test(rows[r])) continue;
        const q = await open(ROWS, r);
        ck(`"${tabs[t]}" > "${rows[r]}" opens and draws`, drawn(q), `${q.text} chars`);
        panes++;
      }
    }
    ck('a handful of panes were opened', panes >= 8, `${panes} panes`);

    await g.key('Escape', 6);
    ck('Escape closes the pause menu', !(await up()));
    const e = await g.entity();
    ck('the game resumes with the character alive', e.health > 0 && (await g.mode()) === 'exterior', `${await g.mode()}, hp ${e.health}`);
    const f0 = await g.frame();
    await g.waitFrames(10);
    ck('the frame loop runs again', (await g.frame()) > f0);
    g.noErrors(ck, 'the pause menu');
  } finally {
    await g.close();
  }
}
