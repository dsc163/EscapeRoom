'use strict';
/* =====================================================================
   ENGINE: rng, materials, textures, audio, item / prop / furniture models
   ===================================================================== */
const TAU = Math.PI * 2;
const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
class RNG {
  constructor(s) { this.f = mulberry32(s >>> 0); }
  next() { return this.f(); }
  range(a, b) { return a + this.f() * (b - a); }
  int(a, b) { return a + Math.floor(this.f() * (b - a + 1)); }
  pick(a) { return a[Math.floor(this.f() * a.length)]; }
  chance(p) { return this.f() < p; }
  shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.f() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  weighted(list) { let s = 0; for (const [, w] of list) s += w; let r = this.f() * s; for (const [v, w] of list) { r -= w; if (r <= 0) return v; } return list[list.length - 1][0]; }
}

const PAL = {
  red: { hex: 0xe0393e, css: '#e0393e' }, blue: { hex: 0x3b6cff, css: '#3b6cff' }, green: { hex: 0x2ec45a, css: '#2ec45a' },
  yellow: { hex: 0xf3cc2c, css: '#f3cc2c' }, purple: { hex: 0xa45cff, css: '#a45cff' }, orange: { hex: 0xff8a26, css: '#ff8a26' },
  cyan: { hex: 0x26d3e6, css: '#26d3e6' }, pink: { hex: 0xff6fb8, css: '#ff6fb8' }, white: { hex: 0xf4f4f4, css: '#f4f4f4' },
  rusty: { hex: 0x7a4a2a, css: '#9a6a4a' }
};
const PAL_NAMES = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'cyan', 'pink'];
const SEQ_COLORS = ['red', 'green', 'blue', 'yellow'];
const SYMBOLS = ['★', '●', '▲', '■', '♦', '✚'];
const SYMBOL_COLORS = ['#ffd34a', '#ff6a5a', '#6ad1ff', '#8cff7a', '#ff8ae0', '#ffffff'];

/* ---------- materials & geometry caches ---------- */
const _mats = {}, _geo = {};
function M(color, o = {}) {
  const k = [color, o.r ?? .75, o.m ?? 0, o.e ?? 0, o.map ? o.map.uuid : '', o.op ?? 1, o.flat ? 1 : 0].join('|');
  if (_mats[k]) return _mats[k];
  const m = new THREE.MeshStandardMaterial({ color, roughness: o.r ?? .75, metalness: o.m ?? 0, flatShading: !!o.flat });
  if (o.e) { m.emissive = new THREE.Color(color); m.emissiveIntensity = o.e; }
  if (o.map) m.map = o.map;
  if (o.op !== undefined && o.op < 1) { m.transparent = true; m.opacity = o.op; }
  return _mats[k] = m;
}
const BASIC = c => _mats['basic' + c] || (_mats['basic' + c] = new THREE.MeshBasicMaterial({ color: c }));
function gBox(w, h, d) { const k = 'b' + w + ',' + h + ',' + d; return _geo[k] || (_geo[k] = new THREE.BoxGeometry(w, h, d)); }
function gCyl(rt, rb, h, s = 20) { const k = 'c' + [rt, rb, h, s]; return _geo[k] || (_geo[k] = new THREE.CylinderGeometry(rt, rb, h, s)); }
function gTorus(r, t) { const k = 't' + r + ',' + t; return _geo[k] || (_geo[k] = new THREE.TorusGeometry(r, t, 8, 24)); }
function gSphere(r) { const k = 's' + r; return _geo[k] || (_geo[k] = new THREE.SphereGeometry(r, 16, 12)); }
function mesh(geo, mat, x = 0, y = 0, z = 0, parent) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; if (parent) parent.add(m); return m; }
function box(w, h, d, mat, x, y, z, p) { return mesh(gBox(w, h, d), mat, x, y, z, p); }
function cyl(rt, rb, h, mat, x, y, z, p, s) { return mesh(gCyl(rt, rb, h, s), mat, x, y, z, p); }
function plane(w, h, mat, x, y, z, p) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.receiveShadow = true; if (p) p.add(m); return m; }
function tagRef(obj, ref) { obj.userData.ref = ref; return obj; }
function findRef(o) { while (o) { if (o.userData && o.userData.ref) return o.userData.ref; o = o.parent; } return null; }

