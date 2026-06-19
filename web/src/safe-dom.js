const SAFE_PROTOCOLS = new Set(['http:', 'https:']);

export function text(value, fallback = 'Not available') {
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

export function safeUrl(value, fallback = '#') {
  try {
    const url = new URL(String(value), window.location.href);
    return SAFE_PROTOCOLS.has(url.protocol) ? url.href : fallback;
  } catch {
    return fallback;
  }
}

export function clear(node) {
  node.replaceChildren();
}

export function element(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || value === null) continue;
    if (key === 'className') node.className = String(value);
    else if (key === 'textContent') node.textContent = text(value, '');
    else if (key === 'dataset') {
      for (const [dataKey, dataValue] of Object.entries(value)) {
        node.dataset[dataKey] = text(dataValue, '');
      }
    } else node.setAttribute(key, String(value));
  }
  for (const child of children) {
    node.append(child instanceof Node ? child : document.createTextNode(text(child, '')));
  }
  return node;
}

export function externalLink(label, url, className = '') {
  const href = safeUrl(url);
  const link = element('a', { href, textContent: label, className });
  if (href !== '#') {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
  return link;
}

export function localLink(label, href, className = '') {
  return element('a', { href, textContent: label, className });
}

export function statusClass(status) {
  if (status === 'available') return 'ok';
  if (status === 'error') return 'bad';
  return 'muted';
}

