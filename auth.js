// auth.js
// Handles Firebase auth, invite-code signup, profiles (with first/last name),
// the Prayer Requests wall (submit + "I'm praying" count + admin delete),
// and the Members roster (locked page, split by Leaders vs Members).

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
  orderBy,
  query,
  updateDoc,
  increment,
  arrayUnion,
  deleteDoc, // for deleting prayer requests
  getDocs,   // for Members page roster
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ================== FIREBASE SETUP ================== */

const firebaseConfig = {
  apiKey: "AIzaSyCMoC0EjB83EDALTMPiGJNSdyRajJO5mBs",
  authDomain: "theforge-2e7bb.firebaseapp.com",
  projectId: "theforge-2e7bb",
  storageBucket: "theforge-2e7bb.firebasestorage.app",
  messagingSenderId: "463141276936",
  appId: "1:463141276936:web:978172363e020b9f09f0bd",
  measurementId: "G-333M1YRYLR",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ================== DOM REFERENCES ================== */

// Common footer status
const authStatusEl = document.getElementById("authStatus");

// Auth modal + controls
const authOverlay = document.getElementById("authOverlay");
const accountButton = document.getElementById("accountButton");
const mobileAccountButton = document.getElementById("mobileAccountButton");
const authCloseBtn = document.getElementById("authCloseBtn");
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const authErrorLogin = document.getElementById("authErrorLogin");
const authErrorSignup = document.getElementById("authErrorSignup");
const forgotPasswordLink = document.getElementById("forgotPasswordLink");
const authToggleButtons = authOverlay
  ? authOverlay.querySelectorAll(".auth-toggle-btn")
  : [];

// Login fields
const loginEmailInput = document.getElementById("loginEmail");
const loginPasswordInput = document.getElementById("loginPassword");

// Signup fields (first + last name) + optional legacy single-name field
const signupFirstNameInput = document.getElementById("signupFirstName");
const signupLastNameInput = document.getElementById("signupLastName");
const signupNameInput = document.getElementById("signupName"); // legacy, optional
const signupEmailInput = document.getElementById("signupEmail");
const signupPasswordInput = document.getElementById("signupPassword");
const signupPassword2Input = document.getElementById("signupPassword2");
const signupInviteInput = document.getElementById("signupInvite");

// Sign-out button (if present in HTML)
const signOutButton = document.getElementById("signOutButton");

// nav/account labels
const navUserLabel = document.getElementById("navUserLabel");
const navAuthButtonLabel = document.getElementById("navAuthButtonLabel");
const navMobileUserLabel = document.getElementById("navMobileUserLabel");
const navMobileAuthButtonLabel = document.getElementById("navMobileAuthButtonLabel");

// Prayer Requests page elements
const prayerForm = document.getElementById("prayerForm");
const newPrayerError = document.getElementById("newPrayerError");
const prayerListEl = document.getElementById("prayerList");
const requestCountLabel = document.getElementById("requestCountLabel");

// Members page elements (members.html)
const membersSignInPrompt = document.getElementById("membersSignInPrompt");
const membersWrapper = document.getElementById("membersWrapper");
const membersStatus = document.getElementById("membersStatus");
const leadersGrid = document.getElementById("leadersGrid");
const membersGrid = document.getElementById("membersGrid");

/* ================== STATE ================== */

let currentUser = null;
let prayersUnsubscribe = null;
let cachedInviteCode = null;
let currentlyOpenPrayerId = null;

// Tristan’s UID (from Firestore rules isTristan())
const OWNER_UID = "1zs1eFu7K8cWKRZE7k7TwPCW3X32";

// Global flag: who is allowed to see/use delete buttons
let canDeletePrayers = false;

/* ================== HELPERS ================== */

function setLoginError(msg) {
  if (authErrorLogin) authErrorLogin.textContent = msg || "";
}

function setSignupError(msg) {
  if (authErrorSignup) authErrorSignup.textContent = msg || "";
}

function clearAuthErrors() {
  setLoginError("");
  setSignupError("");
}

function openAuthOverlay() {
  if (!authOverlay) return;
  authOverlay.classList.add("open");
  authOverlay.setAttribute("aria-hidden", "false");
}

function closeAuthOverlay() {
  if (!authOverlay) return;
  authOverlay.classList.remove("open");
  authOverlay.setAttribute("aria-hidden", "true");
}

function setAuthMode(mode) {
  if (!loginForm || !signupForm) return;

  authToggleButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });

  if (mode === "signin") {
    loginForm.style.display = "grid";
    signupForm.style.display = "none";
  } else {
    loginForm.style.display = "none";
    signupForm.style.display = "grid";
  }

  clearAuthErrors();
}

