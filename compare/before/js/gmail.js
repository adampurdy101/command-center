// ============================================================
//  GMAIL  ·  front-end bridge to the Supabase edge functions.
//  Exposes window.Gmail for the (non-module) email console to call.
//  Nothing secret lives here — every Google call happens server-side.
// ============================================================
import { db } from "./supabase.js";

const Gmail = {
  connected: false,
  items: [],
  syncedAt: 0,

  // Kick off the OAuth flow: ask our edge fn for a signed Google consent URL,
  // then navigate there. (The JWT rides in the fetch header, never the URL.)
  async connect() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) { alert("Log in to the dashboard first, then connect Gmail."); return; }
    const { data, error } = await db.functions.invoke("gmail-auth-start");
    if (error || !data || !data.url) {
      console.error("gmail connect error:", error || data);
      alert("Couldn't start the Gmail connection. Please try again.");
      return;
    }
    location.href = data.url; // → Google "Allow" → callback → back to ?gmail=connected
  },

  // Pull recent mail. Returns { connected, reconnect, items, count } or an error shape.
  async sync() {
    try {
      const { data, error } = await db.functions.invoke("gmail-sync");
      if (error) { console.error("gmail sync error:", error); return { connected: false, error: true, items: [] }; }
      this.connected = !!(data && data.connected);
      this.items = (data && data.items) || [];
      this.syncedAt = Date.now();
      return data || { connected: false, items: [] };
    } catch (e) {
      console.error("gmail sync threw:", e);
      return { connected: false, error: true, items: [] };
    }
  },

  // One action on a message. action ∈ archive|read|flag|unflag|snooze|trash|send
  async action(action, payload) {
    try {
      const { data, error } = await db.functions.invoke("gmail-action", { body: Object.assign({ action }, payload || {}) });
      if (error) { console.error("gmail action error:", error); return { ok: false, error: true }; }
      return data || { ok: false };
    } catch (e) {
      console.error("gmail action threw:", e);
      return { ok: false, error: true };
    }
  },
};

window.Gmail = Gmail;

// Handle the return trip from Google (…/?gmail=connected | error).
(function handleReturn() {
  const p = new URLSearchParams(location.search);
  const status = p.get("gmail");
  if (!status) return;
  const reason = p.get("reason") || "";
  // strip the query so a refresh doesn't re-trigger
  history.replaceState(null, "", location.pathname + location.hash);
  if (status === "connected") {
    document.dispatchEvent(new CustomEvent("gmail:connected"));
  } else {
    document.dispatchEvent(new CustomEvent("gmail:error", { detail: reason }));
  }
})();
