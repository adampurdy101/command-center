/* ============================================================
   MISSION CONTROL interactive layer
   ------------------------------------------------------------
   Voice Scope · HAL 9000 voice ·
   Defense Grid game. Ported from the mission-live prototype and
   wired into the authenticated hub. The hub markup is present in
   the DOM from load (hidden until login), so these run immediately
   and re-fit their canvases when the hub is revealed (hub:ready).
   ============================================================ */
const DPR = Math.min(window.devicePixelRatio || 1, (window.matchMedia && window.matchMedia('(pointer:coarse)').matches) ? 1.25 : 1.75);
window.HAL = {speaking:false, level:0};

/* Apple blocks live speech recognition inside installed (home-screen) web
   apps: it "listens" but never hears. There we switch to press-to-talk —
   record a clip, transcribe it server-side (hal-ears), answer as usual.
   Set localStorage cc_force_ptt=1 to test the press-to-talk mode anywhere. */
window.CC_PTT=(function(){
  try{ if(localStorage.getItem('cc_force_ptt')==='1') return true; }catch(e){}
  const SRok=!!(window.SpeechRecognition||window.webkitSpeechRecognition);
  const ios=/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const standalone=(window.navigator.standalone===true)||(window.matchMedia&&matchMedia('(display-mode: standalone)').matches);
  return !SRok || (ios&&standalone);
})();
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

/* ---------- GLOBE ----------
   The globe engine moved to js/globe.js (v2: night-side city
   lights, live USGS seismic feed, satellite constellation, ISS
   ground track, aurora, elevated arcs, hover HUD + target lock).
   The pages load it right after this file. ---------- */

