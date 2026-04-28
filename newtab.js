/* ==========================================================================
   GridTab — New Tab logic
   Manages favorites (load, add, edit, delete) using chrome.storage.local
   and renders the grid of tiles.
   ========================================================================== */

(() => {
  'use strict';

  const STORAGE_KEY = 'favorites';
  const SETTINGS_KEY = 'settings';

  // Default settings. Each maps to one or more CSS variables on :root.
  const DEFAULT_SETTINGS = {
    tileSize: 'md',   // sm | md | lg
    gap:      'normal', // tight | normal | relaxed
    iconSize: 'md',   // sm | md | lg
    theme:    'auto', // auto | light | dark
  };

  // Maps each setting value to the CSS variable values it should produce.
  // Keeping this here (not in CSS) lets us validate stored values and fall
  // back cleanly if the user edits storage directly or upgrades schemas.
  const SETTING_VALUES = {
    tileSize: {
      sm: { '--tile-min': '110px' },
      md: { '--tile-min': '140px' },
      lg: { '--tile-min': '180px' },
    },
    gap: {
      tight:   { '--grid-gap': '8px' },
      normal:  { '--grid-gap': '16px' },
      relaxed: { '--grid-gap': '28px' },
    },
    iconSize: {
      sm: { '--icon-fill': '65%' },
      md: { '--icon-fill': '80%' },
      lg: { '--icon-fill': '95%' },
    },
  };

  // DOM references
  const grid           = document.getElementById('grid');
  const emptyState     = document.getElementById('emptyState');
  const addBtn         = document.getElementById('addBtn');
  const emptyAddBtn    = document.getElementById('emptyAddBtn');
  const modal          = document.getElementById('modal');
  const modalTitle     = document.getElementById('modalTitle');
  const form           = document.getElementById('favoriteForm');
  const titleInput     = document.getElementById('titleInput');
  const urlInput       = document.getElementById('urlInput');
  const urlError       = document.getElementById('urlError');
  const saveLabel      = document.getElementById('saveLabel');
  const deleteBtn      = document.getElementById('deleteBtn');
  const settingsBtn    = document.getElementById('settingsBtn');
  const settingsModal  = document.getElementById('settingsModal');
  const resetBtn       = document.getElementById('resetSettingsBtn');
  // Custom icon uploader (in the favorite edit modal).
  const iconPreview    = document.getElementById('iconPreview');
  const iconFileInput  = document.getElementById('iconFileInput');
  const iconUploadBtn  = document.getElementById('iconUploadBtn');
  const iconPasteBtn   = document.getElementById('iconPasteBtn');
  const iconClearBtn   = document.getElementById('iconClearBtn');
  const iconUrlInput   = document.getElementById('iconUrlInput');
  const iconError      = document.getElementById('iconError');

  // In-memory state.
  let favorites = [];
  let settings  = { ...DEFAULT_SETTINGS };
  let editingId = null;
  // Holds the custom icon (data URL or http(s) URL) for the favorite
  // currently being added/edited. Null means "no custom icon".
  let pendingCustomIcon = null;

  // -----------------------------------------------------------------------
  // Storage helpers (chrome.storage.local)
  // -----------------------------------------------------------------------

  function loadFavorites() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        const stored = result[STORAGE_KEY];
        resolve(Array.isArray(stored) ? stored : []);
      });
    });
  }

  function saveFavorites(list) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: list }, () => resolve());
    });
  }

  function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get([SETTINGS_KEY], (result) => {
        const stored = result[SETTINGS_KEY] || {};
        // Merge with defaults so missing keys (e.g. after a future schema
        // change) get sensible fallbacks instead of undefined.
        resolve({ ...DEFAULT_SETTINGS, ...stored });
      });
    });
  }

  function saveSettings(next) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [SETTINGS_KEY]: next }, () => resolve());
    });
  }

  /**
   * Apply settings to the live document by writing CSS variables on :root
   * and (for theme) toggling a data-theme attribute. Also updates the
   * settings modal UI so the active button reflects current state.
   */
  function applySettings(s) {
    const root = document.documentElement;

    // Tile size, gap, icon size — write CSS variables.
    for (const key of ['tileSize', 'gap', 'iconSize']) {
      const valueMap = SETTING_VALUES[key][s[key]] || SETTING_VALUES[key][DEFAULT_SETTINGS[key]];
      for (const [varName, varValue] of Object.entries(valueMap)) {
        root.style.setProperty(varName, varValue);
      }
    }

    // Theme — 'auto' removes the override so prefers-color-scheme takes over.
    if (s.theme === 'auto') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', s.theme);
    }

    // Reflect active state on segmented control buttons.
    const buttons = settingsModal.querySelectorAll('.seg-btn');
    buttons.forEach((btn) => {
      const key = btn.dataset.setting;
      const active = btn.dataset.value === s[key];
      btn.setAttribute('aria-checked', active ? 'true' : 'false');
    });
  }

  // -----------------------------------------------------------------------
  // URL helpers
  // -----------------------------------------------------------------------

  /**
   * Normalize a user-entered URL: prepend https:// if no protocol is given,
   * then validate. Returns the normalized URL string, or null if invalid.
   */
  function normalizeUrl(raw) {
    const trimmed = (raw || '').trim();
    if (!trimmed) return null;

    let candidate = trimmed;
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(candidate)) {
      candidate = 'https://' + candidate;
    }

    try {
      const url = new URL(candidate);
      // Only allow http(s); reject things like javascript:, file:, etc.
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      if (!url.hostname || !url.hostname.includes('.')) return null;
      return url.toString();
    } catch {
      return null;
    }
  }

  function getDomain(urlStr) {
    try {
      return new URL(urlStr).hostname.replace(/^www\./, '');
    } catch {
      return urlStr;
    }
  }

  /**
   * Hand-curated map of high-resolution icon URLs for sites where
   * Google's favicon service returns small/blurry results. We use
   * only stable, conventional paths (apple-touch-icon.png at the
   * root) — never hash-versioned build assets that can break.
   *
   * If any of these URLs ever 404, the chain falls through to Google
   * automatically — broken overrides degrade to "same as before" not
   * to "broken".
   *
   * Add new entries here as you find sites that look blurry.
   */
  /**
   * Each value can be a single URL string or an array of URLs to try
   * in order — useful when a site's high-res icon path is uncertain.
   * The chain is: overrides (in array order) → Google → letter avatar.
   */
  const ICON_OVERRIDES = {
    // X / Twitter — try the conventional apple-touch-icon first; if X
    // doesn't host one there, fall through to their .ico bundle which
    // is small but at least the right brand mark.
    'x.com':             ['https://x.com/apple-touch-icon.png',
                          'https://abs.twimg.com/favicons/twitter.3.ico'],
    'twitter.com':       ['https://twitter.com/apple-touch-icon.png',
                          'https://abs.twimg.com/favicons/twitter.3.ico'],
    'github.com':        'https://github.com/apple-touch-icon.png',
    'reddit.com':        'https://www.reddit.com/apple-touch-icon-precomposed.png',
    'stackoverflow.com': 'https://stackoverflow.com/apple-touch-icon.png',
    'wikipedia.org':     'https://en.wikipedia.org/static/apple-touch/wikipedia.png',
    'medium.com':        'https://medium.com/favicon.ico',
    'yahoo.com':         'https://www.yahoo.com/apple-touch-icon.png',
  };

  /**
   * Returns an ordered list of favicon URLs to try for a given favorite.
   * The <img> in buildTile walks the list on each onerror until one
   * loads, then falls back to a letter avatar if all fail.
   *
   * Priority: user's custom icon → override map → Google → letter.
   */
  function faviconSources(fav) {
    const domain = getDomain(fav.url);
    const encoded = encodeURIComponent(domain);
    const sources = [];
    // 1. User's custom icon always wins when provided.
    if (fav.customIcon) sources.push(fav.customIcon);
    // 2. Hand-curated overrides for sites Google serves blurry.
    const override = ICON_OVERRIDES[domain];
    if (override) {
      if (Array.isArray(override)) sources.push(...override);
      else sources.push(override);
    }
    // 3. Google as the universal reliable fallback.
    sources.push(`https://www.google.com/s2/favicons?sz=128&domain=${encoded}`);
    return sources;
  }

  // -----------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------

  function render() {
    grid.innerHTML = '';

    if (favorites.length === 0) {
      grid.hidden = true;
      emptyState.hidden = false;
      return;
    }

    grid.hidden = false;
    emptyState.hidden = true;

    for (const fav of favorites) {
      grid.appendChild(buildTile(fav));
    }
  }

  function buildTile(fav) {
    // The tile itself is an <a> so click + middle-click + keyboard "Enter"
    // all work naturally. Per spec, clicking opens in the current tab.
    const tile = document.createElement('a');
    tile.className = 'tile';
    tile.href = fav.url;
    tile.dataset.id = fav.id;
    tile.draggable = true;
    tile.setAttribute('aria-label', `${fav.title} — ${getDomain(fav.url)}`);

    // --- Drag-and-drop wiring ---
    // The tile being dragged stores its id; dragover/drop on other tiles
    // reorders the favorites array and re-renders.
    tile.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', fav.id);
      // Slight delay so the browser captures the drag image *before* we
      // dim the source tile. Without this the drag preview also dims.
      setTimeout(() => {
        tile.classList.add('is-dragging');
        document.body.classList.add('is-dragging');
      }, 0);
    });

    tile.addEventListener('dragend', () => {
      tile.classList.remove('is-dragging');
      document.body.classList.remove('is-dragging');
      // Clear any lingering drop-target highlights on tiles.
      document.querySelectorAll('.tile.is-drop-target')
        .forEach((el) => el.classList.remove('is-drop-target'));
    });

    tile.addEventListener('dragover', (e) => {
      e.preventDefault(); // required to allow drop
      e.dataTransfer.dropEffect = 'move';
      if (!tile.classList.contains('is-dragging')) {
        tile.classList.add('is-drop-target');
      }
    });

    tile.addEventListener('dragleave', () => {
      tile.classList.remove('is-drop-target');
    });

    tile.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      tile.classList.remove('is-drop-target');

      const draggedId = e.dataTransfer.getData('text/plain');
      const targetId  = fav.id;
      if (!draggedId || draggedId === targetId) return;

      reorderFavorites(draggedId, targetId);
      await saveFavorites(favorites);
      render();
    });

    // Edit button floats over the tile, top-right.
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'tile-edit';
    editBtn.setAttribute('aria-label', `Edit ${fav.title}`);
    editBtn.textContent = '✎';
    // The edit button shouldn't kick off a drag of the parent tile.
    editBtn.draggable = false;
    editBtn.addEventListener('click', (e) => {
      // Prevent navigation when the edit button is clicked.
      e.preventDefault();
      e.stopPropagation();
      openEditModal(fav.id);
    });

    // Hero region: large centered favicon, fills the tile (no footer).
    const hero = document.createElement('div');
    hero.className = 'tile-hero';

    const faviconWrap = document.createElement('div');
    faviconWrap.className = 'tile-favicon';

    const img = document.createElement('img');
    img.alt = '';
    img.referrerPolicy = 'no-referrer';

    // Walk the source list on each error; only show the letter avatar
    // after every source has failed.
    const sources = faviconSources(fav);
    let sourceIndex = 0;
    img.src = sources[0];
    img.onerror = () => {
      sourceIndex += 1;
      if (sourceIndex < sources.length) {
        img.src = sources[sourceIndex];
        return;
      }
      // All sources failed — replace with a letter avatar.
      faviconWrap.innerHTML = '';
      const letter = document.createElement('span');
      letter.className = 'tile-favicon-letter';
      letter.textContent = (fav.title || '?').charAt(0);
      faviconWrap.appendChild(letter);
    };
    faviconWrap.appendChild(img);
    hero.appendChild(faviconWrap);

    // Hover tooltip — shows title and domain. aria-hidden because the
    // tile already has an aria-label covering the same info for AT users.
    const tooltip = document.createElement('div');
    tooltip.className = 'tile-tooltip';
    tooltip.setAttribute('aria-hidden', 'true');

    const tipTitle = document.createElement('div');
    tipTitle.className = 'tile-tooltip-title';
    tipTitle.textContent = fav.title;

    const tipDomain = document.createElement('div');
    tipDomain.className = 'tile-tooltip-domain';
    tipDomain.textContent = getDomain(fav.url);

    tooltip.appendChild(tipTitle);
    tooltip.appendChild(tipDomain);

    tile.appendChild(tooltip);
    tile.appendChild(editBtn);
    tile.appendChild(hero);

    return tile;
  }

  // -----------------------------------------------------------------------
  // Modal: open / close / submit
  // -----------------------------------------------------------------------

  function openAddModal() {
    editingId = null;
    modalTitle.textContent = 'Add favorite';
    saveLabel.textContent = 'Save';
    deleteBtn.hidden = true;
    titleInput.value = '';
    urlInput.value = '';
    setPendingCustomIcon(null);
    showModal();
  }

  function openEditModal(id) {
    const fav = favorites.find((f) => f.id === id);
    if (!fav) return;
    editingId = id;
    modalTitle.textContent = 'Edit favorite';
    saveLabel.textContent = 'Save changes';
    deleteBtn.hidden = false;
    titleInput.value = fav.title;
    urlInput.value = fav.url;
    setPendingCustomIcon(fav.customIcon || null);
    showModal();
  }

  function showModal() {
    clearError();
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    // Focus the first field for fast keyboard entry.
    setTimeout(() => titleInput.focus(), 30);
  }

  function closeModal() {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    editingId = null;
    pendingCustomIcon = null;
  }

  function showError(msg) {
    urlError.textContent = msg;
    urlError.hidden = false;
  }
  function clearError() {
    urlError.textContent = '';
    urlError.hidden = true;
    iconError.textContent = '';
    iconError.hidden = true;
  }

  // -----------------------------------------------------------------------
  // Custom icon uploader
  // -----------------------------------------------------------------------

  /** Update the in-memory pending icon and refresh the preview UI. */
  function setPendingCustomIcon(value) {
    pendingCustomIcon = value || null;
    iconPreview.innerHTML = '';
    if (pendingCustomIcon) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = pendingCustomIcon;
      img.referrerPolicy = 'no-referrer';
      iconPreview.appendChild(img);
      iconClearBtn.hidden = false;
    } else {
      const empty = document.createElement('span');
      empty.className = 'icon-preview-empty';
      empty.textContent = 'No icon';
      iconPreview.appendChild(empty);
      iconClearBtn.hidden = true;
    }
    // Hide the URL input when a custom icon is set; show again when cleared.
    iconUrlInput.hidden = true;
    iconUrlInput.value = '';
  }

  function showIconError(msg) {
    iconError.textContent = msg;
    iconError.hidden = false;
  }

  /**
   * Read the chosen file and resize it to a max of 256×256 (preserving
   * aspect ratio) before storing as a data URL. Resizing keeps storage
   * usage low — chrome.storage.local has a 10MB total quota.
   *
   * SVGs are stored as-is (data URL of the original) since they're
   * already small and lossless at any size.
   */
  function processIconFile(file) {
    const MAX_BYTES = 5 * 1024 * 1024; // 5MB sanity cap on input
    if (file.size > MAX_BYTES) {
      showIconError('Image is too large (max 5MB).');
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => showIconError('Could not read that file.');
    reader.onload = () => {
      const dataUrl = reader.result;
      // SVG: store directly. Canvas-rasterizing SVG defeats its purpose.
      if (file.type === 'image/svg+xml') {
        setPendingCustomIcon(dataUrl);
        return;
      }
      // Raster: load into an Image, draw to canvas, re-export downscaled.
      const img = new Image();
      img.onerror = () => showIconError('That file is not a valid image.');
      img.onload = () => {
        const MAX_DIM = 256;
        const ratio = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        // PNG preserves transparency for icons with alpha channels.
        try {
          setPendingCustomIcon(canvas.toDataURL('image/png'));
        } catch (err) {
          showIconError('Could not process that image.');
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  // Wire up the upload button → file picker.
  iconUploadBtn.addEventListener('click', () => {
    clearError();
    iconFileInput.click();
  });
  iconFileInput.addEventListener('change', () => {
    const file = iconFileInput.files && iconFileInput.files[0];
    iconFileInput.value = ''; // allow re-picking the same file later
    if (file) processIconFile(file);
  });

  // Toggle the URL input.
  iconPasteBtn.addEventListener('click', () => {
    clearError();
    iconUrlInput.hidden = !iconUrlInput.hidden;
    if (!iconUrlInput.hidden) {
      iconUrlInput.value = '';
      setTimeout(() => iconUrlInput.focus(), 30);
    }
  });

  // Validate and apply when the user finishes typing/pasting a URL.
  iconUrlInput.addEventListener('change', () => {
    const value = iconUrlInput.value.trim();
    if (!value) return;
    const normalized = normalizeUrl(value);
    if (!normalized) {
      showIconError('That doesn\u2019t look like a valid image URL.');
      return;
    }
    setPendingCustomIcon(normalized);
  });

  iconClearBtn.addEventListener('click', () => {
    clearError();
    setPendingCustomIcon(null);
  });

  async function handleSubmit(e) {
    e.preventDefault();
    clearError();

    const title = titleInput.value.trim();
    const normalized = normalizeUrl(urlInput.value);

    if (!title) {
      titleInput.focus();
      return;
    }
    if (!normalized) {
      showError('Please enter a valid URL (e.g. example.com).');
      urlInput.focus();
      return;
    }

    if (editingId) {
      favorites = favorites.map((f) =>
        f.id === editingId
          ? { ...f, title, url: normalized, customIcon: pendingCustomIcon || null }
          : f
      );
    } else {
      favorites.push({
        id: generateId(),
        title,
        url: normalized,
        customIcon: pendingCustomIcon || null,
        createdAt: Date.now(),
      });
    }

    await saveFavorites(favorites);
    render();
    closeModal();
  }

  async function handleDelete() {
    if (!editingId) return;
    // Simple confirm — keeps the UI lightweight and dependency-free.
    const fav = favorites.find((f) => f.id === editingId);
    const ok = confirm(`Delete "${fav ? fav.title : 'this favorite'}"?`);
    if (!ok) return;
    favorites = favorites.filter((f) => f.id !== editingId);
    await saveFavorites(favorites);
    render();
    closeModal();
  }

  function generateId() {
    // Prefer crypto.randomUUID where available; fall back to a simple id.
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'f_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  /**
   * Mutate `favorites` in place, moving the dragged item to occupy the
   * target's slot. The target shifts to make room — items between the two
   * positions slide one step in the appropriate direction.
   */
  function reorderFavorites(draggedId, targetId) {
    const fromIndex = favorites.findIndex((f) => f.id === draggedId);
    const toIndex   = favorites.findIndex((f) => f.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    const [moved] = favorites.splice(fromIndex, 1);
    favorites.splice(toIndex, 0, moved);
  }

  // -----------------------------------------------------------------------
  // Settings modal
  // -----------------------------------------------------------------------

  function openSettingsModal() {
    settingsModal.hidden = false;
    settingsModal.setAttribute('aria-hidden', 'false');
  }

  function closeSettingsModal() {
    settingsModal.hidden = true;
    settingsModal.setAttribute('aria-hidden', 'true');
  }

  // Segmented buttons: clicking one updates the matching setting and saves.
  settingsModal.addEventListener('click', async (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    // Backdrop / close buttons
    if (target.dataset.closeSettings === 'true') {
      closeSettingsModal();
      return;
    }

    // Segmented control buttons
    if (target.classList.contains('seg-btn')) {
      const key = target.dataset.setting;
      const value = target.dataset.value;
      if (!key || !value || settings[key] === value) return;
      settings = { ...settings, [key]: value };
      applySettings(settings);
      await saveSettings(settings);
    }
  });

  resetBtn.addEventListener('click', async () => {
    settings = { ...DEFAULT_SETTINGS };
    applySettings(settings);
    await saveSettings(settings);
  });

  settingsBtn.addEventListener('click', openSettingsModal);

  // -----------------------------------------------------------------------
  // Event wiring
  // -----------------------------------------------------------------------

  addBtn.addEventListener('click', openAddModal);
  emptyAddBtn.addEventListener('click', openAddModal);
  form.addEventListener('submit', handleSubmit);
  deleteBtn.addEventListener('click', handleDelete);

  // Backdrop / cancel buttons (any element with data-close="true").
  modal.addEventListener('click', (e) => {
    if (e.target instanceof HTMLElement && e.target.dataset.close === 'true') {
      closeModal();
    }
  });

  // Esc closes whichever modal is open.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!modal.hidden) closeModal();
    else if (!settingsModal.hidden) closeSettingsModal();
  });

  // Live-sync if storage changes in another tab.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[STORAGE_KEY]) {
      favorites = changes[STORAGE_KEY].newValue || [];
      render();
    }
    if (changes[SETTINGS_KEY]) {
      settings = { ...DEFAULT_SETTINGS, ...(changes[SETTINGS_KEY].newValue || {}) };
      applySettings(settings);
    }
  });

  // -----------------------------------------------------------------------
  // Initial load
  // -----------------------------------------------------------------------

  (async function init() {
    [favorites, settings] = await Promise.all([loadFavorites(), loadSettings()]);
    applySettings(settings);
    render();
  })();
})();