/* ---------- canvas textures ---------- */
const ROOM_TEX = []; // disposed when room is rebuilt
function ctex(w, h, draw, rx = 1, ry = 1, keep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
  t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; if (!keep) ROOM_TEX.push(t); return t;
}
const R = Math.random;
function shade(hex, l) { const n = parseInt(hex.slice(1), 16); const f = v => clamp(Math.round(v + l), 0, 255); return `rgb(${f(n >> 16)},${f(n >> 8 & 255)},${f(n & 255)})`; }
function speckle(g, w, h, n, a) { for (let i = 0; i < n; i++) { g.fillStyle = R() < .5 ? `rgba(0,0,0,${a * R()})` : `rgba(255,255,255,${a * R() * .6})`; g.fillRect(R() * w, R() * h, 1 + R() * 2, 1 + R() * 2); } }
function texPlanks(base) {
  return ctex(512, 512, (g, w, h) => {
    const rows = 6, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      let x = -R() * w * .5;
      while (x < w) {
        const len = w * (.4 + R() * .5); g.fillStyle = shade(base, (R() - .5) * 34); g.fillRect(x, r * rh, len, rh);
        for (let k = 0; k < 12; k++) { g.strokeStyle = `rgba(30,15,5,${.06 + R() * .12})`; g.lineWidth = .6 + R() * 1.4; g.beginPath(); const y = r * rh + R() * rh; g.moveTo(x, y); g.bezierCurveTo(x + len * .3, y + (R() - .5) * 8, x + len * .6, y + (R() - .5) * 8, x + len, y + (R() - .5) * 5); g.stroke(); }
        if (R() < .4) { g.fillStyle = 'rgba(40,20,8,.35)'; g.beginPath(); g.ellipse(x + R() * len, r * rh + R() * rh, 6, 3, 0, 0, TAU); g.fill(); }
        g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x, r * rh, 2, rh); x += len;
      }
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, r * rh, w, 2);
    }
    speckle(g, w, h, 1500, .08);
  });
}
function texWallpaper(base, accent) {
  return ctex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.fillStyle = accent;
    for (let i = 0; i < 4; i++) { g.globalAlpha = .3; g.fillRect(i * 64 + 30, 0, 4, h); g.globalAlpha = .14; g.fillRect(i * 64 + 22, 0, 2, h); g.fillRect(i * 64 + 40, 0, 2, h); }
    g.globalAlpha = .22;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const cx = i * 64, cy = j * 64 + (i % 2 ? 32 : 0);
      g.beginPath(); g.moveTo(cx, cy - 13); g.quadraticCurveTo(cx + 9, cy, cx, cy + 13); g.quadraticCurveTo(cx - 9, cy, cx, cy - 13); g.fill();
      g.beginPath(); g.arc(cx, cy, 3, 0, TAU); g.fill();
    }
    g.globalAlpha = 1; speckle(g, w, h, 900, .07);
  });
}
function texPlaster(base) { return ctex(256, 256, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); speckle(g, w, h, 3000, .08); }); }
function texGrain(base) {
  return ctex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 60; k++) { g.strokeStyle = `rgba(25,12,4,${.05 + R() * .12})`; g.lineWidth = .5 + R() * 2; g.beginPath(); const x = R() * w; g.moveTo(x, 0); g.bezierCurveTo(x + (R() - .5) * 20, h * .3, x + (R() - .5) * 20, h * .7, x + (R() - .5) * 10, h); g.stroke(); }
    speckle(g, w, h, 600, .06);
  });
}
function texRug(c1, c2, c3) {
  return ctex(512, 320, (g, w, h) => {
    g.fillStyle = c1; g.fillRect(0, 0, w, h);
    g.strokeStyle = c2; g.lineWidth = 14; g.strokeRect(20, 20, w - 40, h - 40);
    g.strokeStyle = c3; g.lineWidth = 4; g.strokeRect(42, 42, w - 84, h - 84);
    g.fillStyle = c2; g.globalAlpha = .7;
    for (let i = 0; i < 5; i++) { const cx = w / 2 + (i - 2) * 80, cy = h / 2; g.beginPath(); g.moveTo(cx, cy - 50); g.lineTo(cx + 30, cy); g.lineTo(cx, cy + 50); g.lineTo(cx - 30, cy); g.closePath(); g.fill(); }
    g.globalAlpha = 1; g.fillStyle = c3; for (let i = 0; i < 5; i++) { const cx = w / 2 + (i - 2) * 80; g.beginPath(); g.arc(cx, h / 2, 9, 0, TAU); g.fill(); }
    speckle(g, w, h, 4000, .12);
  });
}
function texArt(rng) {
  const hue = rng.int(0, 360), hue2 = (hue + rng.int(90, 200)) % 360, kind = rng.int(0, 2);
  return ctex(256, 200, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, `hsl(${hue},45%,62%)`); gr.addColorStop(1, `hsl(${hue2},40%,30%)`); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    if (kind === 0) { // landscape
      g.fillStyle = `hsl(${hue2 + 30},60%,80%)`; g.beginPath(); g.arc(w * .7, h * .3, 22, 0, TAU); g.fill();
      for (let l = 0; l < 3; l++) { g.fillStyle = `hsl(${hue2},${30 + l * 10}%,${40 - l * 10}%)`; g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 16) g.lineTo(x, h * (.5 + l * .15) + Math.sin(x * .03 + l * 2) * 18); g.lineTo(w, h); g.fill(); }
    } else if (kind === 1) { // abstract blocks
      for (let i = 0; i < 9; i++) { g.fillStyle = `hsla(${(hue + i * 40) % 360},55%,${40 + R() * 30}%,.8)`; g.fillRect(R() * w, R() * h, 20 + R() * 90, 20 + R() * 70); }
    } else { // portrait silhouette
      g.fillStyle = `hsl(${hue2},25%,18%)`; g.beginPath(); g.arc(w / 2, h * .42, 34, 0, TAU); g.fill(); g.beginPath(); g.ellipse(w / 2, h + 10, 70, 75, 0, Math.PI, TAU); g.fill();
    }
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(0,0,0,${R() * .08})`; g.fillRect(R() * w, R() * h, 2, 2); }
  });
}
/* draws a clue graphic (digits / symbols / colors / levers) into a canvas region */
function wrapText(g, text, cx, y, maxW, lh) {
  const words = text.split(' '); let line = '', yy = y;
  for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { g.fillText(line, cx, yy); line = w; yy += lh; } else line = t; }
  g.fillText(line, cx, yy);
}
function drawClue(g, clue, x, y, w, h, fg) {
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (clue.type === 'text') { g.fillStyle = fg; g.font = `italic ${h * .16}px Georgia,serif`; wrapText(g, clue.value, x + w / 2, y + h * .12, w * .95, h * .2); return; }
  if (clue.type === 'cipher') {
    g.fillStyle = fg; g.font = `bold ${h * .2}px Georgia,serif`;
    for (let i = 0; i < 9; i++) g.fillText(`${'ABCDEFGHI'[i]} = ${i + 1}`, x + w * (i % 3 + .5) / 3, y + h * ((i / 3 | 0) + .5) / 3);
    return;
  }
  if (clue.type === 'colororder') {
    const n = clue.value.length, cw = w / n;
    clue.value.forEach((c, i) => { const s = Math.min(cw, h) * .55, cx = x + cw * (i + .5), cy = y + h / 2; g.fillStyle = PAL[c].css; g.fillRect(cx - s / 2, cy - s / 2, s, s); g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 3; g.strokeRect(cx - s / 2, cy - s / 2, s, s); if (i < n - 1) { g.fillStyle = fg === 'uv' ? '#fff' : fg; g.font = `${s * .5}px sans-serif`; g.fillText('→', cx + cw / 2, cy); } });
    return;
  }
  const n = clue.value.length, cw = w / n;
  for (let i = 0; i < n; i++) {
    const v = clue.value[i], cx = x + cw * (i + .5), cy = y + h / 2, s = Math.min(cw, h) * .8;
    if (clue.type === 'digits') { g.fillStyle = fg; g.font = `bold ${s}px Georgia,serif`; g.fillText(clue.partial && clue.partial[i] === null ? '_' : String(v), cx, cy); }
    else if (clue.type === 'symbols') { g.fillStyle = fg === 'uv' ? '#e9d4ff' : SYMBOL_COLORS[v]; g.font = `${s}px "Segoe UI Symbol",sans-serif`; g.fillText(SYMBOLS[v], cx, cy); }
    else if (clue.type === 'colors') { g.fillStyle = PAL[SEQ_COLORS[v]].css; g.fillRect(cx - s * .38, cy - s * .38, s * .76, s * .76); g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 3; g.strokeRect(cx - s * .38, cy - s * .38, s * .76, s * .76); }
    else if (clue.type === 'levers') { g.fillStyle = fg; g.font = `bold ${s}px sans-serif`; g.fillText(v ? '▲' : '▼', cx, cy); }
  }
}
function clueHTML(clue) {
  const v = clue.value;
  if (clue.type === 'digits') return `<span class="big">${v.map((d, i) => clue.partial && clue.partial[i] === null ? '_' : d).join(' ')}</span>`;
  if (clue.type === 'symbols') return `<span class="big">${v.map(s => `<span style="color:${SYMBOL_COLORS[s]};text-shadow:0 0 2px #000">${SYMBOLS[s]}</span>`).join(' ')}</span>`;
  if (clue.type === 'colors') return `<span class="big">${v.map(c => `<span class="sq" style="background:${PAL[SEQ_COLORS[c]].css}"></span>`).join('')}</span>`;
  if (clue.type === 'levers') return `<span class="big">${v.map(u => u ? '▲' : '▼').join(' ')}</span><br><small>(▲ = lever up, ▼ = lever down, left to right)</small>`;
  if (clue.type === 'text') return `<p class="riddle">“${v}”</p>`;
  if (clue.type === 'word') return `<span class="big">${v.split('').join(' ')}</span>`;
  if (clue.type === 'riddles') return `<div class="rl">${v.map(s => `<p>${s}</p>`).join('')}</div>`;
  if (clue.type === 'cipher') return `<table class="ci">${[0, 1, 2].map(r => `<tr>${[0, 1, 2].map(c => `<td>${'ABCDEFGHI'[r * 3 + c]} = ${r * 3 + c + 1}</td>`).join('')}</tr>`).join('')}</table>`;
  if (clue.type === 'colororder') return `<span class="big">${v.map(c => `<span class="sq" style="background:${PAL[c].css}"></span>`).join('→')}</span>`;
  return '';
}
const _labelCache = {};
function labelTex(text, fg = '#ddd', bg = null, size = 64) {
  const k = text + fg + bg + size; if (_labelCache[k]) return _labelCache[k];
  return _labelCache[k] = ctex(size, size, (g, w, h) => {
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
    g.fillStyle = fg; g.font = `bold ${h * .62}px "Segoe UI Symbol",Arial,sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2);
  }, 1, 1, true);
}

