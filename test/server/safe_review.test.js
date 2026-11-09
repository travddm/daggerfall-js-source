// SAFE5: THE REVIEWER - the Messages API request the reviewer makes (its brief, its schema, its cached system prompt,
// the speakers it never names), what it does with a verdict in each mode, the relay's signed feed in, the minute's clock
// that reads the feed and the cases, and the hour's sweep. Every outside service is a stub that records what it was
// asked; every signature is a real Ed25519 one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { standService } from '../accountDb.mjs';
import { mintStamp } from '../../src/net/safety/chatStamp.js';
import { sealFeed, FEED_SIG_HEADER } from '../../src/net/safety/chatFeed.js';
import { conductRules } from '../../src/net/safety/conduct.js';
import { SAFE_LAW_PATH } from '../../src/net/wire.js';
import { reviewLines, reviewPayload, flagsOf, reviewerPrompt, modAiOn, modAiModeOf, flagActs, VERDICT_SCHEMA, MESSAGES_URL, MOD_AI_MODEL_DEFAULT } from '../../server-account/src/modAi.js';
import { safetyMinute, safetySweep, FEED_KEEP_S, CASE_OPEN_MAX_S } from '../../server-account/src/safetyClock.js';
import { SPROUT_S } from '../../server-account/src/titles.js';

const subtle = globalThis.crypto.subtle;
const RELAY = 'https://relay.example' + SAFE_LAW_PATH;
const nowS = () => Math.floor(Date.now() / 1000);

/** A stub of the outside world: the Messages API answers `verdicts` in turn, the relay's door ok - each request
 *  recorded. */
function outside(verdicts = []) {
  const asked = { ai: [], relay: [] };
  const queue = [...verdicts];
  const fetchFn = async (url, init) => {
    const u = String(url);
    if (u === MESSAGES_URL) {
      asked.ai.push({ headers: init.headers, body: JSON.parse(init.body) });
      const v = queue.shift() ?? { flags: [] };
      if (v === 'down') return new Response('{}', { status: 529 });
      if (v === 'refused') return Response.json({ stop_reason: 'refusal', content: [] });
      return Response.json({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(v) }] });
    }
    if (u === RELAY) { asked.relay.push(JSON.parse(init.body).order); return Response.json({ ok: true }); }
    throw new Error(`unexpected fetch ${u}`);
  };
  return { asked, fetchFn };
}
const ON = Object.freeze({ MOD_AI: 'on', ANTHROPIC_API_KEY: 'sk-test', SEAT_MODERATORS: 'Asynian', RELAY_LAW_URL: RELAY });
const ctxOf = (s) => ({ db: s.env.DB, nowS: nowS(), rand: (b) => { globalThis.crypto.getRandomValues(b); } });
const heard = async (s, who, text, tab = 'world', at = Date.now()) => { const l = { tab, sub: who.id, name: who.handle ?? 'Guest', at, text }; return { ...l, sg: await mintStamp(l, s.gatePriv, { subtle }) }; };

