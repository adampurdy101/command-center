// ============================================================
//  BILLS + CALENDAR  ·  your Bill Calendar inside the Command Center
//  ------------------------------------------------------------
//  Reads the same billdata row the Bill Calendar app writes (same login,
//  same database, owner-only row security), plus Hal's calendar events
//  and the to-do due dates, and paints:
//    · 06 Bills panel        next bills due, paid state, month totals
//    · Daily Brief rows      NEXT EVENT (Hal's calendar) + BILLS (next due)
//    · the calendar overlay  tap the panel, a row, or ▦ CALENDAR → month view
//  Read-only by design: bills are marked paid in the Bill Calendar app. The
//  occurrence + paid-month logic below is a straight port of that app (and
//  its ICS feed) so the two always agree. window.CCal = { open, close, refresh }.
// ============================================================
import { db } from "./supabase.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const parseYMD = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d); };
const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const daysBetween = (a, b) => Math.round((b - a) / 86400000);
const money = (n) => { const r = Math.round((+n || 0) * 100) / 100; return "$" + (r % 1 === 0 ? r.toLocaleString("en-US") : r.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })); };
const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const shortDate = (d) => DOW[d.getDay()] + " " + MONTHS[d.getMonth()].slice(0, 3) + " " + d.getDate();
function fmtTime(t) {                       // "14:00:00" → "2:00 PM"
  if (!t) return "";
  const [h, m] = String(t).split(":").map(Number);
  return (h % 12 || 12) + ":" + pad(m) + (h < 12 ? " AM" : " PM");
}

const S = { bills: [], accounts: [], events: [], hasBills: false, loaded: false, ready: false };
let channel = null, pollTimer = null;

// ---------- occurrence logic: a straight port of the Bill Calendar app ----------
function dueDayInMonth(b, y, m) {
  const origDay = parseInt(b.dueDate.split("-")[2], 10);
  const lastDay = new Date(y, m + 1, 0).getDate();
  return Math.min(origDay, lastDay);
}
function occDays(b, y, m) {
  if (b.recur === "biweekly") {
    const p = b.dueDate.split("-");
    const anchor = new Date(+p[0], +p[1] - 1, +p[2]); anchor.setHours(0, 0, 0, 0);
    const res = [], last = new Date(y, m + 1, 0).getDate();
    for (let d = 1; d <= last; d++) {
      const dt = new Date(y, m, d); dt.setHours(0, 0, 0, 0);
      const diff = Math.round((dt - anchor) / 86400000);
      if (diff >= 0 && diff % 14 === 0) res.push(d);
    }
    return res;
  }
  if (b.recur !== "monthly") {                // "once"
    const p = b.dueDate.split("-");
    return (+p[0] === y && +p[1] - 1 === m) ? [dueDayInMonth(b, y, m)] : [];
  }
  return [dueDayInMonth(b, y, m)];
}
// paidMonths keys are "YYYY-M" with a ZERO-based month (biweekly: "YYYY-M-D") — exactly as the app writes them
function isPaidOcc(b, y, m, d) {
  const pm = b.paidMonths || [];
  return b.recur === "biweekly" ? pm.includes(y + "-" + m + "-" + d) : pm.includes(y + "-" + m);
}
function acctLabel(id) {
  if (id == null) return "";
  const a = S.accounts.find((x) => x.id === id);
  return a ? (a.nick || a.bank || "") : "";
}
// every bill occurrence between two dates (inclusive), soonest first
function occurrences(from, to) {
  const out = [];
  const a = from.getFullYear() * 12 + from.getMonth(), z = to.getFullYear() * 12 + to.getMonth();
  for (let k = a; k <= z; k++) {
    const y = Math.floor(k / 12), m = k % 12;
    for (const b of S.bills) {
      if (!b || !b.dueDate) continue;
      for (const d of occDays(b, y, m)) {
        const dt = new Date(y, m, d);
        if (dt < from || dt > to) continue;
        out.push({ type: "bill", date: dt, ymd: ymd(dt), name: b.name || "bill", amount: +b.amount || 0,
          paid: isPaidOcc(b, y, m, d), color: b.color || "#41ff7e", acct: acctLabel(b.acct) });
      }
    }
  }
  out.sort((p, q) => p.date - q.date || p.name.localeCompare(q.name));
  return out;
}
function dueChip(o, t0) {
  if (o.paid) return { text: "✓ PAID", cls: "ok" };
  const n = daysBetween(t0, o.date);
  if (n < 0) return { text: `OVERDUE ${-n}d`, cls: "down" };
  if (n === 0) return { text: "TODAY", cls: "warn" };
  if (n <= 7) return { text: `T−${n}d`, cls: "warn" };
  return { text: MONTHS[o.date.getMonth()].slice(0, 3) + " " + o.date.getDate(), cls: "ok" };
}
function nextEvent() {
  const t0 = today(), tKey = ymd(t0), now = new Date(), nowHM = pad(now.getHours()) + ":" + pad(now.getMinutes());
  return S.events.find((e) => e.on_date > tKey || (e.on_date === tKey && (!e.at_time || String(e.at_time).slice(0, 5) >= nowHM))) || null;
}
function openTasks() {
  const CC = window.CC; return (CC && CC.data && CC.data.tasks) ? CC.data.tasks.filter((t) => !t.done && t.due) : [];
}

