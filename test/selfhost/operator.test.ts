import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_DOOR, requestOf } from '../../selfhost/operator.ts';

test('each command line becomes one act for the door', () => {
  assert.deepEqual(requestOf(['find', 'Sylvia']), { door: DEFAULT_DOOR, body: { act: 'find', handle: 'Sylvia' } });
  assert.deepEqual(requestOf(['role', 'p_abc', 'owner'])?.body, { act: 'role', id: 'p_abc', role: 'owner' });
  assert.deepEqual(requestOf(['recovery', 'Sylvia'])?.body, { act: 'recovery', handle: 'Sylvia' });
  assert.deepEqual(
    requestOf(['post', '--to', 'a,b', '--batch', 'welcome-1', '--subject', 'Hi', '--message', 'There', '--apply'])
      ?.body,
    { act: 'post', handles: 'a,b', batch: 'welcome-1', subject: 'Hi', message: 'There', apply: true },
  );
  assert.deepEqual(requestOf(['characters', '--by', 'mac', 'cai'])?.body, {
    act: 'characters',
    by: 'mac',
    handle: 'cai',
  });
  assert.deepEqual(requestOf(['rollback', '--by', 'mac', 'r123', '--note', 'why'])?.body, {
    act: 'rollback',
    by: 'mac',
    id: 'r123',
    note: 'why',
    apply: false,
  });
});

test('a post or a rollback is a dry run unless --apply is given', () => {
  assert.equal(
    requestOf(['post', '--to', 'a', '--batch', 'b-1', '--subject', 's', '--message', 'm'])?.body.apply,
    false,
  );
  assert.equal(requestOf(['rollback', '--by', 'mac', 'r123'])?.body.apply, false);
});

test('the door comes from --door, then OPERATOR_DOOR, then the local default', () => {
  assert.equal(
    requestOf(['find', 'x'], { OPERATOR_DOOR: 'http://workerd:8788/__operator' })?.door,
    'http://workerd:8788/__operator',
  );
  assert.equal(
    requestOf(['find', 'x', '--door', 'http://h/__operator'], { OPERATOR_DOOR: 'ignored' })?.door,
    'http://h/__operator',
  );
});

test('a line that is no command asks for nothing', () => {
  assert.equal(requestOf([]), null);
  assert.equal(requestOf(['find']), null);
  assert.equal(requestOf(['role', 'p_abc']), null);
  assert.equal(requestOf(['post', '--to', 'a']), null);
  assert.equal(requestOf(['rollback', 'r123']), null, 'a rollback names its Admin');
  assert.equal(requestOf(['delete', 'everything']), null);
});
