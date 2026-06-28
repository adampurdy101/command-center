/* ============================================================
   MISSION CONTROL interactive layer
   ------------------------------------------------------------
   Globe (d3 orthographic) · Voice Scope · HAL 9000 voice ·
   Defense Grid game. Ported from the mission-live prototype and
   wired into the authenticated hub. The hub markup is present in
   the DOM from load (hidden until login), so these run immediately
   and re-fit their canvases when the hub is revealed (hub:ready).
   ============================================================ */
const DPR = Math.min(window.devicePixelRatio || 1, (window.matchMedia && window.matchMedia('(pointer:coarse)').matches) ? 1.25 : 1.75);
window.HAL = {speaking:false, level:0};
function fit(cv){const r=cv.getBoundingClientRect();cv.width=Math.max(2,r.width*DPR);cv.height=Math.max(2,r.height*DPR);return cv.getContext('2d');}

/* ---------- clocks ---------- */
const CITIES=[["LOCAL",0],["LAX",0],["NYC",3],["LDN",8],["BKK",14],["TYO",16]];
const citiesEl=document.getElementById('cities');
CITIES.forEach(c=>{const d=document.createElement('div');d.innerHTML=`<div class="c">${c[0]}</div><div class="t" data-off="${c[1]}">--:--</div><div class="t12" data-off="${c[1]}">--:-- --</div>`;citiesEl.appendChild(d);});
function tick(){
  const now=new Date();
  document.getElementById('clk').textContent=now.toLocaleTimeString('en-US',{hour12:false});
  document.getElementById('clk12').textContent=now.toLocaleTimeString('en-US',{hour12:true,hour:'2-digit',minute:'2-digit'});
  document.getElementById('dt').textContent=now.toLocaleDateString('en-US',{weekday:'short',year:'numeric',month:'short',day:'2-digit'}).toUpperCase();
  const baseH=now.getHours();
  const mm=String(now.getMinutes()).padStart(2,'0');
  citiesEl.querySelectorAll('.t').forEach(el=>{
    const h=((baseH+ +el.dataset.off)%24+24)%24;
    el.textContent=String(h).padStart(2,'0')+':'+mm;                 // 24-hour, on top
    const t12=el.nextElementSibling;                                  // 12-hour AM/PM, underneath
    if(t12&&t12.classList.contains('t12')){
      const h12=h%12===0?12:h%12, ap=h<12?'AM':'PM';
      t12.textContent=String(h12).padStart(2,'0')+':'+mm+' '+ap;
    }
  });
}
tick();setInterval(tick,1000);

/* ---------- TARGET LOCK: inject corner brackets into every data row ----------
   The hover look (lift + ring + sweep) is pure CSS; the four .brk corner
   markers that "lock on" need real elements, so we add them once per row. */
