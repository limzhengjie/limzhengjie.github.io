(() => {
  const initialized = new WeakSet();
  function initialize() {
    const viewer = document.querySelector('.image-viewer');
    if (!viewer || initialized.has(viewer) || typeof viewer.showModal !== 'function') return;
    initialized.add(viewer);

    const stage = viewer.querySelector('.viewer-stage');
    const image = viewer.querySelector('.viewer-image');
    const title = viewer.querySelector('#viewer-title');
    const original = viewer.querySelector('#viewer-original');
    const zoom = viewer.querySelector('#viewer-zoom');
    const status = viewer.querySelector('.viewer-status');
    const links = [...document.querySelectorAll('.design-open')];
    let current = 0;
    let position;
    let opener;
    let gesture;

    if (links.length > 1) {
      // A cached initial document can include controls, but not their listeners.
      viewer.querySelector('.viewer-pager')?.remove();
      const pager = document.createElement('div');
      pager.className = 'viewer-pager';
      const previous = document.createElement('button');
      previous.type = 'button';
      previous.setAttribute('aria-label', 'Previous image');
      previous.textContent = '←';
      position = document.createElement('span');
      position.setAttribute('role', 'status');
      position.setAttribute('aria-live', 'polite');
      const next = document.createElement('button');
      next.type = 'button';
      next.setAttribute('aria-label', 'Next image');
      next.textContent = '→';
      previous.addEventListener('click', () => move(-1));
      next.addEventListener('click', () => move(1));
      pager.append(previous, position, next);
      viewer.append(pager);
    }

    function resetZoom() {
      stage.classList.remove('is-zoomed');
      image.style.removeProperty('width');
      zoom.setAttribute('aria-pressed', 'false');
      zoom.textContent = 'Zoom in';
      stage.scrollTo(0, 0);
    }

    function show(index) {
      current = index;
      const link = links[index];
      opener = link;
      title.textContent = link.closest('.design-piece').querySelector('h1, h3').textContent;
      original.href = link.href;
      image.alt = link.querySelector('img').alt;
      image.removeAttribute('src');
      status.textContent = 'Loading image…';
      status.hidden = false;
      zoom.disabled = true;
      if (position) position.textContent = `${index + 1} of ${links.length}`;
      resetZoom();
      image.src = link.href;
    }

    function move(direction) {
      if (!viewer.open || links.length < 2) return;
      show((current + direction + links.length) % links.length);
      document.dispatchEvent(new CustomEvent('site:infographic-view', { detail: { url: links[current].href } }));
    }

    image.addEventListener('load', () => {
      if (!viewer.open) return;
      status.hidden = true;
      zoom.disabled = false;
    });

    image.addEventListener('error', () => {
      if (!viewer.open) return;
      status.textContent = 'Image could not load. Try the Original link above.';
      status.hidden = false;
      zoom.disabled = true;
      image.removeAttribute('src');
    });

    links.forEach((link, index) => {
      link.setAttribute('aria-haspopup', 'dialog');
      link.addEventListener('click', event => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        viewer.showModal();
        document.body.classList.add('viewer-open');
        show(index);
      });
    });

    viewer.addEventListener('keydown', event => {
      if (stage.classList.contains('is-zoomed') || event.altKey || event.ctrlKey || event.metaKey ||
          event.shiftKey || event.target.closest('input, textarea, select, [contenteditable]')) return;
      if (links.length > 1 && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
        move(event.key === 'ArrowLeft' ? -1 : 1);
      }
    });

    // Leave vertical scrolling, pinch gestures and a zoomed image to the browser.
    stage.addEventListener('touchstart', event => {
      if (event.touches.length !== 1 || stage.classList.contains('is-zoomed')) {
        gesture = undefined;
        return;
      }
      const touch = event.touches[0];
      gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, time: event.timeStamp };
    }, { passive: true });
    stage.addEventListener('touchend', event => {
      const start = gesture;
      gesture = undefined;
      const touch = [...event.changedTouches].find(touch => touch.identifier === start?.id);
      if (!start || !touch || event.touches.length || stage.classList.contains('is-zoomed')) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && event.timeStamp - start.time < 800) {
        move(dx < 0 ? 1 : -1);
      }
    }, { passive: true });
    stage.addEventListener('touchcancel', () => { gesture = undefined; }, { passive: true });

    zoom.addEventListener('click', () => {
      if (stage.classList.contains('is-zoomed')) {
        resetZoom();
        return;
      }
      image.style.width = `${Math.min(image.naturalWidth, Math.max(stage.clientWidth * 2, 1600))}px`;
      stage.classList.add('is-zoomed');
      zoom.setAttribute('aria-pressed', 'true');
      zoom.textContent = 'Fit image';
    });

    viewer.querySelector('#viewer-close').addEventListener('click', () => viewer.close());
    viewer.addEventListener('click', event => {
      if (event.target === viewer) viewer.close();
    });
    viewer.addEventListener('close', () => {
      gesture = undefined;
      document.body.classList.remove('viewer-open');
      resetZoom();
      image.removeAttribute('src');
      opener?.focus({ preventScroll: true });
    });
  }
  initialize();
  document.addEventListener('site:load', initialize);
})();
