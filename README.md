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
index.html          the page (login + hub)
css/theme.css       COLORS ONLY — edit here to re-skin the whole hub
css/layout.css      structure + retro effects (scanlines, glow, LEDs)
js/config.js        public Supabase URL + publishable key (safe to commit)
js/supabase.js      shared Supabase client
js/auth.js          login / signup / logout
js/stations.js      the five panels (add a 6th here)
js/app.js           clock, panel builder, command console
js/board.js         LIVE data: tasks / projects / agents / life items → panels (realtime)
js/panels.js        click-a-panel detail views (draw from window.CC, filled by board.js)
css/board.css       to-do rows + live panel styling
```

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
- **No secrets in the repo.** Gmail tokens etc. live in GitHub Actions Secrets.
- `.gitignore` blocks `.env` and key files.

## Status
- [x] Milestone 1 — retro shell, login, 5 panels, command console, live on Pages
- [x] Milestone 2 — Supabase tables + RLS (8 tables, owner-only policies)
- [x] Milestone 3 — morning email digest via GitHub Actions (built; needs secrets pasted)
- [x] Milestone 4 — live data: tasks / projects / life items / agents from Supabase, realtime, Claude read/write
- [ ] Milestone 5 — confirm 6 AM schedule fires
- [x] Milestone 6 — "how to use" note (see *Talking to it* above)
- [ ] Milestone 7 — in-page HAL command box (Edge Function → Claude) so the page itself takes orders
