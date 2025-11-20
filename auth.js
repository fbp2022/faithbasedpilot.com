// auth.js
// Handles Firebase auth, invite-code gated signup, profiles, and prayer requests.
// Include this in your HTML files with:
//   <script type="module" src="auth.js"></script>

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
  serverTimestamp,
  onSnapshot,
  deleteDoc,
  updateDoc,
  increment,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ==============================
   1. FIREBASE INIT
   ============================== */

// Firebase Config
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCMoC0EjB83EDALTMPiGJNSdyRajJO5mBs",
  authDomain: "theforge-2e7bb.firebaseapp.com",
  projectId: "theforge-2e7bb",
  storageBucket: "theforge-2e7bb.firebasestorage.app",
  messagingSenderId: "463141276936",
  appId: "1:463141276936:web:978172363e020b9f09f0bd",
  measurementId: "G-333M1YRYLR"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// global-ish state
let currentUser = null;

// Tristan (the only delete-admin, must match rules)
const TRISTAN_UID = "1zs1eFu7K8cWKRZE7k7TwPCW3X32";

/* ==============================
   2. DOM HELPERS
   ============================== */

function $(id) {
  return document.getElementById(id);
}

function showEl(el) {
  if (!el) return;
  el.classList.add("is-open");
  el.removeAttribute("hidden");
}

function hideEl(el) {
  if (!el) return;
  el.classList.remove("is-open");
  el.setAttribute("hidden", "true");
}

// Small helper to show text status (like “Signed in as X”)
function updateAuthStatusUI() {
  const statusEl = $("authStatus");
  const logoutBtn = $("logoutBtn");

  if (!statusEl && !logoutBtn) return; // page might not have them

  if (currentUser) {
    if (statusEl) {
      const name = currentUser.displayName || currentUser.email || "Signed in";
      statusEl.textContent = `Signed in as ${name}`;
    }
    if (logoutBtn) logoutBtn.style.display = "inline-flex";
  } else {
    if (statusEl) statusEl.textContent = "Not signed in";
    if (logoutBtn) logoutBtn.style.display = "none";
  }
}

/* ==============================
   3. SIGNUP + LOGIN HANDLERS
   ============================== */

async function handleSignupSubmit(event) {
  event.preventDefault();
  const nameInput = $("signupName");
  const emailInput = $("signupEmail");
  const passInput = $("signupPassword");
  const pass2Input = $("signupPassword2");
  const inviteInput = $("signupInvite");

  if (!nameInput || !emailInput || !passInput || !pass2Input || !inviteInput) return;

  const displayName = nameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passInput.value;
  const password2 = pass2Input.value;
  const invite = inviteInput.value.trim();

  if (!displayName || !email || !password || !password2 || !invite) {
    alert("Please fill in all fields.");
    return;
  }

  if (password !== password2) {
    alert("Passwords do not match.");
    return;
  }

  if (password.length < 8) {
    alert("Password must be at least 8 characters.");
    return;
  }

  try {
    // Create Auth account
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const user = cred.user;

    // Update displayName in Auth profile
    await updateProfile(user, { displayName });

    // Create profile document
    // Your Firestore rules use request.resource.data.invitecode to validate
    const profRef = doc(db, "profiles", user.uid);
    await setDoc(
      profRef,
      {
        displayName,
        email,
        role: "member",
        createdAt: serverTimestamp(),
        invitecode: invite, // used by security rules
      },
      { merge: true }
    );

    hideEl($("signupModal"));
    alert("Account created. You are now signed in.");
  } catch (err) {
    console.error("Signup error:", err);
    alert(
      err && err.message
        ? err.message
        : "Could not create account. The invite code may be incorrect or configuration is missing."
    );
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const emailInput = $("loginEmail");
  const passInput = $("loginPassword");
  if (!emailInput || !passInput) return;

  const email = emailInput.value.trim();
  const password = passInput.value;

  if (!email || !password) {
    alert("Please enter email and password.");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
    hideEl($("loginModal"));
  } catch (err) {
    console.error("Login error:", err);
    alert(err.message || "Could not sign in.");
  }
}

async function handleLogoutClick() {
  try {
    await signOut(auth);
  } catch (err) {
    console.error("Logout error:", err);
  }
}

async function handleForgotPassword(event) {
  event.preventDefault();
  const emailInput = $("loginEmail");

  if (!emailInput) {
    alert("Please open the sign in form and enter your email first.");
    return;
  }

  const email = emailInput.value.trim();
  if (!email) {
    alert("Please enter your email address in the sign in form first.");
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    alert("Password reset email sent. Please check your inbox (and spam folder).");
  } catch (err) {
    console.error("Forgot password error:", err);
    alert(err.message || "Could not send password reset email.");
  }
}

/* ==============================
   4. PRAYER REQUESTS (FIRESTORE)
   Aligned to rules under:
   /prayerRequests/{requestId}
   /prayerRequests/{requestId}/prayers/{uid}
   ============================== */

function setupPrayerPage() {
  const formEl = $("prayerForm");
  const listEl = $("prayerList");
  const countLabelEl = $("requestCountLabel");

  if (!formEl || !listEl) {
    // Not on prayerrequests.html
    return;
  }

  // --- Submit new prayer ---
  formEl.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentUser) {
      alert("You must be signed in to submit a prayer request.");
      return;
    }

    const nameInput = formEl.querySelector("#name");
    const titleInput = formEl.querySelector("#title");
    const messageInput = formEl.querySelector("#message");

    const rawName = nameInput ? nameInput.value : "";
    const title = titleInput ? titleInput.value.trim() : "";
    const message = messageInput ? messageInput.value.trim() : "";

    if (!title || !message) {
      alert("Please fill in both the title and the details of your prayer request.");
      return;
    }

    const storedName = (rawName || "").trim(); // may be blank (Anonymous)
    const isAnonymous = storedName === "";

    try {
      // Firestore rules require:
      // title (string), body (string), isAnonymous (bool),
      // createdByUid == request.auth.uid, createdAt (timestamp)
      await addDoc(collection(db, "prayerRequests"), {
        title,
        body: message,
        isAnonymous,
        // extra fields (allowed by rules):
        name: storedName || null,
        createdByUid: currentUser.uid,
        ownerDisplayName: currentUser.displayName || null,
        createdAt: serverTimestamp(),
        prayerCount: 0,
      });

      // Clear fields; we keep name so they don't have to retype it
      if (titleInput) titleInput.value = "";
      if (messageInput) messageInput.value = "";
    } catch (err) {
      console.error("Error adding prayer:", err);
      alert("Could not submit prayer request. Try again.");
    }
  });

  // --- Live listener for prayer requests (NO 60-day cutoff anymore) ---
  onSnapshot(
    collection(db, "prayerRequests"),
    (snapshot) => {
      const prayers = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const createdAt =
          data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null;

        prayers.push({
          id: docSnap.id,
          ...data,
          createdAt,
        });
      });

      // sort newest at top
      prayers.sort(
        (a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0)
      );
      renderPrayerList(prayers, listEl, countLabelEl);
    },
    (err) => {
      console.error("Error listening to prayerRequests:", err);
      if (countLabelEl) {
        // Most likely when not signed in or profile missing, rules deny read
        if (err.code === "permission-denied") {
          countLabelEl.textContent =
            "Please sign in (and ensure your profile is set up) to view prayer requests.";
        } else {
          countLabelEl.textContent = "Unable to load prayer requests.";
        }
      }
    }
  );
}

