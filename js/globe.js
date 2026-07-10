/* ============================================================
   GLOBAL TRACK SYS — globe engine v3 "cinematic pass"
   ------------------------------------------------------------
   v2 features (all retained):
   · night-side city lights (~240 real cities + seeded sprawl)
   · live USGS seismic feed (M2.5+/24h) + SEIS readout chip
   · satellite constellation on two inclined orbits w/ trails
   · ISS: smooth extrapolated motion + predicted ground track
   · aurora ovals · elevated travel arcs w/ comet packets
   · sun-limb flare · dusk ring · hover recon HUD · target lock
   v3 additions:
   · camera system: eased cubic fly-to on target set (with a
     subtle FOV punch), double-click pulls back with momentum
     overshoot + settle; drag/wheel always interrupts cleanly
   · click a satellite or the ISS to CAMERA-LOCK and follow it
     (tracking chip top-center; click empty space to release)
   · ambient event director: city flares, sonar pings, sector
     sweeps — one every 8–15 s so the globe never sits still
   · marker hover: corner-bracket reticle draws itself in and
     the data readout types character by character
   · HUD boxes ease in with a chromatic-edge glitch, corner
     brackets that draw themselves, live uplink sparkline
   · volumetric Fresnel rim that breathes · arc launch pulses
   · rare CRT horizontal sync tear (desktop only)
   · time-based motion @60fps on desktop, 30fps on touch
   Integration points unchanged: #globe canvas, #continent,
   #zoomr, window.__setGlobeTilt.
   ============================================================ */
(function(){
'use strict';
const cv=document.getElementById('globe'); if(!cv||!window.d3) return;
const COARSE=!!(window.matchMedia&&window.matchMedia('(pointer:coarse)').matches);
const DPR=Math.min(window.devicePixelRatio||1,COARSE?1.25:1.75);
const REDUCE=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const FRAME_MS=COARSE?32:16;                     // 60fps desktop, 30fps touch
function fit(){const r=cv.getBoundingClientRect();cv.width=Math.max(2,r.width*DPR);cv.height=Math.max(2,r.height*DPR);return cv.getContext('2d');}
let ctx=fit();
const rad=Math.PI/180, R2D=180/Math.PI, TAU=Math.PI*2;
const now=()=>performance.now();

/* ---------- geo anchors ---------- */
const HOME=[-122.2,47.5];
const DESTS={BKK:[100.5,13.7],TYO:[139.7,35.7],SEA:[-122.3,47.6],PTY:[100.88,12.93]};
const ARCS=[[HOME,[100.5,13.7]],[HOME,[139.7,35.7]],[HOME,[151.2,-33.9]]];
const CONTS=[{n:'NORTH AMERICA',c:[-100,45]},{n:'SOUTH AMERICA',c:[-60,-15]},{n:'EUROPE',c:[15,52]},
  {n:'AFRICA',c:[20,2]},{n:'ASIA',c:[95,45]},{n:'OCEANIA',c:[134,-25]},{n:'ANTARCTICA',c:[0,-82]}];
const GEOMAG_N=[-72.7,80.8], GEOMAG_S=[107.3,-80.8];

/* ---------- night-lights city catalog: [name, lon, lat, weight 1-5] ---------- */
const CITY=[
["Tokyo",139.69,35.68,5],["Yokohama",139.64,35.44,3],["Osaka",135.50,34.69,4],["Nagoya",136.91,35.18,3],["Sapporo",141.35,43.06,2],["Fukuoka",130.40,33.59,2],["Seoul",126.98,37.57,5],["Busan",129.07,35.18,3],["Pyongyang",125.75,39.03,1],
["Beijing",116.40,39.90,5],["Tianjin",117.20,39.08,3],["Shanghai",121.47,31.23,5],["Shenzhen",114.06,22.54,4],["Guangzhou",113.26,23.13,4],["Hong Kong",114.17,22.32,4],["Chengdu",104.07,30.57,3],["Chongqing",106.55,29.56,3],["Wuhan",114.30,30.59,3],
["Xi'an",108.94,34.34,3],["Shenyang",123.43,41.80,2],["Harbin",126.53,45.80,2],["Qingdao",120.38,36.07,2],["Nanjing",118.80,32.06,2],["Kunming",102.83,24.88,2],["Taipei",121.56,25.03,3],["Ulaanbaatar",106.92,47.89,1],
["Manila",120.98,14.60,4],["Cebu",123.89,10.32,1],["Hanoi",105.85,21.03,3],["Ho Chi Minh",106.63,10.82,3],["Bangkok",100.50,13.75,4],["Chiang Mai",98.99,18.79,1],["Phnom Penh",104.92,11.56,1],["Vientiane",102.63,17.97,1],["Yangon",96.16,16.87,2],
["Kuala Lumpur",101.69,3.14,3],["Singapore",103.82,1.35,4],["Jakarta",106.85,-6.21,5],["Surabaya",112.75,-7.25,2],["Bandung",107.61,-6.91,2],["Medan",98.67,3.59,2],["Denpasar",115.22,-8.65,1],
["Delhi",77.10,28.70,5],["Mumbai",72.88,19.08,5],["Kolkata",88.36,22.57,4],["Chennai",80.27,13.08,3],["Bangalore",77.59,12.97,4],["Hyderabad",78.49,17.38,3],["Ahmedabad",72.57,23.02,3],["Pune",73.86,18.52,3],["Jaipur",75.79,26.91,2],
["Lucknow",80.95,26.85,2],["Lahore",74.35,31.55,3],["Karachi",67.01,24.86,4],["Islamabad",73.05,33.68,1],["Dhaka",90.41,23.81,4],["Chittagong",91.80,22.36,2],["Colombo",79.86,6.93,2],["Kathmandu",85.32,27.71,1],
["Tashkent",69.24,41.30,2],["Almaty",76.89,43.24,2],["Astana",71.43,51.13,1],["Baku",49.87,40.41,2],["Tbilisi",44.83,41.72,1],["Yerevan",44.51,40.18,1],["Tehran",51.39,35.69,4],["Mashhad",59.61,36.30,2],["Baghdad",44.36,33.31,3],
["Basra",47.78,30.51,1],["Riyadh",46.72,24.63,3],["Jeddah",39.17,21.54,2],["Dubai",55.27,25.20,3],["Abu Dhabi",54.37,24.45,2],["Doha",51.53,25.29,2],["Kuwait City",47.98,29.38,2],["Muscat",58.54,23.61,1],["Sana'a",44.19,15.37,1],
["Tel Aviv",34.78,32.08,2],["Jerusalem",35.21,31.77,1],["Amman",35.93,31.95,2],["Beirut",35.50,33.89,2],["Damascus",36.29,33.51,1],["Ankara",32.85,39.93,3],["Istanbul",28.98,41.01,4],["Izmir",27.14,38.42,2],
["Cairo",31.24,30.04,5],["Alexandria",29.96,31.20,3],["Khartoum",32.55,15.50,2],["Addis Ababa",38.75,9.02,2],["Nairobi",36.82,-1.29,3],["Dar es Salaam",39.28,-6.79,2],["Kampala",32.58,0.35,2],["Kigali",30.06,-1.94,1],["Kinshasa",15.31,-4.32,3],
["Luanda",13.23,-8.84,2],["Lagos",3.38,6.52,4],["Abuja",7.40,9.06,2],["Kano",8.52,12.00,2],["Accra",-0.19,5.60,2],["Abidjan",-4.01,5.36,2],["Dakar",-17.45,14.72,2],["Bamako",-8.00,12.65,1],["Casablanca",-7.59,33.57,2],["Rabat",-6.85,34.02,1],
["Algiers",3.06,36.75,2],["Tunis",10.17,36.80,2],["Tripoli",13.19,32.89,1],["Johannesburg",28.05,-26.20,3],["Pretoria",28.19,-25.75,2],["Cape Town",18.42,-33.93,2],["Durban",31.02,-29.86,2],["Maputo",32.57,-25.97,1],["Harare",31.03,-17.83,1],
["Lusaka",28.32,-15.39,1],["Antananarivo",47.51,-18.88,1],
["Moscow",37.62,55.75,5],["St Petersburg",30.34,59.93,3],["Novosibirsk",82.92,55.03,2],["Yekaterinburg",60.60,56.84,2],["Kazan",49.11,55.79,1],["Kyiv",30.52,50.45,3],["Kharkiv",36.23,49.99,1],["Minsk",27.56,53.90,2],["Warsaw",21.01,52.23,3],
["Krakow",19.94,50.06,1],["Prague",14.44,50.08,2],["Vienna",16.37,48.21,2],["Budapest",19.04,47.50,2],["Bucharest",26.10,44.43,2],["Sofia",23.32,42.70,1],["Belgrade",20.45,44.79,1],["Zagreb",15.98,45.81,1],["Athens",23.73,37.98,2],
["Berlin",13.40,52.52,3],["Hamburg",9.99,53.55,2],["Munich",11.58,48.14,2],["Frankfurt",8.68,50.11,2],["Cologne",6.96,50.94,2],["Amsterdam",4.90,52.37,2],["Rotterdam",4.48,51.92,1],["Brussels",4.35,50.85,2],["Paris",2.35,48.86,4],
["Lyon",4.84,45.76,1],["Marseille",5.37,43.30,1],["Zurich",8.54,47.38,1],["Geneva",6.14,46.20,1],["Milan",9.19,45.46,3],["Rome",12.50,41.90,3],["Naples",14.27,40.85,2],["Turin",7.69,45.07,1],["Madrid",-3.70,40.42,3],["Barcelona",2.17,41.39,3],
["Valencia",-0.38,39.47,1],["Seville",-5.98,37.39,1],["Lisbon",-9.14,38.72,2],["Porto",-8.61,41.15,1],["London",-0.13,51.51,5],["Birmingham",-1.90,52.48,2],["Manchester",-2.24,53.48,2],["Glasgow",-4.25,55.86,1],["Dublin",-6.26,53.35,2],
["Edinburgh",-3.19,55.95,1],["Oslo",10.75,59.91,2],["Stockholm",18.07,59.33,2],["Copenhagen",12.57,55.68,2],["Helsinki",24.94,60.17,2],["Reykjavik",-21.94,64.15,1],
["New York",-74.01,40.71,5],["Boston",-71.06,42.36,3],["Philadelphia",-75.17,39.95,3],["Washington DC",-77.04,38.91,3],["Baltimore",-76.61,39.29,2],["Pittsburgh",-79.99,40.44,1],["Atlanta",-84.39,33.75,3],["Miami",-80.19,25.76,3],
["Orlando",-81.38,28.54,2],["Tampa",-82.46,27.95,2],["Charlotte",-80.84,35.23,2],["Nashville",-86.78,36.16,2],["Chicago",-87.63,41.88,4],["Detroit",-83.05,42.33,2],["Cleveland",-81.69,41.50,1],["Minneapolis",-93.27,44.98,2],
["St Louis",-90.20,38.63,2],["Kansas City",-94.58,39.10,2],["Dallas",-96.80,32.78,3],["Houston",-95.37,29.76,4],["Austin",-97.74,30.27,2],["San Antonio",-98.49,29.42,2],["New Orleans",-90.07,29.95,1],["Oklahoma City",-97.52,35.47,1],
["Denver",-104.99,39.74,2],["Phoenix",-112.07,33.45,3],["Las Vegas",-115.14,36.17,2],["Salt Lake City",-111.89,40.76,1],["Seattle",-122.33,47.61,3],["Portland",-122.68,45.52,2],["Boise",-116.20,43.62,1],["San Francisco",-122.42,37.77,4],
["San Jose",-121.89,37.34,2],["Sacramento",-121.49,38.58,1],["Los Angeles",-118.24,34.05,5],["San Diego",-117.16,32.72,2],["Vancouver",-123.12,49.28,2],["Calgary",-114.07,51.05,2],["Edmonton",-113.49,53.55,1],["Winnipeg",-97.14,49.90,1],
["Toronto",-79.38,43.65,4],["Ottawa",-75.70,45.42,1],["Montreal",-73.57,45.50,3],["Quebec City",-71.21,46.81,1],["Halifax",-63.57,44.65,1],["Anchorage",-149.90,61.22,1],["Honolulu",-157.86,21.31,1],
["Mexico City",-99.13,19.43,5],["Guadalajara",-103.35,20.67,2],["Monterrey",-100.32,25.67,2],["Tijuana",-117.04,32.51,1],["Havana",-82.38,23.11,2],["Santo Domingo",-69.93,18.49,2],["San Juan",-66.11,18.47,1],["Kingston",-76.79,18.02,1],
["Guatemala City",-90.51,14.63,2],["San Salvador",-89.19,13.69,1],["Managua",-86.25,12.13,1],["San José CR",-84.09,9.93,1],["Panama City",-79.52,8.98,2],["Bogotá",-74.07,4.71,4],["Medellín",-75.56,6.25,2],["Cali",-76.52,3.44,2],
["Caracas",-66.90,10.48,3],["Quito",-78.47,-0.18,2],["Guayaquil",-79.90,-2.17,2],["Lima",-77.04,-12.05,4],["La Paz",-68.12,-16.50,2],["Santa Cruz",-63.18,-17.78,1],["Santiago",-70.65,-33.45,3],["Buenos Aires",-58.38,-34.60,4],
["Córdoba",-64.18,-31.42,1],["Rosario",-60.64,-32.95,1],["Montevideo",-56.16,-34.90,1],["Asunción",-57.58,-25.26,1],["São Paulo",-46.63,-23.55,5],["Rio de Janeiro",-43.17,-22.91,4],["Belo Horizonte",-43.94,-19.92,2],["Brasília",-47.88,-15.79,2],
["Salvador",-38.50,-12.97,2],["Recife",-34.88,-8.05,2],["Fortaleza",-38.54,-3.72,2],["Manaus",-60.02,-3.12,1],["Belém",-48.50,-1.46,1],["Porto Alegre",-51.22,-30.03,2],["Curitiba",-49.27,-25.43,2],
["Sydney",151.21,-33.87,3],["Melbourne",144.96,-37.81,3],["Brisbane",153.03,-27.47,2],["Perth",115.86,-31.95,2],["Adelaide",138.60,-34.93,1],["Canberra",149.13,-35.28,1],["Auckland",174.76,-36.85,2],["Wellington",174.78,-41.29,1],
["Christchurch",172.64,-43.53,1],["Suva",178.44,-18.14,1],["Port Moresby",147.18,-9.44,1]];

/* precompute light points: each city core + seeded sprawl cluster */
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let x=Math.imul(a^a>>>15,1|a);x=x+Math.imul(x^x>>>7,61|x)^x;return((x^x>>>14)>>>0)/4294967296;};}
const L={lonR:[],slat:[],clat:[],s:[],a:[],ph:[],n:0}, BIGS=[], LBL=[];
(function(){
  const rng=mulberry(1337);
  const push=(lon,lat,size,alpha)=>{const la=lat*rad;
    L.lonR.push(lon*rad);L.slat.push(Math.sin(la));L.clat.push(Math.cos(la));
    L.s.push(size);L.a.push(Math.min(1,alpha));L.ph.push(rng()*TAU);L.n++;};
  const nearDest=(lon,lat)=>{if(Math.abs(lat-HOME[1])<1.2&&Math.abs(lon-HOME[0])<1.8)return true;
    for(const k in DESTS){const p=DESTS[k];if(Math.abs(lat-p[1])<1.2&&Math.abs(lon-p[0])<1.8)return true;}return false;};
  CITY.forEach(c=>{
    const lon=c[1],lat=c[2],w=c[3];
    push(lon,lat,1.0+w*0.45,0.5+w*0.11);
    if(w>=3){BIGS.push(L.n-1); if(!nearDest(lon,lat)) LBL.push({name:c[0],lonR:lon*rad,slat:Math.sin(lat*rad),clat:Math.cos(lat*rad),w:w});}
    const spr=(COARSE?1:2)*w;
    for(let k=0;k<spr;k++){const ang=rng()*TAU,dst=(0.3+rng()*1.4)*(0.45+w*0.17);
      push(lon+Math.cos(ang)*dst/Math.max(0.25,Math.cos(lat*rad)),lat+Math.sin(ang)*dst*0.8,0.7+rng()*0.8,0.18+rng()*0.2);}
  });
})();