(function(){
  const CORNERS=['tlft','trgt','blft','brgt'];
  function deco(el){ if(el.querySelector('.brk'))return;
    for(let i=0;i<4;i++){ const s=document.createElement('span'); s.className='brk '+CORNERS[i]; s.setAttribute('aria-hidden','true'); el.insertBefore(s,el.firstChild); } }
  function wire(){ document.querySelectorAll('#hub .col .panel .bd .row, #hub .col .panel .bd .ag').forEach(deco); }
  if(document.getElementById('hub')) wire();
  document.addEventListener('hub:ready', wire);
})();

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
  function pollISS(){if(document.hidden)return;fetch('https://api.wheretheiss.at/v1/satellites/25544')
    .then(r=>r.json()).then(d=>{if(d&&d.latitude!=null)iss=[+d.longitude,+d.latitude];}).catch(()=>{});}
  pollISS();setInterval(pollISS,20000);   // the marker only creeps over minutes; 20s + paused-when-hidden is plenty

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
  cv.addEventListener('touchstart',e=>{if(e.touches.length===1)tdrag={x:e.touches[0].clientX,y:e.touches[0].clientY,r0:rot.slice(),axis:0};else if(e.touches.length===2){pinch=tdist(e);tdrag=null;}lastTouch=now();},{passive:true});
  cv.addEventListener('touchmove',e=>{
    if(e.touches.length===2&&pinch){e.preventDefault();const d=tdist(e);zoomMul(d/pinch);pinch=d;lastTouch=now();return;}
    if(e.touches.length===1&&tdrag){
      const dx=e.touches[0].clientX-tdrag.x,dy=e.touches[0].clientY-tdrag.y;
      if(!tdrag.axis&&(Math.abs(dx)>6||Math.abs(dy)>6)) tdrag.axis=Math.abs(dx)>=Math.abs(dy)?'h':'v';
      if(tdrag.axis==='h'){e.preventDefault();rotBy(dx,dy,tdrag.r0);lastTouch=now();}   // horizontal spins the globe
      // vertical-dominant drag: do nothing so the page scrolls
    }
  },{passive:false});
  cv.addEventListener('touchend',e=>{if(e.touches.length===0){tdrag=null;pinch=null;}lastTouch=now();});
  function interacting(){return drag||tdrag||pinch;}
  function vis(p){return d3.geoDistance(p,[-rot[0],-rot[1]])<1.5;}

  let gVis=true,gLast=0;
  try{ if('IntersectionObserver' in window) new IntersectionObserver(function(es){gVis=es[0].isIntersecting;},{rootMargin:'140px'}).observe(cv); }catch(e){}
  function draw(ms){
    requestAnimationFrame(draw);
    if(document.hidden||!gVis) return;                 // pause when tab hidden or globe scrolled offscreen
    if(ms&&ms-gLast<32) return; gLast=ms||gLast;        // ~30fps — plenty for the globe
    const w=cv.width/DPR,h=cv.height/DPR;
    if(!window.d3||w<30||h<30) return;
    if(!stars)seedStars(w,h);
    if(!interacting() && zoom<=1.15 && now()-lastTouch>3200) rot[0]+=0.11;   // rescaled for 30fps
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

    // ---- data packets streaming along the arcs (life on the routes) ----
    ctx.save();ctx.globalCompositeOperation='lighter';
    ARCS.forEach((a,ai)=>{ const lerp=d3.geoInterpolate(a[0],a[a.length-1]);
      for(let k=0;k<2;k++){ const frac=((t*0.17)+ai*0.41+k*0.5)%1; const p=lerp(frac); if(!vis(p))continue;
        const xy=proj(p); const fade=Math.sin(frac*Math.PI);             // bright mid-route, fade at the ends
        ctx.fillStyle='rgba(190,255,225,'+(0.85*fade).toFixed(3)+')';
        ctx.shadowColor='#7df7ff';ctx.shadowBlur=9;
        ctx.beginPath();ctx.arc(xy[0],xy[1],1.7+1.3*fade,0,7);ctx.fill(); } });
    ctx.restore();ctx.shadowBlur=0;

    // ---- city markers (brighter as city-lights on the night side) ----
    Object.entries(DESTS).forEach(([k,p])=>{if(!vis(p))return;const xy=proj(p);
      const dark=d3.geoDistance(p,ss)>Math.PI/2;
      const pls=(t*0.9+xy[0]*0.03)%1;                                    // expanding sonar ping, staggered per node
      ctx.save();ctx.globalAlpha=0.3*(1-pls);ctx.strokeStyle=dark?'#ffe7a0':'#7dffb0';ctx.lineWidth=1;
      ctx.beginPath();ctx.arc(xy[0],xy[1],(dark?3.3:2.8)+1.5+pls*7,0,7);ctx.stroke();ctx.restore();
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
  }
  draw();
})();

