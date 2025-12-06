// theme.js
// Handles: theme loading, saving, toggling, and syncing between desktop + mobile buttons.

(function () {
  const STORAGE_KEY = "forge_theme";

  // -----------------------------
  // 1. Load theme early (no flash)
  // -----------------------------
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }

  // Load saved theme or default to light
  const saved = localStorage.getItem(STORAGE_KEY);
  const initialTheme = saved === "dark" || saved === "light" ? saved : "light";
  applyTheme(initialTheme);

  // -----------------------------
  // 2. Toggle logic
  // -----------------------------
  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "light" ? "dark" : "light";
    applyTheme(next);
  }

  // -----------------------------
  // 3. Connect toggle buttons
  // -----------------------------
  function wireButton(btn) {
    if (!btn) return;
    btn.addEventListener("click", toggleTheme);
  }

  // Desktop toggle button
  wireButton(document.getElementById("themeToggleDesktop"));

  // Mobile toggle button
  wireButton(document.getElementById("themeToggleMobile"));

  // -----------------------------
  // 4. Expose toggle if needed
  // -----------------------------
  window.__forgeToggleTheme = toggleTheme;
})();
