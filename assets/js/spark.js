(() => {
  if (typeof crypto.randomUUID !== 'function') return;
  const endpoint = ['limzhengjie.com', 'www.limzhengjie.com', 'limzhengjie.github.io'].includes(location.hostname)
    ? 'https://limzhengjie-github-io.vercel.app/api/spark' : '/api/spark';
  const storageKey = 'zj-spark-session-v1';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let session = { visited: false, queue: [] };
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey));
    if (saved?.visited === true && Array.isArray(saved.queue)) {
      session = { visited: true, queue: saved.queue.filter(item =>
        /^[a-f0-9-]{36}$/i.test(item.requestId) && Number.isInteger(item.amount) &&
        item.amount > 0 && item.amount <= 10 && Date.now() - item.createdAt < 3600000).slice(0, 30) };
    }
  } catch (_) { /* Storage is optional; Redis owns the total. */ }
  let total = null, busy = false, reading = false, failure = null, view = null;
  let flushTimer, retryTimer, lastRead = 0;
  function persist() {
    try { sessionStorage.setItem(storageKey, JSON.stringify(session)); } catch (_) { /* Private browsing remains usable. */ }
  }
  function makeBatch() {
    return { requestId: crypto.randomUUID(), amount: 1, createdAt: Date.now(), started: false };
  }
  function render() {
    if (!view?.root.isConnected) return;
    view.count.textContent = total === null ? '—' : total.toLocaleString('en-US');
    view.button.disabled = total === null || Boolean(failure) || session.queue.reduce((sum, x) => sum + x.amount, 0) >= 30;
    view.retry.hidden = !failure;
    view.retry.disabled = Boolean(failure && Date.now() < failure.retryAt);
    view.status.textContent = failure ? failure.message : total === null ? 'Connecting…' : '';
  }
  function accept(value) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid total');
    total = Math.max(total ?? 0, value);
  }
  function fail(error) {
    const seconds = error.retryAfter || 0;
    failure = { message: seconds ? 'A little breather. Try again shortly.' : 'Connection interrupted. Retry to sync.', retryAt: Date.now() + seconds * 1000 };
    clearTimeout(retryTimer);
    if (seconds) retryTimer = setTimeout(render, seconds * 1000 + 10);
  }
  async function request(batch) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(endpoint, {
        method: batch ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
        ...(batch ? { headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId: batch.requestId, amount: batch.amount }), keepalive: true } : {}),
        signal: controller.signal
      });
      if (!response.ok) {
        const error = new Error('Counter unavailable');
        if (response.status === 429) error.retryAfter = Math.min(60, Math.max(1, Number(response.headers.get('Retry-After')) || 60));
        throw error;
      }
      return (await response.json()).total;
    } finally { clearTimeout(timeout); }
  }
  async function flush() {
    clearTimeout(flushTimer);
    if (busy || failure || !session.queue.length) return;
    busy = true;
    const batch = session.queue[0];
    // Never change a batch after sending it: retries must use the exact same ID and amount.
    batch.started = true;
    persist(); render();
    try {
      accept(await request(batch));
      session.queue.shift();
      persist();
    } catch (error) { fail(error); }
    finally {
      busy = false; render();
      if (!failure && session.queue.length) flushTimer = setTimeout(flush, 100);
    }
  }
  async function refresh() {
    if (reading || busy || failure) return;
    if (session.queue.length) return flush();
    reading = true; lastRead = Date.now();
    try { accept(await request()); } catch (error) { fail(error); }
    finally { reading = false; render(); }
  }
  function animate() {
    if (!view || reducedMotion.matches) return;
    const { button, root } = view;
    if (typeof button.animate === 'function') {
      button.getAnimations().forEach(animation => animation.cancel());
      button.animate([{ transform: 'scale(1) rotate(0)' }, { transform: 'scale(.88) rotate(-16deg)', offset: .3 },
        { transform: 'scale(1.08) rotate(8deg)', offset: .7 }, { transform: 'scale(1) rotate(0)' }],
      { duration: 380, easing: 'ease-out' });
    }
    const particle = document.createElement('span');
    particle.className = 'spark-particle'; particle.textContent = '+1'; particle.setAttribute('aria-hidden', 'true');
    root.querySelector('.spark-control').append(particle);
    setTimeout(() => particle.remove(), 600);
  }
  function tap() {
    if (total === null || failure) return;
    animate();
    const last = session.queue.at(-1);
    if (last && !last.started && last.amount < 10) last.amount += 1;
    else session.queue.push(makeBatch());
    persist(); render();
    clearTimeout(flushTimer); flushTimer = setTimeout(flush, 120);
  }
  function retry() {
    if (failure && Date.now() < failure.retryAt) return;
    failure = null; render();
    if (session.queue.length) flush(); else refresh();
  }
  function unmount() {
    view?.events.abort(); view?.observer?.disconnect(); view = null;
  }
  function mount() {
    unmount();
    const root = document.querySelector('[data-spark]');
    if (!root) return;
    const events = new AbortController();
    view = { root, events, button: root.querySelector('.spark-button'), count: root.querySelector('[data-spark-count]'),
      status: root.querySelector('[data-spark-status]'), retry: root.querySelector('.spark-retry') };
    view.button.addEventListener('click', tap, { signal: events.signal });
    view.retry.addEventListener('click', retry, { signal: events.signal });
    root.hidden = false; render();
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); refresh(); }
      }, { rootMargin: '120px' });
      view.observer = observer; observer.observe(root);
    } else refresh();
  }
  // One contribution per tab session, including visitors who enter through a detail page.
  if (!session.visited) { session.visited = true; session.queue.unshift(makeBatch()); persist(); }
  mount();
  if (session.queue.length) flush();
  document.addEventListener('site:before-render', unmount);
  document.addEventListener('site:load', mount);
  window.addEventListener('pagehide', flush);
  window.addEventListener('pageshow', () => { if (view && Date.now() - lastRead > 15000) refresh(); });
  window.addEventListener('focus', () => {
    if (view && document.visibilityState === 'visible' && Date.now() - lastRead > 15000) refresh();
  });
  window.addEventListener('online', retry);
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches && view) {
      view.button.getAnimations?.().forEach(animation => animation.cancel());
      view.root.querySelectorAll('.spark-particle').forEach(particle => particle.remove());
    }
  });
})();
