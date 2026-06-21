import { JSDOM } from 'jsdom';
import { trackerSource } from '../../scripts/generate-rtd-goatcounter.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function runTracker({ html, url, source }) {
  const dom = new JSDOM(html, {
    url,
    runScripts: 'dangerously',
    pretendToBeVisual: true
  });
  const calls = [];
  dom.window.goatcounter = { count: (payload) => calls.push(payload) };
  dom.window.eval(source);
  await new Promise((resolve) => dom.window.setTimeout(resolve, 20));
  return { dom, calls };
}

const disabled = trackerSource();
const disabledRun = await runTracker({
  html: '<!doctype html><title>Docs</title><main></main>',
  url: 'https://docs.example.org/',
  source: disabled
});
assert(!disabledRun.dom.window.document.querySelector('script[src="https://gc.zgo.at/count.js"]'), 'disabled tracker should not load GoatCounter');

const active = trackerSource({
  siteUrl: 'https://example.goatcounter.com',
  trackedDomain: 'docs.example.org'
});
const activeRun = await runTracker({
  html: '<!doctype html><title>Docs</title><form role="search"><input name="q" value="private query"></form><p>No results found</p>',
  url: 'https://docs.example.org/search.html?q=private',
  source: active
});
const script = activeRun.dom.window.document.querySelector('script[src="https://gc.zgo.at/count.js"]');
assert(script, 'active tracker should load GoatCounter');
assert(script.dataset.goatcounter === 'https://example.goatcounter.com/count', 'active tracker should set count endpoint');
assert(!activeRun.calls.some((payload) => payload.path === '/search.html'), 'tracker must not send duplicate manual pageview');
activeRun.dom.window.document.querySelector('form').dispatchEvent(new activeRun.dom.window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise((resolve) => activeRun.dom.window.setTimeout(resolve, 20));
assert(activeRun.calls.some((payload) => payload.path === 'event:documentation-search'), 'search event missing');
assert(activeRun.calls.some((payload) => payload.path === 'event:documentation-search-no-results'), 'no-result event missing');
assert(!JSON.stringify(activeRun.calls).includes('private query'), 'search text must not be collected');

const foreignRun = await runTracker({
  html: '<!doctype html><title>Docs</title>',
  url: 'https://foreign.example.org/',
  source: active
});
assert(!foreignRun.dom.window.document.querySelector('script[src="https://gc.zgo.at/count.js"]'), 'domain restriction failed');

const notFoundRun = await runTracker({
  html: '<!doctype html><title>404 Page not found</title><h1>Page not found</h1>',
  url: 'https://docs.example.org//missing/page.html?x=1#frag',
  source: active
});
assert(
  notFoundRun.calls.some((payload) => payload.path === 'event:documentation-404:/missing/page.html'),
  '404 event should use normalized pathname'
);
const before = notFoundRun.calls.length;
notFoundRun.dom.window.document.body.append('Page not found');
await new Promise((resolve) => notFoundRun.dom.window.setTimeout(resolve, 20));
assert(notFoundRun.calls.length === before, 'duplicate 404 event should be prevented');

console.log('rtd goatcounter tests ok');