/* ---------- audio (fully synthesized) ---------- */
const Snd = (() => {
  let ac, master, muted = false, nb;
  function env(g, t, a, d, v) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + d); }
  function tone(f, d = .15, type = 'sine', v = .2, f2, delay = 0) {
    if (!ac) return; const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    env(g, t, .005, d, v); o.connect(g); g.connect(master); o.start(t); o.stop(t + d + .05);
  }
  function noise(d = .1, v = .2, freq = 1200, q = 1, type = 'bandpass', delay = 0) {
    if (!ac) return;
    if (!nb) { nb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); const a = nb.getChannelData(0); for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1; }
    const t = ac.currentTime + delay, s = ac.createBufferSource(); s.buffer = nb; const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain(); env(g, t, .004, d, v); s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + d + .05);
  }
  function ambient() {
    const o1 = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
    o1.frequency.value = 55; o2.frequency.value = 82.4; o1.type = o2.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 160;
    g.gain.value = .03; o1.connect(f); o2.connect(f); f.connect(g); g.connect(master); o1.start(); o2.start();
    const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = .06; lg.gain.value = .018; lfo.connect(lg); lg.connect(g.gain); lfo.start();
    (function drip() { tone(1500 + Math.random() * 1500, .09, 'sine', .025, 500); setTimeout(drip, 5000 + Math.random() * 9000); })();
    let tk = 0; setInterval(() => { if (Snd.clockOn) { tone(tk++ % 2 ? 2400 : 2000, .02, 'square', .012); } }, 1000);
  }
  return {
    clockOn: false,
    init() { if (ac) { if (ac.state === 'suspended') ac.resume(); return; } ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = .6; master.connect(ac.destination); ambient(); },
    toggle() { muted = !muted; if (master) master.gain.value = muted ? 0 : .6; return muted; },
    btn() { tone(1100, .05, 'square', .06); noise(.03, .1, 3000); },
    pickup() { tone(480, .08, 'triangle', .14, 900); noise(.05, .08, 2500); },
    drop() { noise(.12, .3, 300, 1, 'lowpass'); tone(140, .1, 'sine', .15, 80); },
    open() { noise(.5, .1, 500, 2); tone(190, .4, 'sawtooth', .025, 130); },
    drawer() { noise(.3, .18, 800, .7); },
    locked() { noise(.06, .3, 800); noise(.06, .25, 600, 1, 'bandpass', .1); },
    unlock() { tone(600, .07, 'square', .1); tone(900, .1, 'square', .1, undefined, .08); noise(.08, .2, 2000, 1, 'bandpass', .05); },
    error() { tone(170, .28, 'square', .1, 110); },
    good() { tone(880, .08, 'triangle', .1); tone(1320, .12, 'triangle', .1, undefined, .07); },
    success() { [523, 659, 784, 1046].forEach((f, i) => tone(f, .3, 'triangle', .13, undefined, i * .09)); },
    insert() { tone(300, .05, 'square', .1); noise(.08, .2, 1500, 1, 'bandpass', .04); tone(200, .1, 'triangle', .15, undefined, .06); },
    step() { noise(.07, .06, 300 + Math.random() * 150, 1.2, 'bandpass'); },
    lever() { noise(.08, .25, 700); tone(120, .12, 'square', .07, 80); },
    door() { noise(1.4, .3, 220, 1, 'lowpass'); tone(70, 1.2, 'sawtooth', .05, 45); },
    paper() { noise(.18, .14, 4000, .5, 'highpass'); },
    pry() { noise(.3, .35, 400, 2); tone(90, .3, 'sawtooth', .08, 60); noise(.15, .3, 1800, 1, 'bandpass', .25); },
    click() { tone(2200, .02, 'square', .05); },
    win() { [392, 523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, .6, 'triangle', .12, undefined, i * .12)); },
  };
})();

/* =====================================================================
   ITEMS (small, go into hotbar) — origin at bottom center
   ===================================================================== */
