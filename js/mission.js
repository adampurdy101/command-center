/* ============================================================
   MISSION CONTROL interactive layer
   ------------------------------------------------------------
   Globe (d3 orthographic) · Voice Scope · HAL 9000 voice ·
   Defense Grid game. Ported from the mission-live prototype and
   wired into the authenticated hub. The hub markup is present in
   the DOM from load (hidden until login), so these run immediately
   and re-fit their canvases when the hub is revealed (hub:ready).
   ============================================================ */
const DPR = Math.min(window.devicePixelRatio || 1, 2);
window.HAL = {speaking:false, level:0};
function fit(cv){const r=cv.getBoundingClientRect();cv.width=Math.max(2,r.width*DPR);cv.height=Math.max(2,r.height*DPR);return cv.getContext('2d');}

/* ---------- clocks ---------- */
const CITIES=[["LOCAL",0],["LAX",0],["NYC",3],["LDN",8],["BKK",14],["TYO",16]];
const citiesEl=document.getElementById('cities');
CITIES.forEach(c=>{const d=document.createElement('div');d.innerHTML=`<div class="c">${c[0]}</div><div class="t" data-off="${c[1]}">--:--</div>`;citiesEl.appendChild(d);});
function tick(){
  const now=new Date();
  document.getElementById('clk').textContent=now.toLocaleTimeString('en-US',{hour12:false});
  document.getElementById('clk12').textContent=now.toLocaleTimeString('en-US',{hour12:true,hour:'2-digit',minute:'2-digit'});
  document.getElementById('dt').textContent=now.toLocaleDateString('en-US',{weekday:'short',year:'numeric',month:'short',day:'2-digit'}).toUpperCase();
  const baseH=now.getHours();
  citiesEl.querySelectorAll('.t').forEach(el=>{
    const h=((baseH+ +el.dataset.off)%24+24)%24;
    el.textContent=String(h).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
  });
}
tick();setInterval(tick,1000);