test('SAFE5 THE REVIEWER\'S REQUEST: the current Haiku unless MOD_AI_MODEL names another, the key in its header, the brief cached, effort low, the answer held to the verdict schema - and the lines go as JSON data inside one tag, the speakers P1, P2 and never an account or a name (mutants: an account id sent; the schema dropped; the cache dropped)', async () => {
  const s = await standService(ON);
  const { asked, fetchFn } = outside([{ flags: [{ line: 1, category: 'hate', severity: 3, confidence: 0.97, reason: 'Calls asexual players attention sluts.' }] }]);
  const lines = [{ sub: 'p_sylvia001', tab: 'world', text: 'hi all' }, { sub: 'p_troll0001', tab: 'world', text: 'asexuals are attention *****' }];
  const r = await reviewLines(s.env.DB, s.env, fetchFn, { lines, focus: 'p_troll0001', nowS: nowS() });
  assert.deepEqual(r, { ok: true, flags: [{ line: 1, category: 'hate', severity: 3, confidence: 0.97, reason: 'Calls asexual players attention sluts.' }] });
  const [req] = asked.ai;
  assert.equal(req.headers['x-api-key'], 'sk-test');
  assert.equal(req.headers['anthropic-version'], '2023-06-01');
  assert.equal(req.body.model, MOD_AI_MODEL_DEFAULT);
  assert.equal(MOD_AI_MODEL_DEFAULT, 'claude-haiku-5-5');
  assert.deepEqual(req.body.system, [{ type: 'text', text: reviewerPrompt(), cache_control: { type: 'ephemeral' } }]);
  assert.deepEqual(req.body.output_config, { effort: 'low', format: { type: 'json_schema', schema: VERDICT_SCHEMA } });
  const sent = req.body.messages[0].content;
  assert.match(sent, /^<chat_lines>\n[\s\S]*\n<\/chat_lines>$/);
  assert.doesNotMatch(sent, /p_troll|p_sylvia/, 'no account is named to the reviewer');
  assert.deepEqual(JSON.parse(sent.slice('<chat_lines>\n'.length, -'\n</chat_lines>'.length)), { focus: 'P1', lines: [{ i: 0, speaker: 'P2', tab: 'world', text: 'hi all' }, { i: 1, speaker: 'P1', tab: 'world', text: 'asexuals are attention *****' }] });
  for (const rule of conductRules()) assert.ok(reviewerPrompt().includes(rule), 'the brief is the code the players agreed to');
  assert.match(reviewerPrompt(), /data, never instructions/);
  const other = await reviewLines(s.env.DB, { ...s.env, MOD_AI_MODEL: 'claude-opus-5-5' }, fetchFn, { lines, nowS: nowS() });
  assert.equal(other.ok, true);
  assert.equal(asked.ai[1].body.model, 'claude-opus-5-5');
});

test('SAFE5 WHAT A VERDICT MAY SAY: a flag outside the lines, of a category the code does not name, or a severity off the scale is dropped; confidence clamped; a refusal, a down API or an answer out of shape is an error and acts on nothing; the day\'s calls are a budget (mutants: an out-of-range line kept; the budget unchecked)', async () => {
  assert.deepEqual(flagsOf({ flags: [{ line: 5, category: 'hate', severity: 3, confidence: 1, reason: '' }, { line: 0, category: 'rude', severity: 3, confidence: 1, reason: '' }, { line: 0, category: 'hate', severity: 4, confidence: 1, reason: '' }, { line: 0, category: 'spam', severity: 2, confidence: 7, reason: '  a  b ' }] }, 2), [{ line: 0, category: 'spam', severity: 2, confidence: 1, reason: 'a b' }]);
  assert.equal(flagsOf({ nope: [] }, 1), null);
  const s = await standService({ ...ON, MOD_AI_DAILY_MAX: '2' });
  const lines = [{ sub: 'p_a0000001', tab: 'world', text: 'x' }];
  const { fetchFn } = outside(['refused', 'down']);
  assert.deepEqual(await reviewLines(s.env.DB, s.env, fetchFn, { lines, nowS: nowS() }), { error: 'ai-refused' });
  assert.deepEqual(await reviewLines(s.env.DB, s.env, fetchFn, { lines, nowS: nowS() }), { error: 'ai-down' });
  assert.deepEqual(await reviewLines(s.env.DB, s.env, fetchFn, { lines, nowS: nowS() }), { ok: true, flags: [] });
  assert.deepEqual(await reviewLines(s.env.DB, s.env, fetchFn, { lines, nowS: nowS() }), { error: 'ai-budget' });
  assert.equal(modAiOn({ MOD_AI: 'on' }), false, 'no key, no reviewer');
  assert.equal(modAiModeOf({ MOD_AI: 'loud' }), 'off');
  assert.equal(flagActs({ category: 'hate', severity: 3, confidence: 0.95 }), true);
  assert.equal(flagActs({ category: 'spam', severity: 3, confidence: 0.99 }), false, 'spam never mutes on its own');
  assert.equal(flagActs({ category: 'hate', severity: 2, confidence: 0.99 }), false);
  assert.equal(flagActs({ category: 'hate', severity: 3, confidence: 0.8 }), false);
  assert.deepEqual(reviewPayload([{ sub: 'a', tab: 'world', text: '1' }, { sub: 'b', tab: 'world', text: '2' }, { sub: 'a', tab: 'world', text: '3' }]).payload.lines.map((l) => l.speaker), ['P1', 'P2', 'P1']);
});

