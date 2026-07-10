/* ============================================================
   GLOBE DECK · fullscreen landscape globe command mode
   ------------------------------------------------------------
   [⤢ DECK] on the globe panel → (rotate gate on portrait phones)
   → the .globe-wrap expands to fixed inset:0 (the engine's own
   ResizeObserver refits the canvas — zero engine changes) with:
     · 2.4s boot show: lift-off swell, typed title, layer cascade
     · left LIVE rail: real ISS telemetry + next-pass countdowns,
       tappable seismic watchlist, RTN/PTY chips
     · right rail: 6 LED layer toggles (persisted) + CINEMA
     · chrome auto-fade after 4s idle → full-bleed planet
     · NAKED-EYE alert when the ISS is sunlit over a dark Renton
     · CINEMA: auto-tour quake → ISS → orbital sunrise → PTY → home
   Sets window.CC_DECK_OPEN so the hub's other animations pause;
   the globe itself keeps drawing (it checks CC_GAME_OPEN only).
   ============================================================ */
(function(){
'use strict';
var COARSE=!!(window.matchMedia&&window.matchMedia('(pointer:coarse)').matches);
var R2D=180/Math.PI, D2R=Math.PI/180;
var wrap=null, deck=null, btn=null, built=false, isOpen=false, booted=false;
var lastAct=0, idleIv=0, tickIv=0, passIv=0, cine=null, cineTO=0, typeIv=0;
var bootTO=0, titleTO=0, cascIv=0, cascTO=0, cascSaved=null, tipTO=0;   // boot timers — cleared on close
var passInfo={rtn:null,pty:null}, overheadLatch=false;
var G=function(){return window.CC_GLOBE||null;};

/* ---------- tiny helpers ---------- */
function el(tag,cls,html){var e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e;}
function fmtT(sec){sec=Math.max(0,Math.round(sec));
  var h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;
  return h>0?(h+'h '+String(m).padStart(2,'0')+'m'):(String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'));}
function age(t){var m=Math.max(0,Math.round((Date.now()-t)/60000));
  return m<60?(m+'m'):(Math.round(m/60)+'h');}
function v3(ll){var la=ll[1]*D2R,lo=ll[0]*D2R;
  return [Math.cos(la)*Math.cos(lo),Math.cos(la)*Math.sin(lo),Math.sin(la)];}
function rodr(v,k,th){ // rotate v around unit axis k by th (Rodrigues)
  var c=Math.cos(th),s=Math.sin(th),d=k[0]*v[0]+k[1]*v[1]+k[2]*v[2];
  var cr=[k[1]*v[2]-k[2]*v[1],k[2]*v[0]-k[0]*v[2],k[0]*v[1]-k[1]*v[0]];
  return [v[0]*c+cr[0]*s+k[0]*d*(1-c),v[1]*c+cr[1]*s+k[1]*d*(1-c),v[2]*c+cr[2]*s+k[2]*d*(1-c)];}
function bearing(a,b){var la1=a[1]*D2R,la2=b[1]*D2R,dl=(b[0]-a[0])*D2R;
  var y=Math.sin(dl)*Math.cos(la2),x=Math.cos(la1)*Math.sin(la2)-Math.sin(la1)*Math.cos(la2)*Math.cos(dl);
  return ((Math.atan2(y,x)*R2D)+360)%360;}
function comp16(deg){var W=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return W[Math.round(deg/22.5)%16];}
function portrait(){return window.innerHeight>window.innerWidth;}

/* ---------- ISS next-pass prediction (circular-orbit estimate, labeled EST) ---------- */
function nextPass(city){
  var g=G();if(!g)return null;var st=g.state();
  if(!st.iss||!st.issPole)return null;
  var pole=v3(st.issPole),v0=v3(st.iss);
  var om=2*Math.PI/(92.9*60);              // ISS angular rate rad/s
  var er=360/86164;                        // Earth rotation deg/s
  var best=null,prev=null;
  for(var s=0;s<=21600;s+=20){             // scan 6 hours in 20s steps
    var p=rodr(v0,pole,om*s);
    var lon=Math.atan2(p[1],p[0])*R2D-er*s, lat=Math.asin(Math.max(-1,Math.min(1,p[2])))*R2D;
    lon=((lon+540)%360)-180;
    var km=g.distKm([lon,lat],city);
    if(km<800){
      // only open a pass while APPROACHING — an in-circle but receding start
      // (the current pass's tail) must not read as "next pass in 0:00"
      if(best?km<best.km:(prev!=null&&km<prev))best={sec:s,km:km};
      if(best&&km>best.km+50)return best;   // passed closest point of this pass
    }
    else if(best)return best;
    prev=km;
  }
  return best;}

/* ---------- DOM ---------- */
function build(){
  if(built)return;built=true;
  wrap=document.querySelector('.globe-wrap');if(!wrap)return;
  deck=el('div','',
    '<div class="dk-top dk-fade">'+
      '<span class="dk-title">◈ ORBITAL DECK<small id="dk-sub">GLOBAL TRACK SYS</small></span>'+
      '<span class="dk-sp"></span>'+
      '<button class="dk-exit" id="dk-exit" aria-label="Exit deck">✕ EXIT</button>'+
    '</div>'+
    '<div class="dk-boot-title" id="dk-boot-title"></div>'+
    '<div class="dk-left dk-fade">'+
      '<div class="dk-panel" id="dk-iss">'+
        '<div class="dk-h"><span class="led cyan"></span>ISS · SPACE STATION</div>'+
        '<div class="dk-row"><span>ALTITUDE</span><b id="dk-alt">—</b></div>'+
        '<div class="dk-row"><span>SPEED</span><b id="dk-vel">—</b></div>'+
        '<div class="dk-row"><span>SUNLIGHT</span><b id="dk-vis">—</b></div>'+
        '<div class="dk-row"><span>OVER RENTON</span><b class="amb" id="dk-rtn">—</b></div>'+
        '<div class="dk-row"><span>OVER PATTAYA</span><b class="amb" id="dk-pty">—</b></div>'+
        '<button class="dk-btn" id="dk-follow">► FOLLOW</button>'+
      '</div>'+
      '<div class="dk-panel" id="dk-quakes">'+
        '<div class="dk-h"><span class="led"></span>SEISMIC · 24H</div>'+
        '<div id="dk-qlist"></div>'+
      '</div>'+
      '<div class="dk-wx">'+
        '<button id="dk-wx-rtn"><small>RENTON</small><span id="dk-wx-rtn-t">—</span></button>'+
        '<button id="dk-wx-pty"><small>PATTAYA</small><span id="dk-wx-pty-t">—</span><small class="amb" id="dk-wx-pty-c"></small></button>'+
      '</div>'+
    '</div>'+
    '<div class="dk-right dk-fade" id="dk-leds"></div>'+
    '<div class="dk-alert" id="dk-alert"></div>'+
    '<div class="dk-tip" id="dk-tip"></div>'+
    '<div class="dk-brief" id="dk-brief"><div class="t" id="dk-brief-t"></div><div class="b" id="dk-brief-b"></div></div>'+
    '<div class="dk-gate" id="dk-gate">'+
      '<div class="ph"></div>'+
      '<div class="gt">ROTATE TO LANDSCAPE</div>'+
      '<div class="gs">THE DECK NEEDS THE WIDE VIEW</div>'+
      '<button class="gx" id="dk-gate-x">◂ BACK TO COMMAND</button>'+
    '</div>');
  deck.id='deck';
  wrap.appendChild(deck);

  // LED board — [key, short label, friendly name, what it shows]
  var LEDS=[
    ['seis','SEIS','SEISMIC','Live earthquakes worldwide (USGS, last 24h). Ring size = how strong.'],
    ['sat','SAT','SATELLITES','Two satellites circling Earth on their orbit tracks.'],
    ['iss','ISS','SPACE STATION','The Intl. Space Station — where astronauts live — and its flight path.'],
    ['aur','AUR','AURORA','The northern & southern lights glowing over the poles.'],
    ['arc','ARC','TRAVEL ARCS','Glowing routes arcing from home (Renton) out to other cities.'],
    ['term','TERM','DAY / NIGHT','The real sunlight line — where it is daytime vs night on Earth right now.']];
  var rail=deck.querySelector('#dk-leds');
  LEDS.forEach(function(d){
    var b=el('button','dk-led','<i></i>'+d[1]);b.dataset.k=d[0];
    b.title=d[2]+' — '+d[3];
    b.addEventListener('click',function(){var g=G();if(!g)return;
      g.layers[d[0]]=!g.layers[d[0]];g.saveLayers();paintLeds();
      showTip('<b>'+d[2]+'</b> — '+d[3]+' <span class="st">· '+(g.layers[d[0]]?'ON':'OFF')+'</span>');});
    rail.appendChild(b);});
  var cbtn=el('button','dk-cinema','▶ CINEMA');cbtn.id='dk-cinema';
  cbtn.title='CINEMA — a hands-free tour: the globe flies itself between the newest quake, the ISS, an orbital sunrise, Pattaya and home. Touch anywhere to take back control.';
  cbtn.addEventListener('click',function(){
    if(cine)stopCinema();
    else{startCinema();showTip('<b>CINEMA</b> — hands-free tour: newest quake → space station → sunrise from orbit → Pattaya → home. <span class="st">Touch to stop.</span>');}});
  rail.appendChild(cbtn);

  // wiring
  deck.querySelector('#dk-exit').addEventListener('click',close);
  deck.querySelector('#dk-gate-x').addEventListener('click',close);
  var fbtn=deck.querySelector('#dk-follow');
  fbtn.title='FOLLOW — lock the camera on the ISS so the globe turns to keep it centered as it orbits.';
  fbtn.addEventListener('click',function(){
    var g=G();if(!g)return;var on=!g.isFollowingISS();g.followISS(on);paintFollow();
    showTip('<b>FOLLOW ISS</b> — camera '+(on?'locked on the Space Station; the globe turns to keep it centered.':'released.')+'');});
  deck.querySelector('#dk-wx-rtn').addEventListener('click',function(){var g=G();if(g){var s=g.state();g.flyTo(s.home[0],s.home[1],2.1,1400);}});
  deck.querySelector('#dk-wx-pty').addEventListener('click',function(){var g=G();if(g){var s=g.state();g.flyTo(s.pty[0],s.pty[1],2.1,1400);}});

  // any interaction wakes chrome / cancels cinema
  ['pointerdown','touchstart','mousemove','wheel'].forEach(function(ev){
    wrap.addEventListener(ev,function(e){
      lastAct=Date.now();
      // any touch cancels cinema — EXCEPT on the CINEMA button itself,
      // whose click handler must see the true state to toggle it off
      if(cine&&(ev==='pointerdown'||ev==='touchstart')
        &&!(e.target&&e.target.closest&&e.target.closest('#dk-cinema')))stopCinema();
    },{capture:true,passive:true});});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&isOpen)close();});
  window.addEventListener('resize',onOrient);
  window.addEventListener('orientationchange',onOrient);
}

function paintLeds(){var g=G();if(!g||!deck)return;
  deck.querySelectorAll('.dk-led').forEach(function(b){b.classList.toggle('on',!!g.layers[b.dataset.k]);});}
function paintFollow(){var g=G();if(!g||!deck)return;
  var b=deck.querySelector('#dk-follow');
  b.classList.toggle('on',g.isFollowingISS());
  b.textContent=g.isFollowingISS()?'■ RELEASE':'► FOLLOW';}
function showTip(html){if(!deck)return;
  var t=deck.querySelector('#dk-tip');t.innerHTML=html;t.classList.add('on');
  clearTimeout(tipTO);tipTO=setTimeout(function(){t.classList.remove('on');},3400);
  lastAct=Date.now();}          // reading a tip counts as activity — don't idle-fade mid-read

/* ---------- open / close / gate ---------- */
function open(){
  build();if(!wrap||isOpen)return;
  isOpen=true;booted=false;
  window.CC_DECK_OPEN=true;
  try{document.dispatchEvent(new CustomEvent('deck:open'));}catch(e){}
  document.documentElement.classList.add('cc-deck');
  try{var rf=document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen;
    if(rf){var fp=rf.call(document.documentElement);if(fp&&fp.catch)fp.catch(function(){});}}catch(e){}
  if(COARSE&&portrait()){deck.querySelector('#dk-gate').classList.add('on');}
  else boot();
}
function onOrient(){
  if(!isOpen)return;
  if(COARSE&&portrait()){
    if(booted)close();                                   // rotating back upright leaves the deck
    else deck.querySelector('#dk-gate').classList.add('on');
  }else if(!booted){deck.querySelector('#dk-gate').classList.remove('on');boot();}
}
function close(){
  if(!isOpen)return;isOpen=false;booted=false;
  stopCinema();
  clearInterval(idleIv);clearInterval(tickIv);clearInterval(passIv);idleIv=tickIv=passIv=0;
  // kill any in-flight boot timers and restore the layer mask synchronously,
  // so a fast exit+reopen can never corrupt (or persist) a half-cascaded mask
  clearInterval(cascIv);clearTimeout(cascTO);clearTimeout(bootTO);clearTimeout(titleTO);clearTimeout(tipTO);
  cascIv=cascTO=bootTO=titleTO=tipTO=0;
  var gg=G();
  if(gg&&cascSaved){for(var k in cascSaved)gg.layers[k]=cascSaved[k];cascSaved=null;paintLeds();}
  var bt0=deck.querySelector('#dk-boot-title');if(bt0)bt0.classList.remove('on');
  document.documentElement.classList.remove('dk-boot');
  document.documentElement.classList.remove('cc-deck','dk-boot','dk-idle');
  deck.querySelector('#dk-gate').classList.remove('on');
  deck.querySelector('#dk-alert').classList.remove('on');
  window.CC_DECK_OPEN=false;
  try{document.dispatchEvent(new CustomEvent('deck:close'));}catch(e){}
  setTimeout(function(){window.dispatchEvent(new Event('resize'));},60); // refit back into the panel
  try{if(document.fullscreenElement)document.exitFullscreen();
    else if(document.webkitFullscreenElement&&document.webkitExitFullscreen)document.webkitExitFullscreen();}catch(e){}
  var g=G();if(g&&g.isFollowingISS())g.followISS(false);
}

/* ---------- boot show (plays every open) ---------- */
function boot(){
  if(booted)return;booted=true;
  var g=G();
  var html=document.documentElement;
  html.classList.add('dk-boot');
  bootTO=setTimeout(function(){bootTO=0;html.classList.remove('dk-boot');
    // the engine's ResizeObserver fired mid-scale-animation and sized the canvas
    // to the transformed rect — force a clean refit at the true fullscreen size
    window.dispatchEvent(new Event('resize'));
  },780);
  // typed title
  var bt=deck.querySelector('#dk-boot-title');bt.textContent='';bt.classList.add('on');
  typeInto(bt,'ORBITAL DECK ONLINE',26);
  titleTO=setTimeout(function(){titleTO=0;bt.classList.remove('on');},2300);
  if(g)g.pullBack();
  // layer cascade: everything dark, then flick the saved-on layers up one by one
  if(g){
    cascSaved={};for(var k in g.layers){cascSaved[k]=g.layers[k];g.layers[k]=false;}
    paintLeds();
    var order=['term','seis','sat','iss','aur','arc'],i=0;
    cascIv=setInterval(function(){
      if(i>=order.length){clearInterval(cascIv);cascIv=0;return;}
      var key=order[i++];
      if(cascSaved&&cascSaved[key]){g.layers[key]=true;paintLeds();}
    },230);
    // safety: whatever the timers did (throttled tabs clamp intervals),
    // the saved mask is fully restored by 1.8s
    cascTO=setTimeout(function(){clearInterval(cascIv);cascIv=0;cascTO=0;
      if(cascSaved){for(var k2 in cascSaved)g.layers[k2]=cascSaved[k2];cascSaved=null;}
      paintLeds();},1800);
  }
  lastAct=Date.now();
  idleIv=setInterval(function(){
    var idle=Date.now()-lastAct>4000;
    document.documentElement.classList.toggle('dk-idle',(idle&&booted)||!!cine);
  },400);
  tickIv=setInterval(railTick,1000);
  passIv=setInterval(calcPasses,30000);
  paintLeds();paintFollow();railTick();calcPasses();
}

/* ---------- live rail ---------- */
function railTick(){
  var g=G();if(!g||!isOpen)return;
  var st=g.state();
  var q=function(id){return deck.querySelector(id);};
  if(st.issInfo){
    q('#dk-alt').textContent=Math.round(st.issInfo.alt)+' KM';
    q('#dk-vel').textContent=Math.round(st.issInfo.vel).toLocaleString('en-US')+' KM/H';
    q('#dk-vis').textContent=st.issInfo.vis==='daylight'?'SUNLIT':'IN SHADOW';
  }
  q('#dk-rtn').textContent=passInfo.rtn?('T−'+fmtT(passInfo.rtn.sec)+' EST'):'—';
  q('#dk-pty').textContent=passInfo.pty?('T−'+fmtT(passInfo.pty.sec)+' EST'):'—';
  if(passInfo.rtn)passInfo.rtn.sec=Math.max(0,passInfo.rtn.sec-1);
  if(passInfo.pty)passInfo.pty.sec=Math.max(0,passInfo.pty.sec-1);
  renderQuakes(st.quakes);
  // weather chips mirror the live pin values
  var t1=document.querySelector('.wxpin[data-city="renton"] [data-f="temp"]');
  var t2=document.querySelector('.wxpin[data-city="pattaya"] [data-f="temp"]');
  var c2=document.querySelector('.wxpin[data-city="pattaya"] [data-f="clock"]');
  if(t1)q('#dk-wx-rtn-t').textContent=t1.textContent;
  if(t2)q('#dk-wx-pty-t').textContent=t2.textContent;
  if(c2)q('#dk-wx-pty-c').textContent=c2.textContent;
  paintFollow();
  checkAlerts(st,g);
}
var qStamp='';
function renderQuakes(quakes){
  if(!quakes||!quakes.length)return;
  var newest=quakes.slice().sort(function(a,b){return b.t-a.t;}).slice(0,5);
  var stamp=newest.map(function(x){return x.t;}).join(',');
  var list=deck.querySelector('#dk-qlist');
  if(stamp===qStamp){ // just refresh the ages
    list.querySelectorAll('.dk-q .ag').forEach(function(s,i){if(newest[i])s.textContent=age(newest[i].t);});
    return;}
  qStamp=stamp;list.innerHTML='';
  newest.forEach(function(qk){
    var b=el('button','dk-q'+(qk.m>=5?' big':''),
      '<b>M'+qk.m.toFixed(1)+'</b> · <span class="ag">'+age(qk.t)+'</span> · '+Math.round(qk.depth)+'km'+
      (qk.tsu?' · <span class="tsu">TSUNAMI</span>':'')+
      '<span class="pl">'+(qk.place||'—')+'</span>');
    b.addEventListener('click',function(){var g=G();if(!g)return;
      g.flyTo(qk.lon,qk.lat,2.2,1400);g.setTarget(qk.lon,qk.lat);});
    list.appendChild(b);});
}
function calcPasses(){
  var g=G();if(!g||!isOpen)return;var st=g.state();
  passInfo.rtn=nextPass(st.home);
  passInfo.pty=nextPass(st.pty);
}
/* ---------- alerts: overhead + naked-eye ---------- */
function checkAlerts(st,g){
  var al=deck.querySelector('#dk-alert'),msg='';
  var overhead=!!(st.iss&&passInfo.rtn&&passInfo.rtn.sec<=15);
  if(st.iss){
    var kmH=g.distKm(st.iss,st.home);
    var dark=g.dayState(st.home[0],st.home[1])!=='DAY';
    if(st.issInfo&&st.issInfo.vis==='daylight'&&dark&&kmH<1400){
      msg='⚠ NAKED-EYE WINDOW · RENTON · LOOK '+comp16(bearing(st.home,st.iss))+' · ISS SUNLIT';
    }else if(overhead){
      msg='▲ ISS OVERHEAD · RENTON · EST';
      // engage follow ONCE per overhead window (edge-triggered), never during cinema
      if(!overheadLatch&&!cine){g.followISS(true);paintFollow();}
    }
  }
  overheadLatch=overhead;
  al.textContent=msg;al.classList.toggle('on',!!msg);
}

/* ---------- cinema: quake → ISS → orbital sunrise → PTY → home ---------- */
function typeInto(node,txt,ms){
  clearInterval(typeIv);node.textContent='';var i=0;
  typeIv=setInterval(function(){node.textContent=txt.slice(0,++i)+(i<txt.length?'▌':'');
    if(i>=txt.length){clearInterval(typeIv);node.textContent=txt;}},ms||16);}
function brief(title,body){
  var b=deck.querySelector('#dk-brief');b.classList.add('on');
  deck.querySelector('#dk-brief-t').textContent=title;
  typeInto(deck.querySelector('#dk-brief-b'),body,14);}
function startCinema(){
  var g=G();if(!g||cine)return;
  cine={i:0};deck.querySelector('#dk-cinema').classList.add('on');
  document.documentElement.classList.add('dk-idle');
  cineStep();
}
function stopCinema(){
  if(!cine)return;cine=null;clearTimeout(cineTO);clearInterval(typeIv);
  var g=G();if(g&&g.isFollowingISS())g.followISS(false);
  deck.querySelector('#dk-brief').classList.remove('on');
  deck.querySelector('#dk-cinema').classList.remove('on');
  lastAct=Date.now();
}
function cineStep(){
  if(!cine)return;
  var g=G();if(!g){stopCinema();return;}
  var st=g.state();
  var stops=[];
  var nq=(st.quakes||[]).slice().sort(function(a,b){return b.t-a.t;})[0];
  if(nq)stops.push({n:'LATEST EARTHQUAKE',fly:[nq.lon,nq.lat,2.3],dwell:7000,
    body:'M'+nq.m.toFixed(1)+' · '+(nq.place||'—')+'\nDEPTH '+Math.round(nq.depth)+' KM · '+age(nq.t)+' AGO · USGS LIVE'});
  if(st.iss)stops.push({n:'SPACE STATION',follow:true,dwell:8000,
    body:'ISS · '+(st.issInfo?Math.round(st.issInfo.alt)+' KM UP · '+Math.round(st.issInfo.vel).toLocaleString('en-US')+' KM/H':'ACQUIRING')+
      '\n'+(st.issInfo&&st.issInfo.vis==='daylight'?'IN SUNLIGHT':'IN EARTH SHADOW')});
  stops.push({n:'SUNRISE FROM ORBIT',fly:[((st.sun[0]+88+540)%360)-180,st.sun[1]*0.5,1.15],dwell:6500,
    body:'CAMERA ON THE DAY/NIGHT LINE\nWATCH THE SUN RISE OVER EARTH’S EDGE'});
  stops.push({n:'PATTAYA · THAILAND',fly:[st.pty[0],st.pty[1],2.1],dwell:6000,
    body:'YOUR FORWARD CITY\n'+(document.querySelector('.wxpin[data-city="pattaya"] [data-f="temp"]')||{}).textContent+' · LOCAL '+((document.querySelector('.wxpin[data-city="pattaya"] [data-f="clock"]')||{}).textContent||'')});
  stops.push({n:'HOME · RENTON WA',fly:[st.home[0],st.home[1],2.0],dwell:6000,
    body:'HOME BASE\n'+(document.querySelector('.wxpin[data-city="renton"] [data-f="temp"]')||{}).textContent+' · ALL SYSTEMS GREEN'});
  // advance by the LAST-PLAYED stop's name — the list is rebuilt each step, so
  // index-based advancement repeats/skips stops when live data appears mid-tour
  var idx=0;
  if(cine.last){for(var si=0;si<stops.length;si++)if(stops[si].n===cine.last){idx=(si+1)%stops.length;break;}}
  var s=stops[idx];cine.last=s.n;
  if(g.isFollowingISS()&&!s.follow)g.followISS(false);
  if(s.follow)g.followISS(true);
  else if(s.fly)g.flyTo(s.fly[0],s.fly[1],s.fly[2],1700);
  brief(s.n,s.body);
  cineTO=setTimeout(cineStep,s.dwell+1700);
}

/* ---------- the expand button on the small panel ---------- */
function inject(){
  var w=document.querySelector('.globe-wrap');
  if(!w||document.getElementById('deck-btn'))return;
  btn=el('button','','⤢ DECK');btn.id='deck-btn';btn.type='button';
  btn.title='Expand the globe to a fullscreen command deck';
  btn.addEventListener('click',function(e){e.stopPropagation();open();});
  w.appendChild(btn);
}
if(document.readyState!=='loading')inject();
else document.addEventListener('DOMContentLoaded',inject);
document.addEventListener('hub:ready',inject);
document.addEventListener('hub:left',function(){if(isOpen)close();});

window.GlobeDeck={open:open,close:close,isOpen:function(){return isOpen;}};
})();