const ITEMS = {
  key: {
    icon: '🔑', name: c => c + ' key', hold: { p: [0, .01, -.06], r: [-1.2, .5, 0] },
    build(c) {
      const g = new THREE.Group(), m = M(PAL[c].hex, { r: .3, m: .7, e: .25 });
      const ring = mesh(gTorus(.032, .011), m, 0, .011, -.055, g); ring.rotation.x = Math.PI / 2;
      box(.015, .015, .11, m, 0, .011, .025, g); box(.028, .012, .014, m, .012, .011, .062, g); box(.02, .012, .012, m, .009, .011, .075, g);
      return { obj: g, h: .022 };
    }
  },
  gem: {
    icon: '💎', name: c => c + ' gem', hold: { p: [0, .0, -.03], r: [0, 0, 0] },
    build(c) {
      const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: PAL[c].hex, emissive: PAL[c].hex, emissiveIntensity: .5, roughness: .15, metalness: .3, flatShading: true });
      const o = mesh(new THREE.OctahedronGeometry(.05), m, 0, .062, 0, g); o.scale.y = 1.25; return { obj: g, h: .125 };
    }
  },
  note: {
    icon: '📜', name: (c, p) => p.title || 'note', hold: { p: [0, .04, -.07], r: [1.25, 0, 0] },
    build(c, p) {
      const g = new THREE.Group(); box(p.scrap ? .12 : .17, .004, p.scrap ? .14 : .22, M(p.scrap ? 0xe6d6a8 : 0xf1e8cf, { r: .95 }), 0, .002, 0, g);
      for (let i = 0; i < (p.scrap ? 3 : 6); i++) box(p.scrap ? .08 : .12, .001, .005, M(0x2a2a3a), (Math.random() - .5) * .01, .0045, -.07 + i * .028, g);
      return { obj: g, h: .005 };
    }
  },
  uv: {
    icon: '🔦', name: () => 'UV flashlight', hold: { p: [.01, -.01, -.02], r: [.05, 0, 0] },
    build() {
      const g = new THREE.Group();
      const b = cyl(.026, .022, .2, M(0x2a1f3d, { r: .4, m: .4 }), 0, .028, 0, g); b.rotation.x = Math.PI / 2;
      const l = cyl(.034, .028, .045, M(0x3e2d63, { r: .3, m: .5 }), 0, .034, -.115, g); l.rotation.x = Math.PI / 2;
      const lens = cyl(.027, .027, .006, BASIC(0xb070ff), 0, .034, -.14, g); lens.rotation.x = Math.PI / 2;
      box(.012, .01, .03, M(0x111111), 0, .052, .02, g);
      return { obj: g, h: .068 };
    }
  },
  crowbar: {
    icon: '🔧', name: () => 'crowbar', hold: { p: [0, -.02, -.1], r: [-.35, 0, 0] },
    build() {
      const g = new THREE.Group(), m = M(0xb3221e, { r: .5, m: .5 });
      box(.03, .03, .55, m, 0, .015, 0, g);
      const h = box(.03, .03, .1, M(0x9a9a9a, { m: .8, r: .35 }), 0, .045, -.3, g); h.rotation.x = .9;
      const t = box(.03, .03, .07, M(0x9a9a9a, { m: .8, r: .35 }), 0, .02, .3, g); t.rotation.x = -.25;
      return { obj: g, h: .07 };
    }
  },
  card: {
    icon: '🃏', name: (c) => c + ' number card', hold: { p: [0, .04, -.07], r: [1.25, 0, 0] },
    build(c, p) {
      const g = new THREE.Group(), t = ctex(128, 160, (x, w, h) => { x.fillStyle = '#f6f0e0'; x.fillRect(0, 0, w, h); x.strokeStyle = PAL[c].css; x.lineWidth = 16; x.strokeRect(8, 8, w - 16, h - 16); x.fillStyle = '#1a1a1a'; x.font = 'bold 96px Georgia'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(p.digit, w / 2, h / 2 + 4); x.fillRect(w / 2 - 22, h - 34, 44, 4); });
      box(.1, .004, .125, M(PAL[c].hex, { r: .8 }), 0, .002, 0, g);
      const pl = plane(.094, .118, new THREE.MeshStandardMaterial({ map: t, roughness: .9 }), 0, .0045, 0, g); pl.rotation.x = -Math.PI / 2;
      return { obj: g, h: .005 };
    }
  },
  book: {
    icon: '📖', name: (c, p) => `book: “${p.title}”`, hold: { p: [0, -.02, -.04], r: [.6, .2, 0] },
    build(c, p) {
      const g = new THREE.Group(), col = [0x7a1f1f, 0x1f3f7a, 0x2f5a2a, 0x5a3a1a, 0x4a2a5a, 0x6a5a1a][(p.title || '').length % 6];
      box(.16, .04, .22, M(col, { r: .8 }), 0, .02, 0, g); box(.15, .032, .005, M(0xe8dcc0), 0, .02, .11, g); box(.15, .032, .005, M(0xe8dcc0), .078, .02, 0, g).scale.set(1, 1, 1);
      box(.02, .041, .221, M(0xc9a24a, { m: .6, r: .4 }), -.07, .02, 0, g);
      return { obj: g, h: .04 };
    }
  },
  /* junk / decoys */
  dice: { icon: '🎲', junk: 1, name: () => 'pair of dice', hold: { p: [0, -.01, -.05], r: [.3, .3, 0] }, build() { const g = new THREE.Group(); box(.03, .03, .03, M(0xf2f2f2, { r: .4 }), 0, .015, 0, g).rotation.y = .3; box(.03, .03, .03, M(0xd03030, { r: .4 }), .045, .015, .01, g).rotation.y = -.5; return { obj: g, h: .03 }; } },
  glasses: { icon: '👓', junk: 1, name: () => 'reading glasses', hold: { p: [0, 0, -.05], r: [0, 0, 0] }, build() { const g = new THREE.Group(), m = M(0x222222, { r: .4, m: .5 }); for (const x of [-.032, .032]) { const t = mesh(gTorus(.024, .004), m, x, .025, 0, g); } box(.02, .004, .004, m, 0, .025, 0, g); box(.004, .004, .1, m, -.058, .025, -.05, g); box(.004, .004, .1, m, .058, .025, -.05, g); return { obj: g, h: .05 }; } },
  coin: { icon: '🪙', junk: 1, name: () => 'old coin', hold: { p: [0, .02, -.06], r: [1.2, 0, 0] }, build() { const g = new THREE.Group(); cyl(.026, .026, .005, M(0xd4a64a, { m: .9, r: .3 }), 0, .0025, 0, g); return { obj: g, h: .005 }; } },
  mug: { icon: '☕', junk: 1, name: () => 'coffee mug', hold: { p: [0, -.04, -.03], r: [0, 0, 0] }, build() { const g = new THREE.Group(), m = M(0xe8e2d6, { r: .4 }); cyl(.042, .038, .1, m, 0, .05, 0, g); cyl(.036, .036, .005, M(0x2a170c), 0, .095, 0, g); const h = mesh(gTorus(.025, .007), m, .05, .055, 0, g); return { obj: g, h: .1 }; } },
  candle: { icon: '🕯️', junk: 1, name: () => 'candle', hold: { p: [0, -.06, -.03], r: [0, 0, 0] }, build() { const g = new THREE.Group(); cyl(.022, .024, .14, M(0xeee3c4, { r: .7 }), 0, .07, 0, g); const f = mesh(gSphere(.01), BASIC(0xffc860), 0, .152, 0, g); f.scale.y = 1.8; f.castShadow = false; return { obj: g, h: .16 }; } },
  bottle: { icon: '🍾', junk: 1, name: () => 'empty bottle', hold: { p: [0, -.08, -.03], r: [0, 0, 0] }, build() { const g = new THREE.Group(), m = M(0x2f6b3a, { r: .1, m: .1, op: .85 }); cyl(.032, .034, .16, m, 0, .08, 0, g); cyl(.012, .03, .05, m, 0, .185, 0, g); cyl(.013, .013, .04, m, 0, .23, 0, g); return { obj: g, h: .25 }; } },
};

