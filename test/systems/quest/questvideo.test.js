// QV1 - THE QUEST VIDEO DOOR. PlayVideo's parse law was
// pinned at Q2b (questactions.test.js) and the machine's playVideo
// hook has carried the name since Q4-v - into a console.warn saying
// the seam "pends". TEN corpus quests write `play video N` (the
// main-quest ANIMs), so a shipped line dead-ended at a warn. The door
// is the infection lane's own player mount now (ui/videoPlayer, the
// DaggerfallVidPlayerWindow shape), with DFU's own flag:
// EndOnAnyKey = false (PlayVideo.cs:78), Escape still skipping any
// video (AUDIT 26 F151's disjunct law, pinned in videoPlayer).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadQuestTables } from '../../../src/systems/quest/tables.js';
import { QuestMachine } from '../../../src/systems/quest/machine.js';
import { PlayVideo } from '../../../src/systems/quest/actions.js';
import { hostText } from '../../hostText.mjs';   // HOST-SPLIT 2 (AUDIT, the second read): its negatives read the host whole

const VENDOR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'vendor', 'dfu-quests');
const read = (p) => readFileSync(p, 'utf8').replace(/^﻿/, '');
const sources = {};
for (const f of readdirSync(join(VENDOR, 'Tables'))) {
  if (f.endsWith('.txt')) sources[f.replace('.txt', '')] = read(join(VENDOR, 'Tables', f));
}
loadQuestTables(sources);

test('QV1: every corpus `play video` line parses to its ANIM name - ten of them', () => {
  const seen = new Map();
  for (const f of readdirSync(join(VENDOR, 'Quests'))) {
    if (!f.endsWith('.txt')) continue;
    for (const line of read(join(VENDOR, 'Quests', f)).split('\n')) {
      const t = line.trim();
      if (!t.startsWith('play video ')) continue;
      const action = new PlayVideo(null).createNew(t, null);
      assert.ok(action, `${f}: '${t}' must mint a PlayVideo`);
      seen.set(action.videoName, f);
    }
  }
  // the main-quest set, zero-padded to four exactly as PlayVideo.cs
  assert.deepEqual([...seen.keys()].sort(), [
    'ANIM0003.VID', 'ANIM0005.VID', 'ANIM0006.VID', 'ANIM0007.VID',
    'ANIM0008.VID', 'ANIM0009.VID', 'ANIM0010.VID', 'ANIM0013.VID',
    'ANIM0014.VID', 'ANIM0015.VID',
  ], 'the ten shipped quest videos, by their padded names');
});

test('QV1: the machine hands the name to the playVideo hook and the action completes', () => {
  const played = [];
  const m = new QuestMachine({
    nowSeconds: () => 0,
    world: {
      currentRegionIndex: () => 0,
      isPlayerInLocationRect: () => true,
      currentLocation: () => ({ loaded: true, mapTableData: { locationType: 0 } }),
      getFactionData: () => null,
    },
    playerEntity: { isPlayer: true, level: 5, activeEffects: [] },
    playVideo: (name) => played.push(name),
  });
  const q = m.scheduleQuest([
    'Quest: __QV1', 'QRC:', 'Message:  1011', ' x', '', 'QBN:',
    'play video 5', '',
  ], 0, { rolls: () => 0.4 });
  m.tick();
  assert.deepEqual(played, ['ANIM0005.VID']);
  const startup = [...q.tasks.values()].find((t) => t.actions.some((a) => a instanceof PlayVideo));
  assert.equal(startup.actions.find((a) => a instanceof PlayVideo).isComplete, true,
    'SetComplete runs at the push, exactly as PlayVideo.cs:81');
});

