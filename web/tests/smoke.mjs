import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html);

if (!dom.window.document.querySelector('[data-page="overview"]')) {
  throw new Error('Overview page is missing its page marker');
}

if (!dom.window.document.querySelector('[data-summary]')) {
  throw new Error('Overview page is missing the summary host');
}

console.log('frontend smoke ok');

