/* ================== ACCESSIBILITY WIDGET + TOOLBAR ================== */

/* Floating accessibility widget button */
.a11y-widget {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  z-index: 901; /* above content, below header/mobile nav/auth */
}

.a11y-widget-btn {
  width: 52px;
  height: 52px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-subtle);
  background: var(--bg-card);
  color: var(--text-main);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-strong);
  transition: transform var(--transition-fast), box-shadow var(--transition-fast), background var(--transition-fast);
  font-size: 1.25rem;
  line-height: 1;
}

.a11y-widget-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 0 22px rgba(0, 116, 255, 0.22);
  background: var(--bg-card-soft);
}
:root[data-theme="dark"] .a11y-widget-btn:hover {
  box-shadow: 0 0 22px rgba(0, 255, 200, 0.35);
}

.a11y-widget-btn:active {
  transform: translateY(0);
}

/* The toolbar itself (hidden by default) */
.accessibility-toolbar {
  position: fixed;
  bottom: 1rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 900; /* below header + mobile icon nav + auth is 999 */
  max-width: 1120px;
  width: calc(100% - 2rem);

  /* hidden state */
  opacity: 0;
  pointer-events: none;
  transform: translateX(-50%) translateY(10px);
  transition: opacity var(--transition-med), transform var(--transition-med);
}

.accessibility-toolbar.open {
  opacity: 1;
  pointer-events: auto;
  transform: translateX(-50%) translateY(0);
}

.accessibility-toolbar-inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 0.9rem;
  border-radius: var(--radius-full);
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-strong);
  font-size: 0.8rem;
}

.accessibility-toolbar-label {
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-soft);
  white-space: nowrap;
}

.a11y-button-group {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-left: auto;
}

.a11y-btn {
  border-radius: var(--radius-full);
  border: 1px solid var(--border-subtle);
  padding: 0.25rem 0.7rem;
  background: var(--bg-elevated);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.13em;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast), transform var(--transition-fast);
}

.a11y-btn:hover {
  background: var(--bg-card-soft);
  border-color: var(--accent-soft);
  color: var(--text-main);
  transform: translateY(-1px);
}

.a11y-btn[aria-pressed="true"] {
  background: radial-gradient(circle at 0 0, var(--accent), var(--accent-alt));
  color: #020409;
  border-color: transparent;
}

/* Small screens: toolbar becomes a card, widget stays bottom-right */
@media (max-width: 700px) {
  .accessibility-toolbar-inner { border-radius: var(--radius-md); }
  .accessibility-toolbar-label { width: 100%; }
  .a11y-button-group { margin-left: 0; }
}
