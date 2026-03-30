// theme.js
// Light theme default on first visit, persist user preference, sync desktop + mobile buttons.

(function () {
  const STORAGE_KEY = "forge_theme";

  function setPressed(el, isPressed) {
    if (!el) return;
    el.setAttribute("aria-pressed", isPressed ? "true" : "false");
  }

  function applyTheme(theme, { persist = true } = {}) {
    const t = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", t);

    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, t);
      } catch {}
    }

    // Keep both toggles in sync for accessibility
    const isDark = t === "dark";
    setPressed(document.getElementById("themeToggleDesktop"), isDark);
    setPressed(document.getElementById("themeToggleMobile"), isDark);
  }

  function getSavedTheme() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === "dark" || saved === "light" ? saved : null;
    } catch {
      return null;
    }
  }

  function getInitialTheme() {
    // Requirement: first visit defaults to light, then remember preference
    return getSavedTheme() || "light";
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    const next = current === "light" ? "dark" : "light";
    applyTheme(next, { persist: true });
  }

  // Apply ASAP (prevents flash)
  applyTheme(getInitialTheme(), { persist: false });

  // Wire buttons
  const desktopBtn = document.getElementById("themeToggleDesktop");
  if (desktopBtn) desktopBtn.addEventListener("click", toggleTheme);

  const mobileBtn = document.getElementById("themeToggleMobile");
  if (mobileBtn) mobileBtn.addEventListener("click", toggleTheme);

  // Optional external access
  window.__forgeToggleTheme = toggleTheme;
  window.__forgeApplyTheme = (t) => applyTheme(t, { persist: true });
})();