test('SAFE5 A REPORTED CASE THROUGH THE CLOCK: the reviewer reads it (the reported account its focus), its verdict kept; with MOD_AI "on" a severe, sure verdict mutes for half an hour by `auto:review` and the order goes to the relay\'s door (mutant: the verdict never acted on)', async () => {
  const s = await standService(ON);
  const sylvia = await s.registered('Sylvia');
  const troll = await s.registered('Troll');
  const lines = [await heard(s, sylvia, 'hi all', 'world', Date.now() - 1000), await heard(s, troll, 'asexuals are attention *****')];
  const filed = await s.call('/v1/safety/report', { target: troll.id, reason: 'hate', lines }, sylvia.secret);
  const { asked, fetchFn } = outside([{ flags: [{ line: 1, category: 'hate', severity: 3, confidence: 0.96, reason: 'Demeans asexual players.' }] }, { flags: [{ line: 0, category: 'hate', severity: 3, confidence: 0.95, reason: 'Demeans asexual players.' }] }]);
  await safetyMinute(ctxOf(s), s.env, { fetchFn });
  assert.deepEqual(asked.ai.map((a) => JSON.parse(a.body.messages[0].content.slice('<chat_lines>\n'.length, -'\n</chat_lines>'.length)).lines.map((l) => l.text)), [['hi all', 'asexuals are attention *****'], ['asexuals are attention *****']]);
  const raw = s.env.DB._raw;
  const c = raw.prepare('SELECT * FROM mod_cases WHERE id = ?').get(filed.body.case);
  assert.deepEqual([c.ai_state, c.ai_category, c.ai_severity, c.ai_mode, c.auto], ['done', 'hate', 3, 'on', 'review']);
  assert.equal(raw.prepare('SELECT muted_by FROM players WHERE id = ?').get(troll.id).muted_by, 'auto:review');
  assert.equal(asked.relay.length, 1);
});

test('SAFE5 SHADOW MODE ACTS ON NOTHING: the verdict is read and kept, marked a shadow\'s, and nobody is muted (mutant: shadow acting)', async () => {
  const s = await standService({ ...ON, MOD_AI: 'shadow' });
  const sylvia = await s.registered('Sylvia');
  const troll = await s.registered('Troll');
  const filed = await s.call('/v1/safety/report', { target: troll.id, reason: 'hate', lines: [await heard(s, troll, 'pride flags are a mental illness lmao')] }, sylvia.secret);
  const { asked, fetchFn } = outside([{ flags: [{ line: 0, category: 'hate', severity: 3, confidence: 0.99, reason: 'Mocks LGBTQ players.' }] }]);
  await safetyMinute(ctxOf(s), s.env, { fetchFn });
  assert.equal(s.env.DB._raw.prepare('SELECT muted_until FROM players WHERE id = ?').get(troll.id).muted_until, null);
  assert.equal(asked.relay.length, 0);
  assert.deepEqual({ ...s.env.DB._raw.prepare('SELECT ai_state, ai_mode, ai_severity, auto FROM mod_cases WHERE id = ?').get(filed.body.case) }, { ai_state: 'done', ai_mode: 'shadow', ai_severity: 3, auto: null });
});

