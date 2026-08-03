/* =========================================================
   DASH TO IFTAR — game.js
   Endless runner 2D — HTML5 Canvas — Vanilla JS
   ========================================================= */

(() => {
"use strict";

/* ============================================================
   0. UTIL
============================================================ */
const $ = (id) => document.getElementById(id);
const rand = (a,b) => a + Math.random()*(b-a);
const randInt = (a,b) => Math.floor(rand(a,b+1));
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));

/* ============================================================
   1. AUDIO SYNTHESIZER (Web Audio API — 8-bit retro, no files)
============================================================ */
class Synth {
  constructor(){
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.bgmTimer = null;
    this.bgmStep = 0;
    this.phase = "day"; // day | sunset | night
  }
  unlock(){
    if(this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
    this.startBGM();
  }
  setMute(m){
    this.muted = m;
    if(this.master) this.master.gain.value = m ? 0 : 0.35;
  }
  tone(freq, dur, type="square", vol=0.5, delay=0, slideTo=null){
    if(!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if(slideTo) osc.frequency.linearRampToValueAtTime(slideTo, t0+dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0+0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t0+dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0+dur+0.05);
  }
  noise(dur, vol=0.4, delay=0){
    if(!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const bufferSize = this.ctx.sampleRate * dur;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for(let i=0;i<bufferSize;i++) data[i] = (Math.random()*2-1) * (1 - i/bufferSize);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0+dur);
    src.connect(g); g.connect(this.master);
    src.start(t0);
  }
  // ---------- SFX ----------
  sfxJump(){ this.tone(420,0.14,"square",0.35,0,700); }
  sfxSlide(){ this.tone(160,0.12,"triangle",0.3,0,90); }
  sfxCollectGood(){
    this.tone(880,0.09,"square",0.4,0);
    this.tone(1318,0.14,"square",0.35,0.07);
  }
  sfxCollectSpecial(){
    this.tone(660,0.09,"square",0.4,0);
    this.tone(880,0.09,"square",0.4,0.08);
    this.tone(1318,0.18,"square",0.4,0.16);
  }
  sfxHitBad(){
    this.noise(0.25,0.5,0);
    this.tone(110,0.28,"sawtooth",0.35,0,55);
  }
  sfxFanfare(){
    [523,659,784,1046].forEach((f,i)=> this.tone(f,0.22,"square",0.4,i*0.13));
  }
  sfxVictory(){
    [523,659,784,1046,1318].forEach((f,i)=> this.tone(f,0.3,"square",0.42,i*0.14));
  }
  // ---------- BGM ----------
  setPhase(p){
    if(this.phase === p) return;
    this.phase = p;
  }
  startBGM(){
    if(this.bgmTimer) clearInterval(this.bgmTimer);
    const patterns = {
      day:    { notes:[523,659,784,659,523,659,784,988], tempo:220, wave:"square" },
      sunset: { notes:[440,523,494,440,392,440,494,440], tempo:260, wave:"triangle" },
      night:  { notes:[392,523,587,523,440,523,659,523], tempo:190, wave:"square" }
    };
    this.bgmStep = 0;
    const step = () => {
      if(this.muted && this.ctx.state !== "running"){}
      const pat = patterns[this.phase];
      const note = pat.notes[this.bgmStep % pat.notes.length];
      this.tone(note, pat.tempo/1000*0.9, pat.wave, 0.14, 0);
      if(this.bgmStep % 4 === 0) this.tone(note/2, pat.tempo/1000*1.6, "triangle", 0.08, 0);
      this.bgmStep++;
      const pat2 = patterns[this.phase];
      this.bgmTimer = setTimeout(step, pat2.tempo);
    };
    step();
  }
}
const synth = new Synth();

/* ============================================================
   2. STATE
============================================================ */
const STAGE = {
  DAY:   { min:0,    max:500,  sky:["#8FD3F4","#FFE29A"], label:"Pintu Sekolah",   speed:4.2 },
  SUNSET:{ min:500,  max:1200, sky:["#FF9A5A","#FF5D73"], label:"Jalan Kampung",   speed:5.8 },
  NIGHT: { min:1200, max:2000, sky:["#241546","#5A2E8C"], label:"Kawasan Masjid",  speed:7.4 }
};

const state = {
  screen: "name",
  playerName: "Adam",
  distance: 0,
  energy: 100,
  pahala: 0,
  speed: 4.4,
  running: false,
  paused: false,
  gameOver: false,
  shieldTime: 0,
  slowTime: 0,
  dilemmaTriggered: { d800:false, d1500:false },
  stats: { kurma:0, air:0, bintang:0, quran:0, tasbih:0, marah:0, distraksi:0, junk:0, helped:0, ran:0 },
  lastToastT: 0
};

/* ============================================================
   3. CANVAS SETUP
============================================================ */
const canvas = $("game-canvas");
const ctx = canvas.getContext("2d");
let W=0,H=0, dpr=1;

function resize(){
  const rect = canvas.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio||1, 2);
  W = rect.width; H = rect.height;
  canvas.width = W*dpr; canvas.height = H*dpr;
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
window.addEventListener("resize", resize);

/* ============================================================
   4. PLAYER
============================================================ */
const GROUND_RATIO = 0.80;
const player = {
  x: 70, y:0, w:34, h:52, vy:0,
  state:"run", // run | jump | slide | hurt
  frame:0, frameT:0,
  groundY:0
};

function jump(){
  if(player.state==="jump") return;
  if(player.state==="slide") return;
  player.vy = -11.2;
  player.state = "jump";
  synth.sfxJump();
}
function slide(){
  if(player.state==="jump") return;
  player.state = "slide";
  synth.sfxSlide();
  clearTimeout(player._slideT);
  player._slideT = setTimeout(()=>{ if(player.state==="slide") player.state="run"; }, 550);
}

/* ============================================================
   5. WORLD OBJECTS (obstacles / items)
============================================================ */
let objects = [];
let spawnCooldown = 0;
let bgClouds = [];
let bgStars = [];

const ITEM_TYPES = [
  { key:"star",  emoji:"⭐", kind:"item", pahala:10, energy:5 },
  { key:"kurma", emoji:"🌴", kind:"item", pahala:5,  energy:15 },
  { key:"quran", emoji:"📖", kind:"item", pahala:20, energy:0, shield:true },
  { key:"tasbih",emoji:"🤲", kind:"item", pahala:10, energy:0 },
  { key:"air",   emoji:"💧", kind:"item", pahala:5,  energy:15 }
];
const OBSTACLE_GROUND = [
  { key:"burger", emoji:"🍔" },
  { key:"fries",  emoji:"🍟" },
  { key:"soda",   emoji:"🥤" },
  { key:"marah",  emoji:"😡" }
];
const OBSTACLE_HIGH = [
  { key:"phone", emoji:"📱" }
];

function initBackground(){
  bgClouds = Array.from({length:5},()=>({x:rand(0,1000), y:rand(20,140), s:rand(0.6,1.3)}));
  bgStars = Array.from({length:40},()=>({x:rand(0,1000), y:rand(10,260), s:rand(0.6,1.6), tw:rand(0,Math.PI*2)}));
}

function spawnObject(){
  const groundY = player.groundY;
  const roll = Math.random();
  let obj;
  if(roll < 0.45){
    const t = ITEM_TYPES[randInt(0,ITEM_TYPES.length-1)];
    obj = { ...t, x: W+40, y: groundY - rand(60,110), w:30, h:30, collected:false };
  } else if(roll < 0.78){
    const t = OBSTACLE_GROUND[randInt(0,OBSTACLE_GROUND.length-1)];
    obj = { ...t, kind:"bad", x: W+40, y: groundY-34, w:32, h:34, hit:false };
  } else {
    const t = OBSTACLE_HIGH[randInt(0,OBSTACLE_HIGH.length-1)];
    obj = { ...t, kind:"bad", x: W+40, y: groundY-92, w:34, h:30, hit:false };
  }
  objects.push(obj);
}

/* ============================================================
   6. TOAST
============================================================ */
let toastTimer = null;
function toast(msg){
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> el.classList.remove("show"), 1300);
}

/* ============================================================
   7. SCREEN SHAKE
============================================================ */
let shakeT = 0, shakeMag = 0;
function triggerShake(mag, dur){ shakeMag = mag; shakeT = dur; }

/* ============================================================
   8. STAGE HELPERS
============================================================ */
function currentStage(){
  if(state.distance < STAGE.DAY.max) return STAGE.DAY;
  if(state.distance < STAGE.SUNSET.max) return STAGE.SUNSET;
  return STAGE.NIGHT;
}
function stagePhaseKey(){
  if(state.distance < STAGE.DAY.max) return "day";
  if(state.distance < STAGE.SUNSET.max) return "sunset";
  return "night";
}
function stageBlend(){
  // returns interpolation factor near boundaries for smooth sky transition
  const d = state.distance;
  if(d < STAGE.DAY.max-80) return { a: STAGE.DAY.sky, b: STAGE.DAY.sky, t:0 };
  if(d < STAGE.DAY.max+80) return { a: STAGE.DAY.sky, b: STAGE.SUNSET.sky, t:(d-(STAGE.DAY.max-80))/160 };
  if(d < STAGE.SUNSET.max-80) return { a: STAGE.SUNSET.sky, b: STAGE.SUNSET.sky, t:0 };
  if(d < STAGE.SUNSET.max+80) return { a: STAGE.SUNSET.sky, b: STAGE.NIGHT.sky, t:(d-(STAGE.SUNSET.max-80))/160 };
  return { a: STAGE.NIGHT.sky, b: STAGE.NIGHT.sky, t:0 };
}
function lerpColor(c1,c2,t){
  const p = (c)=>[parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)];
  const a=p(c1), b=p(c2);
  const r = Math.round(a[0]+(b[0]-a[0])*t);
  const g = Math.round(a[1]+(b[1]-a[1])*t);
  const bl= Math.round(a[2]+(b[2]-a[2])*t);
  return `rgb(${r},${g},${bl})`;
}