// ---------- load ----------
export async function load() {
  const [b, e] = await Promise.all([
    db.from("billdata").select("bills,accounts").maybeSingle(),
    db.from("hal_events").select("id,title,on_date,at_time,duration_min,notes").order("on_date").order("at_time").limit(500),
  ]);
  S.hasBills = !!(b.data && Array.isArray(b.data.bills));
  S.bills = S.hasBills ? b.data.bills : [];
  S.accounts = (b.data && Array.isArray(b.data.accounts)) ? b.data.accounts : [];
  S.events = e.data || [];
  S.loaded = true;
  paint();
}

// ---------- paint: panel + brief rows ----------
function paint() { paintPanel(); paintBrief(); if (calOpen) renderCal(); }

function paintPanel() {
  const stat = $("bills-stat"), bd = $("bills-bd"), panel = $("panel-bills");
  if (!bd) return;
  const led = panel && panel.querySelector(".tb .led");
  const setLed = (c) => { if (led) { led.classList.remove("on", "amb", "red"); led.classList.add(c); } };
  if (!S.hasBills) {
    if (stat) stat.textContent = "NO DATA"; setLed("amb");
    bd.innerHTML = `<div class="row"><span class="k muted">no bills yet — add them in the Bill Calendar app</span></div>`;
    return;
  }
  const t0 = today();
  const occ = occurrences(addDays(t0, -45), addDays(t0, 60));
  const overdue = occ.filter((o) => !o.paid && o.date < t0);
  const upcoming = occ.filter((o) => o.date >= t0);
  const rows = overdue.concat(upcoming).slice(0, 6);
  const soon = occ.filter((o) => !o.paid && o.date < addDays(t0, 8)).length;   // unpaid within 7 days, overdue included
  if (stat) stat.textContent = overdue.length ? `${overdue.length} OVERDUE` : soon ? `${soon} DUE · 7D` : "CLEAR · 7D";
  setLed(overdue.length ? "red" : soon ? "amb" : "on");

  // this month's totals
  const first = new Date(t0.getFullYear(), t0.getMonth(), 1), last = new Date(t0.getFullYear(), t0.getMonth() + 1, 0);
  const month = occurrences(first, last);
  const paidSum = month.filter((o) => o.paid).reduce((s, o) => s + o.amount, 0);
  const leftSum = month.filter((o) => !o.paid).reduce((s, o) => s + o.amount, 0);

  bd.innerHTML = rows.map((o) => {
    const c = dueChip(o, t0);
    return `<div class="bill-i${o.paid ? " paid" : ""}" style="--bc:${esc(o.color)}" title="${esc(o.name)}${o.acct ? " · " + esc(o.acct) : ""}">
      <span class="k"><span class="nm">${esc(o.name)}</span>${o.acct ? `<small>${esc(o.acct)}</small>` : ""}</span>
      <span class="v"><span class="amt">${money(o.amount)}</span><span class="chip ${c.cls}">${c.text}</span></span></div>`;
  }).join("") +
    `<div class="bill-foot"><span>${MONTHS[t0.getMonth()].slice(0, 3)} · ${money(paidSum)} PAID</span><span>${leftSum ? money(leftSum) + " LEFT" : "ALL PAID"}</span><span>▦ TAP FOR CALENDAR</span></div>`;
}

