// ACCESSIBILITY TOOLBAR LOGIC
(function () {
  const htmlEl = document.documentElement;
  const bodyEl = document.body;

  const widget = document.querySelector('.accessibility-toolbar');
  const launcher = document.getElementById('a11yLauncher');
  const panel = document.querySelector('.accessibility-toolbar-inner');

  const btnFontInc = document.getElementById('a11yFontIncrease');
  const btnFontDec = document.getElementById('a11yFontDecrease');
  const btnFontReset = document.getElementById('a11yFontReset');
  const btnContrast = document.getElementById('a11yContrast');
  const btnMotion = document.getElementById('a11yMotion');

  let fontSizePercent = 100;

  function applyFontSize() {
    htmlEl.style.fontSize = fontSizePercent + '%';
  }

  function increaseFont() {
    if (fontSizePercent < 150) {
      fontSizePercent += 10;
      applyFontSize();
    }
  }

  function decreaseFont() {
    if (fontSizePercent > 80) {
      fontSizePercent -= 10;
      applyFontSize();
    }
  }

  function resetFont() {
    fontSizePercent = 100;
    applyFontSize();
  }

  function toggleContrast() {
    const isHigh = htmlEl.getAttribute('data-contrast') === 'high';
    if (isHigh) {
      htmlEl.removeAttribute('data-contrast');
      btnContrast.setAttribute('aria-pressed', 'false');
    } else {
      htmlEl.setAttribute('data-contrast', 'high');
      btnContrast.setAttribute('aria-pressed', 'true');
    }
  }

  function toggleMotion() {
    const isReduced = bodyEl.classList.contains('reduce-motion');
    if (isReduced) {
      bodyEl.classList.remove('reduce-motion');
      btnMotion.setAttribute('aria-pressed', 'false');
    } else {
      bodyEl.classList.add('reduce-motion');
      btnMotion.setAttribute('aria-pressed', 'true');
    }
  }

  // Wire up controls
  if (btnFontInc) btnFontInc.addEventListener('click', increaseFont);
  if (btnFontDec) btnFontDec.addEventListener('click', decreaseFont);
  if (btnFontReset) btnFontReset.addEventListener('click', resetFont);
  if (btnContrast) btnContrast.addEventListener('click', toggleContrast);
  if (btnMotion) btnMotion.addEventListener('click', toggleMotion);

  // Respect prefers-reduced-motion by default
  const prefersReducedMotion =
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (prefersReducedMotion) {
    bodyEl.classList.add('reduce-motion');
    if (btnMotion) btnMotion.setAttribute('aria-pressed', 'true');
  }

  // Launcher open/close logic
  if (widget && launcher && panel) {
    function setOpen(isOpen) {
      widget.classList.toggle('open', isOpen);
      launcher.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (isOpen) {
        // focus first button inside panel for keyboard users
        const firstBtn = panel.querySelector('button');
        if (firstBtn) firstBtn.focus();
      }
    }

    launcher.addEventListener('click', () => {
      const isOpen = !widget.classList.contains('open');
      setOpen(isOpen);
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (!widget.classList.contains('open')) return;
      if (!widget.contains(e.target)) {
        setOpen(false);
      }
    });

    // Keyboard: Esc closes when open
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && widget.classList.contains('open')) {
        setOpen(false);
        launcher.focus();
      }
    });
  }
})();
