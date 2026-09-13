(() => {
  const viewer = document.querySelector('.image-viewer');
  if (!viewer || typeof viewer.showModal !== 'function') return;

  const stage = viewer.querySelector('.viewer-stage');
  const image = viewer.querySelector('.viewer-image');
  const title = viewer.querySelector('#viewer-title');
  const original = viewer.querySelector('#viewer-original');
  const zoom = viewer.querySelector('#viewer-zoom');
  const status = viewer.querySelector('.viewer-status');
  let opener;

  function resetZoom() {
    stage.classList.remove('is-zoomed');
    image.style.removeProperty('width');
    zoom.setAttribute('aria-pressed', 'false');
    zoom.textContent = 'Zoom in';
    stage.scrollTo(0, 0);
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

  document.querySelectorAll('.design-open').forEach(link => {
    link.setAttribute('aria-haspopup', 'dialog');
    link.addEventListener('click', event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      opener = link;
      title.textContent = link.closest('.design-piece').querySelector('h3').textContent;
      original.href = link.href;
      image.alt = link.querySelector('img').alt;
      status.textContent = 'Loading image…';
      status.hidden = false;
      zoom.disabled = true;
      resetZoom();
      viewer.showModal();
      document.body.classList.add('viewer-open');
      image.src = link.href;
    });
  });

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
    document.body.classList.remove('viewer-open');
    resetZoom();
    image.removeAttribute('src');
    opener?.focus({ preventScroll: true });
  });
})();
