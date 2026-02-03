// theme.js
// Light theme default on first visit, persist user preference

(function () {
  const STORAGE_KEY = "forge_theme";

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {}
  }

  function getInitialTheme() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "light" || saved === "dark") return saved;
    } catch {}

    // FIRST VISIT DEFAULT
    return "light";
  }

  function toggleTheme() {
    const current =
      document.documentElement.getAttribute("data-theme") || "light";
    applyTheme(current === "light" ? "dark" : "light");
  }

  // Apply immediately to prevent flash
  applyTheme(getInitialTheme());

  // Desktop toggle
  const desktopBtn = document.getElementById("themeToggleDesktop");
  if (desktopBtn) desktopBtn.addEventListener("click", toggleTheme);

  // Mobile toggle
  const mobileBtn = document.getElementById("themeToggleMobile");
  if (mobileBtn) mobileBtn.addEventListener("click", toggleTheme);

  // Optional external access
  window.__forgeToggleTheme = toggleTheme;
})();
