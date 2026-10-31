// BOOT-OVERLAP (2026-10-12, a player's launch into the world captured from the live client; bible/07-Rendering/
// Performance-Priority.md BOOT-OVERLAP) - THE BOOT'S NETWORK, ASKED BESIDE ITS WORK. From the character's click to the
// boot's last step the main thread waited on the network 7.5 s of 12.2: the realm's lines and then its roster one after
// the other, the homes' layouts only after the data's read, and each town the boot builds waiting on its homes in turn.
// The lines and the roster are asked at once and read behind the boot, waited for where Project Legacy's host is made;
// the layouts go out above the data's read; the towns the boot builds (its start and a realm save's own place) are asked
// at once as the save's character - `onlineHomes.ensure`'s `character`, so the tenancies that ride the answer are the
// ones the arrival would have asked for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createOnlineHomes } from '../../../src/systems/online/onlineHomes.js';
import { hostText } from '../../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole

const src = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');

/** A homes door that records each town asked and answers it when told (`answer()`), as the service would. */
function door() {
  const asked = [];
  const waiting = [];
  return {
    asked,
    answer: () => { for (const w of waiting.splice(0)) w({ ok: true, data: { homes: [{ buildingKey: 7, owner: 'Ann', mine: false }] } }); },
    town: (mapId, character) => { asked.push([mapId, character]); return new Promise((res) => waiting.push(res)); },
  };
}

test('BOOT-OVERLAP ensure asks as the character named, or as the one playing when none is named - null named is none, and the town known once answered (mutants: the named character ignored, the playing one never asked)', async () => {
  const api = door();
  const homes = createOnlineHomes({ api, character: () => 'playing' });
  const a = homes.ensure(1001, { character: 'realm-7' });
  const b = homes.ensure(1002);
  const c = homes.ensure(1003, { character: null });
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(api.asked, [[1001, 'realm-7'], [1002, 'playing'], [1003, null]]);
  api.answer();
  assert.deepEqual(await Promise.all([a, b, c]), [true, true, true]);
  assert.equal(homes.homesIn(1001)?.get(7)?.owner, 'Ann');
});

test('BOOT-OVERLAP a town the boot asked early is the build\'s - a build that waits on it while it flies, or asks it once answered, asks nothing again (mutants: the build asking a second time)', async () => {
  const api = door();
  const homes = createOnlineHomes({ api, character: () => 'playing' });
  const early = homes.ensure(2001, { character: 'realm-7' });
  await Promise.resolve(); await Promise.resolve();
  const build = homes.waitFor(2001, 5_000);   // the build's wait, as world.js buildPixel waits on a town never heard
  api.answer();
  assert.equal(await early, true);
  assert.equal(await build, true);
  assert.equal(homes.known(2001), true);
  await homes.ensure(2001);   // a build of a town heard: fresh, nothing asked
  assert.deepEqual(api.asked, [[2001, 'realm-7']]);
});

