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
  var NAMES = { stream:'TRIAGE STREAM', split:'COMMAND SPLIT', cockpit:'HAL COCKPIT' };
  var live = T.slice(), cleared = 13, total = 201, layout = 'stream';
  var sel = 1, splitShowRead = false;   // SPLIT: selected thread + (mobile) reading-pane toggle
  var root = null, built = false, toastTO = null, prevFocus = null, prevOverflow = '';
  var removedStack = [];                 // undo history: removed item objects, most-recent last

  /* ---- real-Gmail mode (window.Gmail bridges to the edge functions) ---- */
  var REAL = false;                      // true once connected + synced
  var connState = 'demo';                // 'demo' | 'live' | 'reconnect' | 'loading'
  var pendingOpen = false;               // open the console after returning from Google
  var REAL_ACTIONS = { archived:'archive', snoozed:'snooze', flagged:'flag', read:'read', trashed:'trash' };

  function relAge(iso){
    if (!iso) return '';
    var t = new Date(iso).getTime(); if (!isFinite(t)) return '';
    var mins = Math.floor((Date.now() - t) / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return mins + 'm';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h';
    var days = Math.floor(hrs / 24);
    if (days < 7) return days + 'd';
    try { return new Date(iso).toLocaleDateString(undefined, { month:'short', day:'numeric' }); } catch (e) { return ''; }
  }
  function bandFor(it){
    var L = it.labels || [];
    if (L.indexOf('STARRED') >= 0 || L.indexOf('IMPORTANT') >= 0) return 'VIP';
    if (L.indexOf('CATEGORY_PROMOTIONS') >= 0 || L.indexOf('CATEGORY_SOCIAL') >= 0 || L.indexOf('CATEGORY_FORUMS') >= 0) return 'NOISE';
    if (it.is_unread) return 'REPLY';
    return 'FYI';
  }
  function mapItem(it){
    var L = it.labels || [];
    return {
      id: it.gmail_msg_id, threadId: it.thread_id,
      who: it.from_name || it.from_email || '(unknown)',
      org: it.from_email || '',
      vip: (L.indexOf('STARRED') >= 0) ? 1 : 0,
      band: bandFor(it),
      tag: it.is_unread ? 'UNREAD' : '',
      age: relAge(it.received_at),
      subj: it.subject || '(no subject)',
      sum: it.snippet || '',
      draft: null, conf: null, real: true
    };
  }
  // demo summaries are HAL's voice; real ones are the email's own snippet
  function sumLine(t){ return t.real ? esc(t.sum) : 'HAL: ' + esc(t.sum); }

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
    if (!live.some(function(t){ return String(t.id) === String(id); })) return;     // already cleared — ignore
    var item = live.filter(function(t){ return String(t.id) === String(id); })[0] || {};

    if (REAL && verb !== 'skipped'){
      var ga = REAL_ACTIONS[verb];
      if (!ga){ note('Reply & compose land next — for now: archive, read, flag, snooze, trash.'); return; }  // don't remove the card
      window.Gmail.action(ga, { id: id, threadId: item.threadId }).then(function(r){
        if (r && r.reconnect){ connState = 'reconnect'; updateConnState(); note('Gmail session expired — tap Reconnect Gmail.'); }
        else if (r && (r.error || r.ok === false)){ note('Gmail didn’t accept that one — try again.'); }
      });
    }

    var reRender = (layout === 'split' && String(id) === String(sel));   // SPLIT: the reading pane must refresh
    var el = root.querySelector('[data-id="' + id + '"]');
    if (el && !reRender){ el.classList.add('leaving'); setTimeout(function(){ if (el && el.parentNode) el.parentNode.removeChild(el); }, 220); }
    live = live.filter(function(t){ return String(t.id) !== String(id); });
    if (!REAL) removedStack.push(item);                            // undo only in demo (real actions are already in Gmail)
    tick();
    note((REAL ? 'GMAIL · ' : '') + verb.toUpperCase() + ' · ' + (item.who || ''), !REAL);
    if (reRender){ sel = (live[0] || {}).id; render(); }           // advance to the next thread + refresh pane
  }
  function note(msg, undoable){
    var t = $('.ec-toast'); if (!t) return;
    t.querySelector('.msg').textContent = msg;
    t.querySelector('.undo').style.display = undoable ? '' : 'none';
    t.classList.add('show'); clearTimeout(toastTO); toastTO = setTimeout(function(){ t.classList.remove('show'); }, 4000);
  }
  function undo(){
    if (!removedStack.length){ var tt = $('.ec-toast'); if (tt) tt.classList.remove('show'); return; }
    var item = removedStack.pop();
    live.push(item);
    live.sort(function(a, b){ return T.indexOf(a) - T.indexOf(b); });   // back into inbox order
    cleared = Math.max(13, cleared - 1);
    if (layout === 'split') sel = item.id;                              // reopen the restored thread
    $('.ec-toast').classList.remove('show'); render();
  }

  /* ---- shared HTML bits ---- */
  function meterHTML(){ var pct = Math.round(cleared / total * 100);
    return '<div class="meter"><div class="lab"><span>INBOX-ZERO PROGRESS</span><span class="pctlab">' + cleared + ' / ' + total + ' CLEARED · ' + pct + '%</span></div>' +
      '<div class="track"><div class="fill" style="width:' + pct + '%"></div></div></div>'; }
  function actionRow(t){
    var d = '';
    if (t.draft){
      d = '<div class="draft"><div class="dh"><span class="conf ' + t.conf + '"></span>🤖 HAL DRAFTED REPLY' + (t.conf === 'hollow' ? ' · check this one' : '') + '</div><div class="dt">' + esc(t.draft) + '</div>' +
        '<div class="ec-actions"><button class="ab go" onclick="__ec.act(\'' + t.id + '\',\'approved+sent\')">✓ Approve + send</button><button class="ab" onclick="__ec.note(\'Opens the draft in an inline editor (coming with Gmail).\')">✎ Edit</button><button class="ab" onclick="__ec.act(\'' + t.id + '\',\'discarded draft\')">✕ Discard</button></div></div>';
    } else if (t.band === 'REPLY' || t.band === 'VIP'){
      d = '<div class="ec-actions"><button class="ab lead" onclick="__ec.note(\'Inline composer with a ✨ Draft-with-HAL button (coming with Gmail).\')">↩ Quick reply · ✨ HAL</button></div>';
    }
    return '<div class="ec-actions"><button class="ab" onclick="__ec.act(\'' + t.id + '\',\'archived\')">☷ Archive</button><button class="ab warn" onclick="__ec.act(\'' + t.id + '\',\'snoozed\')">☾ Snooze</button><button class="ab" onclick="__ec.act(\'' + t.id + '\',\'flagged\')">⚑ Flag</button><button class="ab" onclick="__ec.act(\'' + t.id + '\',\'read\')">✓ Read</button></div>' + d;
  }

  /* ============ STREAM ============ */
  function renderStream(b){
    var pills = '<div class="pills">' +
      '<span class="pill ai on">⚑ NEEDS REPLY <b>' + byBand('REPLY').length + '</b></span>' +
      '<span class="pill amb">★ VIP <b>' + byBand('VIP').length + '</b></span>' +
      '<span class="pill red">⏰ TIME-SENSITIVE <b>' + byBand('TIME').length + '</b></span>' +
      '<span class="pill">EVERYTHING ELSE <b>' + (byBand('FYI').length + byBand('NOISE').length + (REAL ? 0 : 139)) + '</b></span>' +
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
            '<div class="subj">' + esc(t.subj) + '</div><div class="sum">▸ ' + sumLine(t) + ' <button class="ab" style="padding:6px 10px" onclick="__ec.act(\'' + t.id + '\',\'archived\')">archive</button></div></div>';
        } else {
          var bm = BANDMAP[t.band];
          river += '<div class="mc ' + bm.cls + '" data-id="' + t.id + '"><div class="r1">' + (t.vip ? '<span class="vip">★</span>' : '') + '<span class="who">' + esc(t.who) + '</span><span class="org">· ' + esc(t.org) + '</span><span class="right"><span class="tag ' + bm.tag + '">' + t.tag + '</span><span class="age">' + t.age + '</span></span></div>' +
            '<div class="subj">' + esc(t.subj) + '</div><div class="sum">▸ ' + sumLine(t) + '</div>' + actionRow(t) + '</div>';
        }
      });
    });
    river += (REAL
      ? (live.length ? '' : '<div class="nf">✓ Nothing in your recent inbox to triage.</div>')
      : '<div class="nf">▸ HAL: I archived <b>140 low-priority items</b> (newsletters, receipts, promos). <button class="ab" style="display:inline-flex;margin-left:6px" onclick="__ec.note(\'Shows the cleared pile with per-item RESTORE.\')">Review plan</button></div>'
      ) + '</div>';
    b.innerHTML = '<div class="stream">' + pills + river + '</div>';
  }

  /* ============ SPLIT  (3-pane: rail · thread list · reading pane) ============ */
  function renderSplit(b){
    var rail = '<div class="rail">' +
      '<div class="grp">ACCOUNTS</div><div class="ri on">▸ GMAIL · adampurdy@ <span class="ct">201</span></div><div class="ri">＋ Add account</div>' +
      '<div class="grp">HAL SMART VIEWS</div>' +
      '<div class="ri ai on"><span class="tick"></span>◎ NEEDS REPLY <span class="ct">' + byBand('REPLY').length + '</span></div>' +
      '<div class="ri ai"><span class="tick"></span>★ VIP <span class="ct">' + byBand('VIP').length + '</span></div>' +
      '<div class="ri ai"><span class="tick"></span>◷ TODAY <span class="ct">4</span></div>' +
      '<div class="ri ai"><span class="tick"></span>☾ SNOOZED <span class="ct">5</span></div>' +
      '<div class="ri ai"><span class="tick"></span>✎ DRAFTS <span class="ct">6</span></div>' +
      '<div class="grp">FOLDERS</div>' +
      '<div class="ri">⬢ Inbox <span class="ct">201</span></div><div class="ri">● Unread <span class="ct">201</span></div><div class="ri">⚑ Flagged <span class="ct">7</span></div><div class="ri">Sent</div><div class="ri">Archive</div><div class="ri">⊘ Spam <span class="ct">18</span></div>' +
      '<div class="grp">LABELS</div><div class="ri">Western State Hosp</div><div class="ri">Tesla Legal</div><div class="ri">Newsletters <span class="ct">44</span></div>' +
      '<div class="grp">&nbsp;</div>' + meterHTML() +
      '</div>';
    var order = ['TIME','VIP','REPLY','FYI','NOISE'];
    var labels = { TIME:['⚑ URGENT · DEADLINE','red'], VIP:['★ VIP','amb'], REPLY:['◎ AWAITING YOUR REPLY','ai'], FYI:['● UNREAD',''], NOISE:['▌ EVERYTHING ELSE',''] };
    var list = '<div class="lst"><div class="lh">HAL VIEWS › NEEDS REPLY · ' + live.length + ' THREADS <button class="triage" onclick="__ec.note(\'HAL proposes a batch plan: archive 44 newsletters, snooze receipts, draft 6 VIP replies (coming with Gmail).\')">⚡ TRIAGE ALL</button></div>';
    order.forEach(function(bd){ var items = byBand(bd); if (!items.length) return; var L = labels[bd];
      list += '<div class="ldiv ' + L[1] + '">' + L[0] + ' · ' + items.length + '</div>';
      items.forEach(function(t){
        list += '<div class="li' + (String(t.id) === String(sel) ? ' on' : '') + '" data-id="' + t.id + '" onclick="__ec.sel(\'' + t.id + '\')"><div class="l1"><span class="ldot"></span>' + (t.vip ? '<span class="vip">★ </span>' : '') + '<span class="who">' + esc(t.who) + '</span><span class="t">' + t.age + '</span></div><div class="l2">' + esc(t.subj) + '</div><div class="l3">⟁ ' + sumLine(t) + '</div></div>';
      });
    });
    list += '</div>';
    var t = live.filter(function(x){ return String(x.id) === String(sel); })[0] || live[0];
    var read = '<div class="read">';
    if (t){
      read += '<div class="ra"><button class="ab back-list" onclick="__ec.unsel()">◂ LIST</button><button class="ab lead" onclick="__ec.note(\'Opens the reply editor with the HAL draft loaded (coming with Gmail).\')">↩ Reply</button><button class="ab" onclick="__ec.note(\'Reply-all composer (coming with Gmail).\')">↩↩ All</button><button class="ab" onclick="__ec.note(\'Forward composer (coming with Gmail).\')">→ Fwd</button><button class="ab" onclick="__ec.act(\'' + t.id + '\',\'archived\')">☷ Archive</button><button class="ab warn" onclick="__ec.act(\'' + t.id + '\',\'snoozed\')">☾ Snooze</button><button class="ab" onclick="__ec.act(\'' + t.id + '\',\'flagged\')">⚑</button><button class="ab" onclick="__ec.act(\'' + t.id + '\',\'trashed\')">⌫</button></div>' +
        '<div class="rbody"><div class="rh">' + esc(t.subj) + '</div><div class="rmeta">' + (t.vip ? '★ ' : '') + esc(t.who) + ' · ' + esc(t.org || '') + ' · ' + t.age + '</div>' +
        '<div class="tbrief"><div class="bh">⟁ HAL THREAD BRIEF' + (t.tag ? ' · ' + t.tag : '') + '</div><div class="bt">' + esc(t.sum) + '</div>' +
        '<ul>' + (t.draft ? '<li>Recommended reply ready below — review and send.</li>' : '<li>HAL needs your steer on this one.</li>') + '</ul></div>' +
        '<div class="msgtxt">' + esc(t.who) + ' wrote:\n\n' + esc(t.subj) + '.\n\n' + esc(t.sum) + '\n\n— sent from ' + esc(t.org || 'mail') + '</div></div>' +
        '<div class="reply"><div class="rchips">' + (t.draft ? '<button class="ab go" onclick="__ec.note(\'The HAL draft is already loaded in the box below — edit then Send.\')">✓ Use HAL draft</button>' : '<button class="ab lead" onclick="__ec.note(\'HAL will draft a reply here once Gmail is connected.\')">✨ Draft with HAL</button>') + '<button class="ab" onclick="__ec.note(\'Tone control — shortens the draft (coming with Gmail).\')">Shorter</button><button class="ab" onclick="__ec.note(\'Tone control — warmer phrasing (coming with Gmail).\')">Warmer</button><button class="ab" onclick="__ec.note(\'HAL regenerates the draft (coming with Gmail).\')">↻ Regenerate</button></div>' +
        '<textarea spellcheck="false">' + esc(t.draft || '') + '</textarea><div class="ec-actions"><button class="ab go" onclick="__ec.act(\'' + t.id + '\',\'sent\')">▸ Send</button><button class="ab" onclick="__ec.act(\'' + t.id + '\',\'sent + archived\')">⌥ Send + Archive</button></div></div>';
    } else { read += '<div class="empty">Select a thread.<br><br>HAL is standing by with summaries + drafted replies.</div>'; }
    read += '</div>';
    b.innerHTML = '<div class="split' + (splitShowRead ? ' show-read' : '') + '">' + rail + list + read + '</div>';
  }
  function selThread(id){ sel = id; splitShowRead = true; render(); }
  function unsel(){ splitShowRead = false; render(); }

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
      '<button class="bchip ai" onclick="__ec.note(\'Filters the queue to the ' + byBand('REPLY').length + ' awaiting your reply (coming with Gmail).\')">✋ ' + byBand('REPLY').length + ' NEED REPLY</button><button class="bchip amb" onclick="__ec.note(\'Filters to VIP senders (coming with Gmail).\')">★ ' + byBand('VIP').length + ' VIP</button><button class="bchip red" onclick="__ec.note(\'Filters to time-sensitive items (coming with Gmail).\')">⏷ ' + byBand('TIME').length + ' TIME-SENSITIVE</button>' +
      '<button class="bchip" onclick="__ec.note(\'Shows the 140 items HAL cleared as noise, with per-item RESTORE (coming with Gmail).\')">🗑 140 NOISE — REVIEW</button><button class="bchip" onclick="__ec.note(\'Projected time to inbox zero at your current pace.\')">✓ INBOX ZERO IN ~9 MIN</button></div></div>';
    var q = '<div class="queue"><div class="inner">';
    var ordered = byBand('TIME').concat(byBand('REPLY')).concat(byBand('VIP')).concat(byBand('FYI')).concat(byBand('NOISE'));
    ordered.forEach(function(t){ var bm = BANDMAP[t.band];
      q += '<div class="fc ' + bm.cls + '" data-id="' + t.id + '"><div class="spine"></div><div class="main">' +
        '<div class="meta">' + (t.vip ? '<span class="vip">★</span> ' : '') + '<span class="who">' + esc(t.who) + '</span><span class="org">· ' + esc(t.org) + '</span><span class="t"><span class="tag ' + bm.tag + '">' + t.tag + '</span> ' + t.age + '</span></div>' +
        '<div class="subj">' + esc(t.subj) + '</div><div class="sum">▸ ' + sumLine(t) + '</div>' +
        (t.draft ? '<div class="inset"><div class="ih"><span style="width:8px;height:8px;border-radius:50%;' + (t.conf === 'solid' ? 'background:var(--g)' : 'border:1.5px solid var(--amb)') + '"></span>HAL DRAFT</div><div class="it">' + esc(t.draft) + '</div></div>'
          : '<div class="inset"><div class="ih">HAL</div><div class="it" style="color:var(--ai)">▸ I need your steer — what should I say?</div></div>') +
        '</div><div class="decide">' +
        (t.draft ? '<button class="ab go" onclick="__ec.act(\'' + t.id + '\',\'approved+sent\')">APPROVE ▸</button><button class="ab" onclick="__ec.note(\'Opens the reply drawer with the draft loaded.\')">EDIT</button><button class="ab" onclick="__ec.act(\'' + t.id + '\',\'skipped\')">SKIP</button>'
          : '<button class="ab lead" onclick="__ec.note(\'Opens compose for your steer.\')">WRITE ▸</button><button class="ab" onclick="__ec.act(\'' + t.id + '\',\'skipped\')">SKIP</button>') +
        '<div class="qr"><button class="ab" title="archive" onclick="__ec.act(\'' + t.id + '\',\'archived\')">☷</button><button class="ab" title="flag" onclick="__ec.act(\'' + t.id + '\',\'flagged\')">⚑</button><button class="ab" title="snooze" onclick="__ec.act(\'' + t.id + '\',\'snoozed\')">◔</button></div>' +
        '</div></div>';
    });
    q += '</div></div>';
    var compose = '<div class="compose"><div class="eye"></div><input placeholder="☉ Tell HAL what to send…  e.g. “thank Sarah and confirm Thursday”" /><button class="send" onclick="__ec.note(\'HAL drafts the full email, then opens it for your approval (coming with Gmail).\')">HAL DRAFTS ▸</button></div>';
    b.innerHTML = '<div class="cockpit">' + crail + brief + q + compose + '</div>';
    var halLine = REAL
      ? ('Connected to Gmail. Showing your ' + live.length + ' most recent — ' + live.filter(function(t){ return t.tag; }).length + ' unread. Archive, read, flag, snooze & trash work now; HAL summaries + drafts come next.')
      : ('Morning, Adam. ' + total + ' unread overnight. ' + byBand('REPLY').length + ' need your reply, ' + byBand('VIP').length + ' from VIPs, ' + byBand('TIME').length + ' time-sensitive — and I’ve cleared 140 as noise. Drafts are ready. Run the plan?');
    typeOut($('#ec-halSay'), halLine);
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
    var say = b.querySelector('#ec-halSay'); if (say && say._iv) clearInterval(say._iv);   // kill any running typewriter before we blow away the DOM
    if (connState === 'loading'){ b.innerHTML = '<div class="ec-loading">◴ syncing your inbox…</div>'; updateConnState(); return; }
    if (layout === 'stream') renderStream(b); else if (layout === 'split') renderSplit(b); else renderCockpit(b);
    $('.ec-name').textContent = '// ' + NAMES[layout];
    root.querySelectorAll('.seg button').forEach(function(x){ x.classList.toggle('on', x.getAttribute('data-l') === layout); });
    updateConnState();
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
        '<div class="seg"><button data-l="stream">STREAM</button><button data-l="split">SPLIT</button><button data-l="cockpit">COCKPIT</button></div>' +
        '<button class="x" aria-label="Close">✕</button>' +
      '</div>' +
      '<div class="ec-sub"><span class="led"></span><span class="ec-status">CONNECTING…</span><span class="ec-conn"></span></div>' +
      '<div class="ec-body"></div>' +
      '<div class="ec-vig"></div><div class="ec-scan"></div>' +
      '<div class="ec-toast"><span class="msg"></span><button class="undo">↶ UNDO</button></div>';
    document.body.appendChild(root);
    root.setAttribute('tabindex', '-1');                 // so the dialog can take focus on open
    root.querySelector('.back').addEventListener('click', close);
    root.querySelector('.x').addEventListener('click', close);
    root.querySelector('.ec-toast .undo').addEventListener('click', undo);
    root.querySelector('.seg').addEventListener('click', function(e){ var btn = e.target.closest('button'); if (btn) setLayout(btn.getAttribute('data-l')); });
    // delegated stubs for the controls rebuilt inside .ec-body each render (rail filters, compose Enter)
    var body = root.querySelector('.ec-body');
    body.addEventListener('click', function(e){ if (e.target.closest('.rail .ri')) note('Smart-views, folders & labels become live filters once Gmail is connected.'); });
    body.addEventListener('keydown', function(e){ if (e.key === 'Enter' && e.target.matches && e.target.matches('.compose input')) note('HAL drafts the full email, then opens it for your approval (coming with Gmail).'); });
    var srch = root.querySelector('.ec-search input');
    if (srch) srch.addEventListener('keydown', function(e){ if (e.key === 'Enter') note('Search runs against Gmail once connected — the demo set isn\'t searchable yet.'); });
    var acct = root.querySelector('.acct');
    if (acct){ acct.style.cursor = 'pointer'; acct.addEventListener('click', function(){ note('Multi-account switching (iCloud next) arrives later.'); }); }
    var sub = root.querySelector('.ec-sub');
    if (sub) sub.addEventListener('click', function(e){ if (e.target.closest('.ec-connect') && window.Gmail){ window.Gmail.connect(); } });
    built = true;
  }

  function open(){
    build();
    splitShowRead = false;
    removedStack = [];
    layout = (window.innerWidth < 820) ? 'stream' : 'cockpit';   // phone -> STREAM, computer -> COCKPIT
    if (!root.classList.contains('open')){ prevOverflow = document.body.style.overflow; prevFocus = document.activeElement; }
    root.classList.add('open');
    document.body.style.overflow = 'hidden';            // lock the dashboard scroll behind the overlay
    try { root.focus(); } catch (e) {}                  // move focus into the dialog
    document.addEventListener('keydown', onKey);
    loadAndRender();
  }
  // Decide the data source: live Gmail if connected, otherwise the demo set.
  function loadAndRender(){
    if (window.Gmail && typeof window.Gmail.sync === 'function'){
      connState = 'loading'; live = []; cleared = 0; total = 1; render();
      window.Gmail.sync().then(function(res){
        if (res && res.connected){
          REAL = true; connState = 'live';
          live = (res.items || []).map(mapItem);
          sel = (live[0] || {}).id;
          total = Math.max(live.length, 1);
          cleared = live.filter(function(t){ return !t.tag; }).length;   // read = "cleared"
        } else if (res && res.reconnect){
          REAL = false; connState = 'reconnect'; live = T.slice(); sel = T[0].id; cleared = 13; total = 201;
        } else {
          REAL = false; connState = 'demo'; live = T.slice(); sel = T[0].id; cleared = 13; total = 201;
        }
        render();
      });
    } else {
      REAL = false; connState = 'demo'; live = T.slice(); sel = T[0].id; cleared = 13; total = 201; render();
    }
  }
  // header status line + Connect / Reconnect button
  function updateConnState(){
    var st = root.querySelector('.ec-status'), cn = root.querySelector('.ec-conn');
    if (!st || !cn) return;
    if (connState === 'live'){
      var unread = live.filter(function(t){ return t.tag; }).length;
      st.textContent = 'LIVE · gmail · adampurdy101@gmail.com · ' + live.length + ' shown · ' + unread + ' unread';
      st.className = 'ec-status live';
      cn.innerHTML = '<button class="ec-connect ghost" type="button">↻ Reconnect</button>';
    } else if (connState === 'loading'){
      st.textContent = 'SYNCING GMAIL…'; st.className = 'ec-status'; cn.innerHTML = '';
    } else if (connState === 'reconnect'){
      st.textContent = 'GMAIL NOT CONNECTED · showing sample inbox'; st.className = 'ec-status demo';
      cn.innerHTML = '<button class="ec-connect" type="button">⚡ CONNECT GMAIL</button>';
    } else {
      st.textContent = 'DEMO DATA · sample inbox'; st.className = 'ec-status demo';
      cn.innerHTML = '<button class="ec-connect" type="button">⚡ CONNECT GMAIL</button>';
    }
  }
  function close(){
    if (root){ root.classList.remove('open'); }
    clearTimeout(toastTO);
    var say = root && root.querySelector('#ec-halSay'); if (say && say._iv) clearInterval(say._iv);
    document.body.style.overflow = prevOverflow || '';  // restore background scroll
    document.removeEventListener('keydown', onKey);
    if (prevFocus && prevFocus.focus){ try { prevFocus.focus(); } catch (e) {} prevFocus = null; }
  }
  function onKey(e){ if (e.key === 'Escape') close(); }

  window.EmailConsole = { open: open, close: close };
  window.__ec = { act: act, undo: undo, note: note, setLayout: setLayout, sel: selThread, unsel: unsel };

  /* ---- wire the Daily Brief "EMAILS" line ---- */
  function wireLauncher(){
    var row = document.getElementById('brief-emails');
    if (row && !row.__wired){
      row.__wired = true;
      row.addEventListener('click', function(e){ e.stopPropagation(); open(); });
      row.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar'){ e.preventDefault(); open(); } });
    }
  }
  document.addEventListener('hub:ready', wireLauncher);
  if (document.readyState !== 'loading') wireLauncher();
  else document.addEventListener('DOMContentLoaded', wireLauncher);

  /* ---- return trip from Google (events fired by js/gmail.js) ---- */
  document.addEventListener('gmail:connected', function(){
    var hub = document.getElementById('hub');
    if (hub && !hub.classList.contains('hidden')) open();   // hub already up → open the console (it syncs)
    else pendingOpen = true;                                 // otherwise wait for hub:ready
  });
  document.addEventListener('gmail:error', function(e){
    var why = (e && e.detail) ? e.detail : 'error';
    alert('Gmail connection didn’t finish (' + why + '). You can tap “Connect Gmail” to try again.');
  });
  document.addEventListener('hub:ready', function(){ if (pendingOpen){ pendingOpen = false; setTimeout(open, 500); } });
  // on logout the hub leaves — make sure this full-screen overlay doesn't linger over the login screen
  document.addEventListener('hub:left', function(){ try { close(); } catch (e) {} });
})();
