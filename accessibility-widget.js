// accessibility-widget.js
// Global accessibility controls for The Forge
// - Font size (80%–150%)
// - High contrast mode
// - Reduced motion
// - Remembers settings in localStorage

(function () {
  const STORAGE_KEY = "forge_a11y_settings";

  function loadSettings() {
    try {// accessibility-widget.js
// Unified accessibility controls with persistence

(function () {
  const STORAGE_KEY = "forge_a11y";

  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function save(update) {
    try {
      const current = load();
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...current, ...update })
      );
    } catch {}
  }

  const html = document.documentElement;
  const body = document.body;

  const btnInc = document.getElementById("a11yFontIncrease");
  const btnDec = document.getElementById("a11yFontDecrease");
  const btnReset = document.getElementById("a11yFontReset");
  const btnContrast = document.getElementById("a11yContrast");
  const btnMotion = document.getElementById("a11yMotion");

  const state = load();

  // Font size
  let fontSize = state.fontSize || 100;
  html.style.fontSize = fontSize + "%";

  // Contrast
  if (state.highContrast) {
    html.setAttribute("data-contrast", "high");
    btnContrast?.setAttribute("aria-pressed", "true");
  }

  // Motion
  if (state.reduceMotion) {
    body.classList.add("reduce-motion");
    btnMotion?.setAttribute("aria-pressed", "true");
  }

  btnInc?.addEventListener("click", () => {
    if (fontSize < 150) {
      fontSize += 10;
      html.style.fontSize = fontSize + "%";
      save({ fontSize });
    }
  });

  btnDec?.addEventListener("click", () => {
    if (fontSize > 80) {
      fontSize -= 10;
      html.style.fontSize = fontSize + "%";
      save({ fontSize });
    }
  });

  btnReset?.addEventListener("click", () => {
    fontSize = 100;
    html.style.fontSize = "100%";
    save({ fontSize });
  });

  btnContrast?.addEventListener("click", () => {
    const active = html.getAttribute("data-contrast") === "high";
    html.toggleAttribute("data-contrast", !active);
    btnContrast.setAttribute("aria-pressed", String(!active));
    save({ highContrast: !active });
  });

  btnMotion?.addEventListener("click", () => {
    const active = body.classList.contains("reduce-motion");
    body.classList.toggle("reduce-motion", !active);
    btnMotion.setAttribute("aria-pressed", String(!active));
    save({ reduceMotion: !active });
  });
})();

      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveSettings(partial) {
    try {
      const current = loadSettings();
      const next = { ...current, ...partial };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // fail silently; don’t break the page
    }
  }

  const htmlEl = document.documentElement;
  const bodyEl = document.body;

  // Core widget elements
  const widget = document.querySelector(".accessibility-toolbar");
  if (!widget || !htmlEl || !bodyEl) return; // nothing to do on pages without the toolbar

  const launcher = document.getElementById("a11yLauncher");
  const panel = widget.querySelector(".accessibility-toolbar-inner");

  const btnFontInc = document.getElementById("a11yFontIncrease");
  const btnFontDec = document.getElementById("a11yFontDecrease");
  const btnFontReset = document.getElementById("a11yFontReset");
  const btnContrast = document.getElementById("a11yContrast");
  const btnMotion = document.getElementById("a11yMotion");

  // ----- INITIAL STATE FROM STORAGE / PREFS -----
  const stored = loadSettings();

  let fontSizePercent =
    typeof stored.fontSize === "number" ? stored.fontSize : 100;

  function applyFontSize() {
    htmlEl.style.fontSize = fontSizePercent + "%";
  }

  applyFontSize();

  // High contrast
  if (stored.highContrast) {
    htmlEl.setAttribute("data-contrast", "high");
    if (btnContrast) btnContrast.setAttribute("aria-pressed", "true");
  }

  // Reduced motion (respect prefers-reduced-motion + stored value)
  const prefersReducedMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const shouldReduceMotion =
    stored.reduceMotion === true || (stored.reduceMotion == null && prefersReducedMotion);

  if (shouldReduceMotion) {
    bodyEl.classList.add("reduce-motion");
    if (btnMotion) btnMotion.setAttribute("aria-pressed", "true");
  }

  // ----- FONT SIZE CONTROLS -----
  function increaseFont() {
    if (fontSizePercent < 150) {
      fontSizePercent += 10;
      applyFontSize();
      saveSettings({ fontSize: fontSizePercent });
    }
  }

  function decreaseFont() {
    if (fontSizePercent > 80) {
      fontSizePercent -= 10;
      applyFontSize();
      saveSettings({ fontSize: fontSizePercent });
    }
  }

  function resetFont() {
    fontSizePercent = 100;
    applyFontSize();
    saveSettings({ fontSize: fontSizePercent });
  }

  if (btnFontInc) btnFontInc.addEventListener("click", increaseFont);
  if (btnFontDec) btnFontDec.addEventListener("click", decreaseFont);
  if (btnFontReset) btnFontReset.addEventListener("click", resetFont);

  // ----- CONTRAST TOGGLE -----
  function toggleContrast() {
    const isHigh = htmlEl.getAttribute("data-contrast") === "high";
    if (isHigh) {
      htmlEl.removeAttribute("data-contrast");
      if (btnContrast) btnContrast.setAttribute("aria-pressed", "false");
      saveSettings({ highContrast: false });
    } else {
      htmlEl.setAttribute("data-contrast", "high");
      if (btnContrast) btnContrast.setAttribute("aria-pressed", "true");
      saveSettings({ highContrast: true });
    }
  }

  if (btnContrast) btnContrast.addEventListener("click", toggleContrast);

  // ----- MOTION TOGGLE -----
  function toggleMotion() {
    const isReduced = bodyEl.classList.contains("reduce-motion");
    if (isReduced) {
      bodyEl.classList.remove("reduce-motion");
      if (btnMotion) btnMotion.setAttribute("aria-pressed", "false");
      saveSettings({ reduceMotion: false });
    } else {
      bodyEl.classList.add("reduce-motion");
      if (btnMotion) btnMotion.setAttribute("aria-pressed", "true");
      saveSettings({ reduceMotion: true });
    }
  }

  if (btnMotion) btnMotion.addEventListener("click", toggleMotion);

  // ----- LAUNCHER OPEN/CLOSE -----
  if (launcher && panel) {
    function setOpen(isOpen) {
      widget.classList.toggle("open", isOpen);
      launcher.setAttribute("aria-expanded", isOpen ? "true" : "false");

      if (isOpen) {
        // focus first button inside the panel for keyboard users
        const firstBtn = panel.querySelector("button");
        if (firstBtn) firstBtn.focus();
      }
    }

    launcher.addEventListener("click", () => {
      const isOpen = !widget.classList.contains("open");
      setOpen(isOpen);
    });

    // Click outside to close
    document.addEventListener("click", (e) => {
      if (!widget.classList.contains("open")) return;
      if (!widget.contains(e.target)) {
        setOpen(false);
      }
    });

    // Esc closes when open
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && widget.classList.contains("open")) {
        setOpen(false);
        launcher.focus();
      }
    });
  }
})();
