const test = require('node:test');
const assert = require('node:assert/strict');
const { startupPlan } = require('../shared/startup.cjs');

const windows = [{ tabs: [{ url: 'https://chatgpt.com/' }] }];

test('a crash restores tabs even when resume is off', () => {
  const plan = startupPlan({ cleanExit: false, windows }, false);
  assert.equal(plan.mode, 'crash');
  assert.equal(plan.windows.length, 1);
});

test('a clean quit opens the startup page unless resume is on', () => {
  assert.equal(startupPlan({ cleanExit: true, windows }, false).mode, 'home');
  assert.equal(startupPlan({ cleanExit: true, windows }, true).mode, 'resume');
});

test('nothing is restored when there are no saved tabs', () => {
  assert.equal(startupPlan({ cleanExit: false, windows: [] }, true).mode, 'home');
  assert.equal(startupPlan(null, true).mode, 'home');
});
