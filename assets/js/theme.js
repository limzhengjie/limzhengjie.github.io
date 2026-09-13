(() => {
  const root = document.documentElement;
  const preference = window.matchMedia('(prefers-color-scheme: dark)');
  const storageKey = 'zj-theme';
  let savedTheme = null;
  let lamp;

  const validTheme = (value) => value === 'light' || value === 'dark';
  function readStoredTheme() {
    try {
      const stored = localStorage.getItem(storageKey);
      savedTheme = validTheme(stored) ? stored : null;
    } catch (_) {
      // The switch still works when browser storage is unavailable.
    }
  }

  function applyTheme() {
    const theme = savedTheme || (preference.matches ? 'dark' : 'light');
    root.dataset.theme = theme;
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
      meta.content = theme === 'dark' ? '#141413' : '#f6f4ef';
    });
    if (lamp) {
      const action = `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`;
      lamp.setAttribute('aria-label', action);
      lamp.title = action;
    }
  }

  // Run before the stylesheet paints so saved preferences do not flash.
  readStoredTheme();
  applyTheme();

  document.addEventListener('DOMContentLoaded', () => {
    lamp = document.createElement('button');
    lamp.type = 'button';
    lamp.className = 'theme-lamp';
    lamp.innerHTML = `
      <svg viewBox="0 0 56 104" aria-hidden="true" focusable="false">
        <g class="lamp-fixture">
          <path d="M28 0v57" fill="none" stroke="currentColor" stroke-width="1.25"/>
          <ellipse class="lamp-glow" cx="28" cy="82" rx="19" ry="9"/>
          <path d="M40 76v17" fill="none" stroke="currentColor" stroke-width="1"/>
          <circle cx="40" cy="95" r="2" fill="currentColor"/>
          <circle class="lamp-bulb" cx="28" cy="77" r="5"/>
          <path class="lamp-shade" d="M24 55h8v5c6 2 9 9 14 17H10c5-8 8-15 14-17z"/>
          <path d="M12 77h32" fill="none" stroke="var(--lamp-bulb)" stroke-width="1.5" stroke-linecap="round"/>
        </g>
      </svg>`;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    lamp.querySelector('.lamp-fixture').addEventListener('animationend', (event) => {
      if (event.animationName === 'lamp-pull') lamp.classList.remove('is-pulled');
    });
    motion.addEventListener('change', () => lamp.classList.remove('is-pulled'));
    lamp.addEventListener('click', () => {
      savedTheme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(storageKey, savedTheme);
      } catch (_) {
        // Keep the choice for this page even if it cannot be persisted.
      }
      applyTheme();
      lamp.classList.remove('is-pulled');
      if (!motion.matches) {
        // Restart the pull response even if another tap arrives mid-swing.
        void lamp.offsetWidth;
        lamp.classList.add('is-pulled');
      }
    });
    applyTheme();
    // Preserve the skip link as the first keyboard stop.
    const skipLink = document.querySelector('.skip-link');
    if (skipLink) skipLink.after(lamp);
    else document.body.prepend(lamp);
  });

  preference.addEventListener('change', () => {
    if (!savedTheme) applyTheme();
  });

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      readStoredTheme();
      applyTheme();
    }
  });

  window.addEventListener('storage', (event) => {
    if (event.key === storageKey || event.key === null) {
      savedTheme = validTheme(event.newValue) ? event.newValue : null;
      applyTheme();
    }
  });
})();
