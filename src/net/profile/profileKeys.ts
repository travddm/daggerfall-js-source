// The key registry: one row per online rule a profile may set, each with DFU's value and today's online value. Data and
// pure functions only, because the account Worker reads it: `offline` names a setting, and `words` is an l10n key. The
// relay does not bundle it; the client checks a fetched profile against it.

export type ProfileValue = boolean | number | string;

/** Where a key's single-player value comes from: a constant, or the player's own DFU setting (`Section.Key`). */
export type OfflineValue = ProfileValue | { readonly setting: string };

export type ProfileKey = {
  /** The online census rows the key covers (dfu-gaps-audit/slice-online.md). */
  readonly census: readonly string[];
  /** The feature or mod the departure belongs to. */
  readonly feature: string;
  readonly type: 'bool' | 'int' | 'number' | 'enum' | 'string';
  readonly values?: readonly string[];
  readonly min?: number;
  readonly max?: number;
  /** Daggerfall Unity's value. */
  readonly dfu: ProfileValue;
  /** Today's online value: the default a profile that names no value plays by. */
  readonly online: ProfileValue;
  readonly offline: OfflineValue;
  /** Who reads the key: the client always; the relay and the account Worker where they check it. */
  readonly checkedBy: readonly ('client' | 'relay' | 'account')[];
  /** The l10n key of the label the options screen and a refusal show. */
  readonly words: string;
  /** A DFU setting the key forces online, as `Section.Key`; the settings read path answers its value in DFU's strings. */
  readonly setting?: string;
};

export const PROFILE_KEYS = Object.freeze({
  // Whether a smith mends enchanted gear: every player meets the same counter, so the room holds one answer. DFU ships
  // False (defaults.ini AllowMagicRepairs).
  'repair.allowMagic': Object.freeze({
    census: Object.freeze(['ON60'] as const),
    feature: 'DISC22-A',
    type: 'bool',
    dfu: false,
    online: true,
    offline: Object.freeze({ setting: 'Controls.AllowMagicRepairs' }),
    checkedBy: Object.freeze(['client'] as const),
    words: 'profile.repair.allowMagic',
    setting: 'Controls.AllowMagicRepairs',
  }),
  // Whether a shop's offer for a sale is capped online at half of what the counter asks the best haggler, with the
  // seller's skills at half weight under it (shopStock.js calculateTradePrice). DFU has no cap: a poor shop pays more
  // for goods, and Mercantile and Personality move a sale at full weight (FormulaHelper.CalculateTradePrice). Buying
  // back a counter's own piece for profit stays shut by the counter-paid mark, which this key does not touch.
  'trade.saleCap': Object.freeze({
    census: Object.freeze(['ON2'] as const),
    feature: 'REALM-P0.4',
    type: 'bool',
    dfu: false,
    online: false,
    offline: false,
    checkedBy: Object.freeze(['client'] as const),
    words: 'profile.trade.saleCap',
  }),
  // Whether the haggle reads Mercantile and Personality inside 0 to 100 online. DFU reads them unbounded, so a skill
  // raised past 100 by enchantments drives a price under nothing (FormulaHelper.CalculateTradePrice).
  'trade.haggleRange': Object.freeze({
    census: Object.freeze(['ON3'] as const),
    feature: 'MERC-CAP',
    type: 'bool',
    dfu: false,
    online: true,
    offline: false,
    checkedBy: Object.freeze(['client'] as const),
    words: 'profile.trade.haggleRange',
  }),
  // How a dungeon treasure pile's gold is scaled online. DFU rolls it times the player's level
  // (LootTables.GenerateLoot); 'flat' divides it back to level 1's (loot.js unlevelPileGold), so the hourly respawn
  // does not pay a high level's gold again.
  'loot.pileGold': Object.freeze({
    census: Object.freeze(['ON16'] as const),
    feature: 'REALM-P0.4',
    type: 'enum',
    values: Object.freeze(['dfu', 'flat'] as const),
    dfu: 'dfu',
    online: 'dfu',
    offline: 'dfu',
    checkedBy: Object.freeze(['client'] as const),
    words: 'profile.loot.pileGold',
  }),
  // How a rest works online. DFU's Rest window rests wherever CanRest allows, for the hours chosen or a loiter, and
  // each hour gives what DFU's recovery rates give (DaggerfallRestWindow.cs); online the hours are the character's own.
  // True is the rest act (systems/rest/restAct.js): only at a fire or a bed, one 8-hour night at most every 2 hours of
  // the character's time, a short rest between, and either ends with health, fatigue and magicka full.
  'rest.fireOnly': Object.freeze({
    census: Object.freeze(['ON26'] as const),
    feature: 'REST1',
    type: 'bool',
    dfu: false,
    online: false,
    offline: false,
    checkedBy: Object.freeze(['client'] as const),
    words: 'profile.rest.fireOnly',
  }),
  // Whether a guild review online promotes at once while the Roll paces the reputation. DFU waits 28 days between rank
  // changes (Guild.cs UpdateRank); online the days are the character's own (systems/guild/guild-rank-rule.ts).
  'guild.promoteNow': Object.freeze({
    census: Object.freeze(['ON35'] as const),
    feature: 'PROMO-NOW',
    type: 'bool',
    dfu: false,
    online: false,
    offline: false,
    checkedBy: Object.freeze(['client'] as const),
    words: 'profile.guild.promoteNow',
  }),
  // Whether chapter chairs won by Merit hold guild ranks 8 and 9 online, a member's own book stopping at 7. DFU's ranks 8
  // and 9 are earned by reputation and skill as the others are, and their services follow the rank (Guild.cs
  // CalculateNewRank; MagesGuild.cs CanAccessService).
  'guild.seatRanks': Object.freeze({
    census: Object.freeze(['ON35'] as const),
    feature: 'CHAP4b',
    type: 'bool',
    dfu: false,
    online: false,
    offline: false,
    checkedBy: Object.freeze(['client'] as const),
    words: 'profile.guild.seatRanks',
  }),
} satisfies Record<string, ProfileKey>);

