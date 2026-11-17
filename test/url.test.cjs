const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyInput, homepageUrl, newTabUrl, isWebUrl } = require('../shared/url.cjs');

test('startup pages are the RightTab page, ChatGPT, and Google', () => {
  assert.equal(homepageUrl('righttab'), 'righttab://newtab/');
  assert.equal(homepageUrl('chatgpt'), 'https://chatgpt.com/');
  assert.equal(homepageUrl('google'), 'https://www.google.com/');
  assert.equal(homepageUrl('elsewhere'), 'righttab://newtab/');
});

test('new tabs can stay on the RightTab page when startup is somewhere else', () => {
  assert.equal(newTabUrl({ startupPage: 'chatgpt', newTabPage: 'righttab' }), 'righttab://newtab/');
  assert.equal(newTabUrl({ startupPage: 'google', newTabPage: 'startup' }), 'https://www.google.com/');
  assert.equal(newTabUrl({ startupPage: 'righttab', newTabPage: 'chatgpt' }), 'https://chatgpt.com/');
});

test('addresses navigate and ordinary text searches Google', () => {
  assert.equal(classifyInput('https://chatgpt.com/c/abc').url, 'https://chatgpt.com/c/abc');
  assert.equal(classifyInput('chatgpt.com').url, 'https://chatgpt.com');
  assert.equal(classifyInput('localhost:3000/app').url, 'http://localhost:3000/app');
  const search = classifyInput('how much money do i need in spy');
  assert.equal(search.type, 'search');
  assert.equal(search.engine, 'google');
  assert.match(search.url, /^https:\/\/www\.google\.com\/search\?q=/);
  assert.match(search.url, /how%20much%20money/);
});

test('search engine setting does not change direct URLs', () => {
  assert.equal(classifyInput('https://example.com', 'duckduckgo').url, 'https://example.com');
  assert.match(classifyInput('pasta recipes', 'bing').url, /^https:\/\/www\.bing\.com\/search/);
});

test('dangerous address-bar schemes are blocked', () => {
  for (const input of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,hi', 'chrome://settings', 'righttab://settings']) {
    assert.equal(classifyInput(input).type, 'blocked');
    assert.equal(isWebUrl(input), false);
  }
  assert.equal(classifyInput('righttab://newtab').url, 'righttab://newtab/');
});

test('Brave Search and a custom engine route queries without changing typed addresses', () => {
  assert.match(classifyInput('pasta recipes', 'brave').url, /^https:\/\/search\.brave\.com\/search\?q=pasta%20recipes/);
  const custom = [{ id: 'custom-examplecom', name: 'Example', template: 'https://example.com/search?q=%s' }];
  const routed = classifyInput('hello world', 'custom-examplecom', custom);
  assert.equal(routed.engine, 'custom-examplecom');
  assert.equal(routed.url, 'https://example.com/search?q=hello%20world');
  assert.equal(classifyInput('https://example.com', 'custom-examplecom', custom).url, 'https://example.com');
  assert.equal(classifyInput('pasta', 'missing-engine', custom).engine, 'google');
});
