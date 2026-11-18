// What the account service's refusals of a house changing hands say to the player (server-account/src/homeTransfer.js).
// accountClient.js spreads these into its refusal table.
import { t } from '../systems/textManager.js';

export const HOME_TRANSFER_REFUSAL_WORDS: Record<string, () => string> = {
  'home-holds': () => t('account.refusal.homeHolds', 'Take the goods out before the house changes hands.'),
  'bad-offer': () => t('account.refusal.badOffer', 'That offer could not be read.'),
  'home-deed': () => t('account.refusal.homeDeed', 'A house given by a knightly order cannot be transferred.'),
  'offer-open': () => t('account.refusal.offerOpen', 'An offer for this house is already out.'),
  'offer-closed': () => t('account.refusal.offerClosed', 'That offer is no longer open.'),
  'offer-stale': () => t('account.refusal.offerStale', 'The room changed. Make the offer again.'),
};
