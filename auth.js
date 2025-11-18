// auth.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";

/**
 * IMPORTANT:
 * 1) Use the SAME config as your "theforge" Firebase project.
 * 2) This app + auth are shared by prayerrequests.html (and later theforge.html).
 */
const firebaseConfig = {
  apiKey: "YOUR_API_KEY_HERE",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// 🔑 Universal invite code (change to whatever you want)
const INVITE_CODE = "FORGE2025";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Small helper object exposed globally + as module export
const forgeAuth = {
  auth,
  currentUser: null,
  listeners: [],
  onAuthChange(callback) {
    if (typeof callback === "function") {
      this.listeners.push(callback);
      // Fire immediately if we already have a user
      if (this.currentUser !== undefined) {
        callback(this.currentUser);
      }
    }
  },
  async signOut() {
    await signOut(auth);
  }
};

export { forgeAuth };
window.forgeAuth = forgeAuth;

// ============ BASIC AUTH UI (Overlay + Forms) ============

function injectAuthStyles() {
  const style = document.createElement("style");
  style.textContent = `
    #authOverlay {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at 0 0, rgba(0,0,0,0.65), rgba(0,0,0,0.92));
      backdrop-filter: blur(18px);
      z-index: 999;
    }

    #authOverlay.hidden {
      display: none;
    }

    .auth-card {
      width: 100%;
      max-width: 420px;
      border-radius: 18px;
      background: var(--bg-card, #020617);
      border: 1px solid var(--border-subtle, rgba(0,255,200,0.3));
      box-shadow: 0 0 30px rgba(0,0,0,0.9);
      padding: 1.4rem 1.4rem 1.2rem;
      color: var(--text-main, #e5f2ff);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .auth-card-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }

    .auth-card-title {
      font-size: 1rem;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }

    .auth-card-sub {
      font-size: 0.78rem;
      color: var(--text-soft, #7a8799);
      max-width: 220px;
      text-align: right;
    }

    .auth-toggle-row {
      display: flex;
      border-radius: 999px;
      border: 1px solid var(--border-subtle, rgba(0,255,200,0.3));
      overflow: hidden;
      margin-bottom: 0.8rem;
      font-size: 0.76rem;
      text-transform: uppercase;
      letter-spacing: 0.14em;
    }

    .auth-toggle-btn {
      flex: 1;
      padding: 0.45rem 0.3rem;
      text-align: center;
      cursor: pointer;
      background: transparent;
      border: none;
      color: var(--text-soft, #7a8799);
    }

    .auth-toggle-btn.active {
      background: radial-gradient(circle at 0 0, var(--accent, #00ffd0), var(--accent-alt, #00aaff));
      color: #020409;
      font-weight: 600;
    }

    .auth-form {
      display: grid;
      gap: 0.55rem;
      margin-bottom: 0.6rem;
    }

    .auth-field {
      display: grid;
      gap: 0.25rem;
    }

    .auth-label {
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.13em;
      color: var(--text-soft, #7a8799);
    }

    .auth-input {
      border-radius: 10px;
      border: 1px solid var(--border-subtle, rgba(0,255,200,0.3));
      background: var(--bg-elevated, #020617);
      padding: 0.5rem 0.7rem;
      font-size: 0.9rem;
      color: var(--text-main, #e5f2ff);
      outline: none;
    }

    :root[data-theme="light"] .auth-input {
      background: #ffffff;
      color: var(--text-main, #071420);
    }

    .auth-input:focus {
      border-color: var(--accent-soft, rgba(0,255,200,0.6));
      box-shadow: 0 0 12px rgba(0,255,200,0.45);
    }

    .auth-btn {
      margin-top: 0.5rem;
      width: 100%;
      border-radius: 999px;
      border: none;
      padding: 0.55rem;
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.18em;
      background: radial-gradient(circle at 0 0, var(--accent, #00ffd0), var(--accent-alt, #00aaff));
      color: #020409;
      cursor: pointer;
      box-shadow: 0 0 18px rgba(0,255,200,0.5);
    }

    .auth-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 0 24px rgba(0,255,200,0.7);
    }

    .auth-error {
      font-size: 0.78rem;
      color: var(--danger, #ff4b4b);
      min-height: 1em;
      margin-top: 0.2rem;
    }

    .auth-footnote {
      margin-top: 0.4rem;
      font-size: 0.74rem;
      color: var(--text-soft, #7a8799);
    }

    .auth-footnote span.code {
      font-family: "Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      padding: 0.1rem 0.4rem;
      border-radius: 999px;
      border: 1px solid var(--border-subtle, rgba(0,255,200,0.3));
      background: rgba(0,0,0,0.25);
    }
  `;
  document.head.appendChild(style);
}

function buildAuthOverlay() {
  injectAuthStyles();

  const overlay = document.createElement("div");
  overlay.id = "authOverlay";
  overlay.innerHTML = `
    <div class="auth-card">
      <div class="auth-card-header">
        <div>
          <div class="auth-card-title">Access The Forge</div>
        </div>
        <div class="auth-card-sub">
          Invite-only access with a shared, non-expiring code.
        </div>
      </div>

      <div class="auth-toggle-row">
        <button type="button" class="auth-toggle-btn active" data-mode="signin">Sign In</button>
        <button type="button" class="auth-toggle-btn" data-mode="signup">Create Account</button>
      </div>

      <form id="authSignInForm" class="auth-form">
        <div class="auth-field">
          <label class="auth-label" for="signinEmail">Email</label>
          <input id="signinEmail" type="email" class="auth-input" autocomplete="email" required />
        </div>
        <div class="auth-field">
          <label class="auth-label" for="signinPassword">Password</label>
          <input id="signinPassword" type="password" class="auth-input" autocomplete="current-password" required />
        </div>
        <button type="submit" class="auth-btn">Sign In</button>
        <div class="auth-error" id="authError"></div>
        <div class="auth-footnote">
          Already invited? Use the email and password you created when you first joined.
        </div>
      </form>

      <form id="authSignUpForm" class="auth-form" style="display:none;">
        <div class="auth-field">
          <label class="auth-label" for="signupEmail">Email</label>
          <input id="signupEmail" type="email" class="auth-input" autocomplete="email" required />
        </div>
        <div class="auth-field">
          <label class="auth-label" for="signupPassword">Password</label>
          <input id="signupPassword" type="password" class="auth-input" autocomplete="new-password" required />
        </div>
        <div class="auth-field">
          <label class="auth-label" for="signupPassword2">Confirm Password</label>
          <input id="signupPassword2" type="password" class="auth-input" autocomplete="new-password" required />
        </div>
        <div class="auth-field">
          <label class="auth-label" for="signupInvite">Invite Code</label>
          <input id="signupInvite" type="text" class="auth-input" placeholder="Enter the shared Forge invite code" required />
        </div>
        <button type="submit" class="auth-btn">Create Account</button>
        <div class="auth-error" id="authErrorSignup"></div>
        <div class="auth-footnote">
          Use the shared code: <span class="code">${INVITE_CODE}</span><br/>
          This code can be rotated later if needed.
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);

  const toggleButtons = overlay.querySelectorAll(".auth-toggle-btn");
  const signInForm = overlay.querySelector("#authSignInForm");
  const signUpForm = overlay.querySelector("#authSignUpForm");
  const errorSignIn = overlay.querySelector("#authError");
  const errorSignUp = overlay.querySelector("#authErrorSignup");

  function setMode(mode) {
    toggleButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    });
    if (mode === "signin") {
      signInForm.style.display = "grid";
      signUpForm.style.display = "none";
      errorSignIn.textContent = "";
      errorSignUp.textContent = "";
    } else {
      signInForm.style.display = "none";
      signUpForm.style.display = "grid";
      errorSignIn.textContent = "";
      errorSignUp.textContent = "";
    }
  }

  toggleButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      setMode(btn.dataset.mode);
    });
  });

  signInForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorSignIn.textContent = "";

    const email = document.getElementById("signinEmail").value.trim();
    const password = document.getElementById("signinPassword").value;

    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged will hide overlay
    } catch (err) {
      console.error(err);
      errorSignIn.textContent = "Unable to sign in. Check your credentials and try again.";
    }
  });

  signUpForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorSignUp.textContent = "";

    const email = document.getElementById("signupEmail").value.trim();
    const password = document.getElementById("signupPassword").value;
    const password2 = document.getElementById("signupPassword2").value;
    const invite = document.getElementById("signupInvite").value.trim();

    if (password !== password2) {
      errorSignUp.textContent = "Passwords do not match.";
      return;
    }

    if (invite !== INVITE_CODE) {
      errorSignUp.textContent = "Invalid invite code.";
      return;
    }

    try {
      await createUserWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged will hide overlay
    } catch (err) {
      console.error(err);
      errorSignUp.textContent = "Unable to create account. Try a different email or try again later.";
    }
  });

  return overlay;
}

const overlayEl = buildAuthOverlay();

// Keep overlay in sync with auth state
onAuthStateChanged(auth, (user) => {
  forgeAuth.currentUser = user;
  forgeAuth.listeners.forEach((cb) => {
    try {
      cb(user);
    } catch (e) {
      console.error("forgeAuth listener error:", e);
    }
  });

  if (user) {
    overlayEl.classList.add("hidden");
  } else {
    overlayEl.classList.remove("hidden");
  }

  // Optional: update a nav/account status element if one exists
  const authStatus = document.getElementById("authStatus");
  if (authStatus) {
    if (user) {
      authStatus.textContent = `Signed in as ${user.email || user.uid}`;
    } else {
      authStatus.textContent = "Sign in with the invite-only Forge account to submit and manage requests.";
    }
  }
});
