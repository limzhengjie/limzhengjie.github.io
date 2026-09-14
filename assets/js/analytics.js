(() => {
  const hostname = 'limzhengjie.com';
  const website = '18e0df56-605b-4290-a456-65f6b65f6d99';
  const campaignKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  const disabledKey = 'umami.disabled';
  if (location.hostname !== hostname) return;

  // A bookmark can exclude this browser before any analytics script loads.
  // Preferences are local to this site and browser; they are never sent.
  const address = new URL(location.href);
  const preference = address.searchParams.get('analytics');
  try {
    if (preference === 'off') localStorage.setItem(disabledKey, '1');
    else if (preference === 'on') localStorage.removeItem(disabledKey);
    if (preference === 'off' || preference === 'on') {
      address.searchParams.delete('analytics');
      history.replaceState(history.state, '', address.pathname + address.search + address.hash);
    }
  } catch (_) {
    return; // The website still works when storage is unavailable.
  }

  function excluded() {
    try {
      return Boolean(localStorage.getItem(disabledKey)) ||
        ['1', 'yes'].includes(String(navigator.doNotTrack || window.doNotTrack)) ||
        navigator.globalPrivacyControl === true;
    } catch (_) {
      return true;
    }
  }
  if (excluded()) return;

  function cleanUrl(value, campaigns = false) {
    const url = new URL(value, location.origin);
    const query = new URLSearchParams();
    if (campaigns) {
      campaignKeys.forEach(key => {
        const value = url.searchParams.get(key);
        if (value) query.set(key, value.slice(0, 100));
      });
    }
    return (url.hostname === hostname ? '' : url.origin) + url.pathname +
      (query.size ? '?' + query : '');
  }

  function entryReferrer() {
    if (!document.referrer) return '';
    try {
      const url = new URL(document.referrer);
      return url.hostname === hostname ? cleanUrl(url.href) : url.origin;
    } catch (_) {
      return '';
    }
  }

  function pageUrl() {
    // Use the public canonical path, while keeping only campaign parameters.
    const canonical = document.querySelector('link[rel="canonical"]')?.href;
    const url = new URL(canonical || '/404.html', location.origin);
    url.search = location.search;
    return cleanUrl(url.href, true);
  }

  let lastPage;
  let referrer = entryReferrer();
  let ready = false;
  let failed = false;
  const queue = [];

  function send(payload) {
    if (excluded() || failed) return;
    if (!ready) {
      if (queue.length < 50) queue.push(payload);
      return;
    }
    // Umami uses keepalive requests. Never wait for analytics before navigation.
    try { Promise.resolve(window.umami.track(payload)).catch(() => {}); } catch (_) {}
  }

  function snapshot() {
    return {
      website, hostname, url: pageUrl(), title: document.title,
      referrer, language: navigator.language,
      screen: `${screen.width}x${screen.height}`,
    };
  }

  function pageview(restored = false) {
    const current = pageUrl();
    if (!restored && current === lastPage) return;
    if (lastPage) referrer = lastPage;
    lastPage = current;
    send(snapshot());
  }

  function click(event) {
    if (event.button !== 0 && event.button !== 1) return;
    if (event.type === 'auxclick' && event.button !== 1) return;
    const link = event.target.closest?.('a[href]');
    if (!link) return;
    const url = new URL(link.href, location.href);
    const label = (link.getAttribute('aria-label') || link.textContent).trim().slice(0, 150);
    let name;
    let data;
    if (url.protocol === 'mailto:') {
      name = 'contact_click'; data = { channel: 'Email' };
    } else if (!['http:', 'https:'].includes(url.protocol)) {
      return;
    } else if (link.closest('.writing-read')) {
      name = 'article_click'; data = {
        title: link.closest('.writing-card').querySelector('h3').textContent.trim().slice(0, 150),
        publisher: url.hostname, destination: cleanUrl(url.href),
      };
    } else if (url.hostname === hostname && url.pathname.startsWith('/assets/designs/')) {
      const opensViewer = link.matches('.design-open') && event.type === 'click' &&
        !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey &&
        typeof document.querySelector('.image-viewer')?.showModal === 'function';
      name = opensViewer ? 'infographic_open' : 'original_image_click';
      data = { image: url.pathname.split('/').pop() };
    } else if (link.closest('nav[aria-label="Profile links"]')) {
      name = 'profile_click'; data = { channel: label, destination: cleanUrl(url.href) };
    } else if (url.hostname !== hostname) {
      name = 'outbound_click'; data = { label, destination: cleanUrl(url.href) };
    } else if (url.pathname !== location.pathname) {
      name = 'navigation_click'; data = { label, destination: url.pathname };
    } else {
      return; // Same-page anchors are not new page visits.
    }
    send({ ...snapshot(), name, data });
  }

  // Capture before cached navigation replaces the clicked element and page URL.
  for (const type of ['click', 'auxclick']) {
    document.addEventListener(type, event => {
      try { click(event); } catch (_) { /* Tracking must never break a link. */ }
    }, { capture: true, passive: true });
  }
  document.addEventListener('site:load', () => pageview());
  window.addEventListener('pageshow', event => { if (event.persisted) pageview(true); });
  pageview();

  const tracker = document.createElement('script');
  tracker.src = 'https://cloud.umami.is/script.js';
  tracker.async = true;
  tracker.dataset.websiteId = website;
  tracker.dataset.domains = hostname;
  tracker.dataset.autoTrack = 'false'; // Our router owns pageviews and click events.
  tracker.dataset.doNotTrack = 'true';
  tracker.onload = () => {
    ready = typeof window.umami?.track === 'function';
    failed = !ready;
    queue.splice(0).forEach(send);
  };
  tracker.onerror = () => { failed = true; queue.length = 0; };
  // Keep the transport outside head: head asset signatures decide whether a
  // cached page can render without reloading, and must match the source HTML.
  const loadTracker = () => { if (!excluded()) document.body.append(tracker); };
  if (document.readyState === 'complete') loadTracker();
  else window.addEventListener('load', loadTracker, { once: true });
})();