function paintBrief() {
  const t0 = today();
  const nb = $("brief-bills");
  if (nb) {
    if (!S.hasBills) { nb.textContent = "—"; nb.classList.add("muted"); }
    else {
      const next = occurrences(addDays(t0, -45), addDays(t0, 60)).find((o) => !o.paid);
      if (next) { const c = dueChip(next, t0); nb.innerHTML = `${esc(next.name)} ${money(next.amount)} · <span class="${c.cls}">${c.text}</span>`; nb.classList.remove("muted"); }
      else { nb.textContent = "nothing due · 60d"; nb.classList.add("muted"); }
    }
  }
  const ne = $("brief-next");
  if (ne) {
    const ev = nextEvent();
    if (ev) {
      const d = parseYMD(ev.on_date), n = daysBetween(t0, d);
      const when = n === 0 ? "TODAY" : n === 1 ? "TOMORROW" : shortDate(d);
      ne.textContent = `${when}${ev.at_time ? " " + fmtTime(ev.at_time) : ""} · ${ev.title}`;
      ne.classList.remove("muted");
    } else { ne.textContent = "CLEAR · nothing scheduled"; ne.classList.add("muted"); }
  }
}

// ---------- the calendar overlay ----------
let overlay = null, calOpen = false, view = null, selected = null;   // view = first day of the shown month
function build() {
  if (overlay) return overlay;
  overlay = document.createElement("div"); overlay.id = "calendar"; overlay.className = "hidden";
  overlay.innerHTML = `<div class="cal-box" role="dialog" aria-label="Calendar">
    <div class="cal-head">
      <button class="btn cal-nav" data-d="-1" type="button" aria-label="Previous month">◂</button>
      <span class="cal-title"></span>
      <button class="btn cal-nav" data-d="1" type="button" aria-label="Next month">▸</button>
      <button class="btn cal-today" type="button">TODAY</button>
      <span class="cal-sum"></span>
      <span class="dx-sp"></span>
      <span class="cal-legend"><span><i style="background:#41ff7e"></i>BILL</span><span><i style="background:#7df7ff"></i>EVENT</span><span><i style="background:#ffd24a"></i>TASK</span></span>
      <button class="btn cal-close" type="button">✕ CLOSE</button>
    </div>
    <div class="cal-body"><div class="cal-grid"></div><div class="cal-day"></div></div></div>`;
  ($("hub") || document.body).appendChild(overlay);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.querySelector(".cal-close").addEventListener("click", close);
  overlay.querySelector(".cal-today").addEventListener("click", () => { const t = today(); view = new Date(t.getFullYear(), t.getMonth(), 1); selected = ymd(t); renderCal(); });
  overlay.querySelectorAll(".cal-nav").forEach((b) => b.addEventListener("click", () => { view = new Date(view.getFullYear(), view.getMonth() + (+b.dataset.d), 1); renderCal(); }));
  overlay.querySelector(".cal-grid").addEventListener("click", (e) => { const c = e.target.closest(".cal-cell"); if (c) { selected = c.dataset.ymd; renderCal(); } });
  return overlay;
}
function itemsFor(from, to) {
  const map = {};
  const push = (k, it) => { (map[k] = map[k] || []).push(it); };
  const t0 = today();
  occurrences(from, to).forEach((o) => push(o.ymd, { type: "bill", label: o.name, sub: o.acct, amt: money(o.amount), color: o.color, paid: o.paid, over: !o.paid && o.date < t0, sort: 1 }));
  const a = ymd(from), z = ymd(to);
  S.events.forEach((e) => { if (e.on_date >= a && e.on_date <= z) push(e.on_date, { type: "ev", label: e.title, sub: e.notes || "", amt: e.at_time ? fmtTime(e.at_time) : "ALL DAY", time: e.at_time || "", sort: 0 }); });
  openTasks().forEach((t) => { if (t.due >= a && t.due <= z) push(t.due, { type: "task", label: t.title, sub: t.priority === "high" ? "high priority" : "", amt: "☐ TO-DO", sort: 2 }); });
  for (const k in map) map[k].sort((p, q) => p.sort - q.sort || (p.time || "").localeCompare(q.time || ""));
  return map;
}
function renderCal() {
  const o = build(); if (!view) { const t = today(); view = new Date(t.getFullYear(), t.getMonth(), 1); }
  const y = view.getFullYear(), m = view.getMonth();
  o.querySelector(".cal-title").textContent = MONTHS[m] + " " + y;
  const first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
  const mo = occurrences(first, last);
  const paid = mo.filter((x) => x.paid).reduce((s, x) => s + x.amount, 0), left = mo.filter((x) => !x.paid).reduce((s, x) => s + x.amount, 0);
  o.querySelector(".cal-sum").textContent = S.hasBills ? `${money(paid)} PAID · ${money(left)} LEFT` : "";
  const start = addDays(first, -first.getDay());                 // Sunday before (or on) the 1st
  const items = itemsFor(start, addDays(start, 41));
  const tKey = ymd(today());
  let html = DOW.map((d) => `<div class="cal-dow">${d}</div>`).join("");
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i), k = ymd(d), list = items[k] || [];
    const chips = list.slice(0, 3).map((it) => `<div class="cc ${it.type}${it.paid ? " paid" : ""}${it.over ? " over" : ""}" style="${it.color ? "--cc:" + esc(it.color) : ""}">${it.type === "bill" ? esc(it.amt) + " " : ""}${esc(it.label)}</div>`).join("")
      + (list.length > 3 ? `<div class="cc-more">+${list.length - 3} more</div>` : "");
    const dots = list.slice(0, 6).map((it) => `<span class="dot ${it.type}" style="${it.color ? "--cc:" + esc(it.color) : ""}"></span>`).join("");
    html += `<div class="cal-cell${d.getMonth() !== m ? " other" : ""}${k === tKey ? " today" : ""}${k === selected ? " sel" : ""}" data-ymd="${k}" role="button" tabindex="0">
      <span class="num">${d.getDate()}</span>${chips}<div class="dots">${dots}</div></div>`;
  }
  o.querySelector(".cal-grid").innerHTML = html;
  // selected-day detail
  const day = o.querySelector(".cal-day");
  if (!selected) selected = tKey;
  const sd = parseYMD(selected), list = items[selected] || (itemsFor(sd, sd)[selected] || []);
  day.innerHTML = `<h3>${shortDate(sd)}${selected === tKey ? " · TODAY" : ""}</h3>` + (list.length
    ? list.map((it) => `<div class="cal-item ${it.type}${it.paid ? " paid" : ""}" style="${it.color ? "--cc:" + esc(it.color) : ""}"><span class="k">${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ""}</span><span class="v ${it.over ? "down" : ""}">${esc(it.amt)}${it.type === "bill" ? (it.paid ? " ✓" : it.over ? " · OVERDUE" : "") : ""}</span></div>`).join("")
    : `<div class="cal-empty">nothing on this day</div>`);
}
function open(dateStr) {
  if (!S.ready) return;
  build();
  const t = today();
  selected = dateStr || ymd(t);
  const sd = parseYMD(selected); view = new Date(sd.getFullYear(), sd.getMonth(), 1);
  calOpen = true; overlay.classList.remove("hidden"); renderCal();
  try { navigator.vibrate && navigator.vibrate(10); } catch (_) {}
}
function close() { calOpen = false; if (overlay) overlay.classList.add("hidden"); }
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && calOpen) close(); });

