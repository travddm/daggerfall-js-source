// The five daily Marks caps, driven through the real routes to the cap and one act past it. Each runs twice: with the
// Marks ledger kept, and with every ledger line deleted as soon as its request answers. The second run stands for a
// server that keeps no history, so a cap that still sums the ledger lets the act past the cap through.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Loaded by computed paths: Node's type pass would otherwise follow them into the account service, which it cannot type.
const accountDbModule = '../accountDb.mjs';
const marksLawModule = '../../src/net/marksLaw.js';
const nodeLawModule = '../../src/net/nodeLaw.js';
const wireModule = '../../src/net/wire.js';
const gateReceiptModule = '../../src/net/gate/gateReceipt.js';
const raidReceiptModule = '../../src/net/raid/raidReceipt.js';
const { standService } = await import(accountDbModule);
const { MARKS_BANK, MARKS_COMBAT, MARKS_FAUCETS, utcDay } = await import(marksLawModule);
const { herbPatches, nodeKey, WITNESS } = await import(nodeLawModule);
const { sharedClassicMinutes } = await import(wireModule);
const { mintReceipt } = await import(gateReceiptModule);
const { mintRaidReceipt } = await import(raidReceiptModule);

type Account = { secret: string; id: string; handle: string; character: string };
type Answer = { status: number; body: Record<string, any> };
type HerbPatch = { x: number; y: number; slot: number; tier: number };
type HistoryMode = 'kept' | 'deleted';

const DAY_S = 86_400;
const WOODS_CLIMATE = 231;
const ANTICLERE_REGION = 21;
const DAGGERFALL_REGION = 17;
const GUILD_FOUND_TENURE_S = 8 * DAY_S;
const { subtle } = globalThis.crypto;

/** The hour of the shared game clock at `seconds`. */
const gameHourAt = (seconds: number): number =>
  Math.floor((((Math.floor(sharedClassicMinutes(seconds * 1000)) % 1440) + 1440) % 1440) / 60);

/** A moment at game noon inside one UTC day, so a herb harvest is allowed and every act lands on the same day. */
const NOON_S = (() => {
  const dayStart = 20_000 * DAY_S;
  for (let seconds = dayStart + 3600; seconds < dayStart + 6 * 3600; seconds += 30) {
    const steadyNoon = gameHourAt(seconds) === 12 && gameHourAt(seconds - 60) === 12 && gameHourAt(seconds + 60) === 12;
    if (steadyNoon) return seconds;
  }
  throw new Error('no game noon found');
})();
const TODAY = utcDay(NOON_S);

const realNow = Date.now;
Date.now = () => NOON_S * 1000;
test.after(() => {
  Date.now = realNow;
});

/** Common herb patches of the day, one per harvest. */
const HERB_PATCHES: HerbPatch[] = (() => {
  const patches: HerbPatch[] = [];
  for (let x = 300; x < 900 && patches.length < 10; x++) {
    for (const patch of herbPatches({ x, y: 200, day: TODAY, climate: WOODS_CLIMATE, confirmed: false })) {
      if (patch.tier === 1) patches.push({ x, y: 200, ...patch });
    }
  }
  return patches;
})();

/** Runs `act` with every four-byte draw of the service's dice set to `byte`. Ids and secrets keep real randomness. */
async function withDice<T>(byte: number, act: () => Promise<T>): Promise<T> {
  const realRandom = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
  globalThis.crypto.getRandomValues = <A extends ArrayBufferView | null>(array: A): A => {
    if (!array || array.byteLength !== 4) return realRandom(array as never) as A;
    new Uint8Array(array.buffer, array.byteOffset, 4).fill(byte);
    return array;
  };
  try {
    return await act();
  } finally {
    globalThis.crypto.getRandomValues = realRandom;
  }
}

let requestCount = 0;
const nextRid = (): string => `cap-${String(++requestCount).padStart(6, '0')}`;

