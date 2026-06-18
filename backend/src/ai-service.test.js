import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDealWithAI, scoreSeller } from './ai-service.js';

const DEAL = {
  purchasePrice: 120000, repairBudget: 22000, arv: 185000,
  sellingCosts: 12000, holdingCosts: 3000, wholesaleFee: 10000,
};

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

test('analyzeDealWithAI returns analysis text from Groq chat completion', async () => {
  const captured = {};
  const result = await analyzeDealWithAI(DEAL, fakeClient(captured));
  assert.equal(result.success, true);
  assert.equal(result.analysis, 'YES. Strong deal.');
  assert.equal(captured.args.model, 'llama-3.3-70b-versatile');
  assert.equal(captured.args.messages[0].role, 'user');
});

test('analyzeDealWithAI returns error when no client configured', async () => {
  const result = await analyzeDealWithAI(DEAL, null);
  assert.equal(result.success, false);
  assert.match(result.error, /GROQ_API_KEY/);
});

test('scoreSeller returns scoring text from Groq chat completion', async () => {
  const captured = {};
  const seller = { name: 'Jane', property_address: '1 Main', property_city: 'Atlanta', property_state: 'GA', motivation: 'Divorce', status: 'new' };
  const result = await scoreSeller(seller, fakeClient(captured));
  assert.equal(result.success, true);
  assert.equal(result.scoring, 'YES. Strong deal.');
  assert.equal(captured.args.model, 'llama-3.3-70b-versatile');
});
