(() => {
  'use strict';

  // Names and descriptions follow the supplied CosmoVisuals 0.7-beta JAR.
  // These browser examples have local state and never change game settings.
  const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const logo = '<img src="assets/native/brand/logo.svg" alt="" width="42" height="24">';
  const categories = {
    visuals: { label: 'Визуалы', count: 31, items: [
      ['Ambience', 'Настроение мира: время, небо, туман и погода.', true],
      ['AspectRatio', 'Изменяет разрешение игры.', false],
      ['Aura', 'Эффекты вокруг вас: огни, частицы и орбиты.', true],
      ['BlockOverlay', 'Подсветка блока, на который вы смотрите.', true],
      ['Bloom', 'Мягкое свечение ярких частей мира.', true],
      ['ChinaHat', 'Китайская шляпа над головой.', false],
      ['Cosmetics', 'Нимб, крылья и шапки для вашего персонажа.', true],
      ['Crosshair', 'Прицел в цветах темы и с индикацией попаданий.', true],
      ['DamageNumbers', 'Всплывающие цифры урона при ударе.', true],
      ['Footsteps', 'Лёгкие следы в цветах темы.', true],
      ['ItemPhysics', 'Физика предметов на земле.', false],
      ['Zoom', 'Приближение с плавным изменением масштаба.', false],
    ] },
    hud: { label: 'HUD', count: 9, items: [
      ['HUD Settings', 'Цвет и свечение элементов интерфейса.', true],
      ['Custom Hotbar', 'Панель быстрого доступа с плавным выделением.', true],
      ['Vitals', 'Шкалы здоровья, поглощения и голода.', true],
      ['Armor', 'Состояние вашей брони рядом с хотбаром.', true],
      ['Target HUD', 'Имя, здоровье и портрет выбранной цели.', true],
      ['Potions', 'Активные эффекты и время их действия.', true],
      ['Keybinds', 'Включённые модули и назначенные клавиши.', false],
      ['Information', 'Координаты, FPS и пинг.', true],
      ['Dynamic Island', 'Капсула с названием, FPS и пингом.', true],
    ] },
    utilities: { label: 'Утилиты', count: 11, items: [
      ['Cooldowns', 'Перезарядки предметов всегда под рукой.', true],
      ['ElytraSwap', 'Смена элитр и нагрудника одной клавишей.', false],
      ['HitSound', 'Собственный звук попадания по игроку.', true],
      ['ItemScroller', 'Быстрое перемещение предметов.', false],
      ['LockSlot', 'Защита выбранного слота от случайной смены.', true],
      ['SoundManager', 'Настройка громкости звуков игры.', true],
      ['Sprint', 'Автоматический спринт.', false],
      ['StreamerMode', 'Скрытие личной информации.', false],
    ] },
  };

  const tools = `<span class="cv-tool">${icon('palette')}</span><span class="cv-tool">${icon('crown')}</span><span class="cv-tool">${icon('file')}</span><span class="cv-tool">${icon('pin')}</span>`;
  const header = (page, interactive) => `<div class="cv-topbar">
    <span class="cv-brand">${logo}<span><strong>CosmoVisuals</strong><small>0.7 BETA</small></span></span>
    <div class="cv-categories" ${interactive ? 'role="group" aria-label="Категории модулей"' : ''}>${Object.entries(categories).map(([key, item]) => interactive
      ? `<button type="button" data-cv-category="${key}" aria-pressed="${key === page}" class="${key === page ? 'is-current' : ''}">${item.label}<small>${item.count}</small></button>`
      : `<span class="${key === page ? 'is-current' : ''}">${item.label}<small>${item.count}</small></span>`).join('')}</div>
    <span class="cv-tools" aria-hidden="true">${tools}</span>
  </div>`;
  const footer = '<div class="cv-footer"><span class="cv-language"><b>RU</b><span>EN</span></span><span class="cv-quality">✦ &nbsp; Лёгкое <span>⌄</span></span></div>';

  const moduleCard = (item, interactive, selected) => {
    const [name, description, enabled] = item;
    const copy = `<strong>${name}</strong><small>${description}</small>`;
    return `<div class="cv-module ${enabled ? 'is-enabled' : ''} ${selected === name ? 'is-selected' : ''}">
      ${interactive ? `<button class="cv-module-copy" type="button" data-cv-select="${name}" aria-label="Настройки ${name}">${copy}</button>` : `<span class="cv-module-copy">${copy}</span>`}
      ${interactive ? `<button type="button" class="cv-switch" role="switch" aria-checked="${enabled}" aria-label="${name}" data-cv-toggle="${name}"><span></span></button>` : `<span class="cv-switch" aria-hidden="true" data-checked="${enabled}"><span></span></span>`}
    </div>`;
  };

  document.querySelectorAll('[data-gui-demo]').forEach((root) => {
    const interactive = root.dataset.guiInteractive === 'true';
    const cosmetic = root.dataset.guiDemo === 'cosmetics';
    let page = cosmetic ? 'visuals' : root.dataset.guiDemo;
    if (!categories[page]) page = 'visuals';
    let selected = page === 'visuals' ? 'AspectRatio' : categories[page].items[0][0];
    const state = Object.fromEntries(Object.entries(categories).map(([key, category]) => [key, category.items.map((item) => [...item])]));
    root.classList.add('gui-demo');

    if (cosmetic) {
      root.innerHTML = `<div class="cv-gui cv-cosmetics">${header('', false)}
        <div class="cv-cosmetic-heading"><span><small>Раздел</small><strong>Косметика</strong><small>Выбери свой образ</small></span><span class="cv-cosmetic-tabs"><b>Шапки</b><span>Крылья</span><span>Мишки</span></span></div>
        <div class="cv-cosmetic-grid">${[['halo', 'Нимб'], ['fox', 'Лиса'], ['penguin', 'Пингвин'], ['pig', 'Свинка']].map(([key, name]) => `<div class="cv-cosmetic-item ${key === 'penguin' ? 'is-equipped' : ''}"><div class="cv-avatar" data-model-viewer="${key}" aria-label="Персонаж: ${name}"></div><span>${name}${key === 'penguin' ? '<b>✓ Надето</b>' : ''}</span></div>`).join('')}</div>${footer}</div>`;
      return;
    }

    root.innerHTML = `<div class="cv-gui">${header(page, interactive)}
      <div class="cv-section-title"><span><small>Категория</small><strong data-cv-title>${categories[page].label}</strong><small class="cv-count">CosmoVisuals 0.7</small></span>
        ${interactive ? `<label class="cv-search">${icon('search')}<input type="search" placeholder="Поиск" aria-label="Поиск модулей в примере CosmoVisuals"></label>` : `<span class="cv-search">${icon('search')}Поиск</span>`}
      </div><div class="cv-body"><div class="cv-module-grid" data-cv-list></div><aside class="cv-settings" aria-label="Настройки модуля"><div class="cv-settings-top"><strong data-cv-setting-name></strong></div><p data-cv-setting-description></p><div class="cv-setting-row"><span>Бинд</span><span class="cv-value">Не задан</span></div><div class="cv-setting-row" data-cv-aspect><span>Пресет</span>${interactive ? '<select aria-label="Пресет AspectRatio"><option>16:9</option><option>16:10</option><option>4:3</option></select>' : '<span class="cv-value">16:9 ⌄</span>'}</div></aside></div>${footer}</div>`;

    const list = root.querySelector('[data-cv-list]');
    const search = root.querySelector('input[type="search"]');
    const render = () => {
      const query = search?.value.trim().toLocaleLowerCase() || '';
      const items = state[page].filter(([name, description]) => `${name} ${description}`.toLocaleLowerCase().includes(query));
      list.innerHTML = items.length ? items.map((item) => moduleCard(item, interactive, selected)).join('') : '<p class="cv-no-results">Ничего не найдено</p>';
      const item = state[page].find(([name]) => name === selected) || state[page][0];
      root.querySelector('[data-cv-title]').textContent = categories[page].label;
      root.querySelector('[data-cv-setting-name]').textContent = item[0];
      root.querySelector('[data-cv-setting-description]').textContent = item[1];
      root.querySelector('[data-cv-aspect]').hidden = item[0] !== 'AspectRatio';
      root.querySelectorAll('[data-cv-category]').forEach((button) => {
        const active = button.dataset.cvCategory === page;
        button.classList.toggle('is-current', active);
        button.setAttribute('aria-pressed', String(active));
      });
    };
    render();
    if (!interactive) return;
    search.addEventListener('input', render);
    root.addEventListener('click', (event) => {
      const category = event.target.closest('[data-cv-category]');
      if (category) {
        page = category.dataset.cvCategory;
        selected = state[page][0][0];
        search.value = '';
        list.scrollTop = 0;
        render();
        return;
      }
      const selection = event.target.closest('[data-cv-select]');
      if (selection) {
        selected = selection.dataset.cvSelect;
        // Keep the focused button in place when changing its settings pane.
        root.querySelector('[data-cv-setting-name]').textContent = selected;
        root.querySelector('[data-cv-setting-description]').textContent = state[page].find(([name]) => name === selected)[1];
        root.querySelector('[data-cv-aspect]').hidden = selected !== 'AspectRatio';
        list.querySelectorAll('.cv-module').forEach((card) => card.classList.toggle('is-selected', card.contains(selection)));
      }
      const toggle = event.target.closest('[data-cv-toggle]');
      if (toggle) {
        const item = state[page].find(([name]) => name === toggle.dataset.cvToggle);
        item[2] = !item[2];
        toggle.setAttribute('aria-checked', String(item[2]));
        toggle.closest('.cv-module').classList.toggle('is-enabled', item[2]);
      }
    });
  });
})();
