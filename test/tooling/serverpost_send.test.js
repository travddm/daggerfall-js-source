// The post, sent by the operator: tools/sendServerPost.mjs writes the statements, and
// .github/workflows/server-post.yml runs them by hand (a dry run, then the send).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, chmodSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { d1 } from '../accountDb.mjs';
import {
  postHandles, postBatch, postWords, postItem, sqlText, lookSql, sendSql, POST_ITEMS, POST_RECIPIENTS_MAX,
} from '../../tools/sendServerPost.mjs';
import { POST_SENDER, POST_BODY_MAX, POST_SUBJECT_MAX } from '../../src/net/postLaw.js';
import { mintGilded, DRAGONFIRE_OATH } from '../../src/systems/gilded.js';

const ROOT = new URL('../../', import.meta.url);
const src = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const TOOL = fileURLToPath(new URL('tools/sendServerPost.mjs', ROOT));
const rows = (db, sql) => db._raw.prepare(sql).all().map((r) => ({ ...r }));
const player = (db, id, handle) => db._raw.prepare('INSERT INTO players (id, handle, handle_lc, guest_name, created_at, last_seen, registered_at) VALUES (?, ?, ?, ?, 1, 1, ?)')
  .run(id, handle, handle?.toLowerCase() ?? null, `Guest ${id}`, handle ? 1 : null);

