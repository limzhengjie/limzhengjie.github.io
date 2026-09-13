(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function firstVisit() {
    for (const name of ['localStorage', 'sessionStorage']) {
      try {
        const storage = window[name];
        if (storage.getItem('zj-intro-seen')) return false;
        storage.setItem('zj-intro-seen', '1');
        return true;
      } catch (_) {
        // Try session storage, then quietly skip when storage is blocked.
      }
    }
    return false;
  }
  if (!firstVisit() || reducedMotion.matches) return;

  const panel = document.createElement('aside');
  panel.className = 'site-boot';
  panel.setAttribute('aria-label', 'Site introduction');
  panel.innerHTML = `<div class="boot-heading">
    <span aria-hidden="true">zj.system</span>
    <button type="button" class="boot-skip" aria-label="Skip introduction" title="Skip introduction">×</button>
  </div><pre class="boot-lines" aria-hidden="true"></pre>`;
  document.body.append(panel);
  const lines = panel.querySelector('.boot-lines');
  const messages = ['> building personal site', '> loading data + research', '> ready. welcome in.'];
  const start = performance.now();
  let frame;

  function finish() {
    cancelAnimationFrame(frame);
    const hadFocus = panel.contains(document.activeElement);
    panel.remove();
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('pagehide', finish);
    reducedMotion.removeEventListener('change', finish);
    if (hadFocus) document.querySelector('.theme-lamp')?.focus({ preventScroll: true });
  }
  function onKey(event) {
    if (event.key === 'Escape') finish();
  }
  function animate(now) {
    const elapsed = now - start;
    lines.textContent = messages.map((message, index) =>
      message.slice(0, Math.max(0, Math.floor((elapsed - index * 450) / 15)))
    ).join('\n');
    if (elapsed >= 1900) finish();
    else frame = requestAnimationFrame(animate);
  }
  panel.querySelector('.boot-skip').addEventListener('click', finish);
  window.addEventListener('keydown', onKey);
  window.addEventListener('pagehide', finish);
  reducedMotion.addEventListener('change', finish);
  frame = requestAnimationFrame(animate);
})();
