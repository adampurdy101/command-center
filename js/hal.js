// ============================================================
//  HAL BRIDGE  ·  front-end bridge to the hal-chat edge function.
//  Exposes window.Hal for the (non-module) voice layer to call.
//  Nothing secret lives here — the Anthropic key stays server-side.
// ============================================================
import { db } from "./supabase.js";

const HIST_MAX = 8;                 // rolling short-term memory sent with each ask
const history = [];                 // [{role:'user'|'assistant', content}]

window.Hal = {
  busy: false,
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
