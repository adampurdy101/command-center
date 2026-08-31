// ============================================================
//  HAL BRIDGE  ·  front-end bridge to the hal-chat edge function.
//  Exposes window.Hal for the (non-module) voice layer to call.
//  Nothing secret lives here — the Anthropic key stays server-side.
// ============================================================
import { db } from "./supabase.js";
import { CONFIG } from "./config.js";

const HIST_MAX = 8;                 // rolling short-term memory sent with each ask
const history = [];                 // [{role:'user'|'assistant', content}]

window.Hal = {
  busy: false,
  // current login token, for the voice/ears endpoints that need a raw fetch
  async token() {
    const { data: { session } } = await db.auth.getSession();
    return session ? session.access_token : null;
  },
  // voice preference lives in the settings table so every device follows it
  async loadVoiceCfg() {
    try {
      const { data } = await db.from("settings").select("prefs").maybeSingle();
      return (data && data.prefs && data.prefs.hal_voice) || null;
    } catch (e) { return null; }
  },
  async saveVoiceCfg(cfg) {
    try {
      const { data: { session } } = await db.auth.getSession();
      if (!session) return;
      const { data } = await db.from("settings").select("prefs").maybeSingle();
      const prefs = Object.assign({}, (data && data.prefs) || {}, { hal_voice: cfg });
      await db.from("settings").upsert({ user_id: session.user.id, prefs, updated_at: new Date().toISOString() });
    } catch (e) { console.error("voice cfg save failed:", e); }
  },
  // send a recorded clip to hal-ears, get the transcript back (iPhone app path)
  async hear(blob) {
    const tok = await this.token();
    if (!tok) return null;
    const ext = (blob.type || "").includes("mp4") ? "m4a" : (blob.type || "").includes("webm") ? "webm" : "audio";
    const fd = new FormData();
    fd.append("file", blob, "speech." + ext);
    try {
      const r = await fetch(CONFIG.SUPABASE_URL + "/functions/v1/hal-ears", {
        method: "POST",
        headers: { Authorization: "Bearer " + tok },
        body: fd,
      });
      if (!r.ok) { console.error("hal-ears http", r.status); return null; }
      const j = await r.json().catch(() => null);
      return j && j.text ? String(j.text) : null;
    } catch (e) {
      console.error("hal-ears threw:", e);
      return null;
    }
  },
  async ask(text) {
    if (this.busy) return null;
    this.busy = true;
    try {
      const { data: { session } } = await db.auth.getSession();
      if (!session) return "You will need to log in before I can help with that, Adam.";
      const today = new Date().toLocaleDateString("en-CA"); // local YYYY-MM-DD
      const { data, error } = await db.functions.invoke("hal-chat", {
        body: { text, today, history: history.slice(-HIST_MAX) },
      });
      if (error || !data || !data.reply) {
        console.error("hal-chat error:", error || data);
        return "I am sorry, Adam. I could not reach my reasoning circuits.";
      }
      history.push({ role: "user", content: text }, { role: "assistant", content: data.reply });
      while (history.length > HIST_MAX) history.shift();
      return data.reply;
    } catch (e) {
      console.error("hal-chat threw:", e);
      return "I am sorry, Adam. I could not reach my reasoning circuits.";
    } finally {
      this.busy = false;
    }
  },
};
