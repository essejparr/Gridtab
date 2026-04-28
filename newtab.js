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
      sm: { '--icon-size': '64px',  '--icon-img-size': '40px' },
      md: { '--icon-size': '88px',  '--icon-img-size': '56px' },
      lg: { '--icon-size': '112px', '--icon-img-size': '72px' },
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

  // In-memory state.
  let favorites = [];
  let settings  = { ...DEFAULT_SETTINGS };
  let editingId = null;

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
   * Use Google's public favicon service to fetch a small favicon for a domain.
   * This avoids needing the "favicon" host permission. If the request fails,
   * the <img>'s onerror handler falls back to a letter avatar.
   */
  function faviconUrl(urlStr) {
    const domain = getDomain(urlStr);
    return `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(domain)}`;
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
    img.src = faviconUrl(fav.url);
    img.onerror = () => {
      // Replace the broken img with a letter avatar.
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
  }

  function showError(msg) {
    urlError.textContent = msg;
    urlError.hidden = false;
  }
  function clearError() {
    urlError.textContent = '';
    urlError.hidden = true;
  }

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
        f.id === editingId ? { ...f, title, url: normalized } : f
      );
    } else {
      favorites.push({
        id: generateId(),
        title,
        url: normalized,
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