/* =====================================================================
   PROPS (big, carried with both hands, can hide things underneath)
   ===================================================================== */
const PROPS = {
  pot: {
    name: 'potted plant', build() {
      const g = new THREE.Group(); cyl(.2, .15, .34, M(0xa4552e, { r: .85 }), 0, .17, 0, g); cyl(.225, .225, .05, M(0xb5653a, { r: .8 }), 0, .335, 0, g); cyl(.2, .2, .02, M(0x3b2a1a, { r: 1 }), 0, .35, 0, g);
      const lm = M(0x2f7a35, { r: .7, flat: true });
      for (let i = 0; i < 7; i++) { const l = mesh(new THREE.ConeGeometry(.06, .4, 5), lm, 0, .5, 0, g); const a = i / 7 * TAU; l.position.set(Math.cos(a) * .08, .52, Math.sin(a) * .08); l.rotation.set(Math.sin(a) * .5, 0, -Math.cos(a) * .5); }
      return { obj: g, h: .7 };
    }
  },
  box: {
    name: 'cardboard box', build() {
      const g = new THREE.Group(); box(.42, .34, .42, M(0xb08a55, { r: .95 }), 0, .17, 0, g); box(.43, .006, .08, M(0xd6c79c, { r: .6 }), 0, .343, 0, g);
      box(.2, .004, .1, M(0x222222), .08, .25, .211, g); return { obj: g, h: .35 };
    }
  },
  bucket: {
    name: 'metal bucket', build() {
      const g = new THREE.Group(), m = M(0x8d949c, { m: .7, r: .35 }); cyl(.19, .15, .32, m, 0, .16, 0, g); const t = mesh(gTorus(.19, .008), m, 0, .32, 0, g); t.rotation.x = Math.PI / 2;
      const h = mesh(new THREE.TorusGeometry(.18, .006, 6, 20, Math.PI), M(0x444444, { m: .8 }), 0, .32, 0, g); return { obj: g, h: .5 };
    }
  },
  vase: {
    name: 'vase', build() {
      const g = new THREE.Group(), c = [0x2a5a8a, 0x8a3a2a, 0xd8d0c0, 0x3a6a4a][Math.random() * 4 | 0], m = M(c, { r: .25, m: .1 });
      const pts = [[.0, 0], [.13, 0], [.17, .12], [.15, .28], [.08, .4], [.07, .46], [.1, .5]].map(([x, y]) => new THREE.Vector2(x, y));
      mesh(new THREE.LatheGeometry(pts, 18), m, 0, 0, 0, g).material.side = THREE.DoubleSide; return { obj: g, h: .5 };
    }
  },
  books: {
    name: 'stack of books', build() {
      const g = new THREE.Group(); let y = 0; const cs = [0x7a1f1f, 0x1f3f7a, 0x2f5a2a, 0x5a3a1a, 0x4a2a5a];
      for (let i = 0; i < 5; i++) { const h = .04 + Math.random() * .03; box(.3 - Math.random() * .06, h, .38 - Math.random() * .06, M(cs[i], { r: .85 }), (Math.random() - .5) * .03, y + h / 2, 0, g).rotation.y = (Math.random() - .5) * .3; y += h; }
      return { obj: g, h: y };
    }
  },
  basket: {
    name: 'wicker basket', build() {
      const g = new THREE.Group(), m = M(0xa8834a, { r: 1 }); cyl(.21, .17, .26, m, 0, .13, 0, g, 14); const t = mesh(gTorus(.21, .015), M(0x8a6a3a, { r: 1 }), 0, .26, 0, g); t.rotation.x = Math.PI / 2;
      cyl(.18, .18, .01, M(0x3a2a1a), 0, .24, 0, g); return { obj: g, h: .27 };
    }
  },
  globe: {
    name: 'desk globe', build() {
      const g = new THREE.Group(); cyl(.1, .12, .03, M(0x5a3a1a, { r: .5 }), 0, .015, 0, g); cyl(.012, .012, .12, M(0xb8923e, { m: .8, r: .3 }), 0, .08, 0, g);
      const tex = ctex(128, 64, (x, w, h) => { x.fillStyle = '#2a5a8a'; x.fillRect(0, 0, w, h); x.fillStyle = '#c8b070'; for (let i = 0; i < 9; i++) { x.beginPath(); x.ellipse(Math.random() * w, Math.random() * h, 6 + Math.random() * 14, 4 + Math.random() * 10, 0, 0, TAU); x.fill(); } });
      mesh(new THREE.SphereGeometry(.15, 24, 16), new THREE.MeshStandardMaterial({ map: tex, roughness: .5 }), 0, .29, 0, g); return { obj: g, h: .44 };
    }
  },
  cushion: {
    name: 'cushion', build() {
      const g = new THREE.Group(), c = [0x7b2d3a, 0x2d4f7b, 0x6b5a2d, 0x3a6b4f][Math.random() * 4 | 0]; const b = box(.46, .13, .46, M(c, { r: 1 }), 0, .065, 0, g);
      box(.47, .02, .02, M(0xc9a24a, { m: .6, r: .4 }), 0, .065, .23, g); box(.47, .02, .02, M(0xc9a24a, { m: .6, r: .4 }), 0, .065, -.23, g); return { obj: g, h: .13 };
    }
  },
};