// date helper for prayer cards
function formatDateTime(ts) {
  if (!ts) return "";
  try {
    const d = ts.toDate ? ts.toDate() : ts;
    return d.toLocaleString();
  } catch (e) {
    return "";
  }
}

/* ================== INVITE CODE (SIGNUP) ================== */

async function loadInviteCode() {
  if (cachedInviteCode !== null) return cachedInviteCode;

  try {
    const ref = doc(db, "config", "auth");
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      cachedInviteCode = data.invitecode || null;
      return cachedInviteCode;
    } else {
      cachedInviteCode = null;
      return null;
    }
  } catch (error) {
    console.error("Error loading invite code:", error);
    cachedInviteCode = null;
    return null;
  }
}

/* ================== AUTH MODAL WIRING ================== */

if (authOverlay) {
  // Open from desktop "Account" button
  if (accountButton) {
    accountButton.addEventListener("click", () => {
      openAuthOverlay();
    });
  }

  // Open from mobile "Account" button
  if (mobileAccountButton) {
    mobileAccountButton.addEventListener("click", () => {
      if (typeof window.__forgeCloseMobileNav === "function") {
        window.__forgeCloseMobileNav();
      }
      openAuthOverlay();
    });
  }

  // Close button
  if (authCloseBtn) {
    authCloseBtn.addEventListener("click", () => {
      closeAuthOverlay();
    });
  }

  // Click outside card to close
  authOverlay.addEventListener("click", (e) => {
    if (e.target === authOverlay) {
      closeAuthOverlay();
    }
  });

  // ESC to close
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && authOverlay.classList.contains("open")) {
      closeAuthOverlay();
    }
  });

  // Mode toggle
  if (authToggleButtons.length > 0) {
    setAuthMode("signin");
    authToggleButtons.forEach((btn) => {
      btn.addEventListener("click", () => setAuthMode(btn.dataset.mode));
    });
  }
}

/* ================== SIGN IN ================== */

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAuthErrors();

    const email = loginEmailInput ? loginEmailInput.value.trim() : "";
    const password = loginPasswordInput ? loginPasswordInput.value : "";

    if (!email || !password) {
      setLoginError("Email and password are required.");
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      setLoginError("");
      window.location.reload();
    } catch (error) {
      console.error("Login error:", error);
      let msg = "Could not sign in. Please check your email and password.";
      if (error.code === "auth/invalid-credential") {
        msg = "Invalid email or password.";
      } else if (error.code === "auth/user-not-found") {
        msg = "No account found with that email.";
      } else if (error.code === "auth/wrong-password") {
        msg = "Incorrect password.";
      }
      setLoginError(msg);
    }
  });
}

/* ================== FORGOT PASSWORD ================== */

if (forgotPasswordLink) {
  forgotPasswordLink.addEventListener("click", async (e) => {
    e.preventDefault();
    clearAuthErrors();

    const email = loginEmailInput ? loginEmailInput.value.trim() : "";
    if (!email) {
      setLoginError("Enter your email above, then click Forgot password.");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      setLoginError("Password reset email sent. Check your inbox.");
    } catch (error) {
      console.error("Password reset error:", error);
      setLoginError("Could not send reset email. Check the address and try again.");
    }
  });
}

