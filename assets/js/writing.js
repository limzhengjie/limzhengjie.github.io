(() => {
  const initialized = new WeakSet();
  const normalize = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  function initialize() {
    const form = document.querySelector('#writing-search');
    if (!form || initialized.has(form)) return;
    const input = form.querySelector('input');
    const clear = form.querySelector('button');
    const status = document.querySelector('#writing-results');
    const sections = [...document.querySelectorAll('.writing-section')].map(section => ({
      element: section,
      entries: [...section.querySelectorAll('.writing-list > li')].map(item => ({
        element: item,
        text: normalize(section.querySelector('h2').textContent + ' ' + item.textContent),
      })),
    }));

    function filter() {
      const terms = normalize(input.value).trim().split(/\s+/).filter(Boolean);
      let total = 0;
      sections.forEach(section => {
        let count = 0;
        section.entries.forEach(entry => {
          const matches = terms.every(term => entry.text.includes(term));
          entry.element.hidden = !matches;
          if (matches) count++;
        });
        section.element.hidden = count === 0;
        total += count;
      });
      clear.hidden = !input.value;
      status.textContent = terms.length ? (total ? `${total} ${total === 1 ? 'article' : 'articles'}` :
        'No matching articles. Try another search.') : '';
    }

    form.addEventListener('submit', event => event.preventDefault());
    form.addEventListener('reset', event => {
      event.preventDefault();
      input.value = '';
      filter();
      input.focus();
    });
    input.addEventListener('input', filter);
    input.addEventListener('search', filter);
    initialized.add(form);
    form.hidden = false;
    filter();
  }
  initialize();
  document.addEventListener('site:load', initialize);
})();