/* =====================================================================
   FURNITURE — origin at floor center, front faces +Z
   ===================================================================== */
class Comp {
  constructor(kind, name) { this.type = 'comp'; this.kind = kind; this.name = name; this.parts = []; this.slots = []; this.slotUsed = 0; this.lock = null; this.open = false; this.t = 0; this.oneWay = false; this.mount = null; this.sound = 'open'; }
  addPart(obj, prop, axis, to) { this.parts.push({ obj, prop, axis, from: obj[prop][axis], to }); }
  update(dt) {
    const tgt = this.open ? 1 : 0; if (this.t === tgt) return false;
    this.t = tgt > this.t ? Math.min(1, this.t + dt * 1.8) : Math.max(0, this.t - dt * 1.8);
    const e = ease(this.t); for (const p of this.parts) p.obj[p.prop][p.axis] = p.from + (p.to - p.from) * e; return true;
  }
  nextSlot() { const s = this.slots[this.slotUsed % this.slots.length]; this.slotUsed++; return s; }
}
const FDIMS = { desk: [1.5, .7, .76], dresser: [.95, .5, .92], chest: [1.1, .62, .66], cabinet: [1.1, .5, 1.95], safe: [.8, .62, .9], bookshelf: [1.3, .34, 2.0], crate: [.9, .7, .62], table: [1.4, .8, .78] };

