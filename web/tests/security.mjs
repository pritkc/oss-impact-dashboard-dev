import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><main id="root"></main>', {
  url: `https://example.test${process.env.VITE_BASE_PATH || '/oss-impact-dashboard/'}`
});

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

const { element, externalLink, safeUrl } = await import('../src/safe-dom.js');

const root = document.getElementById('root');

root.append(element('div', { textContent: '<script>window.evil = true</script>' }));
root.append(element('span', { textContent: '<img src=x onerror="window.evil=true">' }));
root.append(externalLink('bad', 'javascript:alert(1)'));

if (document.querySelector('script')) {
  throw new Error('Injected script element was created');
}

if (document.querySelector('img')) {
  throw new Error('Injected image element was created');
}

if (window.evil) {
  throw new Error('Injected JavaScript executed');
}

if (safeUrl('javascript:alert(1)') !== '#') {
  throw new Error('javascript: URL was not neutralized');
}

const badLink = root.querySelector('a');
if (badLink.getAttribute('href') !== '#') {
  throw new Error('Unsafe link href was not neutralized');
}

const trackerSource = await import('../../scripts/generate-rtd-goatcounter.mjs');
const activeTracker = trackerSource.trackerSource({
  siteUrl: 'https://example.goatcounter.com',
  trackedDomain: 'docs.example.org'
});
if (activeTracker.includes('GOATCOUNTER_API_KEY') || activeTracker.includes('secret')) {
  throw new Error('Tracker source must not contain API-key material');
}

console.log('frontend security ok');