/** A service with Marks open, and the acts each cap test drives. In `deleted` mode every act deletes the ledger. */
async function standMarks(mode: HistoryMode) {
  const service = await standService({ PROFESSIONS_OPEN: 'on', MARKS_OPEN: 'on' });
  const raw = service.env.DB._raw;
  const forgetHistory = (): void => {
    if (mode === 'deleted') raw.prepare('DELETE FROM marks_ledger').run();
  };
  const afterAct = async (answer: Promise<Answer>): Promise<Answer> => {
    const result = await answer;
    forgetHistory();
    return result;
  };
  // The finds open only to an account a week registered.
  const ageAccount = (account: Account): Account => {
    raw.prepare('UPDATE players SET registered_at = ? WHERE id = ?').run(NOON_S - WITNESS.ageS, account.id);
    return account;
  };
  const seated = async (handle: string, options = {}): Promise<Account> =>
    ageAccount(await service.seated(handle, options));
  const balanceOf = (account: Account): number =>
    Number(raw.prepare('SELECT balance FROM marks WHERE account = ?').get(account.id)?.balance ?? 0);
  const guildBalanceOf = (guildId: string): number =>
    Number(raw.prepare('SELECT balance FROM guild_marks WHERE guild_id = ?').get(guildId)?.balance ?? 0);
  /** A faucet line struck by hand today; the ledger's triggers move the balance as a strike would. */
  const strikeByHand = (account: Account, kind: string, amount: number): void => {
    raw
      .prepare(
        `INSERT INTO marks_ledger (src_kind, src_id, dst_kind, dst_id, kind, amount, day, at, actor, who, rid)
         VALUES ('mint', NULL, 'account', ?, ?, ?, ?, ?, ?, NULL, ?)`,
      )
      .run(account.id, kind, amount, TODAY, NOON_S, account.id, `${kind}:${nextRid()}`);
    forgetHistory();
  };
  const claimGate = async (account: Account, gameDay: number): Promise<Answer> => {
    const receipt = await mintReceipt({ d: gameDay, b: 'ruhn', s: account.id, c: 4242, x: 'dealt' }, service.gateKey, {
      subtle,
      nowS: NOON_S,
    });
    return afterAct(service.call('/v1/gate/claim', { receipt }, account.secret));
  };
  const claimRaid = async (account: Account, location: number): Promise<Answer> => {
    const key = `${DAGGERFALL_REGION}:${location}:1000`;
    const receipt = await mintRaidReceipt({ w: key, s: account.id, c: 777, y: 2 }, service.gateKey, {
      subtle,
      nowS: NOON_S,
    });
    const body = { receipt, character: account.character, name: account.handle };
    return afterAct(service.call('/v1/raid/claim', body, account.secret));
  };
  let patchIndex = 0;
  const harvestHerb = (account: Account): Promise<Answer> => {
    const patch = HERB_PATCHES[patchIndex++];
    const node = nodeKey({ kind: 'herb', x: patch.x, y: patch.y, day: TODAY, slot: patch.slot });
    const body = {
      character: account.character,
      node,
      kind: 'herbs',
      climate: WOODS_CLIMATE,
      region: ANTICLERE_REGION,
      act: { clean: false, bruised: false },
      at: NOON_S - 2,
      rid: nextRid(),
    };
    return afterAct(service.call('/v1/prof/harvest', body, account.secret));
  };
  const lootFind = (account: Account): Promise<Answer> =>
    afterAct(service.call('/v1/marks/find', { kind: 'corpse', rid: nextRid() }, account.secret));
  const sellToBank = (account: Account, marks: number): Promise<Answer> =>
    afterAct(service.call('/v1/marks/exchange', { marks, rid: nextRid() }, account.secret));
  /** A guild of four accounts, each member's character in it long enough to count for a deed. */
  const foundGuild = async () => {
    // A founding asks renown of its founder.
    const master = await seated('Aldric', { renown: 10 });
    const founded = await service.found(master, { name: 'The Cap Guild', tag: 'CAP' });
    assert.equal(founded.status, 200, JSON.stringify(founded.body));
    const guild = founded.body.guild;
    const members: Account[] = [];
    for (const handle of ['Bran', 'Cass', 'Dain']) {
      const member = await seated(handle);
      await service.call('/v1/guilds/invite', { character: master.character, handle }, master.secret);
      await service.call(
        '/v1/guilds/answer',
        { character: member.character, guild: guild.id, accept: true },
        member.secret,
      );
      members.push(member);
    }
    raw
      .prepare('UPDATE guild_members SET joined_at = joined_at - ? WHERE guild_id = ?')
      .run(GUILD_FOUND_TENURE_S, guild.id);
    return { guildId: guild.id as string, members };
  };
  return {
    service,
    seated,
    balanceOf,
    guildBalanceOf,
    strikeByHand,
    claimGate,
    claimRaid,
    harvestHerb,
    lootFind,
    sellToBank,
    foundGuild,
    seedMarks: service.seedMarks,
  };
}

const MODES: HistoryMode[] = ['kept', 'deleted'];

