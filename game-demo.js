(() => {
  const demo = document.querySelector('[data-game-demo]');
  if (!demo) return;

  const steps = [...demo.querySelectorAll('[data-demo-step]')];
  const panels = [...demo.querySelectorAll('[data-demo-panel]')];
  const stage = demo.querySelector('.demo-stage');
  const menu = demo.querySelector('.game-menu');
  const compact = window.matchMedia('(max-width: 760px)');
  const comparisonRange = demo.querySelector('#compare-range');
  const comparisonButtons = [...demo.querySelectorAll('[data-compare-position]')];
  const hudPreview = demo.querySelector('#hud-playground');
  const hudEditor = demo.querySelector('#hud-editor');
  const editorButton = demo.querySelector('[data-demo-view="hud-editor"]');
  let activeStep = steps[0];
  let scrollPending = false;
  let usingMenu = false;

  function activate(step) {
    if (step === activeStep) return;
    activeStep = step;
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.demoPanel !== step.dataset.demoStep;
      if (panel.hidden) panel.querySelector('video')?.pause();
    });
  }

  function followScroll() {
    scrollPending = false;
    const stageBox = stage.getBoundingClientRect();
    // Moving focus inside a sticky panel can nudge the page. Let deliberate
    // scrolling outside the menu resume automatic scene changes.
    if (usingMenu && stageBox.bottom > 0 && stageBox.top < window.innerHeight) return;

    const readingLine = compact.matches
      ? Math.min(window.innerHeight * 0.67, stageBox.top + stageBox.width * 9 / 16 + 64)
      : window.innerHeight * 0.5;
    const step = steps.findLast((item) => item.getBoundingClientRect().top <= readingLine);
    activate(step || steps[0]);
  }

  function scheduleScrollCheck() {
    if (scrollPending) return;
    scrollPending = true;
    window.requestAnimationFrame(followScroll);
  }

  function showEditor(show) {
    hudEditor.hidden = !show;
    hudPreview.hidden = show;
    editorButton.setAttribute('aria-pressed', String(show));
    editorButton.textContent = show ? 'Вернуться к панелям' : 'Ролик редактора';
    if (!show) hudEditor.pause();
  }

  comparisonRange.addEventListener('input', () => {
    comparisonButtons.forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.comparePosition === comparisonRange.value));
    });
  });
  comparisonButtons.forEach((button) => {
    button.addEventListener('click', () => {
      comparisonRange.value = button.dataset.comparePosition;
      comparisonRange.dispatchEvent(new Event('input'));
    });
  });

  editorButton.addEventListener('click', () => showEditor(hudEditor.hidden));
  demo.querySelectorAll('[data-hud-toggle]').forEach((control) => {
    control.addEventListener('change', () => showEditor(false));
  });
  demo.querySelector('#reset-hud').addEventListener('click', () => showEditor(false));

  const categoryButtons = [...menu.querySelectorAll('[data-menu-category]')];
  const menuTitle = menu.querySelector('#game-menu-title');
  const menuCount = menu.querySelector('.game-menu-count');
  const menuSearch = menu.querySelector('input[type="search"]');
  const menuGrid = menu.querySelector('.game-menu-grid');
  const menuEmpty = menu.querySelector('.game-menu-empty');

  // The catalog contains the names and descriptions from the mod's registry.
  const menuCategories = categoryButtons.map((button) => {
    const count = button.querySelector('span');
    const title = button.firstChild.textContent.trim();
    const catalog = document.getElementById(button.dataset.menuCategory);
    const modules = [...catalog.querySelectorAll('.module-list > div')].map((entry) => {
      const name = entry.querySelector('dt').textContent.trim();
      const description = entry.querySelector('dd').textContent.trim();
      const card = document.createElement('label');
      card.className = 'game-module-card';
      card.title = description;

      const copy = document.createElement('span');
      const heading = document.createElement('strong');
      const detail = document.createElement('small');
      heading.textContent = name;
      detail.textContent = description;
      copy.append(heading, detail);

      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.setAttribute('role', 'switch');
      toggle.setAttribute('aria-label', name);
      card.append(copy, toggle);

      return { card, toggle, keywords: (name + ' ' + description).toLowerCase() };
    });
    count.textContent = modules.length;
    return { button, title, modules };
  });
  let menuCategory = menuCategories[0];

  function updateMenuCounts() {
    const enabled = menuCategory.modules.filter(({ toggle }) => toggle.checked).length;
    const total = menuCategory.modules.length;
    const shown = menuGrid.childElementCount;
    const displayed = shown === total ? 'Всего ' + total : 'Найдено ' + shown + ' из ' + total;
    menuCount.textContent = displayed + ' · ' + enabled + ' включено';
  }

  function renderMenu() {
    const query = menuSearch.value.trim().toLowerCase();
    const results = menuCategory.modules.filter(({ keywords }) => keywords.includes(query));
    menuTitle.textContent = menuCategory.title;
    menuGrid.replaceChildren(...results.map(({ card }) => card));
    menuGrid.scrollTop = 0;
    menuEmpty.hidden = results.length > 0;
    updateMenuCounts();
  }

  menuCategories.forEach((category) => {
    category.button.addEventListener('click', () => {
      if (menuCategory === category) return;
      menuCategory.button.setAttribute('aria-pressed', 'false');
      menuCategory = category;
      category.button.setAttribute('aria-pressed', 'true');
      menuSearch.value = '';
      renderMenu();
    });
  });
  menuSearch.addEventListener('input', renderMenu);
  menuGrid.addEventListener('change', updateMenuCounts);
  renderMenu();

  demo.addEventListener('focusin', (event) => {
    const step = event.target.closest('[data-demo-step]');
    if (step) activate(step);
  });
  function trackMenuInteraction(event) {
    usingMenu = menu.contains(event.target);
  }

  document.addEventListener('focusin', trackMenuInteraction);
  document.addEventListener('pointerdown', trackMenuInteraction);
  document.addEventListener('wheel', (event) => {
    if (!menuGrid.contains(event.target)) usingMenu = false;
  }, { passive: true });

  window.addEventListener('scroll', scheduleScrollCheck, { passive: true });
  window.addEventListener('resize', scheduleScrollCheck);
  window.addEventListener('pageshow', scheduleScrollCheck);
  scheduleScrollCheck();
})();
