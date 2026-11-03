(() => {
  'use strict';

  const form = document.querySelector('#ad-form');
  const domain = document.querySelector('#ad-domain');
  const amount = document.querySelector('#ad-amount');
  const status = document.querySelector('#ad-status');
  const list = document.querySelector('#ad-list');
  const empty = document.querySelector('#ad-empty');
  const submit = form.querySelector('button[type="submit"]');
  const previewDomain = document.querySelector('#ad-preview-domain');
  const previewPrice = document.querySelector('#ad-preview-price');
  const currency = new Intl.NumberFormat('ru-RU', {
    style: 'currency', currency: 'RUB', maximumFractionDigits: 0,
  });
  const storagePrefix = 'cosmovisuals:demo-ad:';

  function parseDomain(value) {
    const address = value.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
    if (!address || /[\s/:?#@%\\]/u.test(address)) return null;
    try {
      const hostname = new URL(`https://${address}`).hostname.replace(/\.$/, '');
      const labels = hostname.split('.');
      if (hostname.length > 253 || labels.length < 2 || !/[a-z]/.test(labels.at(-1))) return null;
      return labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
        ? hostname : null;
    } catch {
      return null;
    }
  }

  function renderPlacements(newDomain) {
    const placements = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key?.startsWith(storagePrefix)) continue;
      const hostname = key.slice(storagePrefix.length);
      const value = Number(localStorage.getItem(key));
      if (parseDomain(hostname) === hostname && Number.isSafeInteger(value) && value > 0) {
        placements.push({ hostname, value });
      }
    }
    placements.sort((first, second) => first.hostname.localeCompare(second.hostname));

    list.replaceChildren(...placements.map(({ hostname, value }) => {
      const item = document.createElement('li');
      const row = document.createElement('div');
      const link = document.createElement('a');
      const price = document.createElement('span');
      const remove = document.createElement('button');
      link.href = `https://${hostname}/`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer sponsored';
      link.textContent = hostname;
      price.textContent = currency.format(value);
      remove.type = 'button';
      remove.className = 'ad-remove';
      remove.textContent = 'Удалить';
      remove.setAttribute('aria-label', `Удалить размещение ${hostname}`);
      remove.addEventListener('click', () => {
        try {
          localStorage.removeItem(storagePrefix + hostname);
          renderPlacements();
          domain.focus();
          status.textContent = `Размещение ${hostname} удалено.`;
        } catch {
          status.textContent = 'Не удалось удалить размещение.';
        }
      });
      row.className = 'ad-row';
      row.append(link, price);
      item.append(row, remove);
      if (hostname === newDomain) item.classList.add('ad-placement-entering');
      return item;
    }));
    empty.hidden = placements.length > 0;
    list.hidden = !placements.length;
  }

  function updatePreview() {
    const hostname = parseDomain(domain.value);
    const price = amount.validity.valid ? currency.format(amount.valueAsNumber) : '';
    previewDomain.textContent = hostname || domain.value.trim() || domain.placeholder;
    previewPrice.textContent = price || '— ₽';
    submit.textContent = price
      ? `Купить за ${price}`
      : 'Купить рекламу';
  }

  domain.addEventListener('input', () => {
    domain.setCustomValidity('');
    status.textContent = '';
    updatePreview();
  });
  amount.addEventListener('input', () => {
    amount.setCustomValidity('');
    status.textContent = '';
    updatePreview();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const hostname = parseDomain(domain.value);
    const value = amount.valueAsNumber;
    if (!hostname) {
      domain.setCustomValidity('Введи домен, например example.ru.');
      domain.reportValidity();
      return;
    }
    if (!Number.isSafeInteger(value) || value < 1) {
      amount.setCustomValidity('Укажи целую сумму в рублях.');
      amount.reportValidity();
      return;
    }

    try {
      const key = storagePrefix + hostname;
      if (localStorage.getItem(key) !== null) {
        status.textContent = `Реклама для ${hostname} уже размещена.`;
        return;
      }
      localStorage.setItem(key, String(value));
      renderPlacements(hostname);
      form.reset();
      updatePreview();
      status.textContent = `Реклама для ${hostname} размещена. Списано 0 ₽.`;
    } catch {
      status.textContent = 'Не удалось сохранить размещение в браузере.';
    }
  });

  function restorePlacements() {
    try {
      renderPlacements();
    } catch {
      status.textContent = 'Хранилище браузера недоступно.';
    }
  }

  restorePlacements();
  updatePreview();
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key.startsWith(storagePrefix)) restorePlacements();
  });
})();