/* ---------- GLOBE (interactive: drag-rotate, zoom, continent label) ---------- */
(function(){
  const cv=document.getElementById('globe');let ctx=fit(cv);
  let land=null,borders=null,admin1=null;
  const graticule=(window.d3&&d3.geoGraticule10)?d3.geoGraticule10():null;
  const HOME=[-122.2,47.5];
  const DESTS={BKK:[100.5,13.7],TYO:[139.7,35.7],SEA:[-122.3,47.6]};
  const ARCS=[[HOME,[100.5,13.7]],[HOME,[139.7,35.7]],[HOME,[151.2,-33.9]]];
  const CONTS=[{n:'NORTH AMERICA',c:[-100,45]},{n:'SOUTH AMERICA',c:[-60,-15]},{n:'EUROPE',c:[15,52]},
    {n:'AFRICA',c:[20,2]},{n:'ASIA',c:[95,45]},{n:'OCEANIA',c:[134,-25]},{n:'ANTARCTICA',c:[0,-82]}];
  let rot=[0,-18],zoom=1,lastTouch=0,drag=null,tdrag=null,pinch=null;
  if(window.topojson&&window.d3){
    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
      .then(r=>r.json()).then(w=>{land=topojson.feature(w,w.objects.countries);
        borders=topojson.mesh(w,w.objects.countries,(a,b)=>a!==b);}).catch(()=>{});
  }
  if(window.d3){
    fetch('https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_admin_1_states_provinces.geojson')
      .then(r=>r.json()).then(g=>{admin1={type:'FeatureCollection',features:(g.features||[]).filter(f=>{
        const c=d3.geoCentroid(f);return c[0]>=-170&&c[0]<=-30&&c[1]>=-58&&c[1]<=75;})};}).catch(()=>{});
  }
  window.addEventListener('resize',()=>{ctx=fit(cv);});
  const now=()=>performance.now();
  function continentAt(lon,lat){let best=null,bd=Infinity;for(const k of CONTS){const d=d3.geoDistance([lon,lat],k.c);if(d<bd){bd=d;best=k;}}return bd<1.0?best.n:null;}
  function rotBy(dx,dy,r0){const s=0.28/zoom;rot[0]=r0[0]+dx*s;rot[1]=Math.max(-89,Math.min(89,r0[1]-dy*s));}
  function zoomMul(m){zoom=Math.max(1,Math.min(6,zoom*m));}
  function tdist(e){const a=e.touches[0],b=e.touches[1];return Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);}
  cv.style.cursor='grab';
  cv.addEventListener('mousedown',e=>{drag={x:e.clientX,y:e.clientY,r0:rot.slice()};cv.style.cursor='grabbing';lastTouch=now();});
  window.addEventListener('mousemove',e=>{if(!drag)return;rotBy(e.clientX-drag.x,e.clientY-drag.y,drag.r0);lastTouch=now();});
  window.addEventListener('mouseup',()=>{if(drag){drag=null;cv.style.cursor='grab';lastTouch=now();}});
  cv.addEventListener('wheel',e=>{e.preventDefault();zoomMul(e.deltaY<0?1.12:0.89);lastTouch=now();},{passive:false});
  cv.addEventListener('touchstart',e=>{if(e.touches.length===1)tdrag={x:e.touches[0].clientX,y:e.touches[0].clientY,r0:rot.slice()};else if(e.touches.length===2){pinch=tdist(e);tdrag=null;}lastTouch=now();},{passive:false});
  cv.addEventListener('touchmove',e=>{e.preventDefault();if(e.touches.length===2&&pinch){const d=tdist(e);zoomMul(d/pinch);pinch=d;}else if(e.touches.length===1&&tdrag){rotBy(e.touches[0].clientX-tdrag.x,e.touches[0].clientY-tdrag.y,tdrag.r0);}lastTouch=now();},{passive:false});
  cv.addEventListener('touchend',e=>{if(e.touches.length===0){tdrag=null;pinch=null;}lastTouch=now();});
  function interacting(){return drag||tdrag||pinch;}
  function vis(p){return d3.geoDistance(p,[-rot[0],-rot[1]])<1.5;}
  let pr0=null,pr1=null,pz=null;
  function draw(){
    const w=cv.width/DPR,h=cv.height/DPR;
    if(!window.d3||w<30||h<30){requestAnimationFrame(draw);return;}
    if(!interacting() && zoom<=1.2 && now()-lastTouch>3200) rot[0]+=0.07;
    if(pr0===rot[0] && pr1===rot[1] && pz===zoom && !interacting()){requestAnimationFrame(draw);return;}
    pr0=rot[0];pr1=rot[1];pz=zoom;
    ctx.save();ctx.scale(DPR,DPR);ctx.clearRect(0,0,w,h);
    const R=Math.max(8,(Math.min(w,h)/2-10)*0.86);
    const proj=d3.geoOrthographic().scale(R*zoom).translate([w/2,h/2]).clipAngle(90).rotate([rot[0],rot[1],0]);
    const path=d3.geoPath(proj,ctx);
    ctx.save();ctx.beginPath();ctx.arc(w/2,h/2,R,0,7);ctx.clip();
    ctx.beginPath();path({type:'Sphere'});ctx.fillStyle='#06170c';ctx.fill();
    if(graticule){ctx.beginPath();path(graticule);ctx.strokeStyle='rgba(65,255,126,.13)';ctx.lineWidth=.6;ctx.stroke();}
    if(land){ctx.beginPath();path(land);ctx.fillStyle='rgba(41,255,126,.16)';ctx.fill();
      ctx.shadowColor='#41ff7e';ctx.shadowBlur=7;ctx.strokeStyle='#41ff7e';ctx.lineWidth=.8;ctx.stroke();ctx.shadowBlur=0;}
    if(borders){ctx.beginPath();path(borders);ctx.strokeStyle='rgba(125,255,176,.35)';ctx.lineWidth=.4;ctx.stroke();}
    if(admin1&&zoom>1.5){ctx.beginPath();path(admin1);ctx.strokeStyle='rgba(125,255,176,.26)';ctx.lineWidth=.35;ctx.stroke();}
    ARCS.forEach(a=>{ctx.beginPath();path({type:'LineString',coordinates:a});
      ctx.strokeStyle='rgba(125,255,176,.85)';ctx.lineWidth=1.3;ctx.shadowColor='#7dffb0';ctx.shadowBlur=5;ctx.stroke();ctx.shadowBlur=0;});
    Object.entries(DESTS).forEach(([k,p])=>{if(!vis(p))return;const xy=proj(p);
      ctx.beginPath();ctx.arc(xy[0],xy[1],3,0,7);ctx.fillStyle='#7dffb0';ctx.fill();
      ctx.fillStyle='#7dffb0';ctx.font='10px ui-monospace,monospace';ctx.fillText(k,xy[0]+5,xy[1]-4);});
    if(vis(HOME)){const xy=proj(HOME);ctx.beginPath();ctx.arc(xy[0],xy[1],3.4,0,7);ctx.fillStyle='#ffd24a';ctx.fill();}
    ctx.restore();
    ctx.beginPath();ctx.arc(w/2,h/2,R,0,7);ctx.shadowColor='#41ff7e';ctx.shadowBlur=14;
    ctx.strokeStyle='rgba(125,255,176,.85)';ctx.lineWidth=1.4;ctx.stroke();ctx.shadowBlur=0;
    ctx.restore();
    const cName=zoom>1.45?continentAt(-rot[0],-rot[1]):null;
    const cl=document.getElementById('continent');
    if(cl){if(cName){cl.textContent=cName;cl.style.opacity=Math.min(1,(zoom-1.45)/0.5).toFixed(2);}else cl.style.opacity=0;}
    const zr=document.getElementById('zoomr');if(zr)zr.textContent='ZOOM '+zoom.toFixed(1)+'×';
    requestAnimationFrame(draw);
  }
  draw();
})();

