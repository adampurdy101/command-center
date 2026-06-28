/* ============================================================
   EMAIL CONSOLE  ·  opens from the Daily Brief "EMAILS" line.
   Device-aware: STREAM on phones (narrow), COCKPIT on the
   computer (wide). A header toggle flips between them. Demo
   data for now (no Gmail yet); window.EmailConsole.open()/close().
   ============================================================ */
(function () {
  "use strict";

  /* ---- 14-email demo dataset (fictional) ---- */
  var T = [
    { id:1, who:'Marcus Reyes', org:'Hensel Phelps · GC', vip:1, band:'TIME', tag:'DUE FRI · 5PM', age:'9m',
      subj:'RFI #214 — Wall Shops sign-off before 5 PM',
      sum:'GC needs RFI #214 approval before 5pm or Thursday’s pour slips. Approve, or push to Thursday?',
      draft:'Marcus — approved. RFI #214 is good to proceed; go ahead with Thursday’s pour. Keep the 900mm service clearance on the north row. Loop me if the inspector flags anything. — Adam', conf:'solid' },
    { id:2, who:'Sarah Chen', org:'DPR Construction', vip:1, band:'REPLY', tag:'WAITING 1d', age:'1h',
      subj:'Western State — Wall Shops at 60% this week?',
      sum:'Sarah asks if Wall Shops hits 60% this week; your tracker says 62%. Wants a yes/no + date.',
      draft:'Yes — Wall Shops is at 62% as of this morning, locking the 60% milestone Thursday. Marked-up set to you by EOD Wednesday.', conf:'solid' },
    { id:3, who:'Mom (Linda Purdy)', org:'family', vip:1, band:'TIME', tag:'DEADLINE FRI', age:'2h',
      subj:'POA paperwork — notary Friday?',
      sum:'Mom needs to know if Friday 2pm works for the notary on the POA docs. Your calendar is clear.',
      draft:'Friday at 2 works — I’ll meet you at the bank. Want me to bring the printed POA and my ID? Love you.', conf:'hollow' },
    { id:4, who:'Dana Whitfield', org:'Tesla Legal', vip:0, band:'REPLY', tag:'WAITING 2d', age:'18h',
      subj:'Re: Lemon-law #44871 — buyback offer',
      sum:'Tesla countered with a buyback figure; Dana wants accept/decline by Monday. I don’t know your number — tell me.', draft:null, conf:null },
    { id:5, who:'Priya Nair', org:'Architect of Record', vip:1, band:'REPLY', tag:'REPLY · ⎘', age:'Tue',
      subj:'Wall shop drawings — markups attached',
      sum:'Priya sent redlines; waiting on your acceptance. 2 minor RFIs noted.',
      draft:'Redlines look good — accepted. I’ll fold the 2 RFIs into the next set.', conf:'solid' },
    { id:6, who:'Priya Nair', org:'Western State PM', vip:0, band:'REPLY', tag:'REPLY', age:'7h',
      subj:'RFI 212 — fire-rated wall penetration',
      sum:'Asks which UL detail at the corridor penetration; you used W-L-3404 last job.',
      draft:'Use UL W-L-3404 at the corridor penetration, same as gridline 7. Flag me if the rating jumps to 2-hour.', conf:'hollow' },
    { id:7, who:'Devin Park', org:'Microsoft Real Estate', vip:1, band:'VIP', tag:'VIP', age:'Yest',
      subj:'Coffee next week? Renton campus',
      sum:'Devin wants coffee near Renton; you’re open Tue/Thu PM.',
      draft:'Tuesday or Thursday afternoon both work — 2pm at the campus café?', conf:'solid' },
    { id:8, who:'Jeff Kang', org:'Counsel', vip:0, band:'REPLY', tag:'REPLY', age:'Yest',
      subj:'Re: Buyback demand — they responded',
      sum:'Counterparty responded; Jeff outlines 2 options, needs your pick by Monday.', draft:null, conf:null },
    { id:9, who:'Dr. Osei’s office', org:'Renton Clinic', vip:0, band:'REPLY', tag:'REPLY', age:'Mon',
      subj:'Confirm follow-up — 2 meds to refill',
      sum:'Confirm the follow-up + approve 2 refills (matches your 18:00 MEDS reminder).',
      draft:'Confirmed for the follow-up; please refill both. Thanks.', conf:'solid' },
    { id:10, who:'Kevin', org:'Dog walker', vip:0, band:'REPLY', tag:'REPLY', age:'Mon',
      subj:'Switching to 5:30 this week?',
      sum:'Wants to move the walk to 5:30 — one-tap yes, your calendar’s clear.',
      draft:'5:30 works all week. Thanks Kev.', conf:'solid' },
    { id:11, who:'Vertiv Investor Relations', org:'VRT', vip:0, band:'FYI', tag:'FYI · ◷', age:'Wed',
      subj:'VRT Q2 earnings call — calendar invite',
      sum:'Earnings call Aug 6. Add to calendar? You hold VRT on your watchlist.', draft:null, conf:null },
    { id:12, who:'GitHub · Actions', org:'', vip:0, band:'FYI', tag:'FYI', age:'5:40',
      subj:'[command-center] Pages deploy succeeded ✓',
      sum:'Dashboard deploy to main went green. No action.', draft:null, conf:null },
    { id:13, who:'LinkedIn', org:'', vip:0, band:'NOISE', tag:'NOISE', age:'4:12',
      subj:'9 people viewed your profile', sum:'Noise. Archive?', draft:null, conf:null },
    { id:14, who:'AIA Washington', org:'', vip:0, band:'NOISE', tag:'SNOOZE?', age:'Yest',
      subj:'Webinar: Mass timber detailing',
      sum:'Looks relevant — snooze to Saturday so you actually watch it?', draft:null, conf:null }
  ];

  var BANDMAP = { TIME:{cls:'red',tag:'red'}, REPLY:{cls:'ai',tag:'ai'}, VIP:{cls:'amb',tag:'amb'}, FYI:{cls:'dim',tag:'dim'}, NOISE:{cls:'dim',tag:'dim'} };
  var NAMES = { stream:'TRIAGE STREAM', cockpit:'HAL COCKPIT' };
  var live = T.slice(), cleared = 13, total = 201, layout = 'stream';
  var root = null, built = false, lastRemoved = null, toastTO = null;

  function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function byBand(b){ return live.filter(function(t){ return t.band === b; }); }
  function $(sel){ return root.querySelector(sel); }

  /* ---- demo actions ---- */
  function tick(){ cleared++; total = Math.max(cleared, total); updateMeters(); }
  function updateMeters(){
    var pct = Math.round(cleared / total * 100);
    root.querySelectorAll('.meter .fill').forEach(function(f){ f.style.width = pct + '%'; });
    root.querySelectorAll('.meter .pctlab').forEach(function(e){ e.textContent = cleared + ' / ' + total + ' CLEARED · ' + pct + '%'; });
    root.querySelectorAll('.gauge b').forEach(function(e){ e.textContent = cleared + ' ▸ ' + total; });
  }
  function act(id, verb){
    var el = root.querySelector('[data-id="' + id + '"]');
    if (el){ el.classList.add('leaving'); setTimeout(function(){ if (el && el.parentNode) el.parentNode.removeChild(el); }, 220); }
    live = live.filter(function(t){ return t.id !== id; });
    lastRemoved = id; tick();
    var who = (T.filter(function(t){ return t.id === id; })[0] || {}).who || '';
    note(verb.toUpperCase() + ' · ' + who, true);
  }
  function note(msg, undoable){
    var t = $('.ec-toast'); $('.ec-toast .msg').textContent = msg;
    $('.ec-toast .undo').style.display = undoable ? '' : 'none';
    t.classList.add('show'); clearTimeout(toastTO); toastTO = setTimeout(function(){ t.classList.remove('show'); }, 4000);
  }
  function undo(){ live = T.slice(); cleared = Math.max(13, cleared - 1); $('.ec-toast').classList.remove('show'); render(); }

  /* ---- shared HTML bits ---- */
  function meterHTML(){ var pct = Math.round(cleared / total * 100);
    return '<div class="meter"><div class="lab"><span>INBOX-ZERO PROGRESS</span><span class="pctlab">' + cleared + ' / ' + total + ' CLEARED · ' + pct + '%</span></div>' +
      '<div class="track"><div class="fill" style="width:' + pct + '%"></div></div></div>'; }
  function actionRow(t){
    var d = '';
    if (t.draft){
      d = '<div class="draft"><div class="dh"><span class="conf ' + t.conf + '"></span>🤖 HAL DRAFTED REPLY' + (t.conf === 'hollow' ? ' · check this one' : '') + '</div><div class="dt">' + esc(t.draft) + '</div>' +
        '<div class="ec-actions"><button class="ab go" onclick="__ec.act(' + t.id + ',\'approved+sent\')">✓ Approve + send</button><button class="ab" onclick="__ec.note(\'Opens the draft in an inline editor (coming with Gmail).\')">✎ Edit</button><button class="ab" onclick="__ec.act(' + t.id + ',\'discarded draft\')">✕ Discard</button></div></div>';
    } else if (t.band === 'REPLY' || t.band === 'VIP'){
      d = '<div class="ec-actions"><button class="ab lead" onclick="__ec.note(\'Inline composer with a ✨ Draft-with-HAL button (coming with Gmail).\')">↩ Quick reply · ✨ HAL</button></div>';
    }
    return '<div class="ec-actions"><button class="ab" onclick="__ec.act(' + t.id + ',\'archived\')">☷ Archive</button><button class="ab warn" onclick="__ec.act(' + t.id + ',\'snoozed\')">☾ Snooze</button><button class="ab" onclick="__ec.act(' + t.id + ',\'flagged\')">⚑ Flag</button><button class="ab" onclick="__ec.act(' + t.id + ',\'read\')">✓ Read</button></div>' + d;
  }

  /* ============ STREAM ============ */
  function renderStream(b){
    var pills = '<div class="pills">' +
      '<span class="pill ai on">⚑ NEEDS REPLY <b>' + byBand('REPLY').length + '</b></span>' +
      '<span class="pill amb">★ VIP <b>' + byBand('VIP').length + '</b></span>' +
      '<span class="pill red">⏰ TIME-SENSITIVE <b>' + byBand('TIME').length + '</b></span>' +
      '<span class="pill">EVERYTHING ELSE <b>' + (byBand('FYI').length + byBand('NOISE').length + 139) + '</b></span>' +
      '<span class="pill">⌂ FOLDERS</span></div>';
    var river = '<div class="river">' + meterHTML();
    var sections = [['NEEDS REPLY','REPLY','ai'],['VIP','VIP','amb'],['TIME-SENSITIVE','TIME','red'],['EVERYTHING ELSE','__rest','dim']];
    sections.forEach(function(s){
      var items = s[1] === '__rest' ? live.filter(function(t){ return t.band === 'FYI' || t.band === 'NOISE'; }) : byBand(s[1]);
      if (!items.length && s[1] !== '__rest') return;
      river += '<div class="band ' + s[2] + '"><span class="ln"></span>' + s[0] + ' · ' + items.length + '<span class="ln"></span></div>';
      items.forEach(function(t){
        if (s[1] === '__rest'){
          river += '<div class="mc noise" data-id="' + t.id + '"><div class="r1"><span class="who">' + esc(t.who) + '</span><span class="right"><span class="age">' + t.age + '</span></span></div>' +
            '<div class="subj">' + esc(t.subj) + '</div><div class="sum">▸ HAL: ' + esc(t.sum) + ' <button class="ab" style="padding:3px 7px;min-height:0" onclick="__ec.act(' + t.id + ',\'archived\')">archive</button></div></div>';
        } else {
          var bm = BANDMAP[t.band];
          river += '<div class="mc ' + bm.cls + '" data-id="' + t.id + '"><div class="r1">' + (t.vip ? '<span class="vip">★</span>' : '') + '<span class="who">' + esc(t.who) + '</span><span class="org">· ' + esc(t.org) + '</span><span class="right"><span class="tag ' + bm.tag + '">' + t.tag + '</span><span class="age">' + t.age + '</span></span></div>' +
            '<div class="subj">' + esc(t.subj) + '</div><div class="sum">▸ HAL: ' + esc(t.sum) + '</div>' + actionRow(t) + '</div>';
        }
      });
    });
    river += '<div class="nf">▸ HAL: I archived <b>140 low-priority items</b> (newsletters, receipts, promos). <button class="ab" style="display:inline-flex;margin-left:6px" onclick="__ec.note(\'Shows the cleared pile with per-item RESTORE.\')">Review plan</button></div></div>';
    b.innerHTML = '<div class="stream">' + pills + river + '</div>';
  }

  /* ============ COCKPIT ============ */
  function renderCockpit(b){
    var crail = '<div class="crail"><div class="rail">' +
      '<div class="grp">ACCOUNTS</div><div class="ri on">● gmail · adampurdy <span class="ct">201</span></div>' +
      '<div class="grp">HAL SMART-VIEWS</div>' +
      '<div class="ri ai"><span class="tick"></span>✋ Needs reply <span class="ct">' + byBand('REPLY').length + '</span></div>' +
      '<div class="ri"><span class="tick"></span>★ VIP <span class="ct">' + byBand('VIP').length + '</span></div>' +
      '<div class="ri"><span class="tick"></span>⏷ Time-sensitive <span class="ct">' + byBand('TIME').length + '</span></div>' +
      '<div class="ri"><span class="tick"></span>◔ Snoozed <span class="ct">5</span></div>' +
      '<div class="ri"><span class="tick"></span>✓ HAL-cleared <span class="ct">140</span></div>' +
      '<div class="grp">FOLDERS</div><div class="ri">Inbox <span class="ct">201</span></div><div class="ri">Flagged <span class="ct">7</span></div><div class="ri">Sent</div><div class="ri">Spam <span class="ct">18</span></div>' +
      '<div class="grp">&nbsp;</div>' + meterHTML() + '</div></div>';
    var brief = '<div class="brief"><div class="top"><div class="eye"></div>' +
      '<div class="say" id="ec-halSay"></div>' +
      '<div class="gauge">BURN-DOWN<b>' + cleared + ' ▸ ' + total + '</b>cleared today</div></div>' +
      '<div class="chips"><button class="bchip go" onclick="__ec.note(\'RUN THE PLAN: focus mode — one card at a time, fly with Approve/Edit/Skip while HAL narrates.\')">▸ RUN THE PLAN</button>' +
      '<button class="bchip ai">✋ ' + byBand('REPLY').length + ' NEED REPLY</button><button class="bchip amb">★ ' + byBand('VIP').length + ' VIP</button><button class="bchip red">⏷ ' + byBand('TIME').length + ' TIME-SENSITIVE</button>' +
      '<button class="bchip">🗑 140 NOISE — REVIEW</button><button class="bchip">✓ INBOX ZERO IN ~9 MIN</button></div></div>';
    var q = '<div class="queue"><div class="inner">';
    var ordered = byBand('TIME').concat(byBand('REPLY')).concat(byBand('VIP')).concat(byBand('FYI')).concat(byBand('NOISE'));
    ordered.forEach(function(t){ var bm = BANDMAP[t.band];
      q += '<div class="fc ' + bm.cls + '" data-id="' + t.id + '"><div class="spine"></div><div class="main">' +
        '<div class="meta">' + (t.vip ? '<span class="vip">★</span> ' : '') + '<span class="who">' + esc(t.who) + '</span><span class="org">· ' + esc(t.org) + '</span><span class="t"><span class="tag ' + bm.tag + '">' + t.tag + '</span> ' + t.age + '</span></div>' +
        '<div class="subj">' + esc(t.subj) + '</div><div class="sum">▸ HAL: ' + esc(t.sum) + '</div>' +
        (t.draft ? '<div class="inset"><div class="ih"><span style="width:8px;height:8px;border-radius:50%;' + (t.conf === 'solid' ? 'background:var(--g)' : 'border:1.5px solid var(--amb)') + '"></span>HAL DRAFT</div><div class="it">' + esc(t.draft) + '</div></div>'
          : '<div class="inset"><div class="ih">HAL</div><div class="it" style="color:var(--ai)">▸ I need your steer — what should I say?</div></div>') +
        '</div><div class="decide">' +
        (t.draft ? '<button class="ab go" onclick="__ec.act(' + t.id + ',\'approved+sent\')">APPROVE ▸</button><button class="ab" onclick="__ec.note(\'Opens the reply drawer with the draft loaded.\')">EDIT</button><button class="ab" onclick="__ec.act(' + t.id + ',\'skipped\')">SKIP</button>'
          : '<button class="ab lead" onclick="__ec.note(\'Opens compose for your steer.\')">WRITE ▸</button><button class="ab" onclick="__ec.act(' + t.id + ',\'skipped\')">SKIP</button>') +
        '<div class="qr"><button class="ab" title="archive" onclick="__ec.act(' + t.id + ',\'archived\')">☷</button><button class="ab" title="flag" onclick="__ec.act(' + t.id + ',\'flagged\')">⚑</button><button class="ab" title="snooze" onclick="__ec.act(' + t.id + ',\'snoozed\')">◔</button></div>' +
        '</div></div>';
    });
    q += '</div></div>';
    var compose = '<div class="compose"><div class="eye"></div><input placeholder="☉ Tell HAL what to send…  e.g. “thank Sarah and confirm Thursday”" /><button class="send" onclick="__ec.note(\'HAL drafts the full email, then opens it for your approval (coming with Gmail).\')">HAL DRAFTS ▸</button></div>';
    b.innerHTML = '<div class="cockpit">' + crail + brief + q + compose + '</div>';
    typeOut($('#ec-halSay'), 'Morning, Adam. ' + total + ' unread overnight. ' + byBand('REPLY').length + ' need your reply, ' + byBand('VIP').length + ' from VIPs, ' + byBand('TIME').length + ' time-sensitive — and I’ve cleared 140 as noise. Drafts are ready. Run the plan?');
  }
  function typeOut(el, txt){
    if (!el) return;
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches){ el.textContent = txt; return; }
    el.textContent = ''; var i = 0; clearInterval(el._iv);
    el._iv = setInterval(function(){ el.textContent = txt.slice(0, i++) + (i < txt.length ? '▌' : ''); if (i > txt.length) clearInterval(el._iv); }, 14);
  }

  /* ---- render + layout ---- */
  function render(){
    var b = $('.ec-body'); if (!b) return;
    if (layout === 'stream') renderStream(b); else renderCockpit(b);
    $('.ec-name').textContent = '// ' + NAMES[layout];
    root.querySelectorAll('.seg button').forEach(function(x){ x.classList.toggle('on', x.getAttribute('data-l') === layout); });
  }
  function setLayout(l){ if (l === layout || !NAMES[l]) return; layout = l; render(); }

  /* ---- build the overlay once ---- */
  function build(){
    if (built) return;
    root = document.createElement('div'); root.id = 'email-console'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Email console');
    root.innerHTML =
      '<div class="ec-top">' +
        '<button class="back">◂ COMMAND</button>' +
        '<span class="ttl"><span class="ec-eye"></span>EMAIL CONSOLE<small class="ec-name">// TRIAGE STREAM</small></span>' +
        '<span class="acct"><span class="dot"></span>gmail · adampurdy ▾</span>' +
        '<span class="ec-search"><span class="sig">›</span><input placeholder=\'from:marcus   is:unread   "deadline"\' /></span>' +
        '<span class="spacer"></span>' +
        '<div class="seg"><button data-l="stream">STREAM</button><button data-l="cockpit">COCKPIT</button></div>' +
        '<button class="x" aria-label="Close">✕</button>' +
      '</div>' +
      '<div class="ec-sub"><span class="led"></span><span>SYNCED 06:42</span><span>· 201 UNREAD · 6 NEED REPLY · 3 VIP · 2 TIME-SENSITIVE</span><span class="demo">● DEMO DATA · GMAIL NOT YET CONNECTED</span></div>' +
      '<div class="ec-body"></div>' +
      '<div class="ec-vig"></div><div class="ec-scan"></div>' +
      '<div class="ec-toast"><span class="msg"></span><button class="undo">↶ UNDO</button></div>';
    document.body.appendChild(root);
    root.querySelector('.back').addEventListener('click', close);
    root.querySelector('.x').addEventListener('click', close);
    root.querySelector('.ec-toast .undo').addEventListener('click', undo);
    root.querySelector('.seg').addEventListener('click', function(e){ var btn = e.target.closest('button'); if (btn) setLayout(btn.getAttribute('data-l')); });
    built = true;
  }

  function open(){
    build();
    live = T.slice(); cleared = 13; total = 201;        // fresh each open (demo)
    layout = (window.innerWidth < 820) ? 'stream' : 'cockpit';   // phone -> STREAM, computer -> COCKPIT
    render();
    root.classList.add('open');
    document.addEventListener('keydown', onKey);
  }
  function close(){ if (root){ root.classList.remove('open'); } document.removeEventListener('keydown', onKey); }
  function onKey(e){ if (e.key === 'Escape') close(); }

  window.EmailConsole = { open: open, close: close };
  window.__ec = { act: act, undo: undo, note: note, setLayout: setLayout };

  /* ---- wire the Daily Brief "EMAILS" line ---- */
  function wireLauncher(){
    var row = document.getElementById('brief-emails');
    if (row && !row.__wired){ row.__wired = true; row.addEventListener('click', function(e){ e.stopPropagation(); open(); }); }
  }
  document.addEventListener('hub:ready', wireLauncher);
  if (document.readyState !== 'loading') wireLauncher();
  else document.addEventListener('DOMContentLoaded', wireLauncher);
})();
