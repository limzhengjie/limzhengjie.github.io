(() => {
  // Warm only our small HTML pages. An uncached click remains a normal link.
  const pages = new Map();
  const pending = new Map();
  let leaving = false;
  let warmTask = null;
  const maxAge = 60_000;
  const metadata = 'title, meta[name], meta[property], link[rel="canonical"], script[type="application/ld+json"]';
  let currentPath = location.pathname;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let entrance = null;
  const pageKey = url => url.origin + url.pathname;
  const canPrefetch = () => !navigator.connection?.saveData &&
    !['slow-2g', '2g'].includes(navigator.connection?.effectiveType);

  function cached(url) {
    const page = pages.get(pageKey(url));
    return page && Date.now() - page.saved < maxAge ? page.html : null;
  }

  function remember(url, html) {
    const key = pageKey(url);
    pages.delete(key);
    pages.set(key, { html, saved: Date.now() });
    if (pages.size > 12) pages.delete(pages.keys().next().value);
  }

  function localPage(link) {
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return null;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || url.search || url.hash || !url.pathname.endsWith('/')) return null;
    return url;
  }

  async function prefetch(url) {
    if (leaving || !url || !canPrefetch() || cached(url) || pending.has(pageKey(url))) return;
    const key = pageKey(url);
    const controller = new AbortController();
    pending.set(key, controller);
    window.addEventListener('beforeunload', stopPreloads);
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(url, { credentials: 'same-origin', priority: 'low', signal: controller.signal });
      if (response.ok && !response.redirected && response.headers.get('content-type')?.includes('text/html')) {
        remember(url, await response.text());
      }
    } catch (_) {
      // Offline, blocked or failed preloads never prevent ordinary navigation.
    } finally {
      clearTimeout(timeout);
      if (pending.get(key) === controller) pending.delete(key);
      releaseUnloadGuard();
    }
  }

  function warmNavigation() {
    if (document.visibilityState !== 'visible') return;
    document.querySelectorAll('.site-nav a').forEach(link => prefetch(localPage(link)));
  }

  function destination(url) {
    const html = cached(url);
    if (!html) return null;
    const next = new DOMParser().parseFromString(html, 'text/html');
    if (!next.querySelector('main#main-content') || !next.querySelector('script[src^="/assets/js/navigation.js"]')) return null;
    // Different stylesheet/script URLs indicate a new build: let the browser load it.
    const assets = doc => [...doc.querySelectorAll('head script[src], link[rel="stylesheet"]')]
      .map(node => node.getAttribute('src') || node.getAttribute('href')).join('|');
    return assets(next) === assets(document) ? next : null;
  }

  function stopMotion() {
    entrance?.cancel();
    entrance = null;
  }

  function enterPage(main) {
    if (reducedMotion.matches || document.hidden || document.querySelector('dialog[open]')) return;
    try {
      // Animate the live content, so another tap never has to wait for a snapshot.
      const animation = main.animate([
        { opacity: 0, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ], { duration: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
      entrance = animation;
      animation.finished.catch(() => {}).finally(() => {
        if (entrance === animation) entrance = null;
      });
    } catch (_) {
      // Older browsers still get the immediate, fully visible page.
    }
  }
  reducedMotion.addEventListener('change', stopMotion);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopMotion(); });

  function render(next, url, scroll) {
    stopMotion();
    document.dispatchEvent(new Event('site:before-render'));
    document.querySelector('main').replaceWith(document.importNode(next.querySelector('main'), true));
    document.querySelector('.image-viewer')?.remove();
    const viewer = next.querySelector('.image-viewer');
    if (viewer) document.body.append(document.importNode(viewer, true));
    document.body.className = next.body.className;
    document.head.querySelectorAll(metadata).forEach(node => node.remove());
    next.head.querySelectorAll(metadata).forEach(node => document.head.append(document.importNode(node, true)));
    currentPath = url.pathname;
    document.dispatchEvent(new Event('site:load'));
    const main = document.querySelector('main');
    main.setAttribute('tabindex', '-1');
    main.focus({ preventScroll: true });
    window.scrollTo(...scroll);
    enterPage(main);
  }

  function saveScroll() {
    history.replaceState({ ...history.state, zjNavigation: true, zjScroll: [scrollX, scrollY] }, '', location.href);
  }

  remember(new URL(location.href), document.documentElement.outerHTML);
  saveScroll();
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const url = localPage(event.target.closest('a[href]'));
    if (!url) return;
    if (url.pathname === location.pathname && !location.search && !location.hash) {
      event.preventDefault();
      stopMotion();
      window.scrollTo(0, 0);
      return;
    }
    const next = destination(url);
    if (!next) return;
    event.preventDefault();
    saveScroll();
    if (url.pathname !== location.pathname || location.search || location.hash) history.pushState({ zjNavigation: true, zjScroll: [0, 0] }, '', url);
    render(next, url, [0, 0]);
  });

  window.addEventListener('popstate', event => {
    if (location.pathname === currentPath) return; // Leave same-page anchor history to the browser.
    const url = new URL(location.href);
    const next = destination(url);
    if (!next || !event.state?.zjNavigation) {
      location.reload();
      return;
    }
    render(next, url, event.state.zjScroll || [0, 0]);
  });

  function releaseUnloadGuard() {
    // Only guard while work is queued/in flight; don't retain an unload listener on an idle page.
    if (warmTask === null && pending.size === 0) window.removeEventListener('beforeunload', stopPreloads);
  }

  function stopPreloads() {
    leaving = true;
    stopMotion();
    if ('cancelIdleCallback' in window) cancelIdleCallback(warmTask);
    else clearTimeout(warmTask);
    warmTask = null;
    pending.forEach(controller => controller.abort());
    pending.clear();
    releaseUnloadGuard();
  }
  window.addEventListener('pagehide', stopPreloads);
  window.addEventListener('pageshow', event => {
    if (event.persisted) { leaving = false; schedule(); }
  });

  for (const type of ['pointerover', 'focusin', 'touchstart']) {
    document.addEventListener(type, event => prefetch(localPage(event.target.closest('a[href]'))), { passive: true });
  }
  const schedule = () => {
    if (leaving || warmTask !== null) return;
    window.addEventListener('beforeunload', stopPreloads);
    const warm = () => { warmTask = null; warmNavigation(); releaseUnloadGuard(); };
    if ('requestIdleCallback' in window) warmTask = requestIdleCallback(warm, { timeout: 1000 });
    else warmTask = setTimeout(warm, 150);
  };
  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
  document.addEventListener('site:load', schedule);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(); });
})();
