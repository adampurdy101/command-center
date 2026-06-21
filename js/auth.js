// ============================================================
//  AUTH  ·  Supabase email login
//  Handles: show login vs hub, sign in, sign up, sign out.
// ============================================================
import { db } from "./supabase.js";

const loginScreen = () => document.getElementById("login-screen");
const hub         = () => document.getElementById("hub");
const msg         = () => document.getElementById("login-msg");

let mode = "signin"; // or "signup"

function setMsg(text, kind = "") {
  const m = msg();
  m.textContent = text;
  m.className = "msg " + kind;
}

function showHub(session) {
  loginScreen().classList.add("hidden");
  hub().classList.remove("hidden");
  // tell the rest of the app we're in
  document.dispatchEvent(new CustomEvent("hub:ready", { detail: { session } }));
}

function showLogin() {
  hub().classList.add("hidden");
  loginScreen().classList.remove("hidden");
}

export async function initAuth() {
  // wire the form
  const form = document.getElementById("login-form");
  const toggle = document.getElementById("login-toggle");
  const submitBtn = document.getElementById("login-submit");

  toggle.addEventListener("click", () => {
    mode = mode === "signin" ? "signup" : "signin";
    submitBtn.textContent = mode === "signin" ? "LOG IN ▸" : "CREATE ACCOUNT ▸";
    toggle.textContent = mode === "signin"
      ? "first time here? create an account"
      : "already have an account? log in";
    setMsg("");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    if (!email || !password) { setMsg("Enter email and password.", "err"); return; }

    setMsg("Working…");
    if (mode === "signin") {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) setMsg(error.message, "err");
    } else {
      const { error } = await db.auth.signUp({ email, password });
      if (error) { setMsg(error.message, "err"); }
      else { setMsg("Account made. Check your email if confirmation is on, then log in.", "ok"); }
    }
  });

  // logout button (in header)
  document.getElementById("logout-btn").addEventListener("click", async () => {
    await db.auth.signOut();
  });

  // react to login state changes
  db.auth.onAuthStateChange((_event, session) => {
    if (session) showHub(session); else showLogin();
  });

  // initial check
  const { data } = await db.auth.getSession();
  if (data.session) showHub(data.session); else showLogin();
}
