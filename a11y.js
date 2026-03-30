// a11y.js
// Accessibility toolbar: font size +/-/reset, high contrast, reduced motion (persisted)

(function () {
  const htmlEl = document.documentElement;
  const bodyEl = document.body;

  const btnFontInc = document.getElementById("a11yFontIncrease");
  const btnFontDec = document.getElementById("a11yFontDecrease");
  const btnFontReset = document.getElementById("a11yFontReset");
  const btnContrast = document.getElementById("a11yContrast");
  const btnMotion = document.getElementById("a11yMotion");

  // If this page doesn't have the toolbar, bail cleanly.
  if (!btnFontInc && !btnFontDec && !btnFontReset && !btnContrast && !btnMotion) return;

  const STORAGE_KEY = "forge_a11y";
  const defaults = {
    fontSizePercent: 100,
    highContrast: false,
    reduceMotion: false,
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...defaults };
      const parsed = JSON.parse(raw);
      return { ...defaults, ...parsed };
    } catch {
      return { ...defaults };
    }
  }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }

  let state = loadState();

  function applyAll() {
    // Font size
    htmlEl.style.fontSize = state.fontSizePercent + "%";

    // High contrast
    if (state.highContrast) {
      htmlEl.setAttribute("data-contrast", "high");
      if (btnContrast) btnContrast.setAttribute("aria-pressed", "true");
    } else {
      htmlEl.removeAttribute("data-contrast");
      if (btnContrast) btnContrast.setAttribute("aria-pressed", "false");
    }

    // Reduced motion
    if (state.reduceMotion) {
      bodyEl.classList.add("reduce-motion");
      if (btnMotion) btnMotion.setAttribute("aria-pressed", "true");
    } else {
      bodyEl.classList.remove("reduce-motion");
      if (btnMotion) btnMotion.setAttribute("aria-pressed", "false");
    }
  }

  function clampFont(n) {
    // Keep it usable
    if (n < 80) return 80;
    if (n > 150) return 150;
    return n;
  }

  function increaseFont() {
    state.fontSizePercent = clampFont(state.fontSizePercent + 10);
    saveState(state);
    applyAll();
  }

  function decreaseFont() {
    state.fontSizePercent = clampFont(state.fontSizePercent - 10);
    saveState(state);
    applyAll();
  }

  function resetFont() {
    state.fontSizePercent = 100;
    saveState(state);
    applyAll();
  }

  function toggleContrast() {
    state.highContrast = !state.highContrast;
    saveState(state);
    applyAll();
  }

  function toggleMotion() {
    state.reduceMotion = !state.reduceMotion;
    saveState(state);
    applyAll();
  }

  if (btnFontInc) btnFontInc.addEventListener("click", increaseFont);
  if (btnFontDec) btnFontDec.addEventListener("click", decreaseFont);
  if (btnFontReset) btnFontReset.addEventListener("click", resetFont);
  if (btnContrast) btnContrast.addEventListener("click", toggleContrast);
  if (btnMotion) btnMotion.addEventListener("click", toggleMotion);

  // If user has never saved settings, respect OS reduced motion on first run.
  const hasSaved = (() => {
    try {
      return !!localStorage.getItem(STORAGE_KEY);
    } catch {
      return false;
    }
  })();

  const prefersReducedMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!hasSaved && prefersReducedMotion) {
    state.reduceMotion = true;
    saveState(state);
  }

  applyAll();
})();
