(() => {
  function initialize() {
    if (!document.body.classList.contains('page-home')) return;
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

    const panel = document.createElement('dialog');
    if (typeof panel.showModal !== 'function') return;
    panel.className = 'site-boot';
    panel.setAttribute('aria-label', 'Site introduction');
    panel.setAttribute('aria-describedby', 'boot-description');
    panel.innerHTML = `<button type="button" class="boot-skip" aria-label="Skip introduction" title="Skip introduction">×</button>
      <div class="boot-console">
        <p class="boot-heading" aria-hidden="true">zj.system</p>
        <p class="boot-name" aria-hidden="true">Zheng Jie Lim</p>
        <pre class="boot-lines" aria-hidden="true"><span class="boot-copy"></span></pre>
      </div>
      <p class="sr-only" id="boot-description">Welcome to Zheng Jie Lim’s website. The homepage will appear shortly. Skip this introduction at any time.</p>`;
    document.body.append(panel);
    const lines = panel.querySelector('.boot-copy');
    const messages = ['> building personal site', '> loading data + research', '> ready. welcome in.'];
    const start = performance.now();
    let frame;
    let exitTimer;
    let finished = false;

    function finish({ restoreFocus = false } = {}) {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(frame);
      clearTimeout(exitTimer);
      const hadFocus = panel.contains(document.activeElement);
      panel.close();
      panel.remove();
      window.removeEventListener('pagehide', finish);
      document.removeEventListener('site:before-render', finish);
      reducedMotion.removeEventListener('change', finish);
      if (restoreFocus || hadFocus) {
        const main = document.querySelector('main');
        main.setAttribute('tabindex', '-1');
        main.focus({ preventScroll: true });
      }
    }
    function animate(now) {
      const elapsed = now - start;
      lines.textContent = messages.filter((_, index) => elapsed >= index * 1800)
        .map((message, index) => message.slice(0, Math.floor((elapsed - index * 1800) / 40)))
        .join('\n');
      if (elapsed >= 6000) {
        panel.classList.add('is-finishing');
        exitTimer = setTimeout(finish, 180);
      } else frame = requestAnimationFrame(animate);
    }
    panel.querySelector('.boot-skip').addEventListener('click', () => finish({ restoreFocus: true }));
    panel.addEventListener('cancel', event => { event.preventDefault(); finish({ restoreFocus: true }); });
    panel.addEventListener('close', finish, { once: true });
    window.addEventListener('pagehide', finish);
    document.addEventListener('site:before-render', finish);
    reducedMotion.addEventListener('change', finish);
    try {
      panel.showModal();
      frame = requestAnimationFrame(animate);
    } catch (_) {
      // A browser that cannot show the introduction should still show the site.
      finish();
    }
  }
  initialize();
  document.addEventListener('site:load', initialize);
})();
