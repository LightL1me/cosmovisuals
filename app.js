(() => {
  'use strict';

  const initialise = () => {
    const select = (query, root = document) => root.querySelector(query);
    const selectAll = (query, root = document) => [...root.querySelectorAll(query)];

    const menuButton = select('[data-menu-toggle]');
    const mobileNav = select('#mobile-nav');
    const closeMenu = () => {
      mobileNav?.classList.remove('is-open');
      menuButton?.setAttribute('aria-expanded', 'false');
    };

    menuButton?.addEventListener('click', () => {
      if (!mobileNav) return;
      const open = mobileNav.classList.toggle('is-open');
      menuButton.setAttribute('aria-expanded', String(open));
    });
    mobileNav?.addEventListener('click', (event) => {
      if (event.target.closest('a')) closeMenu();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenu();
    });

    const downloadDialog = select('#download-dialog');
    selectAll('[data-open-download]').forEach((button) => {
      button.addEventListener('click', () => {
        closeMenu();
        if (!downloadDialog || downloadDialog.open) return;
        if (typeof downloadDialog.showModal === 'function') {
          downloadDialog.showModal();
        } else {
          downloadDialog.setAttribute('open', '');
        }
      });
    });

    const closeDialog = (dialog) => {
      if (!dialog) return;
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    };
    selectAll('[data-close-dialog]').forEach((button) => {
      button.addEventListener('click', () => closeDialog(button.closest('dialog')));
    });
    selectAll('dialog').forEach((dialog) => {
      dialog.addEventListener('click', (event) => {
        if (event.target !== dialog) return;
        const bounds = dialog.getBoundingClientRect();
        const outside = event.clientX < bounds.left || event.clientX > bounds.right
          || event.clientY < bounds.top || event.clientY > bounds.bottom;
        if (outside) closeDialog(dialog);
      });
    });

    const characters = { halo: 'Нимб', fox: 'Лиса', penguin: 'Пингвин', pig: 'Свинка' };
    const characterImage = select('#cosmetic-character');
    const cosmeticViewer = select('#cosmetic-viewer');
    const characterName = select('#cosmetic-name');
    const characterButtons = selectAll('button[data-character]');
    const setCharacter = (id) => {
      if (!Object.prototype.hasOwnProperty.call(characters, id)) return;
      if (characterImage) {
        characterImage.src = `assets/character-${id}.png`;
        characterImage.alt = `Персонаж с косметикой «${characters[id]}»`;
      }
      if (cosmeticViewer) cosmeticViewer.dataset.character = id;
      if (characterName) characterName.textContent = characters[id];
      characterButtons.forEach((button) => {
        const selected = button.dataset.character === id;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
    };
    characterButtons.forEach((button) => {
      button.addEventListener('click', () => setCharacter(button.dataset.character));
    });
    if (characterButtons.length) {
      const initialCharacter = characterButtons.find((button) => button.getAttribute('aria-pressed') === 'true')
        || characterButtons.find((button) => button.classList.contains('active')) || characterButtons[0];
      setCharacter(initialCharacter.dataset.character);
    }

    const visualPreview = select('#visual-preview');
    selectAll('[data-visual]').forEach((button) => {
      button.addEventListener('click', () => {
        const enabled = button.getAttribute('aria-checked') !== 'true';
        button.setAttribute('aria-checked', String(enabled));
        if (visualPreview) visualPreview.dataset[button.dataset.visual] = String(enabled);
      });
    });

    const header = select('.site-header');
    const updateHeader = () => header?.classList.toggle('is-scrolled', window.scrollY > 30);
    window.addEventListener('scroll', updateHeader, { passive: true });
    updateHeader();

    const comparison = select('#comparison');
    const comparisonRange = select('#compare-range');
    const comparisonValue = select('#comparison-value');
    const updateComparison = () => {
      if (!comparison || !comparisonRange) return;
      const value = Math.min(100, Math.max(0, Number(comparisonRange.value) || 0));
      comparison.style.setProperty('--split', `${value}%`);
      comparisonRange.setAttribute('aria-valuetext', `Граница сравнения: ${value}%`);
      if (comparisonValue) comparisonValue.textContent = `${value}%`;
    };
    comparisonRange?.addEventListener('input', updateComparison);
    updateComparison();

    const playground = select('#hud-playground');
    const hudItems = playground ? selectAll('.draggable[data-hud]', playground) : [];
    const hudToggles = selectAll('[data-hud-toggle]');
    const hudStatus = select('#hud-status');
    const hudStorageKey = 'cosmovisuals:hud-layout:v1';
    const hudPositions = new Map();
    const originalStyles = new Map(hudItems.map((item) => [item, item.getAttribute('style')]));
    const originalChecks = new Map(hudToggles.map((toggle) => [toggle, toggle.checked]));
    let drag = null;

    const getHudPosition = (item) => {
      const parentBounds = playground.getBoundingClientRect();
      const itemBounds = item.getBoundingClientRect();
      return {
        x: itemBounds.left - parentBounds.left - playground.clientLeft + playground.scrollLeft,
        y: itemBounds.top - parentBounds.top - playground.clientTop + playground.scrollTop,
      };
    };
    const hudBounds = (item) => [
      Math.max(0, playground.clientWidth - item.offsetWidth),
      Math.max(0, playground.clientHeight - item.offsetHeight),
    ];
    const applyHudPosition = (item) => {
      const position = hudPositions.get(item);
      if (item.hidden || !position || !playground.clientWidth) return;
      const [maxX, maxY] = hudBounds(item);
      item.style.left = `${position[0] * maxX}px`;
      item.style.top = `${position[1] * maxY}px`;
      item.style.right = 'auto';
      item.style.bottom = 'auto';
      item.style.transform = 'none';
    };
    const positionHud = (item, x, y) => {
      const [maxX, maxY] = hudBounds(item);
      hudPositions.set(item, [x / (maxX || 1), y / (maxY || 1)]
        .map((value) => Math.min(1, Math.max(0, value))));
      applyHudPosition(item);
      hudStatus.textContent = '';
    };
    const stopDrag = () => {
      if (!drag) return;
      const { item, pointerId } = drag;
      drag = null;
      item.classList.remove('is-dragging');
      if (item.hasPointerCapture?.(pointerId)) item.releasePointerCapture(pointerId);
    };

    hudItems.forEach((item) => {
      const label = item.getAttribute('aria-label') || item.dataset.hud;
      item.setAttribute('aria-label', `${label}. Перемещение: стрелки; Shift — большой шаг.`);
      item.style.touchAction = 'none';
      item.addEventListener('pointerdown', (event) => {
        if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
        stopDrag();
        event.preventDefault();
        item.focus({ preventScroll: true });
        const position = getHudPosition(item);
        positionHud(item, position.x, position.y);
        drag = { item, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, ...position };
        item.classList.add('is-dragging');
        item.setPointerCapture(event.pointerId);
      });
      item.addEventListener('pointermove', (event) => {
        if (!drag || drag.item !== item || drag.pointerId !== event.pointerId) return;
        positionHud(item, drag.x + event.clientX - drag.startX, drag.y + event.clientY - drag.startY);
      });
      item.addEventListener('pointerup', stopDrag);
      item.addEventListener('pointercancel', stopDrag);
      item.addEventListener('lostpointercapture', stopDrag);
      item.addEventListener('keydown', (event) => {
        const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        const direction = directions[event.key];
        if (!direction) return;
        event.preventDefault();
        const position = getHudPosition(item);
        const step = event.shiftKey ? 30 : 10;
        positionHud(item, position.x + direction[0] * step, position.y + direction[1] * step);
      });
    });

    const applyHudVisibility = () => {
      hudToggles.forEach((toggle) => {
        hudItems.filter((item) => item.dataset.hud === toggle.dataset.hudToggle).forEach((item) => {
          if (!toggle.checked && drag?.item === item) stopDrag();
          item.hidden = !toggle.checked;
          applyHudPosition(item);
        });
      });
    };
    if (playground && hudStatus) {
      try {
        const saved = JSON.parse(localStorage.getItem(hudStorageKey));
        if (saved) {
          hudItems.forEach((item) => {
            const position = saved.positions?.[item.dataset.hud];
            if (Array.isArray(position) && position.length === 2
                && position.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
              hudPositions.set(item, position);
            }
          });
          hudToggles.forEach((toggle) => {
            const checked = saved.visibility?.[toggle.dataset.hudToggle];
            if (typeof checked === 'boolean') toggle.checked = checked;
          });
        }
      } catch {
        // Keep the default layout when storage is unavailable or contains invalid JSON.
      }
      applyHudVisibility();
      hudItems.forEach(applyHudPosition);

      hudToggles.forEach((toggle) => toggle.addEventListener('change', () => {
        applyHudVisibility();
        hudStatus.textContent = '';
      }));
      if ('ResizeObserver' in window) {
        new ResizeObserver(() => hudItems.forEach(applyHudPosition)).observe(playground);
      }
      select('#save-hud')?.addEventListener('click', () => {
        try {
          const positions = Object.fromEntries([...hudPositions].map(([item, position]) => [item.dataset.hud, position]));
          const visibility = Object.fromEntries(hudToggles.map((toggle) => [toggle.dataset.hudToggle, toggle.checked]));
          localStorage.setItem(hudStorageKey, JSON.stringify({ positions, visibility }));
          hudStatus.textContent = 'Раскладка сохранена в этом браузере.';
        } catch {
          hudStatus.textContent = 'Не удалось сохранить раскладку.';
        }
      });
      select('#reset-hud').addEventListener('click', () => {
        stopDrag();
        hudPositions.clear();
        hudItems.forEach((item) => {
          const style = originalStyles.get(item);
          if (style === null) item.removeAttribute('style');
          else item.setAttribute('style', style);
          item.style.touchAction = 'none';
        });
        hudToggles.forEach((toggle) => { toggle.checked = originalChecks.get(toggle); });
        applyHudVisibility();
        try {
          localStorage.removeItem(hudStorageKey);
          hudStatus.textContent = 'Восстановлена исходная раскладка.';
        } catch {
          hudStatus.textContent = 'Раскладка сброшена. Хранилище браузера недоступно.';
        }
      });
    }

  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise, { once: true });
  else initialise();
})();