/* ---------- satellite constellation (drawn in the globe frame) ---------- */
const ORBITS=[
  {name:'LEO-A',inc:51.6*rad,raan:12,alt:0.085,w:0.008,ph:0.6,sats:4},
  {name:'SSO-B',inc:97.4*rad,raan:118,alt:0.130,w:-0.0062,ph:2.4,sats:3}];

/* ---------- state ---------- */
let land=null,landFeats=null,borders=null,admin1=null;
const graticule=d3.geoGraticule10?d3.geoGraticule10():null;
const EQ={type:'LineString',coordinates:d3.range(-180,181,3).map(x=>[x,0])};
const PM={type:'LineString',coordinates:d3.range(-89,90,3).map(y=>[0,y])};
let rot=[0,-18],zoom=1,lastTouch=0,drag=null,tdrag=null,pinch=null;
let tx=0,ty=0; window.__setGlobeTilt=function(ax,ay){tx=ax;ty=ay;};
let stars=null,shoot=null,shootNext=2600;
let curProj=null,hov=null,hovIn=false,ctyName=null,lastCty=0,pendingSet=0,lastTap=0;
let hovKey=null,hovKeyT0=0,hovGeoT0=0,prevHovIn=false,curCursor='';
let hoverables=[];                                    // last frame's hoverable markers
let cam=null,follow=null;                             // camera tween / tracking lock
let events=[],nextEv=7000;                            // ambient event director
let tear=null,tearNext=12000;                         // CRT sync tear
let sig=0.62;const sigBuf=new Float32Array(44).fill(0.6);  // uplink sparkline
const VP={cx:0,cy:0,Rd:1,lam0R:0,sinF:0,cosF:1,w:0,h:0};
const SUN={lonR:0,sin:0,cos:1,lon:0,lat:0};

/* ---------- layer flags (Globe Deck toggles these; persisted) ---------- */
const LAYERS={seis:true,sat:true,iss:true,aur:true,arc:true,term:true};
try{const s=JSON.parse(localStorage.getItem('cc_globe_layers')||'null');
  if(s)for(const k in LAYERS)if(typeof s[k]==='boolean')LAYERS[k]=s[k];}catch(e){}

/* easing */
function easeC(u){return u<0.5?4*u*u*u:1-Math.pow(-2*u+2,3)/2;}
function easeO(u){return 1-Math.pow(1-u,3);}
function easeBack(u){const c=1.19;return 1+(c+1)*Math.pow(u-1,3)+c*Math.pow(u-1,2);}
function shortLon(d){d%=360;if(d>180)d-=360;if(d<-180)d+=360;return d;}
function flyTo(lon,lat,z1,dur,back){
  const lat2=Math.max(-85,Math.min(85,lat));
  cam={r0:rot.slice(),dl:shortLon(-lon-rot[0]),dp:(-lat2)-rot[1],
    z0:zoom,z1:z1,t0:now(),dur:dur||1300,back:!!back};}

/* target lock (persists) */
let tgt=null;
try{const s=localStorage.getItem('cc_globe_target');if(s){const j=JSON.parse(s);
  if(j&&isFinite(j.lon)&&isFinite(j.lat))tgt=mkTgt(j.lon,j.lat);}}catch(e){}
function mkTgt(lon,lat){const la=lat*rad;
  return {lon:lon,lat:lat,name:null,t0:now(),slat:Math.sin(la),clat:Math.cos(la),
    li:d3.geoInterpolate(HOME,[lon,lat]),h:0.05+0.10*(d3.geoDistance(HOME,[lon,lat])/Math.PI)};}
function setTarget(lon,lat){tgt=mkTgt(lon,lat);lastTouch=now();
  try{localStorage.setItem('cc_globe_target',JSON.stringify({lon:lon,lat:lat}));}catch(e){}}
function clearTarget(){tgt=null;try{localStorage.removeItem('cc_globe_target');}catch(e){}}

/* ---------- data feeds ---------- */
if(window.topojson){
  fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
    .then(r=>r.json()).then(w=>{land=topojson.feature(w,w.objects.countries);landFeats=land.features||[];
      borders=topojson.mesh(w,w.objects.countries,(a,b)=>a!==b);}).catch(()=>{});
}
fetch('https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_admin_1_states_provinces.geojson')
  .then(r=>r.json()).then(g=>{admin1={type:'FeatureCollection',features:(g.features||[]).filter(f=>{
    const c=d3.geoCentroid(f);return c[0]>=-170&&c[0]<=-30&&c[1]>=-58&&c[1]<=75;})};}).catch(()=>{});