/* ---------- VOICE SCOPE (center-out mirrored bars; reacts to mic + HAL) ---------- */
(function(){
  const cv=document.getElementById('voice');let ctx=fit(cv);
  const VC={g:'#41ff7e',hi:'#7dffb0',dim:'#2bd964',faint:'#1c8f46',red:'#ff6b5a',cyan:'#7df7ff',amb:'#ffd24a'};
  const VTAU=Math.PI*2; const vrnd=(a,b)=>a+Math.random()*(b-a);
  const SC={hh:null,peak:null,spd:null,phase:null,lv:0,parts:[],rings:[],spawn:0,prevSpk:false,wake:0};
  let vpLast=0;
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
    try{window.HAL.listening=!!started;}catch(e){}   // drives the state-aware orb (cyan = listening)
    btn.textContent=started?'LISTENING ● SAY “DADDY’S HOME”':'VOICE N/A · OPEN IN CHROME';
  });
  const VFONT='ui-monospace,"SF Mono",Menlo,monospace';
  function vEye(c,x,y,r,lv,t,col){ c.save(); c.translate(x,y); const rr=r*(0.9+0.1*Math.sin(t*(col.breath||2.2)));
    const halo=c.createRadialGradient(0,0,0,0,0,rr*2.6); halo.addColorStop(0,'rgba('+col.halo+','+(0.38+lv*0.42)+')'); halo.addColorStop(0.5,'rgba('+col.halo+',0.10)'); halo.addColorStop(1,'rgba('+col.halo+',0)');
    c.fillStyle=halo; c.beginPath(); c.arc(0,0,rr*2.6,0,VTAU); c.fill();
    const g=c.createRadialGradient(-rr*0.2,-rr*0.2,0,0,0,rr); g.addColorStop(0,'rgba(255,255,255,'+(0.85*(0.45+0.55*lv))+')'); g.addColorStop(0.4,col.core); g.addColorStop(1,col.deep);
    c.shadowColor=col.core; c.shadowBlur=7+15*lv; c.fillStyle=g; c.beginPath(); c.arc(0,0,rr,0,VTAU); c.fill();
    c.shadowBlur=0; c.strokeStyle='rgba(255,255,255,0.45)'; c.lineWidth=1; c.beginPath(); c.arc(0,0,rr,0,VTAU); c.stroke();
    c.fillStyle='rgba(255,255,255,0.85)'; c.beginPath(); c.arc(-rr*0.3,-rr*0.3,rr*0.16,0,VTAU); c.fill(); c.restore(); }
  function vMeter(c,x,y,w,h,lv){ c.save(); c.strokeStyle='rgba(65,255,126,.3)'; c.lineWidth=1; c.strokeRect(x,y,w,h);
    const seg=14; for(let s=0;s<seg;s++){ const on=(s/seg)<lv; c.fillStyle=on?(s/seg>0.78?VC.amb:VC.g):'rgba(65,255,126,.10)'; c.fillRect(x+2+s*(w-4)/seg,y+2,(w-4)/seg-1.5,h-4); } c.restore(); }
  function vBg(c,w,h,t,HOR){
    const g=c.createLinearGradient(0,0,0,h); g.addColorStop(0,'#02110b'); g.addColorStop(0.55,'#04170e'); g.addColorStop(1,'#072413'); c.fillStyle=g; c.fillRect(0,0,w,h);
    const ag=c.createRadialGradient(w*0.5,HOR,8,w*0.5,HOR,w*0.5); ag.addColorStop(0,'rgba(65,255,126,0.12)'); ag.addColorStop(0.5,'rgba(65,255,126,0.04)'); ag.addColorStop(1,'rgba(65,255,126,0)'); c.fillStyle=ag; c.fillRect(0,0,w,h);
    c.save(); c.strokeStyle='rgba(65,255,126,0.085)'; c.lineWidth=1;
    for(let x=0;x<=w;x+=26){ c.beginPath(); c.moveTo(x,6); c.lineTo(x,HOR); c.stroke(); }
    for(let y=18;y<HOR;y+=18){ c.beginPath(); c.moveTo(0,y); c.lineTo(w,y); c.stroke(); } c.restore();
    const vpx=w*0.5,vpy=22; c.save(); c.strokeStyle=VC.g; c.lineWidth=1;
    for(let i=-11;i<=11;i++){ c.globalAlpha=0.07-Math.abs(i)*0.002; const bx=vpx+i*(w*0.115); c.beginPath(); c.moveTo(vpx,vpy); c.lineTo(bx,HOR); c.stroke(); }
    const scroll=(t*0.25)%1; for(let k=0;k<8;k++){ const p=(k+scroll)/8; const y=vpy+(HOR-vpy)*Math.pow(p,1.7); if(y<=vpy+1)continue; c.globalAlpha=0.16*(0.3+0.7*p); c.beginPath(); c.moveTo(0,y); c.lineTo(w,y); c.stroke(); } c.restore();
    c.save(); c.strokeStyle=VC.g; c.globalAlpha=0.45; c.shadowColor=VC.g; c.shadowBlur=9; c.lineWidth=1.3; c.beginPath(); c.moveTo(0,HOR); c.lineTo(w,HOR); c.stroke(); c.restore();
    const fg=c.createLinearGradient(0,HOR,0,h); fg.addColorStop(0,'rgba(65,255,126,0.10)'); fg.addColorStop(1,'rgba(65,255,126,0)'); c.fillStyle=fg; c.fillRect(0,HOR,w,h-HOR);
    const sb=((t*0.12)%1)*w; c.save(); c.globalAlpha=0.05; const sg=c.createLinearGradient(sb-60,0,sb+60,0); sg.addColorStop(0,'rgba(125,255,176,0)'); sg.addColorStop(0.5,'rgba(125,255,176,1)'); sg.addColorStop(1,'rgba(125,255,176,0)'); c.fillStyle=sg; c.fillRect(sb-60,0,120,HOR); c.restore();
    const vg=c.createRadialGradient(w/2,h/2,h*0.22,w/2,h/2,w*0.62); vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,.55)'); c.fillStyle=vg; c.fillRect(0,0,w,h);
  }
  function vVU(st,t,lv,WH){ if(!st.hh){ st.hh=new Array(22).fill(0); st.peak=new Array(22).fill(0); st.spd=[]; st.phase=[]; for(let b=0;b<22;b++){st.spd.push(4+(b/21)*7+(b%3)); st.phase.push(b*1.3);} }
    for(let b=0;b<22;b++){ const shape=(1-0.5*b/21)*(1+0.15*Math.sin(b/21*Math.PI)); const noise=0.5+0.5*Math.sin(t*st.spd[b]+st.phase[b]);
      let tgt=lv*WH*shape*(0.55+0.45*noise); tgt=Math.max(tgt,(1.2+Math.sin(t*1.5+b*0.6))*8);
      st.hh[b]+=(tgt>st.hh[b]?(tgt-st.hh[b])*0.5:(tgt-st.hh[b])*0.12); st.peak[b]=Math.max(st.hh[b],st.peak[b]-0.7); } }
  let vVis=true,vThrLast=0;
  try{ if('IntersectionObserver' in window) new IntersectionObserver(function(es){vVis=es[0].isIntersecting;},{rootMargin:'140px'}).observe(cv); }catch(e){}
  function draw(ms){
    requestAnimationFrame(draw);
    if(document.hidden||!vVis) return;                 // pause when hidden or scrolled offscreen
    const w=cv.width/DPR,h=cv.height/DPR; if(w<30||h<30) return;   // size guard it lacked
    if(ms&&ms-vThrLast<32) return; vThrLast=ms||vThrLast;          // ~30fps
    const dt=vpLast?Math.min(0.05,((ms||0)-vpLast)/1000):0.016; vpLast=ms||0; const t=(ms||0)/1000;
    ctx.save();ctx.scale(DPR,DPR);ctx.clearRect(0,0,w,h);
    const HAL=window.HAL||{speaking:false,level:0};
    const target=HAL.speaking?Math.max(0.4,HAL.level||0):0; SC.lv+=(target-SC.lv)*0.2; const lv=SC.lv;
    const listening=!!(window.HAL&&window.HAL.listening);
    const state=HAL.speaking?'speak':(listening?'listen':'standby');
    const EYE = state==='speak'  ? {core:'#41ff7e',deep:'#062012',halo:'65,255,126',breath:3.4}
              : state==='listen' ? {core:'#7df7ff',deep:'#04222a',halo:'125,247,255',breath:2.0}
              :                     {core:'#ff6b5a',deep:'#1a0705',halo:'255,107,90',breath:1.4};
    if(HAL.speaking&&!SC.prevSpk){SC.wake=1;}        // a wake-ripple fires the instant Hal speaks
    SC.prevSpk=HAL.speaking; SC.wake=Math.max(0,SC.wake-dt*1.0);
    const X0=92,X1=w-8,BASE=h-13,WH=Math.max(20,BASE-14),COLW=(X1-X0)/22,BARW=Math.min(16,COLW*0.62),SEGH=6,UNIT=8,MAXSEG=Math.max(4,Math.floor(WH/UNIT));
    vBg(ctx,w,h,t,BASE);
    vVU(SC,t,lv,WH);
    SC.spawn-=dt; if(HAL.speaking&&SC.spawn<=0&&lv>0.4){SC.spawn=0.42;SC.rings.push({r:14,life:1});}
    for(let i=SC.rings.length-1;i>=0;i--){ const r=SC.rings[i]; r.r+=dt*52; r.life-=dt*1.4; if(r.life<=0){SC.rings.splice(i,1);continue;}
      ctx.save();ctx.globalAlpha=r.life*0.35;ctx.strokeStyle=VC.g;ctx.lineWidth=1.3;ctx.shadowColor=VC.g;ctx.shadowBlur=5;ctx.beginPath();ctx.arc(40,36,r.r,0,VTAU);ctx.stroke();ctx.restore(); }
    ctx.save();ctx.globalAlpha=0.10;ctx.fillStyle=VC.faint;for(let b=0;b<22;b++){const cx=X0+COLW*b+COLW/2;for(let s=0;s<MAXSEG;s++)ctx.fillRect(cx-BARW/2,BASE-s*UNIT-SEGH,BARW,SEGH);}ctx.restore();
    for(let b=0;b<22;b++){ const cx=X0+COLW*b+COLW/2; const nSeg=Math.floor(SC.hh[b]/UNIT);
      for(let s=0;s<nSeg&&s<MAXSEG;s++){ const f=s/MAXSEG; const y=BASE-s*UNIT-SEGH; const top=(s===nSeg-1); let col=f<0.6?VC.g:(f<0.85?VC.hi:VC.amb);
        ctx.save();if(top&&f>0.78){col='#eaffee';}ctx.fillStyle=col;ctx.shadowColor=f>0.78?VC.amb:VC.g;ctx.shadowBlur=top?8:3;ctx.fillRect(cx-BARW/2,y,BARW,SEGH);ctx.restore(); }
      if(SC.peak[b]>WH*0.7&&Math.random()<0.3){ SC.parts.push({x:cx+vrnd(-6,6),y:BASE-SC.peak[b],vx:vrnd(-13,13),vy:vrnd(-42,-14),age:0,life:vrnd(.4,.9)}); }
      const py=BASE-SC.peak[b]; ctx.save();ctx.fillStyle=SC.peak[b]>WH*0.9?VC.cyan:VC.amb;ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=10;ctx.fillRect(cx-BARW/2,py-2.4,BARW,2.6);ctx.restore(); }
    for(let i=SC.parts.length-1;i>=0;i--){ const p=SC.parts[i]; p.age+=dt; if(p.age>p.life){SC.parts.splice(i,1);continue;} p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=55*dt;
      ctx.save();ctx.globalAlpha=Math.max(0,1-p.age/p.life);ctx.fillStyle=Math.random()<0.4?VC.amb:VC.hi;ctx.shadowColor=VC.amb;ctx.shadowBlur=4;ctx.fillRect(p.x,p.y,1.7,1.7);ctx.restore(); }
    vEye(ctx,40,36,11,lv,t,EYE);
    const lbl=state==='speak'?'SPEAKING':(state==='listen'?'LISTENING':'STANDBY');
    const lcol=state==='speak'?'#7dffb0':(state==='listen'?VC.cyan:VC.hi);
    ctx.save();ctx.textAlign='center';ctx.font='700 9px '+VFONT;ctx.fillStyle=lcol;ctx.shadowColor=lcol;ctx.shadowBlur=state==='standby'?0:5;
    ctx.fillText(lbl,40,73);ctx.restore();
    vMeter(ctx,8,83,72,6,lv);
    ctx.save();ctx.fillStyle=VC.faint;ctx.font='7px '+VFONT;ctx.textAlign='center';ctx.fillText('LVL '+lv.toFixed(2),40,100);ctx.restore();
    ctx.save();ctx.strokeStyle='rgba(65,255,126,0.2)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(86,10);ctx.lineTo(86,h-10);ctx.stroke();ctx.restore();
    if(!HAL.speaking){ ctx.save();ctx.globalAlpha=0.5;ctx.fillStyle=VC.hi;ctx.font='9px '+VFONT;ctx.textAlign='center';ctx.fillText('TAP “WAKE HAL”, THEN SAY “DADDY’S HOME”',(X0+X1)/2,22);ctx.restore(); }
    if(SC.wake>0){ ctx.save();ctx.globalCompositeOperation='lighter';
      const wr=(1-SC.wake)*Math.max(w,h)*0.98;
      ctx.globalAlpha=SC.wake*0.5;ctx.strokeStyle=VC.hi;ctx.lineWidth=2.5;ctx.shadowColor=VC.g;ctx.shadowBlur=12;
      ctx.beginPath();ctx.arc(40,36,wr,0,VTAU);ctx.stroke();
      ctx.globalAlpha=SC.wake*0.10;ctx.fillStyle=VC.g;ctx.fillRect(0,0,w,h); ctx.restore(); }
    ctx.save();ctx.globalAlpha=0.05;ctx.fillStyle='#000';for(let y=0;y<h;y+=3)ctx.fillRect(0,y,w,1);ctx.restore();
    ctx.restore();
  }
  requestAnimationFrame(draw);
})();

