import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SYSTEM_PROMPT, TOOL_DEFINITIONS, buildMessages } from './assistant.js';

test('TOOL_DEFINITIONS lists the six read-only tools', () => {
  const names = TOOL_DEFINITIONS.map((t) => t.function.name).sort();
  assert.deepEqual(names, [
    'get_pipeline_summary', 'list_buyers', 'list_deals', 'list_followups', 'list_markets', 'match_buyers_for_deal',
  ]);
});

test('match_buyers_for_deal declares a deal_id parameter', () => {
  const tool = TOOL_DEFINITIONS.find((t) => t.function.name === 'match_buyers_for_deal');
  assert.ok(tool.function.parameters.properties.deal_id, 'deal_id param present');
  assert.deepEqual(tool.function.parameters.required, ['deal_id']);
});

test('buildMessages prepends the system prompt and keeps history', () => {
  const history = [{ role: 'user', content: 'hi' }];
  const msgs = buildMessages(history);
  assert.equal(msgs[0].role, 'system');
  assert.equal(msgs[0].content, SYSTEM_PROMPT);
  assert.deepEqual(msgs[1], { role: 'user', content: 'hi' });
});
