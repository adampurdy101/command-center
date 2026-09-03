// ============================================================
//  AUTH  ·  Supabase email login — OWNER ONLY
//  Handles: show login vs hub, sign in, sign out.
//  There is no sign-up path any more: this dashboard belongs to one
//  account (CONFIG.OWNER_ID). Any other valid login is signed straight
//  back out. (Row Level Security already keeps data private; this lock
//  keeps strangers from even using the page.)
// ============================================================
import { db } from "./supabase.js";
import { CONFIG } from "./config.js";

const loginScreen = () => document.getElementById("login-screen");
const hub         = () => document.getElementById("hub");
const msg         = () => document.getElementById("login-msg");

function setMsg(text, kind = "") {
  const m = msg();
  m.textContent = text;
  m.className = "msg " + kind;
}

const isOwner = (session) => !!(session && session.user && session.user.id === CONFIG.OWNER_ID);

// Supabase fires several auth events (INITIAL_SESSION, SIGNED_IN,
// TOKEN_REFRESHED…). We only want to react when the view actually changes,
// so we never build the dashboard twice. `shown` tracks the current view.
let shown = null; // 'hub' | 'login'

function showHub(session) {
  if (shown === "hub") return;          // already in the hub — do nothing
  shown = "hub";
  loginScreen().classList.add("hidden");
  hub().classList.remove("hidden");
  // tell the rest of the app we're in (fires once per login)
  document.dispatchEvent(new CustomEvent("hub:ready", { detail: { session } }));
}

function showLogin() {
  if (shown === "login") return;
  shown = "login";
  hub().classList.add("hidden");
  loginScreen().classList.remove("hidden");
  document.dispatchEvent(new CustomEvent("hub:left"));
}

// a real login that is not the owner's: drop it immediately
let rejecting = false;
async function rejectStranger() {
  if (rejecting) return;
  rejecting = true;
  showLogin();
  setMsg("This dashboard is private to its owner.", "err");
  try { await db.auth.signOut(); } catch (_) {}
  rejecting = false;
}

function route(session) {
  if (!session) { showLogin(); return; }
  if (isOwner(session)) showHub(session); else rejectStranger();
}

export async function initAuth() {
  const form = document.getElementById("login-form");
  const submitBtn = document.getElementById("login-submit");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    if (!email || !password) { setMsg("Enter email and password.", "err"); return; }
    submitBtn.disabled = true;
    setMsg("Working…");
    const { error } = await db.auth.signInWithPassword({ email, password });
    submitBtn.disabled = false;
    if (error) setMsg(error.message, "err");
  });

  // logout button (in header)
  document.getElementById("logout-btn").addEventListener("click", async () => {
    await db.auth.signOut();
  });

  // react to login state changes
  db.auth.onAuthStateChange((_event, session) => route(session));

  // initial check
  const { data } = await db.auth.getSession();
  route(data.session);
}