function renderPrayerList(prayers, listEl, countLabelEl) {
  listEl.innerHTML = "";

  if (Array.isArray(prayers)) {
    prayers.forEach((p) => {
      const card = createPrayerCard(p);
      listEl.appendChild(card);
    });
  }

  const count = prayers.length;
  if (countLabelEl) {
    if (count === 0) {
      countLabelEl.textContent = "No active requests yet";
    } else if (count === 1) {
      countLabelEl.textContent = "1 active request";
    } else {
      countLabelEl.textContent = `${count} active requests`;
    }
  }
}

function formatDateTime(date) {
  if (!(date instanceof Date)) return "";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

function sanitizeName(name) {
  const trimmed = (name || "").trim();
  if (!trimmed) return "Anonymous";
  return trimmed;
}

function createPrayerCard(prayer) {
  const card = document.createElement("article");
  card.className = "prayer-card";
  card.setAttribute("tabindex", "0");
  card.dataset.id = prayer.id;

  const safeName = sanitizeName(prayer.name);
  const dateText = prayer.createdAt ? formatDateTime(prayer.createdAt) : "";
  const count = prayer.prayerCount || 0;
  const canDelete = currentUser && currentUser.uid === TRISTAN_UID;

  const bodyHtml = (prayer.body || prayer.message || "").replace(
    /\n/g,
    "<br>"
  );

  card.innerHTML = `
    <div class="prayer-header">
      <div class="chevron" aria-hidden="true">
        <span class="chevron-icon">▶</span>
      </div>
      <div class="prayer-main">
        <div class="prayer-title">${prayer.title || "Untitled request"}</div>
        <div class="prayer-meta">
          <span class="meta-pill">${dateText}</span>
          <span class="meta-pill">Requested by: ${safeName}</span>
        </div>
      </div>
    </div>
    <div class="prayer-body">
      <div class="prayer-body-inner">
        <p>${bodyHtml}</p>
        <div class="prayer-footer" style="margin-top:8px; font-size:0.8rem; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <span class="prayer-count">${
            count === 1 ? "1 person praying" : count + " people praying"
          }</span>
          <button type="button" class="pray-button" style="padding:3px 10px; border-radius:999px; border:1px solid rgba(148,163,255,0.6); background:transparent; cursor:pointer;">
            I'm praying
          </button>
          ${
            canDelete
              ? `<button type="button" class="delete-button" style="padding:3px 10px; border-radius:999px; border:1px solid rgba(239,68,68,0.8); background:transparent; color:#fecaca; cursor:pointer;">
                   Delete
                 </button>`
              : ""
          }
        </div>
        <div class="hint-line">Tap card again to collapse</div>
      </div>
    </div>
  `;

  const bodyEl = card.querySelector(".prayer-body");
  bodyEl.style.maxHeight = "0px";

  function toggleOpen() {
    const isOpen = card.classList.contains("open");
    if (isOpen) {
      const currentHeight = bodyEl.scrollHeight;
      bodyEl.style.maxHeight = currentHeight + "px";
      requestAnimationFrame(() => {
        bodyEl.style.maxHeight = "0px";
      });
      card.classList.remove("open");
    } else {
      // Close any other open cards so only one is open at a time
      document.querySelectorAll(".prayer-card.open").forEach((openCard) => {
        if (openCard === card) return;
        const openBody = openCard.querySelector(".prayer-body");
        const h = openBody.scrollHeight;
        openBody.style.maxHeight = h + "px";
        requestAnimationFrame(() => {
          openBody.style.maxHeight = "0px";
        });
        openCard.classList.remove("open");
      });

      const fullHeight = bodyEl.scrollHeight;
      bodyEl.style.maxHeight = fullHeight + "px";
      card.classList.add("open");
    }
  }

  card.addEventListener("click", (e) => {
    // avoid toggling if clicking buttons
    const target = e.target;
    if (target.closest(".pray-button") || target.closest(".delete-button")) {
      return;
    }
    toggleOpen();
  });

  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleOpen();
    }
  });

  // “I’m praying” button (only once per user)
  const prayBtn = card.querySelector(".pray-button");
  const countEl = card.querySelector(".prayer-count");
  if (prayBtn && countEl) {
    prayBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!currentUser) {
        alert("You must be signed in to mark that you are praying.");
        return;
      }

      try {
        // Subcollection path aligned with rules:
        // /prayerRequests/{requestId}/prayers/{uid}
        const prayerRef = doc(db, "prayerRequests", prayer.id);
        const prayRef = doc(
          db,
          "prayerRequests",
          prayer.id,
          "prayers",
          currentUser.uid
        );

        const praySnap = await getDoc(prayRef);
        if (praySnap.exists()) {
          alert("You’ve already marked that you are praying for this request.");
          return;
        }

        await Promise.all([
          setDoc(
            prayRef,
            {
              uid: currentUser.uid,
              prayedAt: serverTimestamp(),
            },
            { merge: true }
          ),
          updateDoc(prayerRef, {
            prayerCount: increment(1),
          }),
        ]);

        const newCount = (prayer.prayerCount || 0) + 1;
        prayer.prayerCount = newCount;
        countEl.textContent =
          newCount === 1 ? "1 person praying" : newCount + " people praying";
      } catch (err) {
        console.error("Error incrementing prayer count:", err);
        alert("Could not update prayer count. Please try again.");
      }
    });
  }

  // Delete button (ONLY Tristan UID)
  const delBtn = card.querySelector(".delete-button");
  if (delBtn) {
    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!currentUser || currentUser.uid !== TRISTAN_UID) {
        alert("Only the site admin can delete prayer requests.");
        return;
      }
      if (!confirm("Delete this prayer request?")) return;
      try {
        await deleteDoc(doc(db, "prayerRequests", prayer.id));
      } catch (err) {
        console.error("Error deleting prayer:", err);
        alert("Could not delete prayer request.");
      }
    });
  }

  return card;
}