/* ================== SIGN UP ================== */

if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAuthErrors();

    let firstName = signupFirstNameInput ? signupFirstNameInput.value.trim() : "";
    let lastName = signupLastNameInput ? signupLastNameInput.value.trim() : "";

    // Fallback to legacy single-name field
    if (!firstName && !lastName && signupNameInput) {
      const full = signupNameInput.value.trim();
      if (full) {
        const parts = full.split(" ");
        firstName = parts.shift() || "";
        lastName = parts.join(" ") || "";
      }
    }

    const email = signupEmailInput ? signupEmailInput.value.trim() : "";
    const pass1 = signupPasswordInput ? signupPasswordInput.value : "";
    const pass2 = signupPassword2Input ? signupPassword2Input.value : "";
    const inviteEntered = signupInviteInput ? signupInviteInput.value.trim() : "";

    if (!firstName || !lastName) {
      setSignupError("First and last name are required.");
      return;
    }
    if (!email || !pass1 || !pass2 || !inviteEntered) {
      setSignupError("All fields are required.");
      return;
    }
    if (pass1 !== pass2) {
      setSignupError("Passwords do not match.");
      return;
    }
    if (pass1.length < 6) {
      setSignupError("Password must be at least 6 characters.");
      return;
    }

    const expectedInvite = await loadInviteCode();
    if (!expectedInvite) {
      setSignupError("Invite code configuration is missing. Contact the group owner.");
      return;
    }
    if (inviteEntered !== expectedInvite) {
      setSignupError("Invalid invite code.");
      return;
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass1);
      const user = cred.user;

      const displayName = `${firstName} ${lastName}`.trim();

      try {
        await updateProfile(user, { displayName });
      } catch (e2) {
        console.warn("updateProfile failed (displayName)", e2);
      }

      const profileRef = doc(db, "profiles", user.uid);
      await setDoc(
        profileRef,
        {
          email,
          firstName,
          lastName,
          displayName,
          invitecode: inviteEntered,
          canDeletePrayers: false,
          role: "member", // default
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      setSignupError("");
      window.location.reload();
    } catch (error) {
      console.error("Signup error:", error);
      let msg = "Could not create account.";
      if (error.code === "auth/email-already-in-use") {
        msg = "That email is already in use.";
      } else if (error.code === "auth/weak-password") {
        msg = "Password is too weak.";
      }
      setSignupError(msg);
    }
  });
}

/* ================== PRAYER REQUESTS: RENDERING ================== */

function clearPrayerListUI() {
  if (prayerListEl) {
    prayerListEl.innerHTML = "";
  }
  if (requestCountLabel) {
    requestCountLabel.textContent = "Sign in to view prayer requests.";
  }
}

