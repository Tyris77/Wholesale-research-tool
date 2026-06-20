import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDealWithAI, scoreSeller, runAssistant } from './ai-service.js';

// A fake Groq client whose chat.completions.create returns scripted turns.
function scriptedClient(turns) {
  let i = 0;
  return { chat: { completions: { create: async () => ({ choices: [{ message: turns[i++] }] }) } } };
}

test('runAssistant returns not-configured when there is no client', async () => {
  const r = await runAssistant([{ role: 'user', content: 'hi' }], { client: null, tools: [], executeTool: async () => ({}) });
  assert.equal(r.success, false);
  assert.match(r.error, /GROQ_API_KEY/);
});

test('runAssistant executes a requested tool then returns the final reply', async () => {
  const turns = [
    { role: 'assistant', content: null, tool_calls: [{ id: 'tc1', function: { name: 'list_deals', arguments: '{}' } }] },
    { role: 'assistant', content: 'You have 2 deals.' },
  ];
  const calls = [];
  const executeTool = async (name) => { calls.push(name); return [{ id: 'd1' }, { id: 'd2' }]; };
  const r = await runAssistant([{ role: 'user', content: 'how many deals?' }], {
    client: scriptedClient(turns), tools: [], executeTool,
  });
  assert.equal(r.success, true);
  assert.equal(r.reply, 'You have 2 deals.');
  assert.deepEqual(calls, ['list_deals']);
});

test('runAssistant stops at maxSteps when the model never finishes', async () => {
  const loopTurn = { role: 'assistant', content: null, tool_calls: [{ id: 'tc', function: { name: 'list_deals', arguments: '{}' } }] };
  const client = { chat: { completions: { create: async () => ({ choices: [{ message: loopTurn }] }) } } };
  const r = await runAssistant([{ role: 'user', content: 'loop' }], {
    client, tools: [], executeTool: async () => ([]), maxSteps: 3,
  });
  assert.equal(r.success, true);
  assert.match(r.reply, /narrow/i);
});

const DEAL = {
  purchasePrice: 120000, repairBudget: 22000, arv: 185000,
  sellingCosts: 12000, holdingCosts: 3000, wholesaleFee: 10000,
};

const SELLER = { name: 'Jane', property_address: '1 Main', property_city: 'Atlanta', property_state: 'GA', motivation: 'Divorce', status: 'new' };

function fakeClient(captured) {
  return {
    chat: {
      completions: {
        create: async (args) => {
          captured.args = args;
          return { choices: [{ message: { content: 'YES. Strong deal.' } }] };
        },
      },
    },
  };
}

function throwingClient(message) {
  return {
    chat: { completions: { create: async () => { throw new Error(message); } } },
  };
}

test('analyzeDealWithAI returns analysis text from Groq chat completion', async () => {
  const captured = {};
  const result = await analyzeDealWithAI(DEAL, fakeClient(captured));
  assert.equal(result.success, true);
  assert.equal(result.analysis, 'YES. Strong deal.');
  assert.equal(result.model, 'llama-3.3-70b-versatile');
  assert.equal(captured.args.model, 'llama-3.3-70b-versatile');
  assert.equal(captured.args.messages[0].role, 'user');
  assert.ok(captured.args.messages[0].content.includes('120,000'), 'prompt should include the purchase price');
});

test('analyzeDealWithAI returns error when no client configured', async () => {
  const result = await analyzeDealWithAI(DEAL, null);
  assert.equal(result.success, false);
  assert.match(result.error, /GROQ_API_KEY/);
});

test('analyzeDealWithAI returns error when the API call throws', async () => {
  const result = await analyzeDealWithAI(DEAL, throwingClient('rate limited'));
  assert.equal(result.success, false);
  assert.equal(result.error, 'rate limited');
});

test('scoreSeller returns scoring text from Groq chat completion', async () => {
  const captured = {};
  const result = await scoreSeller(SELLER, fakeClient(captured));
  assert.equal(result.success, true);
  assert.equal(result.scoring, 'YES. Strong deal.');
  assert.equal(captured.args.model, 'llama-3.3-70b-versatile');
});

test('scoreSeller returns error when no client configured', async () => {
  const result = await scoreSeller(SELLER, null);
  assert.equal(result.success, false);
  assert.match(result.error, /GROQ_API_KEY/);
});

test('scoreSeller returns error when the API call throws', async () => {
  const result = await scoreSeller(SELLER, throwingClient('boom'));
  assert.equal(result.success, false);
  assert.equal(result.error, 'boom');
});
