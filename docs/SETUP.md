# SETUP — one-time things only you can do (click-by-click)

These are the steps that need *your* hands in the GitHub or Supabase websites.
Do them in order. After each, tell Claude and it continues.

---

## STEP 1 — Create the repo  (Milestone 1)  ✅ DONE

Repo `command-center` (public) exists at github.com/adampurdy101/command-center.

## STEP 1b — Connect GitHub to this Mac with an SSH key (ONE time)

The Claude GitHub connector is read-only and this Mac had no saved GitHub login,
so we use an SSH key. Claude generated the key on the Mac. The PRIVATE half never
leaves the machine and is never shared; you only paste the PUBLIC half into GitHub
(public keys are meant to be public — nothing secret is exposed). After this,
Claude pushes every future milestone for you — no terminal, no tokens.

1. Go to **https://github.com/settings/ssh/new**
2. **Title:** `Adam Mac — command-center`
3. **Key type:** Authentication Key
4. **Key:** paste the public key Claude shows you (one line, starts with
   `ssh-ed25519 …`). It lives at `~/.ssh/id_ed25519.pub` on the Mac.
5. Click **Add SSH key**.

Tell Claude "key added" and it pushes Milestone 1 and everything after.

---

## STEP 2 — Enable GitHub Pages  (Milestone 1, after the push)

1. In the `command-center` repo, click **Settings** (top tab).
2. Left menu → **Pages**.
3. **Source:** Deploy from a branch.
4. **Branch:** `main`  ·  **Folder:** `/ (root)`  → **Save**.
5. Wait ~1 minute. Your hub is live at:
   **https://adampurdy101.github.io/command-center/**

---

## STEP 3 — Create your login  (Milestone 2)

The 8 database tables are built with Row Level Security ON. Now make your account.

**A. Point Supabase at your hub (30 seconds):**
1. Go to **https://supabase.com/dashboard/project/fzsfizqkolkxkorgvtcl/auth/url-configuration**
2. **Site URL:** `https://adampurdy101.github.io/command-center/`
3. Under **Redirect URLs**, click **Add URL** and add the same address.
4. **Save**.

**B. Make your account:**
1. Open **https://adampurdy101.github.io/command-center/**
2. Click **"first time here? create an account."**
3. Enter your email + a password → **CREATE ACCOUNT**.
4. Check your email for a Supabase confirmation link and click it.
5. Back on the hub, log in with that email + password. You're in — all 5 panels appear.

**C. (Recommended) Lock it down once you're in:**
1. **https://supabase.com/dashboard/project/fzsfizqkolkxkorgvtcl/auth/providers**
   → Email → turn **OFF** "Allow new users to sign up" (so only you can ever log in).
2. **https://supabase.com/dashboard/project/fzsfizqkolkxkorgvtcl/auth/policies** (Password
   settings) → turn **ON** "Leaked password protection."

## STEP 4 — Paste the Gmail secret (Milestone 3) — instructions added when we get there.
