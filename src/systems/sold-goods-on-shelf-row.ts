// The Features row for where sold goods go (systems/shop-shelf-rule.ts reads its pref). Off is DFU's: a sold piece
// is gone. On, it lands on the shop's open shelf until the next restock and can be bought back. Pinned off online.
import { t } from './textManager.js';

export const SOLD_GOODS_ON_SHELF_ROW = Object.freeze({
  id: 'sold-goods-on-shelf',
  group: 'world',
  get title(): string {
    return t('features.soldGoodsOnShelf.title', 'Sold goods stay on the shelf');
  },
  get note(): string {
    return t(
      'features.soldGoodsOnShelf.note',
      'A piece you sell stays on the shop shelf until the next restock, so you can buy it back. Off is the original: sold goods are gone. Online it is always off.',
    );
  },
  get effect(): string {
    return t('features.soldGoodsOnShelf.effect', 'Takes effect at the next sale.');
  },
  kinds: Object.freeze(['enhanced']),
  control: Object.freeze({ store: 'prefs', key: 'soldGoodsOnShelf', initial: false, online: 'room' }),
});
