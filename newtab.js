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
    tileSize: 'md',     // sm | md | lg
    gap:      'normal', // tight | normal | relaxed
    iconSize: 'md',     // sm | md | lg
    theme:    'auto',   // see THEMES below
    accentColor: 'default', // see BUTTON_COLORS below; 'default' = theme accent
    // All themes are currently free. The Pro/unlock infrastructure is
    // kept intact (tier flags below, isThemeAvailable check) so we can
    // reintroduce a paywall later by flipping this to false and wiring
    // up real billing. For v1 launch: everyone gets everything.
    isPro: true,
    searchEngine: 'google', // see SEARCH_ENGINES below
  };

  /**
   * Theme registry. Free themes are always available; pro themes require
   * the user to be in `unlockedThemes`. Each theme carries swatch colors
   * used to render the picker thumbnail (no need to actually apply the
   * theme to read its colors).
   */
  // Theme registry. Order matters for the picker UI — three groups
  // (Light, Muted, Dark) appear in luminance order top to bottom.
  // Within each group, themes are ordered by temperature: warm first,
  // then neutral, then cool. Free themes anchor each group.
  const THEMES = [
    // Auto (sits alone)
    { id: 'auto',   name: 'Auto',   tier: 'free',
      // Auto doesn't have a single set of colors — it follows the OS.
      // Show the light-mode preview as a reasonable representation.
      swatch: ['#f4f5f7', '#ffffff', '#e5e7eb', '#2563eb'] },

    // Light themes — warm restrained → warm hype → cool
    { id: 'light',  name: 'Light',  tier: 'free',
      swatch: ['#f4f5f7', '#ffffff', '#e5e7eb', '#2563eb'] },
    { id: 'sunset', name: 'Sunset', tier: 'pro',
      swatch: ['#fbf2e7', '#ffffff', '#f0d9c0', '#e85d3a'] },
    { id: 'polaroid', name: 'Polaroid', tier: 'pro',
      swatch: ['#e8e2d6', '#f5f0e4', '#cfc6b3', '#3d6e6e'] },
    { id: 'vellum', name: 'Vellum', tier: 'pro',
      swatch: ['#f0ece4', '#f7f3ec', '#d6cfc0', '#1a1a1a'] },
    { id: 'linen', name: 'Linen', tier: 'pro',
      swatch: ['#f6dfd2', '#fae8de', '#e3bfae', '#5a2a48'] },
    { id: 'sherbet', name: 'Sherbet', tier: 'pro',
      swatch: ['#ffd4b0', '#ffdcc0', '#f0b885', '#a8186a'] },
    { id: 'bubblegum', name: 'Bubblegum', tier: 'pro',
      swatch: ['#fac4d3', '#fcd0db', '#e8a3b8', '#0f5f5f'] },
    { id: 'marble', name: 'Marble', tier: 'pro',
      swatch: ['#ebe9e4', '#f4f3ef', '#c9c5bd', '#5a3f1f'] },
    { id: 'slate', name: 'Slate', tier: 'pro',
      swatch: ['#d8dfe5', '#e3e8ed', '#b8c2cc', '#1e3a5f'] },
    { id: 'mint', name: 'Mint', tier: 'pro',
      swatch: ['#c8e8d8', '#d2eddf', '#a3cdb8', '#e8456a'] },
    { id: 'lavender', name: 'Lavender', tier: 'pro',
      swatch: ['#dccfee', '#e3d6f2', '#bca8d8', '#a8a818'] },

    // Muted themes — warm → neutral → cool
    { id: 'sienna', name: 'Sienna', tier: 'pro',
      swatch: ['#7a5a48', '#8a6a55', '#5a4030', '#f0e0c8'] },
    { id: 'heather', name: 'Heather', tier: 'pro',
      swatch: ['#8a5a62', '#956570', '#6e424a', '#3d5d2e'] },
    { id: 'citrus', name: 'Citrus', tier: 'pro',
      swatch: ['#7a5a1f', '#8a6826', '#5d4218', '#e8348a'] },
    { id: 'velvet', name: 'Velvet', tier: 'pro',
      swatch: ['#6e2a3a', '#7a3344', '#4d1a26', '#e8c987'] },
    { id: 'concrete', name: 'Concrete', tier: 'pro',
      swatch: ['#6a6a6a', '#777777', '#525252', '#dcdcdc'] },
    { id: 'olive', name: 'Olive', tier: 'pro',
      swatch: ['#5a6048', '#666c52', '#42473a', '#d97448'] },
    { id: 'patina', name: 'Patina', tier: 'pro',
      swatch: ['#3d5a55', '#456861', '#2a4540', '#c66830'] },
    { id: 'dusk', name: 'Dusk', tier: 'pro',
      swatch: ['#5e525c', '#6a5d68', '#473d44', '#d8b8c5'] },
    { id: 'bruise', name: 'Bruise', tier: 'pro',
      swatch: ['#3d2a52', '#473059', '#291a3d', '#f0d83c'] },
    { id: 'stormcloud', name: 'Stormcloud', tier: 'pro',
      swatch: ['#4d5868', '#586474', '#3a4456', '#e8d09a'] },

    // Dark themes — neutral → warm → cool → hype
    { id: 'dark',   name: 'Dark',   tier: 'free',
      swatch: ['#0f1115', '#1c2030', '#2a2f3d', '#3b82f6'] },
    { id: 'graphite', name: 'Graphite', tier: 'pro',
      swatch: ['#1a1a1a', '#222222', '#363636', '#e8e8e8'] },
    { id: 'forest', name: 'Forest', tier: 'pro',
      swatch: ['#1a2820', '#243831', '#3a544a', '#d4a857'] },
    { id: 'tobacco', name: 'Tobacco', tier: 'pro',
      swatch: ['#1f1612', '#2a1e18', '#3d2c22', '#e8d4a8'] },
    { id: 'ember', name: 'Ember', tier: 'pro',
      swatch: ['#1a0d0a', '#241410', '#3d201a', '#ff6a2c'] },
    { id: 'slab', name: 'Slab', tier: 'pro',
      swatch: ['#0a0a0a', '#161616', '#2a2a2a', '#a01818'] },
    { id: 'cobalt', name: 'Cobalt', tier: 'pro',
      swatch: ['#0a1628', '#0f1f3a', '#1f3358', '#f5d6a8'] },
    { id: 'oxide', name: 'Oxide', tier: 'pro',
      swatch: ['#0c1f24', '#102a30', '#1a3d44', '#d97448'] },
    { id: 'synthwave', name: 'Synthwave', tier: 'pro',
      swatch: ['#0e0524', '#1a0e3d', '#2d1a5c', '#ff2e8a'] },
    { id: 'neon', name: 'Neon', tier: 'pro',
      swatch: ['#04141a', '#072028', '#0d3a44', '#22f5e3'] },
  ];

  /**
   * Curated palette for the Add-favorite button color override.
   * 'default' uses the theme's accent. Each entry has bg + hover; text
   * color is auto-derived from luminance at apply-time.
   */
  const BUTTON_COLORS = [
    { id: 'default', name: 'Theme',  bg: null,       hover: null      },
    // Saturated row — works well on dark themes and as bold accents.
    { id: 'blue',    name: 'Blue',   bg: '#2563eb',  hover: '#1d4ed8' },
    { id: 'black',   name: 'Black',  bg: '#111111',  hover: '#000000' },
    { id: 'red',     name: 'Red',    bg: '#dc2626',  hover: '#b91c1c' },
    { id: 'green',   name: 'Green',  bg: '#16a34a',  hover: '#15803d' },
    { id: 'amber',   name: 'Amber',  bg: '#f59e0b',  hover: '#d97706' },
    { id: 'purple',  name: 'Purple', bg: '#7c3aed',  hover: '#6d28d9' },
    { id: 'teal',    name: 'Teal',   bg: '#0d9488',  hover: '#0f766e' },
    { id: 'white',   name: 'White',  bg: '#ffffff',  hover: '#f3f4f6' },
    // Light row — gentler tones that read better against light themes
    // (Sunset, Marble, Polaroid) without competing for attention.
    { id: 'lightBlue',  name: 'Light Blue',  bg: '#93c5fd', hover: '#7eb6fc' },
    { id: 'lightRed',   name: 'Light Red',   bg: '#fca5a5', hover: '#f99090' },
    { id: 'lightGreen', name: 'Light Green', bg: '#86efac', hover: '#6fe89a' },
    { id: 'lightYellow',name: 'Light Yellow',bg: '#fde68a', hover: '#fcdb6c' },
    { id: 'lightPink',  name: 'Light Pink',  bg: '#f9a8d4', hover: '#f693c5' },
    { id: 'lightPurple',name: 'Light Purple',bg: '#c4b5fd', hover: '#b3a0fc' },
  ];

  /**
   * Search engine registry. Each engine has a URL template with {q} as
   * the placeholder for the URL-encoded query, plus an inline SVG icon
   * (so we don't depend on external favicon services for the chrome).
   *
   * Icons are simplified single-color or two-color marks based on each
   * brand's identity guidelines. They render at ~20px in the UI; subtle
   * detail at that size is wasted, so simpler is better.
   */
  const SEARCH_ENGINES = [
    {
      id: 'google', name: 'Google',
      url: 'https://www.google.com/search?q={q}',
      // Google's classic 4-color "G" mark.
      icon: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>`,
    },
    {
      id: 'bing', name: 'Bing',
      url: 'https://www.bing.com/search?q={q}',
      // Microsoft Bing's stylized B mark.
      icon: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#37C2B1"/><stop offset=".5" stop-color="#0EA5C7"/><stop offset="1" stop-color="#0078D4"/></linearGradient></defs><path fill="url(#bg)" d="M5 2v15.5l4.5-1.7 4.7 2.4L9 21V19l-4-1.5V2zm0 0 4.5 1.7v9l4.7 1.7 4-1.7L5 22V11.5l-4.5-1.7z" transform="translate(2 0)"/></svg>`,
    },
    {
      id: 'duckduckgo', name: 'DuckDuckGo',
      url: 'https://duckduckgo.com/?q={q}',
      // DDG's orange duck mark — simplified.
      icon: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="11" fill="#DE5833"/><path fill="#fff" d="M14.5 6.8c-1 .5-1.5 1.2-1.5 2.5 0 2 2 2.5 2 4.5 0 2.5-2 3-2 6h-3l.5-3.5c-1.5-.5-3-1.5-3.5-3.5 0-1 .5-1.5 1-1.5l-1-1c0-1 1.5-1.5 3-1.5 2.5 0 3.5.5 4.5-2z"/><circle cx="14.5" cy="9.8" r="1.1" fill="#fff"/><circle cx="14.5" cy="9.8" r=".5" fill="#000"/></svg>`,
    },
    {
      id: 'brave', name: 'Brave Search',
      url: 'https://search.brave.com/search?q={q}',
      // Brave's lion-shield silhouette — simplified to the orange shield form.
      icon: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#FB542B" d="M21 6.5 19.5 4l-3 .5L12 2 7.5 4.5 4.5 4 3 6.5l1.5 3-.5 4.5 1.5 5L12 22l6.5-3 1.5-5-.5-4.5z"/><path fill="#fff" d="M12 7.5 9 9.5l1.5 3-2 2 3.5 3.5 3.5-3.5-2-2 1.5-3z" opacity=".9"/></svg>`,
    },
    {
      id: 'ecosia', name: 'Ecosia',
      url: 'https://www.ecosia.org/search?q={q}',
      // Ecosia's leaf-circle mark.
      icon: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="11" fill="#36A86E"/><path fill="#fff" d="M6.5 14.5c2 2 6 2 9 0-1-.5-2-.5-3.5-.5l-1.5-1.5c0-1.5.5-2.5 1.5-3.5 1.5 0 2.5 0 3.5-.5-3-2-7-2-9 0-1.5 2-1.5 4 0 6z"/></svg>`,
    },
    {
      id: 'kagi', name: 'Kagi',
      url: 'https://kagi.com/search?q={q}',
      // Kagi's yellow circle with stylized K.
      icon: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="11" fill="#FFB319"/><path fill="#1a1a1a" d="M8 7h2v4l4-4h2.5l-4.5 4.5L17 17h-2.5L11 13v4H8z"/></svg>`,
    },
    {
      id: 'perplexity', name: 'Perplexity',
      url: 'https://www.perplexity.ai/?q={q}',
      // Perplexity's stylized "?" / network mark.
      icon: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" rx="5" fill="#1F1F1F"/><path fill="#20B8A6" d="M12 4 4 9v6l8 5 8-5V9zm0 2 5 3-5 3-5-3zm-6 5 5 3v5l-5-3zm12 0v5l-5 3v-5z"/></svg>`,
    },
    {
      id: 'youtube', name: 'YouTube',
      url: 'https://www.youtube.com/results?search_query={q}',
      // YouTube's red "play button" rounded rectangle.
      icon: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#FF0000" d="M23.5 6.2c-.3-1-1-1.8-2-2.1C19.6 3.5 12 3.5 12 3.5s-7.6 0-9.5.6c-1 .3-1.7 1.1-2 2.1C0 8.1 0 12 0 12s0 3.9.5 5.8c.3 1 1 1.8 2 2.1 1.9.6 9.5.6 9.5.6s7.6 0 9.5-.6c1-.3 1.7-1.1 2-2.1.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8z"/><path fill="#fff" d="M9.6 15.6V8.4l6.3 3.6z"/></svg>`,
    },
  ];

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
  const favoriteForm   = document.getElementById('favoriteForm');
  const titleInput     = document.getElementById('titleInput');
  const urlInput       = document.getElementById('urlInput');
  const urlError       = document.getElementById('urlError');
  const saveLabel      = document.getElementById('saveLabel');
  const deleteBtn      = document.getElementById('deleteBtn');
  const settingsBtn    = document.getElementById('settingsBtn');
  const settingsModal  = document.getElementById('settingsModal');
  const resetBtn       = document.getElementById('resetSettingsBtn');
  const expandAllBtn   = document.getElementById('expandAllBtn');
  const collapseAllBtn = document.getElementById('collapseAllBtn');
  const clearAllBtn    = document.getElementById('clearAllBtn');
  // Split add button + color picker.
  const addBtnWrap     = document.querySelector('.add-btn-wrap');
  const addBtnCaret    = document.getElementById('addBtnCaret');
  const colorMenu      = document.getElementById('addBtnColorMenu');
  const colorMenuGrid  = document.getElementById('colorMenuGrid');
  // Theme picker.
  const themeGrid      = document.getElementById('themeGrid');
  // Search bar + engine popover.
  const searchForm     = document.getElementById('searchForm');
  const searchInput    = document.getElementById('searchInput');
  const engineBtn      = document.getElementById('engineBtn');
  const engineIcon     = document.getElementById('engineIcon');
  const enginePopover  = document.getElementById('enginePopover');
  // Custom icon uploader (in the favorite edit modal).
  const iconPreview    = document.getElementById('iconPreview');
  const iconFileInput  = document.getElementById('iconFileInput');
  const iconUploadBtn  = document.getElementById('iconUploadBtn');
  const iconPasteBtn   = document.getElementById('iconPasteBtn');
  const iconClearBtn   = document.getElementById('iconClearBtn');
  const iconUrlInput   = document.getElementById('iconUrlInput');
  const iconError      = document.getElementById('iconError');
  // Folder form (lives in the same modal, second tab).
  const modalTabs      = document.getElementById('modalTabs');
  const folderForm     = document.getElementById('folderForm');
  const folderTitleInput = document.getElementById('folderTitleInput');
  const folderColorGrid  = document.getElementById('folderColorGrid');
  const folderSaveLabel  = document.getElementById('folderSaveLabel');
  const folderDeleteBtn  = document.getElementById('folderDeleteBtn');

  // In-memory state.
  let favorites = [];
  let settings  = { ...DEFAULT_SETTINGS };
  let editingId = null;
  let editingKind = 'favorite'; // 'favorite' | 'folder' — what the modal is editing
  // Holds the custom icon (data URL or http(s) URL) for the favorite
  // currently being added/edited. Null means "no custom icon".
  let pendingCustomIcon = null;
  // Pending folder color while editing in the modal.
  let pendingFolderColor = 'default';
  // Tracks what's being dragged in the current drag session. Set on
  // dragstart, cleared on dragend. Lets dragover handlers branch on
  // the kind of dragged item (favorite vs folder), since dataTransfer
  // payloads are locked from reading during dragover.
  let currentDragId = null;

  // -----------------------------------------------------------------------
  // Storage helpers (chrome.storage.local)
  // -----------------------------------------------------------------------

  function loadFavorites() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        const stored = result[STORAGE_KEY];
        if (!Array.isArray(stored)) {
          resolve([]);
          return;
        }
        // Defensively filter out malformed entries. An earlier bug could
        // push non-objects (booleans) into the array; this purges any
        // such corruption so the UI doesn't render broken tiles.
        const clean = stored.filter((item) =>
          item && typeof item === 'object' && typeof item.id === 'string'
        );
        resolve(clean);
      });
    });
  }

  /**
   * Save favorites to storage. Resolves with `{ ok: true }` on success,
   * or `{ ok: false, error }` if the write fails (most commonly because
   * the user has exceeded the 10MB chrome.storage.local quota by adding
   * too many large custom icons). Callers should check and surface a
   * useful error to the user when ok is false.
   */
  function saveFavorites(list) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: list }, () => {
        const err = chrome.runtime.lastError;
        if (err) resolve({ ok: false, error: err.message || 'Save failed.' });
        else resolve({ ok: true });
      });
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

    // Theme — fall back to 'auto' if a Pro theme was selected then locked
    // again somehow (defensive).
    const theme = isThemeAvailable(s.theme, s) ? s.theme : 'auto';
    if (theme === 'auto') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }

    // Accent color override for the Add-favorite button. 'default' clears
    // the inline overrides so the theme's accent shows through.
    const color = BUTTON_COLORS.find((c) => c.id === s.accentColor) || BUTTON_COLORS[0];
    if (color.bg) {
      root.style.setProperty('--accent', color.bg);
      root.style.setProperty('--accent-hover', color.hover);
      root.style.setProperty('--accent-text', readableTextOn(color.bg));
    } else {
      root.style.removeProperty('--accent');
      root.style.removeProperty('--accent-hover');
      root.style.removeProperty('--accent-text');
    }

    // Reflect active state on segmented control buttons.
    settingsModal.querySelectorAll('.seg-btn').forEach((btn) => {
      const key = btn.dataset.setting;
      const active = btn.dataset.value === s[key];
      btn.setAttribute('aria-checked', active ? 'true' : 'false');
    });

    // Caret button tooltip: surfaces the override state so users can
    // notice at a glance when their button color isn't following the
    // theme — no need to open the picker to find out.
    if (addBtnCaret) {
      const currentColor = BUTTON_COLORS.find((c) => c.id === s.accentColor);
      if (currentColor) {
        addBtnCaret.title = currentColor.id === 'default'
          ? 'Button color: following theme'
          : `Button color: ${currentColor.name} (custom)`;
      }
    }

    // Re-render dynamic pickers so their checked state matches.
    renderThemePicker();
    renderColorMenu();
  }

  /**
   * Compute a readable text color (white or black) for a given background
   * hex using the W3C relative-luminance formula. Avoids the need for the
   * user to pick text color themselves when overriding the button.
   */
  function readableTextOn(hex) {
    const m = /^#?([a-f0-9]{6}|[a-f0-9]{3})$/i.exec(hex);
    if (!m) return '#ffffff';
    let h = m[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const g = parseInt(h.slice(2, 4), 16) / 255;
    const b = parseInt(h.slice(4, 6), 16) / 255;
    // sRGB → linear, then luminance. Threshold ~0.55 picks white on most
    // mid-tones (red, blue, purple) and black on yellow/amber/white.
    const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return L > 0.55 ? '#111111' : '#ffffff';
  }

  function isThemeAvailable(themeId, s) {
    const theme = THEMES.find((t) => t.id === themeId);
    if (!theme) return false;
    if (theme.tier === 'free') return true;
    return !!s.isPro;
  }

  // -----------------------------------------------------------------------
  // Theme picker + Color menu rendering
  // -----------------------------------------------------------------------

  function renderThemePicker() {
    if (!themeGrid) return;
    themeGrid.innerHTML = '';
    for (const theme of THEMES) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'theme-card';
      card.dataset.themeId = theme.id;
      card.setAttribute('role', 'radio');
      card.setAttribute('aria-checked', settings.theme === theme.id ? 'true' : 'false');

      const locked = theme.tier === 'pro' && !isThemeAvailable(theme.id, settings);
      if (locked) card.classList.add('is-locked');

      // Subtle section dividers in the picker. Sienna leads the muted
      // group; Dark leads the dark group. CSS draws a thin line above
      // each — and above the corresponding sibling in column 2 — so
      // the rows visually separate without category headers.
      if (theme.id === 'sienna' || theme.id === 'dark') {
        card.classList.add('is-section-start');
      }

      // Mini theme preview: page bg fills the rectangle, an inner
      // "surface tile" represents one of the favorite tiles, and a dot
      // in the corner shows the accent color. Reads as "what does this
      // theme actually look like?" rather than "here are 4 colors."
      // swatch[0] = bg, swatch[1] = surface, swatch[2] = border, swatch[3] = accent
      const swatch = document.createElement('div');
      swatch.className = 'theme-card-swatch';
      // Auto theme: split diagonally between light and dark previews so
      // it's distinguishable from the Light theme card.
      if (theme.id === 'auto') {
        swatch.style.background =
          'linear-gradient(135deg, #f4f5f7 50%, #0f1115 50%)';
      } else {
        swatch.style.background = theme.swatch[0];
      }

      const surface = document.createElement('span');
      surface.className = 'theme-card-swatch-surface';
      surface.style.background = theme.swatch[1];
      surface.style.borderColor = theme.swatch[2];

      const accent = document.createElement('span');
      accent.className = 'theme-card-swatch-accent';
      accent.style.background = theme.swatch[3];

      swatch.appendChild(surface);
      swatch.appendChild(accent);

      const name = document.createElement('div');
      name.className = 'theme-card-name';
      name.textContent = theme.name;

      card.appendChild(swatch);
      card.appendChild(name);

      // Pro badge intentionally not rendered while all themes are free.
      // When a paywall is reintroduced, restore by checking `locked` and
      // appending a `.theme-card-pro` span here.

      card.addEventListener('click', () => handleThemeSelect(theme.id));
      themeGrid.appendChild(card);
    }
  }

  function renderColorMenu() {
    if (!colorMenuGrid) return;
    colorMenuGrid.innerHTML = '';

    // Find the current theme's accent so the 'default' swatch can
    // literally show what color the button will become if the user
    // picks 'Theme'. This makes override-vs-follow immediate.
    const currentTheme = THEMES.find((t) => t.id === settings.theme) || THEMES[0];
    const themeAccent = currentTheme.swatch[3];

    for (const color of BUTTON_COLORS) {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'color-swatch';
      swatch.title = color.id === 'default'
        ? `Theme accent (${currentTheme.name})`
        : color.name;
      swatch.setAttribute('role', 'menuitemradio');
      swatch.setAttribute('aria-checked',
        settings.accentColor === color.id ? 'true' : 'false');
      if (color.id === 'default') {
        // Show the current theme's accent so 'Theme' is self-explanatory.
        // A small white dot is overlaid via CSS to mark it as the
        // 'follow theme' option distinct from a literal color choice.
        swatch.style.background = themeAccent;
        swatch.classList.add('color-swatch-theme');
      } else {
        swatch.style.background = color.bg;
      }
      swatch.addEventListener('click', () => handleColorSelect(color.id));
      colorMenuGrid.appendChild(swatch);
    }

    // Header label: tells the user what's currently selected at a glance,
    // and surfaces the "you've overridden the theme" state explicitly.
    const currentColor = BUTTON_COLORS.find((c) => c.id === settings.accentColor);
    const label = document.querySelector('.color-menu-label');
    if (label && currentColor) {
      if (currentColor.id === 'default') {
        label.textContent = `Following theme (${currentTheme.name})`;
      } else {
        label.textContent = `Custom: ${currentColor.name}`;
      }
    }
  }

  async function handleThemeSelect(themeId) {
    // No paywall right now — every theme is available to every user.
    if (!isThemeAvailable(themeId, settings)) return;
    if (settings.theme === themeId) return;
    settings = { ...settings, theme: themeId };
    applySettings(settings);
    await saveSettings(settings);
  }

  async function handleColorSelect(colorId) {
    if (settings.accentColor === colorId) return;
    settings = { ...settings, accentColor: colorId };
    applySettings(settings);
    await saveSettings(settings);
    closeColorMenu();
  }

  // -----------------------------------------------------------------------
  // Color popover open/close
  // -----------------------------------------------------------------------

  function openColorMenu() {
    colorMenu.hidden = false;
    addBtnCaret.setAttribute('aria-expanded', 'true');
    // Close on next outside click.
    setTimeout(() => document.addEventListener('click', outsideColorMenu), 0);
  }
  function closeColorMenu() {
    colorMenu.hidden = true;
    addBtnCaret.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', outsideColorMenu);
  }
  function outsideColorMenu(e) {
    if (!addBtnWrap.contains(e.target)) closeColorMenu();
  }

  addBtnCaret.addEventListener('click', (e) => {
    e.stopPropagation();
    if (colorMenu.hidden) openColorMenu();
    else closeColorMenu();
  });
  // Right-click anywhere on the split button opens the popover too.
  addBtnWrap.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (colorMenu.hidden) openColorMenu();
    else closeColorMenu();
  });

  // -----------------------------------------------------------------------
  // Search bar
  // -----------------------------------------------------------------------

  function getCurrentEngine() {
    return SEARCH_ENGINES.find((e) => e.id === settings.searchEngine)
        || SEARCH_ENGINES[0];
  }

  /** Render the engine icon inside the search-bar's left button. */
  function renderEngineButton() {
    const engine = getCurrentEngine();
    engineIcon.innerHTML = engine.icon;
    engineBtn.title = `Search with ${engine.name}`;
    searchInput.placeholder = `Search ${engine.name}…`;
  }

  /** Render the engine popover list. */
  function renderEnginePopover() {
    enginePopover.innerHTML = '';
    for (const engine of SEARCH_ENGINES) {
      const opt = document.createElement('button');
      opt.type = 'button';
      opt.className = 'engine-option';
      opt.setAttribute('role', 'menuitemradio');
      opt.setAttribute('aria-checked',
        settings.searchEngine === engine.id ? 'true' : 'false');

      const iconWrap = document.createElement('span');
      iconWrap.className = 'engine-option-icon';
      iconWrap.innerHTML = engine.icon;

      const name = document.createElement('span');
      name.className = 'engine-option-name';
      name.textContent = engine.name;

      opt.appendChild(iconWrap);
      opt.appendChild(name);
      opt.addEventListener('click', async () => {
        if (settings.searchEngine !== engine.id) {
          settings = { ...settings, searchEngine: engine.id };
          renderEngineButton();
          await saveSettings(settings);
        }
        closeEnginePopover();
        searchInput.focus();
      });
      enginePopover.appendChild(opt);
    }
  }

  function openEnginePopover() {
    renderEnginePopover();
    enginePopover.hidden = false;
    engineBtn.setAttribute('aria-expanded', 'true');
    setTimeout(() => document.addEventListener('click', outsideEnginePopover), 0);
  }
  function closeEnginePopover() {
    enginePopover.hidden = true;
    engineBtn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', outsideEnginePopover);
  }
  function outsideEnginePopover(e) {
    if (!searchForm.contains(e.target)) closeEnginePopover();
  }

  engineBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (enginePopover.hidden) openEnginePopover();
    else closeEnginePopover();
  });

  // Submit: build the engine URL with the query and navigate.
  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = searchInput.value.trim();
    if (!query) return;
    const engine = getCurrentEngine();
    const url = engine.url.replace('{q}', encodeURIComponent(query));
    window.location.href = url;
  });

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

    // Top-level pass. For folders, render the folder tile, then if open
    // render its children inline immediately after (each child marked
    // with the folder's color so users can see the grouping).
    for (const item of favorites) {
      if (kindOf(item) === 'folder') {
        grid.appendChild(buildFolderTile(item));
        if (item.open) {
          // Resolve the folder's color id to its actual hex value so
          // children's --folder-color CSS variable receives a valid color.
          const folderColorHex = folderColorBg(item.color);
          for (const child of item.items || []) {
            grid.appendChild(buildTile(child, {
              folderId: item.id,
              folderColor: folderColorHex,
            }));
          }
        }
      } else {
        grid.appendChild(buildTile(item));
      }
    }
    // Trailing "+" tile — always last.
    grid.appendChild(buildAddTile());
  }

  /**
   * Build a folder tile. Solid color tile (or neutral surface for the
   * default color), with a small folder icon centered. Click toggles
   * open/closed; the hover tooltip surfaces the folder name + count.
   */
  function buildFolderTile(folder) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'tile tile-folder';
    tile.dataset.id = folder.id;
    tile.dataset.kind = 'folder';
    tile.draggable = true;
    if (folder.open) tile.classList.add('is-open');

    const colorBg = folderColorBg(folder.color);
    if (colorBg) {
      tile.style.setProperty('--folder-color', colorBg);
      tile.classList.add('has-color');
    }

    tile.setAttribute('aria-label',
      `Folder: ${folder.title} (${folder.items?.length || 0} items)`);
    tile.setAttribute('aria-expanded', folder.open ? 'true' : 'false');

    // Edit button (pencil) — top-right, like favorite tiles.
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'tile-edit';
    editBtn.setAttribute('aria-label', `Edit ${folder.title}`);
    editBtn.textContent = '✎';
    editBtn.draggable = false;
    editBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openEditFolderModal(folder.id);
    });

    // Centered folder glyph — closed or open variant. The open glyph is
    // an angled isometric shape that suggests a drawer pulled open with
    // contents visible inside.
    const glyph = document.createElement('div');
    glyph.className = 'folder-glyph';
    glyph.innerHTML = folder.open
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
           <path d="M2 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v2H2z"/>
           <path d="M2 10h20l-2.5 8a2 2 0 0 1-1.94 1.5H6.44a2 2 0 0 1-1.94-1.5z"/>
         </svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
           <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>
         </svg>`;

    // Hover tooltip — folder name + item count (replaces the old preview).
    const tooltip = document.createElement('div');
    tooltip.className = 'tile-tooltip';
    tooltip.setAttribute('aria-hidden', 'true');
    const tipTitle = document.createElement('div');
    tipTitle.className = 'tile-tooltip-title';
    tipTitle.textContent = folder.title;
    const tipMeta = document.createElement('div');
    tipMeta.className = 'tile-tooltip-domain';
    const count = folder.items?.length || 0;
    tipMeta.textContent = `${count} item${count === 1 ? '' : 's'}`;
    tooltip.appendChild(tipTitle);
    tooltip.appendChild(tipMeta);

    tile.appendChild(tooltip);
    tile.appendChild(editBtn);
    tile.appendChild(glyph);

    // Click toggles open/closed (but not when clicking the edit button).
    tile.addEventListener('click', async (e) => {
      if (e.target === editBtn || editBtn.contains(e.target)) return;
      await toggleFolderOpen(folder.id);
    });

    // Drag-and-drop for the folder itself + accepting drops onto it.
    wireFolderTileDragHandlers(tile, folder);

    return tile;
  }

  /** Resolve a folder color id to its CSS background value (or null). */
  function folderColorBg(colorId) {
    const color = BUTTON_COLORS.find((c) => c.id === colorId);
    return color && color.bg ? color.bg : null;
  }

  /**
   * Builds the trailing "+" tile that opens the add-favorite modal.
   * Inherits the grid's sizing rules so it auto-matches every tile, but
   * carries its own muted styling so it reads as an action, not a site.
   */
  function buildAddTile() {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'tile tile-add';
    tile.setAttribute('aria-label', 'Add favorite');
    tile.draggable = false;

    const plus = document.createElement('span');
    plus.className = 'tile-add-plus';
    plus.textContent = '+';
    plus.setAttribute('aria-hidden', 'true');
    tile.appendChild(plus);

    tile.addEventListener('click', openAddModal);

    return tile;
  }

  async function toggleFolderOpen(folderId) {
    const folder = favorites.find((f) => f.id === folderId);
    if (!folder || kindOf(folder) !== 'folder') return;
    const previous = JSON.parse(JSON.stringify(favorites));
    folder.open = !folder.open;
    const result = await saveFavorites(favorites);
    if (!result.ok) { favorites = previous; }
    render();
  }

  /**
   * Wire drag/drop on a folder tile:
   *  - dragstart: identical to favorite tiles (lets it be reordered).
   *  - drop target: accepts a favorite drop → adds the favorite to the
   *    folder. Does NOT accept folder drops (no nested folders).
   */
  function wireFolderTileDragHandlers(tile, folder) {
    tile.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', folder.id);
      currentDragId = folder.id;
      setTimeout(() => {
        tile.classList.add('is-dragging');
        document.body.classList.add('is-dragging');
      }, 0);
    });
    tile.addEventListener('dragend', () => {
      currentDragId = null;
      tile.classList.remove('is-dragging');
      document.body.classList.remove('is-dragging');
      document.querySelectorAll('.tile.is-drop-target, .tile.is-drop-before, .tile.is-drop-after, .tile.is-add-target')
        .forEach((el) => el.classList.remove('is-drop-target', 'is-drop-before', 'is-drop-after', 'is-add-target'));
    });
    tile.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (tile.classList.contains('is-dragging')) return;

      // Branch on what's being dragged. We can't read the dataTransfer
      // payload during dragover, so consult the module-scoped tracker.
      const draggedLoc = currentDragId ? findItemById(currentDragId) : null;
      const draggingFolder = draggedLoc && kindOf(draggedLoc.item) === 'folder';

      if (draggingFolder) {
        // Folder onto folder = reorder only. Use insertion bars.
        const rect = tile.getBoundingClientRect();
        const onLeftHalf = (e.clientX - rect.left) < rect.width * 0.5;
        tile.classList.toggle('is-drop-before', onLeftHalf);
        tile.classList.toggle('is-drop-after', !onLeftHalf);
        tile.classList.remove('is-drop-target', 'is-add-target');
      } else {
        // Favorite onto folder = two possible actions:
        //  - center zone (36%–64%): add to folder (strong ring)
        //  - outer halves: reorder around the folder (insertion bars)
        // Same zone shape as favorite-on-favorite merge logic, so the
        // gesture is consistent across all tile types.
        // EXCEPTION: if the dragged favorite came from a folder, we
        // never offer "add to a different folder" via center zone —
        // extract-then-immediately-refold is almost never intended,
        // same logic that suppresses merge for folder-extracted items.
        const draggedFromFolder = !!(draggedLoc && draggedLoc.parent);
        const rect = tile.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        // Folders use a wide center zone (25%–75%) for "add to folder",
        // not the tight 36%–64% zone used for favorite-on-favorite
        // merge. Reasoning: the folder is a deliberate target — the
        // user has to drag onto a visibly distinct tile — so we don't
        // need accident-prevention there. Reorder-around-folder slivers
        // sit at the outer 25% of each side, still easy to hit by
        // aiming at the gap between tiles.
        const inAddZone = !draggedFromFolder
                       && offsetX > rect.width * 0.25
                       && offsetX < rect.width * 0.75;

        if (inAddZone) {
          tile.classList.add('is-add-target');
          tile.classList.remove('is-drop-before', 'is-drop-after');
        } else {
          const onLeftHalf = offsetX < rect.width * 0.5;
          tile.classList.toggle('is-drop-before', onLeftHalf);
          tile.classList.toggle('is-drop-after', !onLeftHalf);
          tile.classList.remove('is-drop-target', 'is-add-target');
        }
      }
    });
    tile.addEventListener('dragleave', () => {
      tile.classList.remove('is-drop-target', 'is-drop-before', 'is-drop-after', 'is-add-target');
    });
    tile.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Capture which intent the dragover ended on — read class state
      // before stripping. is-add-target = drop into folder; otherwise
      // it's a reorder, with the side determined by is-drop-after.
      const wasAdd = tile.classList.contains('is-add-target');
      const dropSide = tile.classList.contains('is-drop-after') ? 'after' : 'before';
      tile.classList.remove('is-drop-target', 'is-drop-before', 'is-drop-after', 'is-add-target');
      const draggedId = e.dataTransfer.getData('text/plain');
      if (!draggedId || draggedId === folder.id) return;

      const dragged = findItemById(draggedId);
      if (!dragged) return;

      const previous = JSON.parse(JSON.stringify(favorites));
      let mutated = false;

      if (kindOf(dragged.item) === 'folder') {
        // Folder dropped onto folder — reorder, don't nest. Folders
        // never enter add-to-folder mode (no nested folders).
        reorderFavorites(draggedId, folder.id, dropSide);
        mutated = true;
      } else if (wasAdd) {
        // Favorite dropped on folder's center zone — add to it.
        // Hoist out of any other folder it lived in first.
        if (dragged.parent) removeFromFolder(draggedId);
        mutated = addToFolder(draggedId, folder.id);
      } else {
        // Favorite dropped on folder's outer half — reorder around
        // the folder at top level, like reordering between any two
        // top-level items.
        if (dragged.parent) removeFromFolder(draggedId);
        reorderFavorites(draggedId, folder.id, dropSide);
        mutated = true;
      }
      if (!mutated) return;
      const result = await saveFavorites(favorites);
      if (!result.ok) { favorites = previous; }
      render();
    });
  }


  function buildTile(fav, ctx) {
    // The tile itself is an <a> so click + middle-click + keyboard "Enter"
    // all work naturally. Per spec, clicking opens in the current tab.
    const tile = document.createElement('a');
    tile.className = 'tile';
    tile.href = fav.url;
    tile.dataset.id = fav.id;
    tile.draggable = true;
    tile.setAttribute('aria-label', `${fav.title} — ${getDomain(fav.url)}`);

    // If this tile is a child of an open folder, mark it visually so
    // users can see the grouping at a glance, and tag it for drop logic.
    if (ctx && ctx.folderId) {
      tile.classList.add('is-folder-child');
      tile.dataset.folderId = ctx.folderId;
      if (ctx.folderColor) tile.style.setProperty('--folder-color', ctx.folderColor);
    }

    // --- Drag-and-drop wiring ---
    tile.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', fav.id);
      currentDragId = fav.id;
      setTimeout(() => {
        tile.classList.add('is-dragging');
        document.body.classList.add('is-dragging');
      }, 0);
    });

    tile.addEventListener('dragend', () => {
      currentDragId = null;
      tile.classList.remove('is-dragging');
      document.body.classList.remove('is-dragging');
      document.querySelectorAll('.tile.is-drop-target, .tile.is-merge-target, .tile.is-drop-before, .tile.is-drop-after, .tile.is-add-target')
        .forEach((el) => el.classList.remove(
          'is-drop-target', 'is-merge-target', 'is-drop-before', 'is-drop-after', 'is-add-target'));
    });

    // Hold-to-merge state, scoped to this tile. The merge highlight
    // only appears after the user *pauses* in the center zone for the
    // hold duration — accidental cursor passes during reordering won't
    // trigger merge.
    let mergeHoldTimer = null;
    const MERGE_HOLD_MS = 400;

    function clearMergeHold() {
      if (mergeHoldTimer) {
        clearTimeout(mergeHoldTimer);
        mergeHoldTimer = null;
      }
    }

    tile.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (tile.classList.contains('is-dragging')) return;

      // Tiles inside an open folder. All drops on a folder-child show
      // before/after insertion bars — the user can pick the exact slot
      // whether they're reordering a sibling or adding from outside.
      // The colored folder ring around the children already signals
      // "this is folder content," so the bars unambiguously mean "drop
      // lands here in the folder."
      if (ctx && ctx.folderId) {
        const rect = tile.getBoundingClientRect();
        const onLeftHalf = (e.clientX - rect.left) < rect.width * 0.5;
        tile.classList.toggle('is-drop-before', onLeftHalf);
        tile.classList.toggle('is-drop-after', !onLeftHalf);
        tile.classList.remove('is-drop-target');
        return;
      }

      // Top-level tile. Decide what action this hover represents based
      // on (a) where the cursor is on the tile, and (b) whether the
      // dragged item even *can* be merged. Items being dragged out of
      // a folder are reorder-only — merging would just shuffle them
      // sideways, which is never what the user wants. Folders also
      // can't be merged into other tiles (no nested folders).
      const draggedLoc = currentDragId ? findItemById(currentDragId) : null;
      const draggingFolder = draggedLoc && kindOf(draggedLoc.item) === 'folder';
      const rect = tile.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;

      // Insertion side: which half of the tile the cursor is on tells us
      // whether the dragged item will land before or after this one.
      const onLeftHalf = offsetX < rect.width * 0.5;
      tile.classList.toggle('is-drop-before', onLeftHalf);
      tile.classList.toggle('is-drop-after', !onLeftHalf);

      // Skip merge zone entirely if the dragged item is a folder —
      // folder-into-favorite has no merge meaning, only reorder.
      if (draggingFolder) {
        clearMergeHold();
        tile.classList.remove('is-merge-target');
        return;
      }

      // Merge zone: a tight 28%-wide center disk (36%–64%). The previous
      // 50% zone made accidental merges too easy. Now merging requires
      // a deliberate pause in the center.
      const inMergeZone =
        offsetX > rect.width * 0.36 && offsetX < rect.width * 0.64;

      if (inMergeZone) {
        // Start (or keep) the hold timer. Only after MERGE_HOLD_MS does
        // the merge highlight activate. Until then, show reorder visual.
        if (!mergeHoldTimer && !tile.classList.contains('is-merge-target')) {
          mergeHoldTimer = setTimeout(() => {
            tile.classList.add('is-merge-target');
            tile.classList.remove('is-drop-before', 'is-drop-after');
            mergeHoldTimer = null;
          }, MERGE_HOLD_MS);
        }
      } else {
        // Cursor moved out of merge zone — abort any pending hold and
        // clear the merge highlight if it was set.
        clearMergeHold();
        tile.classList.remove('is-merge-target');
      }
    });

    tile.addEventListener('dragleave', () => {
      clearMergeHold();
      tile.classList.remove('is-drop-before', 'is-drop-after', 'is-merge-target');
    });

    tile.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const wasMerge = tile.classList.contains('is-merge-target');
      // Capture the insertion side from the classes set during dragover.
      // 'after' if right-half drop, otherwise 'before' (also the safe default).
      const dropSide = tile.classList.contains('is-drop-after') ? 'after' : 'before';
      clearMergeHold();
      tile.classList.remove('is-drop-before', 'is-drop-after', 'is-merge-target');

      const draggedId = e.dataTransfer.getData('text/plain');
      const targetId  = fav.id;
      if (!draggedId || draggedId === targetId) return;

      const dragged = findItemById(draggedId);
      if (!dragged) return;

      const previous = JSON.parse(JSON.stringify(favorites));
      let mutated = false;

      // Case A: this tile is INSIDE a folder. Drop semantics differ:
      //  - if dragged is a top-level favorite, add it to this folder.
      //  - if dragged is also from this folder, reorder within folder.
      //  - if dragged is from a different folder, move it here.
      if (ctx && ctx.folderId) {
        const folder = favorites.find((f) => f.id === ctx.folderId);
        if (!folder) return;
        if (kindOf(dragged.item) === 'folder') return; // can't put folder in folder
        if (dragged.parent && dragged.parent.id === ctx.folderId) {
          // Reorder within the same folder. Same before/after + index
          // shift logic as the top-level reorderFavorites.
          const arr = folder.items;
          const fromIdx = arr.findIndex((c) => c.id === draggedId);
          if (fromIdx === -1) return;
          const [moved] = arr.splice(fromIdx, 1);
          let insertAt = arr.findIndex((c) => c.id === targetId);
          if (insertAt === -1) {
            // Target was somehow lost — restore by re-inserting at original.
            arr.splice(fromIdx, 0, moved);
            return;
          }
          if (dropSide === 'after') insertAt += 1;
          arr.splice(insertAt, 0, moved);
          mutated = true;
        } else {
          // Cross-folder add. Insert before targetId for "before" side,
          // or before the next sibling for "after" side. If target is
          // the last child and side is "after," beforeId is null and
          // addToFolder falls through to "push to end."
          let beforeId = targetId;
          if (dropSide === 'after') {
            const arr = folder.items || [];
            const idx = arr.findIndex((c) => c.id === targetId);
            beforeId = (idx >= 0 && idx < arr.length - 1)
              ? arr[idx + 1].id
              : null;
          }
          mutated = addToFolder(draggedId, ctx.folderId, beforeId);
        }
      }
      // Case B: this tile is at the top level. Three possibilities:
      //  - merge intent + favorite-on-favorite + same parent context
      //    -> create new folder
      //  - dragged came out of a folder -> always reorder, never merge
      //    (extracting + immediately re-folding is not a thing users
      //     want; this is the source of accidental folders)
      //  - everything else -> reorder
      else {
        const draggedFromFolder = !!dragged.parent;
        const canMerge = wasMerge
                       && kindOf(dragged.item) === 'favorite'
                       && !draggedFromFolder;
        if (canMerge) {
          mutated = mergeIntoFolder(draggedId, targetId);
        } else {
          // Hoist out of folder first if needed so reorder is at top level.
          if (draggedFromFolder) removeFromFolder(draggedId);
          reorderFavorites(draggedId, targetId, dropSide);
          mutated = true;
        }
      }

      if (!mutated) return;
      const result = await saveFavorites(favorites);
      if (!result.ok) { favorites = previous; }
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
    editingKind = 'favorite';
    modalTitle.textContent = 'Add';
    saveLabel.textContent = 'Save';
    folderSaveLabel.textContent = 'Save';
    deleteBtn.hidden = true;
    folderDeleteBtn.hidden = true;
    titleInput.value = '';
    urlInput.value = '';
    folderTitleInput.value = '';
    setPendingCustomIcon(null);
    setPendingFolderColor('default');
    modalTabs.hidden = false; // tab switcher visible only when creating
    setModalTab('favorite');
    showModal();
  }

  function openEditModal(id) {
    // Look up the item — it might be at top level or inside a folder.
    const loc = findItemById(id);
    if (!loc || kindOf(loc.item) !== 'favorite') return;
    const fav = loc.item;
    editingId = id;
    editingKind = 'favorite';
    modalTitle.textContent = 'Edit favorite';
    saveLabel.textContent = 'Save changes';
    deleteBtn.hidden = false;
    titleInput.value = fav.title;
    urlInput.value = fav.url;
    setPendingCustomIcon(fav.customIcon || null);
    modalTabs.hidden = true; // can't switch kind while editing
    setModalTab('favorite');
    showModal();
  }

  function openEditFolderModal(id) {
    const folder = favorites.find((f) => f.id === id);
    if (!folder || kindOf(folder) !== 'folder') return;
    editingId = id;
    editingKind = 'folder';
    modalTitle.textContent = 'Edit folder';
    folderSaveLabel.textContent = 'Save changes';
    folderDeleteBtn.hidden = false;
    folderTitleInput.value = folder.title;
    setPendingFolderColor(folder.color || 'default');
    modalTabs.hidden = true;
    setModalTab('folder');
    showModal();
  }

  /** Switch between Favorite and Folder forms inside the same modal. */
  function setModalTab(tab) {
    const isFolder = tab === 'folder';
    favoriteForm.hidden = isFolder;
    folderForm.hidden = !isFolder;
    modalTabs.querySelectorAll('.modal-tab').forEach((btn) => {
      btn.setAttribute('aria-selected',
        btn.dataset.modalTab === tab ? 'true' : 'false');
    });
    setTimeout(() => {
      (isFolder ? folderTitleInput : titleInput).focus();
    }, 30);
  }

  function showModal() {
    clearError();
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    editingId = null;
    editingKind = 'favorite';
    pendingCustomIcon = null;
    pendingFolderColor = 'default';
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
    const MAX_INPUT_BYTES = 5 * 1024 * 1024;  // 5MB cap on raw input file
    const MAX_STORED_BYTES = 500 * 1024;      // 500KB cap on stored data URL
    if (file.size > MAX_INPUT_BYTES) {
      showIconError('Image is too large (max 5MB).');
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => showIconError('Could not read that file.');
    reader.onload = () => {
      const dataUrl = reader.result;
      // SVG: store directly (canvas-rasterizing SVG defeats its purpose),
      // but only if the file itself is small. Big SVGs are rare but
      // possible — reject before they hit storage.
      if (file.type === 'image/svg+xml') {
        if (typeof dataUrl === 'string' && dataUrl.length > MAX_STORED_BYTES) {
          showIconError('SVG is too detailed to store. Try a simpler image.');
          return;
        }
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
          const out = canvas.toDataURL('image/png');
          if (out.length > MAX_STORED_BYTES) {
            showIconError('Image still too large after resize. Try a smaller one.');
            return;
          }
          setPendingCustomIcon(out);
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

  // -----------------------------------------------------------------------
  // Folder form
  // -----------------------------------------------------------------------

  function setPendingFolderColor(colorId) {
    pendingFolderColor = colorId || 'default';
    renderFolderColorGrid();
  }

  function renderFolderColorGrid() {
    if (!folderColorGrid) return;
    folderColorGrid.innerHTML = '';
    for (const color of BUTTON_COLORS) {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'color-swatch';
      swatch.title = color.name;
      swatch.setAttribute('aria-checked',
        pendingFolderColor === color.id ? 'true' : 'false');
      if (color.id === 'default') {
        // 'default' = no color override; show a neutral diagonal stripe.
        swatch.style.background =
          'repeating-linear-gradient(45deg, var(--border) 0 4px, transparent 4px 8px)';
      } else {
        swatch.style.background = color.bg;
      }
      swatch.addEventListener('click', (e) => {
        e.preventDefault();
        setPendingFolderColor(color.id);
      });
      folderColorGrid.appendChild(swatch);
    }
  }

  // Tab clicks switch the modal between Favorite and Folder forms.
  modalTabs.addEventListener('click', (e) => {
    if (!(e.target instanceof HTMLElement)) return;
    const tab = e.target.closest('[data-modal-tab]');
    if (!tab) return;
    setModalTab(tab.dataset.modalTab);
  });

  folderForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = folderTitleInput.value.trim();
    if (!title) {
      folderTitleInput.focus();
      return;
    }
    const previous = JSON.parse(JSON.stringify(favorites));
    if (editingKind === 'folder' && editingId) {
      // Edit existing folder.
      const folder = favorites.find((f) => f.id === editingId);
      if (folder) {
        folder.title = title;
        folder.color = pendingFolderColor;
      }
    } else {
      // Create new (empty) folder at the end of the top level, just
      // before the trailing add tile.
      favorites.push({
        kind: 'folder',
        id: generateId(),
        title,
        color: pendingFolderColor,
        items: [],
        open: false,
      });
    }
    const result = await saveFavorites(favorites);
    if (!result.ok) {
      favorites = previous;
      alert('Could not save changes. Please try again.');
      return;
    }
    render();
    closeModal();
  });

  folderDeleteBtn.addEventListener('click', async () => {
    if (editingKind !== 'folder' || !editingId) return;
    const folder = favorites.find((f) => f.id === editingId);
    if (!folder) return;
    const itemCount = folder.items?.length || 0;

    // Empty folder — straightforward confirm.
    if (itemCount === 0) {
      if (!confirm(`Delete "${folder.title}"?`)) return;
      await applyFolderDelete(folder.id, /*releaseItems=*/false);
      return;
    }

    // Non-empty folder — three options. We use a custom prompt-like
    // dialog because confirm() only supports two buttons.
    showFolderDeleteDialog(folder);
  });

  /**
   * Apply a folder delete to the data model. If `releaseItems` is true,
   * the folder's children are moved to the top level at the folder's
   * position before the folder is removed, preserving order.
   */
  async function applyFolderDelete(folderId, releaseItems) {
    const previous = JSON.parse(JSON.stringify(favorites));
    const idx = favorites.findIndex((f) => f.id === folderId);
    if (idx === -1) return;
    const folder = favorites[idx];
    if (releaseItems && folder.items?.length) {
      // Replace the folder with its children, in order.
      favorites.splice(idx, 1, ...folder.items);
    } else {
      favorites.splice(idx, 1);
    }
    const result = await saveFavorites(favorites);
    if (!result.ok) {
      favorites = previous;
      alert('Could not save changes. Please try again.');
      return;
    }
    render();
    closeModal();
  }

  /**
   * Build and show the folder-delete dialog inline. Three buttons:
   * Cancel, Release contents (move children up, delete folder),
   * Delete with contents (remove everything).
   */
  function showFolderDeleteDialog(folder) {
    // Single inline implementation — created on demand so we don't carry
    // empty markup around when it's not in use.
    const overlay = document.createElement('div');
    overlay.className = 'modal';
    overlay.setAttribute('aria-hidden', 'false');
    overlay.innerHTML = `
      <div class="modal-backdrop" data-cancel></div>
      <div class="modal-card" role="dialog" aria-modal="true" style="max-width: 380px;">
        <h2 class="modal-title">Delete folder?</h2>
        <p style="margin: -8px 0 16px; color: var(--text-muted); font-size: 14px;">
          “${escapeHtml(folder.title)}” contains
          ${folder.items.length} item${folder.items.length === 1 ? '' : 's'}.
          What would you like to do with them?
        </p>
        <div class="modal-actions" style="flex-direction: column; gap: 8px; align-items: stretch;">
          <button type="button" class="btn btn-ghost" data-action="release"
                  style="justify-content: center;">
            Release contents to grid
          </button>
          <button type="button" class="btn btn-danger" data-action="delete-all"
                  style="justify-content: center;">
            Delete folder and contents
          </button>
          <button type="button" class="btn btn-ghost" data-cancel
                  style="justify-content: center;">
            Cancel
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.addEventListener('click', async (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      if (t.matches('[data-cancel]')) {
        close();
      } else if (t.dataset.action === 'release') {
        close();
        await applyFolderDelete(folder.id, /*releaseItems=*/true);
      } else if (t.dataset.action === 'delete-all') {
        close();
        await applyFolderDelete(folder.id, /*releaseItems=*/false);
      }
    });

    // Esc closes the dialog (overrides the main Esc handler since this
    // dialog is appended last in the DOM).
    const onEsc = (e) => {
      if (e.key === 'Escape') {
        close();
        document.removeEventListener('keydown', onEsc);
      }
    };
    document.addEventListener('keydown', onEsc);
  }

  /** Tiny HTML escape for the folder title in the inline dialog. */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

    // Snapshot favorites so we can roll back if the write fails (e.g.
    // Snapshot favorites so we can roll back if the write fails.
    // Deep clone since folders can contain favorites that we may mutate.
    const previous = JSON.parse(JSON.stringify(favorites));

    if (editingId) {
      // Find the favorite wherever it lives (top level or inside a folder).
      const loc = findItemById(editingId);
      if (loc && kindOf(loc.item) === 'favorite') {
        Object.assign(loc.item, {
          title,
          url: normalized,
          customIcon: pendingCustomIcon || null,
        });
      }
    } else {
      // New favorite — append at the top level.
      favorites.push({
        kind: 'favorite',
        id: generateId(),
        title,
        url: normalized,
        customIcon: pendingCustomIcon || null,
        createdAt: Date.now(),
      });
    }

    const result = await saveFavorites(favorites);
    if (!result.ok) {
      favorites = previous;
      const isQuota = /quota/i.test(result.error || '');
      showError(isQuota
        ? 'Out of storage space. Try removing custom icons from a few favorites first.'
        : 'Could not save. Please try again.');
      return;
    }
    render();
    closeModal();
  }

  async function handleDelete() {
    if (!editingId) return;
    const loc = findItemById(editingId);
    const fav = loc ? loc.item : null;
    const ok = confirm(`Delete "${fav ? fav.title : 'this favorite'}"?`);
    if (!ok) return;
    const previous = JSON.parse(JSON.stringify(favorites));
    removeItemById(editingId);
    const result = await saveFavorites(favorites);
    if (!result.ok) {
      favorites = previous;
      alert('Could not save changes. Please try again.');
      return;
    }
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

  // -----------------------------------------------------------------------
  // Data model helpers (favorites + folders)
  // -----------------------------------------------------------------------
  // Each item in `favorites` is either:
  //   { kind: 'favorite', id, title, url, customIcon, ... }
  //   { kind: 'folder',   id, title, color, items: [favorite, ...], open?: bool }
  // Folders never contain folders. Items missing a `kind` field are
  // treated as 'favorite' for back-compat with pre-folders data.

  function kindOf(item) {
    return item && item.kind === 'folder' ? 'folder' : 'favorite';
  }

  /** Find any item by id, returning {item, parent, index}. */
  function findItemById(id) {
    for (let i = 0; i < favorites.length; i++) {
      const item = favorites[i];
      if (item.id === id) return { item, parent: null, index: i };
      if (kindOf(item) === 'folder') {
        const childIdx = (item.items || []).findIndex((c) => c.id === id);
        if (childIdx !== -1) {
          return { item: item.items[childIdx], parent: item, index: childIdx };
        }
      }
    }
    return null;
  }

  /** Remove an item from wherever it lives; returns the item or null. */
  function removeItemById(id) {
    const loc = findItemById(id);
    if (!loc) return null;
    if (loc.parent) loc.parent.items.splice(loc.index, 1);
    else favorites.splice(loc.index, 1);
    return loc.item;
  }

  /**
   * Drop a favorite onto another favorite — merges them into a new
   * folder at the target's position. Both items become children.
   */
  function mergeIntoFolder(draggedId, targetId) {
    if (draggedId === targetId) return false;
    const targetIndex = favorites.findIndex((f) => f.id === targetId);
    const target = targetIndex !== -1 ? favorites[targetIndex] : null;
    const dragged = favorites.find((f) => f.id === draggedId);
    if (!target || !dragged) return false;
    if (kindOf(target) !== 'favorite' || kindOf(dragged) !== 'favorite') return false;
    const folder = {
      kind: 'folder',
      id: generateId(),
      title: 'New folder',
      color: 'default',
      items: [target, dragged],
      open: false,
    };
    favorites.splice(targetIndex, 1, folder);
    const draggedIndex = favorites.indexOf(dragged);
    if (draggedIndex !== -1) favorites.splice(draggedIndex, 1);
    return true;
  }

  /**
   * Move a favorite into an existing folder. If `beforeId` is provided
   * (the id of an existing child), the moved item is inserted before
   * that child; otherwise it's appended to the end.
   */
  function addToFolder(itemId, folderId, beforeId) {
    const folder = favorites.find((f) => f.id === folderId);
    if (!folder || kindOf(folder) !== 'folder') return false;
    if (itemId === folderId) return false;
    const item = removeItemById(itemId);
    if (!item || kindOf(item) !== 'favorite') return false;
    folder.items = folder.items || [];
    if (beforeId) {
      const idx = folder.items.findIndex((c) => c.id === beforeId);
      if (idx !== -1) {
        folder.items.splice(idx, 0, item);
        return true;
      }
    }
    folder.items.push(item);
    return true;
  }

  /** Move a favorite out of its folder, placing it after the folder. */
  function removeFromFolder(itemId) {
    const loc = findItemById(itemId);
    if (!loc || !loc.parent) return false;
    const folder = loc.parent;
    const folderIndex = favorites.indexOf(folder);
    const item = removeItemById(itemId);
    if (!item) return false;
    favorites.splice(folderIndex + 1, 0, item);
    return true;
  }

  /**
   * Mutate `favorites` in place, moving the dragged item to land
   * immediately before or after the target item. Top-level only.
   *
   * `side` is 'before' or 'after'. If the user drops on the left half
   * of the target, side='before' (dragged lands at target's position,
   * target shifts right). If on the right half, side='after' (dragged
   * lands one slot past the target).
   *
   * Care is taken with index shifting: when the dragged item lives
   * before the target in the array, removing it slides the target's
   * index down by one. We compute the insertion index *after* the
   * removal so the math always lands the item where the user expects.
   */
  function reorderFavorites(draggedId, targetId, side = 'before') {
    const fromIndex = favorites.findIndex((f) => f.id === draggedId);
    const toIndex   = favorites.findIndex((f) => f.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    if (fromIndex === toIndex) return;

    // Remove the dragged item first.
    const [moved] = favorites.splice(fromIndex, 1);

    // Recompute the target's index after the removal. If the dragged
    // item was originally to the left of the target, every index right
    // of it shifted down by one — including the target's.
    let insertAt = favorites.findIndex((f) => f.id === targetId);
    if (side === 'after') insertAt += 1;
    favorites.splice(insertAt, 0, moved);
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

  /**
   * Toggle every folder's open state in one batch. Useful when the
   * user has many folders and wants to either survey everything at
   * once or quickly tidy the dashboard.
   */
  async function setAllFoldersOpen(open) {
    const previous = JSON.parse(JSON.stringify(favorites));
    let mutated = false;
    for (const item of favorites) {
      if (kindOf(item) === 'folder' && item.open !== open) {
        item.open = open;
        mutated = true;
      }
    }
    if (!mutated) return;
    const result = await saveFavorites(favorites);
    if (!result.ok) { favorites = previous; return; }
    render();
  }

  expandAllBtn.addEventListener('click', () => setAllFoldersOpen(true));
  collapseAllBtn.addEventListener('click', () => setAllFoldersOpen(false));

  /**
   * Wipe all favorites and folders. Destructive and irreversible, so
   * the confirmation message names exact counts to prevent accidents.
   * Empty case (nothing to delete) just shows a brief notice rather
   * than a confirmation that would feel pointless.
   */
  clearAllBtn.addEventListener('click', async () => {
    let folderCount = 0;
    let favoriteCount = 0;
    for (const item of favorites) {
      if (kindOf(item) === 'folder') {
        folderCount++;
        favoriteCount += (item.items?.length || 0);
      } else {
        favoriteCount++;
      }
    }

    if (folderCount === 0 && favoriteCount === 0) {
      alert('Nothing to clear — your dashboard is already empty.');
      return;
    }

    const parts = [];
    if (favoriteCount > 0) {
      parts.push(`${favoriteCount} favorite${favoriteCount === 1 ? '' : 's'}`);
    }
    if (folderCount > 0) {
      parts.push(`${folderCount} folder${folderCount === 1 ? '' : 's'}`);
    }
    const message = `Delete all ${parts.join(' and ')}? This cannot be undone.`;
    if (!confirm(message)) return;

    const previous = JSON.parse(JSON.stringify(favorites));
    favorites = [];
    const result = await saveFavorites(favorites);
    if (!result.ok) {
      favorites = previous;
      alert('Could not clear favorites. Please try again.');
      return;
    }
    render();
  });

  settingsBtn.addEventListener('click', openSettingsModal);

  // -----------------------------------------------------------------------
  // Event wiring
  // -----------------------------------------------------------------------

  /**
   * Document-level drop handler. Tile drop handlers call stopPropagation,
   * so this only fires when the user dropped into empty space outside
   * any tile (between tiles, after the last tile, in the grid's bottom
   * margin, or anywhere else on the page that's not a UI control).
   * Behavior:
   *  - If the dragged item lives in a folder, hoist it out to top level.
   *  - In all cases, move the dragged item to the end of the top level.
   * This makes "drag out of folder + drop anywhere" a viable path —
   * users can quickly extract favorites by dragging them to empty space.
   */
  document.addEventListener('dragover', (e) => {
    // Only allow drop here if there's actually a drag in progress.
    if (currentDragId) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  });
  document.addEventListener('drop', async (e) => {
    if (!currentDragId) return;
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    if (!draggedId) return;

    const dragged = findItemById(draggedId);
    if (!dragged) return;

    const previous = JSON.parse(JSON.stringify(favorites));

    // Whether the item came from a folder or top level, the target
    // here is "end of top-level grid". removeItemById splices it out
    // of wherever it currently lives and returns the actual item.
    const item = removeItemById(draggedId);
    if (!item) return;
    favorites.push(item);

    const result = await saveFavorites(favorites);
    if (!result.ok) { favorites = previous; return; }
    render();
  });

  addBtn.addEventListener('click', openAddModal);
  emptyAddBtn.addEventListener('click', openAddModal);
  favoriteForm.addEventListener('submit', handleSubmit);
  deleteBtn.addEventListener('click', handleDelete);

  // Backdrop / cancel buttons (any element with data-close="true").
  modal.addEventListener('click', (e) => {
    if (e.target instanceof HTMLElement && e.target.dataset.close === 'true') {
      closeModal();
    }
  });

  // Esc closes whichever modal/popover is open.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!enginePopover.hidden) { closeEnginePopover(); return; }
    if (!colorMenu.hidden) { closeColorMenu(); return; }
    if (!modal.hidden) closeModal();
    else if (!settingsModal.hidden) closeSettingsModal();
  });

  // "/" focuses the search bar — the Twitter/GitHub convention. Skipped
  // when the user is already typing in an input (so they can type a
  // literal slash) or when any modal/popover is open.
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/') return;
    const target = e.target;
    const isTyping = target instanceof HTMLElement &&
      (target.tagName === 'INPUT' ||
       target.tagName === 'TEXTAREA' ||
       target.isContentEditable);
    if (isTyping) return;
    if (!modal.hidden || !settingsModal.hidden) return;
    if (!enginePopover.hidden || !colorMenu.hidden) return;
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
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
      renderEngineButton();
    }
  });

  // -----------------------------------------------------------------------
  // Initial load
  // -----------------------------------------------------------------------

  (async function init() {
    [favorites, settings] = await Promise.all([loadFavorites(), loadSettings()]);
    applySettings(settings);
    renderEngineButton();
    render();
  })();
})();