/* ---------- SNIPER SCOPE // OVERWATCH launcher (replaces Defense Grid) ----------
   The rich game lives in js/sniper.js (window.SniperGame). Here we just show the
   idle scope preview in the bottom panel's #game canvas and deploy it fullscreen
   when the panel / its button is tapped. ------------------------------------- */
(function(){
  function deploy(){ try{ if(window.SniperGame) window.SniperGame.open(); }catch(e){} }
  var wired=false, mounted=false;
  function wire(){ if(wired)return; wired=true;
    var btn=document.getElementById('sniperBtn'); if(btn) btn.addEventListener('click',function(e){e.stopPropagation();deploy();});
    var cv=document.getElementById('game'); if(cv){ cv.style.cursor='pointer'; cv.addEventListener('click',deploy); }
  }
  function preview(){ if(mounted)return; var cv=document.getElementById('game');
    if(cv && window.SniperGame && window.SniperGame.mountPreview){ mounted=true; try{ window.SniperGame.mountPreview(cv); }catch(e){} } }
  wire();
  document.addEventListener('hub:ready', function(){ wire(); preview(); });
  var hub=document.getElementById('hub');
  if(hub && !hub.classList.contains('hidden')) preview();
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
  // Browser-voice mapping: each dropdown choice -> the best REAL browser voice + a base pitch,
  // so the selection actually changes the voice even when the neural engine isn't loaded.
  // (Picked from quality male voices; novelty + female voices are explicitly avoided.)
  const BROWSER_VOICE={
    am_michael:{m:['reed','tom','aaron','alex','evan','nathan'],lang:'en-us',pitch:0.92},
    am_onyx:   {m:['rocko','reed','aaron','alex','tom'],        lang:'en-us',pitch:0.72},
    am_fenrir: {m:['eddy','reed','rocko','alex','tom'],         lang:'en-us',pitch:0.84},
    am_adam:   {m:['reed','rocko','tom','aaron','alex'],        lang:'en-us',pitch:0.90},
    am_eric:   {m:['rocko','reed','eddy','tom','alex'],         lang:'en-us',pitch:0.98},
    bm_george: {m:['daniel','arthur','oliver','reed','rocko'],  lang:'en-gb',pitch:0.90},
    bm_daniel: {m:['daniel','arthur','reed','rocko','oliver'],  lang:'en-gb',pitch:0.96}
  };
  const V_NOVELTY=/bad news|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|albert|bahh|pipe|junior|ralph|kathy|fred|grandma|grandpa|sandy|shelley|flo/i;
  const V_FEMALE=/samantha|victoria|allison|ava|susan|karen|moira|tessa|fiona|veena|kate|serena|catherine|nicky|female|zoe|isha|martha|stephanie/i;
  function browserVoices(){return (window.speechSynthesis&&speechSynthesis.getVoices())||[];}
  function pickBrowserVoice(key){
    const vs=browserVoices(); if(!vs.length)return null;
    const c=BROWSER_VOICE[key]||BROWSER_VOICE.am_michael;
    const inLang=v=>(v.lang||'').toLowerCase().replace('_','-').indexOf(c.lang)===0;
    const named=(list,langOnly)=>{for(const p of c.m){const v=vs.find(x=>(!langOnly||inLang(x))&&new RegExp('\\b'+p,'i').test(x.name));if(v)return v;}return null;};
    let v=named(vs,true) || named(vs,false)                                                  // preferred name (accent first, then any)
       || vs.find(x=>inLang(x)&&!V_NOVELTY.test(x.name)&&!V_FEMALE.test(x.name))               // any clean voice in the right accent
       || vs.find(x=>/daniel/i.test(x.name))                                                   // Daniel is a great default male
       || vs.find(x=>/^en/i.test(x.lang)&&!V_NOVELTY.test(x.name)&&!V_FEMALE.test(x.name))      // any clean english male
       || vs.find(x=>/^en/i.test(x.lang)) || vs[0];
    return {voice:v,pitch:c.pitch,name:v?v.name.replace(/\s*\(.*$/,''):'default'};
  }
  // keep the voice list warm (getVoices is async on first paint)
  if(window.speechSynthesis)try{speechSynthesis.getVoices();speechSynthesis.onvoiceschanged=function(){speechSynthesis.getVoices();};}catch(e){}
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
    const sel=pickBrowserVoice(voiceCfg.voice);                  // honor the dropdown selection
    if(sel&&sel.voice){ u.voice=sel.voice; if(sel.voice.lang)u.lang=sel.voice.lang; }
    u.rate=Math.max(0.6,Math.min(1.15,(+voiceCfg.pace||0.9)));   // pace slider drives speed
    u.pitch=sel?sel.pitch:0.9; u.volume=1;
    u.onstart=()=>{window.HAL.level=1;};
    u.onboundary=()=>{window.HAL.level=0.55+0.45*Math.random();};  // drive the Voice Scope bars
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
    function updateStatus(){
      if(kokoroReady){$('vcStatus').textContent='✅ on-device neural voice ready';$('vcBar').style.width='100%';}
      else{ const sel=pickBrowserVoice(voiceCfg.voice); $('vcStatus').textContent='browser voice: '+((sel&&sel.name)||'default')+'  ·  tap LOAD for the free neural voice'; }
    }
    function reflect(){ $('vcVoice').value=voiceCfg.voice; $('vcPace').value=voiceCfg.pace; $('vcDepth').value=voiceCfg.depth;
      $('vcReverb').value=voiceCfg.reverb; $('vcWarmth').value=voiceCfg.warmth; labels(); updateStatus(); }
    openBtn.addEventListener('click',()=>{ reflect(); cfg.classList.toggle('hidden'); });
    const sb=$('stopBtn'); if(sb)sb.addEventListener('click',()=>stopSpeaking());
    $('vcDone').addEventListener('click',()=>cfg.classList.add('hidden'));
    cfg.addEventListener('click',e=>{ if(e.target===cfg)cfg.classList.add('hidden'); });
    $('vcVoice').addEventListener('change',()=>{voiceCfg.voice=$('vcVoice').value;saveVoiceCfg();updateStatus();});
    [['vcPace','pace'],['vcDepth','depth'],['vcReverb','reverb'],['vcWarmth','warmth']].forEach(([id,k])=>{
      $(id).addEventListener('input',()=>{voiceCfg[k]=+$(id).value;labels();saveVoiceCfg();}); });
    $('vcPreset').addEventListener('click',()=>{Object.assign(voiceCfg,VOICE_DEFAULTS);reflect();saveVoiceCfg();});
    $('vcTest').addEventListener('click',()=>{ stopSpeaking(); setTimeout(()=>say('Good evening, Adam. This is my voice. I am ready when you are.'),90); });
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
