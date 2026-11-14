// The Features row for a city gate's floor face. Its own file keeps systems/features.js from growing
// (docs/testing/lint-ratchet.md). The slab's collider is 5 cm tall, so the option is a client look.
import { t } from './textManager.js';

export const GATE_FLOOR_ROW = Object.freeze({
  id: 'gate-floor-hidden',
  group: 'world',
  get title() {
    return t('features.gateFloorHidden.title', 'Open city gates');
  },
  get note() {
    return t(
      'features.gateFloorHidden.note',
      'Where a road runs through a city gate, the road shows under the arch. Off draws the flat slab Daggerfall lays under every gate, over the road.',
    );
  },
  get effect() {
    return t('features.effect.worldLoads', 'Takes effect when the world next loads.');
  },
  kinds: Object.freeze(['enhanced']),
  control: Object.freeze({ store: 'prefs', key: 'gateFloorHidden', initial: true, online: 'player' }),
});
