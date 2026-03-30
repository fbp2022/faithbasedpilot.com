// mobile-nav.js — drawer menu + sync with header hamburger and bottom “More”
(function () {
  const hamburger = document.getElementById("hamburgerButton");
  const mobileRoot = document.getElementById("mobileNav");
  const closeBtn = document.getElementById("mobileNavClose");
  const bottomMore = document.getElementById("bottomNavMore");
  const backdrop = mobileRoot ? mobileRoot.querySelector(".mobile-nav-backdrop") : null;

  if (!mobileRoot) return;

  const body = document.body;

  function getPanel() {
    return document.getElementById("mobileNavPanel");
  }

  function getFirstFocusable() {
    const panel = getPanel();
    if (!panel) return null;
    return panel.querySelector('a, button, [tabindex]:not([tabindex="-1"])');
  }

  function setOpen(isOpen) {
    mobileRoot.classList.toggle("open", isOpen);
    mobileRoot.setAttribute("aria-hidden", isOpen ? "false" : "true");

    if (hamburger) {
      hamburger.classList.toggle("is-open", isOpen);
      hamburger.setAttribute("aria-expanded", isOpen ? "true" : "false");
      hamburger.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
    }

    body.classList.toggle("no-scroll", isOpen);

    if (isOpen) {
      const first = getFirstFocusable();
      if (first) first.focus();
    } else if (hamburger && document.activeElement && mobileRoot.contains(document.activeElement)) {
      hamburger.focus();
    }
  }

  function isOpen() {
    return mobileRoot.classList.contains("open");
  }

  function toggle() {
    setOpen(!isOpen());
  }

  if (hamburger) {
    hamburger.addEventListener("click", function (e) {
      e.preventDefault();
      toggle();
    });
  }

  if (bottomMore) {
    bottomMore.addEventListener("click", function (e) {
      e.preventDefault();
      setOpen(true);
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", function () {
      setOpen(false);
    });
  }

  if (backdrop) {
    backdrop.addEventListener("click", function () {
      setOpen(false);
    });
  }

  mobileRoot.addEventListener("click", function (e) {
    const t = e.target;
    if (!t) return;
    if (t.closest("a") || (t.closest("button") && t.closest(".mobile-nav-panel"))) {
      setOpen(false);
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && isOpen()) {
      setOpen(false);
    }
  });

  var BREAKPOINT_PX = 840;
  window.addEventListener("resize", function () {
    if (window.innerWidth > BREAKPOINT_PX && isOpen()) {
      setOpen(false);
    }
  });

  window.__forgeOpenMobileNav = function () {
    setOpen(true);
  };
  window.__forgeCloseMobileNav = function () {
    setOpen(false);
  };
})();