/* ISS: live fixes → smooth extrapolation + orbit ground track */
let fixes=[],issPole=null,issInfo=null;
function v3v(lon,lat){const la=lat*rad,lo=lon*rad;return [Math.cos(la)*Math.cos(lo),Math.cos(la)*Math.sin(lo),Math.sin(la)];}
function pollISS(){if(document.hidden)return;
  fetch('https://api.wheretheiss.at/v1/satellites/25544').then(r=>r.json()).then(d=>{
    if(!d||d.latitude==null)return;
    // real telemetry the HUD/deck shows: altitude km, velocity km/h, sunlit state
    issInfo={alt:+d.altitude,vel:+d.velocity,vis:d.visibility||'',t:Date.now()};
    const p=[+d.longitude,+d.latitude],t=Date.now();
    if(fixes.length&&Math.abs(fixes[fixes.length-1].p[0]-p[0])<1e-4&&Math.abs(fixes[fixes.length-1].p[1]-p[1])<1e-4)return;
    fixes.push({p:p,t:t}); if(fixes.length>2)fixes.shift();
    if(fixes.length===2){const a=v3v(fixes[0].p[0],fixes[0].p[1]),b=v3v(fixes[1].p[0],fixes[1].p[1]);
      const n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
      const ln=Math.hypot(n[0],n[1],n[2]);
      if(ln>1e-7)issPole=[Math.atan2(n[1],n[0])*R2D,Math.asin(n[2]/ln)*R2D];}
  }).catch(()=>{});}
pollISS();setInterval(pollISS,20000);
function issPos(){
  if(!fixes.length)return null;
  if(fixes.length===1)return fixes[0].p;
  const f0=fixes[0],f1=fixes[1],span=Math.max(1000,f1.t-f0.t);
  const u=Math.min(1+(Date.now()-f1.t)/span,4);
  try{return d3.geoInterpolate(f0.p,f1.p)(u);}catch(e){return f1.p;}}

/* USGS seismic feed (M2.5+, last 24h) + readout chip */
let quakes=[];
(function(){const foot=document.querySelector('.globe-wrap .wxfoot')||document.querySelector('.globe-wrap .readout');
  if(foot&&!document.getElementById('seis')){const s=document.createElement('span');
    s.id='seis';s.className='wx';s.textContent='SEIS —';
    // land it between ZOOM and the moon in the footer telemetry line
    foot.insertBefore(s,foot.lastElementChild);}})();
function pollQuakes(){if(document.hidden)return;
  fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson')
    .then(r=>r.json()).then(g=>{const f=g.features||[];let mx=0;
      quakes=f.map(q=>{const c=q.geometry.coordinates,m=q.properties.mag||0;mx=Math.max(mx,m);
        const la=c[1]*rad;
        return {lon:c[0],lat:c[1],lonR:c[0]*rad,slat:Math.sin(la),clat:Math.cos(la),m:m,t:q.properties.time,ph:Math.random(),
          place:q.properties.place||'',depth:+c[2]||0,tsu:q.properties.tsunami?1:0};})
        .filter(q=>q.m>=2.5).sort((a,b)=>b.m-a.m).slice(0,70);
      const el=document.getElementById('seis');
      if(el){el.textContent='SEIS '+f.length+' · M'+mx.toFixed(1);
        el.style.color=mx>=6.5?'#ff6b5a':(mx>=5?'#ffd24a':'');
        el.title='USGS live feed · '+f.length+' quakes M2.5+ in the last 24h · max M'+mx.toFixed(1)+' · rings on the globe scale with magnitude';}
    }).catch(()=>{});}
pollQuakes();setInterval(pollQuakes,300000);

/* ---------- math helpers ---------- */
function subSolar(){const n=new Date();
  const soy=Date.UTC(n.getUTCFullYear(),0,0);
  const doy=(Date.UTC(n.getUTCFullYear(),n.getUTCMonth(),n.getUTCDate())-soy)/86400000;
  const decl=-23.44*Math.cos((TAU/365)*(doy+10));
  const utch=n.getUTCHours()+n.getUTCMinutes()/60+n.getUTCSeconds()/3600;
  let lon=-15*(utch-12);while(lon>180)lon-=360;while(lon<-180)lon+=360;
  return [lon,decl];}
function p3(lonR,slat,clat,alt){
  const dl=lonR-VP.lam0R,cd=Math.cos(dl);
  const x=clat*Math.sin(dl);
  const y=VP.cosF*slat-VP.sinF*clat*cd;
  const z=VP.sinF*slat+VP.cosF*clat*cd;
  const k=VP.Rd*(1+(alt||0));
  return [VP.cx+k*x,VP.cy-k*y,z];}
function pt3(lon,lat,alt){const la=lat*rad;return p3(lon*rad,Math.sin(la),Math.cos(la),alt);}
function darkAt(lonR,slat,clat){const cosd=SUN.sin*slat+SUN.cos*clat*Math.cos(lonR-SUN.lonR);
  return Math.max(0,Math.min(1,(0.055-cosd)/0.11));}
function dayState(lon,lat){const la=lat*rad;
  const cosd=SUN.sin*Math.sin(la)+SUN.cos*Math.cos(la)*Math.cos(lon*rad-SUN.lonR);
  return cosd>0.03?'DAY':(cosd<-0.03?'NIGHT':'DUSK');}
function orbLL(O,s){const lat=Math.asin(Math.sin(O.inc)*Math.sin(s))*R2D;
  const lon=O.raan+Math.atan2(Math.cos(O.inc)*Math.sin(s),Math.cos(s))*R2D;
  return [lon,lat];}
function orbPt(O,s,alt){const ll=orbLL(O,s);return pt3(ll[0],ll[1],alt);}
function satArg(O,k,t){return O.ph+(REDUCE?0:t*O.w*TAU)+k*TAU/O.sats;}
function continentAt(lon,lat){let best=null,bd=Infinity;
  for(const k of CONTS){const d=d3.geoDistance([lon,lat],k.c);if(d<bd){bd=d;best=k;}}
  return bd<1.0?best.n:null;}
function countryAt(lon,lat){if(!landFeats)return null;
  try{for(const f of landFeats){if(f.properties&&d3.geoContains(f,[lon,lat]))return (f.properties.name||'').toUpperCase();}}catch(e){}
  return null;}