export type ProfileKeyName = keyof typeof PROFILE_KEYS;

/** The registry's row for `name`, or null for a name it does not hold. */
export function profileKeyOf(name: string): ProfileKey | null {
  return Object.hasOwn(PROFILE_KEYS, name) ? (PROFILE_KEYS as Record<string, ProfileKey>)[name] : null;
}

/** Does `value` fit the key's type and bounds? */
export function validProfileValue(key: ProfileKey, value: unknown): boolean {
  switch (key.type) {
    case 'bool':
      return typeof value === 'boolean';
    case 'int':
      return Number.isSafeInteger(value) && inBounds(key, value as number);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) && inBounds(key, value);
    case 'enum':
      return typeof value === 'string' && (key.values ?? []).includes(value);
    case 'string':
      return typeof value === 'string';
  }
  return false;
}

function inBounds(key: ProfileKey, value: number): boolean {
  return (key.min === undefined || value >= key.min) && (key.max === undefined || value <= key.max);
}

/** The schema this build reads. A profile of another schema is refused at the front door. */
export const PROFILE_SCHEMA = 1;

/**
 * What is wrong with a profile's rules, for this build: a schema it does not read, a key it does not know (a newer
 * server), a value the key does not take. Empty when the profile is one this build can play.
 */
export function profileRuleErrors(profile: unknown): string[] {
  if (!profile || typeof profile !== 'object') return ['not a profile'];
  const p = profile as { schema?: unknown; rules?: unknown };
  if (p.schema !== PROFILE_SCHEMA) return [`schema ${String(p.schema)}`];
  const rules = p.rules ?? {};
  if (typeof rules !== 'object' || Array.isArray(rules)) return ['rules is not an object'];
  const errors: string[] = [];
  for (const [name, value] of Object.entries(rules)) {
    const key = profileKeyOf(name);
    if (!key) errors.push(`unknown key ${name}`);
    else if (!validProfileValue(key, value)) errors.push(`bad value for ${name}`);
  }
  return errors;
}

/** Every key's value under a profile: its written value, else the key's online default. */
export function resolveRules(rules: Readonly<Record<string, ProfileValue>> = {}): Record<string, ProfileValue> {
  const out: Record<string, ProfileValue> = {};
  for (const [name, key] of Object.entries(PROFILE_KEYS) as [string, ProfileKey][]) {
    out[name] = Object.hasOwn(rules, name) ? rules[name] : key.online;
  }
  return out;
}
