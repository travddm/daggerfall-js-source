// @ts-check
// ETHER-SEA: the Features row for the Eltheric Sea, a second ocean past the Veil (world/ethericSea.js) reached by a crossing
// from the open Abecean. Daggerfall Unity has no second sea, so it is a feature of its own: off offline until the player
// turns it on (the crossing is offered on the enhanced skin only), forced on online (one world for the room). The world
// host reads it once, at its mount (scenes/shared.js etherSeaOn); `?ether=off` is the kill door. Its own file keeps
// systems/features.js from growing (docs/testing/lint-ratchet.md).
import { t } from './textManager.js';

export const ELTHERIC_SEA_ROW = Object.freeze({
  id: 'eltheric-sea',
  group: 'world',
  get title() {
    return t('features.elthericSea.title', 'Eltheric Sea');
  },
  get note() {
    return t(
      'features.elthericSea.note',
      'A second ocean past the Veil, reached by sailing out from the open Abecean Sea: isles to chart, strands to gather, legends to hunt. Off leaves the one sea of the Iliac Bay.',
    );
  },
  get effect() {
    return t('features.elthericSea.effect', 'Takes effect the next time the world loads. Online it is always on.');
  },
  kinds: Object.freeze(['enhanced']),
  control: Object.freeze({ store: 'prefs', key: 'etherSea', initial: false, online: true }),
});