for (const mode of MODES) {
  test(`combat cap, ledger ${mode}: gates and raids reach 150 a day, the last strike is cut to what is left, then none`, async () => {
    const marks = await standMarks(mode);
    const ann = await marks.seated('Ann');
    assert.equal(MARKS_COMBAT.perDay, 150);
    assert.equal((await marks.claimGate(ann, 500)).body.marks.struck, 50);
    assert.equal((await marks.claimGate(ann, 501)).body.marks.struck, 50);
    assert.equal((await marks.claimRaid(ann, 1)).body.marks.struck, 30);
    const last = await marks.claimGate(ann, 502);
    assert.deepEqual(
      last.body.marks,
      { struck: 20, balance: 150, combat: { earned: 150, max: 150 } },
      'cut to the 20 left',
    );
    const past = await marks.claimRaid(ann, 2);
    assert.equal(past.body.recorded, true, 'the raid is still counted');
    assert.deepEqual(past.body.marks, { struck: 0, balance: 150, combat: { earned: 150, max: 150 }, why: 'cap' });
    assert.equal(marks.balanceOf(ann), 150);
  });

  test(`gather cap, ledger ${mode}: a harvest's finds reach 30 a day, the last cut to what is left, then none`, async () => {
    const marks = await standMarks(mode);
    const ann = await marks.seated('Ann');
    assert.equal(MARKS_FAUCETS.gather.perDay, 30);
    marks.strikeByHand(ann, 'gather', 27);
    // Dice byte 0 finds silver and rolls the smallest amount, 2.
    const whole = await withDice(0, () => marks.harvestHerb(ann));
    assert.deepEqual(whole.body.marks, { struck: 2, balance: 29, today: { found: 29, max: 30 } });
    const last = await withDice(0, () => marks.harvestHerb(ann));
    assert.deepEqual(last.body.marks, { struck: 1, balance: 30, today: { found: 30, max: 30 } }, 'cut to the 1 left');
    const past = await withDice(0, () => marks.harvestHerb(ann));
    assert.equal(past.status, 200, JSON.stringify(past.body));
    assert.equal('marks' in past.body, false, 'the day is met: no find');
    assert.equal(marks.balanceOf(ann), 30);
  });

  test(`loot find cap, ledger ${mode}: finds reach 20 a day, then struck 0 with cap`, async () => {
    const marks = await standMarks(mode);
    const ann = await marks.seated('Ann');
    assert.equal(MARKS_FAUCETS.find.perDay, 20);
    // Dice byte 255 rolls the largest find, 4: five finds make the day's 20.
    for (let found = 4; found <= 20; found += 4) {
      const answer = await withDice(255, () => marks.lootFind(ann));
      assert.deepEqual(answer.body, { ok: true, struck: 4, balance: found, today: { found, max: 20 } });
    }
    const past = await withDice(255, () => marks.lootFind(ann));
    assert.deepEqual(past.body, { ok: true, struck: 0, balance: 20, today: { found: 20, max: 20 }, why: 'cap' });
    assert.equal(marks.balanceOf(ann), 20);
  });

  test(`Bank cap, ledger ${mode}: sales reach 300 Marks a day, then one Mark more is refused`, async () => {
    const marks = await standMarks(mode);
    const ann = await marks.seated('Ann');
    marks.seedMarks(ann, 1_000);
    assert.equal(MARKS_BANK.perDay, 300);
    for (let sold = 100; sold <= 300; sold += 100) {
      const answer = await marks.sellToBank(ann, 100);
      assert.equal(answer.status, 200, JSON.stringify(answer.body));
      assert.equal(answer.body.exchangedToday, sold);
    }
    const past = await marks.sellToBank(ann, 1);
    assert.equal(past.body.error, 'marks-bank-cap');
    assert.equal(marks.balanceOf(ann), 700);
  });

  test(`guild deed cap, ledger ${mode}: a guild is struck 4 deeds a day, and a fifth raid all three members claim strikes none`, async () => {
    const marks = await standMarks(mode);
    const { guildId, members } = await marks.foundGuild();
    assert.equal(MARKS_FAUCETS.deed.perDay, 4);
    for (let location = 1; location <= 4; location++) {
      let deed = null;
      for (const member of members) deed = (await marks.claimRaid(member, location)).body.deed ?? deed;
      assert.equal(deed?.struck, 25, `raid ${location} strikes its deed`);
    }
    for (const member of members) {
      const answer = await marks.claimRaid(member, 5);
      assert.equal(answer.body.recorded, true);
      assert.equal(answer.body.deed ?? null, null, 'the day is met: no deed');
    }
    assert.equal(marks.guildBalanceOf(guildId), 100);
  });
}