function renderPrayerList(snapshot, user) {
  if (!prayerListEl) return;

  const docs = snapshot.docs;
  prayerListEl.innerHTML = "";

  if (!docs.length) {
    prayerListEl.innerHTML =
      '<p class="status-text">No requests posted yet. Be the first to share a need.</p>';
    if (requestCountLabel) {
      requestCountLabel.textContent = "0 requests.";
    }
    return;
  }

  if (requestCountLabel) {
    requestCountLabel.textContent =
      docs.length === 1
        ? "1 request currently posted."
        : `${docs.length} requests currently posted.`;
  }

  currentlyOpenPrayerId = null;

  docs.forEach((snap) => {
    const data = snap.data();
    const id = snap.id;

    const title = data.title || "(No title)";
    const postedBy = data.name || "Anonymous";
    const createdAt = formatDateTime(data.createdAt);
    const prayerCount =
      typeof data.prayerCount === "number" ? data.prayerCount : 0;
    const prayedBy = Array.isArray(data.prayedBy) ? data.prayedBy : [];
     const prayedBy = Array.isArray(data.prayedBy) ? data.prayedBy : [];
    const hasPrayed = !!(user && prayedBy.includes(user.uid));

    // 🔍 Debug: see exactly what the app thinks about this user vs this request
    console.log("Prayer card debug", {
      prayerId: id,
      currentUserUid: user ? user.uid : null,
      currentUserName: user ? (user.displayName || user.email) : null,
      prayedBy,
      hasPrayed,
    });

    const card = document.createElement("article");
    card.className = "prayer-card";
    card.dataset.id = id;

    // ... header / body code stays the same ...

    const prayBtn = document.createElement("button");
    prayBtn.type = "button";
    prayBtn.className = "btn btn-soft";
    prayBtn.innerHTML = `<span class="icon">🙏</span><span>I’m praying</span>`;

    // 👇 Only hard-disable if NOT signed in.
    if (!user) {
      prayBtn.disabled = true;
      prayBtn.title = "Sign in to record that you’re praying.";
    } else if (hasPrayed) {
      // Allow click, but just warn instead of blocking via disabled.
      prayBtn.title = "You’ve already marked that you’re praying.";
    }

    prayBtn.addEventListener("click", async (evt) => {
      evt.stopPropagation();

      if (!user) {
        alert("Sign in to record that you’re praying.");
        return;
      }

      if (hasPrayed) {
        // Extra guard so they can't double-count, but they still see a message.
        alert("You’ve already marked that you’re praying for this request.");
        return;
      }

      try {
        const ref = doc(db, "prayerRequests", id);
        await updateDoc(ref, {
          prayerCount: increment(1),
          prayedBy: arrayUnion(user.uid),
        });
        window.location.reload();
      } catch (error) {
        console.error("Error updating prayer count:", error);
        alert("Could not update prayer count. Try again.");
      }
    });

    buttonsWrap.appendChild(prayBtn);

    if (user && canDeletePrayers) {
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn btn-danger";
      deleteBtn.innerHTML = `<span class="icon">🗑️</span><span>Delete</span>`;
      deleteBtn.title = "Delete this prayer request permanently.";

      deleteBtn.addEventListener("click", async (evt) => {
        evt.stopPropagation();

        const confirmed = window.confirm(
          "Are you sure you want to delete this prayer request? This cannot be undone."
        );
        if (!confirmed) return;

        try {
          const ref = doc(db, "prayerRequests", id);
          await deleteDoc(ref);
        } catch (error) {
          console.error("Error deleting prayer request:", error);
          alert("Could not delete this request. Check permissions and try again.");
        }
      });

      buttonsWrap.appendChild(deleteBtn);
    }

    footer.appendChild(buttonsWrap);
    footer.appendChild(countSpan);

    const hintLine = document.createElement("div");
    hintLine.className = "hint-line";
    hintLine.textContent = "Tap to open a request. Only one stays open at a time.";
    footer.appendChild(hintLine);

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(footer);

    function updateBodyMaxHeight() {
      if (card.classList.contains("open")) {
        body.style.maxHeight = body.scrollHeight + "px";
      } else {
        body.style.maxHeight = "0";
      }
    }

    header.addEventListener("click", () => {
      const alreadyOpen =
        currentlyOpenPrayerId === id && card.classList.contains("open");

      const openCards = prayerListEl.querySelectorAll(".prayer-card.open");
      openCards.forEach((c) => {
        c.classList.remove("open");
        const b = c.querySelector(".prayer-body");
        if (b) b.style.maxHeight = "0";
      });

      if (alreadyOpen) {
        currentlyOpenPrayerId = null;
      } else {
        card.classList.add("open");
        currentlyOpenPrayerId = id;
        updateBodyMaxHeight();
      }
    });

    prayerListEl.appendChild(card);
  });
}

/* ================== PRAYER REQUESTS: CREATE ================== */