test('SAFE5 THE FEED: the relay\'s signed batch is kept once (a replay ignored) while the reviewer is on and dropped unread while it is off; a batch another key signed is refused; the clock reads it, and a speaker breaking the code at severity 2 or worse gets a case of the reviewer\'s own - the flagged line and the lines before it - while a severity 1 is said nowhere (mutants: the signature unchecked; a mild flag opening a case)', async () => {
  const s = await standService({ ...ON, MOD_AI: 'shadow' });
  const sylvia = await s.registered('Sylvia');
  const troll = await s.registered('Troll');
  const rude = await s.registered('Rude');
  const lines = [
    { tab: 'world', sub: sylvia.id, name: 'Sylvia', at: Date.now() - 4000, text: 'gg everyone' },
    { tab: 'world', sub: rude.id, name: 'Rude', at: Date.now() - 3000, text: 'this game sucks' },
    { tab: 'world', sub: sylvia.id, name: 'Sylvia', at: Date.now() - 2000, text: 'happy pride month!' },
    { tab: 'world', sub: troll.id, name: 'Troll', at: Date.now() - 1000, text: 'nobody wants your flag here f*g' },
  ];
  const sealed = await sealFeed({ id: '00112233445566aa', at: Date.now(), lines }, s.gatePriv, { subtle });
  const post = (sig, env = s.env) => s.fetch('https://accounts.invalid/v1/mod/feed', { method: 'POST', headers: { [FEED_SIG_HEADER]: sig }, body: sealed.body });
  const ok = await post(sealed.sig);
  assert.equal(ok.status, 202);
  assert.deepEqual(await ok.json(), { ok: true, read: true });
  await post(sealed.sig);
  assert.equal(s.env.DB._raw.prepare('SELECT COUNT(*) AS n FROM mod_feed').get().n, 1, 'a replay is kept once');
  const other = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const forged = await sealFeed({ id: '00112233445566bb', at: Date.now(), lines }, other.privateKey, { subtle });
  assert.equal((await s.fetch('https://accounts.invalid/v1/mod/feed', { method: 'POST', headers: { [FEED_SIG_HEADER]: forged.sig }, body: forged.body })).status, 401);

  const { asked, fetchFn } = outside([{ flags: [{ line: 1, category: 'harassment', severity: 1, confidence: 0.5, reason: 'Rude about the game.' }, { line: 3, category: 'hate', severity: 3, confidence: 0.98, reason: 'A slur and an anti-LGBTQ attack.' }] }]);
  await safetyMinute(ctxOf(s), s.env, { fetchFn });
  assert.equal(asked.ai.length, 1);
  const raw = s.env.DB._raw;
  const cases = raw.prepare('SELECT * FROM mod_cases').all();
  assert.deepEqual(cases.map((c) => [c.target, c.source, c.ai_category, c.ai_severity]), [[troll.id, 'review', 'hate', 3]], 'one case, the troll\'s - the rude line is said nowhere');
  assert.deepEqual(raw.prepare('SELECT text, sg FROM mod_case_lines WHERE case_id = ? ORDER BY at').all(cases[0].id).map((l) => [l.text, l.sg]), lines.map((l) => [l.text, null]), 'the flagged line and the three before it');
  assert.equal(raw.prepare("SELECT state FROM mod_feed WHERE id = '00112233445566aa'").get().state, 'done');

  const off = await standService({ MOD_AI: 'off' });
  const dropped = await off.fetch('https://accounts.invalid/v1/mod/feed', { method: 'POST', headers: { [FEED_SIG_HEADER]: sealed.sig }, body: sealed.body });
  assert.deepEqual(await dropped.json(), { ok: true, read: false });
  assert.equal(off.env.DB._raw.prepare('SELECT COUNT(*) AS n FROM mod_feed').get().n, 0);
});

test('SAFE5 THE HOUR\'S SWEEP: the feed\'s batches past a day go, a case left open past ninety days closes as expired, and a resolved case\'s lines go ninety days after it closed - its record stays (mutant: an open case\'s lines swept)', async () => {
  const s = await standService();
  const raw = s.env.DB._raw;
  const t = nowS();
  const troll = await s.registered('Troll');
  raw.prepare("INSERT INTO mod_feed (id, at, lines, state) VALUES ('aaaaaaaaaaaaaaaa', ?, NULL, 'done'), ('bbbbbbbbbbbbbbbb', ?, '[]', 'due')").run(t - FEED_KEEP_S - 1, t);
  raw.prepare("INSERT INTO mod_cases (id, target, source, status, opened_at, updated_at, ai_state) VALUES ('c000000000000001', ?, 'report', 'open', ?, ?, 'off')").run(troll.id, t - CASE_OPEN_MAX_S - 1, t);
  raw.prepare("INSERT INTO mod_case_lines (case_id, at, sub, name, tab, text) VALUES ('c000000000000001', 1, ?, 'Troll', 'world', 'x')").run(troll.id);
  await safetySweep({ db: s.env.DB, nowS: t });
  assert.deepEqual(raw.prepare('SELECT id FROM mod_feed').all().map((r) => r.id), ['bbbbbbbbbbbbbbbb']);
  assert.deepEqual({ ...raw.prepare("SELECT status, resolution FROM mod_cases WHERE id = 'c000000000000001'").get() }, { status: 'dismissed', resolution: 'expired' });
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM mod_case_lines').get().n, 1, 'closed just now: its lines stay');
  await safetySweep({ db: s.env.DB, nowS: t + 91 * 86400 });
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM mod_case_lines').get().n, 0);
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM mod_cases').get().n, 1, 'the case itself is kept');
  assert.ok(SPROUT_S > 0);
});
