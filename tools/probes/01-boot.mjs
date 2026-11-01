// Probe 1: the page boots to the main menu with no console errors.
//
// `/play/index.html` opens on the front door (intro, then the main menu). The probe skips the intro as a player does
// and waits for the menu's own buttons.
import { Game } from './lib/harness.mjs';

export const name = 'boot';

const buttons = (g) => g.page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent.replace(/[◆◇]/g, '').trim()).filter(Boolean));

export async function run({ browser, base, ck }) {
  const g = new Game(browser, base);
  try {
    await g.open('/play/index.html', { wait: false });
    const door = await g.until(async () => ((await buttons(g)).length ? await buttons(g) : null), 60000);
    ck('the front door draws its buttons', !!door, (door ?? []).join(' / '));
    const skip = g.page.getByRole('button', { name: /skip intro/i });
    if (await skip.count()) { await skip.first().click(); await g.page.waitForTimeout(1500); }
    const menu = await g.until(async () => { const b = await buttons(g); return b.some((t) => /^offline/i.test(t)) && b.some((t) => /^online/i.test(t)) ? b : null; }, 60000);
    ck('the main menu offers Online and Offline', !!menu, (menu ?? await buttons(g)).join(' / '));
    await g.shot('01-menu');
    await g.page.waitForTimeout(2000);
    g.noErrors(ck, 'the menu');
  } finally {
    await g.close();
  }
}