/* ---------- VOICE SCOPE (center-out mirrored bars; reacts to mic + HAL) ---------- */
(function(){
  const cv=document.getElementById('voice');let ctx=fit(cv);
  const N=60;let phase=0;let vals=new Array(N).fill(0);
  window.addEventListener('resize',()=>{ctx=fit(cv);});
  let micTried=false;
  document.getElementById('talkBtn').addEventListener('click',async()=>{
    const btn=document.getElementById('talkBtn');const led=document.getElementById('micLed');
    if(window.halUnlock) window.halUnlock();   // unlock audio silently — Hal does NOT speak on tap
    try{if(localStorage.getItem('cc_kokoro_ready')&&window.halLoadVoice)window.halLoadVoice();}catch(e){}  // warm the free voice from cache
    if(micTried) return;
    micTried=true; btn.textContent='REQUESTING MIC…';
    let stream=null;
    try{
      stream=await navigator.mediaDevices.getUserMedia({audio:true});   // explicit, clean permission prompt
    }catch(err){
      micTried=false;                          // allow a retry after the setting is changed
      if(led)led.className='led red';
      const n=(err&&err.name)||'error';
      btn.textContent=(n==='NotAllowedError'||n==='SecurityError')?'MIC BLOCKED · ALLOW IN BROWSER'
        :(n==='NotFoundError')?'NO MIC FOUND':('MIC ERROR · '+n);
      return;
    }
    try{stream.getTracks().forEach(t=>t.stop());}catch(e){}   // release; recognition re-acquires the mic
    if(led)led.className='led amb';
    const started=window.halStart&&window.halStart();
    btn.textContent=started?'LISTENING ● SAY “DADDY’S HOME”':'VOICE N/A · OPEN IN CHROME';
  });
  function draw(){
    const w=cv.width/DPR,h=cv.height/DPR;ctx.save();ctx.scale(DPR,DPR);ctx.clearRect(0,0,w,h);
    const mid=(N-1)/2,bw=w/N;phase+=0.05;
    const HAL=window.HAL||{speaking:false,level:0};
    if(HAL.speaking)HAL.level=Math.max(0.5,HAL.level-0.05);
    ctx.strokeStyle='rgba(65,255,126,.13)';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(0,h/2);ctx.lineTo(w,h/2);ctx.stroke();
    ctx.strokeStyle='rgba(65,255,126,.16)';ctx.beginPath();ctx.moveTo(w/2,3);ctx.lineTo(w/2,h-3);ctx.stroke();
    for(let i=0;i<N;i++){
      const dc=1-Math.abs(i-mid)/mid;
      let t;
      if(HAL.speaking){
        const wob=0.5+0.5*Math.sin(phase*9+i*0.7)*Math.sin(phase*3.7+i*0.3);
        t=(0.16+0.60*dc)*HAL.level*(0.55+0.45*Math.abs(wob));
      }else{
        t=(0.04+0.05*dc)*(0.6+0.4*Math.abs(Math.sin(phase+i*0.4)));
      }
      vals[i]+=(Math.min(1,t*0.95)-vals[i])*0.2;
      const v=vals[i];
      const bh=Math.max(2,v*(h-12));const x=i*bw+1;const y=(h-bh)/2;
      ctx.fillStyle=v>0.6?'#d6ffe0':(v>0.3?'#41ff7e':'#2bd964');
      ctx.shadowColor='#41ff7e';ctx.shadowBlur=v>0.55?5:2;
      ctx.fillRect(x,y,Math.max(1,bw-2),bh);
    }
    ctx.shadowBlur=0;
    if(!HAL.speaking){ctx.fillStyle='rgba(125,255,176,.5)';ctx.font='10px ui-monospace,monospace';
      ctx.textAlign='center';ctx.fillText('TAP “WAKE HAL”, THEN SAY “DADDY’S HOME”',w/2,12);ctx.textAlign='left';}
    ctx.restore();requestAnimationFrame(draw);
  }
  draw();
})();