/* ==============================
   5. SETUP LISTENERS ON LOAD
   ============================== */

function setupAuthUI() {
  const signupForm = $("signupForm");
  const loginForm = $("loginForm");
  const openSignup = $("openSignup");
  const openLogin = $("openLogin");
  const closeSignup = $("closeSignup");
  const closeLogin = $("closeLogin");
  const logoutBtn = $("logoutBtn");
  const forgotPasswordLink = $("forgotPasswordLink");

  if (signupForm) signupForm.addEventListener("submit", handleSignupSubmit);
  if (loginForm) loginForm.addEventListener("submit", handleLoginSubmit);
  if (logoutBtn) logoutBtn.addEventListener("click", handleLogoutClick);

  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener("click", handleForgotPassword);
  }

  if (openSignup && $("signupModal")) {
    openSignup.addEventListener("click", () => showEl($("signupModal")));
  }
  if (openLogin && $("loginModal")) {
    openLogin.addEventListener("click", () => showEl($("loginModal")));
  }
  if (closeSignup) {
    closeSignup.addEventListener("click", () => hideEl($("signupModal")));
  }
  if (closeLogin) {
    closeLogin.addEventListener("click", () => hideEl($("loginModal")));
  }
}

// Auth state
onAuthStateChanged(auth, (user) => {
  currentUser = user || null;
  updateAuthStatusUI();
});

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  setupAuthUI();
  setupPrayerPage();
});
