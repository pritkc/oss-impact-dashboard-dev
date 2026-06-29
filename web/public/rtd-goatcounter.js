(() => {
  const config = {"siteUrl":"https://your-docs.goatcounter.com","trackedDomain":"docs.example.org","countEndpoint":"https://your-docs.goatcounter.com/count","trackerScript":"https://gc.zgo.at/count.js"};
  const sent = new Set();
  const debug = { scanCount: 0 };
  if (!config.siteUrl || !config.trackedDomain) return;
  if (window.__ossImpactGoatCounterInstalled) return;
  window.__ossImpactGoatCounterInstalled = true;
  window.__ossImpactGoatCounterDebug = debug;
  if (location.hostname !== config.trackedDomain) return;

  function normalizePath(pathname) {
    const value = String(pathname || '/').split('?')[0].split('#')[0].replace(/\/{2,}/g, '/').slice(0, 160);
    if (!value || /[\u0000-\u001f\u007f]/.test(value)) return '/';
    return value.startsWith('/') ? value : `/${value}`;
  }

  function sendOnce(key, payload) {
    if (sent.has(key)) return;
    sent.add(key);
    const deadline = Date.now() + 5000;
    const tick = () => {
      if (window.goatcounter && typeof window.goatcounter.count === 'function') {
        window.goatcounter.count(payload);
      } else if (Date.now() < deadline) {
        window.setTimeout(tick, 100);
      }
    };
    tick();
  }

  function looksLikeSearchForm(form) {
    const text = [form.getAttribute('role'), form.getAttribute('action'), form.getAttribute('id'), form.getAttribute('class')]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (text.includes('search')) return true;
    return Boolean(form.querySelector('input[type="search"], input[name="q"], input[name="query"], input[name="search"]'));
  }

  function installSearchTracking() {
    document.addEventListener('submit', (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !looksLikeSearchForm(form)) return;
      sendOnce(`search:${Date.now()}:${Math.random()}`, {
        path: 'event:documentation-search',
        title: 'Documentation search',
        event: true,
        no_session: true
      });
    }, true);
  }

  function detectNoResults() {
    const hasMarker = document.querySelector('.no-results, .search-no-results, [data-search-no-results], #no-results');
    const text = hasMarker ? '' : document.body ? document.body.textContent.toLowerCase().replace(/\s+/g, ' ') : '';
    if (hasMarker || text.includes('no results found') || text.includes('your search did not match')) {
      sendOnce('no-results', {
        path: 'event:documentation-search-no-results',
        title: 'Documentation search with no results',
        event: true,
        no_session: true
      });
    }
  }

  function detectNotFound() {
    const title = document.title.toLowerCase();
    const h1 = document.querySelector('h1')?.textContent.toLowerCase() || '';
    const bodyClass = document.body?.className?.toString().toLowerCase() || '';
    const is404 = title.includes('404') || title.includes('page not found') || h1.includes('404') || h1.includes('page not found') || bodyClass.includes('error404');
    if (!is404) return;
    const normalizedPath = normalizePath(location.pathname);
    sendOnce(`404:${normalizedPath}`, {
      path: `event:documentation-404:${normalizedPath}`,
      title: 'Documentation 404',
      event: true,
      no_session: true
    });
  }

  const script = document.createElement('script');
  script.async = true;
  script.src = config.trackerScript;
  script.dataset.goatcounter = config.countEndpoint;
  document.head.append(script);
  installSearchTracking();
  let noResultsSent = false;
  let notFoundSent = false;
  let observer;
  let observerDeadline = 0;
  let debounceTimer = 0;
  const stopObserver = () => {
    if (observer) observer.disconnect();
    if (observerDeadline) window.clearTimeout(observerDeadline);
    observer = null;
    observerDeadline = 0;
  };
  const scan = () => {
    debug.scanCount += 1;
    if (!noResultsSent) {
      const before = sent.size;
      detectNoResults();
      noResultsSent = sent.has('no-results') || sent.size > before;
    }
    if (!notFoundSent) {
      detectNotFound();
      notFoundSent = [...sent].some((key) => key.startsWith('404:'));
    }
    if (noResultsSent || notFoundSent) stopObserver();
  };
  const scheduleScan = () => {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(scan, 50);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan, { once: true });
  else scan();
  observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  observerDeadline = window.setTimeout(stopObserver, 5000);
})();
