# SETUP — one-time things only you can do (click-by-click)

These are the steps that need *your* hands in the GitHub or Supabase websites.
Do them in order. After each, tell Claude and it continues.

---

## STEP 1 — Create the repo  (Milestone 1)

1. Go to **https://github.com/new**
2. **Repository name:** `command-center`
3. **Public** (leave it public — the page is public, your data is not).
4. **Do NOT** check "Add a README" / .gitignore / license. Leave it empty.
5. Click **Create repository**.

### Then let the integration write to it
The tool that pushes your code (the GitHub connector) needs permission for this
new repo:

1. Go to **https://github.com/settings/installations**
2. Click **Configure** next to the Claude / GitHub app.
3. Under **Repository access**, either select **All repositories**, or
   **Only select repositories → add `command-center`**.
4. Click **Save**.

Tell Claude "repo is ready" and it will push all the files.

---

## STEP 2 — Enable GitHub Pages  (Milestone 1, after the push)

1. In the `command-center` repo, click **Settings** (top tab).
2. Left menu → **Pages**.
3. **Source:** Deploy from a branch.
4. **Branch:** `main`  ·  **Folder:** `/ (root)`  → **Save**.
5. Wait ~1 minute. Your hub is live at:
   **https://adampurdy101.github.io/command-center/**

---

## STEP 3 — Supabase login (Milestone 2) — instructions added when we get there.
## STEP 4 — Paste the Gmail secret (Milestone 3) — instructions added when we get there.