// ---------- realtime + polling ----------
function subscribe() {
  if (channel) return;
  let t = 0; const bump = () => { clearTimeout(t); t = setTimeout(() => load().catch(() => {}), 300); };
  channel = db.channel("calendar");
  ["billdata", "hal_events"].forEach((table) => channel.on("postgres_changes", { event: "*", schema: "public", table }, bump));
  channel.subscribe();
  pollTimer = setInterval(() => load().catch(() => {}), 5 * 60 * 1000);
}
function unsubscribe() {
  if (channel) { try { db.removeChannel(channel); } catch (_) {} channel = null; }
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// ---------- wiring ----------
function wire() {
  const launch = (el, ev) => { if (!el || el.__calWired) return; el.__calWired = true;
    el.addEventListener("click", (e) => { e.stopPropagation(); open(ev && ev()); });
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); open(ev && ev()); } }); };
  launch($("panel-bills"));
  launch($("cal-btn"));
  launch($("brief-bills-row"));
  launch($("brief-next-row"), () => { const ev = nextEvent(); return ev ? ev.on_date : null; });
}
function start() {
  if (S.ready) return; S.ready = true;
  wire();
  load().catch((e) => console.warn("[bills]", e));
  subscribe();
}
window.CCal = { open, close, refresh: load, occurrences, data: S };
document.addEventListener("hub:ready", start);
document.addEventListener("hub:left", () => { S.ready = false; close(); unsubscribe(); });
document.addEventListener("board:updated", () => { if (S.loaded) paint(); });   // task due dates changed
document.addEventListener("visibilitychange", () => { if (!document.hidden && S.ready) load().catch(() => {}); });
const hubEl = $("hub");
if (hubEl && !hubEl.classList.contains("hidden")) start();
