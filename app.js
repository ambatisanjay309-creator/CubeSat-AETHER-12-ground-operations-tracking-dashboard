(function(){
  "use strict";

  /* ---------- starfield ---------- */
  (function(){
    const c = document.getElementById('starfield'); const ctx = c.getContext('2d');
    function resize(){ c.width = window.innerWidth; c.height = window.innerHeight; }
    resize(); window.addEventListener('resize', resize);
    const stars = []; const N = 140;
    for(let i=0;i<N;i++){ stars.push({x:Math.random()*c.width,y:Math.random()*c.height,r:Math.random()*1.3+0.2,
      base:Math.random()*0.5+0.15, spd:Math.random()*0.02+0.005, ph:Math.random()*Math.PI*2}); }
    function draw(t){
      ctx.clearRect(0,0,c.width,c.height);
      const g = ctx.createRadialGradient(c.width*0.15,-100,50, c.width*0.15,-100, c.width*0.9);
      g.addColorStop(0,'rgba(30,45,80,0.3)'); g.addColorStop(1,'rgba(3,5,10,0)');
      ctx.fillStyle = g; ctx.fillRect(0,0,c.width,c.height);
      stars.forEach(s=>{ const a = s.base + Math.sin(t*s.spd+s.ph)*0.25; ctx.fillStyle = `rgba(220,230,255,${Math.max(0,a)})`;
        ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill(); });
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  })();

  /* =========================================================
     PHYSICS CONSTANTS
     ========================================================= */
  const MU=398600.4418, RE=6371, ALT=500, R_SAT=RE+ALT, C_LIGHT=299792.458;
  const V_ORB=Math.sqrt(MU/R_SAT), OMEGA=V_ORB/R_SAT, PERIOD_S=2*Math.PI/OMEGA;
  const F0_MHZ=437.500, TX_PWR_DBM=30, TX_GAIN_DBI=2, EIRP_DBM=TX_PWR_DBM+TX_GAIN_DBI;
  const RX_GAIN_DBI=18, OTHER_LOSS_DB=2, RX_SENS_DBM=-110;
  const PASS_HALF_WINDOW=600, TIME_SCALE_BASE=3, CYCLE_S=PASS_HALF_WINDOW*2+240;
  const AOS_T = Math.acos(RE/R_SAT) / OMEGA;
  const AOS_WITHIN = PASS_HALF_WINDOW - AOS_T;
  const LOS_WITHIN = PASS_HALF_WINDOW + AOS_T;

  const INCL_RAD = 97.4 * Math.PI/180;
  const OMEGA_EARTH = 7.2921159e-5;
  const GS_LAT = 35.7796, GS_LON = -78.6382;
  const COV_ANGLE_RAD = Math.acos(RE/R_SAT);
  const ASC_NODE_LON0 = -55;

  const RATE_Z_PER_S = 183 / (365.25*86400);
  const RATE_AL_PER_S = 27269 / (365.25*86400);

  // low-poly continent outlines [lon, lat] — stylized reference, higher resolution than a simple blob
  const CONTINENTS = [
    // North America
    [[-165,65],[-155,70],[-140,70],[-125,74],[-110,73],[-95,68],[-85,62],[-80,52],[-70,47],[-60,46],
     [-65,43],[-75,35],[-80,25],[-82,25],[-90,16],[-97,16],[-105,20],[-112,23],[-115,28],[-117,32],
     [-122,37],[-124,42],[-124,49],[-130,55],[-140,60],[-155,60],[-165,65]],
    // Greenland
    [[-45,60],[-30,65],[-25,72],[-35,78],[-50,77],[-55,70],[-52,63],[-45,60]],
    // South America
    [[-77,8],[-70,10],[-60,8],[-50,0],[-35,-5],[-38,-13],[-40,-20],[-42,-23],[-48,-27],[-58,-35],
     [-68,-45],[-72,-52],[-70,-40],[-72,-25],[-70,-15],[-75,-5],[-79,2],[-77,8]],
    // Europe
    [[-9,38],[-9,43],[-2,43],[3,42],[7,44],[10,45],[13,45],[13,54],[8,55],[10,57],[5,58],
     [12,58],[24,60],[30,60],[38,55],[40,48],[34,45],[28,42],[23,40],[19,40],[15,38],
     [12,42],[7,38],[-2,37],[-9,38]],
    // Asia
    [[30,45],[38,48],[48,50],[55,52],[60,55],[70,58],[80,62],[95,65],[110,60],[125,54],
     [135,48],[140,40],[130,32],[122,30],[120,22],[110,18],[105,10],[95,5],[85,10],
     [78,8],[68,10],[62,18],[55,25],[48,30],[40,35],[30,37],[26,40],[30,45]],
    // Africa
    [[-16,15],[-16,22],[-10,28],[-5,32],[10,37],[20,33],[32,32],[35,28],[38,15],[44,12],
     [51,12],[51,2],[42,-3],[40,-12],[35,-20],[33,-26],[28,-33],[20,-34],[15,-28],
     [12,-18],[13,-5],[9,4],[3,6],[-8,5],[-16,15]],
    // Madagascar
    [[43,-12],[47,-16],[47,-22],[45,-25],[43,-22],[43,-16],[43,-12]],
    // Australia
    [[113,-22],[122,-18],[130,-12],[137,-12],[142,-11],[145,-16],[148,-20],[153,-26],[150,-33],
     [143,-38],[137,-35],[132,-32],[128,-32],[122,-34],[115,-33],[113,-26],[113,-22]],
    // Indonesia / Maritime SE Asia (stylized cluster)
    [[95,5],[100,3],[104,1],[110,0],[116,4],[119,1],[117,-3],[113,-8],[108,-7],[103,-5],[98,2],[95,5]]
  ];

  function computeState(tRel){
    const wt=OMEGA*tRel, cosg=Math.cos(wt);
    const rho=Math.sqrt(RE*RE+R_SAT*R_SAT-2*RE*R_SAT*cosg);
    const sinE=(R_SAT*cosg-RE)/rho;
    const elevDeg=Math.asin(Math.max(-1,Math.min(1,sinE)))*180/Math.PI;
    const drhodt=(RE*R_SAT*OMEGA*Math.sin(wt))/rho;
    const dopplerHz=-F0_MHZ*1e6*(drhodt/C_LIGHT);
    const fsplDb=20*Math.log10(rho)+20*Math.log10(F0_MHZ)+32.44;
    const rxPowerDbm=EIRP_DBM+RX_GAIN_DBI-fsplDb-OTHER_LOSS_DB;
    const linkMarginDb=rxPowerDbm-RX_SENS_DBM;
    return {rho, elevDeg, drhodt, dopplerHz, fsplDb, rxPowerDbm, linkMarginDb, visible: elevDeg>0};
  }

  function subSatellitePoint(t){
    const theta = OMEGA * t;
    const latRad = Math.asin(Math.sin(INCL_RAD)*Math.sin(theta));
    const dLonOrbit = Math.atan2(Math.cos(INCL_RAD)*Math.sin(theta), Math.cos(theta));
    const earthRotRad = OMEGA_EARTH * t;
    let lonRad = (ASC_NODE_LON0*Math.PI/180) + dLonOrbit - earthRotRad;
    let lonDeg = lonRad*180/Math.PI;
    lonDeg = ((lonDeg+180)%360+360)%360-180;
    return {lat: latRad*180/Math.PI, lon: lonDeg};
  }

  function destinationPoint(lat0Deg, lon0Deg, angRad, bearingRad){
    const lat0=lat0Deg*Math.PI/180, lon0=lon0Deg*Math.PI/180;
    const lat = Math.asin(Math.sin(lat0)*Math.cos(angRad)+Math.cos(lat0)*Math.sin(angRad)*Math.cos(bearingRad));
    const lon = lon0 + Math.atan2(Math.sin(bearingRad)*Math.sin(angRad)*Math.cos(lat0), Math.cos(angRad)-Math.sin(lat0)*Math.sin(lat));
    return {lat: lat*180/Math.PI, lon: (((lon*180/Math.PI)+180)%360+360)%360-180};
  }

  function inSAA(lat, lon){ return lat > -55 && lat < 5 && lon > -90 && lon < 10; }

  /* =========================================================
     PLAYBACK STATE
     ========================================================= */
  let simSeconds = 0, running = true, speedMult = 4, isDragging = false, currentCycleIdx = 0;

  const el = id => document.getElementById(id);
  const playBtn = el('playBtn'), scrubSlider = el('scrubSlider'), scrubTimeLbl = el('scrubTimeLbl');
  scrubSlider.max = CYCLE_S;

  function fmtMMSS(totalSec){
    totalSec = Math.max(0, Math.round(totalSec));
    const m = Math.floor(totalSec/60), s = totalSec%60;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  function fmtMET(totalSimSeconds){
    const s=Math.floor(totalSimSeconds)%60, m=Math.floor(totalSimSeconds/60)%60, hh=Math.floor(totalSimSeconds/3600);
    return `T+${String(hh).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  playBtn.addEventListener('click', function(){
    running = !running; playBtn.innerHTML = running ? '&#10074;&#10074;' : '&#9654;';
  });
  document.querySelectorAll('.speed-btn').forEach(btn=>{
    btn.addEventListener('click', function(){
      document.querySelectorAll('.speed-btn').forEach(b=>b.classList.remove('active'));
      this.classList.add('active'); speedMult = Number(this.dataset.speed);
    });
  });
  scrubSlider.addEventListener('pointerdown', ()=>{ isDragging=true; });
  window.addEventListener('pointerup', ()=>{ isDragging=false; });
  scrubSlider.addEventListener('input', function(){
    running = false; playBtn.innerHTML = '&#9654;';
    simSeconds = currentCycleIdx*CYCLE_S + Number(this.value);
  });
  function jumpTo(offset){
    running = false; playBtn.innerHTML = '&#9654;';
    simSeconds = currentCycleIdx*CYCLE_S + offset; scrubSlider.value = offset;
  }
  el('jumpAOS').addEventListener('click', ()=>jumpTo(AOS_WITHIN));
  el('jumpTCA').addEventListener('click', ()=>jumpTo(PASS_HALF_WINDOW));
  el('jumpLOS').addEventListener('click', ()=>jumpTo(LOS_WITHIN));

  /* =========================================================
     DOM REFS
     ========================================================= */
  const metMET=el('metMET'), hOrbit=el('hOrbit');
  const storyLine=el('storyLine'), hDist=el('hDist'), hElev=el('hElev');
  const sigLabel=el('sigLabel'), sigFill=el('sigFill'), sigSub=el('sigSub'), signalSection=el('signalSection');
  const arrowBadge=el('arrowBadge'), dopplerNum=el('dopplerNum'), dopplerSub=el('dopplerSub');
  const aiRing=el('aiRing'), aiPct=el('aiPct'), aiLabel=el('aiLabel');
  const barNom=el('barNom'), barMulti=el('barMulti'), barInterf=el('barInterf');
  const pctNom=el('pctNom'), pctMulti=el('pctMulti'), pctInterf=el('pctInterf');
  const faultBtn=el('faultBtn');
  const envDoseZ=el('envDoseZ'), envDoseAl=el('envDoseAl'), saaBanner=el('saaBanner'), envSection=el('envSection');

  let flareActive = false;
  faultBtn.addEventListener('click', function(){
    flareActive=!flareActive;
    faultBtn.classList.toggle('active', flareActive);
    faultBtn.innerHTML = flareActive ? '<span class="dot"></span> Clear Anomaly' : '<span class="dot"></span> Simulate Solar Flare';
    signalSection.classList.toggle('alerting', flareActive);
  });

  function wireToggle(btnId, panelId, openLabel, closeLabel){
    const btn=el(btnId), panel=el(panelId);
    btn.addEventListener('click', function(){
      const isOpen = panel.classList.toggle('open');
      btn.innerHTML = (isOpen? '&#9662; ':'&#9656; ') + (isOpen? closeLabel : openLabel);
    });
  }
  wireToggle('toggleData','dataCollapse','Show live data feed','Hide live data feed');
  wireToggle('toggleLearn','learnCollapse','How this all works','Hide details');

  /* =========================================================
     SKY PLOT
     ========================================================= */
  const sky=el('skyplot'), skyCtx=sky.getContext('2d'); const skyTrail=[];
  function drawSky(elevDeg, azimuthDeg, visible){
    const w=sky.width,h=sky.height,cx=w/2,cy=h/2,R=w/2-8;
    skyCtx.clearRect(0,0,w,h);
    skyCtx.strokeStyle='#1c2740'; skyCtx.lineWidth=1;
    [0.33,0.66,1].forEach(f=>{ skyCtx.beginPath(); skyCtx.arc(cx,cy,R*f,0,Math.PI*2); skyCtx.stroke(); });
    skyCtx.beginPath(); skyCtx.moveTo(cx-R,cy); skyCtx.lineTo(cx+R,cy); skyCtx.stroke();
    skyCtx.beginPath(); skyCtx.moveTo(cx,cy-R); skyCtx.lineTo(cx,cy+R); skyCtx.stroke();

    // elevation ring labels (60deg, 30deg rings; outer ring is the horizon)
    skyCtx.font='8px monospace'; skyCtx.fillStyle='#57648a';
    skyCtx.fillText('60\u00B0', cx+4, cy-R*0.66+3);
    skyCtx.fillText('30\u00B0', cx+4, cy-R*0.33+3);
    skyCtx.fillStyle='#93a3c4'; skyCtx.fillText('Horizon', cx+R*0.72, cy-R*0.72);
    skyCtx.fillStyle='#eef2fc'; skyCtx.fillText('Zenith', cx+5, cy-4);

    // compass labels
    skyCtx.font='9px monospace'; skyCtx.fillStyle='#93a3c4'; skyCtx.textAlign='center';
    skyCtx.fillText('N', cx, cy-R-3); skyCtx.fillText('S', cx, cy+R+10);
    skyCtx.fillText('E', cx+R+8, cy+3); skyCtx.fillText('W', cx-R-8, cy+3);
    skyCtx.textAlign='left';

    if(visible){
      const radialDist=R*(1-elevDeg/90), theta=(azimuthDeg-90)*Math.PI/180;
      const px=cx+radialDist*Math.cos(theta), py=cy+radialDist*Math.sin(theta);
      skyTrail.push([px,py]); if(skyTrail.length>150) skyTrail.shift();
      skyCtx.strokeStyle='#ff7a1a55'; skyCtx.lineWidth=2; skyCtx.beginPath();
      skyTrail.forEach((p,i)=>{ i===0?skyCtx.moveTo(p[0],p[1]):skyCtx.lineTo(p[0],p[1]); }); skyCtx.stroke();
      skyCtx.fillStyle='#3d8bfd'; skyCtx.shadowColor='#3d8bfd'; skyCtx.shadowBlur=12;
      skyCtx.beginPath(); skyCtx.arc(px,py,5,0,Math.PI*2); skyCtx.fill(); skyCtx.shadowBlur=0;
    } else { if(skyTrail.length) skyTrail.length=0; }
    skyCtx.fillStyle='#e9eefc'; skyCtx.beginPath(); skyCtx.arc(cx,cy,3,0,Math.PI*2); skyCtx.fill();
  }

  /* =========================================================
     3D GLOBE — photorealistic texture with vector fallback
     ========================================================= */
  const globeCanvas=el('globeCanvas'), globeCtx=globeCanvas.getContext('2d');
  const GW=globeCanvas.width, GH=globeCanvas.height;
  const G_CX=GW/2, G_CY=GH/2, G_R=Math.min(GW,GH)*0.40;
  const TILT = 18*Math.PI/180;
  let camSpin = 0;
  const trackHistory = [];
  const globeLoadingEl = el('globeLoading');
  const globeSourceNote = el('globeSourceNote');

  function angleDiff(a,b){ let d=(a-b+Math.PI)%(2*Math.PI); if(d<-Math.PI) d+=2*Math.PI; if(d>Math.PI) d-=2*Math.PI; return d; }

  function project(lonDeg, latDeg){
    const lon=lonDeg*Math.PI/180, lat=latDeg*Math.PI/180;
    const X = Math.cos(lat)*Math.sin(lon), Y = Math.sin(lat), Z = Math.cos(lat)*Math.cos(lon);
    const Xs = X*Math.cos(camSpin) + Z*Math.sin(camSpin);
    const Zs = -X*Math.sin(camSpin) + Z*Math.cos(camSpin);
    const Ys = Y;
    const Yt = Ys*Math.cos(TILT) - Zs*Math.sin(TILT);
    const Zt = Ys*Math.sin(TILT) + Zs*Math.cos(TILT);
    const Xt = Xs;
    return { x: G_CX + G_R*Xt, y: G_CY - G_R*Yt, visible: Zt > 0.02 };
  }

  function strokePath(points){
    globeCtx.beginPath(); let started=false;
    points.forEach(p=>{
      if(p.visible){ if(!started){ globeCtx.moveTo(p.x,p.y); started=true; } else globeCtx.lineTo(p.x,p.y); }
      else started=false;
    });
    globeCtx.stroke();
  }

  // ---- photorealistic Earth texture: loaded once, sampled per-pixel with inverse spherical projection ----
  let earthTexReady=false, earthTexData=null, earthTexW=0, earthTexH=0;
  (function loadEarthTexture(){
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function(){
      try{
        const off = document.createElement('canvas');
        off.width = 512; off.height = 256;
        const octx = off.getContext('2d');
        octx.drawImage(img, 0, 0, off.width, off.height);
        const id = octx.getImageData(0,0,off.width,off.height);
        earthTexData = id.data; earthTexW = off.width; earthTexH = off.height;
        earthTexReady = true;
      } catch(e){ earthTexReady = false; }
      if(globeLoadingEl) globeLoadingEl.classList.add('hidden');
      if(!earthTexReady && globeSourceNote) globeSourceNote.textContent =
        'Earth imagery could not be loaded (network/CORS restriction) — automatically using the vector-drawn globe instead. All orbital mechanics, ground track, and coverage math are unaffected.';
    };
    img.onerror = function(){
      earthTexReady = false;
      if(globeLoadingEl) globeLoadingEl.classList.add('hidden');
      if(globeSourceNote) globeSourceNote.textContent =
        'Earth imagery could not be loaded (network/CORS restriction) — automatically using the vector-drawn globe instead. All orbital mechanics, ground track, and coverage math are unaffected.';
    };
    img.src = 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg';
  })();

  const TEX_BUF_SIZE = 260;
  const texBuf = document.createElement('canvas');
  texBuf.width = TEX_BUF_SIZE; texBuf.height = TEX_BUF_SIZE;
  const texBufCtx = texBuf.getContext('2d');
  const texBufImageData = texBufCtx.createImageData(TEX_BUF_SIZE, TEX_BUF_SIZE);
  const LIGHT = (function(v){ const len=Math.hypot(v[0],v[1],v[2]); return [v[0]/len,v[1]/len,v[2]/len]; })([-0.35,0.5,0.7]);
  let lastTexRenderMs = 0;

  function renderTexturedSphereToBuffer(){
    const bufR = TEX_BUF_SIZE/2 - 1, bcx = TEX_BUF_SIZE/2, bcy = TEX_BUF_SIZE/2;
    const data = texBufImageData.data;
    const cosT=Math.cos(TILT), sinT=Math.sin(TILT), cosS=Math.cos(camSpin), sinS=Math.sin(camSpin);
    for(let j=0;j<TEX_BUF_SIZE;j++){
      for(let i=0;i<TEX_BUF_SIZE;i++){
        const idx=(j*TEX_BUF_SIZE+i)*4;
        const nx=(i-bcx)/bufR, ny=-(j-bcy)/bufR, r2=nx*nx+ny*ny;
        if(r2>1){ data[idx+3]=0; continue; }
        const nz=Math.sqrt(1-r2);
        const Ys=ny*cosT+nz*sinT, Zs=-ny*sinT+nz*cosT, Xs=nx;
        const X=Xs*cosS-Zs*sinS, Z=Xs*sinS+Zs*cosS, Y=Ys;
        const lat=Math.asin(Math.max(-1,Math.min(1,Y)));
        const lon=Math.atan2(X,Z);
        let u=Math.floor(((lon*180/Math.PI)+180)/360*earthTexW);
        let v=Math.floor((90-lat*180/Math.PI)/180*earthTexH);
        u=((u%earthTexW)+earthTexW)%earthTexW; v=Math.max(0,Math.min(earthTexH-1,v));
        const tIdx=(v*earthTexW+u)*4;
        const diffuse=Math.max(0, nx*LIGHT[0]+ny*LIGHT[1]+nz*LIGHT[2]);
        const shade=0.32+0.85*diffuse;
        data[idx]=Math.min(255,earthTexData[tIdx]*shade);
        data[idx+1]=Math.min(255,earthTexData[tIdx+1]*shade);
        data[idx+2]=Math.min(255,earthTexData[tIdx+2]*shade);
        data[idx+3]=255;
      }
    }
    texBufCtx.putImageData(texBufImageData,0,0);
  }

  // draws a small stylized CubeSat (bus + two solar panel wings) oriented along its direction of travel
  function drawSatelliteModel(x, y, headingRad, lit){
    globeCtx.save();
    globeCtx.translate(x, y);
    globeCtx.rotate(headingRad);
    const s = 1.15;
    globeCtx.shadowColor = 'rgba(61,139,253,0.9)'; globeCtx.shadowBlur = 10;
    const panelW = 15*s, panelH = 5.5*s;
    [[-1],[1]].forEach(([dir])=>{
      const px = dir*(4*s), py = 0;
      globeCtx.save();
      globeCtx.translate(px + dir*panelW/2, py);
      const pg = globeCtx.createLinearGradient(-panelW/2,0,panelW/2,0);
      pg.addColorStop(0,'#1c3a68'); pg.addColorStop(0.5,'#3d6bb0'); pg.addColorStop(1,'#1c3a68');
      globeCtx.fillStyle = pg;
      globeCtx.fillRect(-panelW/2, -panelH/2, panelW, panelH);
      globeCtx.strokeStyle = 'rgba(180,210,255,0.5)'; globeCtx.lineWidth = 0.5;
      for(let i=1;i<4;i++){ const lx=-panelW/2+i*(panelW/4); globeCtx.beginPath(); globeCtx.moveTo(lx,-panelH/2); globeCtx.lineTo(lx,panelH/2); globeCtx.stroke(); }
      globeCtx.strokeStyle='rgba(220,235,255,0.6)'; globeCtx.lineWidth=0.7; globeCtx.strokeRect(-panelW/2,-panelH/2,panelW,panelH);
      globeCtx.restore();
    });
    globeCtx.shadowBlur = 14; globeCtx.shadowColor = lit ? 'rgba(255,180,90,0.9)' : 'rgba(140,160,200,0.6)';
    const bw=7*s, bh=6*s;
    const bg = globeCtx.createLinearGradient(0,-bh/2,0,bh/2);
    bg.addColorStop(0, lit? '#ffe3b8' : '#aab6cc'); bg.addColorStop(0.5, lit? '#ff9a3d' : '#5c6c8c'); bg.addColorStop(1,'#3a2412');
    globeCtx.fillStyle = bg;
    globeCtx.fillRect(-bw/2,-bh/2,bw,bh);
    globeCtx.strokeStyle='rgba(255,255,255,0.55)'; globeCtx.lineWidth=0.6; globeCtx.strokeRect(-bw/2,-bh/2,bw,bh);
    globeCtx.shadowBlur=0;
    globeCtx.strokeStyle='rgba(230,235,245,0.8)'; globeCtx.lineWidth=0.8;
    globeCtx.beginPath(); globeCtx.moveTo(0,-bh/2); globeCtx.lineTo(0,-bh/2-5*s); globeCtx.stroke();
    globeCtx.restore();
  }

  function drawGlobe(sub, nowMs){
    globeCtx.clearRect(0,0,GW,GH);

    // outer atmosphere glow
    const atmo = globeCtx.createRadialGradient(G_CX,G_CY,G_R*0.94, G_CX,G_CY,G_R*1.22);
    atmo.addColorStop(0,'rgba(90,150,255,0.35)'); atmo.addColorStop(1,'rgba(90,150,255,0)');
    globeCtx.fillStyle=atmo; globeCtx.beginPath(); globeCtx.arc(G_CX,G_CY,G_R*1.22,0,Math.PI*2); globeCtx.fill();

    if(earthTexReady){
      // photorealistic path: render (throttled) textured sphere buffer, then scale onto the visible canvas
      if(nowMs - lastTexRenderMs > 65){ renderTexturedSphereToBuffer(); lastTexRenderMs = nowMs; }
      globeCtx.imageSmoothingEnabled = true;
      globeCtx.save();
      globeCtx.beginPath(); globeCtx.arc(G_CX,G_CY,G_R,0,Math.PI*2); globeCtx.clip();
      globeCtx.drawImage(texBuf, 0,0,TEX_BUF_SIZE,TEX_BUF_SIZE, G_CX-G_R, G_CY-G_R, G_R*2, G_R*2);
      globeCtx.restore();
      globeCtx.strokeStyle='rgba(150,180,220,0.4)'; globeCtx.lineWidth=1.5;
      globeCtx.beginPath(); globeCtx.arc(G_CX,G_CY,G_R,0,Math.PI*2); globeCtx.stroke();
      // thin equator reference line still drawn for orientation
      globeCtx.strokeStyle='rgba(255,204,51,0.35)'; globeCtx.lineWidth=1;
      { const pts=[]; for(let lon=-180; lon<=180; lon+=4) pts.push(project(lon,0)); strokePath(pts); }
    } else {
      // vector fallback: shaded ocean sphere, graticule, hand-drawn continents, Antarctic cap
      const grad = globeCtx.createRadialGradient(G_CX-G_R*0.38,G_CY-G_R*0.4,G_R*0.08, G_CX,G_CY,G_R*1.05);
      grad.addColorStop(0,'#2f5f8f'); grad.addColorStop(0.35,'#1a3d63'); grad.addColorStop(0.7,'#0e253f'); grad.addColorStop(1,'#050f1e');
      globeCtx.fillStyle=grad; globeCtx.beginPath(); globeCtx.arc(G_CX,G_CY,G_R,0,Math.PI*2); globeCtx.fill();
      globeCtx.strokeStyle='rgba(150,180,220,0.4)'; globeCtx.lineWidth=1.5; globeCtx.stroke();

      globeCtx.strokeStyle='rgba(90,120,170,0.28)'; globeCtx.lineWidth=1;
      for(let lon=-180; lon<180; lon+=30){
        const pts=[]; for(let lat=-88; lat<=88; lat+=4) pts.push(project(lon,lat));
        strokePath(pts);
      }
      for(let lat=-60; lat<=60; lat+=30){
        const pts=[]; for(let lon=-180; lon<=180; lon+=4) pts.push(project(lon,lat));
        strokePath(pts);
      }
      globeCtx.strokeStyle='rgba(255,204,51,0.4)'; globeCtx.lineWidth=1.3;
      { const pts=[]; for(let lon=-180; lon<=180; lon+=4) pts.push(project(lon,0)); strokePath(pts); }

      CONTINENTS.forEach(poly=>{
        const pts = poly.map(([lon,lat])=>project(lon,lat));
        if(pts.every(p=>p.visible)){
          globeCtx.beginPath();
          pts.forEach((p,i)=> i===0?globeCtx.moveTo(p.x,p.y):globeCtx.lineTo(p.x,p.y));
          globeCtx.closePath();
          globeCtx.fillStyle='rgba(76,168,120,0.85)'; globeCtx.fill();
          globeCtx.strokeStyle='rgba(140,225,175,0.6)'; globeCtx.lineWidth=1; globeCtx.stroke();
        }
      });

      { const pts=[]; for(let b=0;b<=360;b+=8){ const dp=destinationPoint(-90,0,20*Math.PI/180,b*Math.PI/180); pts.push(project(dp.lon,dp.lat)); }
        if(pts.every(p=>p.visible)){
          globeCtx.beginPath(); pts.forEach((p,i)=> i===0?globeCtx.moveTo(p.x,p.y):globeCtx.lineTo(p.x,p.y));
          globeCtx.closePath(); globeCtx.fillStyle='rgba(220,235,250,0.75)'; globeCtx.fill();
          globeCtx.strokeStyle='rgba(255,255,255,0.5)'; globeCtx.lineWidth=1; globeCtx.stroke();
        } }
    }

    // pole labels (drawn in both modes for orientation clarity)
    const npole = project(0,90), spole = project(0,-90);
    globeCtx.font='11px monospace'; globeCtx.textAlign='center';
    if(npole.visible){ globeCtx.fillStyle='rgba(238,242,252,0.85)'; globeCtx.fillText('N', npole.x, npole.y-4); }
    if(spole.visible){ globeCtx.fillStyle='rgba(238,242,252,0.85)'; globeCtx.fillText('S', spole.x, spole.y+12); }
    globeCtx.textAlign='left';

    // South Atlantic Anomaly zone
    const saaPoly=[[-90,-50],[8,-50],[8,2],[-90,2]];
    const saaPts=saaPoly.map(([lon,lat])=>project(lon,lat));
    if(saaPts.every(p=>p.visible)){
      globeCtx.fillStyle='rgba(255,204,51,0.20)'; globeCtx.strokeStyle='rgba(255,204,51,0.75)'; globeCtx.lineWidth=1.3;
      globeCtx.beginPath(); saaPts.forEach((p,i)=> i===0?globeCtx.moveTo(p.x,p.y):globeCtx.lineTo(p.x,p.y));
      globeCtx.closePath(); globeCtx.fill(); globeCtx.stroke();
      const saaLbl = project(-40,-25);
      if(saaLbl.visible){ globeCtx.fillStyle='rgba(255,224,138,0.9)'; globeCtx.font='10px monospace'; globeCtx.fillText('SAA', saaLbl.x, saaLbl.y); }
    }

    // full orbital plane ring (current snapshot of the great circle Aether-12 travels)
    const nodeLonNow = (ASC_NODE_LON0 - (OMEGA_EARTH*simSeconds)*180/Math.PI);
    globeCtx.strokeStyle='rgba(255,122,26,0.32)'; globeCtx.lineWidth=1.3; globeCtx.setLineDash([4,3]);
    { const pts=[]; for(let th=0; th<=360; th+=3){
        const thr = th*Math.PI/180;
        const latR = Math.asin(Math.sin(INCL_RAD)*Math.sin(thr));
        const dLon = Math.atan2(Math.cos(INCL_RAD)*Math.sin(thr), Math.cos(thr));
        const lonD = nodeLonNow + dLon*180/Math.PI;
        pts.push(project(lonD, latR*180/Math.PI));
      }
      strokePath(pts);
    }
    globeCtx.setLineDash([]);

    // recent ground track trail (solid, brighter)
    globeCtx.strokeStyle='rgba(255,140,40,0.95)'; globeCtx.lineWidth=2.6;
    strokePath(trackHistory.map(p=>project(p.lon,p.lat)));

    // footprint / coverage cap
    globeCtx.fillStyle='rgba(61,139,253,0.22)'; globeCtx.strokeStyle='rgba(61,139,253,0.9)'; globeCtx.lineWidth=1.5;
    { const pts=[]; for(let b=0;b<=360;b+=6){ const dp=destinationPoint(sub.lat,sub.lon,COV_ANGLE_RAD,b*Math.PI/180); pts.push(project(dp.lon,dp.lat)); }
      if(pts.every(p=>p.visible)){ globeCtx.beginPath(); pts.forEach((p,i)=> i===0?globeCtx.moveTo(p.x,p.y):globeCtx.lineTo(p.x,p.y)); globeCtx.closePath(); globeCtx.fill(); globeCtx.stroke(); } }

    // ground station marker, clearly labeled
    const gp = project(GS_LON,GS_LAT);
    if(gp.visible){
      globeCtx.fillStyle='#33e39a'; globeCtx.shadowColor='#33e39a'; globeCtx.shadowBlur=12;
      globeCtx.beginPath(); globeCtx.moveTo(gp.x,gp.y-8); globeCtx.lineTo(gp.x-6,gp.y+5); globeCtx.lineTo(gp.x+6,gp.y+5); globeCtx.closePath(); globeCtx.fill();
      globeCtx.shadowBlur=0;
      globeCtx.fillStyle='#04140e'; globeCtx.font='bold 8px monospace'; globeCtx.textAlign='center';
      globeCtx.fillText('GS', gp.x, gp.y+3.5); globeCtx.textAlign='left';
      globeCtx.fillStyle='#eef2fc'; globeCtx.font='11px monospace';
      globeCtx.fillText('Ground Station · Apex, NC', gp.x+10, gp.y+2);
    }

    // satellite: proper CubeSat model, oriented to direction of travel, floating above surface at altitude, clearly labeled
    const sp = project(sub.lon, sub.lat);
    if(sp.visible){
      const nextSub = subSatellitePoint(simSeconds + 5);
      const spNext = project(nextSub.lon, nextSub.lat);
      const dx=sp.x-G_CX, dy=sp.y-G_CY, len=Math.hypot(dx,dy)||1, offset=16;
      const ox=sp.x+dx/len*offset, oy=sp.y+dy/len*offset;
      globeCtx.strokeStyle='rgba(255,140,40,0.55)'; globeCtx.lineWidth=1; globeCtx.setLineDash([2,2]);
      globeCtx.beginPath(); globeCtx.moveTo(sp.x,sp.y); globeCtx.lineTo(ox,oy); globeCtx.stroke(); globeCtx.setLineDash([]);
      let heading = Math.atan2(spNext.y-sp.y, spNext.x-sp.x) + Math.PI/2;
      if(!isFinite(heading)) heading = 0;
      const lit = Math.cos(camSpin - Math.PI/6) > -0.3;
      drawSatelliteModel(ox, oy, heading, lit);
      globeCtx.fillStyle='rgba(255,216,173,0.95)'; globeCtx.font='10px monospace';
      globeCtx.fillText('AETHER-12 · 500 km alt', ox+11, oy+4);
    }
  }

  /* =========================================================
     DOPPLER / MARGIN CHART
     ========================================================= */
  const chartCanvas=el('chartCanvas'), chartCtx=chartCanvas.getContext('2d');
  const history=[]; const HIST_MAX=220;
  const DOP_SCALE=6000, MARGIN_SCALE=40;
  function drawChart(){
    const w=chartCanvas.width,h=chartCanvas.height;
    chartCtx.clearRect(0,0,w,h); chartCtx.fillStyle='#060a13'; chartCtx.fillRect(0,0,w,h);
    chartCtx.strokeStyle='#141d30'; chartCtx.lineWidth=1;
    for(let i=0;i<=4;i++){ const y=(h/4)*i; chartCtx.beginPath(); chartCtx.moveTo(0,y); chartCtx.lineTo(w,y); chartCtx.stroke(); }
    chartCtx.strokeStyle='#57648a'; chartCtx.setLineDash([3,3]);
    chartCtx.beginPath(); chartCtx.moveTo(0,h/2); chartCtx.lineTo(w,h/2); chartCtx.stroke(); chartCtx.setLineDash([]);

    // axis labels — left side = Doppler (Hz), right side = Link Margin (dB)
    chartCtx.font='9.5px monospace';
    chartCtx.fillStyle='rgba(255,122,26,0.85)'; chartCtx.textAlign='left';
    chartCtx.fillText(`+${DOP_SCALE/1000}kHz`, 6, 12);
    chartCtx.fillText('0 Hz', 6, h/2-4);
    chartCtx.fillText(`-${DOP_SCALE/1000}kHz`, 6, h-6);
    chartCtx.fillStyle='rgba(61,139,253,0.9)'; chartCtx.textAlign='right';
    chartCtx.fillText(`+${MARGIN_SCALE}dB`, w-6, 12);
    chartCtx.fillText('0 dB', w-6, h/2-4);
    chartCtx.fillText(`-${MARGIN_SCALE}dB`, w-6, h-6);
    chartCtx.textAlign='left';

    if(history.length<2) return;
    function plot(key, scaleMax, color){
      chartCtx.strokeStyle=color; chartCtx.lineWidth=1.8; chartCtx.beginPath();
      history.forEach((pt,i)=>{ const x=(i/(HIST_MAX-1))*w; let v=Math.max(-scaleMax,Math.min(scaleMax,pt[key]));
        const y=h/2-(v/scaleMax)*(h/2-6); i===0?chartCtx.moveTo(x,y):chartCtx.lineTo(x,y); });
      chartCtx.stroke();
    }
    plot('doppler',DOP_SCALE,'#ff7a1a'); plot('margin',MARGIN_SCALE,'#3d8bfd');

    // live value marker at the right edge (current instant)
    const last = history[history.length-1];
    const dY = h/2-(Math.max(-DOP_SCALE,Math.min(DOP_SCALE,last.doppler))/DOP_SCALE)*(h/2-6);
    const mY = h/2-(Math.max(-MARGIN_SCALE,Math.min(MARGIN_SCALE,last.margin))/MARGIN_SCALE)*(h/2-6);
    chartCtx.fillStyle='#ff7a1a'; chartCtx.beginPath(); chartCtx.arc(w-2,dY,3,0,Math.PI*2); chartCtx.fill();
    chartCtx.fillStyle='#3d8bfd'; chartCtx.beginPath(); chartCtx.arc(w-2,mY,3,0,Math.PI*2); chartCtx.fill();
  }

  /* =========================================================
     WATERFALL
     ========================================================= */
  const wf=el('waterfallCanvas'), wfCtx=wf.getContext('2d'); const WF_W=wf.width, WF_H=wf.height;
  function colormap(v){
    v=Math.max(0,Math.min(1,v));
    const stops=[[8,7,20],[30,20,90],[30,90,160],[20,160,150],[120,210,90],[255,220,60],[255,120,40]];
    const idx=v*(stops.length-1); const i0=Math.floor(idx), i1=Math.min(stops.length-1,i0+1), f=idx-i0;
    const c0=stops[i0], c1=stops[i1];
    return [Math.round(c0[0]+(c1[0]-c0[0])*f), Math.round(c0[1]+(c1[1]-c0[1])*f), Math.round(c0[2]+(c1[2]-c0[2])*f)];
  }
  function pushWaterfallRow(dopplerHz, visible, flare){
    const imgData=wfCtx.getImageData(0,0,WF_W,WF_H-1); wfCtx.putImageData(imgData,0,1);
    const row=wfCtx.createImageData(WF_W,1); const spanHz=10000;
    for(let x=0;x<WF_W;x++){
      const freqOffset=(x/WF_W-0.5)*spanHz; let intensity=Math.random()*0.12;
      if(visible && !flare){ const dist=Math.abs(freqOffset-dopplerHz); const sigma=220;
        intensity+=Math.exp(-(dist*dist)/(2*sigma*sigma))*0.95; }
      else if(flare){ intensity+=Math.random()*0.5; }
      const [r,g,b]=colormap(intensity); const p=x*4;
      row.data[p]=r; row.data[p+1]=g; row.data[p+2]=b; row.data[p+3]=255;
    }
    wfCtx.putImageData(row,0,0);
  }

  /* =========================================================
     TELEMETRY TERMINAL
     ========================================================= */
  const terminal=el('terminal');
  function hexByte(){ return Math.floor(Math.random()*256).toString(16).padStart(2,'0').toUpperCase(); }
  function hexPacket(n){ let s=''; for(let i=0;i<n;i++) s+=hexByte()+' '; return s.trim(); }
  let packetCounter=0;
  function pushTelemetryLine(state, vbatt, flare, saa){
    packetCounter++;
    const div=document.createElement('div'); div.className='ln';
    const crcOk = flare ? (Math.random()<0.15) : (Math.random()<0.985);
    const rssi = flare ? -140-Math.random()*20 : state.rxPowerDbm;
    div.innerHTML = `<span class="hdr">[PKT ${String(packetCounter).padStart(5,'0')}]</span> AX.25 &gt;&gt; ${hexPacket(8)} | `+
      `<span class="field">VBATT</span>=${vbatt.toFixed(2)}V <span class="field">RSSI</span>=${rssi.toFixed(1)}dBm `+
      (saa? `<span class="field">SAA</span>=1 ` : '') +
      (crcOk ? `<span class="ok">CRC:OK</span>` : `<span class="err">CRC:FAIL</span>`);
    terminal.appendChild(div);
    while(terminal.children.length>60) terminal.removeChild(terminal.firstChild);
    terminal.scrollTop = terminal.scrollHeight;
  }

  /* =========================================================
     MAIN LOOP
     ========================================================= */
  let terminalAccum=0, wfAccum=0, doseZ=0, doseAl=0;

  function tick(nowMs, dtMs){
    const dtSec = dtMs/1000;
    if(running){ simSeconds += dtSec * TIME_SCALE_BASE * speedMult; }

    currentCycleIdx = Math.floor(simSeconds/CYCLE_S);
    const withinCycle = simSeconds - currentCycleIdx*CYCLE_S;
    let tRel = withinCycle<=PASS_HALF_WINDOW*2 ? withinCycle-PASS_HALF_WINDOW : PASS_HALF_WINDOW+9999;
    const orbitNum = Math.floor(simSeconds/PERIOD_S)+1;

    metMET.textContent = fmtMET(simSeconds);
    hOrbit.textContent = orbitNum;
    if(!isDragging){ scrubSlider.value = withinCycle; scrubTimeLbl.textContent = fmtMMSS(withinCycle); }

    let state = computeState(Math.max(-PASS_HALF_WINDOW*3, Math.min(PASS_HALF_WINDOW*3, tRel)));
    if(!state.visible){ state.elevDeg = Math.max(state.elevDeg, -5); }

    let effState = Object.assign({}, state);
    if(flareActive){
      effState.rxPowerDbm = -145 - 10*Math.sin(nowMs/150);
      effState.linkMarginDb = effState.rxPowerDbm - RX_SENS_DBM;
      effState.dopplerHz = state.dopplerHz + (Math.random()-0.5)*1500;
    }

    const azimuthDeg = tRel < 0 ? 175 : 5;
    drawSky(state.elevDeg, azimuthDeg, state.visible);
    hDist.innerHTML = state.rho.toFixed(0)+'<span>km</span>';
    hElev.innerHTML = state.elevDeg.toFixed(1)+'<span>&deg;</span>';

    // ---- ground track + globe ----
    const sub = subSatellitePoint(simSeconds);
    trackHistory.push(sub); if(trackHistory.length>360) trackHistory.shift();
    const targetSpin = -sub.lon*Math.PI/180;
    camSpin += angleDiff(targetSpin, camSpin) * 0.02;
    drawGlobe(sub, nowMs);
    const saaNow = inSAA(sub.lat, sub.lon);
    saaBanner.classList.toggle('show', saaNow);
    envSection.classList.toggle('saa-alert', saaNow);

    // ---- story line ----
    let story;
    if(flareActive){
      story = `<b>Anomaly injected</b> — simulating a solar flare / RF disturbance. The link is currently unreliable.`;
    } else if(saaNow){
      story = `Aether&#8209;12 is crossing the <b>South Atlantic Anomaly</b> — radiation exposure is temporarily elevated.`;
    } else if(!state.visible){
      const toAOS = withinCycle < AOS_WITHIN ? (AOS_WITHIN-withinCycle) : (CYCLE_S-withinCycle)+AOS_WITHIN;
      story = `Aether&#8209;12 is below the horizon, on the far side of Earth. Next pass (AOS) in ${fmtMMSS(toAOS)}.`;
    } else if(Math.abs(tRel) < 6){
      story = `<b>Closest approach</b> — Aether&#8209;12 is directly overhead. Strongest point of the pass.`;
    } else if(tRel < 0){
      story = `Aether&#8209;12 has risen and is approaching. LOS in ${fmtMMSS(LOS_WITHIN-withinCycle)}.`;
    } else {
      story = `Aether&#8209;12 is moving away, heading toward the horizon. LOS in ${fmtMMSS(LOS_WITHIN-withinCycle)}.`;
    }
    storyLine.innerHTML = story;

    // ---- signal strength ----
    const marginClamped = Math.max(-30, Math.min(30, effState.linkMarginDb));
    const pct = ((marginClamped+30)/60)*100;
    sigFill.style.width = pct+'%';
    let sigColor='var(--green)', sigText='STRONG SIGNAL';
    if(effState.linkMarginDb < 0){ sigColor='var(--red)'; sigText='NO SIGNAL'; }
    else if(effState.linkMarginDb < 8){ sigColor='var(--amber)'; sigText='WEAK SIGNAL'; }
    else if(effState.linkMarginDb < 15){ sigColor='var(--blue)'; sigText='GOOD SIGNAL'; }
    sigFill.style.background = sigColor; sigLabel.style.color = sigColor; sigLabel.textContent = sigText;
    sigSub.textContent = `Link margin: ${effState.linkMarginDb.toFixed(1)} dB  ·  Received power: ${effState.rxPowerDbm.toFixed(1)} dBm`;

    // ---- doppler ----
    const dNum = effState.dopplerHz;
    dopplerNum.innerHTML = (dNum>=0?'+':'')+dNum.toFixed(0)+' <span>Hz shift</span>';
    dopplerSub.textContent = `Tuned frequency: ${(F0_MHZ + dNum/1e6).toFixed(6)} MHz`;
    if(dNum > 50){ arrowBadge.textContent='↑'; arrowBadge.style.color='var(--accent)'; arrowBadge.style.borderColor='var(--accent-dim)'; }
    else if(dNum < -50){ arrowBadge.textContent='↓'; arrowBadge.style.color='var(--blue)'; arrowBadge.style.borderColor='var(--blue-dim)'; }
    else { arrowBadge.textContent='•'; arrowBadge.style.color='var(--txt-md)'; arrowBadge.style.borderColor='var(--line)'; }

    history.push({doppler: effState.dopplerHz, margin: effState.linkMarginDb});
    if(history.length>HIST_MAX) history.shift();
    drawChart();

    wfAccum += dtMs;
    if(wfAccum > 90){ wfAccum = 0; pushWaterfallRow(effState.dopplerHz, state.visible, flareActive); }

    // ---- AI classifier ----
    let pNom, pMulti, pInterf;
    if(flareActive){ pInterf=0.62+Math.random()*0.25; pMulti=0.15+Math.random()*0.15; pNom=Math.max(0,1-pInterf-pMulti); }
    else if(!state.visible){ pNom=0.05+Math.random()*0.05; pMulti=0.03; pInterf=Math.max(0,1-pNom-pMulti); }
    else { const mn=Math.max(0,Math.min(1,effState.linkMarginDb/25));
      pNom=0.55+mn*0.4+(Math.random()-0.5)*0.05; pMulti=Math.max(0.02,(1-mn)*0.2+(Math.random()-0.5)*0.03); pInterf=Math.max(0,1-pNom-pMulti); }
    const sum=pNom+pMulti+pInterf; pNom/=sum; pMulti/=sum; pInterf/=sum;
    barNom.style.width=(pNom*100).toFixed(0)+'%'; pctNom.textContent=(pNom*100).toFixed(0)+'%';
    barMulti.style.width=(pMulti*100).toFixed(0)+'%'; pctMulti.textContent=(pMulti*100).toFixed(0)+'%';
    barInterf.style.width=(pInterf*100).toFixed(0)+'%'; pctInterf.textContent=(pInterf*100).toFixed(0)+'%';
    const topConf=Math.max(pNom,pMulti,pInterf);
    const RING_CIRC=2*Math.PI*31;
    aiRing.style.strokeDashoffset=(RING_CIRC*(1-topConf)).toFixed(1);
    aiPct.textContent=(topConf*100).toFixed(0)+'%';
    if(pNom===topConf){ aiLabel.textContent='NOMINAL DOWNLINK'; aiLabel.style.color='var(--green)'; aiRing.style.stroke='var(--green)'; }
    else if(pMulti===topConf){ aiLabel.textContent='MULTIPATH DETECTED'; aiLabel.style.color='var(--amber)'; aiRing.style.stroke='var(--amber)'; }
    else { aiLabel.textContent='RF INTERFERENCE'; aiLabel.style.color='var(--red)'; aiRing.style.stroke='var(--red)'; }

    // ---- radiation dose accumulation ----
    if(running){
      const saaMult = saaNow ? 6 : 1;
      doseZ += RATE_Z_PER_S * dtSec * TIME_SCALE_BASE * speedMult * saaMult;
      doseAl += RATE_AL_PER_S * dtSec * TIME_SCALE_BASE * speedMult * saaMult;
    }
    envDoseZ.innerHTML = doseZ.toFixed(4)+'<span>rad</span>';
    envDoseAl.innerHTML = doseAl.toFixed(2)+'<span>rad</span>';

    // ---- telemetry ----
    const vbatt = flareActive ? (7.1+Math.random()*0.15) : (7.55+Math.random()*0.18);
    terminalAccum += dtMs;
    const interval = flareActive ? 180 : 420;
    if(terminalAccum > interval){ terminalAccum = 0; pushTelemetryLine(effState, vbatt, flareActive, saaNow); }
  }

  let prevMs = performance.now();
  function loop(nowMs){ const dtMs=nowMs-prevMs; prevMs=nowMs; tick(nowMs,dtMs); requestAnimationFrame(loop); }
  wfCtx.fillStyle='#060a13'; wfCtx.fillRect(0,0,WF_W,WF_H);
  requestAnimationFrame(loop);

})();