/* ---------- VOICE SCOPE v3 — 2A "REDLINE" (HAL red lens + rotating beams + VU-into-the-red bars; reacts to mic + HAL) ---------- */
(function(){
  const cv=document.getElementById('voice'); if(!cv) return; let ctx=fit(cv);
  const P={g:'65,255,126',hi:'125,255,176',dim:'43,217,100',faint:'28,143,70',cy:'125,247,255',wht:'234,255,242'};
  const ACC='125,247,255';
  const TAU=Math.PI*2, rgba=(c,a)=>'rgba('+c+','+a+')', clamp=(v,a,b)=>v<a?a:v>b?b:v, rnd=(a,b)=>a+Math.random()*(b-a);
  const VFONT='ui-monospace,"SF Mono",Menlo,monospace';
  const S={s:{},sp:[],lv:0,heard:0,prevSpk:false,wake:0,spawn:0,rings:[]};
  let vpLast=0, vThrLast=0, vVis=true;
  window.addEventListener('resize',()=>{ctx=fit(cv);});
  document.addEventListener('hub:ready',()=>{ctx=fit(cv);});

  /* ---- mic / talk button wiring (unchanged behaviour) ---- */
  let micTried=false;
  const talkBtn0=document.getElementById('talkBtn');
  if(talkBtn0) talkBtn0.addEventListener('click',async()=>{
    const btn=document.getElementById('talkBtn');const led=document.getElementById('micLed');
    if(window.halUnlock) window.halUnlock();
    // the on-device neural voice is desktop-only: loading it inside the iPhone
    // app exhausts memory and iOS kills the whole app
    try{if(!window.CC_PTT&&localStorage.getItem('cc_kokoro_ready')&&window.halLoadVoice)window.halLoadVoice();}catch(e){}
    if(window.halPTT){ window.halPTT(); return; }   // press-to-talk devices (iPhone app)
    if(micTried) return;
    micTried=true; btn.textContent='REQUESTING MIC…';
    let stream=null;
    try{
      stream=await navigator.mediaDevices.getUserMedia({audio:true});
    }catch(err){
      micTried=false;
      if(led)led.className='led red';
      const n=(err&&err.name)||'error';
      btn.textContent=(n==='NotAllowedError'||n==='SecurityError')?'MIC BLOCKED · ALLOW IN BROWSER'
        :(n==='NotFoundError')?'NO MIC FOUND':('MIC ERROR · '+n);
      return;
    }
    try{stream.getTracks().forEach(t=>t.stop());}catch(e){}
    if(led)led.className='led amb';
    const started=window.halStart&&window.halStart();
    try{window.HAL.listening=!!started;}catch(e){}
    btn.textContent=started?'LISTENING ● SAY “DADDY’S HOME”':'VOICE N/A · OPEN IN CHROME';
  });

  /* ---- synthetic spectrum (driven by the live HAL level) ---- */
  function updateSpectrum(N,t,lv,spd){
    const q=S.s;
    if(!q.hh||q.hh.length!==N){q.hh=new Array(N).fill(.02);q.pk=new Array(N).fill(0);q.sp=[];q.ph=[];
      for(let b=0;b<N;b++){q.sp.push(spd+((b*7)%11)*0.9);q.ph.push(b*1.7);}}
    for(let b=0;b<N;b++){
      const dome=0.42+0.58*Math.sin((b+0.5)/N*Math.PI);
      const noise=0.5+0.5*Math.sin(t*q.sp[b]+q.ph[b]);
      const tg=Math.max(lv*dome*(0.42+0.58*noise),0.028+0.02*Math.sin(t*1.4+b));
      q.hh[b]+=tg>q.hh[b]?(tg-q.hh[b])*0.5:(tg-q.hh[b])*0.14;
      q.pk[b]=Math.max(q.hh[b],q.pk[b]-0.011);
    }
  }
  function drawSparks(c){
    const arr=S.sp; if(!arr.length)return; const dt=1/30;
    c.save();c.globalCompositeOperation='lighter';
    for(let i=arr.length-1;i>=0;i--){const p=arr[i];p.age+=dt;if(p.age>p.life){arr.splice(i,1);continue;}
      p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=42*dt;p.vx*=0.985;
      c.globalAlpha=Math.max(0,1-p.age/p.life);
      const col=p.warm?(Math.random()<0.5?'255,90,40':'255,175,90'):(Math.random()<0.5?P.wht:ACC);
      c.fillStyle=rgba(col,1);c.shadowColor=rgba(col,1);c.shadowBlur=5;c.fillRect(p.x-0.9,p.y-0.9,1.8,1.8);}
    c.restore();c.globalAlpha=1;
  }
  function halEyeRed(c,x,y,R,lv,t){
    const breath=0.5+0.5*Math.sin(t*1.5);
    const rr=R*(0.9+0.08*breath)*(1+0.05*lv);
    const dx=Math.sin(t*0.3)*R*0.05, dy=Math.cos(t*0.24)*R*0.04, core=0.5+0.5*lv;
    c.save();c.translate(x,y);
    c.save();c.globalCompositeOperation='lighter';
    const hr=rr*(2.4+lv*1.2);
    const halo=c.createRadialGradient(0,0,rr*0.3,0,0,hr);
    halo.addColorStop(0,'rgba(255,70,42,'+(0.34+lv*0.4).toFixed(3)+')');
    halo.addColorStop(0.45,'rgba(255,96,64,0.1)');halo.addColorStop(1,'rgba(255,70,42,0)');
    c.fillStyle=halo;c.beginPath();c.arc(0,0,hr,0,TAU);c.fill();c.restore();
    const bez=c.createLinearGradient(0,-rr-8,0,rr+8);
    bez.addColorStop(0,'#3a2420');bez.addColorStop(0.5,'#0c0705');bez.addColorStop(1,'#241512');
    c.strokeStyle=bez;c.lineWidth=R*0.2;c.beginPath();c.arc(0,0,rr+R*0.12,0,TAU);c.stroke();
    c.strokeStyle='rgba(0,0,0,0.8)';c.lineWidth=1.2;c.beginPath();c.arc(0,0,rr+R*0.02,0,TAU);c.stroke();
    c.strokeStyle='rgba(255,120,90,0.3)';c.lineWidth=1;
    for(let i=0;i<48;i++){const a=i/48*TAU,l=(i%12===0)?R*0.12:R*0.05;c.beginPath();c.moveTo(Math.cos(a)*(rr+R*0.24),Math.sin(a)*(rr+R*0.24));c.lineTo(Math.cos(a)*(rr+R*0.24+l),Math.sin(a)*(rr+R*0.24+l));c.stroke();}
    c.save();c.globalCompositeOperation='lighter';c.strokeStyle='rgba(255,120,80,0.5)';c.lineWidth=1.2;
    const a1=t*0.6;c.beginPath();c.arc(0,0,rr+R*0.32,a1,a1+1.0);c.stroke();c.beginPath();c.arc(0,0,rr+R*0.32,a1+Math.PI,a1+Math.PI+1.0);c.stroke();c.restore();
    c.fillStyle='#0a0402';c.beginPath();c.arc(0,0,rr,0,TAU);c.fill();
    const g=c.createRadialGradient(dx-rr*0.14,dy-rr*0.16,0,dx,dy,rr*0.96);
    g.addColorStop(0,'rgba(255,240,214,'+(0.95*core).toFixed(3)+')');
    g.addColorStop(0.12,'rgba(255,180,90,'+core.toFixed(3)+')');
    g.addColorStop(0.32,'#ff3a1c');g.addColorStop(0.66,'#9c0f05');g.addColorStop(1,'#240403');
    c.fillStyle=g;c.beginPath();c.arc(dx,dy,rr*0.9,0,TAU);c.fill();
    c.save();c.globalCompositeOperation='lighter';
    const ph=c.createRadialGradient(dx,dy,0,dx,dy,rr*0.5);
    ph.addColorStop(0,'rgba(255,247,228,'+(0.9*core).toFixed(3)+')');ph.addColorStop(0.4,'rgba(255,140,60,'+(0.5*core).toFixed(3)+')');ph.addColorStop(1,'rgba(255,64,26,0)');
    c.fillStyle=ph;c.beginPath();c.arc(dx,dy,rr*0.5,0,TAU);c.fill();c.restore();
    c.save();c.globalCompositeOperation='lighter';
    const slitA=0.5+0.4*Math.sin(t*2.2);
    const sg=c.createLinearGradient(-rr,0,rr,0);
    sg.addColorStop(0,'rgba(255,120,80,0)');sg.addColorStop(0.5,'rgba(255,224,186,'+(0.75*slitA).toFixed(3)+')');sg.addColorStop(1,'rgba(255,120,80,0)');
    c.fillStyle=sg;c.fillRect(-rr,dy-0.9,rr*2,1.8);c.restore();
    c.strokeStyle='rgba(255,170,120,0.16)';c.lineWidth=1;c.beginPath();c.arc(0,0,rr*0.64,0,TAU);c.stroke();c.beginPath();c.arc(0,0,rr*0.4,0,TAU);c.stroke();
    c.fillStyle='rgba(255,255,255,0.82)';c.beginPath();c.ellipse(-rr*0.32,-rr*0.36,rr*0.13,rr*0.08,-0.6,0,TAU);c.fill();
    c.restore();
  }
  function barRedline(c,x,barw,baseY,bt,e,maxH,b){
    const bh=baseY-bt; if(bh<1)return;
    const heat=Math.max(0,(e-0.28)/0.72);
    const bg=c.createLinearGradient(0,baseY,0,baseY-maxH);
    bg.addColorStop(0,'rgba(20,120,60,0.95)');bg.addColorStop(0.2,'rgba(65,255,126,1)');bg.addColorStop(0.36,'rgba(190,255,110,1)');bg.addColorStop(0.46,'rgba(255,188,64,1)');bg.addColorStop(0.58,'rgba(255,102,32,1)');bg.addColorStop(0.72,'rgba(255,48,24,1)');bg.addColorStop(1,'rgba(255,34,18,1)');
    c.fillStyle=bg;c.fillRect(x-barw/2,bt,barw,bh);
    c.fillStyle='rgba(3,14,9,0.8)';for(let y=baseY-8;y>bt;y-=8)c.fillRect(x-barw/2,y,barw,2.2);
    c.save();c.globalCompositeOperation='lighter';c.globalAlpha=0.12+e*0.3;
    const gg=c.createLinearGradient(0,baseY,0,baseY-maxH);gg.addColorStop(0,'rgba(65,255,126,0.4)');gg.addColorStop(0.8,'rgba(255,180,80,0.85)');gg.addColorStop(1,'rgba(255,60,30,1)');
    c.fillStyle=gg;c.shadowColor=heat>0.28?'rgba(255,60,30,1)':rgba(ACC,1);c.shadowBlur=e*(9+heat*12);c.fillRect(x-barw/2,bt,barw,bh);c.restore();
    const capCol=heat>0.32?'255,40,20':(heat>0.1?'255,140,48':ACC);
    c.save();c.globalCompositeOperation='lighter';
    c.fillStyle=rgba(capCol,Math.min(1,0.55+e*0.6).toFixed(3));c.shadowColor=rgba(capCol,1);c.shadowBlur=9+heat*12;c.fillRect(x-barw/2-1,bt-4.8-heat*4,barw+2,2.8+heat*2);
    c.fillStyle=rgba('255,244,224',Math.min(1,0.5+e*0.5).toFixed(3));c.shadowBlur=6;c.fillRect(x-barw/2-1,bt-3.6-heat*3,barw+2,1.1);c.restore();
    if(heat>0.32){const oy=bt-9-heat*7;c.save();c.globalCompositeOperation='lighter';c.fillStyle=rgba('255,60,30',(0.4+0.55*heat).toFixed(3));c.shadowColor='rgba(255,60,30,1)';c.shadowBlur=10;c.fillRect(x-barw/2,oy,barw,2);c.restore();
      if(Math.random()<0.28&&S.sp.length<80)S.sp.push({x:x+rnd(-2,2),y:oy,vx:rnd(-10,10),vy:rnd(-52,-24),age:0,life:rnd(.4,.8),warm:true});}
    const pk=S.s.pk[b]*maxH;if(pk>7){const py=baseY-pk-2,ph=S.s.pk[b],pc=ph>0.6?'255,40,20':(ph>0.44?'255,140,48':ACC);c.save();c.globalCompositeOperation='lighter';c.fillStyle=rgba(pc,0.95);c.shadowColor=rgba(pc,1);c.shadowBlur=7;c.fillRect(x-barw/2,py,barw,2);c.restore();}
  }
  function leftStatus(c,lx,ly,lv,state){
    const speaking=state==='speak', listening=state==='listen';
    const lbl=speaking?'SPEAKING':(listening?'LISTENING':'STANDBY');
    const scol=speaking?P.hi:(listening?ACC:'255,138,120');
    c.save();c.textAlign='left';
    c.font='700 11px '+VFONT;c.fillStyle=rgba(scol,0.95);c.shadowColor=rgba(scol,1);c.shadowBlur=(speaking||listening)?7:3;
    c.fillText(lbl,lx,ly);c.shadowBlur=0;
    const mw=108,segs=22,gap=2,sw=(mw-(segs-1)*gap)/segs;
    const lit=Math.round(clamp(lv,0,1)*segs);
    for(let i=0;i<segs;i++){const on=i<lit,f=i/segs;
      c.fillStyle=on?(f>0.82?rgba('255,60,30',1):(f>0.6?rgba('255,150,54',0.95):rgba(P.g,0.95))):rgba(P.faint,0.3);
      c.fillRect(lx+i*(sw+gap),ly+8,Math.max(1,sw),6);}
    c.font='10px '+VFONT;c.fillStyle=rgba(P.dim,0.85);c.fillText('LVL '+lv.toFixed(2),lx,ly+28);
    c.restore();
  }
  let heardWrapped=false;
  function wrapHeard(){ if(heardWrapped)return; const f=window.__halProcess;
    if(typeof f!=='function')return; heardWrapped=true;
    window.__halProcess=function(tx){ S.heard=1; try{return f(tx);}catch(e){} }; }
  try{ if('IntersectionObserver' in window) new IntersectionObserver(function(es){vVis=es[0].isIntersecting;},{rootMargin:'140px'}).observe(cv); }catch(e){}

  function draw(ms){
    requestAnimationFrame(draw);
    if(document.hidden||!vVis||window.CC_GAME_OPEN||window.CC_DECK_OPEN) return;
    const w=cv.width/DPR,h=cv.height/DPR; if(w<30||h<30) return;
    if(ms&&ms-vThrLast<32) return; vThrLast=ms||vThrLast;
    const dt=vpLast?Math.min(0.05,((ms||0)-vpLast)/1000):0.016; vpLast=ms||0; const t=(ms||0)/1000;
    wrapHeard();
    const c=ctx; c.save();c.scale(DPR,DPR);c.clearRect(0,0,w,h);
    const HAL=window.HAL||{speaking:false,level:0,listening:false};
    const target=HAL.speaking?Math.max(0.35,HAL.level||0):(HAL.listening?Math.min(0.55,0.12+0.55*S.heard):0);
    S.lv+=(target-S.lv)*0.2; const lv=S.lv;
    const state=HAL.speaking?'speak':(HAL.listening?'listen':'standby');
    S.heard=Math.max(0,(S.heard||0)-dt*1.5);
    if(HAL.speaking&&!S.prevSpk)S.wake=1; S.prevSpk=HAL.speaking; S.wake=Math.max(0,S.wake-dt);
    const breathe=0.5+0.5*Math.sin(t*0.5);
    const BAY=Math.max(72,Math.min(116,w*0.15));
    const X0=BAY, X1=w-12;
    const baseY=h*0.85, topPad=h*0.14, maxH=Math.max(14,baseY-topPad);
    const emit={x:(X0+X1)/2,y:h*0.12};
    const N=28, colw=(X1-X0)/N, barw=Math.max(2.5,Math.min(9,colw*0.44));
    const R=Math.max(13,Math.min(26,h*0.2));
    const eye={x:BAY*0.52,y:clamp(h*0.42,R+14,h-R-34)};
    const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'#010603');g.addColorStop(0.6,'#020c07');g.addColorStop(1,'#03130b');c.fillStyle=g;c.fillRect(0,0,w,h);
    c.save();c.globalCompositeOperation='lighter';
    for(let i=-12;i<=12;i++){const bx=emit.x+i*(w*0.075);c.globalAlpha=0.07-Math.abs(i)*0.0022;c.strokeStyle=rgba(P.g,1);c.beginPath();c.moveTo(emit.x,emit.y);c.lineTo(bx,baseY);c.stroke();}
    c.globalAlpha=1;const scroll=(t*0.18)%1;
    for(let k=0;k<9;k++){const p=(k+scroll)/9,y=emit.y+(baseY-emit.y)*Math.pow(p,1.8);if(y<=emit.y+1)continue;c.strokeStyle=rgba(P.g,(0.14*(0.3+0.7*p)).toFixed(3));c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();}
    c.restore();
    c.save();c.globalCompositeOperation='lighter';const ag=c.createRadialGradient(emit.x,baseY,6,emit.x,baseY,w*0.42);
    ag.addColorStop(0,rgba(P.g,(0.05+0.03*breathe).toFixed(3)));ag.addColorStop(1,rgba(P.g,0));c.fillStyle=ag;c.fillRect(0,0,w,h);c.restore();
    c.save();c.globalCompositeOperation='lighter';c.translate(eye.x,eye.y);c.rotate(t*0.05);
    for(let i=0;i<12;i++){const a=i/12*TAU,wsp=0.02+0.006*Math.sin(t*0.5+i),len=w*0.6,col=i%3===0?ACC:P.g;
      const grd=c.createRadialGradient(0,0,R*0.6,0,0,len);grd.addColorStop(0,rgba(col,(0.18+0.14*lv).toFixed(3)));grd.addColorStop(0.45,rgba(col,(0.07+0.07*lv).toFixed(3)));grd.addColorStop(1,rgba(col,0));
      c.fillStyle=grd;c.beginPath();c.moveTo(0,0);c.arc(0,0,len,a-wsp,a+wsp);c.closePath();c.fill();}
    c.restore();
    c.save();c.globalCompositeOperation='lighter';
    for(let i=0;i<=40;i++){const fx=i/40,tx=X0+(X1-X0)*fx,sh=0.5+0.5*Math.sin(t*2-fx*7);c.strokeStyle=rgba(i%3===0?ACC:P.g,(0.006+0.012*sh).toFixed(3));c.lineWidth=1;c.beginPath();c.moveTo(emit.x,emit.y);c.lineTo(tx,baseY);c.stroke();}
    c.restore();
    updateSpectrum(N,t,lv,3.6);
    const q=S.s,E=[],tops=[],bp=0.6+0.4*Math.sin(t*0.5);
    for(let b=0;b<N;b++){const idle=(0.05+0.04*Math.sin(t*0.85+b*0.5))*bp;E[b]=Math.max(q.hh[b],idle);tops[b]=baseY-E[b]*maxH;}
    c.save();c.globalCompositeOperation='lighter';
    for(let b=0;b<N;b++){const x=X0+colw*b+colw/2,ty=tops[b],e=E[b],a=0.05+e*0.5;
      const grd=c.createLinearGradient(emit.x,emit.y,x,ty);grd.addColorStop(0,rgba(P.hi,(a*0.5).toFixed(3)));grd.addColorStop(0.7,rgba(P.g,(a*0.7).toFixed(3)));grd.addColorStop(1,rgba(ACC,a.toFixed(3)));
      c.strokeStyle=grd;c.lineWidth=1.05;c.beginPath();c.moveTo(emit.x,emit.y);c.lineTo(x,ty);c.stroke();
      const bpp=((t*0.5+b*0.13)%1),bx=emit.x+(x-emit.x)*bpp,by=emit.y+(ty-emit.y)*bpp;c.fillStyle=rgba(P.wht,(0.5*e).toFixed(3));c.fillRect(bx-0.9,by-0.9,1.8,1.8);}
    c.restore();
    c.save();c.globalCompositeOperation='lighter';c.strokeStyle=rgba(P.g,(0.45+0.2*breathe).toFixed(2));c.shadowColor=rgba(P.g,1);c.shadowBlur=10;c.lineWidth=1.3;c.beginPath();c.moveTo(X0,baseY);c.lineTo(X1,baseY);c.stroke();c.restore();
    for(let b=0;b<N;b++){const x=X0+colw*b+colw/2,e=E[b],bt=tops[b];barRedline(c,x,barw,baseY,bt,e,maxH,b);}
    c.save();c.globalCompositeOperation='lighter';
    for(let b=0;b<N;b++){const x=X0+colw*b+colw/2,e=E[b],rh=e*maxH*0.46;const rg=c.createLinearGradient(0,baseY,0,baseY+rh);rg.addColorStop(0,rgba(P.g,(0.2*e).toFixed(3)));rg.addColorStop(1,rgba(P.g,0));c.fillStyle=rg;c.fillRect(x-barw/2,baseY,barw,rh);}
    c.restore();
    drawSparks(c);
    S.spawn-=dt;
    if(HAL.speaking&&S.spawn<=0&&lv>0.5){S.spawn=0.5;S.rings.push({r:R+6,life:1});}
    c.save();c.globalCompositeOperation='lighter';
    for(let i=S.rings.length-1;i>=0;i--){const r=S.rings[i];r.r+=dt*80;r.life-=dt*1.3;if(r.life<=0){S.rings.splice(i,1);continue;}c.globalAlpha=r.life*0.3;c.strokeStyle='rgba(255,92,60,1)';c.lineWidth=1.3;c.beginPath();c.arc(eye.x,eye.y,r.r,0,TAU);c.stroke();}c.restore();c.globalAlpha=1;
    halEyeRed(c,eye.x,eye.y,R,lv,t);
    if(eye.y+R+30<h-2) leftStatus(c,10,eye.y+R+20,lv,state); else leftStatus(c,10,h-22,lv,state);
    c.save();c.strokeStyle=rgba(P.faint,0.5);c.lineWidth=1;for(let x=X0;x<X1;x+=26){const lng=((x-X0)%104<26);c.beginPath();c.moveTo(x,8);c.lineTo(x,8+(lng?6:3));c.stroke();}c.restore();
    c.save();c.strokeStyle=rgba(P.g,0.18);c.lineWidth=1;c.beginPath();c.moveTo(BAY,8);c.lineTo(BAY,h-8);c.stroke();c.restore();
    if(state!=='speak'){
      const hint=window.CC_PTT
        ?(state==='listen'?'● RECORDING · TAP THE BUTTON WHEN DONE':'TAP THE BUTTON, SPEAK, TAP AGAIN — HAL ANSWERS')
        :(state==='listen'?'LISTENING · SAY “HAL, …” · “DADDY’S HOME” · “STOP”':'TAP “WAKE HAL”, THEN SAY “DADDY’S HOME”');
      const a=0.3+0.13*Math.sin(t*1.8);
      c.save();c.font='9px '+VFONT;c.textAlign='center';c.fillStyle=rgba(P.hi,a.toFixed(2));c.fillText(hint,(X0+X1)/2,13);c.restore();}
    if(S.wake>0){c.save();c.globalCompositeOperation='lighter';const wr=(1-S.wake)*Math.max(w,h)*0.98;
      c.globalAlpha=S.wake*0.4;c.strokeStyle=rgba(P.hi,1);c.lineWidth=2.2;c.shadowColor=rgba(P.g,1);c.shadowBlur=12;c.beginPath();c.arc(eye.x,eye.y,wr,0,TAU);c.stroke();c.globalAlpha=1;c.restore();}
    c.save();c.globalCompositeOperation='lighter';const sheen=c.createLinearGradient(0,0,w,h);sheen.addColorStop(0,'rgba(255,255,255,0.02)');sheen.addColorStop(0.5,'rgba(255,255,255,0)');c.fillStyle=sheen;c.fillRect(0,0,w,h);c.restore();
    const vg=c.createRadialGradient(w/2,h*0.55,h*0.3,w/2,h*0.55,w*0.62);vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(1,7,4,.55)');c.fillStyle=vg;c.fillRect(0,0,w,h);
    c.save();c.globalAlpha=0.05;c.fillStyle='#000';for(let y=0;y<h;y+=3)c.fillRect(0,y,w,1);c.restore();
    c.restore();
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
  function ensureAudio(){if(!halAudio){halAudio=new Audio();halAudio.preload='auto';
    try{halAudio.setAttribute('playsinline','');}catch(e){}}return halAudio;}
  // the big on-device voice model must never load inside the iPhone app (OOM crash);
  // clear any old "auto-load it" flag that a previous visit may have left behind
  try{ if(window.CC_PTT) localStorage.removeItem('cc_kokoro_ready'); }catch(e){}
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
    try{
      const tok=window.Hal&&window.Hal.token?await window.Hal.token():null;
      if(!tok) return false;
      r=await fetch(HAL_VOICE_URL,{method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+tok},
        body:JSON.stringify({text})});
    }
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
    try{ await a.play(); }
    catch(e){
      // iOS sometimes rejects the first programmatic play after a src swap — retry once
      await new Promise(res=>setTimeout(res,250));
      try{ await a.play(); }
      catch(e2){ if(levelIv){clearInterval(levelIv);levelIv=null;} URL.revokeObjectURL(url); return false; }
    }
    return true;
  }
  async function say(text){
    if(speaking)return;
    banner(text);
    speaking=true; window.HAL.speaking=true; window.HAL.level=1;
    try{speechSynthesis&&speechSynthesis.cancel();}catch(e){}
    let ok=false;
    if(kokoroReady&&!window.CC_PTT){ try{ ok=await kokoroSpeak(text); }catch(e){ ok=false; } }
    // press-to-talk devices (iPhone app): prefer the server voice — the
    // built-in one is weak/unreliable there; browser voice stays the fallback
    if(!ok&&window.CC_PTT){ try{ ok=await elevenSpeak(text); }catch(e){ ok=false; } }
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
  // live open-task feed straight from the board (js/board.js fires board:updated
  // with the full task list every time Supabase data arrives or changes)
  let boardTasks=null;
  document.addEventListener('board:updated',e=>{ try{ boardTasks=((e.detail&&e.detail.tasks)||[]).filter(t=>!t.done); }catch(_){} });
  function speakDate(iso){ try{ const p=String(iso).split('-').map(Number);
    return new Date(p[0],p[1]-1,p[2]).toLocaleDateString('en-US',{month:'long',day:'numeric'}); }catch(_){ return iso; } }
  function buildBrief(){
    // read the same elements app.js writes (the EMAILS row's value is #brief-unread);
    // '–'/'—' are the pre-load placeholders — treat them as missing
    const ok=t=>t&&t!=='–'&&t!=='—';
    const val=(id,key,fb)=>{const el=document.getElementById(id);const t=el?el.textContent.trim():'';
      if(ok(t))return t; const p=panelVal('daily brief',key); return ok(p)?p:fb;};
    const unread=val('brief-unread','EMAILS','201');
    const flagged=val('brief-flagged','FLAGGED','3');
    let tphrase;
    if(boardTasks){                                  // real data from the tasks table
      const n=boardTasks.length;
      if(!n) tphrase='no open tasks';
      else{
        tphrase=n+' open task'+(n===1?'':'s');
        const due=boardTasks.filter(t=>t.due).sort((a,b)=>a.due<b.due?-1:1)[0];
        if(due) tphrase+='. The nearest is '+due.title+', due '+speakDate(due.due);
      }
    }else{                                           // board not loaded yet — old DOM fallback
      const tasks=val('brief-tasks','TASKS','0');
      const tn=parseInt(tasks,10);
      tphrase=(tn>0)?(tn+' open task'+(tn===1?'':'s')):'no open tasks';
    }
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
  // Addressed-to-Hal detector: phrases that START with "Hal" (plus the ways
  // speech recognition commonly mis-hears it) go to the Claude brain.
  const HAL_ADDR=/^\s*(?:ok(?:ay)?[,\s]+|hey[,\s]+)?(?:hal|hall|howl|al|pal)\b[,.!?]?\s*([\s\S]*)$/i;
  let halBusy=false,lastAsk={t:'',at:0};
  function speakReply(text){ if(!speaking){say(text);return;}
    let n=0; const iv=setInterval(()=>{ if(!speaking){clearInterval(iv);say(text);} else if(++n>40){clearInterval(iv);} },250); }
  async function askHalDirect(q){
    const now=Date.now();
    if(halBusy||(q===lastAsk.t&&now-lastAsk.at<4000)) return;   // ignore duplicate finals
    lastAsk={t:q,at:now};
    if(!(window.Hal&&window.Hal.ask)) return;
    halBusy=true;
    try{ window.HAL.level=Math.max(window.HAL.level||0,0.3);
      const reply=await window.Hal.ask(q);
      if(reply) speakReply(reply);
    }catch(e){ console.error('hal ask failed:',e); }
    halBusy=false;
  }
  async function maybeAskHal(raw){
    const m=raw.trim().match(HAL_ADDR); if(!m) return;
    const q=(m[1]||'').trim();
    return askHalDirect(q||'Hello, Hal.');
  }

  /* ---- press-to-talk (iPhone app & any device without live recognition) ----
     Tap → record. Tap again → clip goes to hal-ears for transcription, then
     straight to Hal. No wake word needed: a tap IS addressing him. */
  function handleTranscript(text){
    const heard=document.getElementById('heard');
    if(heard&&text){heard.textContent='heard:  “'+text+'”';heard.style.opacity='1';
      clearTimeout(heard._to);heard._to=setTimeout(()=>{heard.style.opacity='0';},4000);}
    const r=processSpeech(text);                      // hot words still win (stop/time/brief)
    if(r!==null&&r!=='hal') return;
    const m=text.trim().match(HAL_ADDR);              // strip a spoken "Hal," if present
    askHalDirect(m?((m[1]||'').trim()||'Hello, Hal.'):text.trim());
  }
  window.__halHandleTranscript=handleTranscript;      // test hook
  if(window.CC_PTT)(function(){
    let ptRec=null,ptStream=null,ptChunks=[],ptBusy=false;
    const IDLE='TALK TO HAL · TAP, SPEAK, TAP';
    function label(t){const b=document.getElementById('talkBtn'); if(b)b.textContent=t;}
    function led(cls){const l=document.getElementById('micLed'); if(l)l.className='led '+cls;}
    function reset(){label(IDLE);led('amb');window.HAL.listening=false;}
    document.addEventListener('hub:ready',()=>{if(!ptRec)label(IDLE);});
    if(document.getElementById('talkBtn'))label(IDLE);
    window.halPTT=async function(){
      if(ptBusy) return;
      if(ptRec){ try{ptRec.stop();}catch(e){reset();} return; }        // second tap → finish
      let stream=null;
      try{ stream=await navigator.mediaDevices.getUserMedia({audio:true}); }
      catch(err){ const n=(err&&err.name)||'';
        label(n==='NotAllowedError'||n==='SecurityError'?'MIC BLOCKED · ALLOW IN SETTINGS':'MIC ERROR · TAP TO RETRY');
        led('red'); return; }
      let rec=null,mime='';
      if(window.MediaRecorder){
        for(const m of ['audio/mp4','audio/webm;codecs=opus','audio/webm'])
          if(MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(m)){mime=m;break;}
        try{ rec=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream); }catch(e){ rec=null; }
      }
      if(!rec){ label('RECORDER N/A ON THIS DEVICE'); led('red');
        try{stream.getTracks().forEach(t=>t.stop());}catch(e){} return; }
      ptRec=rec; ptStream=stream; ptChunks=[];
      rec.ondataavailable=e=>{ if(e.data&&e.data.size)ptChunks.push(e.data); };
      rec.onerror=()=>{ try{stream.getTracks().forEach(t=>t.stop());}catch(e){} ptRec=null; ptStream=null; reset(); };
      rec.onstop=async()=>{
        try{stream.getTracks().forEach(t=>t.stop());}catch(e){}
        const blob=new Blob(ptChunks,{type:rec.mimeType||mime||'audio/mp4'});
        ptRec=null; ptStream=null; window.HAL.listening=false;
        if(blob.size<2000){ reset(); return; }                          // accidental tap
        ptBusy=true; label('THINKING…'); led('amb');
        let text=null;
        try{ text=window.Hal&&window.Hal.hear?await window.Hal.hear(blob):null; }catch(e){}
        ptBusy=false; reset();
        if(!text){ label('COULD NOT HEAR · TAP TO RETRY'); return; }
        handleTranscript(text);
      };
      try{ rec.start(); }catch(e){ ptRec=null; ptStream=null;
        try{stream.getTracks().forEach(t=>t.stop());}catch(_){} reset(); return; }
      window.HAL.listening=true; window.HAL.level=Math.max(window.HAL.level||0,0.2);
      label('● RECORDING — TAP AGAIN WHEN DONE'); led('on');
      setTimeout(()=>{ if(ptRec===rec){ try{rec.stop();}catch(e){} } },30000); // safety cap
    };
  })();
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
    // Addressed to Hal → skip the canned time/brief hot-words; the final
    // transcript is routed to the Claude brain from rec.onresult.
    if(HAL_ADDR.test(t)) return 'hal';
    if(tl.includes('time')){ if(Date.now()>cd){cd=Date.now()+5000;tellTime();} return 'time'; }
    const wantBrief=tl.includes('daddy')||(tl.includes('wake')&&(tl.includes('hal')||tl.includes('how')||tl.includes('pal')))
      ||tl.includes('brief')||tl.includes('report')||tl.includes('what are we doing');
    if(wantBrief&&Date.now()>cd){cd=Date.now()+9000;pending=true;
      pendTimer=setTimeout(()=>{pendTimer=null;pending=false;if(!speaking)greet();},1200);return 'brief';}
    return null;
  }
  window.__halProcess=processSpeech;   // test hook: simulate a heard phrase
  window.__halAsk=maybeAskHal;         // test hook: simulate a final "Hal, …" phrase
  window.halStart=function(){
    try{const warm=new SpeechSynthesisUtterance(' ');warm.volume=0;speechSynthesis.speak(warm);}catch(e){}
    if(!SR)return false;
    if(!rec){
      try{rec=new SR();}catch(e){return false;}
      rec.continuous=true;rec.interimResults=true;rec.lang='en-US';
      rec.onstart=()=>{recRunning=true;};
      rec.onresult=e=>{ let t='',fin='';
        for(let i=e.resultIndex;i<e.results.length;i++){const tr=e.results[i][0].transcript; t+=tr; if(e.results[i].isFinal)fin+=tr;}
        const handled=processSpeech(t);
        // only a FINAL utterance goes to the Claude brain (interims repeat as you talk)
        if(fin&&(handled==null||handled==='hal')) maybeAskHal(fin);
      };
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
