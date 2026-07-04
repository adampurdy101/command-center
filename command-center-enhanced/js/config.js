// ============================================================
//  CONFIG  ·  safe-to-publish settings
//  ------------------------------------------------------------
//  The values below are PUBLIC by design. The Supabase URL and the
//  "publishable" key are meant to live in front-end code. They can
//  only touch your data through Row Level Security + your login.
//  NEVER put a service-role key, Gmail token, or any secret here.
// ============================================================

export const CONFIG = {
  SUPABASE_URL: "https://fzsfizqkolkxkorgvtcl.supabase.co",
  // publishable (anon) key — safe in the browser when RLS is ON
  SUPABASE_KEY: "sb_publishable_qyUnnnqgGGQ7yCV9qdA5iQ_JLv5A-nw",

  // header text
  CALLSIGN: "ADAM // COMMAND CENTER",
  STATION: "RENTON · WA",
};
