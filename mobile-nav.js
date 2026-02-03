// mobile-nav.js
// Handles the mobile hamburger + opaque overlay menu
// - Opens/closes mobile nav
// - Locks background scroll while open
// - Closes on link click, outside click, ESC, and on desktop breakpoint

(function () {
  const hamburger = document.getElementById("hamburgerButton");
  const mobileNav = document.getElementById("mobileNav");

  if (!hamburger || !mobileNav) return;

  const body = document.body;

  // Optional: first focusable link inside mobile menu for accessibility
  function getFirstFocusableInMenu() {
    return mobileNav.querySelector('a, button, [tabindex]:not([tabindex="-1"])');
  }

  function setOpen(isOpen) {
    mobileNav.classList.toggle("open", isOpen);
    hamburger.classList.toggle("is-open", isOpen);

    hamburger.setAttribute("aria-expanded", isOpen ? "true" : "false");
    mobileNav.setAttribute("aria-hidden", isOpen ? "false" : "true");

    body.classList.toggle("no-scroll", isOpen);

    if (isOpen) {
      const first = getFirstFocusableInMenu();
      if (first) first.focus();
    } else {
      hamburger.focus();
    }
  }

  function isOpen() {
    return mobileNav.classList.contains("open");
  }

  function toggle() {
    setOpen(!isOpen());
  }

  // Click hamburger
  hamburger.addEventListener("click", (e) => {
    e.preventDefault();
    toggle();
  });

  // Close when any link inside menu is clicked
  mobileNav.addEventListener("click", (e) => {
    const target = e.target;
    if (!target) return;

    // If user clicks a link/button inside the menu, close it
    const clickedLink = target.closest("a");
    const clickedButton = target.closest("button");

    if (clickedLink || clickedButton) {
      setOpen(false);
    }
  });

  // ESC closes
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) {
      setOpen(false);
    }
  });

  // If viewport grows past breakpoint, ensure menu is closed
  // (Match your CSS breakpoint for .nav-links hidden / hamburger shown)
  const BREAKPOINT_PX = 840;
  window.addEventListener("resize", () => {
    if (window.innerWidth > BREAKPOINT_PX && isOpen()) {
      setOpen(false);
    }
  });

  // Expose helpers (optional)
  window.__forgeOpenMobileNav = () => setOpen(true);
  window.__forgeCloseMobileNav = () => setOpen(false);
})();
