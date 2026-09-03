// ============================================================
//  SUPABASE CLIENT
//  One shared client for the whole hub. Import { db } anywhere.
// ============================================================
// pinned to an exact version: the CDN caches it for a year and nothing changes under us
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.114.0/+esm";
import { CONFIG } from "./config.js";

export const db = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
  auth: {
    persistSession: true,      // stay logged in across page reloads
    autoRefreshToken: true,
  },
});
