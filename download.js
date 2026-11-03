(() => {
  'use strict';

  const initialise = () => {
    const trigger = document.querySelector('#download-file');
    if (!trigger) return;

    const dialog = document.querySelector('#download-dialog');
    const progress = document.querySelector('#download-progress');
    const meter = document.querySelector('#download-meter');
    const status = document.querySelector('#download-status');
    const cancelButton = document.querySelector('#cancel-download');
    const toast = document.querySelector('#toast');
    let controller = null;
    let toastTimer;
    let lastPercent = -1;

    const installOs = document.querySelector('#install-os');
    const modsPath = document.querySelector('#mods-path');
    const copyStatus = document.querySelector('#copy-mods-status');
    const paths = {
      windows: '%APPDATA%\\.minecraft\\mods',
      macos: '~/Library/Application Support/minecraft/mods',
      linux: '~/.minecraft/mods',
    };
    const updateModsPath = () => {
      modsPath.value = paths[installOs.value];
      copyStatus.textContent = '';
    };
    installOs.addEventListener('change', updateModsPath);
    updateModsPath();
    document.querySelector('#copy-mods-path').addEventListener('click', async () => {
      const path = modsPath.value;
      try {
        await navigator.clipboard.writeText(path);
        if (path === modsPath.value) copyStatus.textContent = 'Путь скопирован.';
      } catch {
        modsPath.focus();
        modsPath.select();
        copyStatus.textContent = 'Путь выделен. Скопируй его вручную.';
      }
    });

    const setStatus = (message) => {
      if (status) status.textContent = message;
    };
    const setBusy = (busy) => {
      trigger.setAttribute('aria-disabled', String(busy));
      trigger.setAttribute('aria-busy', String(busy));
      if ('disabled' in trigger) trigger.disabled = busy;
      if (cancelButton) {
        cancelButton.hidden = !busy;
        cancelButton.disabled = !busy;
      }
    };
    const showToast = (message) => {
      if (!toast) return;
      window.clearTimeout(toastTimer);
      toast.textContent = message;
      toast.hidden = false;
      toast.classList.add('is-visible');
      toastTimer = window.setTimeout(() => {
        toast.classList.remove('is-visible');
        toast.hidden = true;
      }, 5500);
    };
    const updateProgress = (loaded, total) => {
      const percent = Math.min(100, Math.floor(loaded / total * 100));
      if (percent === lastPercent) return;
      lastPercent = percent;
      if (meter) {
        meter.max = 100;
        meter.value = percent;
        meter.setAttribute('aria-valuetext', `${percent}%`);
      }
      const formatMegabytes = (bytes) => (bytes / 1024 / 1024).toFixed(1).replace('.', ',');
      setStatus(`Скачивание: ${percent}% · ${formatMegabytes(loaded)} из ${formatMegabytes(total)} МБ`);
    };
    const validateManifest = (manifest) => {
      const validFile = (value) => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)
        && !value.includes('..');
      const validSize = (value) => Number.isSafeInteger(value) && value > 0;
      if (!manifest || !validFile(manifest.filename) || !validSize(manifest.size)
        || manifest.size > 512 * 1024 * 1024 || !Array.isArray(manifest.chunks)
        || manifest.chunks.length === 0 || manifest.chunks.length > 128) {
        throw new Error('Invalid download manifest');
      }
      let total = 0;
      const files = new Set();
      manifest.chunks.forEach((chunk) => {
        if (!chunk || !validFile(chunk.file) || !validSize(chunk.size) || files.has(chunk.file)) {
          throw new Error('Invalid download part');
        }
        files.add(chunk.file);
        total += chunk.size;
      });
      if (total !== manifest.size) throw new Error('Download size mismatch');
      return manifest;
    };

    const cancel = () => controller?.abort();
    cancelButton?.addEventListener('click', cancel);
    dialog?.addEventListener('cancel', cancel);
    dialog?.addEventListener('close', cancel);
    dialog?.querySelectorAll('[data-close-dialog]').forEach((button) => {
      button.addEventListener('click', cancel);
    });

    trigger.addEventListener('click', async (event) => {
      event.preventDefault();
      if (controller) return;

      const taskController = new AbortController();
      controller = taskController;
      const { signal } = taskController;
      lastPercent = -1;
      setBusy(true);
      if (progress) progress.hidden = false;
      if (meter) {
        meter.max = 100;
        meter.value = 0;
      }
      setStatus('Подготовка скачивания…');

      const buffers = [];
      try {
        const manifestUrl = new URL(trigger.dataset.manifest || 'downloads/manifest.json', document.baseURI);
        const manifestResponse = await fetch(manifestUrl, { signal, cache: 'no-store', credentials: 'same-origin' });
        if (!manifestResponse.ok) throw new Error('Download unavailable');
        const manifest = validateManifest(await manifestResponse.json());
        let loaded = 0;
        updateProgress(loaded, manifest.size);

        for (const part of manifest.chunks) {
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
          const partUrl = new URL(part.file, manifestUrl);
          const response = await fetch(partUrl, { signal, cache: 'no-cache', credentials: 'same-origin' });
          if (!response.ok) throw new Error('Download interrupted');

          if (response.body?.getReader) {
            const reader = response.body.getReader();
            const bytes = new Uint8Array(part.size);
            let offset = 0;
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (offset + value.byteLength > part.size) throw new Error('Unexpected download size');
                bytes.set(value, offset);
                offset += value.byteLength;
                updateProgress(loaded + offset, manifest.size);
              }
            } finally {
              reader.releaseLock();
            }
            if (offset !== part.size) throw new Error('Incomplete download');
            buffers.push(bytes.buffer);
          } else {
            const buffer = await response.arrayBuffer();
            if (buffer.byteLength !== part.size) throw new Error('Incomplete download');
            buffers.push(buffer);
          }
          loaded += part.size;
          updateProgress(loaded, manifest.size);
        }

        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const file = new Blob(buffers, { type: 'application/java-archive' });
        if (file.size !== manifest.size) throw new Error('Incomplete download');
        const fileUrl = URL.createObjectURL(file);
        const saveLink = document.createElement('a');
        saveLink.href = fileUrl;
        saveLink.download = manifest.filename;
        saveLink.hidden = true;
        document.body.append(saveLink);
        saveLink.click();
        saveLink.remove();
        window.setTimeout(() => URL.revokeObjectURL(fileUrl), 60000);

        setStatus('Файл готов к сохранению.');
        controller = null;
        setBusy(false);
        if (dialog?.open) dialog.close();
        showToast('Файл CosmoVisuals готов к сохранению.');
      } catch (error) {
        if (signal.aborted || error.name === 'AbortError') {
          setStatus('Скачивание отменено. Можно начать снова.');
        } else {
          setStatus('Не удалось скачать мод. Проверь соединение и попробуй снова.');
        }
      } finally {
        buffers.length = 0;
        if (controller === taskController) controller = null;
        setBusy(false);
      }
    });

    setBusy(false);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise, { once: true });
  else initialise();
})();
