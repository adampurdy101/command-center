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
```

## Security rules (non-negotiable)
- Only the Supabase **publishable** key is in the front end — safe with RLS + login on.
- **No secrets in the repo.** Gmail tokens etc. live in GitHub Actions Secrets.
- `.gitignore` blocks `.env` and key files.

## Status
- [x] Milestone 1 — retro shell, login, 5 panels, command console, live on Pages
- [ ] Milestone 2 — Supabase tables + RLS
- [ ] Milestone 3 — morning email digest via GitHub Actions (the proof integration)
- [ ] Milestone 4 — editable placeholder data + agent registry
- [ ] Milestone 5 — confirm 6 AM schedule fires
- [ ] Milestone 6 — "how to use / how to extend" note