if (prayerForm) {
  prayerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (newPrayerError) newPrayerError.textContent = "";

    if (!currentUser) {
      if (newPrayerError) {
        newPrayerError.textContent = "You must be signed in to post a request.";
      }
      return;
    }

    const titleEl = document.getElementById("title");
    const nameEl = document.getElementById("name");
    const messageEl = document.getElementById("message");

    const title = titleEl ? titleEl.value.trim() : "";
    const name = nameEl ? nameEl.value.trim() : "";
    const message = messageEl ? messageEl.value.trim() : "";

    if (!title || !message) {
      if (newPrayerError) {
        newPrayerError.textContent = "Title and details are required.";
      }
      return;
    }

    const displayName = name || "Anonymous";
    const ownerDisplayName = currentUser.displayName || currentUser.email || null;

    try {
      await addDoc(collection(db, "prayerRequests"), {
        title,
        name: displayName,
        message,
        createdAt: serverTimestamp(),
        ownerId: currentUser.uid,
        ownerName: ownerDisplayName,
        prayerCount: 0,
        prayedBy: [],
      });

      // 🔔 Fire-and-forget call to Cloudflare Worker to send emails
      (async () => {
        try {
          await fetch("https://forge-prayer-email.aviationministries.workers.dev", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              displayName: displayName,
              title,
              message,
              link: "https://faithbasedpilot.com/prayerrequests.html",
            }),
          });
        } catch (err) {
          console.error("Error calling prayer email worker:", err);
          // We intentionally don't block the user on email failures
        }
      })();

      if (prayerForm) prayerForm.reset();
      if (newPrayerError) newPrayerError.textContent = "";

      // Hard refresh so the new request appears exactly once & list is fresh
      window.location.reload();
    } catch (error) {
      console.error("Error adding prayer request:", error);
      if (newPrayerError) {
        newPrayerError.textContent = "Could not post request. Try again.";
      }
    }
  });
}

/* ================== MEMBERS PAGE: RENDERING ================== */

function clearMembersUI() {
  if (leadersGrid) leadersGrid.innerHTML = "";
  if (membersGrid) membersGrid.innerHTML = "";
}

function createMemberCard(entry) {
  const card = document.createElement("article");
  card.className = "member-card";

  // Mark leaders for CSS .member-card.leader styles
  if (entry.role === "owner" || entry.role === "admin") {
    card.classList.add("leader");
  }

  const nameEl = document.createElement("div");
  nameEl.className = "member-name";
  nameEl.textContent = entry.name || "Unknown";
  card.appendChild(nameEl);

  const pill = document.createElement("div");
  pill.className = "member-role-pill";

  if (entry.role === "owner") {
    pill.textContent = "Owner";
  } else if (entry.role === "admin") {
    pill.textContent = "Admin";
  } else {
    pill.textContent = "Member";
  }

  card.appendChild(pill);
  return card;
}

async function loadMembersRoster() {
  if (!leadersGrid && !membersGrid) return;

  clearMembersUI();
  if (membersStatus) membersStatus.textContent = "Loading members…";

  try {
    const profilesRef = collection(db, "profiles");
    const q = query(profilesRef, orderBy("displayName"));
    const snap = await getDocs(q);

    const leaders = [];
    const members = [];

    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const fullName =
        data.firstName && data.lastName
          ? `${data.firstName} ${data.lastName}`.trim()
          : data.displayName || "Unknown";

      let role = (data.role || "member").toString().toLowerCase();
      if (role !== "owner" && role !== "admin" && role !== "member") {
        role = "member";
      }

      const entry = {
        id: docSnap.id,
        name: fullName,
        role,
      };

      if (role === "owner" || role === "admin") {
        leaders.push(entry);
      } else {
        members.push(entry);
      }
    });

    if (leadersGrid) {
      if (!leaders.length) {
        leadersGrid.innerHTML =
          '<p class="status-text">No leaders are configured yet.</p>';
      } else {
        leaders.forEach((entry) => {
          leadersGrid.appendChild(createMemberCard(entry));
        });
      }
    }

    if (membersGrid) {
      if (!members.length) {
        membersGrid.innerHTML =
          '<p class="status-text">No members are listed yet.</p>';
      } else {
        members.forEach((entry) => {
          membersGrid.appendChild(createMemberCard(entry));
        });
      }
    }

    if (membersStatus) {
      const total = leaders.length + members.length;
      membersStatus.textContent =
        total === 1
          ? "1 man is currently listed in The Forge."
          : `${total} men are currently listed in The Forge.`;
    }
  } catch (error) {
    console.error("Error loading members roster:", error);
    if (membersStatus) {
      membersStatus.textContent =
        "Could not load members. Please try again later.";
    }
    if (membersGrid) {
      membersGrid.innerHTML =
        '<p class="status-text">Could not load members. Please try again later.</p>';
    }
  }
}