/* ============================================================
   9. DRAWING
============================================================ */
function drawBackground(){
  const blend = stageBlend();
  const top = lerpColor(blend.a[0], blend.b[0], blend.t);
  const bot = lerpColor(blend.a[1], blend.b[1], blend.t);
  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0, top); g.addColorStop(1, bot);
  ctx.fillStyle = g; ctx.fillRect(0,0,W,H);

  const phase = stagePhaseKey();

  // sun / moon
  ctx.save();
  if(phase==="day"){
    ctx.fillStyle="#FFF3B0";
    ctx.beginPath(); ctx.arc(W*0.78, H*0.16, 30, 0, Math.PI*2); ctx.fill();
  } else if(phase==="sunset"){
    ctx.fillStyle="#FFD27A";
    ctx.beginPath(); ctx.arc(W*0.78, H*0.22, 32, 0, Math.PI*2); ctx.fill();
  } else {
    ctx.fillStyle="#FFF6E9";
    ctx.beginPath(); ctx.arc(W*0.78, H*0.14, 22, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle="rgba(255,255,255,0.85)";
    ctx.font="18px sans-serif"; ctx.fillText("✨", W*0.66, H*0.2);
  }
  ctx.restore();

  // stars at night
  if(phase==="night"){
    bgStars.forEach(s=>{
      s.tw += 0.03;
      ctx.globalAlpha = 0.5+Math.sin(s.tw)*0.5;
      ctx.fillStyle="#fff";
      ctx.beginPath(); ctx.arc(s.x % W, s.y*(H/280), s.s, 0, Math.PI*2); ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  // clouds (day/sunset)
  if(phase!=="night"){
    ctx.fillStyle = phase==="day" ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.5)";
    bgClouds.forEach(c=>{
      const cx = c.x % (W+200) - 100;
      ctx.beginPath();
      ctx.ellipse(cx, c.y*(H/280), 34*c.s, 14*c.s, 0,0,Math.PI*2);
      ctx.ellipse(cx+24*c.s, c.y*(H/280)+4, 24*c.s, 11*c.s, 0,0,Math.PI*2);
      ctx.fill();
    });
  }

  // ground silhouettes per stage
  const groundY = player.groundY;
  ctx.save();
  const offset = -(state.distance*7) % (W+240);
  for(let i=-1;i<4;i++){
    const bx = offset + i*240;
    if(phase==="day"){
      // sekolah gate silhouette
      ctx.fillStyle="rgba(140,100,60,0.55)";
      ctx.fillRect(bx, groundY-70, 14, 70);
      ctx.fillRect(bx+90, groundY-70, 14, 70);
      ctx.fillRect(bx, groundY-84, 104, 16);
    } else if(phase==="sunset"){
      // kampung houses
      ctx.fillStyle="rgba(90,40,60,0.55)";
      ctx.fillRect(bx, groundY-46, 60, 46);
      ctx.beginPath();
      ctx.moveTo(bx-6, groundY-46); ctx.lineTo(bx+30, groundY-72); ctx.lineTo(bx+66, groundY-46);
      ctx.fill();
    } else {
      // masjid silhouette
      ctx.fillStyle="rgba(20,10,45,0.7)";
      ctx.fillRect(bx, groundY-60, 50, 60);
      ctx.beginPath(); ctx.arc(bx+25, groundY-60, 25, Math.PI, 0); ctx.fill();
      ctx.fillRect(bx+58, groundY-90, 8, 90);
      ctx.beginPath(); ctx.arc(bx+62, groundY-90, 7,0,Math.PI*2); ctx.fill();
    }
  }
  ctx.restore();

  // ground strip
  const groundGrad = ctx.createLinearGradient(0,groundY,0,H);
  if(phase==="day") { groundGrad.addColorStop(0,"#8FBF6B"); groundGrad.addColorStop(1,"#5E8F45"); }
  else if(phase==="sunset"){ groundGrad.addColorStop(0,"#C97B4A"); groundGrad.addColorStop(1,"#8A4E2E"); }
  else { groundGrad.addColorStop(0,"#2C1F4A"); groundGrad.addColorStop(1,"#160E2C"); }
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, groundY, W, H-groundY);

  // ground line dashes (scroll)
  ctx.strokeStyle="rgba(255,255,255,0.25)";
  ctx.lineWidth=2;
  ctx.setLineDash([16,16]);
  ctx.lineDashOffset = -state.distance*8;
  ctx.beginPath(); ctx.moveTo(0,groundY+4); ctx.lineTo(W,groundY+4); ctx.stroke();
  ctx.setLineDash([]);
}

function drawPlayer(){
  const p = player;
  ctx.save();
  ctx.translate(p.x, p.y);

  // shield aura
  if(state.shieldTime>0){
    ctx.save();
    ctx.globalAlpha = 0.35 + Math.sin(Date.now()/100)*0.15;
    ctx.strokeStyle = "#FFD24A";
    ctx.lineWidth=4;
    ctx.beginPath(); ctx.arc(p.w/2, p.h/2, 38, 0, Math.PI*2); ctx.stroke();
    ctx.restore();
  }

  const bob = p.state==="run" ? Math.sin(p.frame*0.5)*2 : 0;
  const duck = p.state==="slide" ? 16 : 0;

  ctx.translate(0, duck);

  // beg galas (backpack)
  ctx.fillStyle="#3E7CB1";
  ctx.fillRect(-6, 10+bob, 10, 20 - (duck?8:0));

  // legs (simple run cycle)
  ctx.strokeStyle="#2B2B2B"; ctx.lineWidth=5; ctx.lineCap="round";
  const legSwing = p.state==="run" ? Math.sin(p.frame*0.5)*10 : (p.state==="jump"? 6 : 0);
  ctx.beginPath();
  ctx.moveTo(10, 36-duck*0.5); ctx.lineTo(10+legSwing, 50-duck*0.6);
  ctx.moveTo(22, 36-duck*0.5); ctx.lineTo(22-legSwing, 50-duck*0.6);
  ctx.stroke();

  // body (baju putih)
  ctx.fillStyle="#FFFFFF";
  ctx.strokeStyle="rgba(0,0,0,0.15)"; ctx.lineWidth=1.5;
  const bodyH = p.state==="slide" ? 18 : 26;
  roundRect(6, 12+bob, 20, bodyH, 6, true, true);

  // arms
  ctx.strokeStyle="#F2C79E"; ctx.lineWidth=5;
  const armSwing = p.state==="run" ? Math.sin(p.frame*0.5+Math.PI)*12 : -8;
  ctx.beginPath();
  ctx.moveTo(8,18+bob); ctx.lineTo(8-armSwing*0.4, 30+bob);
  ctx.moveTo(24,18+bob); ctx.lineTo(24+armSwing*0.4, 30+bob);
  ctx.stroke();

  // head
  ctx.fillStyle="#F2C79E";
  ctx.beginPath();
  ctx.arc(16, bob+2, 11, 0, Math.PI*2);
  ctx.fill();

  // hair
  ctx.fillStyle="#2B1B0E";
  ctx.beginPath();
  ctx.arc(16, bob-3, 11, Math.PI, 0);
  ctx.fill();

  // face
  ctx.fillStyle="#2B2B2B";
  ctx.beginPath(); ctx.arc(20, bob+1, 1.6, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(13, bob+1, 1.6, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle="#8A4E2E"; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.arc(17, bob+5, 3, 0, Math.PI*0.9); ctx.stroke();

  // sweat if slow-motion (batal puasa)
  if(state.slowTime>0){
    ctx.fillStyle="rgba(120,200,255,0.9)";
    ctx.beginPath(); ctx.ellipse(27, bob-2, 3,5,0.4,0,Math.PI*2); ctx.fill();
  }

  ctx.restore();
}

function roundRect(x,y,w,h,r,fill,stroke){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
  if(fill) ctx.fill();
  if(stroke) ctx.stroke();
}

function drawObjects(){
  ctx.font = "26px sans-serif";
  ctx.textAlign="center"; ctx.textBaseline="middle";
  objects.forEach(o=>{
    if(o.collected || o.hit) return;
    const bobY = o.kind==="item" ? Math.sin((o.x+Date.now()/6)*0.02)*5 : 0;
    ctx.save();
    ctx.translate(o.x + o.w/2, o.y + o.h/2 + bobY);
    if(o.kind==="item"){
      ctx.shadowColor = "rgba(255,220,120,0.7)";
      ctx.shadowBlur = 10;
    }
    ctx.fillText(o.emoji, 0, 2);
    ctx.restore();
  });
}

/* ============================================================
   10. COLLISION
============================================================ */
function aabb(ax,ay,aw,ah,bx,by,bw,bh){
  return ax < bx+bw && ax+aw > bx && ay < by+bh && ay+ah > by;
}

function playerHitbox(){
  const p = player;
  if(p.state==="slide"){
    return { x:p.x, y:p.y+30, w:p.w, h:22 };
  }
  return { x:p.x+4, y:p.y+2, w:p.w-8, h:p.h-2 };
}

/* ============================================================
   11. UPDATE
============================================================ */
let lastT = 0;
function update(dt){
  if(!state.running || state.paused) return;

  // slow motion effect (batal puasa)
  let speedMul = 1;
  if(state.slowTime>0){ state.slowTime -= dt; speedMul = 0.45; }
  if(state.shieldTime>0){ state.shieldTime -= dt; }

  const worldSpeed = state.speed * speedMul;

  // distance & difficulty
  state.distance += (worldSpeed*dt*60)/8;
  const targetSpeed = currentStage().speed;
  state.speed += (targetSpeed - state.speed) * clamp(dt*1.2, 0, 1);

  // energy drain
  state.energy -= 2*dt;
  if(state.energy <= 0){ state.energy = 0; endGame(); }

  // audio phase
  synth.setPhase(stagePhaseKey());

  // player physics
  const p = player;
  if(p.state==="jump"){
    p.vy += 0.62;
    p.y += p.vy;
    if(p.y >= p.groundY - p.h){
      p.y = p.groundY - p.h;
      p.state = "run";
      p.vy = 0;
    }
  } else if(p.state==="run"){
    p.y = p.groundY - p.h;
  } else if(p.state==="slide"){
    p.y = p.groundY - p.h;
  }
  p.frame += dt*10;

  // spawn objects
  spawnCooldown -= dt;
  if(spawnCooldown<=0){
    spawnObject();
    spawnCooldown = rand(0.9, 1.6) - Math.min(state.distance/2000,1)*0.4;
  }

  // move & collide objects
  const hb = playerHitbox();
  objects.forEach(o=>{
    o.x -= worldSpeed*dt*60;
    if(o.collected || o.hit) return;
    if(aabb(hb.x,hb.y,hb.w,hb.h, o.x,o.y,o.w,o.h)){
      if(o.kind==="item"){
        o.collected = true;
        collectItem(o);
      } else {
        if(state.shieldTime>0){
          o.hit = true; // shield absorbs, no penalty
        } else {
          o.hit = true;
          hitObstacle(o);
        }
      }
    }
  });
  objects = objects.filter(o => o.x > -60 && !o.collected && !o.hit);
  // remove hit/collected with tiny delay handled by filter directly (instant ok)

  // screen shake decay
  if(shakeT>0) shakeT -= dt;

  // dilemma triggers
  if(!state.dilemmaTriggered.d800 && state.distance >= 800){
    state.dilemmaTriggered.d800 = true;
    triggerDilemma("Kawan jatuh!", "😢");
  } else if(!state.dilemmaTriggered.d1500 && state.distance >= 1500){
    state.dilemmaTriggered.d1500 = true;
    triggerDilemma("Kucing lapar!", "😿");
  }

  // win condition
  if(state.distance >= 2000){
    endGame(true);
  }

  updateHUD();
}

function collectItem(o){
  if(o.energy) state.energy = clamp(state.energy + o.energy, 0, 100);
  if(o.pahala) state.pahala += o.pahala;
  if(o.shield){ state.shieldTime = 5; }
  if(o.key==="kurma") state.stats.kurma++;
  if(o.key==="air") state.stats.air++;
  if(o.key==="star") state.stats.bintang++;
  if(o.key==="quran") state.stats.quran++;
  if(o.key==="tasbih") state.stats.tasbih++;

  if(o.shield){ synth.sfxCollectSpecial(); toast("📖 Aura Perlindungan!"); }
  else { synth.sfxCollectGood(); }
}

function hitObstacle(o){
  triggerShake(6, 0.25);
  synth.sfxHitBad();
  // Sistem bersepadu: setiap halangan = Tenaga -20%, Ramadan Points -10
  state.energy = clamp(state.energy-20,0,100);
  state.pahala = Math.max(0,state.pahala-10);
  if(o.key==="burger"||o.key==="fries"||o.key==="soda"){
    state.stats.junk++;
    toast("😵 Batal Puasa!");
  } else if(o.key==="marah"){
    state.stats.marah++;
    toast("💢 Pahala Lebur!");
  } else if(o.key==="phone"){
    state.stats.distraksi++;
    toast("📵 Pahala Lebur!");
  }
  if(state.energy<=0){ state.energy=0; endGame(false); }
}

/* ============================================================
   12. DILEMMA MORAL
============================================================ */
let dilemmaTimerInterval = null;
function triggerDilemma(text, emoji){
  state.paused = true;
  $("dilemma-text").textContent = text;
  $("dilemma-emoji").textContent = emoji;
  const overlay = $("dilemma-overlay");
  overlay.classList.add("show");
  let t = 3;
  $("dilemma-timer").textContent = t;
  clearInterval(dilemmaTimerInterval);
  dilemmaTimerInterval = setInterval(()=>{
    t--;
    if(t<=0){
      clearInterval(dilemmaTimerInterval);
      resolveDilemma(false); // auto: terus lari
    } else {
      $("dilemma-timer").textContent = t;
    }
  },1000);
}
function resolveDilemma(helped){
  clearInterval(dilemmaTimerInterval);
  $("dilemma-overlay").classList.remove("show");
  if(helped){
    state.energy = clamp(state.energy-10,0,100);
    state.pahala += 50;
    state.shieldTime = 5;
    state.stats.helped++;
    synth.sfxFanfare();
    toast("🤝 Terima kasih, Adam!");
  } else {
    state.pahala = Math.max(0,state.pahala-20);
    state.stats.ran++;
    toast("🏃 Adam terus berlari...");
  }
  state.paused = false;
}

/* ============================================================
   13. HUD
============================================================ */
function updateHUD(){
  $("bar-energy").style.width = state.energy + "%";
  $("bar-pahala").style.width = clamp(state.pahala,0,100) + "%";
  $("txt-energy").textContent = Math.round(state.energy) + "%";
  $("txt-pahala").textContent = Math.round(state.pahala) + " pt";
  $("txt-distance").textContent = Math.min(2000,Math.round(state.distance));
}

/* ============================================================
   14. RENDER LOOP
============================================================ */
function render(){
  ctx.save();
  if(shakeT>0){
    ctx.translate((Math.random()-0.5)*shakeMag, (Math.random()-0.5)*shakeMag);
  }
  drawBackground();
  drawObjects();
  drawPlayer();
  ctx.restore();
}

function loop(t){
  if(!lastT) lastT=t;
  const dt = Math.min((t-lastT)/1000, 0.033);
  lastT = t;
  update(dt);
  render();
  if(state.screen==="game") requestAnimationFrame(loop);
}

/* ============================================================
   15. GAME FLOW
============================================================ */
function showScreen(name){
  document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
  $("screen-"+name).classList.add("active");
  state.screen = name;
}

function startGame(){
  resize();
  player.groundY = H*GROUND_RATIO;
  player.y = player.groundY - player.h;
  player.state = "run";
  objects = [];
  spawnCooldown = 0.6;
  initBackground();

  state.distance=0; state.energy=100; state.pahala=0; state.speed=4.4;
  state.running=true; state.paused=false; state.gameOver=false;
  state.shieldTime=0; state.slowTime=0;
  state.dilemmaTriggered={d800:false,d1500:false};
  state.stats={kurma:0,air:0,bintang:0,quran:0,tasbih:0,marah:0,distraksi:0,junk:0,helped:0,ran:0};

  showScreen("game");
  updateHUD();
  lastT = 0;
  requestAnimationFrame(loop);
}

function endGame(won=false){
  if(state.gameOver) return;
  state.gameOver = true;
  state.running = false;
  if(won){
    synth.sfxVictory();
    $("result-title").textContent = "Alhamdulillah!";
    $("result-sub").textContent = "Adam sampai ke rumah sebelum Maghrib untuk berbuka puasa";
  } else {
    synth.sfxHitBad();
    $("result-title").textContent = "Adam Keletihan!";
    $("result-sub").textContent = "Tenaga Adam habis sebelum sampai ke rumah. Cuba lagi, ya!";
  }
  buildResult();
  showScreen("result");
  startFamilyScene(won);
}

function rankFor(pt){
  if(pt>=90) return "🌟 HERO RAMADAN";
  if(pt>=70) return "👍 PENJAGA PUASA";
  return "📚 CUBA LAGI";
}

function buildResult(){
  const s = state.stats;
  $("cert-name").textContent = state.playerName || "Adam";
  $("cert-pahala").textContent = Math.round(state.pahala);
  $("cert-energy").textContent = Math.round(state.energy);
  $("cert-rank").textContent = rankFor(state.pahala);

  const list = $("reflection-list");
  list.innerHTML = "";
  const rows = [];
  if(s.kurma>0) rows.push(`🌴 Mengutip ${s.kurma}x Kurma — Sunnah berbuka diawali kurma!`);
  if(s.air>0) rows.push(`💧 Mengutip ${s.air}x Air — Jangan lupa minum semasa berbuka!`);
  if(s.bintang>0) rows.push(`⭐ Mengutip ${s.bintang}x Bintang amal kebaikan.`);
  if(s.quran>0) rows.push(`📖 Membaca Al-Quran ${s.quran}x — Bulan Ramadan bulan Al-Quran!`);
  if(s.tasbih>0) rows.push(`🤲 Berzikir ${s.tasbih}x dengan tasbih.`);
  if(s.helped>0) rows.push(`🤝 Menolong ${s.helped}x — Membantu orang lain amat mulia!`);
  if(s.marah>0) rows.push(`💢 Terlanggar ${s.marah}x Marah — Awas, marah meleburkan pahala puasa!`);
  if(s.distraksi>0) rows.push(`📱 Leka ${s.distraksi}x dengan telefon — Jauhi distraksi semasa puasa!`);
  if(s.junk>0) rows.push(`🍔 Terlanggar ${s.junk}x makanan — Ingat adab menjaga puasa!`);
  if(s.ran>0) rows.push(`🏃 Memilih terus lari ${s.ran}x tanpa menolong.`);
  if(rows.length===0) rows.push("Teruskan berlatih untuk kutip lebih banyak amalan!");
  rows.forEach(r=>{
    const d = document.createElement("div");
    d.textContent = "• "+r;
    list.appendChild(d);
  });
}

/* ============================================================
   16. CERTIFICATE SCREENSHOT (canvas-rendered, no library)
============================================================ */
function saveCertificate(){
  const w=600,h=800;
  const c = document.createElement("canvas");
  c.width=w; c.height=h;
  const g = c.getContext("2d");

  const grad = g.createLinearGradient(0,0,0,h);
  grad.addColorStop(0,"#1B1035"); grad.addColorStop(1,"#5A2E8C");
  g.fillStyle=grad; g.fillRect(0,0,w,h);

  g.textAlign="center";
  g.fillStyle="#FFC93C";
  g.font="bold 30px 'Baloo 2', sans-serif";
  g.fillText("🌟 SIJIL WIRA RAMADAN 🌟", w/2, 90);

  // card
  g.fillStyle="#fff8e8";
  roundRectCtx(g, 60,140, w-120, h-280, 20, "#fff8e8");
  g.strokeStyle="#FFC93C"; g.lineWidth=5;
  g.strokeRect(60,140,w-120,h-280);

  g.fillStyle="#A9750C";
  g.font="bold 34px 'Baloo 2', sans-serif";
  g.fillText(state.playerName || "Adam", w/2, 230);

  g.fillStyle="#4A2E0A";
  g.font="bold 24px 'Nunito', sans-serif";
  g.fillText(rankFor(state.pahala), w/2, 280);

  g.font="20px 'Nunito', sans-serif";
  g.fillText("🌙 Pahala: " + Math.round(state.pahala) + " pt", w/2, 350);
  g.fillText("❤️ Baki Tenaga: " + Math.round(state.energy) + "%", w/2, 385);
  g.fillText("📍 Jarak: " + Math.min(2000,Math.round(state.distance)) + "m", w/2, 420);

  g.font="16px 'Nunito', sans-serif";
  g.fillStyle="#6B4A1E";
  g.fillText("Dash to Iftar 🌙 — Kejar Maghrib!", w/2, h-220);

  g.fillStyle="#FFF6E9";
  g.font="42px sans-serif";
  g.fillText("🏮 🕌 🏮", w/2, h-140);

  const link = document.createElement("a");
  link.download = `Sijil-Wira-Ramadan-${(state.playerName||"Adam").replace(/\s+/g,"_")}.png`;
  link.href = c.toDataURL("image/png");
  link.click();
}
function roundRectCtx(g,x,y,w,h,r,fill){
  g.beginPath();
  g.moveTo(x+r,y);
  g.arcTo(x+w,y,x+w,y+h,r);
  g.arcTo(x+w,y+h,x,y+h,r);
  g.arcTo(x,y+h,x,y,r);
  g.arcTo(x,y,x+w,y,r);
  g.closePath();
  if(fill){ g.fillStyle=fill; g.fill(); }
}

/* ============================================================
   16b. ANIMASI KELUARGA DI MEJA MAKAN (procedural, win only)
============================================================ */
let familyAnim = null;
function startFamilyScene(won){
  if(familyAnim) cancelAnimationFrame(familyAnim);
  const fc = $("family-canvas");
  const fg = fc.getContext("2d");
  const fw = fc.width, fh = fc.height;
  let tt = 0;

  function drawPerson(g,x,y,color,armPhase){
    g.save(); g.translate(x,y);
    g.fillStyle = color;
    g.beginPath(); g.arc(0,-26,10,0,Math.PI*2); g.fill(); // head
    roundRectCtx(g,-11,-16,22,28,6,color); // body
    g.strokeStyle = color; g.lineWidth=5; g.lineCap="round";
    g.beginPath();
    g.moveTo(-11,-6); g.lineTo(-20,-2+armPhase);
    g.moveTo(11,-6); g.lineTo(20,-2-armPhase);
    g.stroke();
    g.restore();
  }

  function frame(){
    tt += 0.05;
    fg.clearRect(0,0,fw,fh);

    if(!won){
      // ringkas: langit gelap, mihrab kosong, ajakan cuba lagi
      const gr = fg.createLinearGradient(0,0,0,fh);
      gr.addColorStop(0,"#2b1b46"); gr.addColorStop(1,"#160e2c");
      fg.fillStyle = gr; fg.fillRect(0,0,fw,fh);
      fg.font = "40px sans-serif"; fg.textAlign="center"; fg.textBaseline="middle";
      fg.fillText("🥲", fw/2, fh/2-6);
      familyAnim = null;
      return;
    }

    // langit malam ungu + bintang
    const gr = fg.createLinearGradient(0,0,0,fh);
    gr.addColorStop(0,"#2c1a4d"); gr.addColorStop(1,"#4a2b7a");
    fg.fillStyle = gr; fg.fillRect(0,0,fw,fh);
    for(let i=0;i<14;i++){
      const sx = (i*37)%fw, sy=(i*53)%(fh*0.5);
      fg.globalAlpha = 0.4+Math.sin(tt+i)*0.4;
      fg.fillStyle="#fff";
      fg.beginPath(); fg.arc(sx,sy,1.4,0,Math.PI*2); fg.fill();
    }
    fg.globalAlpha=1;

    // siluet menara masjid kecil
    fg.fillStyle = "rgba(20,10,40,0.8)";
    fg.fillRect(fw-40, fh*0.15, 6,50);
    fg.beginPath(); fg.arc(fw-37, fh*0.15, 6,0,Math.PI*2); fg.fill();

    // meja
    fg.fillStyle = "#6B4A2E";
    roundRectCtx(fg, fw*0.15, fh*0.72, fw*0.7, 10, 4, "#6B4A2E");
    fg.fillRect(fw*0.2, fh*0.74, 6, fh*0.2);
    fg.fillRect(fw*0.75, fh*0.74, 6, fh*0.2);

    // hidangan di atas meja
    fg.font="16px sans-serif"; fg.textAlign="center";
    fg.fillText("🍽️", fw*0.3, fh*0.70);
    fg.fillText("🌴", fw*0.5, fh*0.70);
    fg.fillText("🍲", fw*0.7, fh*0.70);

    // keluarga (ayah, ibu, Adam) duduk di sekeliling meja — lengan bergerak (makan/berbual)
    const armPhase = Math.sin(tt*2)*3;
    drawPerson(fg, fw*0.28, fh*0.68, "#3E7CB1", armPhase);
    drawPerson(fg, fw*0.5, fh*0.68, "#D96B8A", -armPhase);
    drawPerson(fg, fw*0.72, fh*0.68, "#F2C79E", armPhase*0.7);

    // tanglung Ramadan berayun + berkelip
    const swing = Math.sin(tt*1.3)*6;
    fg.save();
    fg.translate(fw*0.15, fh*0.18);
    fg.rotate(swing*Math.PI/180);
    fg.strokeStyle="rgba(255,255,255,0.4)"; fg.lineWidth=1;
    fg.beginPath(); fg.moveTo(0,-14); fg.lineTo(0,0); fg.stroke();
    fg.fillStyle = `rgba(255,${180+Math.sin(tt*3)*40},60,0.95)`;
    roundRectCtx(fg,-9,0,18,22,7, fg.fillStyle);
    fg.fillStyle="rgba(255,220,150,0.9)";
    fg.fillRect(-2,20,4,6);
    fg.restore();

    familyAnim = requestAnimationFrame(frame);
  }
  frame();
}

/* ============================================================
   17. INPUT
============================================================ */
function firstTouchUnlock(){
  synth.unlock();
  window.removeEventListener("pointerdown", firstTouchUnlock);
  window.removeEventListener("keydown", firstTouchUnlock);
}
window.addEventListener("pointerdown", firstTouchUnlock, {once:true});
window.addEventListener("keydown", firstTouchUnlock, {once:true});

document.addEventListener("keydown",(e)=>{
  if(state.screen!=="game" || state.paused) return;
  if(e.code==="Space" || e.code==="ArrowUp"){ e.preventDefault(); jump(); }
  if(e.code==="ArrowDown"){ e.preventDefault(); slide(); }
});

$("btn-jump").addEventListener("pointerdown",()=>{ if(!state.paused) jump(); });
$("btn-slide").addEventListener("pointerdown",()=>{ if(!state.paused) slide(); });

// tap-left / tap-right on canvas as alt control
canvas.addEventListener("pointerdown",(e)=>{
  if(state.paused) return;
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  if(x < rect.width/2) jump(); else slide();
});

$("btn-choice-left").addEventListener("click", ()=> resolveDilemma(true));
$("btn-choice-right").addEventListener("click", ()=> resolveDilemma(false));

$("btn-mute").addEventListener("click", ()=>{
  synth.unlock();
  const m = !synth.muted;
  synth.setMute(m);
  $("btn-mute").textContent = m ? "🔇" : "🔊";
});

$("btn-start").addEventListener("click", ()=>{
  synth.unlock();
  const nameVal = $("input-name").value.trim();
  state.playerName = nameVal || "Adam";
  startGame();
});
$("input-name").addEventListener("keydown",(e)=>{ if(e.key==="Enter") $("btn-start").click(); });

$("btn-restart").addEventListener("click", ()=>{
  if(familyAnim){ cancelAnimationFrame(familyAnim); familyAnim=null; }
  showScreen("name");
});
$("btn-screenshot").addEventListener("click", saveCertificate);

/* ============================================================
   18. INIT
============================================================ */
resize();
showScreen("name");

})();
