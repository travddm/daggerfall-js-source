// @ts-check
// PORTENT-FOLD: the Features row for what a Dagon's Breach portent pays. Daggerfall Unity has no gates, so a plain night
// is the baseline: off, a portent night's spoils are a plain night's. On, each portent turns one of the two plain
// Magic-or-better pieces into a Rare-or-better one (gateSpoils.js rollSpoils), never a piece more. It changes play, so the
// online lane forces it on (one rule for the room; the gate is online only). Read where the spoils are listed
// (scenes/spoilsPool.js spoilsList). Its own file keeps systems/features.js from growing (docs/testing/lint-ratchet.md).
import { t } from './textManager.js';

export const GATE_PORTENT_LOOT_ROW = Object.freeze({
  id: 'gate-portent-loot',
  group: 'loot',
  get title() {
    return t('features.gatePortentLoot.title', 'Breach portent loot');
  },
  get note() {
    return t(
      'features.gatePortentLoot.note',
      'On a night with portents, each portent makes one of the Breach boss pieces Rare or better. Off, the night pays what a plain night pays.',
    );
  },
  get effect() {
    return t('features.gatePortentLoot.effect', 'Takes effect at once. Online it is always on.');
  },
  kinds: Object.freeze(['enhanced']),
  control: Object.freeze({ store: 'prefs', key: 'gatePortentLoot', initial: true, online: true }),
});
