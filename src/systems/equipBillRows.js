// @ts-check
// The two Features rows over what putting on a Cast-When-Held piece costs (systems/equipBill.js reads their
// prefs). Off is DFU's: the held spell's whole casting cost in condition at every equip, and it can break the piece.
// Online the room's answers are the server profile's. Their own file keeps systems/features.js from growing.
import { t } from './textManager.js';

export const LEGENDARY_EQUIP_FREE_ROW = Object.freeze({
  id: 'legendary-equip-free',
  group: 'character',
  get title() {
    return t('features.legendaryEquipFree.title', 'Legendary items equip free');
  },
  get note() {
    return t(
      'features.legendaryEquipFree.note',
      'A Legendary item with a held spell costs no condition when you put it on. Off is the original: it pays the spell cost like other items. Online the server sets it.',
    );
  },
  get effect() {
    return t('features.legendaryEquipFree.effect', 'Takes effect the next time you equip an item.');
  },
  kinds: Object.freeze(['enhanced']),
  control: Object.freeze({ store: 'prefs', key: 'legendaryEquipFree', initial: false, online: 'room' }),
});

export const GENTLE_EQUIP_BILL_ROW = Object.freeze({
  id: 'gentle-equip-bill',
  group: 'character',
  get title() {
    return t('features.gentleEquipBill.title', 'Equipping never breaks items');
  },
  get note() {
    return t(
      'features.gentleEquipBill.note',
      'An item with a held spell keeps at least 1 condition when you put it on, and costs nothing if worn in the last six hours. Off is the original: every equip pays and can break it. Online the server sets it.',
    );
  },
  get effect() {
    return t('features.gentleEquipBill.effect', 'Takes effect the next time you equip an item.');
  },
  kinds: Object.freeze(['enhanced']),
  control: Object.freeze({ store: 'prefs', key: 'gentleEquipBill', initial: false, online: 'room' }),
});
