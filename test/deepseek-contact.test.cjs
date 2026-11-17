const { test } = require('node:test');
const assert = require('node:assert/strict');
const { selectEmail, createBudget } = require('../electron/deepseek-contact.cjs');
const input = { emails: ['one@example.org', 'two@example.org'], sourceUrl: 'https://creator.example/contact', context: 'business one@example.org support two@example.org' };

test('DeepSeek can choose only an extracted address within the estimated budget', async () => {
  const budget = createBudget(); let request;
  const fetchImpl = async (url, options) => { request = { url, options }; return { ok: true, json: async () => ({ choices: [{ message: { content: '{"email":"one@example.org"}' } }], usage: { prompt_tokens: 200, completion_tokens: 20 } }) }; };
  assert.equal(await selectEmail(input, { apiKey: 'test-secret', budget, fetchImpl }), 'one@example.org');
  const body = JSON.parse(request.options.body);
  assert.equal(body.model, 'deepseek-flash');
  assert.equal(body.thinking.type, 'disabled');
  assert.equal(body.max_tokens, 256);
  assert.equal(budget.calls, 1);
  assert.ok(budget.reservedUsd > 0 && budget.reservedUsd <= budget.maxEstimatedUsd);
  assert.equal(budget.inputTokens, 200);
});

test('DeepSeek rejects invented emails and enforces call and estimated-cost limits', async () => {
  const bad = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"email":"madeup@example.org"}' } }] }) });
  await assert.rejects(selectEmail(input, { apiKey: 'secret', budget: createBudget(), fetchImpl: bad }), /not present/);
  const limited = createBudget(); limited.maxEstimatedUsd = 0;
  let called = false;
  await assert.rejects(selectEmail(input, { apiKey: 'secret', budget: limited, fetchImpl: async () => { called = true; } }), /budget/);
  assert.equal(called, false);
  const calledOut = createBudget(); calledOut.calls = 3;
  await assert.rejects(selectEmail(input, { apiKey: 'secret', budget: calledOut, fetchImpl: bad }), /call limit/);
});

test('OpenRouter routes to the chosen model with a provider price ceiling', async () => {
  const budget = createBudget(); let request;
  const fetchImpl = async (url, options) => { request = { url, options }; return { ok: true, json: async () => ({ choices: [{ message: { content: '{"email":"two@example.org"}' } }], usage: { prompt_tokens: 100, completion_tokens: 10, cost: 0.000012 } }) }; };
  const result = await selectEmail(input, { apiKey: 'test-key', budget, provider: 'openrouter', fetchImpl });
  assert.equal(result, 'two@example.org');
  assert.equal(request.url, 'https://openrouter.ai/api/v1/chat/completions');
  const body = JSON.parse(request.options.body);
  assert.equal(body.model, 'deepseek/deepseek-v4.1-flash-1017');
  assert.deepEqual(body.provider.max_price, { prompt: 0.3, completion: 1.2 });
  assert.equal(body.reasoning.enabled, false);
  assert.equal(budget.actualCostKnown, true);
  assert.equal(budget.actualUsd, 0.000012);
});