test('SERVER-POST the tool: names a handle\'s shape, none twice, folded; a send\'s name its shape; the words within the post\'s bounds, \\n a line, no control character; an item only by name, minted by the game; every word a string with its quotes doubled; the command line prints the statement or nothing (mutants: a name unchecked; the bounds dropped; an item typed in)', () => {
  assert.deepEqual(postHandles(' Duck, duck ,ArtemisGodfrey '), ['duck', 'artemisgodfrey'], 'folded, and once');
  for (const bad of ['', ' , ', 'ab', 'Duck, 9lives', "x'; DROP TABLE players; --", 'a b']) assert.throws(() => postHandles(bad), /not a/, JSON.stringify(bad));
  assert.throws(() => postHandles(Array.from({ length: POST_RECIPIENTS_MAX + 1 }, (_, i) => `Player${i}`).join(',')), /not a list of names/);
  assert.equal(postBatch(' hours-first-hourlock '), 'hours-first-hourlock');
  for (const bad of ['', 'ab', 'Hours First', 'x\'y', '-lead', 'a'.repeat(49)]) assert.throws(() => postBatch(bad), /not a send's name/, JSON.stringify(bad));
  assert.deepEqual(postWords({ subject: ' Hello ', body: 'one\\ntwo' }), { subject: 'Hello', body: 'one\ntwo' });
  assert.throws(() => postWords({ subject: '', body: 'x' }), /not a subject/);
  assert.throws(() => postWords({ subject: 'x'.repeat(POST_SUBJECT_MAX + 1), body: 'x' }), /not a subject/);
  assert.throws(() => postWords({ subject: 'x', body: 'x'.repeat(POST_BODY_MAX + 1) }), /not a message/);
  assert.throws(() => postWords({ subject: 'x', body: 'bell\u0007' }), /control character/);
  assert.deepEqual(Object.keys(POST_ITEMS), ['none']);
  assert.equal(postItem('none'), null);
  assert.throws(() => postItem('hourlock'), /not an item/, 'the Hourlock left the game with the guns: nothing mints it');
  assert.throws(() => postItem('{"templateIndex":560}'), /not an item/);
  assert.equal(sqlText("Hour's First"), "'Hour''s First'");

  assert.equal(execFileSync(process.execPath, [TOOL, '--names', 'Duck,Terra'], { encoding: 'utf8' }), 'duck\nterra\n');
  assert.equal(execFileSync(process.execPath, [TOOL, '--look', 'Duck', 'b-one'], { encoding: 'utf8' }), `${lookSql('Duck', 'b-one')}\n`);
  assert.equal(execFileSync(process.execPath, [TOOL, '--sql', 'Duck', 'b-one', 'none', 'Hi', 'A gift'], { encoding: 'utf8' }), `${sendSql({ handles: 'Duck', batch: 'b-one', item: 'none', subject: 'Hi', body: 'A gift' })}\n`);
  for (const args of [['--sql', 'Duck', 'b-one', 'sword', 'Hi', 'x'], ['--sql', "x'; --", 'b-one', 'none', 'Hi', 'x'], ['--look', 'Duck'], ['--migration', 'tamriel'], []]) {
    const r = spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8' });
    assert.equal(r.status, 1, args.join(' '));
    assert.equal(r.stdout, '', 'nothing for the workflow to run');
  }
});

test('SERVER-POST the send, over the real schema: one piece to each registered account the names find - never a guest, never another; the words and the item as the tool made them; RETURNING names what it wrote; the same send again writes nothing, another send is another piece; the dry run reads who holds it; a quote in the words is words (mutants: the send not once a name; a guest sent post; the item\'s record changed)', () => {
  const db = d1();
  player(db, 'p-duck', 'Duck'); player(db, 'p-terra', 'Terra'); player(db, 'p-other', 'Other'); player(db, 'p-guest', null);
  // POST_ITEMS names no item now, so the send carries a record the caller made (sendSql's `record`)
  const oathRecord = JSON.stringify(mintGilded(DRAGONFIRE_OATH));
  const o = { handles: 'duck, TERRA, Nobody', batch: 'gift-one', item: 'none', record: oathRecord, subject: "Hour's First", body: "It's yours.\\nClaim it." };
  const wrote = rows(db, sendSql(o));
  assert.deepEqual(wrote.map((r) => r.to_id).sort(), ['p-duck', 'p-terra'], 'the names found, no other');
  const kept = rows(db, 'SELECT * FROM server_post ORDER BY to_id');
  assert.equal(kept.length, 2);
  for (const k of kept) {
    assert.match(k.id, /^[0-9a-f]{24}$/);
    assert.deepEqual([k.batch, k.sender, k.subject, k.body, k.read_at, k.claimed_at], ['gift-one', POST_SENDER, "Hour's First", "It's yours.\nClaim it.", null, null]);
    assert.deepEqual(JSON.parse(k.item), mintGilded(DRAGONFIRE_OATH));
    assert.ok(Math.abs(k.sent_at - Date.now() / 1000) < 60, 'the database\'s own clock');
  }
  assert.notEqual(kept[0].id, kept[1].id);
  assert.deepEqual(rows(db, sendSql(o)), [], 'the same send twice sends once');
  assert.equal(rows(db, sendSql({ ...o, batch: 'gift-two', item: 'none', record: null })).length, 2, 'another send is another piece');
  assert.equal(rows(db, "SELECT item FROM server_post WHERE batch = 'gift-two'")[0].item, null, 'a message alone');
  assert.deepEqual(rows(db, lookSql('Duck,Terra,Other,Nobody', 'gift-one')), [
    { handle: 'Duck', handle_lc: 'duck', sent: 1 }, { handle: 'Other', handle_lc: 'other', sent: 0 }, { handle: 'Terra', handle_lc: 'terra', sent: 1 },
  ], 'the dry run: who it finds, and who holds it');
  assert.equal(rows(db, "SELECT COUNT(*) AS n FROM server_post WHERE to_id = 'p-guest'")[0].n, 0, 'never a guest');
});

/** A step's `run: |` block, by its name, as the runner hands it to bash (guildgrant.test.js's reader). */
function runBlock(yml, stepName) {
  const at = yml.indexOf(`- name: ${stepName}\n`);
  assert.ok(at >= 0, `no step named "${stepName}"`);
  const from = yml.indexOf('run: |\n', at) + 'run: |\n'.length;
  const lines = [];
  for (const l of yml.slice(from).split('\n')) {
    if (l.trim() && !l.startsWith('          ')) break;
    lines.push(l.slice(10));
  }
  return lines.join('\n');
}

test('SERVER-POST the workflow: run by hand only, a dry run unless asked, its inputs read once each as environment, the item a choice of the tool\'s names, the deploy\'s queue, nothing created or deployed; its steps, run here over D1\'s own answer, write the tool\'s statements, refuse a bad input before the database is asked, fail a name that finds nobody, summarise who holds it, and send only with apply (mutants: an input spliced into a run line; a missing name passing; the send on a dry run)', () => {
  const wf = src('.github/workflows/server-post.yml');
  const on = /\non:\n([\s\S]*?)\n\S/.exec(wf)?.[1] ?? '';
  assert.match(on, /^ {2}workflow_dispatch:/);
  assert.doesNotMatch(on, /push:|pull_request|schedule:/);
  assert.match(on, /\n {6}apply:\n(?: {8}.*\n)*? {8}default: false\n/, 'a dry run unless asked');
  assert.match(on, /\n {6}item:\n(?: {8}.*\n)*? {8}type: choice\n {8}options:\n {10}- none\n(?! {10}- )/, 'the tool\'s names, and only those');
  assert.equal(wf.match(/\$\{\{ inputs\./g)?.length, 6, 'the six inputs, each read once');
  assert.match(wf, /\n {6}HANDLES: \$\{\{ inputs\.handles \}\}\n {6}BATCH: \$\{\{ inputs\.batch \}\}\n {6}ITEM: \$\{\{ inputs\.item \}\}\n {6}SUBJECT: \$\{\{ inputs\.subject \}\}\n {6}MESSAGE: \$\{\{ inputs\.message \}\}\n {6}APPLY: \$\{\{ inputs\.apply \}\}\n/);
  assert.match(wf, /\nconcurrency:\n {2}group: server-post\n {2}cancel-in-progress: false\n/);
  assert.match(wf, /\npermissions:\n {2}contents: read\n/);
  assert.doesNotMatch(wf, /d1 create|migrations apply|wrangler deploy|--file/, 'it creates, migrates and deploys nothing');
  assert.equal(wf.match(/if: env\.APPLY == 'true'\n/g)?.length, 1);
  assert.match(wf, /- name: Send the post\n {8}if: env\.APPLY == 'true'\n/);
  assert.deepEqual(Object.keys(POST_ITEMS), ['none'], 'the choice list is the tool\'s');

  const dir = mkdtempSync(join(tmpdir(), 'serverpost-'));
  const fake = join(dir, 'wrangler');
  // D1's answer only to the remote database, as JSON - a local or bare read is no answer (AUDIT SERVER-POST)
  writeFileSync(fake, '#!/usr/bin/env bash\ncase "$*" in *"--remote --json"*) ;; *) echo "not remote json" >&2; exit 9;; esac\ncase "$*" in *"INSERT OR IGNORE"*) cat "$FAKE_DIR/send.json";; *) cat "$FAKE_DIR/look.json";; esac\n');
  chmodSync(fake, 0o755);
  const d1Answer = (r) => JSON.stringify([{ results: r, success: true, meta: {} }]);
  const run = (step, { handles = 'Duck,Terra', batch = 'gift-one', item = 'none', subject = "Hour's First", message = 'For you.', apply = 'false', look = [], send = [] } = {}) => {
    writeFileSync(join(dir, 'look.json'), d1Answer(look));
    writeFileSync(join(dir, 'send.json'), d1Answer(send));
    const summary = join(dir, `summary-${Math.random()}`);
    writeFileSync(summary, '');
    const r = spawnSync('bash', ['-c', runBlock(wf, step)], {
      cwd: fileURLToPath(ROOT),
      env: { PATH: process.env.PATH, WRANGLER: fake, FAKE_DIR: dir, DB_NAME: 'daggerfall-accounts', RUNNER_TEMP: dir, GITHUB_STEP_SUMMARY: summary,
        HANDLES: handles, BATCH: batch, ITEM: item, SUBJECT: subject, MESSAGE: message, APPLY: apply },
      encoding: 'utf8',
    });
    return { ...r, summary: readFileSync(summary, 'utf8') };
  };

  let r = run('Write the statements');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(join(dir, 'names.txt'), 'utf8'), 'duck\nterra\n');
  assert.equal(readFileSync(join(dir, 'look.sql'), 'utf8'), `${lookSql('Duck,Terra', 'gift-one')}\n`);
  assert.equal(readFileSync(join(dir, 'send.sql'), 'utf8'), `${sendSql({ handles: 'Duck,Terra', batch: 'gift-one', item: 'none', subject: "Hour's First", body: 'For you.' })}\n`);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'words.json'), 'utf8')), { subject: "Hour's First", body: 'For you.' }, 'the words as they will be sent');
  for (const bad of [{ item: 'sword' }, { handles: '$(touch pwned)' }, { batch: 'Not A Name' }, { subject: '' }]) {
    assert.notEqual(run('Write the statements', bad).status, 0, `a bad input stops the run before the database is asked: ${JSON.stringify(bad)}`);
  }
  assert.equal(run('Write the statements').status, 0, 'the good statements again');

  const found = [{ handle: 'Duck', handle_lc: 'duck', sent: 0 }, { handle: 'Terra', handle_lc: 'terra', sent: 1 }];
  r = run('Read the recipients', { look: found });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.summary, /^Send \*\*gift-one\*\*, holding: none\n\nSubject: Hour's First\n\n````text\nFor you\.\n````\n/, 'the send, and its words as they will be sent, in a block of their own');
  assert.match(r.summary, /\| Duck \|  \|/);
  assert.match(r.summary, /\| Terra \| yes \|/);
  assert.match(r.summary, /A dry run: nothing was sent/);
  assert.doesNotMatch(run('Read the recipients', { look: found, apply: 'true' }).summary, /A dry run/);
  run('Write the statements', { message: 'Line one.\\nLine two.' });
  r = run('Read the recipients', { look: [{ handle: 'a|b', handle_lc: 'duck', sent: 0 }, found[1]] });
  assert.match(r.summary, /````text\nLine one\.\nLine two\.\n````/, '\\n a line');
  assert.match(r.summary, /\| a\\\|b \|  \|/, 'a `|` in a name cannot break its row');
  run('Write the statements');
  r = run('Read the recipients', { look: [found[0]] });
  assert.equal(r.status, 1, 'a name that finds nobody fails the run');
  assert.match(r.stdout, /::error::no registered account is named terra - nothing was sent/);

  r = run('Send the post', { apply: 'true', send: [{ id: 'a'.repeat(24), to_id: 'p-duck' }] });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.summary, /\*\*Sent\.\*\* 1 of 2 players were sent it now; the rest already held it\./);
});