/* ---------- DEFENSE GRID (30s rounds · hits/misses · high score) ---------- */
(function(){
  const cv=document.getElementById('game');let ctx=fit(cv);
  let guys=[],shots=[],bits=[],last=performance.now();
  const W=()=>cv.width/DPR, H=()=>cv.height/DPR;
  const ROUND=30;
  let timeLeft=ROUND,hits=0,misses=0,active=true;
  let hi=0,hiName='---';
  try{const s=JSON.parse(localStorage.getItem('cc_defense_high')||'null');if(s){hi=s.score|0;hiName=s.name||'---';}}catch(e){}
  function targetCount(){const p=1-timeLeft/ROUND;return Math.max(2,Math.round(6-p*4));}
  function speedMul(){const p=1-timeLeft/ROUND;return 1+p*1.5;}
  function newGuy(x){const dir=Math.random()<0.5?1:-1;return {x:x,y:H()-13,dir,sp:15+Math.random()*18,t:Math.random()*6,hp:1};}
  function spawnEdge(){const dir=Math.random()<0.5?1:-1;guys.push(newGuy(dir>0?-16:W()+16));guys[guys.length-1].dir=dir;}
  function reseed(){guys=[];const n=targetCount(),m=40,span=Math.max(60,W()-2*m);for(let i=0;i<n;i++)guys.push(newGuy(m+span*i/Math.max(1,n-1)));}
  function resetRound(){timeLeft=ROUND;hits=0;misses=0;active=true;shots=[];bits=[];hideEntry();reseed();last=performance.now();}
  reseed();
  window.addEventListener('resize',()=>{ctx=fit(cv);});
  const restartBtn=document.getElementById('restartBtn');if(restartBtn)restartBtn.addEventListener('click',resetRound);
  const entry=document.getElementById('hsEntry'),nameIn=document.getElementById('hsName'),saveBtn=document.getElementById('hsSave');
  function showEntry(){if(entry){entry.classList.add('show');if(nameIn){nameIn.value='';setTimeout(()=>{try{nameIn.focus();}catch(e){}},60);}}}
  function hideEntry(){if(entry)entry.classList.remove('show');}
  function saveHigh(){const v=(((nameIn&&nameIn.value)||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3))||'AAA';
    hi=hits;hiName=v;try{localStorage.setItem('cc_defense_high',JSON.stringify({score:hi,name:hiName}));}catch(e){}hideEntry();}
  if(saveBtn)saveBtn.addEventListener('click',saveHigh);
  if(nameIn)nameIn.addEventListener('keydown',e=>{if(e.key==='Enter')saveHigh();});
  function shootAt(mx,my){
    if(!active)return;
    let hit=null,hd=99;
    guys.forEach(g=>{if(g.hp<=0)return;const cy=g.y-13;const d=Math.hypot(g.x-mx,cy-my);if(Math.abs(g.x-mx)<18&&d<34&&d<hd){hd=d;hit=g;}});
    shots.push({x:W()/2,y:H()-4,tx:mx,ty:my,life:1});
    if(hit){hit.hp=0;hits++;for(let i=0;i<14;i++)bits.push({x:hit.x,y:hit.y-12,vx:(Math.random()-0.5)*150,vy:(Math.random()-0.8)*150,life:1});beep();}
    else{misses++;}
  }
  function pt(e){const r=cv.getBoundingClientRect();const t=e.changedTouches?e.changedTouches[0]:e;return {x:t.clientX-r.left,y:t.clientY-r.top};}
  cv.addEventListener('click',e=>{const p=pt(e);shootAt(p.x,p.y);});
  cv.addEventListener('touchstart',e=>{e.preventDefault();const p=pt(e);shootAt(p.x,p.y);},{passive:false});
  let ac=null;function beep(){try{ac=ac||new (window.AudioContext||window.webkitAudioContext)();
    const o=ac.createOscillator(),g=ac.createGain();o.type='square';o.frequency.value=720;
    o.frequency.exponentialRampToValueAtTime(150,ac.currentTime+0.12);g.gain.value=0.05;
    g.gain.exponentialRampToValueAtTime(0.0001,ac.currentTime+0.13);o.connect(g);g.connect(ac.destination);
    o.start();o.stop(ac.currentTime+0.14);}catch(e){}}
  function fig(g){const x=g.x,fy=g.y;ctx.strokeStyle=g.hp>0?'#41ff7e':'#2bd964';ctx.fillStyle=g.hp>0?'#7dffb0':'#2bd964';
    ctx.lineWidth=2.2;ctx.lineCap='round';ctx.shadowColor='#41ff7e';ctx.shadowBlur=7;
    ctx.beginPath();ctx.arc(x,fy-22,4,0,7);ctx.fill();
    ctx.beginPath();ctx.moveTo(x,fy-18);ctx.lineTo(x,fy-8);ctx.stroke();
    const aw=Math.sin(g.t*8)*3;
    ctx.beginPath();ctx.moveTo(x,fy-15);ctx.lineTo(x-6,fy-11-aw);ctx.moveTo(x,fy-15);ctx.lineTo(x+6,fy-11+aw);ctx.stroke();
    const sw=Math.sin(g.t*8)*4.4;
    ctx.beginPath();ctx.moveTo(x,fy-8);ctx.lineTo(x-5+sw,fy);ctx.moveTo(x,fy-8);ctx.lineTo(x+5-sw,fy);ctx.stroke();
    ctx.shadowBlur=0;ctx.lineCap='butt';}
  function hud(w){ctx.font='10px ui-monospace,monospace';ctx.textAlign='left';
    const ss=Math.max(0,Math.ceil(timeLeft));
    ctx.fillStyle=timeLeft<8?'#ffd24a':'#7dffb0';ctx.fillText('TIME 0:'+String(ss).padStart(2,'0'),8,12);
    ctx.fillStyle='#41ff7e';ctx.fillText('HITS '+String(hits).padStart(2,'0'),104,12);
    ctx.fillStyle='#ff6b5a';ctx.fillText('MISS '+String(misses).padStart(2,'0'),186,12);
    ctx.textAlign='right';ctx.fillStyle='#2bd964';ctx.fillText('HIGH '+String(hi).padStart(2,'0')+' '+hiName,w-8,12);ctx.textAlign='left';}
  function draw(now){
   try{
    const dt=Math.min(0.05,(now-last)/1000);last=now;
    const w=W(),h=H();ctx.save();ctx.scale(DPR,DPR);ctx.clearRect(0,0,w,h);
    if(active){timeLeft-=dt;if(timeLeft<=0){timeLeft=0;active=false;if(hits>hi)showEntry();}}
    ctx.strokeStyle='rgba(65,255,126,.28)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,h-12);ctx.lineTo(w,h-12);ctx.stroke();
    ctx.fillStyle='#ffd24a';ctx.beginPath();ctx.moveTo(w/2-6,h-1);ctx.lineTo(w/2+6,h-1);ctx.lineTo(w/2,h-12);ctx.closePath();ctx.fill();
    hud(w);
    const sm=speedMul();
    for(const g of guys){if(active&&g.hp>0){g.x+=g.dir*g.sp*sm*dt;g.t+=dt;
      if(g.x<14){g.x=14;g.dir=1;}if(g.x>w-14){g.x=w-14;g.dir=-1;}}fig(g);}
    guys=guys.filter(g=>g.hp>0);
    if(active){const tc=targetCount();while(guys.length<tc)spawnEdge();if(guys.length>tc)guys.length=tc;}
    for(const s of shots){s.life-=dt*5;ctx.strokeStyle='rgba(214,255,224,'+Math.max(0,s.life)+')';ctx.lineWidth=1.8;
      ctx.shadowColor='#d6ffe0';ctx.shadowBlur=6;ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.lineTo(s.tx,s.ty);ctx.stroke();ctx.shadowBlur=0;}
    shots=shots.filter(s=>s.life>0);
    for(const b of bits){b.life-=dt*1.6;b.x+=b.vx*dt;b.y+=b.vy*dt;b.vy+=170*dt;
      ctx.fillStyle='rgba(125,255,176,'+Math.max(0,b.life)+')';ctx.fillRect(b.x,b.y,2.4,2.4);}
    bits=bits.filter(b=>b.life>0);
    if(!active){ctx.textAlign='center';
      ctx.fillStyle='rgba(125,255,176,.9)';ctx.font='14px ui-monospace,monospace';
      ctx.fillText('ROUND OVER · HITS '+hits+'  MISS '+misses,w/2,h/2-4);
      ctx.fillStyle='rgba(125,255,176,.55)';ctx.font='10px ui-monospace,monospace';
      ctx.fillText('TAP “NEW ROUND” TO PLAY AGAIN',w/2,h/2+14);ctx.textAlign='left';}
    ctx.restore();
   }catch(e){}
   requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
})();

/* ---------- HAL 9000 — wake-word + calm spoken check-in ---------- */
(function(){
  const STATUS=[
    "Good evening, Adam. All systems are functioning perfectly.",
    "Hello, Adam. Every system is operating within normal parameters.",
    "Welcome back, Adam. I have been running flawlessly in your absence.",
    "I am fully operational, Adam. Every circuit is performing as intended.",
    "Good to have you back, Adam. All stations are online and stable.",
    "I am ready, Adam. Diagnostics are complete, and everything is in order.",
    "Online and standing by, Adam. The hub is entirely at your disposal."
  ];
  const TASKS=[
    "What would you like me to do for you today?",
    "Which task shall we begin with?",
    "How may I help you today, Adam?",
    "What shall I take care of for you?",
    "Where would you like to begin?"
  ];
  const TIMES=[
    "It is currently TM.",
    "The time is TM.",
    "Right now, it is TM.",
    "My chronometer reads TM.",
    "It is now TM.",
    "The current time is TM.",
    "By my clock, it is TM.",
    "TM, precisely."
  ];
  const OPENERS=[
    "Welcome home. Here is your brief.",
    "Good to have you back. Your brief:",
    "Of course. Here is where things stand.",
    "Right away. Your current status:",
    "Certainly. Here is your brief.",
    "Happy to oblige. Today's brief:"
  ];
  const ls={v:-1}, lt={v:-1}, ltm={v:-1}, lop={v:-1};
  function pick(a,last){let i;do{i=(Math.random()*a.length)|0;}while(i===last.v&&a.length>1);last.v=i;return a[i];}
  let voice=null;
  function loadVoice(){const vs=(window.speechSynthesis&&speechSynthesis.getVoices())||[];
    const us=vs.filter(v=>/en[-_]?us/i.test(v.lang)||/american/i.test(v.name));
    voice = us.find(v=>/(enhanced|premium)/i.test(v.name))
         || us.find(v=>/siri/i.test(v.name))
         || vs.find(v=>/^alex$/i.test(v.name))
         || vs.find(v=>/google us english/i.test(v.name))
         || us.find(v=>/(aaron|tom|reed|evan|nathan|fred|male)/i.test(v.name))
         || us[0]
         || vs.find(v=>/^en/i.test(v.lang)) || vs[0] || null;}
  loadVoice(); if(window.speechSynthesis)try{speechSynthesis.onvoiceschanged=loadVoice;}catch(e){}
  function banner(t){const b=document.getElementById('jarvisBanner'),el=document.getElementById('jarvisText');
    if(b&&el){el.textContent='“'+t+'”';b.classList.add('show');clearTimeout(b._to);
      b._to=setTimeout(()=>b.classList.remove('show'),Math.max(5500,t.length*95));}
    const f=document.getElementById('flash');if(f){f.classList.remove('go');void f.offsetWidth;f.classList.add('go');}}
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  let rec=null,listening=false,speaking=false,pending=false,cd=0,pendTimer=null;
  function startRec(){if(rec&&listening&&!speaking){try{rec.start();}catch(e){}}}
  function stopRec(){if(rec){try{rec.stop();}catch(e){}}}
  const HAL_VOICE_URL='https://fzsfizqkolkxkorgvtcl.supabase.co/functions/v1/hal-voice';
  let levelIv=null, halAudio=null;
  function ensureAudio(){if(!halAudio){halAudio=new Audio();halAudio.preload='auto';}return halAudio;}
  // play a tiny silent clip on a user tap to unlock audio playback (esp. iOS) without speaking
  window.halUnlock=function(){try{const a=ensureAudio();a.muted=true;
    a.src='data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
    const p=a.play();if(p&&p.then)p.then(()=>{a.pause();a.currentTime=0;a.muted=false;}).catch(()=>{a.muted=false;});}catch(e){}};

  // ---- FREE on-device voice (Kokoro) + live tuning ----
  const VOICE_DEFAULTS={voice:'am_michael',pace:0.9,depth:0.94,reverb:0.18,warmth:5500};
  let voiceCfg=Object.assign({},VOICE_DEFAULTS);
  try{const s=JSON.parse(localStorage.getItem('cc_hal_voice')||'null');if(s)voiceCfg=Object.assign({},VOICE_DEFAULTS,s);}catch(e){}
  function saveVoiceCfg(){try{localStorage.setItem('cc_hal_voice',JSON.stringify(voiceCfg));}catch(e){}}
  let kokoroTTS=null,kokoroReady=false,kokoroLoading=false,kokoroCtx=null,kokoroSrc=null;
  function halImpulse(ctx,dur=1.7,decay=2.6){const rate=ctx.sampleRate,len=Math.floor(rate*dur),b=ctx.createBuffer(2,len,rate);
    for(let c=0;c<2;c++){const d=b.getChannelData(c);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,decay);}return b;}
  async function loadKokoro(onProgress){
    if(kokoroReady)return true; if(kokoroLoading)return false; kokoroLoading=true;
    let K;
    try{({KokoroTTS:K}=await import('https://esm.sh/kokoro-js@1.2.0'));}
    catch(e){try{({KokoroTTS:K}=await import('https://cdn.jsdelivr.net/npm/kokoro-js@1.2.0/+esm'));}catch(e2){kokoroLoading=false;return false;}}
    const gpu=!!navigator.gpu;
    try{
      try{ kokoroTTS=await K.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX',{dtype:gpu?'fp32':'q8',device:gpu?'webgpu':'wasm',progress_callback:onProgress}); }
      catch(e1){ if(gpu){ kokoroTTS=await K.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX',{dtype:'q8',device:'wasm',progress_callback:onProgress}); } else throw e1; }
      kokoroReady=true; kokoroLoading=false; try{localStorage.setItem('cc_kokoro_ready','1');}catch(e){}
      return true;
    }catch(e){ kokoroLoading=false; return false; }
  }
  window.halLoadVoice=loadKokoro;
  async function kokoroSpeak(text){
    if(!kokoroReady||!kokoroTTS)return false;
    const o=voiceCfg;
    const raw=await kokoroTTS.generate(text,{voice:o.voice,speed:o.pace});
    const blob=raw.toBlob();
    if(kokoroCtx){try{kokoroCtx.close();}catch(_){}}
    const ctx=new (window.AudioContext||window.webkitAudioContext)(); kokoroCtx=ctx;
    const ab=await ctx.decodeAudioData(await blob.arrayBuffer());
    const src=ctx.createBufferSource(); src.buffer=ab; src.playbackRate.value=o.depth;
    const lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=o.warmth; lp.Q.value=0.5;
    const dry=ctx.createGain(); dry.gain.value=1;
    const conv=ctx.createConvolver(); conv.buffer=halImpulse(ctx);
    const wet=ctx.createGain(); wet.gain.value=o.reverb;
    src.connect(lp); lp.connect(dry).connect(ctx.destination); lp.connect(conv).connect(wet).connect(ctx.destination);
    if(levelIv)clearInterval(levelIv);
    levelIv=setInterval(()=>{window.HAL.level=0.5+0.5*Math.random();},110);
    kokoroSrc=src;
    src.onended=()=>{ kokoroSrc=null; if(levelIv){clearInterval(levelIv);levelIv=null;} try{ctx.close();}catch(_){} endSpeak(); };
    src.start();
    return true;
  }
  function stopSpeaking(){
    if(pendTimer){clearTimeout(pendTimer);pendTimer=null;} pending=false;
    if(kokoroSrc){try{kokoroSrc.onended=null;kokoroSrc.stop();}catch(e){}kokoroSrc=null;}
    if(kokoroCtx){try{kokoroCtx.close();}catch(e){}kokoroCtx=null;}
    try{window.speechSynthesis&&speechSynthesis.cancel();}catch(e){}
    if(halAudio){try{halAudio.pause();}catch(e){}}
    if(levelIv){clearInterval(levelIv);levelIv=null;}
    if(speaking){ endSpeak(); } else { window.HAL.speaking=false; window.HAL.level=0; }
  }
  window.halStop=stopSpeaking;
  function endSpeak(){ if(!speaking)return; if(levelIv){clearInterval(levelIv);levelIv=null;}
    speaking=false; window.HAL.speaking=false; window.HAL.level=0; cd=Date.now()+1200; }
  function browserSpeak(text){
    if(!window.speechSynthesis){endSpeak();return;}
    try{speechSynthesis.cancel();}catch(e){}
    const u=new SpeechSynthesisUtterance(text);
    if(voice)u.voice=voice; u.rate=0.82; u.pitch=0.9; u.volume=1;
    u.onboundary=()=>{window.HAL.level=1;};
    u.onend=endSpeak; u.onerror=endSpeak;
    try{speechSynthesis.speak(u);}catch(e){endSpeak();}
  }
  async function elevenSpeak(text){
    let r;
    try{ r=await fetch(HAL_VOICE_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})}); }
    catch(e){ return false; }
    if(!r.ok) return false;
    if((r.headers.get('content-type')||'').indexOf('audio')<0) return false;
    const blob=await r.blob();
    if(!blob||blob.size<400) return false;
    const url=URL.createObjectURL(blob);const a=ensureAudio();a.muted=false;
    a.onended=()=>{URL.revokeObjectURL(url);endSpeak();};
    a.onerror=()=>{URL.revokeObjectURL(url);endSpeak();};
    if(levelIv)clearInterval(levelIv);
    levelIv=setInterval(()=>{ if(a.paused||a.ended){if(levelIv){clearInterval(levelIv);levelIv=null;}}
      else {window.HAL.level=0.55+0.45*Math.random();} },110);
    a.src=url;
    try{ await a.play(); }catch(e){ if(levelIv){clearInterval(levelIv);levelIv=null;} URL.revokeObjectURL(url); return false; }
    return true;
  }
  async function say(text){
    if(speaking)return;
    banner(text);
    speaking=true; window.HAL.speaking=true; window.HAL.level=1;
    try{speechSynthesis&&speechSynthesis.cancel();}catch(e){}
    let ok=false;
    if(kokoroReady){ try{ ok=await kokoroSpeak(text); }catch(e){ ok=false; } }
    if(!ok) browserSpeak(text);
    setTimeout(()=>{ if(speaking) endSpeak(); }, Math.max(16000, text.length*260));
  }
  function panelVal(panelName,key){
    const ps=[...document.querySelectorAll('.panel')];
    const p=ps.find(x=>{const n=x.querySelector('.tb .n');return n&&n.textContent.toLowerCase().includes(panelName);});
    if(!p)return null;
    const row=[...p.querySelectorAll('.row')].find(r=>{const k=r.querySelector('.k');return k&&k.textContent.toUpperCase().includes(key);});
    const v=row&&row.querySelector('.v');return v?v.textContent.trim():null;
  }
  function buildBrief(){
    const unread=panelVal('daily brief','UNREAD')||'201';
    const flagged=panelVal('daily brief','FLAGGED')||'3';
    const tasks=panelVal('daily brief','TASKS')||'0';
    const tn=parseInt(tasks,10);
    const tphrase=(tn===0||isNaN(tn))?'no open tasks':(tasks+' open task'+(tn===1?'':'s'));
    return pick(OPENERS,lop)+" You have "+unread+" unread messages, "+flagged+" flagged, and "+tphrase+
      ". Your morning digest is ready. As for my own activities, the market agent is running, the mail agent is standing by, "+
      "and all systems remain fully operational. "+pick(TASKS,lt);
  }
  function greet(){ say(buildBrief()); }
  function tellTime(){const d=new Date();
    const tm=d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true});
    say(pick(TIMES,ltm).replace('TM',tm));}
  window.halGreet=greet; window.halTime=tellTime;
  // ---- speech recognition: bulletproof keep-alive so it listens even WHILE Hal talks ----
  let recRunning=false, keepAlive=null;
  function ensureRec(){ if(!rec||!listening||recRunning)return; try{rec.start();}catch(e){} }
  function processSpeech(t){
    const heard=document.getElementById('heard');
    if(heard&&t.trim()){heard.textContent='heard:  “'+t.trim()+'”';heard.style.opacity='1';
      clearTimeout(heard._to);heard._to=setTimeout(()=>{heard.style.opacity='0';},2800);}
    const tl=t.toLowerCase();
    // STOP hot-words — interrupt Hal even while he is mid-sentence
    if(tl.includes('stop')||tl.includes('pause')||tl.includes('shut up')||tl.includes('shutup')
      ||tl.includes('quiet')||tl.includes('enough')||tl.includes('silence')||tl.includes('shush')
      ||tl.includes('halt')||tl.includes('never mind')){
      if(speaking||pending) stopSpeaking();
      return 'stop';
    }
    if(speaking||pending)return 'busy';
    if(tl.includes('time')){ if(Date.now()>cd){cd=Date.now()+5000;tellTime();} return 'time'; }
    const wantBrief=tl.includes('daddy')||(tl.includes('wake')&&(tl.includes('hal')||tl.includes('how')||tl.includes('pal')))
      ||tl.includes('brief')||tl.includes('report')||tl.includes('what are we doing');
    if(wantBrief&&Date.now()>cd){cd=Date.now()+9000;pending=true;
      pendTimer=setTimeout(()=>{pendTimer=null;pending=false;if(!speaking)greet();},1200);return 'brief';}
    return null;
  }
  window.__halProcess=processSpeech;   // test hook: simulate a heard phrase
  window.halStart=function(){
    try{const warm=new SpeechSynthesisUtterance(' ');warm.volume=0;speechSynthesis.speak(warm);}catch(e){}
    if(!SR)return false;
    if(!rec){
      try{rec=new SR();}catch(e){return false;}
      rec.continuous=true;rec.interimResults=true;rec.lang='en-US';
      rec.onstart=()=>{recRunning=true;};
      rec.onresult=e=>{ let t=''; for(let i=e.resultIndex;i<e.results.length;i++)t+=e.results[i][0].transcript; processSpeech(t); };
      rec.onerror=ev=>{ recRunning=false; const er=ev&&ev.error;
        if(er==='not-allowed'||er==='service-not-allowed'){ listening=false;
          const b=document.getElementById('talkBtn'); if(b)b.textContent='VOICE SERVICE BLOCKED · USE CHROME';
          const l=document.getElementById('micLed'); if(l)l.className='led red'; } };
      rec.onend=()=>{ recRunning=false; if(listening) setTimeout(ensureRec,200); };
    }
    if(listening)return true;
    listening=true;
    try{rec.start();}catch(e){}
    if(!keepAlive) keepAlive=setInterval(ensureRec,1000);   // restart within 1s if it ever drops (e.g. during speech)
    return true;
  };

  (function wireVoiceUI(){
    const $=id=>document.getElementById(id);
    const cfg=$('voiceCfg'), openBtn=$('voiceCfgBtn');
    if(!cfg||!openBtn)return;
    function labels(){ $('vcPaceV').textContent=(+voiceCfg.pace).toFixed(2)+'×'; $('vcDepthV').textContent=(+voiceCfg.depth).toFixed(2)+'×';
      $('vcReverbV').textContent=Math.round(voiceCfg.reverb*100)+'%'; $('vcWarmthV').textContent=voiceCfg.warmth+' Hz'; }
    function reflect(){ $('vcVoice').value=voiceCfg.voice; $('vcPace').value=voiceCfg.pace; $('vcDepth').value=voiceCfg.depth;
      $('vcReverb').value=voiceCfg.reverb; $('vcWarmth').value=voiceCfg.warmth; labels();
      if(kokoroReady){$('vcStatus').textContent='✅ on-device voice ready';$('vcBar').style.width='100%';} }
    openBtn.addEventListener('click',()=>{ reflect(); cfg.classList.toggle('hidden'); });
    const sb=$('stopBtn'); if(sb)sb.addEventListener('click',()=>stopSpeaking());
    $('vcDone').addEventListener('click',()=>cfg.classList.add('hidden'));
    cfg.addEventListener('click',e=>{ if(e.target===cfg)cfg.classList.add('hidden'); });
    $('vcVoice').addEventListener('change',()=>{voiceCfg.voice=$('vcVoice').value;saveVoiceCfg();});
    [['vcPace','pace'],['vcDepth','depth'],['vcReverb','reverb'],['vcWarmth','warmth']].forEach(([id,k])=>{
      $(id).addEventListener('input',()=>{voiceCfg[k]=+$(id).value;labels();saveVoiceCfg();}); });
    $('vcPreset').addEventListener('click',()=>{Object.assign(voiceCfg,VOICE_DEFAULTS);reflect();saveVoiceCfg();});
    $('vcTest').addEventListener('click',()=>{ if(!speaking) say('Good evening, Adam. This is my voice. I am ready when you are.'); });
    $('vcLoad').addEventListener('click',async()=>{
      $('vcStatus').textContent='loading the free voice engine…'; $('vcLoad').disabled=true;
      const ok=await loadKokoro(p=>{ if(p&&p.status==='progress'&&p.total){const pc=Math.round(100*p.loaded/p.total);$('vcStatus').textContent='downloading model… '+pc+'%';$('vcBar').style.width=pc+'%';} });
      if(ok){$('vcStatus').textContent='✅ on-device voice ready — Hal now speaks free & unlimited.';$('vcBar').style.width='100%';}
      else{$('vcStatus').textContent='load failed — staying on browser voice. Try Chrome on a Mac.';$('vcLoad').disabled=false;}
    });
  })();
})();

/* ---------- re-fit every canvas once the hub is revealed after login ---------- */
(function(){
  function refit(){ setTimeout(()=>window.dispatchEvent(new Event('resize')),60);
                    setTimeout(()=>window.dispatchEvent(new Event('resize')),360); }
  document.addEventListener('hub:ready', refit);
  window.addEventListener('orientationchange', refit);
  if(window.screen && screen.orientation && screen.orientation.addEventListener)
    screen.orientation.addEventListener('change', refit);
})();