function fChest(S) {
  const [w, d] = FDIMS.chest, bh = .5, lh = .16, g = new THREE.Group(), c = new Comp('chest', 'chest');
  box(w, .04, d, S.dark, 0, .02, 0, g);
  box(w, bh, .04, S.wood, 0, bh / 2, d / 2 - .02, g); box(w, bh, .04, S.wood, 0, bh / 2, -d / 2 + .02, g);
  box(.04, bh, d - .08, S.wood, -w / 2 + .02, bh / 2, 0, g); box(.04, bh, d - .08, S.wood, w / 2 - .02, bh / 2, 0, g);
  for (const x of [-w / 2 + .12, w / 2 - .12]) box(.06, bh + .004, d + .012, S.metal, x, bh / 2, 0, g);
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) box(.05, .05, .05, S.brass, x, .03, z, g);
  const piv = new THREE.Group(); piv.position.set(0, bh, -d / 2); g.add(piv);
  box(w + .01, lh, d + .01, S.wood, 0, lh / 2, d / 2, piv);
  for (const x of [-w / 2 + .12, w / 2 - .12]) box(.062, lh + .006, d + .022, S.metal, x, lh / 2, d / 2, piv);
  box(.1, .06, .02, S.brass, 0, .0, d + .012, piv);
  c.addPart(piv, 'rotation', 'x', -1.9);
  c.mount = { parent: g, x: 0, y: bh * .5, z: d / 2 + .001, maxW: .8, maxH: .46 };
  for (const x of [-.3, 0, .3]) for (const z of [-.12, .1]) c.slots.push({ parent: g, x, y: .04, z });
  tagRef(g, c);
  return { group: g, comps: [c], spots: [], tall: false };
}
function fCrate(S) {
  const [w, d] = FDIMS.crate, bh = .5, g = new THREE.Group(), c = new Comp('crate', 'wooden crate'), pm = M(0x9c7a4c, { r: .9, map: S.grainTex });
  box(w, .03, d, S.dark, 0, .015, 0, g);
  for (let i = 0; i < 4; i++) { const y = .07 + i * .125; box(w, .11, .03, pm, 0, y, d / 2 - .015, g); box(w, .11, .03, pm, 0, y, -d / 2 + .015, g); box(.03, .11, d, pm, -w / 2 + .015, y, 0, g); box(.03, .11, d, pm, w / 2 - .015, y, 0, g); }
  for (const x of [-w / 2 + .04, w / 2 - .04]) box(.08, bh, .04, M(0x7a5a34, { r: .9 }), x, bh / 2, d / 2 + .005, g);
  const piv = new THREE.Group(); piv.position.set(0, bh, -d / 2); g.add(piv);
  for (let i = 0; i < 4; i++) box(w / 4 - .01, .04, d, pm, -w / 2 + w / 8 + i * w / 4, .02, d / 2, piv);
  box(w, .05, .08, M(0x7a5a34, { r: .9 }), 0, .045, d * .25, piv); box(w, .05, .08, M(0x7a5a34, { r: .9 }), 0, .045, d * .75, piv);
  c.addPart(piv, 'rotation', 'x', -1.95);
  c.mount = { parent: g, x: 0, y: bh * .55, z: d / 2 + .03, maxW: .8, maxH: .4 };
  for (const x of [-.25, .1]) for (const z of [-.1, .12]) c.slots.push({ parent: g, x, y: .03, z });
  tagRef(g, c);
  return { group: g, comps: [c], spots: [], tall: false };
}
function fCabinet(S) {
  const [w, d, h] = FDIMS.cabinet, g = new THREE.Group(), c = new Comp('cabinet', 'cabinet');
  box(w, h, .03, S.wood, 0, h / 2, -d / 2 + .015, g); box(.03, h, d, S.wood, -w / 2 + .015, h / 2, 0, g); box(.03, h, d, S.wood, w / 2 - .015, h / 2, 0, g);
  box(w, .04, d, S.wood, 0, h - .02, 0, g); box(w + .06, .06, d + .05, S.wood, 0, h + .03, .01, g); box(w, .1, d, S.dark, 0, .05, 0, g);
  for (const y of [.68, 1.25]) box(w - .06, .025, d - .05, S.wood, 0, y, -.01, g);
  box(w - .06, .4, .01, S.dark, 0, h - .3, -d / 2 + .04, g);
  const dh = h - .14, dw = w / 2 - .005;
  const L = new THREE.Group(); L.position.set(-w / 2, .1, d / 2); g.add(L);
  const Rr = new THREE.Group(); Rr.position.set(w / 2, .1, d / 2); g.add(Rr);
  for (const [P, s] of [[L, 1], [Rr, -1]]) {
    box(dw, dh, .03, S.wood, s * dw / 2, dh / 2, .015, P);
    box(dw - .12, dh * .4, .012, S.dark, s * dw / 2, dh * .72, .03, P); box(dw - .12, dh * .4, .012, S.dark, s * dw / 2, dh * .26, .03, P);
    const hd = cyl(.012, .012, .12, S.brass, s * (dw - .05), dh * .5, .05, P);
  }
  c.addPart(L, 'rotation', 'y', -1.95); c.addPart(Rr, 'rotation', 'y', 1.95);
  c.mount = { parent: Rr, x: -dw / 2, y: 1.0, z: .036, maxW: dw - .06, maxH: .5 };
  for (const y of [.1, .69, 1.265]) for (const x of [-.27, 0, .27]) c.slots.push({ parent: g, x, y: y + .0125, z: .02 });
  tagRef(g, c);
  return { group: g, comps: [c], spots: [], tall: true };
}
function fSafe(S) {
  const [w, d, h] = FDIMS.safe, t = .07, g = new THREE.Group(), c = new Comp('safe', 'safe'), st = S.steel;
  box(w, t, d, st, 0, t / 2, 0, g); box(w, t, d, st, 0, h - t / 2, 0, g); box(t, h, d, st, -w / 2 + t / 2, h / 2, 0, g); box(t, h, d, st, w / 2 - t / 2, h / 2, 0, g); box(w, h, t, st, 0, h / 2, -d / 2 + t / 2, g);
  box(w - 2 * t, .01, d - t, M(0x3a1e1e, { r: 1 }), 0, t + .005, 0, g);
  for (const x of [-w / 2 + .06, w / 2 - .06]) for (const z of [-d / 2 + .06, d / 2 - .06]) cyl(.03, .035, .04, S.dark, x, -.0, z, g);
  const D = new THREE.Group(); D.position.set(-w / 2, 0, d / 2); g.add(D);
  box(w, h, .07, S.steel2, w / 2, h / 2, .035, D);
  box(w - .08, h - .08, .01, st, w / 2, h / 2, .075, D);
  const wheel = new THREE.Group(); wheel.position.set(w * .27, h * .5, .09); D.add(wheel);
  const tr = mesh(gTorus(.08, .012), S.brass, 0, 0, 0, wheel);
  for (let i = 0; i < 3; i++) { const sp = box(.18, .016, .016, S.brass, 0, 0, 0, wheel); sp.rotation.z = i * Math.PI / 3; }
  for (const y of [.18, h - .18]) cyl(.025, .025, .14, S.dark, 0, y, .02, D);
  c.addPart(D, 'rotation', 'y', -1.75); c.sound = 'open';
  c.mount = { parent: D, x: w * .67, y: h * .5, z: .081, maxW: .36, maxH: .5 };
  for (const x of [-.16, .05, .2]) c.slots.push({ parent: g, x, y: t + .012, z: 0 });
  tagRef(g, c);
  return { group: g, comps: [c], spots: [{ x: 0, y: h, z: 0 }], tall: false };
}
function addDrawers(S, g0, ox, w, h, d, n, label) {
  const g = new THREE.Group(); g.position.x = ox; g0.add(g); const comps = [];
  box(w, h, .02, S.wood, 0, h / 2, -d / 2 + .01, g); box(.02, h, d, S.wood, -w / 2 + .01, h / 2, 0, g); box(.02, h, d, S.wood, w / 2 - .01, h / 2, 0, g);
  box(w, .03, d, S.wood, 0, h - .015, 0, g); box(w, .03, d, S.wood, 0, .075, 0, g); box(w - .04, .06, d - .04, S.dark, 0, .03, 0, g);
  const ch = (h - .09) / n;
  for (let i = 0; i < n; i++) {
    const y0 = .09 + i * ch; if (i > 0) box(w - .04, .015, d - .02, S.wood, 0, y0, 0, g);
    const dr = new THREE.Group(); dr.position.set(0, y0, 0); g.add(dr);
    const iw = w - .07, id = d - .06, ih = ch * .62;
    box(iw, .012, id, S.dark, 0, .012, 0, dr); box(.012, ih, id, S.wood, -iw / 2, ih / 2, 0, dr); box(.012, ih, id, S.wood, iw / 2, ih / 2, 0, dr); box(iw, ih, .012, S.wood, 0, ih / 2, -id / 2, dr);
    box(w - .03, ch - .02, .03, S.wood, 0, ch / 2, d / 2 - .005, dr);
    box(w - .1, ch - .08, .008, S.dark, 0, ch / 2, d / 2 + .012, dr);
    box(.14, .022, .03, S.brass, 0, ch * .66, d / 2 + .03, dr);
    const c = new Comp('drawer', label + (n > 1 ? (i === n - 1 ? ' (top drawer)' : i === 0 ? ' (bottom drawer)' : ' (middle drawer)') : ' drawer'));
    c.sound = 'drawer'; c.drawerGroup = dr; c.addPart(dr, 'position', 'z', d * .72);
    c.mount = { parent: dr, x: 0, y: ch * .33, z: d / 2 + .017, maxW: .2, maxH: ch * .5, small: true };
    for (const x of [-iw / 4, iw / 5]) c.slots.push({ parent: dr, x, y: .02, z: 0 });
    tagRef(dr, c); comps.push(c);
  }
  return comps.reverse();
}
function fDesk(S) {
  const [w, d, h] = FDIMS.desk, g = new THREE.Group();
  box(w, .05, d, S.wood, 0, h - .025, 0, g);
  const comps = addDrawers(S, g, -w / 2 + .28, .52, h - .05, d - .04, 2, 'desk');
  box(.05, h - .05, .05, S.wood, w / 2 - .05, (h - .05) / 2, d / 2 - .06, g); box(.05, h - .05, .05, S.wood, w / 2 - .05, (h - .05) / 2, -d / 2 + .06, g);
  box(w - .6, .3, .02, S.wood, .26, h - .22, -d / 2 + .05, g);
  // desk lamp
  const lamp = new THREE.Group(); lamp.position.set(w / 2 - .2, h, -.18); g.add(lamp);
  cyl(.08, .09, .025, S.brass, 0, .012, 0, lamp); cyl(.012, .012, .32, S.brass, 0, .17, 0, lamp);
  const sh = cyl(.06, .13, .13, M(0x1d5c3a, { r: .5 }), 0, .36, 0, lamp); const bulb = mesh(gSphere(.035), BASIC(0xfff0c0), 0, .31, 0, lamp); bulb.castShadow = false;
  return { group: g, comps, spots: [{ x: .05, y: h, z: .08 }, { x: .35, y: h, z: .12 }, { x: -.35, y: h, z: -.12 }], tall: false, lamp: { x: w / 2 - .2, y: h + .3, z: -.18 } };
}
function fDresser(S) {
  const [w, d, h] = FDIMS.dresser, g = new THREE.Group();
  const comps = addDrawers(S, g, 0, w, h, d, 3, 'dresser');
  box(w + .04, .03, d + .03, S.wood, 0, h + .015, .005, g);
  return { group: g, comps, spots: [{ x: -.25, y: h + .03, z: 0 }, { x: .25, y: h + .03, z: .05 }], tall: false };
}
function fTable(S) {
  const [w, d, h] = FDIMS.table, g = new THREE.Group();
  box(w, .05, d, S.wood, 0, h - .025, 0, g); box(w - .1, .08, d - .1, S.wood, 0, h - .09, 0, g);
  for (const x of [-w / 2 + .07, w / 2 - .07]) for (const z of [-d / 2 + .07, d / 2 - .07]) cyl(.035, .025, h - .05, S.wood, x, (h - .05) / 2, z, g, 10);
  return { group: g, comps: [], spots: [{ x: -.4, y: h, z: .1 }, { x: .4, y: h, z: -.1 }, { x: 0, y: h, z: .15 }, { x: .15, y: h, z: -.2 }], tall: false };
}
function fBookshelf(S, rng) {
  const [w, d, h] = FDIMS.bookshelf, g = new THREE.Group();
  box(w, h, .02, S.wood, 0, h / 2, -d / 2 + .01, g); box(.03, h, d, S.wood, -w / 2 + .015, h / 2, 0, g); box(.03, h, d, S.wood, w / 2 - .015, h / 2, 0, g); box(w + .04, .04, d + .02, S.wood, 0, h + .02, 0, g);
  const shelves = [.08, .5, .92, 1.34, 1.74];
  const bc = [0x7a1f1f, 0x1f3f7a, 0x2f5a2a, 0x5a3a1a, 0x6a5a2a, 0x3a2a4a, 0x8a6a3a, 0x203030];
  for (const y of shelves) {
    box(w - .06, .025, d - .02, S.wood, 0, y, 0, g);
    if (y > 1.7) continue; let x = -w / 2 + .05;
    while (x < w / 2 - .1) {
      if (rng.chance(.08)) { x += .12; continue; }
      const bw = rng.range(.025, .055), bh = rng.range(.24, .36);
      const b = box(bw, bh, rng.range(.18, .24), M(rng.pick(bc), { r: .85 }), x + bw / 2, y + .0125 + bh / 2, .01, g); b.castShadow = false;
      x += bw + .004;
    }
  }
  return { group: g, comps: [], spots: [], tall: true };
}
function fWallSafe(S, artTex) {
  const g = new THREE.Group(), c = new Comp('wallsafe', 'painting'), w = .8, h = .64, dp = .2, sm = M(0x4a4f57, { m: .7, r: .4 });
  box(w, .03, dp, sm, 0, -h / 2 + .015, dp / 2, g); box(w, .03, dp, sm, 0, h / 2 - .015, dp / 2, g); box(.03, h, dp, sm, -w / 2 + .015, 0, dp / 2, g); box(.03, h, dp, sm, w / 2 - .015, 0, dp / 2, g);
  box(w - .06, h - .06, .01, M(0x22252a, { r: .9 }), 0, 0, .006, g);
  const P = new THREE.Group(); P.position.set(-w / 2 - .04, 0, dp + .005); g.add(P);
  box(w + .08, h + .08, .045, S.frame, (w + .08) / 2, 0, .022, P);
  plane(w - .02, h - .02, new THREE.MeshStandardMaterial({ map: artTex, roughness: .8 }), (w + .08) / 2, 0, .046, P);
  c.addPart(P, 'rotation', 'y', -1.8);
  for (const x of [-.2, .15]) c.slots.push({ parent: g, x, y: -h / 2 + .03, z: dp / 2 });
  c.back = { parent: g, x: 0, y: .06, z: .013, w: .6, h: .34 };
  tagRef(P, c);
  return { group: g, comps: [c] };
}
/* static clutter */
function fChair(S) {
  const g = new THREE.Group();
  box(.46, .05, .44, S.wood, 0, .46, 0, g); for (const x of [-.2, .2]) for (const z of [-.18, .18]) box(.04, .46, .04, S.wood, x, .23, z, g);
  box(.46, .5, .04, S.wood, 0, .73, -.2, g); box(.36, .3, .02, S.dark, 0, .75, -.18, g);
  box(.42, .04, .4, M(0x6a1e24, { r: 1 }), 0, .5, .01, g); return g;
}
function fFloorLamp(S) {
  const g = new THREE.Group(); cyl(.16, .18, .03, S.brass, 0, .015, 0, g); cyl(.015, .015, 1.5, S.brass, 0, .76, 0, g);
  const sh = cyl(.14, .24, .28, M(0xe8d4a8, { r: .9, e: .35 }), 0, 1.55, 0, g); sh.castShadow = false; return g;
}
function fPapers(S, rng) {
  const g = new THREE.Group();
  for (let i = 0; i < rng.int(3, 6); i++) { const p = box(.2, .003, .27, M(rng.pick([0xf1e8cf, 0xe8dcb5, 0xf5f0e6]), { r: 1 }), rng.range(-.08, .08), .002 + i * .003, rng.range(-.05, .05), g); p.rotation.y = rng.range(-.5, .5); p.castShadow = false; }
  const pen = cyl(.006, .006, .14, M(0x111133, { r: .3 }), .12, .02, .05, g); pen.rotation.z = Math.PI / 2; pen.rotation.y = .6;
  return g;
}
const FBUILD = { desk: fDesk, dresser: fDresser, chest: fChest, cabinet: fCabinet, safe: fSafe, bookshelf: fBookshelf, crate: fCrate, table: fTable };
