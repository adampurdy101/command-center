# ADAM // COMMAND CENTER

A personal "command center" dashboard — one page I open every morning to see what
my agents and my life are doing, with a command line to tell it to do things.

- **Front end:** plain HTML/CSS/JS (no framework). Green-phosphor retro theme.
- **Data + login:** [Supabase](https://supabase.com) (Auth + Postgres + Row Level Security).
- **Hosting:** GitHub Pages (public page, private data behind login).
- **Morning job:** GitHub Actions cron (~6:00 AM PT) writes a fresh email digest
  to Supabase; the page reads it.

## The five stations
1. **Daily Brief** — unread/flagged mail, next event, open tasks, morning digest.
2. **Markets** — watchlist with % change + sparkline, S&P, open/closed.
3. **Projects** — active project, progress bar, deadline countdown.
4. **Agent Ops** — status LED per agent + a scrolling action log.
5. **Life Admin** — personal threads with a status tag each.

## File map
```
index.html            the page (login + hub markup)
css/theme.css         COLORS ONLY — edit here to re-skin the whole hub
css/layout.css        chassis + login + retro effects (scanlines, vignette)
css/mission.css       the Mission Control hub (header, deck grid, panels, globe, overlays)
css/mobile.css        phone / tablet / landscape overrides + installed-app (PWA) bits
css/enhance.css       always-on polish (bloom, hover glow, corner brackets)
css/cinema.css        atmosphere pass (panel depth, LED pings, power-on, scan sweep)
css/email.css         full-screen email console
css/deck.css          fullscreen Globe Deck
css/board.css         live to-do lanes + project / life rows
css/noir.css          optional Neon Noir glass theme (only with ?noir)
js/config.js          public Supabase URL + publishable key (safe to commit)
js/supabase.js        shared Supabase client
js/auth.js            login / signup / logout → fires hub:ready / hub:left
js/app.js             boots auth + fills the Daily Brief digest row
js/board.js           LIVE data: tasks / projects / agents / life items → panels (realtime, window.CC)
js/bills.js           06 Bills panel + Daily Brief NEXT EVENT / BILLS rows + the calendar overlay (window.CCal);
                      reads the Bill Calendar app's billdata row + hal_events — read-only, same paid-month logic
css/calendar.css      bills rows + calendar overlay
js/panels.js          click-a-panel detail views (draw from window.CC)
js/mission.js         clocks, Voice Scope canvas, HAL voice engine + speech routing, sniper launcher
js/hal.js             window.Hal → hal-chat / hal-ears / hal-voice edge functions
js/globe.js           GLOBAL TRACK SYS globe engine (d3-geo, live ISS + USGS feeds)
js/deck.js            fullscreen Globe Deck (window.GlobeDeck)
js/weather.js         Renton + Pattaya weather pins (Open-Meteo)
js/effects.js         heartbeat EKG, HAL eye, boot splash, ambient hum, fullscreen, haptics, market ticker
js/backdrop.js        Grid Chamber canvas behind the panels
js/cinema.js          panel power-on stagger, roaming scan sweep, backdrop parallax
js/enhance.js         readout "update" flicker
js/email.js           full-screen email console (window.EmailConsole)
js/gmail.js           window.Gmail → gmail-* edge functions
js/sniper-x.js        Sniper Scope // Overwatch game (window.SniperGame)
js/sniper.js          the OLD classic game build — only studio.html still loads it
js/saber.js           iPhone-only motion lightsaber (window.Saber)
js/noir.js            Neon Noir theme activator (only with ?noir)
js/mobile.js          service-worker registration + auto-update
sw.js                 service worker — BUMP `CACHE` ON EVERY DEPLOY (see Deploying)
data/                 compact map data (state borders, loaded only when the globe is zoomed)
jobs/morning_brief.py the 6 AM GitHub Actions job (.github/workflows/morning-brief.yml)
supabase/             edge functions + migrations (hal-chat, hal-voice, hal-ears, hal-ics, gmail-*)
mockups/, studio.html, mail.html      design mockups + no-login preview pages (not part of the app)
command-center-enhanced/              an older duplicate copy of the whole site — nothing uses it
```

## Deploying (every time)
1. Bump `CACHE` in `sw.js` (`cc-shell-v62` → `v63` …). Installed phones only pick up a
   new build when this changes; the page then reloads itself once.
2. Commit and `git push origin main`. GitHub Pages rebuilds in about 1–3 minutes.
3. On the computer, a hard refresh (Cmd+Shift+R) shows the new build immediately.

## Talking to it (the Claude workflow)
The Supabase tables are the single source of truth. Claude (Cowork) reads and
writes them directly, and the page repaints in real time — no reload.

| you say…                                   | Claude does…                              | shows up in…     |
|--------------------------------------------|-------------------------------------------|------------------|
| "add *call the roofer* to my list, Friday" | insert into `tasks` (title, due, priority)| 01 Daily Brief   |
| "mark the Tesla letter done"               | `tasks.done = true`                       | 01 (Recently done)|
| "WSH is at 70%, deadline Oct 3"            | update `projects`                         | 03 Projects      |
| "Tesla is now in arbitration"              | update `life_items.status`                | 05 Life Admin    |
| "remember: gate code is 4471"              | insert into `notes`                       | detail views     |
| "what's on my plate?" / "what's overdue?"  | reads the tables, tells you               | —                |

**How the to-do list reads:** three lanes — **NOW** (red: high priority or due by tomorrow),
**NEXT** (amber: this week), **LATER** (green: when there's room). Claude picks the lane when it
files the item; say "bump X to now" to move one. Left edge + LED = lane colour, chip = due date.

Every write also drops a line in `agent_log`, so 04 Agent Ops shows what
Claude did and when. Ticking ☐ on the page writes back to `tasks` the same way.

Tables: `tasks` (title, done, due, priority, notes) · `projects` (name, phase,
progress, deadline, notes) · `life_items` (label, status, tag, notes) ·
`notes` (title, body, tags, pinned) · `agents` · `agent_log`. All RLS owner-only.

## Security rules (non-negotiable)
- Only the Supabase **publishable** key is in the front end — safe with RLS + login on.
- **No secrets in the repo.** Gmail tokens etc. live in GitHub Actions Secrets / Supabase secrets.
- `.gitignore` blocks `.env` and key files.
- **Owner only.** Every table is Row-Level-Security owner-only, and on top of that the page
  (js/auth.js) and every edge function (hal-*, gmail-*) refuse any login except
  `CONFIG.OWNER_ID` — the Supabase project is shared with the Bill Calendar app, so a
  Bill Calendar user can log in there but can never use, see or spend anything here.
  There is no sign-up on the login screen; extra allowed ids go in the `HAL_ALLOWED_USERS`
  edge-function secret if ever needed.
- CDN libraries are pinned to exact versions with integrity hashes.
- Redeploying `hal-ics` must keep Verify JWT OFF (Apple fetches the feed with no headers;
  the feed URL's HMAC token is the credential and the feed only contains the owner's rows).

## Status
- [x] Milestone 1 — retro shell, login, 5 panels, command console, live on Pages
- [x] Milestone 2 — Supabase tables + RLS (8 tables, owner-only policies)
- [x] Milestone 3 — morning email digest via GitHub Actions (built; needs secrets pasted)
- [x] Milestone 4 — live data: tasks / projects / life items / agents from Supabase, realtime, Claude read/write
- [ ] Milestone 5 — the 6 AM schedule fires every day but the job FAILS every run
      (GitHub → Actions → Morning Brief → open the newest run to read why; usually the
      three secrets from docs/SETUP.md step 4 are missing or the app password expired)
- [x] Milestone 6 — "how to use" note (see *Talking to it* above)
- [x] Milestone 7 — Hal: the page itself takes spoken orders (hal-chat edge function → Claude, task + calendar tools)
