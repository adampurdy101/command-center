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

/* ---------- GLOBE (interactive 3D: starfield, day/night, atmosphere, ISS) ---------- */
(function(){
  const cv=document.getElementById('globe');let ctx=fit(cv);
  let land=null,borders=null,admin1=null;
  const graticule=(window.d3&&d3.geoGraticule10)?d3.geoGraticule10():null;
  const HOME=[-122.2,47.5];
  const DESTS={BKK:[100.5,13.7],TYO:[139.7,35.7],SEA:[-122.3,47.6],PTY:[100.88,12.93]};
  const ARCS=[[HOME,[100.5,13.7]],[HOME,[139.7,35.7]],[HOME,[151.2,-33.9]]];
  const CONTS=[{n:'NORTH AMERICA',c:[-100,45]},{n:'SOUTH AMERICA',c:[-60,-15]},{n:'EUROPE',c:[15,52]},
    {n:'AFRICA',c:[20,2]},{n:'ASIA',c:[95,45]},{n:'OCEANIA',c:[134,-25]},{n:'ANTARCTICA',c:[0,-82]}];
  let rot=[0,-18],zoom=1,lastTouch=0,drag=null,tdrag=null,pinch=null;
  let tx=0,ty=0;                                   // parallax tilt offset (px), set by effects.js
  window.__setGlobeTilt=function(ax,ay){tx=ax;ty=ay;};

  // starfield (seeded once per size)
  let stars=null;
  function seedStars(w,h){stars=[];const n=Math.min(260,Math.round(w*h/4200));
    for(let i=0;i<n;i++)stars.push({x:Math.random()*w,y:Math.random()*h,r:Math.random()*1.1+0.2,p:Math.random()*6.28,s:0.4+Math.random()*1.2,d:0.3+Math.random()*0.7});}

  // ISS live position
  let iss=null;
  function pollISS(){fetch('https://api.wheretheiss.at/v1/satellites/25544')
    .then(r=>r.json()).then(d=>{if(d&&d.latitude!=null)iss=[+d.longitude,+d.latitude];}).catch(()=>{});}
  pollISS();setInterval(pollISS,5000);

  // subsolar point (where the sun is overhead) — drives the day/night terminator
  function subSolar(){const n=new Date();
    const soy=Date.UTC(n.getUTCFullYear(),0,0);
    const doy=(Date.UTC(n.getUTCFullYear(),n.getUTCMonth(),n.getUTCDate())-soy)/86400000;
    const decl=-23.44*Math.cos((2*Math.PI/365)*(doy+10));
    const utch=n.getUTCHours()+n.getUTCMinutes()/60+n.getUTCSeconds()/3600;
    let lon=-15*(utch-12); while(lon>180)lon-=360; while(lon<-180)lon+=360;
    return [lon,decl];}

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
  window.addEventListener('resize',()=>{ctx=fit(cv);stars=null;});
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

  function draw(){
    const w=cv.width/DPR,h=cv.height/DPR;
    if(!window.d3||w<30||h<30){requestAnimationFrame(draw);return;}
    if(!stars)seedStars(w,h);
    if(!interacting() && zoom<=1.15 && now()-lastTouch>3200) rot[0]+=0.06;
    const t=now()/1000;
    ctx.save();ctx.scale(DPR,DPR);ctx.clearRect(0,0,w,h);

    // ---- starfield (twinkle) ----
    for(const s of stars){const a=(0.25+0.5*Math.abs(Math.sin(t*s.s+s.p)))*s.d;
      ctx.fillStyle='rgba(150,255,195,'+a.toFixed(3)+')';
      ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,7);ctx.fill();}

    const cx=w/2, cy=h/2;
    const baseR=Math.max(8,(Math.min(w,h)/2-12)*0.84);
    const Rd=baseR*zoom;                       // zoom GROWS the globe inside the box (box crops it)
    const proj=d3.geoOrthographic().scale(Rd).translate([cx,cy]).clipAngle(90).rotate([rot[0],rot[1],0]);
    const path=d3.geoPath(proj,ctx);

    // ---- aurora atmosphere halo (fades out as the globe fills the box) ----
    const haloA=Math.max(0,Math.min(1,1.4-zoom));
    if(haloA>0.02){
      const halo=ctx.createRadialGradient(cx,cy,Rd*0.92,cx,cy,Rd*1.32);
      halo.addColorStop(0,'rgba(65,255,126,0)');halo.addColorStop(0.45,'rgba(65,255,126,'+(0.20*haloA).toFixed(3)+')');
      halo.addColorStop(0.7,'rgba(80,255,160,'+(0.11*haloA).toFixed(3)+')');halo.addColorStop(1,'rgba(65,255,126,0)');
      ctx.save();ctx.globalCompositeOperation='lighter';ctx.fillStyle=halo;
      ctx.beginPath();ctx.arc(cx,cy,Rd*1.32,0,7);ctx.fill();ctx.restore();
    }

    // ---- sphere body ----
    ctx.save();ctx.beginPath();ctx.arc(cx,cy,Rd,0,7);ctx.clip();
    const ocean=ctx.createRadialGradient(cx-Rd*0.25,cy-Rd*0.3,Rd*0.1,cx,cy,Rd);
    ocean.addColorStop(0,'#0b2616');ocean.addColorStop(0.6,'#072011');ocean.addColorStop(1,'#040d08');
    ctx.beginPath();path({type:'Sphere'});ctx.fillStyle=ocean;ctx.fill();
    if(graticule){ctx.beginPath();path(graticule);ctx.strokeStyle='rgba(65,255,126,.12)';ctx.lineWidth=.6;ctx.stroke();}
    if(land){ctx.beginPath();path(land);ctx.fillStyle='rgba(48,232,122,.22)';ctx.fill();
      ctx.shadowColor='#41ff7e';ctx.shadowBlur=9;ctx.strokeStyle='#6dffa6';ctx.lineWidth=.95;ctx.stroke();ctx.shadowBlur=0;}
    if(borders){ctx.beginPath();path(borders);ctx.strokeStyle='rgba(125,255,176,.32)';ctx.lineWidth=.4;ctx.stroke();}
    if(admin1&&zoom>1.5){ctx.beginPath();path(admin1);ctx.strokeStyle='rgba(125,255,176,.24)';ctx.lineWidth=.35;ctx.stroke();}

    // ---- day / night terminator ----
    const ss=subSolar(), anti=[ss[0]+180,-ss[1]];
    try{const night=d3.geoCircle().center(anti).radius(90)();
      ctx.beginPath();path(night);ctx.fillStyle='rgba(1,6,4,0.5)';ctx.fill();}catch(e){}

    // ---- great-circle travel arcs ----
    ARCS.forEach(a=>{ctx.beginPath();path({type:'LineString',coordinates:a});
      ctx.strokeStyle='rgba(125,255,176,.8)';ctx.lineWidth=1.3;ctx.shadowColor='#7dffb0';ctx.shadowBlur=5;ctx.stroke();ctx.shadowBlur=0;});

    // ---- city markers (brighter as city-lights on the night side) ----
    Object.entries(DESTS).forEach(([k,p])=>{if(!vis(p))return;const xy=proj(p);
      const dark=d3.geoDistance(p,ss)>Math.PI/2;
      ctx.beginPath();ctx.arc(xy[0],xy[1],dark?3.3:2.8,0,7);
      ctx.fillStyle=dark?'#fff4cf':'#7dffb0';
      if(dark){ctx.shadowColor='#ffe7a0';ctx.shadowBlur=9;}ctx.fill();ctx.shadowBlur=0;
      ctx.fillStyle='rgba(125,255,176,.92)';ctx.font='10px ui-monospace,monospace';ctx.fillText(k,xy[0]+5,xy[1]-4);});
    if(vis(HOME)){const xy=proj(HOME);const dark=d3.geoDistance(HOME,ss)>Math.PI/2;
      ctx.beginPath();ctx.arc(xy[0],xy[1],3.6,0,7);ctx.fillStyle='#ffd24a';
      ctx.shadowColor='#ffd24a';ctx.shadowBlur=dark?12:6;ctx.fill();ctx.shadowBlur=0;}

    // ---- ISS live marker ----
    if(iss&&vis(iss)){const xy=proj(iss);
      ctx.beginPath();ctx.arc(xy[0],xy[1],2.6,0,7);ctx.fillStyle='#bfefff';
      ctx.shadowColor='#bfefff';ctx.shadowBlur=9;ctx.fill();ctx.shadowBlur=0;
      ctx.strokeStyle='rgba(191,239,255,.5)';ctx.lineWidth=.7;
      ctx.beginPath();ctx.arc(xy[0],xy[1],5.5,0,7);ctx.stroke();
      ctx.fillStyle='#bfefff';ctx.font='9px ui-monospace,monospace';ctx.fillText('ISS',xy[0]+7,xy[1]+3);}

    // ---- specular sheen + limb shading (scale with the globe) ----
    const spec=ctx.createRadialGradient(cx-Rd*0.4,cy-Rd*0.44,Rd*0.04,cx-Rd*0.18,cy-Rd*0.2,Rd*1.05);
    spec.addColorStop(0,'rgba(220,255,232,0.22)');spec.addColorStop(0.32,'rgba(120,255,176,0.06)');spec.addColorStop(1,'rgba(0,0,0,0)');
    ctx.save();ctx.globalCompositeOperation='lighter';ctx.fillStyle=spec;ctx.beginPath();ctx.arc(cx,cy,Rd,0,7);ctx.fill();ctx.restore();
    const limb=ctx.createRadialGradient(cx,cy,Rd*0.55,cx,cy,Rd);
    limb.addColorStop(0,'rgba(0,0,0,0)');limb.addColorStop(1,'rgba(0,0,0,0.4)');
    ctx.fillStyle=limb;ctx.beginPath();ctx.arc(cx,cy,Rd,0,7);ctx.fill();
    ctx.restore();

    // ---- crisp glowing rim (only while the globe still fits in the box) ----
    if(Rd < Math.min(w,h)/2 + 4){
      ctx.beginPath();ctx.arc(cx,cy,Rd,0,7);ctx.shadowColor='#41ff7e';ctx.shadowBlur=16;
      ctx.strokeStyle='rgba(165,255,205,.9)';ctx.lineWidth=1.5;ctx.stroke();ctx.shadowBlur=0;
    }
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

/* ---------- DEFENSE GRID 2.0 — waves · boss · power-ups · combos ---------- */
(function(){
  const cv=document.getElementById('game');let ctx=fit(cv);
  const W=()=>cv.width/DPR, H=()=>cv.height/DPR;
  let last=performance.now();

  // ----- enemy archetypes -----
  const TYPES={
    runner:{hp:1,sp:34,r:13,pts:10,clr:'#41ff7e',glow:'#41ff7e'},
    scout :{hp:1,sp:64,r:10,pts:15,clr:'#7df7ff',glow:'#7df7ff'},
    jumper:{hp:1,sp:40,r:12,pts:20,clr:'#ffd24a',glow:'#ffd24a'},
    tank  :{hp:3,sp:20,r:18,pts:35,clr:'#ff6b5a',glow:'#ff6b5a'},
    boss  :{hp:24,sp:16,r:34,pts:300,clr:'#ff5ad0',glow:'#ff5ad0'}
  };
  const POW=['rapid','spread','freeze','shield'];
  const POWLABEL={rapid:'RAPID',spread:'SPREAD',freeze:'FREEZE',shield:'SHIELD'};
  const POWCLR={rapid:'#ffd24a',spread:'#7df7ff',freeze:'#9ad0ff',shield:'#7dffb0'};

  let enemies=[],bullets=[],parts=[],pops=[],powers=[];
  let wave=0,score=0,lives=3,combo=0,comboT=0,best=0,bestName='---';
  let state='play';            // 'play' | 'between' | 'over'
  let betweenT=0, shake=0, aim=-Math.PI/2, firing=false, fireCd=0;
  let buffs={rapid:0,spread:0,freeze:0};
  try{const s=JSON.parse(localStorage.getItem('cc_defense_high')||'null');if(s){best=s.score|0;bestName=s.name||'---';}}catch(e){}

  function rnd(a,b){return a+Math.random()*(b-a);}
  function spawnEnemy(type){
    const c=TYPES[type],w=W();
    enemies.push({type,x:rnd(c.r+8,w-c.r-8),y:-c.r-6,hp:c.hp,maxhp:c.hp,
      sp:c.sp*rnd(.85,1.15),dx:rnd(-1,1),t:rnd(0,6),r:c.r,phase:rnd(0,6)});
  }
  function startWave(n){
    wave=n; state='play'; enemies=[];
    if(n%5===0){ spawnEnemy('boss'); for(let i=0;i<3+n/5;i++) setTimeout(()=>state==='play'&&spawnEnemy('scout'),i*600); }
    else{
      const total=Math.min(14,3+Math.round(n*1.4));
      const bag=[];
      for(let i=0;i<total;i++){
        let t='runner';const r=Math.random();
        if(n>=2&&r<0.25)t='scout'; else if(n>=3&&r<0.42)t='jumper'; else if(n>=4&&r<0.58)t='tank';
        bag.push(t);
      }
      bag.forEach((t,i)=>setTimeout(()=>{ if(state==='play') spawnEnemy(t); }, i*Math.max(220,720-n*30)));
    }
  }
  function reset(){ wave=0;score=0;lives=3;combo=0;comboT=0;enemies=[];bullets=[];parts=[];pops=[];powers=[];
    buffs={rapid:0,spread:0,freeze:0}; hideEntry(); startWave(1); last=performance.now(); }

  // ----- audio -----
  let ac=null;
  function tone(freq,dur,type,vol){try{ac=ac||new (window.AudioContext||window.webkitAudioContext)();
    const o=ac.createOscillator(),g=ac.createGain();o.type=type||'square';o.frequency.value=freq;
    o.frequency.exponentialRampToValueAtTime(Math.max(60,freq*0.4),ac.currentTime+dur);
    g.gain.value=vol||0.04;g.gain.exponentialRampToValueAtTime(0.0001,ac.currentTime+dur);
    o.connect(g);g.connect(ac.destination);o.start();o.stop(ac.currentTime+dur+0.02);}catch(e){}}

  // ----- juice -----
  function burst(x,y,clr,n){for(let i=0;i<n;i++){const a=Math.random()*6.28,s=rnd(40,210);
    parts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-30,life:1,clr,sz:rnd(1.6,3.2)});}}
  function popup(x,y,txt,clr){pops.push({x,y,txt,clr,life:1});}

  // ----- shooting -----
  function fire(){
    const w=W(),h=H(),bx=w/2,by=h-9;
    const spread=buffs.spread>performance.now();
    const angs=spread?[aim-0.22,aim,aim+0.22]:[aim];
    angs.forEach(an=>bullets.push({x:bx,y:by,vx:Math.cos(an)*560,vy:Math.sin(an)*560,life:1.4}));
    burst(bx,by,'#d6ffe0',3); shake=Math.max(shake,2); tone(820,0.06,'square',0.03);
  }
  function pointer(e){const r=cv.getBoundingClientRect();const t=e.touches?e.touches[0]:e;return {x:t.clientX-r.left,y:t.clientY-r.top};}
  function aimAt(p){const w=W(),h=H();aim=Math.atan2((p.y)-(h-9),(p.x)-(w/2)); if(aim>-0.15)aim=aim<Math.PI/2?-0.15:-Math.PI+0.15;}
  cv.addEventListener('pointerdown',e=>{e.preventDefault();const p=pointer(e);aimAt(p);
    if(state==='over')return; firing=true; if(ac&&ac.state==='suspended')ac.resume(); fire(); fireCd=0;});
  cv.addEventListener('pointermove',e=>{if(state==='over')return;const p=pointer(e);aimAt(p);});
  window.addEventListener('pointerup',()=>{firing=false;});

  // ----- high-score entry -----
  const entry=document.getElementById('hsEntry'),nameIn=document.getElementById('hsName'),saveBtn=document.getElementById('hsSave');
  function showEntry(){if(entry){entry.classList.add('show');if(nameIn){nameIn.value='';setTimeout(()=>{try{nameIn.focus();}catch(e){}},60);}}}
  function hideEntry(){if(entry)entry.classList.remove('show');}
  function saveHigh(){const v=(((nameIn&&nameIn.value)||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3))||'AAA';
    best=score;bestName=v;try{localStorage.setItem('cc_defense_high',JSON.stringify({score:best,name:bestName}));}catch(e){}hideEntry();}
  if(saveBtn)saveBtn.addEventListener('click',saveHigh);
  if(nameIn)nameIn.addEventListener('keydown',e=>{if(e.key==='Enter')saveHigh();});
  const restartBtn=document.getElementById('restartBtn');if(restartBtn)restartBtn.addEventListener('click',reset);
  window.addEventListener('resize',()=>{ctx=fit(cv);});

  // ----- enemy drawing -----
  function drawEnemy(e){
    const c=TYPES[e.type],x=e.x,y=e.y,glow=c.glow;
    ctx.save();ctx.translate(x,y);
    ctx.shadowColor=glow;ctx.shadowBlur=e.type==='boss'?16:8;
    ctx.strokeStyle=c.clr;ctx.fillStyle=c.clr;ctx.lineWidth=2;ctx.lineCap='round';
    if(e.type==='runner'||e.type==='jumper'){ const sw=Math.sin(e.t*9)*4;
      ctx.beginPath();ctx.arc(0,-9,4,0,7);ctx.fill();
      ctx.beginPath();ctx.moveTo(0,-5);ctx.lineTo(0,4);ctx.stroke();
      ctx.beginPath();ctx.moveTo(0,-2);ctx.lineTo(-6,2-sw);ctx.moveTo(0,-2);ctx.lineTo(6,2+sw);ctx.stroke();
      ctx.beginPath();ctx.moveTo(0,4);ctx.lineTo(-5+sw,11);ctx.moveTo(0,4);ctx.lineTo(5-sw,11);ctx.stroke();
    } else if(e.type==='scout'){ ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(8,6);ctx.lineTo(0,2);ctx.lineTo(-8,6);ctx.closePath();ctx.fill(); }
    else if(e.type==='tank'){ ctx.lineWidth=2.4;
      ctx.beginPath();for(let i=0;i<6;i++){const a=i/6*6.28-1.57;const px=Math.cos(a)*e.r*0.7,py=Math.sin(a)*e.r*0.7;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.stroke();
      ctx.beginPath();ctx.arc(0,0,3.5,0,7);ctx.fill();
      for(let i=0;i<e.maxhp;i++){ctx.globalAlpha=i<e.hp?1:0.25;ctx.fillRect(-e.maxhp*2.2+i*4.4,-e.r-5,3,3);}ctx.globalAlpha=1;
    } else if(e.type==='boss'){ const pls=1+0.06*Math.sin(e.t*5);
      ctx.beginPath();for(let i=0;i<8;i++){const a=i/8*6.28-1.57;const px=Math.cos(a)*e.r*pls,py=Math.sin(a)*e.r*pls;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.stroke();
      ctx.beginPath();ctx.arc(0,0,e.r*0.4,0,7);ctx.fillStyle='#ff9be6';ctx.fill();
      ctx.shadowBlur=0;ctx.restore();
      // boss HP bar
      const bw=e.r*2.2,bx=x-bw/2,byy=y-e.r-12;ctx.fillStyle='rgba(0,0,0,.5)';ctx.fillRect(bx,byy,bw,4);
      ctx.fillStyle=c.clr;ctx.fillRect(bx,byy,bw*Math.max(0,e.hp/e.maxhp),4);
      return;
    }
    ctx.shadowBlur=0;ctx.restore();
  }

  function hearts(w){ for(let i=0;i<3;i++){const x=w-12-i*13,y=11;ctx.fillStyle=i<lives?'#ff6b5a':'rgba(255,107,90,.22)';
    ctx.beginPath();ctx.moveTo(x,y+2);ctx.bezierCurveTo(x,y-1,x-4,y-1,x-4,y+1.5);ctx.bezierCurveTo(x-4,y+4,x,y+5,x,y+7);
    ctx.bezierCurveTo(x,y+5,x+4,y+4,x+4,y+1.5);ctx.bezierCurveTo(x+4,y-1,x,y-1,x,y+2);ctx.fill();} }
  function hud(w){
    ctx.font='10px ui-monospace,monospace';ctx.textAlign='left';
    ctx.fillStyle='#7dffb0';ctx.fillText('WAVE '+wave,8,12);
    ctx.fillStyle='#41ff7e';ctx.fillText('SCORE '+score,70,12);
    if(combo>1){ctx.fillStyle='#ffd24a';ctx.fillText('COMBO ×'+combo,158,12);}
    hearts(w);
    ctx.textAlign='left';ctx.fillStyle='#2bd964';ctx.fillText('HIGH '+best+' '+bestName,8,24);
    // active buff chips
    let bx=70;const nowp=performance.now();
    ['rapid','spread','freeze'].forEach(k=>{if(buffs[k]>nowp){const left=((buffs[k]-nowp)/1000).toFixed(0);
      ctx.fillStyle=POWCLR[k];ctx.fillText(POWLABEL[k]+' '+left+'s',bx,24);bx+=84;}});
  }

  function loseLife(){lives--;combo=0;shake=Math.max(shake,9);tone(160,0.25,'sawtooth',0.05);
    if(lives<=0){state='over'; if(score>best) showEntry();}}

  function draw(now){
   try{
    const dt=Math.min(0.05,(now-last)/1000);last=now;
    const w=W(),h=H(),nowp=performance.now(),frozen=buffs.freeze>nowp;
    ctx.save();ctx.scale(DPR,DPR);ctx.clearRect(0,0,w,h);
    if(shake>0){ctx.translate((Math.random()-0.5)*shake,(Math.random()-0.5)*shake);shake*=0.86;if(shake<0.4)shake=0;}

    // baseline + turret
    ctx.strokeStyle='rgba(65,255,126,.3)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,h-7);ctx.lineTo(w,h-7);ctx.stroke();
    ctx.save();ctx.translate(w/2,h-7);
    ctx.fillStyle='#ffd24a';ctx.shadowColor='#ffd24a';ctx.shadowBlur=8;
    ctx.beginPath();ctx.moveTo(-8,0);ctx.lineTo(8,0);ctx.lineTo(0,-9);ctx.closePath();ctx.fill();
    ctx.strokeStyle=buffs.rapid>nowp?'#ffd24a':'#7dffb0';ctx.lineWidth=3;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(0,-5);ctx.lineTo(Math.cos(aim)*16,-5+Math.sin(aim)*16);ctx.stroke();ctx.shadowBlur=0;ctx.restore();

    // continuous fire (rapid) while held
    if(firing&&state!=='over'){fireCd-=dt;const cd=buffs.rapid>nowp?0.09:0.18;if(fireCd<=0){fire();fireCd=cd;}}

    // bullets
    for(const b of bullets){b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;
      ctx.strokeStyle='rgba(214,255,224,.95)';ctx.lineWidth=2;ctx.shadowColor='#d6ffe0';ctx.shadowBlur=6;
      ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-b.vx*0.012,b.y-b.vy*0.012);ctx.stroke();ctx.shadowBlur=0;}

    // power-ups drifting down
    for(const p of powers){p.y+=28*dt;p.t=(p.t||0)+dt;
      ctx.save();ctx.translate(p.x,p.y);ctx.strokeStyle=POWCLR[p.type];ctx.fillStyle=POWCLR[p.type];
      ctx.shadowColor=POWCLR[p.type];ctx.shadowBlur=10;ctx.lineWidth=1.6;
      ctx.beginPath();ctx.arc(0,0,9+Math.sin(p.t*5)*1.2,0,7);ctx.stroke();
      ctx.font='7px ui-monospace,monospace';ctx.textAlign='center';ctx.fillText(POWLABEL[p.type][0],0,2.5);ctx.shadowBlur=0;ctx.restore();
    }

    // enemies move + collide
    for(const e of enemies){
      const c=TYPES[e.type];
      if(state==='play'){const sm=frozen?0.25:1;
        e.y+=e.sp*sm*dt; e.t+=dt;
        if(e.type==='jumper'){e.x+=Math.sin(e.t*3)*40*dt;} else {e.x+=e.dx*e.sp*0.35*sm*dt;}
        if(e.x<e.r){e.x=e.r;e.dx=Math.abs(e.dx);} if(e.x>w-e.r){e.x=w-e.r;e.dx=-Math.abs(e.dx);}
        if(e.y>h-7){ e.dead=true; loseLife(); burst(e.x,e.y,c.clr,10); }
      }
      drawEnemy(e);
    }
    // bullet → enemy hits
    for(const b of bullets){ if(b.life<=0)continue;
      for(const e of enemies){ if(e.dead)continue;
        if(Math.hypot(e.x-b.x,e.y-b.y)<e.r+3){ b.life=0; e.hp--; e.flash=1;
          burst(b.x,b.y,TYPES[e.type].clr,5);
          if(e.hp<=0){ e.dead=true;
            combo=comboT>0?combo+1:1; comboT=2.4;
            const gained=TYPES[e.type].pts*Math.max(1,combo);
            score+=gained; popup(e.x,e.y-6,(combo>1?'×'+combo+' ':'+')+gained, combo>1?'#ffd24a':'#7dffb0');
            burst(e.x,e.y,TYPES[e.type].clr,e.type==='boss'?40:16);
            tone(e.type==='boss'?180:640+Math.min(combo,6)*60,e.type==='boss'?0.4:0.1,'square',0.05);
            if(e.type==='boss')shake=Math.max(shake,12);
            try{navigator.vibrate&&navigator.vibrate(e.type==='boss'?40:14);}catch(_){}
            if(Math.random()<(e.type==='tank'?0.5:e.type==='boss'?1:0.10))
              powers.push({x:e.x,y:e.y,type:POW[(Math.random()*POW.length)|0],t:0});
          } else { tone(380,0.05,'square',0.03); shake=Math.max(shake,3); }
          break;
        }
      }
    }
    enemies=enemies.filter(e=>!e.dead);
    bullets=bullets.filter(b=>b.life>0 && b.y>-20 && b.x>-20 && b.x<w+20);

    // collect power-ups (bullet or fall-off)
    for(const p of powers){ if(p.y>h+12){p.dead=true;continue;}
      for(const b of bullets){ if(Math.hypot(p.x-b.x,p.y-b.y)<14){ p.dead=true; b.life=0;
        if(p.type==='shield'){lives=Math.min(3,lives+1);} else buffs[p.type]=performance.now()+7000;
        popup(p.x,p.y-8,POWLABEL[p.type],POWCLR[p.type]); tone(1040,0.18,'sine',0.05);
        try{navigator.vibrate&&navigator.vibrate(20);}catch(_){} break; } }
    }
    powers=powers.filter(p=>!p.dead);

    // particles + popups
    for(const pa of parts){pa.life-=dt*1.7;pa.x+=pa.vx*dt;pa.y+=pa.vy*dt;pa.vy+=180*dt;
      ctx.globalAlpha=Math.max(0,pa.life);ctx.fillStyle=pa.clr;ctx.fillRect(pa.x,pa.y,pa.sz,pa.sz);}
    ctx.globalAlpha=1;parts=parts.filter(p=>p.life>0);
    for(const po of pops){po.life-=dt*1.2;po.y-=22*dt;ctx.globalAlpha=Math.max(0,po.life);
      ctx.fillStyle=po.clr;ctx.font='bold 11px ui-monospace,monospace';ctx.textAlign='center';ctx.fillText(po.txt,po.x,po.y);}
    ctx.globalAlpha=1;ctx.textAlign='left';pops=pops.filter(p=>p.life>0);

    // combo timer
    if(comboT>0){comboT-=dt;if(comboT<=0)combo=0;}

    // wave progression
    if(state==='play'&&enemies.length===0&&now-last>=0){
      // wave cleared once spawns are done (no pending enemies & none on screen)
      if(!window.__cc_wavePending){ state='between'; betweenT=1.6; score+=wave*25; popup(w/2,h/2-10,'WAVE '+wave+' CLEARED  +'+wave*25,'#7dffb0'); tone(720,0.2,'sine',0.05); }
    }
    if(state==='between'){betweenT-=dt;if(betweenT<=0)startWave(wave+1);
      ctx.fillStyle='rgba(125,255,176,.9)';ctx.font='13px ui-monospace,monospace';ctx.textAlign='center';
      ctx.fillText('WAVE '+(wave+1)+' INCOMING…',w/2,h/2+14);ctx.textAlign='left';}

    hud(w);

    if(state==='over'){
      ctx.fillStyle='rgba(2,8,5,.55)';ctx.fillRect(0,0,w,h);
      ctx.textAlign='center';ctx.fillStyle='#ff6b5a';ctx.font='16px ui-monospace,monospace';
      ctx.fillText('GAME OVER',w/2,h/2-10);
      ctx.fillStyle='#7dffb0';ctx.font='12px ui-monospace,monospace';
      ctx.fillText('SCORE '+score+'  ·  WAVE '+wave,w/2,h/2+10);
      ctx.fillStyle='rgba(125,255,176,.6)';ctx.font='10px ui-monospace,monospace';
      ctx.fillText('TAP “NEW ROUND” TO PLAY AGAIN',w/2,h/2+28);ctx.textAlign='left';
    }
    ctx.restore();
   }catch(e){}
   requestAnimationFrame(draw);
  }
  // track pending spawns so a wave isn't declared clear before enemies arrive
  window.__cc_wavePending=false;
  const _startWave=startWave;
  startWave=function(n){window.__cc_wavePending=true;_startWave(n);
    const delay=(n%5===0)?(3+n/5)*600+200:Math.min(14,3+Math.round(n*1.4))*Math.max(220,720-n*30)+200;
    setTimeout(()=>{window.__cc_wavePending=false;}, delay);};
  reset();
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