function handleMembersPageAuth(user) {
  // If this page doesn't have members sections, do nothing
  if (!membersSignInPrompt && !membersWrapper) return;

  if (!user) {
    if (membersWrapper) membersWrapper.style.display = "none";
    if (membersSignInPrompt) membersSignInPrompt.style.display = "block";
    if (membersStatus)
      membersStatus.textContent = "Sign in to see the members of The Forge.";
    clearMembersUI();
    return;
  }

  if (membersSignInPrompt) membersSignInPrompt.style.display = "none";
  if (membersWrapper) membersWrapper.style.display = "block";
  if (membersStatus) membersStatus.textContent = "Loading members…";

  loadMembersRoster();
}

/* ================== AUTH STATE LISTENER ================== */

onAuthStateChanged(auth, (user) => {
  currentUser = user;

  canDeletePrayers = false;

  if (user) {
    if (user.uid === OWNER_UID) {
      canDeletePrayers = true;
    }

    (async () => {
      try {
        const profileRef = doc(db, "profiles", user.uid);
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          const data = profileSnap.data();
          if (data && data.canDeletePrayers === true) {
            canDeletePrayers = true;
          }
        }
      } catch (err) {
        console.error("Error checking canDeletePrayers:", err);
      }
    })();
  }

  const signedInLabel = user
    ? user.displayName || user.email || "Signed in"
    : "Guest";

  if (authStatusEl) {
    authStatusEl.textContent = user
      ? `Signed in as ${signedInLabel}`
      : "Not signed in";
  }

  if (navUserLabel) {
    navUserLabel.textContent = user ? signedInLabel : "Guest";
  }
  if (navMobileUserLabel) {
    navMobileUserLabel.textContent = user ? signedInLabel : "Guest";
  }
  if (navAuthButtonLabel) {
    navAuthButtonLabel.textContent = user ? "My Account" : "Sign In";
  }
  if (navMobileAuthButtonLabel) {
    navMobileAuthButtonLabel.textContent = user
      ? "My Account"
      : "Sign In / Create";
  }

  if (signOutButton) {
    signOutButton.style.display = user ? "inline-flex" : "none";
  }

  if (prayerForm) {
    prayerForm.style.display = user ? "block" : "none";
  }

  if (prayersUnsubscribe) {
    prayersUnsubscribe();
    prayersUnsubscribe = null;
  }

  if (user && prayerListEl) {
    const q = query(
      collection(db, "prayerRequests"),
      orderBy("createdAt", "desc")
    );

    prayersUnsubscribe = onSnapshot(
      q,
      (snapshot) => {
        renderPrayerList(snapshot, user);
      },
      (error) => {
        console.error("Error listening to prayerRequests:", error);
        clearPrayerListUI();
      }
    );
  } else {
    clearPrayerListUI();
  }

  // Members page handling
  handleMembersPageAuth(user);
});

/* ================== SIGN OUT ================== */

if (signOutButton) {
  signOutButton.addEventListener("click", async () => {
    try {
      await signOut(auth);
      closeAuthOverlay();
    } catch (error) {
      console.error("Sign out error:", error);
      alert("Could not sign out. Try again.");
    }
  });
}

// Expose closeAuthOverlay if needed from inline scripts
window.__forgeCloseAuthOverlay = closeAuthOverlay;