const fmtLL=(lon,lat)=>Math.abs(lat).toFixed(1)+'°'+(lat>=0?'N':'S')+' · '+Math.abs(lon).toFixed(1)+'°'+(lon>=0?'E':'W');
function zoneTime(lon){const z=Math.round(lon/15),d=new Date(Date.now()+z*3600e3);
  return 'UTC'+(z>=0?'+':'')+z+' '+String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0');}
const kmFrom=(a,b)=>Math.round(d3.geoDistance(a,b)*6371).toLocaleString('en-US');
function auroraPts(cLon,cLat,base,i,tt){const pts=[];
  const sF=Math.sin(cLat*rad),cF=Math.cos(cLat*rad),lo=cLon*rad;
  for(let k=0;k<=72;k++){const th=k/72*TAU;
    const del=(base+i*2.1+2.4*Math.sin(3*th+tt+i*1.7)+1.1*Math.sin(7*th-tt*1.3))*rad;
    const sd=Math.sin(del),cd=Math.cos(del);
    const la=Math.asin(sF*cd+cF*sd*Math.cos(th));
    const lo2=lo+Math.atan2(Math.sin(th)*sd*cF,cd-sF*Math.sin(la));
    pts.push([lo2,Math.sin(la),Math.cos(la)]);}
  return pts;}

/* ---------- ambient event director ---------- */
function spawnEvent(ms){
  if(events.length>=2)return;
  for(let tries=0;tries<4;tries++){
    const r=Math.random();let e=null;
    if(r<0.4&&BIGS.length){const i=BIGS[(Math.random()*BIGS.length)|0];
      e={k:'flare',lonR:L.lonR[i],slat:L.slat[i],clat:L.clat[i],t0:ms,dur:2400};}
    else if(r<0.72){const ks=Object.keys(DESTS);
      const p=Math.random()<0.3?HOME:DESTS[ks[(Math.random()*ks.length)|0]];
      const la=p[1]*rad;e={k:'ping',lonR:p[0]*rad,slat:Math.sin(la),clat:Math.cos(la),t0:ms,dur:2800};}
    else{const c=CITY[(Math.random()*CITY.length)|0];const la=c[2]*rad;
      e={k:'sweep',lonR:c[1]*rad,slat:Math.sin(la),clat:Math.cos(la),t0:ms,dur:3000,a0:Math.random()*TAU};}
    if(p3(e.lonR,e.slat,e.clat,0)[2]>0.08){events.push(e);return;}   // keep it on the visible face
  }}
function drawEvents(ms){
  if(!events.length)return;
  events=events.filter(e=>ms-e.t0<e.dur);
  ctx.save();ctx.globalCompositeOperation='lighter';
  for(const e of events){const u=(ms-e.t0)/e.dur,env=Math.sin(Math.PI*Math.min(1,u));
    const p=p3(e.lonR,e.slat,e.clat,0);if(p[2]<=0.02)continue;
    if(e.k==='flare'){
      ctx.fillStyle='rgba(255,240,190,'+(0.75*env).toFixed(3)+')';
      ctx.shadowColor='#ffe7a0';ctx.shadowBlur=14*env;
      ctx.beginPath();ctx.arc(p[0],p[1],1.5+3.5*env,0,7);ctx.fill();ctx.shadowBlur=0;
      ctx.strokeStyle='rgba(255,225,150,'+(0.4*Math.max(0,1-u)).toFixed(3)+')';ctx.lineWidth=1;
      ctx.beginPath();ctx.arc(p[0],p[1],3+u*16,0,7);ctx.stroke();
    }else if(e.k==='ping'){
      for(let j=0;j<2;j++){const pu=Math.max(0,Math.min(1,u*1.4-j*0.28));if(pu<=0)continue;
        ctx.strokeStyle='rgba(125,247,255,'+(0.5*(1-pu)*env).toFixed(3)+')';ctx.lineWidth=1.1-j*0.3;
        ctx.beginPath();ctx.arc(p[0],p[1],2+pu*22,0,7);ctx.stroke();}
      ctx.fillStyle='rgba(190,250,255,'+(0.7*env).toFixed(3)+')';
      ctx.fillRect(p[0]-0.8,p[1]-0.8,1.6,1.6);
    }else{
      const rr=Math.max(22,Math.min(56,VP.Rd*0.16));
      const a0=e.a0+u*4.2,a1=a0+1.15;
      const grd=ctx.createRadialGradient(p[0],p[1],0,p[0],p[1],rr);
      grd.addColorStop(0,'rgba(125,247,255,'+(0.16*env).toFixed(3)+')');grd.addColorStop(1,'rgba(125,247,255,0)');
      ctx.fillStyle=grd;ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.arc(p[0],p[1],rr,a0,a1);ctx.closePath();ctx.fill();
      ctx.strokeStyle='rgba(125,247,255,'+(0.30*env).toFixed(3)+')';ctx.lineWidth=0.8;
      ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(p[0]+Math.cos(a1)*rr,p[1]+Math.sin(a1)*rr);ctx.stroke();
      ctx.strokeStyle='rgba(125,247,255,'+(0.16*env).toFixed(3)+')';
      ctx.beginPath();ctx.arc(p[0],p[1],rr,0,7);ctx.stroke();}
  }
  ctx.restore();}

/* ---------- HUD drawing helpers ---------- */
function hudBox(x,y,lines,accent,o){
  o=o||{};const age=o.age==null?1e4:o.age;
  const ap=Math.min(1,age/240),al=easeO(ap);
  if(al<=0.02)return null;
  ctx.font='9px ui-monospace,monospace';
  let bw=0;for(const l of lines)bw=Math.max(bw,ctx.measureText(l).width);
  bw+=14;const bh=lines.length*11+9+(o.spark?14:0);
  x=Math.min(Math.max(6,x),VP.w-bw-6);y=Math.min(Math.max(6,y),VP.h-bh-6);
  ctx.save();ctx.globalAlpha=al;
  ctx.fillStyle='rgba(2,11,6,0.80)';ctx.fillRect(x,y,bw,bh);
  if(age<170&&!REDUCE){                              // chromatic-edge glitch on entry
    ctx.strokeStyle='rgba(255,80,80,0.45)';ctx.strokeRect(x-1.5,y+0.5,bw,bh);
    ctx.strokeStyle='rgba(80,220,255,0.45)';ctx.strokeRect(x+2.5,y-0.5,bw,bh);}
  ctx.strokeStyle='rgba(65,255,126,0.30)';ctx.lineWidth=1;ctx.strokeRect(x+0.5,y+0.5,bw-1,bh-1);
  const cl2=easeO(ap)*8;                             // corner brackets draw themselves in
  ctx.strokeStyle=accent;
  [[x+0.5,y+0.5,1,1],[x+bw-0.5,y+0.5,-1,1],[x+0.5,y+bh-0.5,1,-1],[x+bw-0.5,y+bh-0.5,-1,-1]].forEach(c=>{
    ctx.beginPath();ctx.moveTo(c[0],c[1]+c[3]*cl2);ctx.lineTo(c[0],c[1]);ctx.lineTo(c[0]+c[2]*cl2,c[1]);ctx.stroke();});
  let budget=(o.typed&&!REDUCE)?Math.floor(age/9):1e6;   // typewriter reveal
  lines.forEach((l,i)=>{let s=l;
    if(budget<l.length){s=l.slice(0,Math.max(0,budget))+(budget>0?'▌':'');budget=0;}
    else budget-=l.length;
    ctx.fillStyle=i?'rgba(160,255,200,0.85)':accent;ctx.fillText(s,x+7,y+13+i*11);});
  if(o.spark){                                       // live uplink sparkline
    const sx=x+7,sy=y+bh-5,sw3=bw-14,sh=9;
    ctx.strokeStyle='rgba(125,247,255,0.75)';ctx.lineWidth=1;ctx.beginPath();
    for(let i=0;i<sigBuf.length;i++){const vx=sx+sw3*i/(sigBuf.length-1),vy=sy-sigBuf[i]*sh;
      i?ctx.lineTo(vx,vy):ctx.moveTo(vx,vy);}
    ctx.stroke();}
  ctx.restore();return [x,y,bw,bh];}
function reticle(x,y){ctx.strokeStyle='rgba(125,247,255,0.85)';ctx.lineWidth=1;
  const r=13;[[-1,-1],[1,-1],[-1,1],[1,1]].forEach(q=>{ctx.beginPath();
    ctx.moveTo(x+q[0]*r,y+q[1]*r-q[1]*5);ctx.lineTo(x+q[0]*r,y+q[1]*r);ctx.lineTo(x+q[0]*r-q[0]*5,y+q[1]*r);ctx.stroke();});
  ctx.fillStyle='rgba(215,255,255,0.9)';ctx.fillRect(x-1,y-1,2,2);}
function markerReticle(x,y,age){
  const e=easeO(Math.min(1,age/260));
  const r=13+9*(1-e),arm=1+5*e;
  ctx.save();ctx.globalAlpha=e;ctx.translate(x,y);ctx.rotate((1-e)*0.5);
  ctx.strokeStyle='rgba(125,247,255,0.9)';ctx.lineWidth=1.1;
  [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(q=>{ctx.beginPath();
    ctx.moveTo(q[0]*r,q[1]*r-q[1]*arm);ctx.lineTo(q[0]*r,q[1]*r);ctx.lineTo(q[0]*r-q[0]*arm,q[1]*r);ctx.stroke();});
  ctx.restore();}

/* ---------- input ---------- */
function seedStars(w,h){stars=[];const n=Math.min(300,Math.round(w*h/3600));
  for(let i=0;i<n;i++){const z=Math.random();stars.push({x:Math.random()*w,y:Math.random()*h,z:z,r:0.2+z*1.3,p:Math.random()*6.28,s:0.4+Math.random()*1.2,d:0.25+z*0.75});}}
window.addEventListener('resize',()=>{ctx=fit();stars=null;});
document.addEventListener('hub:ready',()=>{ctx=fit();stars=null;});
try{if('ResizeObserver' in window)new ResizeObserver(()=>{ctx=fit();stars=null;}).observe(cv.parentElement||cv);}catch(e){}
function rotBy(dx,dy,r0){const s=0.28/zoom;rot[0]=r0[0]+dx*s;rot[1]=Math.max(-89,Math.min(89,r0[1]-dy*s));}
function zoomMul(m){zoom=Math.max(1,Math.min(6,zoom*m));}
function tdist(e){const a=e.touches[0],b=e.touches[1];return Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);}
function cvXY(cx2,cy2){const r=cv.getBoundingClientRect();return [cx2-r.left,cy2-r.top];}
function llAt(x,y){if(!curProj)return null;
  const dx=x-VP.cx,dy=y-VP.cy;if(dx*dx+dy*dy>VP.Rd*VP.Rd)return null;
  try{const ll=curProj.invert([x,y]);
    return (ll&&isFinite(ll[0])&&isFinite(ll[1]))?ll:null;}catch(e){return null;}}
function onTap(x,y){
  let best=null,bd=225;                              // 1) satellite / ISS → camera lock
  for(const m of hoverables){if(!m.follow)continue;
    const dx=x-m.x,dy=y-m.y,d2=dx*dx+dy*dy;if(d2<bd){bd=d2;best=m;}}
  if(best){follow=best.follow;cam=null;lastTouch=now();return;}
  if(follow){follow=null;return;}                    // 2) tracking active → click space releases
  const ll=llAt(x,y);                                // 3) ground → target lock + fly-to
  if(ll){setTarget(+ll[0].toFixed(3),+ll[1].toFixed(3));
    flyTo(ll[0],ll[1],Math.max(zoom,1.7),1250,false);}}
function pullBack(){clearTimeout(pendingSet);clearTarget();follow=null;
  flyTo(-rot[0],18,1,1500,true);}
cv.style.cursor='grab';
cv.addEventListener('mousedown',e=>{cam=null;
  drag={x:e.clientX,y:e.clientY,t:now(),r0:rot.slice(),moved:false};cv.style.cursor='grabbing';lastTouch=now();});
window.addEventListener('mousemove',e=>{if(!drag)return;
  if(Math.abs(e.clientX-drag.x)>4||Math.abs(e.clientY-drag.y)>4){drag.moved=true;follow=null;}
  rotBy(e.clientX-drag.x,e.clientY-drag.y,drag.r0);lastTouch=now();});
window.addEventListener('mouseup',e=>{if(!drag)return;
  const wasClick=!drag.moved&&(now()-drag.t)<450;drag=null;cv.style.cursor='grab';lastTouch=now();
  if(wasClick){const xy=cvXY(e.clientX,e.clientY);
    clearTimeout(pendingSet);pendingSet=setTimeout(()=>onTap(xy[0],xy[1]),260);}});
cv.addEventListener('dblclick',e=>{e.preventDefault();pullBack();});
cv.addEventListener('mousemove',e=>{const xy=cvXY(e.clientX,e.clientY);hov={x:xy[0],y:xy[1]};
  const tn=now();
  if(tn-lastCty>160){lastCty=tn;const ll=llAt(xy[0],xy[1]);ctyName=ll?countryAt(ll[0],ll[1]):null;}});
cv.addEventListener('mouseleave',()=>{hov=null;});
cv.addEventListener('wheel',e=>{e.preventDefault();cam=null;zoomMul(e.deltaY<0?1.12:0.89);lastTouch=now();},{passive:false});
cv.addEventListener('touchstart',e=>{cam=null;
  if(e.touches.length===1)tdrag={x:e.touches[0].clientX,y:e.touches[0].clientY,t:now(),r0:rot.slice(),axis:0,moved:false};
  else if(e.touches.length===2){pinch=tdist(e);tdrag=null;}
  lastTouch=now();},{passive:true});
cv.addEventListener('touchmove',e=>{
  if(e.touches.length===2&&pinch){e.preventDefault();const d=tdist(e);zoomMul(d/pinch);pinch=d;lastTouch=now();return;}
  if(e.touches.length===1&&tdrag){
    const dx=e.touches[0].clientX-tdrag.x,dy=e.touches[0].clientY-tdrag.y;
    if(window.CC_DECK_OPEN){
      // fullscreen deck: no page to scroll — drag in ANY direction rotates freely
      if(!tdrag.moved&&(Math.abs(dx)>3||Math.abs(dy)>3)){tdrag.moved=true;follow=null;}
      e.preventDefault();rotBy(dx,dy,tdrag.r0);lastTouch=now();
    }else{
      // small panel: horizontal = rotate, vertical = let the page scroll past it
      if(!tdrag.axis&&(Math.abs(dx)>6||Math.abs(dy)>6)){tdrag.axis=Math.abs(dx)>=Math.abs(dy)?'h':'v';tdrag.moved=true;follow=null;}
      if(tdrag.axis==='h'){e.preventDefault();rotBy(dx,dy,tdrag.r0);lastTouch=now();}
    }
  }},{passive:false});
cv.addEventListener('touchend',e=>{
  if(e.touches.length===0){
    if(tdrag&&!tdrag.moved&&(now()-tdrag.t)<350&&e.changedTouches.length){
      const c=e.changedTouches[0],xy=cvXY(c.clientX,c.clientY);
      const tn=now();
      if(lastTap&&tn-lastTap<400){pullBack();lastTap=0;}
      else{onTap(xy[0],xy[1]);lastTap=tn;}
    }
    tdrag=null;pinch=null;}
  lastTouch=now();});
function interacting(){return drag||tdrag||pinch;}
function vis(p){return d3.geoDistance(p,[-rot[0],-rot[1]])<1.5;}

/* ---------- render ---------- */
let gVis=true,gLast=0;
try{if('IntersectionObserver' in window)new IntersectionObserver(es=>{gVis=es[0].isIntersecting;},{rootMargin:'140px'}).observe(cv);}catch(e){}
function draw(ms){
  requestAnimationFrame(draw);
  if(document.hidden||!gVis||window.CC_GAME_OPEN)return;
  if(ms&&ms-gLast<FRAME_MS)return;
  const dtn=gLast?Math.max(0.25,Math.min(2.5,(ms-gLast)/32)):1;   // motion normalized to the old 30fps step
  gLast=ms||gLast;
  const w=cv.width/DPR,h=cv.height/DPR;
  if(w<30||h<30)return;
  if(!stars)seedStars(w,h);
  const t=now()/1000;

  /* camera: tweened fly-to / satellite follow / ambient rotation */
  if(cam){const u=Math.min(1,(now()-cam.t0)/cam.dur);
    const e=cam.back?easeBack(u):easeC(u);
    rot[0]=cam.r0[0]+cam.dl*e;rot[1]=cam.r0[1]+cam.dp*e;
    zoom=cam.z0+(cam.z1-cam.z0)*e;
    if(!cam.back)zoom*=1-0.05*Math.sin(Math.PI*Math.min(1,u*1.45));  // FOV punch mid-flight
    zoom=Math.max(0.92,Math.min(6,zoom));
    if(u>=1){zoom=Math.max(1,Math.min(6,cam.z1));cam=null;}}
  else if(follow){
    const fp=follow.type==='iss'?issPos():orbLL(ORBITS[follow.o],satArg(ORBITS[follow.o],follow.k,t));
    if(fp){const dl=shortLon(-fp[0]-rot[0]),dp=(-Math.max(-85,Math.min(85,fp[1])))-rot[1];
      const k=Math.min(1,0.09*dtn);rot[0]+=dl*k;rot[1]+=dp*k;}}
  else if(!interacting()&&!hovIn&&zoom<=1.15&&now()-lastTouch>3200)rot[0]+=0.11*dtn;

  ctx.save();ctx.scale(DPR,DPR);ctx.clearRect(0,0,w,h);

  /* ---- deep-space nebula pools ---- */
  ctx.save();ctx.globalCompositeOperation='lighter';
  const n1x=w*(0.28+0.06*Math.sin(t*0.05)),n1y=h*(0.24+0.05*Math.cos(t*0.04));
  let ng=ctx.createRadialGradient(n1x,n1y,0,n1x,n1y,Math.max(w,h)*0.5);
  ng.addColorStop(0,'rgba(45,255,140,0.07)');ng.addColorStop(0.5,'rgba(30,180,110,0.03)');ng.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=ng;ctx.fillRect(0,0,w,h);
  const n2x=w*(0.78-0.05*Math.cos(t*0.06)),n2y=h*(0.70+0.05*Math.sin(t*0.05));
  ng=ctx.createRadialGradient(n2x,n2y,0,n2x,n2y,Math.max(w,h)*0.42);
  ng.addColorStop(0,'rgba(90,240,255,0.055)');ng.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=ng;ctx.fillRect(0,0,w,h);ctx.restore();

  /* ---- starfield (3-depth parallax) ---- */
  for(const s of stars){const a=(0.25+0.5*Math.abs(Math.sin(t*s.s+s.p)))*s.d;
    const px=((s.x-rot[0]*(0.5+s.z*1.6))%w+w)%w;
    ctx.fillStyle='rgba(150,255,195,'+a.toFixed(3)+')';
    ctx.beginPath();ctx.arc(px,s.y,s.r,0,7);ctx.fill();
    if(s.z>0.85){ctx.fillStyle='rgba(150,255,195,'+(a*0.35).toFixed(3)+')';
      ctx.beginPath();ctx.arc(px,s.y,s.r*2.4,0,7);ctx.fill();}}

  /* ---- occasional shooting star ---- */
  if(!REDUCE){
    if(!shoot&&ms>shootNext){const ang=0.35+Math.random()*0.9;
      shoot={x:w*(0.1+Math.random()*0.55),y:h*(0.04+Math.random()*0.2),dx:Math.cos(ang)*w*0.42,dy:Math.sin(ang)*h*0.30,f:0};}
    if(shoot){shoot.f+=0.05*dtn;
      if(shoot.f>=1){shoot=null;shootNext=ms+9000+Math.random()*16000;}
      else{const f=shoot.f,fade=Math.sin(Math.PI*f);
        const hx=shoot.x+shoot.dx*f,hy=shoot.y+shoot.dy*f;
        const bx=shoot.x+shoot.dx*Math.max(0,f-0.10),by=shoot.y+shoot.dy*Math.max(0,f-0.10);
        const sg=ctx.createLinearGradient(bx,by,hx,hy);
        sg.addColorStop(0,'rgba(190,255,220,0)');sg.addColorStop(1,'rgba(225,255,238,'+(0.7*fade).toFixed(3)+')');
        ctx.save();ctx.strokeStyle=sg;ctx.lineWidth=1.2;ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(bx,by);ctx.lineTo(hx,hy);ctx.stroke();
        ctx.fillStyle='rgba(240,255,247,'+(0.85*fade).toFixed(3)+')';
        ctx.beginPath();ctx.arc(hx,hy,1.4,0,7);ctx.fill();ctx.restore();}}
  }

  const cx=w/2,cy=h/2;
  const baseR=Math.max(8,(Math.min(w,h)/2-12)*0.84);
  const Rd=baseR*zoom;
  const proj=d3.geoOrthographic().scale(Rd).translate([cx,cy]).clipAngle(90).rotate([rot[0],rot[1],0]);
  const path=d3.geoPath(proj,ctx);
  curProj=proj;
  VP.cx=cx;VP.cy=cy;VP.Rd=Rd;VP.lam0R=-rot[0]*rad;VP.w=w;VP.h=h;
  VP.sinF=Math.sin(-rot[1]*rad);VP.cosF=Math.cos(-rot[1]*rad);
  const ss=subSolar();SUN.lon=ss[0];SUN.lat=ss[1];SUN.lonR=ss[0]*rad;
  SUN.sin=Math.sin(ss[1]*rad);SUN.cos=Math.cos(ss[1]*rad);
  hovIn=!!(hov&&!drag&&((hov.x-cx)*(hov.x-cx)+(hov.y-cy)*(hov.y-cy)<=Rd*Rd));
  if(hovIn&&!prevHovIn)hovGeoT0=now();
  prevHovIn=hovIn;
  const hovers=[];                                    // this frame's hoverable markers

  /* uplink signal random walk (feeds the callout sparkline) */
  sig=Math.max(0.15,Math.min(0.98,sig+(Math.random()-0.5)*0.11*dtn));
  sigBuf.copyWithin(0,1);sigBuf[sigBuf.length-1]=sig;

  /* ambient event scheduling */
  if(!REDUCE&&ms>nextEv){spawnEvent(ms);nextEv=ms+8000+Math.random()*7000;}

  /* ---- breathing volumetric halo ---- */
  const breath=0.86+0.14*Math.sin(t*0.45);
  const haloA=Math.max(0,Math.min(1,1.4-zoom))*breath;
  if(haloA>0.02){
    const halo=ctx.createRadialGradient(cx,cy,Rd*0.92,cx,cy,Rd*1.32);
    halo.addColorStop(0,'rgba(65,255,126,0)');halo.addColorStop(0.45,'rgba(65,255,126,'+(0.20*haloA).toFixed(3)+')');
    halo.addColorStop(0.7,'rgba(80,255,160,'+(0.11*haloA).toFixed(3)+')');halo.addColorStop(1,'rgba(65,255,126,0)');
    ctx.save();ctx.globalCompositeOperation='lighter';ctx.fillStyle=halo;
    ctx.beginPath();ctx.arc(cx,cy,Rd*1.32,0,7);ctx.fill();
    const aura=ctx.createRadialGradient(cx,cy,Rd*1.02,cx,cy,Rd*1.85);
    aura.addColorStop(0,'rgba(65,255,126,'+(0.055*haloA).toFixed(3)+')');aura.addColorStop(1,'rgba(65,255,126,0)');
    ctx.fillStyle=aura;ctx.beginPath();ctx.arc(cx,cy,Rd*1.85,0,7);ctx.fill();ctx.restore();
  }

  /* ---- satellite orbit tracks: back halves ---- */
  const satsOn=LAYERS.sat&&zoom<2.6;
  function drawTracks(front){ctx.save();ctx.setLineDash([3,7]);
    ctx.strokeStyle=front?'rgba(125,247,255,0.20)':'rgba(125,247,255,0.08)';ctx.lineWidth=front?0.9:0.7;
    ORBITS.forEach(O=>{let started=false;ctx.beginPath();
      for(let i=0;i<=110;i++){const p=orbPt(O,i/110*TAU,O.alt);
        const ok=front?p[2]>0:p[2]<=0;
        if(ok){if(started)ctx.lineTo(p[0],p[1]);else{ctx.moveTo(p[0],p[1]);started=true;}}
        else started=false;}
      ctx.stroke();});
    ctx.setLineDash([]);ctx.restore();}
  if(satsOn)drawTracks(false);

  /* ================= sphere ================= */
  ctx.save();ctx.beginPath();ctx.arc(cx,cy,Rd,0,7);ctx.clip();
  const ocean=ctx.createRadialGradient(cx-Rd*0.25,cy-Rd*0.3,Rd*0.1,cx,cy,Rd);
  ocean.addColorStop(0,'#0b2616');ocean.addColorStop(0.6,'#072011');ocean.addColorStop(1,'#040d08');
  ctx.beginPath();path({type:'Sphere'});ctx.fillStyle=ocean;ctx.fill();
  if(graticule){ctx.beginPath();path(graticule);ctx.strokeStyle='rgba(65,255,126,.12)';ctx.lineWidth=.6;ctx.stroke();}
  ctx.beginPath();path(EQ);ctx.strokeStyle='rgba(125,247,255,.10)';ctx.lineWidth=.7;ctx.stroke();
  ctx.beginPath();path(PM);ctx.strokeStyle='rgba(125,247,255,.065)';ctx.lineWidth=.7;ctx.stroke();
  if(land){ctx.beginPath();path(land);ctx.fillStyle='rgba(48,232,122,.24)';ctx.fill();
    ctx.strokeStyle='rgba(65,255,126,.18)';ctx.lineWidth=2.6;ctx.stroke();
    ctx.shadowColor='#41ff7e';ctx.shadowBlur=11;ctx.strokeStyle='#7dffb0';ctx.lineWidth=1;ctx.stroke();ctx.shadowBlur=0;}
  if(borders){ctx.beginPath();path(borders);ctx.strokeStyle='rgba(125,255,176,.32)';ctx.lineWidth=.4;ctx.stroke();}
  if(admin1&&zoom>1.5){ctx.beginPath();path(admin1);ctx.strokeStyle='rgba(125,255,176,.24)';ctx.lineWidth=.35;ctx.stroke();}

  /* ---- radar sweep ---- */
  if(!REDUCE){const swl=(t*34)%360;
    for(let q=0;q<3;q++){try{const ring=d3.geoCircle().center([swl-q*7,0]).radius(90)();
      ctx.beginPath();path(ring);ctx.strokeStyle='rgba(125,247,255,'+(0.20/(q+1)).toFixed(3)+')';
      ctx.lineWidth=q?0.7:1.1;if(!q){ctx.shadowColor='#7df7ff';ctx.shadowBlur=8;}ctx.stroke();ctx.shadowBlur=0;}catch(e){}}}

  /* ---- day/night terminator + warm dusk ring ---- */
  if(LAYERS.term){
  const anti=[ss[0]+180,-ss[1]];
  try{
    const gc=d3.geoCircle().center(anti);
    [[97,0.20],[91,0.19],[86,0.17],[81,0.15]].forEach(band=>{
      ctx.beginPath();path(gc.radius(band[0])());ctx.fillStyle='rgba(1,6,4,'+band[1]+')';ctx.fill();});
    const dc=gc.radius(90)();
    ctx.beginPath();path(dc);ctx.strokeStyle='rgba(255,170,80,.085)';ctx.lineWidth=4.5;ctx.stroke();
    ctx.beginPath();path(dc);ctx.strokeStyle='rgba(255,214,130,.14)';ctx.lineWidth=1.3;ctx.stroke();
  }catch(e){}
  }
  /* ---- sun glint on the day side ---- */
  if(LAYERS.term&&vis(ss)){const sxy=proj(ss);
    const glint=ctx.createRadialGradient(sxy[0],sxy[1],0,sxy[0],sxy[1],Rd*0.55);
    glint.addColorStop(0,'rgba(215,255,230,0.18)');glint.addColorStop(0.35,'rgba(140,255,190,0.08)');glint.addColorStop(1,'rgba(140,255,190,0)');
    ctx.save();ctx.globalCompositeOperation='lighter';ctx.fillStyle=glint;ctx.fillRect(0,0,w,h);ctx.restore();}

  /* ---- CITY LIGHTS on the night side ---- */
  ctx.save();ctx.globalCompositeOperation='lighter';ctx.fillStyle='#ffe2a6';
  for(let i=0;i<L.n;i++){
    const p=p3(L.lonR[i],L.slat[i],L.clat[i],0);if(p[2]<=0.02)continue;
    const dk=darkAt(L.lonR[i],L.slat[i],L.clat[i]);if(dk<=0.04)continue;
    const tw=REDUCE?0.85:(0.72+0.28*Math.sin(t*1.7+L.ph[i]));
    const a=dk*tw*L.a[i]*(0.5+0.5*p[2]);if(a<=0.02)continue;
    const s=L.s[i]*(zoom>2?1.3:1);
    ctx.globalAlpha=Math.min(1,a);
    ctx.fillRect(p[0]-s/2,p[1]-s/2,s,s);}
  ctx.fillStyle='rgba(255,200,110,1)';
  for(const i of BIGS){
    const p=p3(L.lonR[i],L.slat[i],L.clat[i],0);if(p[2]<=0.05)continue;
    const dk=darkAt(L.lonR[i],L.slat[i],L.clat[i]);if(dk<=0.5)continue;
    ctx.globalAlpha=0.055*dk*(REDUCE?1:(0.8+0.2*Math.sin(t*1.3+L.ph[i])));
    ctx.beginPath();ctx.arc(p[0],p[1],4.5+L.s[i]*1.5,0,7);ctx.fill();}
  ctx.globalAlpha=1;ctx.restore();

  /* ---- aurora ovals ---- */
  if(LAYERS.aur){
  ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
  const AUR_C=['96,255,170','120,244,255','190,255,210'];
  [GEOMAG_N,GEOMAG_S].forEach(pole=>{
    for(let i=0;i<3;i++){
      const pts=auroraPts(pole[0],pole[1],16.5,i,REDUCE?0:t*0.7);
      ctx.lineWidth=1.25-i*0.3;
      for(let k=0;k<72;k+=4){
        const q0=p3(pts[k][0],pts[k][1],pts[k][2],0.012);
        const kk=k+4>72?72:k+4;
        const q1=p3(pts[kk][0],pts[kk][1],pts[kk][2],0.012);
        if(q0[2]<=0||q1[2]<=0)continue;
        const dk=darkAt(pts[k][0],pts[k][1],pts[k][2]);
        const a=(0.045+0.30*dk)*(0.65+0.35*Math.sin(k*0.6+t*(REDUCE?0:1.8)+i));
        if(a<=0.02)continue;
        ctx.strokeStyle='rgba('+AUR_C[i]+','+a.toFixed(3)+')';
        ctx.beginPath();ctx.moveTo(q0[0],q0[1]);ctx.lineTo(q1[0],q1[1]);ctx.stroke();}
    }});
  ctx.restore();
  }

  /* ---- LIVE SEISMIC (USGS) ---- */
  if(LAYERS.seis&&quakes.length){const nowMs=Date.now();
    ctx.font='8px ui-monospace,monospace';
    for(const q of quakes){const p=p3(q.lonR,q.slat,q.clat,0);if(p[2]<=0.01)continue;
      const fresh=Math.max(0.22,1-Math.max(0,nowMs-q.t)/86400000*0.85);
      const col=q.m>=6?'255,107,90':(q.m>=4.8?'255,176,74':'255,210,74');
      const pls=REDUCE?0.45:((t*0.5+q.ph)%1);
      const rr=(2.2+(q.m-2.5)*1.9)*(0.85+zoom*0.15);
      ctx.strokeStyle='rgba('+col+','+(0.55*(1-pls)*fresh).toFixed(3)+')';ctx.lineWidth=1;
      ctx.beginPath();ctx.arc(p[0],p[1],1.5+pls*rr,0,7);ctx.stroke();
      if(q.m>=4.8){const p2=(pls+0.45)%1;
        ctx.strokeStyle='rgba('+col+','+(0.4*(1-p2)*fresh).toFixed(3)+')';
        ctx.beginPath();ctx.arc(p[0],p[1],1.5+p2*rr,0,7);ctx.stroke();}
      ctx.fillStyle='rgba('+col+','+(0.85*fresh).toFixed(3)+')';
      ctx.beginPath();ctx.arc(p[0],p[1],0.8+q.m*0.22,0,7);ctx.fill();
      if(q.m>=5.5)ctx.fillText('M'+q.m.toFixed(1),p[0]+6,p[1]+3);
      if(q.m>=5){const hrs=Math.max(0,Math.round((nowMs-q.t)/3600000));
        hovers.push({x:p[0],y:p[1],key:'q'+q.t,kind:'quake',lines:[
          'SEISMIC EVENT · M'+q.m.toFixed(1),fmtLL(q.lon,q.lat),
          'T−'+hrs+'H · USGS LIVE',dayState(q.lon,q.lat)+' · '+zoneTime(q.lon)]});}}}

  /* ---- ambient events (flare / ping / sector sweep) ---- */
  drawEvents(ms);

  /* ---- surface ghost of the travel arcs ---- */
  if(LAYERS.arc)ARCS.forEach(a=>{ctx.beginPath();path({type:'LineString',coordinates:a});
    ctx.strokeStyle='rgba(125,255,176,.22)';ctx.lineWidth=1;ctx.stroke();});

  /* ---- ISS predicted ground track ---- */
  if(LAYERS.iss&&issPole){try{ctx.beginPath();path(d3.geoCircle().center(issPole).radius(90)());
    ctx.setLineDash([2,6]);ctx.strokeStyle='rgba(191,239,255,.26)';ctx.lineWidth=.8;ctx.stroke();ctx.setLineDash([]);}catch(e){}}

  /* ---- city markers ---- */
  Object.entries(DESTS).forEach(([k,p])=>{if(!vis(p))return;const xy=proj(p);
    const dark=d3.geoDistance(p,ss)>Math.PI/2;
    const pls=(t*0.9+xy[0]*0.03)%1;
    ctx.save();ctx.globalAlpha=0.3*(1-pls);ctx.strokeStyle=dark?'#ffe7a0':'#7dffb0';ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(xy[0],xy[1],(dark?3.3:2.8)+1.5+pls*7,0,7);ctx.stroke();ctx.restore();
    ctx.beginPath();ctx.arc(xy[0],xy[1],dark?3.3:2.8,0,7);
    ctx.fillStyle=dark?'#fff4cf':'#7dffb0';
    if(dark){ctx.shadowColor='#ffe7a0';ctx.shadowBlur=9;}ctx.fill();ctx.shadowBlur=0;
    ctx.fillStyle='rgba(125,255,176,.92)';ctx.font='10px ui-monospace,monospace';ctx.fillText(k,xy[0]+5,xy[1]-4);
    hovers.push({x:xy[0],y:xy[1],key:k,kind:'city',lines:[
      k+' STATION',fmtLL(p[0],p[1]),
      dayState(p[0],p[1])+' · '+zoneTime(p[0]),'Δ HOME '+kmFrom(HOME,p)+' KM']});});
  if(vis(HOME)){const xy=proj(HOME);const dark=d3.geoDistance(HOME,ss)>Math.PI/2;
    ctx.beginPath();ctx.arc(xy[0],xy[1],3.6,0,7);ctx.fillStyle='#ffd24a';
    ctx.shadowColor='#ffd24a';ctx.shadowBlur=dark?12:6;ctx.fill();ctx.shadowBlur=0;
    hovers.push({x:xy[0],y:xy[1],key:'HOME',kind:'home',lines:[
      'HOME BASE · RENTON WA',fmtLL(HOME[0],HOME[1]),
      dayState(HOME[0],HOME[1])+' · '+zoneTime(HOME[0]),'UPLINK NOMINAL']});}

  /* ---- zoomed-in city name labels ---- */
  if(zoom>=2){const thr=zoom>=3.1?3:4;const drawn=[];
    const la2=Math.min(1,(zoom-2)/0.35);
    ctx.font='9px ui-monospace,monospace';
    for(const c of LBL){if(c.w<thr)continue;
      const p=p3(c.lonR,c.slat,c.clat,0);if(p[2]<0.4)continue;
      if(p[0]<8||p[0]>w-8||p[1]<8||p[1]>h-8)continue;
      let clash=false;
      for(const d of drawn){if(Math.abs(d[0]-p[0])<56&&Math.abs(d[1]-p[1])<11){clash=true;break;}}
      if(clash)continue;drawn.push(p);if(drawn.length>10)break;
      ctx.fillStyle='rgba(125,255,176,'+(0.34*la2).toFixed(2)+')';ctx.fillRect(p[0]-1,p[1]-1,2,2);
      ctx.fillStyle='rgba(160,255,200,'+(0.66*la2).toFixed(2)+')';ctx.fillText(c.name.toUpperCase(),p[0]+5,p[1]+3);}}

  /* ---- target lock marker (scale-in on set) ---- */
  if(tgt){const p=p3(tgt.lon*rad,tgt.slat,tgt.clat,0);
    if(p[2]>0){const ein=easeO(Math.min(1,(now()-tgt.t0)/320));
      const spin=REDUCE?0.6:t*1.4;
      ctx.save();ctx.globalAlpha=ein;ctx.translate(p[0],p[1]);ctx.rotate(spin);
      const sc=1+1.6*(1-ein);ctx.scale(sc,sc);
      ctx.strokeStyle='#ffd24a';ctx.lineWidth=1.2;ctx.shadowColor='#ffd24a';ctx.shadowBlur=8;
      ctx.strokeRect(-5,-5,10,10);ctx.shadowBlur=0;ctx.restore();
      ctx.save();ctx.globalAlpha=ein;
      ctx.fillStyle='#fff1c4';ctx.beginPath();ctx.arc(p[0],p[1],1.8,0,7);ctx.fill();
      const pls=REDUCE?0.4:(t*0.8)%1;
      ctx.globalAlpha=0.5*(1-pls)*ein;ctx.strokeStyle='#ffd24a';ctx.lineWidth=1;
      ctx.beginPath();ctx.arc(p[0],p[1],6+pls*15,0,7);ctx.stroke();ctx.restore();}}

  /* ---- home-station uplink beam ---- */
  if(vis(HOME)){const hxy=proj(HOME);
    ctx.save();ctx.globalCompositeOperation='lighter';
    const bh=Rd*0.5;const bgr=ctx.createLinearGradient(hxy[0],hxy[1],hxy[0],hxy[1]-bh);
    bgr.addColorStop(0,'rgba(255,210,74,0.45)');bgr.addColorStop(1,'rgba(255,210,74,0)');
    ctx.fillStyle=bgr;ctx.fillRect(hxy[0]-1,hxy[1]-bh,2,bh);
    const rp=REDUCE?0.4:(t*0.7)%1;ctx.globalAlpha=0.5*(1-rp);ctx.strokeStyle='#ffd24a';ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(hxy[0],hxy[1],3+rp*13,0,7);ctx.stroke();ctx.restore();}

  /* ---- specular sheen + limb shading + breathing Fresnel rim ---- */
  const spec=ctx.createRadialGradient(cx-Rd*0.4,cy-Rd*0.44,Rd*0.04,cx-Rd*0.18,cy-Rd*0.2,Rd*1.05);
  spec.addColorStop(0,'rgba(220,255,232,0.22)');spec.addColorStop(0.32,'rgba(120,255,176,0.06)');spec.addColorStop(1,'rgba(0,0,0,0)');
  ctx.save();ctx.globalCompositeOperation='lighter';ctx.fillStyle=spec;ctx.beginPath();ctx.arc(cx,cy,Rd,0,7);ctx.fill();ctx.restore();
  const limb=ctx.createRadialGradient(cx,cy,Rd*0.55,cx,cy,Rd);
  limb.addColorStop(0,'rgba(0,0,0,0)');limb.addColorStop(1,'rgba(0,0,0,0.4)');
  ctx.fillStyle=limb;ctx.beginPath();ctx.arc(cx,cy,Rd,0,7);ctx.fill();
  const br2=0.5+0.5*Math.sin(t*0.45);
  const fres=ctx.createRadialGradient(cx,cy,Rd*0.82,cx,cy,Rd);
  fres.addColorStop(0,'rgba(65,255,126,0)');
  fres.addColorStop(0.85,'rgba(80,255,150,'+(0.05+0.05*br2).toFixed(3)+')');
  fres.addColorStop(1,'rgba(140,255,190,'+(0.12+0.09*br2).toFixed(3)+')');
  ctx.save();ctx.globalCompositeOperation='lighter';ctx.fillStyle=fres;
  ctx.beginPath();ctx.arc(cx,cy,Rd,0,7);ctx.fill();ctx.restore();
  ctx.restore();
  /* =============== end sphere =============== */

  /* ---- crisp glowing rim + cyan fringe ---- */
  if(Rd<Math.min(w,h)/2+4){
    ctx.beginPath();ctx.arc(cx,cy,Rd,0,7);ctx.shadowColor='#41ff7e';ctx.shadowBlur=18;
    ctx.strokeStyle='rgba(165,255,205,'+(0.85+0.1*br2).toFixed(2)+')';ctx.lineWidth=1.6;ctx.stroke();ctx.shadowBlur=0;
    ctx.save();ctx.globalCompositeOperation='lighter';
    ctx.beginPath();ctx.arc(cx,cy,Rd+2.5,0,7);ctx.strokeStyle='rgba(125,247,255,.26)';ctx.lineWidth=1;ctx.stroke();ctx.restore();
  }

  /* ---- elevated travel arcs + comet packets + launch pulses ---- */
  if(LAYERS.arc){
  const ARCD=draw.ARCD||(draw.ARCD=ARCS.map(a=>({li:d3.geoInterpolate(a[0],a[1]),h:0.05+0.11*(d3.geoDistance(a[0],a[1])/Math.PI)})));
  function arcPt(A,f){const p=A.li(f),la=p[1]*rad;
    return p3(p[0]*rad,Math.sin(la),Math.cos(la),Math.sin(Math.PI*f)*A.h);}
  ctx.save();ctx.globalCompositeOperation='lighter';
  ARCD.forEach(A=>{let prev=null;
    for(let i=0;i<=56;i++){const f=i/56,q=arcPt(A,f);
      if(prev&&q[2]>0&&prev[2]>0){
        const al=(0.14+0.55*Math.sin(Math.PI*f))*(0.3+0.7*Math.min(1,(q[2]+prev[2])/1.1));
        ctx.strokeStyle='rgba(125,255,176,'+al.toFixed(3)+')';ctx.lineWidth=1.1;
        ctx.beginPath();ctx.moveTo(prev[0],prev[1]);ctx.lineTo(q[0],q[1]);ctx.stroke();}
      prev=q;}});
  if(!REDUCE){
    ARCD.forEach((A,ai)=>{for(let k=0;k<2;k++){const frac=((t*0.16)+ai*0.37+k*0.5)%1;
      for(let tr=4;tr>=0;tr--){const f2=frac-tr*0.014;if(f2<0)continue;
        const q=arcPt(A,f2);if(q[2]<=0)continue;
        const pulse=Math.sin(f2*Math.PI),fade=pulse*(tr?0.30/tr:1);
        ctx.fillStyle='rgba(190,255,225,'+(0.85*fade).toFixed(3)+')';
        ctx.shadowColor='#7df7ff';ctx.shadowBlur=tr?0:9;
        ctx.beginPath();ctx.arc(q[0],q[1],(1.6+1.2*pulse)*(tr?0.65:1),0,7);ctx.fill();}
      if(frac<0.16){const q0=arcPt(A,0);                     // launch pulse at origin
        if(q0[2]>0){const lu=frac/0.16;
          ctx.strokeStyle='rgba(190,255,225,'+(0.5*(1-lu)).toFixed(3)+')';ctx.lineWidth=1;
          ctx.beginPath();ctx.arc(q0[0],q0[1],2+lu*13,0,7);ctx.stroke();}}
      if(frac>0.86){const q1=arcPt(A,1);                     // arrival glow at destination
        if(q1[2]>0){const au2=(frac-0.86)/0.14;
          ctx.fillStyle='rgba(190,255,225,'+(0.4*Math.sin(Math.PI*au2)).toFixed(3)+')';
          ctx.beginPath();ctx.arc(q1[0],q1[1],2.4+au2*3,0,7);ctx.fill();}}}});
    ctx.shadowBlur=0;}
  ctx.restore();
  }

  /* ---- satellites riding the front of their orbits ---- */
  if(satsOn){drawTracks(true);
    ctx.save();ctx.globalCompositeOperation='lighter';
    ORBITS.forEach((O,oi)=>{
      for(let k=0;k<O.sats;k++){
        const s0=satArg(O,k,t);
        const dir=O.w>=0?1:-1;
        for(let j=7;j>=1;j--){const p=orbPt(O,s0-j*0.06*dir,O.alt);
          if(p[2]<=0)continue;
          ctx.fillStyle='rgba(125,247,255,'+(0.05+0.16*(1-j/8)).toFixed(3)+')';
          ctx.fillRect(p[0]-0.7,p[1]-0.7,1.4,1.4);}
        const ll=orbLL(O,s0),p=pt3(ll[0],ll[1],O.alt);
        const rr=Math.hypot(p[0]-cx,p[1]-cy);
        if(p[2]<=0&&rr<Rd+1)continue;
        const bh2=p[2]>0?1:0.35;
        const isF=follow&&follow.type==='sat'&&follow.o===oi&&follow.k===k;
        ctx.fillStyle='rgba(210,250,255,'+(0.9*bh2).toFixed(2)+')';
        ctx.shadowColor='#7df7ff';ctx.shadowBlur=p[2]>0?(isF?14:9):0;
        ctx.save();ctx.translate(p[0],p[1]);ctx.rotate(0.785);
        const sz=isF?2.3:1.7;ctx.fillRect(-sz,-sz,sz*2,sz*2);ctx.restore();ctx.shadowBlur=0;
        if(isF){ctx.strokeStyle='rgba(125,247,255,0.7)';ctx.lineWidth=1;
          ctx.beginPath();ctx.arc(p[0],p[1],7+2*Math.sin(t*3),0,7);ctx.stroke();}
        if(k===0&&zoom<2&&!isF){ctx.fillStyle='rgba(125,247,255,'+(0.55*bh2).toFixed(2)+')';
          ctx.font='8px ui-monospace,monospace';ctx.fillText(O.name,p[0]+6,p[1]+3);}
        if(p[2]>0)hovers.push({x:p[0],y:p[1],key:O.name+k,kind:'sat',
          follow:{type:'sat',o:oi,k:k},lines:[
          O.name+'-0'+(k+1)+' · RELAY',
          'INC '+(O.inc*R2D).toFixed(1)+'° · ALT '+Math.round(O.alt*6371)+' KM',
          fmtLL(ll[0],ll[1]),'CLICK = CAMERA LOCK']});}});
    ctx.restore();}

  /* ---- ISS: smooth marker at altitude + riser ---- */
  const ip=LAYERS.iss?issPos():null;
  if(ip){const la=ip[1]*rad,sl=Math.sin(la),cl=Math.cos(la),lr=ip[0]*rad;
    const g0=p3(lr,sl,cl,0),g1=p3(lr,sl,cl,0.055);
    if(g1[2]>0){
      ctx.strokeStyle='rgba(191,239,255,.3)';ctx.lineWidth=.8;
      ctx.beginPath();ctx.moveTo(g0[0],g0[1]);ctx.lineTo(g1[0],g1[1]);ctx.stroke();
      const isF=follow&&follow.type==='iss';
      ctx.beginPath();ctx.arc(g1[0],g1[1],isF?3.2:2.6,0,7);ctx.fillStyle='#bfefff';
      ctx.shadowColor='#bfefff';ctx.shadowBlur=isF?14:9;ctx.fill();ctx.shadowBlur=0;
      ctx.strokeStyle='rgba(191,239,255,.5)';ctx.lineWidth=.7;
      ctx.beginPath();ctx.arc(g1[0],g1[1],5.5,0,7);ctx.stroke();
      if(isF){ctx.strokeStyle='rgba(191,239,255,0.7)';ctx.lineWidth=1;
        ctx.beginPath();ctx.arc(g1[0],g1[1],8+2*Math.sin(t*3),0,7);ctx.stroke();}
      ctx.fillStyle='#bfefff';ctx.font='9px ui-monospace,monospace';ctx.fillText('ISS',g1[0]+7,g1[1]+3);
      hovers.push({x:g1[0],y:g1[1],key:'ISS',kind:'iss',follow:{type:'iss'},lines:[
        'ISS · INTL SPACE STATION',fmtLL(ip[0],ip[1]),
        // real telemetry from the live fetch (falls back to nominal until first fix)
        'ALT '+(issInfo?Math.round(issInfo.alt):408)+' KM · VEL '+(issInfo?(issInfo.vel/3600).toFixed(2):'7.66')+' KM/S'
          +(issInfo&&issInfo.vis?(issInfo.vis==='daylight'?' · SUNLIT':' · SHADOW'):''),
        'CLICK = CAMERA LOCK']});}}

  /* ---- target: amber uplink arc + data callout ---- */
  if(tgt){
    ctx.save();ctx.globalCompositeOperation='lighter';
    let prev=null;
    for(let i=0;i<=48;i++){const f=i/48,p=tgt.li(f),la=p[1]*rad;
      const q=p3(p[0]*rad,Math.sin(la),Math.cos(la),Math.sin(Math.PI*f)*tgt.h);
      if(prev&&q[2]>0&&prev[2]>0){
        const al=(0.16+0.55*Math.sin(Math.PI*f))*(0.3+0.7*Math.min(1,(q[2]+prev[2])/1.1));
        ctx.strokeStyle='rgba(255,210,74,'+al.toFixed(3)+')';ctx.lineWidth=1.2;
        ctx.beginPath();ctx.moveTo(prev[0],prev[1]);ctx.lineTo(q[0],q[1]);ctx.stroke();}
      prev=q;}
    if(!REDUCE){const frac=(t*0.22)%1,p=tgt.li(frac),la=p[1]*rad;
      const q=p3(p[0]*rad,Math.sin(la),Math.cos(la),Math.sin(Math.PI*frac)*tgt.h);
      if(q[2]>0){ctx.fillStyle='rgba(255,240,190,0.9)';ctx.shadowColor='#ffd24a';ctx.shadowBlur=9;
        ctx.beginPath();ctx.arc(q[0],q[1],1.8,0,7);ctx.fill();ctx.shadowBlur=0;}}
    ctx.restore();
    if(!tgt.name&&landFeats)tgt.name=countryAt(tgt.lon,tgt.lat)||continentAt(tgt.lon,tgt.lat)||'OPEN OCEAN';
    const p=p3(tgt.lon*rad,tgt.slat,tgt.clat,0);
    if(p[2]>0)hudBox(p[0]+16,p[1]-10,[
      '[ TARGET LOCK ]',
      fmtLL(tgt.lon,tgt.lat)+' · '+(tgt.name||'…'),
      'Δ HOME '+kmFrom(HOME,[tgt.lon,tgt.lat])+' KM',
      dayState(tgt.lon,tgt.lat)+' · '+zoneTime(tgt.lon)+' · 2×CLICK CLEAR'],
      '#ffd24a',{age:now()-tgt.t0,typed:true,spark:true});}

  /* ---- sun-limb flare ---- */
  {const sp=pt3(ss[0],ss[1],0),zc=sp[2];
    if(zc<0.14){const dx=sp[0]-cx,dy=sp[1]-cy,Lh=Math.hypot(dx,dy)||1;
      const g=Math.exp(-(zc*zc)/(2*0.055*0.055));
      if(g>0.03){const fx=cx+dx/Lh*Rd,fy=cy+dy/Lh*Rd;
        ctx.save();ctx.globalCompositeOperation='lighter';
        const core=ctx.createRadialGradient(fx,fy,0,fx,fy,Rd*(0.16+0.24*g));
        core.addColorStop(0,'rgba(255,250,235,'+(0.55*g).toFixed(3)+')');
        core.addColorStop(0.3,'rgba(255,225,150,'+(0.28*g).toFixed(3)+')');
        core.addColorStop(1,'rgba(255,200,110,0)');
        ctx.fillStyle=core;ctx.beginPath();ctx.arc(fx,fy,Rd*(0.16+0.24*g),0,7);ctx.fill();
        const sw2=Rd*1.35*g;
        const streak=ctx.createLinearGradient(fx-sw2,fy,fx+sw2,fy);
        streak.addColorStop(0,'rgba(255,235,180,0)');streak.addColorStop(0.5,'rgba(255,245,215,'+(0.5*g).toFixed(3)+')');streak.addColorStop(1,'rgba(255,235,180,0)');
        ctx.fillStyle=streak;ctx.fillRect(fx-sw2,fy-0.8,sw2*2,1.6);
        ctx.fillRect(fx-sw2*0.55,fy-2.6,sw2*1.1,5.2);
        const ang=Math.atan2(fy-cy,fx-cx);
        ctx.strokeStyle='rgba(255,235,170,'+(0.55*g).toFixed(3)+')';ctx.lineWidth=1.6;
        ctx.beginPath();ctx.arc(cx,cy,Rd,ang-0.55,ang+0.55);ctx.stroke();
        ctx.restore();}}}

  /* ---- hover: marker reticle w/ typed readout, else geo recon HUD ---- */
  let hk=null,hitm=null;
  if(hov&&!drag){let bd=196;
    for(const m of hovers){const dx=hov.x-m.x,dy=hov.y-m.y,d2=dx*dx+dy*dy;
      if(d2<bd){bd=d2;hk=m.key;hitm=m;}}}
  if(hk!==hovKey){hovKey=hk;hovKeyT0=now();}
  if(hitm){
    markerReticle(hitm.x,hitm.y,now()-hovKeyT0);
    hudBox(hitm.x+18,hitm.y+14,hitm.lines,'rgba(125,247,255,0.95)',{age:now()-hovKeyT0,typed:true});
  }else if(hovIn&&curProj){
    const ll=llAt(hov.x,hov.y);
    if(ll){reticle(hov.x,hov.y);
      const place=ctyName||continentAt(ll[0],ll[1])||'OPEN OCEAN';
      hudBox(hov.x+18,hov.y+16,[
        fmtLL(ll[0],ll[1]),
        place,
        dayState(ll[0],ll[1])+' · '+zoneTime(ll[0]),
        'Δ HOME '+kmFrom(HOME,ll)+' KM · CLICK = LOCK'],'rgba(125,247,255,0.95)',{age:now()-hovGeoT0});}}
  const wantCur=drag?'grabbing':(hitm?(hitm.follow?'pointer':'crosshair'):'grab');
  if(wantCur!==curCursor){curCursor=wantCur;cv.style.cursor=wantCur;}

  /* ---- tracking chip ---- */
  if(follow){
    const nm=follow.type==='iss'?'ISS':ORBITS[follow.o].name+'-0'+(follow.k+1);
    const s='● TRACKING '+nm+' — CLICK SPACE TO RELEASE';
    ctx.font='9px ui-monospace,monospace';const tw2=ctx.measureText(s).width;
    const bx=cx-tw2/2-8,by=8,bw2=tw2+16,bh3=16;
    ctx.fillStyle='rgba(2,11,6,0.72)';ctx.fillRect(bx,by,bw2,bh3);
    ctx.strokeStyle='rgba(125,247,255,0.35)';ctx.lineWidth=1;ctx.strokeRect(bx+0.5,by+0.5,bw2-1,bh3-1);
    ctx.fillStyle='rgba(125,247,255,'+(0.55+0.45*Math.sin(t*3)).toFixed(2)+')';
    ctx.fillText(s,bx+8,by+11.5);}

  hoverables=hovers;
  ctx.restore();

  /* ---- rare CRT horizontal sync tear (device-pixel self-copy) ---- */
  if(!REDUCE&&!COARSE){
    if(!tear&&ms>tearNext)tear={y:0.12+Math.random()*0.72,t0:ms,dur:150+Math.random()*130};
    if(tear){const u=(ms-tear.t0)/tear.dur;
      if(u>=1){tear=null;tearNext=ms+16000+Math.random()*18000;}
      else{const ys=Math.floor(cv.height*tear.y),hs=Math.max(2,Math.floor(cv.height*0.014));
        const off=Math.round(Math.sin(u*Math.PI)*6*DPR);
        if(off){try{ctx.drawImage(cv,0,ys,cv.width,hs,off,ys,cv.width,hs);}catch(e){}}
        ctx.save();ctx.globalAlpha=0.045*Math.sin(u*Math.PI);ctx.fillStyle='#9dffc8';
        ctx.fillRect(0,ys,cv.width,hs);ctx.restore();}}}

  /* ---- DOM readouts ---- */
  const cName=zoom>1.45?continentAt(-rot[0],-rot[1]):null;
  const cl=document.getElementById('continent');
  if(cl){if(cName){cl.textContent=cName;cl.style.opacity=Math.min(1,(zoom-1.45)/0.5).toFixed(2);}else cl.style.opacity=0;}
  const zr=document.getElementById('zoomr');if(zr)zr.textContent='ZOOM '+zoom.toFixed(1)+'×';
}

/* ---------- public API for the Globe Deck (js/deck.js) ---------- */
window.CC_GLOBE={
  layers:LAYERS,
  saveLayers(){try{localStorage.setItem('cc_globe_layers',JSON.stringify(LAYERS));}catch(e){}},
  flyTo(lon,lat,z,dur){flyTo(lon,lat,z||Math.max(zoom,1.7),dur||1300);lastTouch=now();},
  setTarget:setTarget,clearTarget:clearTarget,pullBack:pullBack,
  followISS(on){follow=on?{type:'iss'}:null;cam=null;lastTouch=now();},
  isFollowingISS(){return !!(follow&&follow.type==='iss');},
  state(){const ip=issPos();
    return {iss:ip?[ip[0],ip[1]]:null,issInfo:issInfo,issPole:issPole?issPole.slice():null,
      quakes:quakes,sun:[SUN.lon,SUN.lat],zoom:zoom,home:HOME.slice(),pty:DESTS.PTY.slice()};},
  dayState:dayState,
  distKm(a,b){try{return d3.geoDistance(a,b)*6371;}catch(e){return NaN;}},
  bump(){lastTouch=now();}
};
draw();
})();
