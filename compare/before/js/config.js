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
  // the ONE account this dashboard belongs to (a user id is not a secret — it is
  // already in the morning-brief workflow); every other login is signed back out
  OWNER_ID: "30cbcbfa-7261-47de-8c91-3d97557fc5f9",

  // header text
  CALLSIGN: "ADAM // COMMAND CENTER",
  STATION: "RENTON · WA",
};
