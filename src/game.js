'use strict';
/* =====================================================================
   GAME: locks, room builder, player, hands, UI, main loop
   ===================================================================== */
const $ = id => document.getElementById(id);
const G = { state: 'menu', level: 1, inv: [], sel: 0, carry: null, yaw: 0, pitch: 0, pos: new THREE.Vector3(), keys: {}, time: 0, hints: 0, crouch: 0, bob: 0, stepAcc: 0, reachT: 1, reachV: new THREE.Vector3(), noteOpen: null, shadowT: 0, aim: null, lastHint: null, moving: 0, uvOn: false };
const MAX_INV = 6, REACH = 2.6, EYE = 1.62;
let renderer, scene, camera, hScene, hCam, room = null, uvSpot, hands, dust;
const raycaster = new THREE.Raycaster(), downRay = new THREE.Raycaster();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const markShadow = (t = .15) => { G.shadowT = Math.max(G.shadowT, t); };

/* ---------- UI helpers ---------- */
function toast(msg, ms = 2600) {
  const el = document.createElement('div'); el.className = 'toast'; el.innerHTML = msg; $('toasts').appendChild(el);
  while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  setTimeout(() => el.classList.add('out'), ms); setTimeout(() => el.remove(), ms + 600);
}
const fmtTime = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const heldItem = () => G.carry ? null : G.inv[G.sel] || null;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/* =====================================================================
   LOCKS (3D, operated directly with the crosshair)
   ===================================================================== */
class LockRT {
  constructor(pl) { this.pl = pl; this.type = pl.type; this.solved = false; this.input = []; this.state = []; this.filled = []; this.pos = 0; this.host = null; this.levers = []; }
  desc() { return `${cap(this.pl.host)}: ${LOCKDEFS[this.pl.def].label}.`; }
  build(mt) {
    const g = new THREE.Group(); g.position.set(mt.x, mt.y, mt.z); if (mt.rot) g.rotation.y = mt.rot; mt.parent.add(g); this.g = g;
    const plateM = M(0x23262c, { r: .45, m: .6 }), ref = (act, i, mesh) => ({ type: 'lockpart', lock: this, act, i, mesh });
    const pl = this.pl, n = pl.n;
    const plate = (w, h) => { const p = box(w, h, .03, plateM, 0, 0, .015, g); tagRef(p, ref('plate')); box(w + .02, h + .02, .02, S_TRIM(), 0, 0, .006, g); return p; };
    const led = (x, y) => { this.ledMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2a2a, emissiveIntensity: 1.6 }); const l = mesh(gSphere(.011), this.ledMat, x, y, .034, g); l.castShadow = false; };
    if (this.type === 'code') {
      plate(.3, .42); led(.12, .185);
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; this.cv = cv; this.tex = new THREE.CanvasTexture(cv); this.tex.encoding = THREE.sRGBEncoding; ROOM_TEX.push(this.tex);
      plane(.24, .06, new THREE.MeshBasicMaterial({ map: this.tex }), 0, .135, .031, g);
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '✓'].forEach((l, i) => {
        const c = i % 3, r = i / 3 | 0, b = box(.075, .055, .02, M(l === 'C' ? 0x6a2a2a : l === '✓' ? 0x2a5a2a : 0x3c424b, { r: .4, m: .4 }), (c - 1) * .085, .055 - r * .07, .035, g);
        plane(.05, .042, new THREE.MeshBasicMaterial({ map: labelTex(l, '#eee'), transparent: true }), 0, 0, .0105, b);
        tagRef(b, ref(l === 'C' ? 'clr' : l === '✓' ? 'ok' : 'key', l, b));
      });
      this.draw();
    } else if (this.type === 'dial' || this.type === 'word') {
      const wd = this.type === 'word';
      plate(n * .1 + .06, .22); led(n * .05 + .01, .095); this.faces = [];
      for (let i = 0; i < n; i++) {
        const ans = wd ? pl.letters[i].indexOf(pl.answer[i]) : pl.answer[i];
        let s; do { s = Math.floor(Math.random() * 6); } while (s === ans); this.state[i] = s;
        const x = (i - (n - 1) / 2) * .1, d = box(.08, .13, .05, wd ? M(0x3a3a40, { r: .4, m: .7 }) : S_BRASS(), x, -.01, .045, g);
        const f = plane(.07, .07, new THREE.MeshBasicMaterial({ map: this.faceTex(i, s) }), 0, 0, .0255, d);
        this.faces.push(f); tagRef(d, ref('dial', i, d));
        box(.02, .012, .01, M(0xdddddd), x, .07, .035, g);
      }
    } else if (this.type === 'colorseq') {
      plate(.46, .22); led(.2, .085); this.dots = [];
      for (let j = 0; j < n; j++) { const m = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x000000 }); const d = mesh(gSphere(.011), m, (j - (n - 1) / 2) * .04, .065, .033, g); d.castShadow = false; this.dots.push(m); }
      SEQ_COLORS.forEach((c, i) => { const b = cyl(.037, .037, .03, M(PAL[c].hex, { r: .35, e: .25 }), (i - 1.5) * .1, -.03, .04, g); b.rotation.x = Math.PI / 2; tagRef(b, ref('color', i, b)); });
    } else if (this.type === 'levers') {
      plate(n * .1 + .06, .26); led(n * .05 + .01, .105);
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * .1, base = box(.06, .15, .03, M(0x15161a), x, -.01, .04, g);
        plane(.04, .03, new THREE.MeshBasicMaterial({ map: labelTex('▲', '#888'), transparent: true }), x, .085, .031, g);
        plane(.04, .03, new THREE.MeshBasicMaterial({ map: labelTex('▼', '#888'), transparent: true }), x, -.105, .031, g);
        const pv = new THREE.Group(); pv.position.set(x, -.01, .055); g.add(pv);
        box(.02, .1, .02, S_STEEL(), 0, .05, 0, pv); mesh(gSphere(.022), M(0xb02020, { r: .3 }), 0, .1, 0, pv);
        this.state[i] = 0; pv.rotation.x = 2.5; tagRef(base, ref('lever', i)); tagRef(pv, ref('lever', i)); this.levers.push(pv);
      }
    } else if (this.type === 'slots') {
      const w = Math.max(.17, n * .13 + .04); plate(w, mt.small ? .14 : .17); led(w / 2 - .03, mt.small ? .05 : .065); this.slotG = [];
      pl.colors.forEach((c, i) => {
        const sg = new THREE.Group(); sg.position.set((i - (n - 1) / 2) * .13, -.01, .03); g.add(sg);
        const disc = cyl(.042, .042, .02, M(0x0e0e10, { r: .6 }), 0, 0, .0, sg); disc.rotation.x = Math.PI / 2;
        mesh(gTorus(.044, .009), M(PAL[c].hex, { r: .3, e: .5 }), 0, 0, .01, sg);
        if (pl.kind === 'key') { box(.012, .036, .01, BASIC(0x000000), 0, 0, .01, sg); mesh(gSphere(.01), BASIC(0x000000), 0, .015, .008, sg); }
        else { const o = mesh(new THREE.OctahedronGeometry(.026), M(0x050505, { r: 1 }), 0, 0, .005, sg); o.scale.z = .3; }
        tagRef(sg, ref('slot', i)); this.slotG.push(sg); this.filled[i] = false;
      });
    } else if (this.type === 'tool') {
      this.ledMat = null;
      for (const s of [1, -1]) { const b = box(.92, .1, .025, M(0x7a5a34, { r: .9 }), 0, 0, .02, g); b.rotation.z = s * .22; tagRef(b, ref('pry')); for (const x of [-.4, .4]) cyl(.012, .012, .01, S_STEEL(), x, x * s * .22, .035, g).rotation.x = Math.PI / 2; }
    }
  }
  draw() {
    const g = this.cv.getContext('2d'), n = this.pl.n; g.fillStyle = '#071a10'; g.fillRect(0, 0, 256, 64);
    g.font = 'bold 40px Consolas,monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (this.solved) { g.fillStyle = '#4dff8a'; g.fillText('OPEN', 128, 34); }
    else if (this.err) { g.fillStyle = '#ff4d4d'; g.fillText('DENIED', 128, 34); }
    else {
      let s = ''; for (let i = 0; i < n; i++) { s += this.input[i] !== undefined ? this.input[i] : '_'; if (this.pl.clockClue && i === 1) s += ':'; else if (i < n - 1) s += ' '; }
      g.fillStyle = '#5dff9a'; g.fillText(s, 128, 34);
    }
    this.tex.needsUpdate = true;
  }
  check() {
    if (this.input.join('') === this.pl.answer.join('')) { this.solve(); this.draw(); return; }
    Snd.error(); this.err = true; this.draw(); setTimeout(() => { this.err = false; this.input = []; if (!this.solved) this.draw(); }, 800);
  }
  faceTex(i, s) { return this.type === 'word' ? labelTex(this.pl.letters[i][s], '#f3e2b0', '#15151a') : labelTex(SYMBOLS[s], SYMBOL_COLORS[s], '#15151a'); }
  press(m) { if (!m) return; m.position.z -= .008; setTimeout(() => m.position.z += .008, 110); }
  use(ref) {
    if (this.solved) { toast('That one is already unlocked.'); return; }
    const a = ref.act, pl = this.pl;
    if (a === 'plate') { toast(this.desc() + (this.type === 'slots' ? ` Needs: ${pl.colors.map(c => `<b style="color:${PAL[c].css}">${c}</b>`).join(', ')} ${pl.kind}s.` : '')); return; }
    if (this.type === 'code') {
      this.press(ref.mesh); Snd.btn();
      if (a === 'key' && this.input.length < pl.n) { this.input.push(+ref.i); if (this.input.length === pl.n) this.check(); }
      else if (a === 'clr') this.input = []; else if (a === 'ok') this.check();
      if (!this.solved && !this.err) this.draw();
    } else if (this.type === 'dial' || this.type === 'word') {
      const i = ref.i, s = this.state[i] = (this.state[i] + 1) % 6; Snd.click();
      this.faces[i].material.map = this.faceTex(i, s);
      const ok = this.type === 'word' ? this.state.every((v, k) => pl.letters[k][v] === pl.answer[k]) : this.state.every((v, k) => v === pl.answer[k]);
      if (ok) this.solve();
    } else if (this.type === 'colorseq') {
      this.press(ref.mesh); Snd.btn();
      if (pl.answer[this.pos] === ref.i) { this.dots[this.pos].emissive.setHex(0xffffff); this.pos++; if (this.pos === pl.n) this.solve(); }
      else { Snd.error(); this.pos = 0; this.dots.forEach(d => d.emissive.setHex(0x000000)); if (pl.answer[0] === ref.i) { this.dots[0].emissive.setHex(0xffffff); this.pos = 1; } }
    } else if (this.type === 'levers') {
      this.state[ref.i] ^= 1; Snd.lever();
      if (this.state.every((v, k) => v === pl.answer[k])) setTimeout(() => this.solve(), 350);
    } else if (this.type === 'slots') {
      const i = ref.i, c = pl.colors[i], it = heldItem();
      if (this.filled[i]) { toast('That slot is already filled.'); return; }
      if (!it) { Snd.locked(); toast(`It needs a <b style="color:${PAL[c].css}">${c} ${pl.kind}</b>.`); return; }
      if (it.kind !== pl.kind || it.color !== c) { Snd.locked(); toast(`The ${it.name} doesn't fit — this needs a <b style="color:${PAL[c].css}">${c} ${pl.kind}</b>.`); return; }
      consumeHeld(); this.filled[i] = true; Snd.insert();
      const m = ITEMS[pl.kind].build(c).obj;
      if (pl.kind === 'key') { m.rotation.set(0, Math.PI, Math.PI / 2); m.position.set(0, 0, .085); }
      else { m.position.set(0, -.062, .03); }
      this.slotG[i].add(m); markShadow();
      if (this.filled.every(Boolean)) setTimeout(() => this.solve(), 400);
      else toast(`${cap(it.name)} inserted. ${this.filled.filter(f => !f).length} more to go.`);
    } else if (this.type === 'tool') {
      const it = heldItem();
      if (!it || it.kind !== 'crowbar') { Snd.locked(); toast('The lid is nailed shut with boards. You need something to pry them off.'); return; }
      Snd.pry(); this.g.visible = false; this.solve();
    }
  }
  solve() {
    this.solved = true; if (this.ledMat) { this.ledMat.emissive.setHex(0x2aff5a); this.ledMat.color.setHex(0x003300); }
    Snd.unlock(); room.onLockSolved(this);
  }
  update(dt) { this.levers.forEach((pv, i) => { const t = this.state[i] ? .55 : 2.5; pv.rotation.x += (t - pv.rotation.x) * Math.min(1, dt * 14); }); }
}
let _trim, _brass, _steel;
const S_TRIM = () => _trim || (_trim = M(0x2a1a10, { r: .6 }));
const S_BRASS = () => _brass || (_brass = M(0xb8923e, { r: .35, m: .85 }));
const S_STEEL = () => _steel || (_steel = M(0x8a9098, { r: .3, m: .9 }));

/* =====================================================================
   ROOM BUILDER
   ===================================================================== */
const PALETTES = [
  { wall: '#5b3a32', acc: '#d9b27a', floor: '#7a5232', wood: '#7a4c2a', ceil: '#d6cbb8', wains: '#4b2d1b', rug: ['#5e1a1f', '#c9a24a', '#1e2a44'] },
  { wall: '#2b4a3c', acc: '#d8c08a', floor: '#6a4528', wood: '#664024', ceil: '#d0c8b5', wains: '#3e2716', rug: ['#1e3a5e', '#d8c08a', '#5e1a1f'] },
  { wall: '#363a5c', acc: '#c9b07a', floor: '#80583a', wood: '#784e2c', ceil: '#dcd4c4', wains: '#4a301c', rug: ['#4a2a5e', '#d9b27a', '#20403a'] },
  { wall: '#6a5232', acc: '#2a1c10', floor: '#5e3d22', wood: '#5a3a22', ceil: '#d8cfbc', wains: '#3a2414', rug: ['#6a2a1a', '#e0c080', '#2a2a2a'] },
];
function buildRoom(P) {
  if (room) scene.remove(room.group);
  ROOM_TEX.forEach(t => t.dispose()); ROOM_TEX.length = 0;
  const rng = new RNG(P.seed ^ 0x5bd1e995), pal = PALETTES[P.palette], grp = new THREE.Group(), W = P.W, D = P.D, H = P.H;
  const Rm = room = { plan: P, group: grp, colliders: [], comps: {}, compList: [], locks: {}, lockList: [], items: {}, props: [], fallers: [], writings: [], doorOpen: false, doorT: 0, doorLight: null, furnG: [] };
  scene.add(grp);
  const S = { grainTex: texGrain(pal.wood) };
  S.wood = new THREE.MeshStandardMaterial({ map: S.grainTex, roughness: .6 }); S.dark = M(0x1d130c, { r: .95 }); S.metal = M(0x2e2e30, { r: .45, m: .8 });
  S.brass = M(0xc9a24a, { r: .3, m: .9 }); S.steel = M(0x4f555d, { r: .4, m: .8 }); S.steel2 = M(0x646b74, { r: .32, m: .85 }); S.frame = M(0x9a7428, { r: .35, m: .7 });
  const trim = M(parseInt(pal.wains.slice(1), 16), { r: .55 });

  /* --- shell --- */
  const fl = texPlanks(pal.floor); fl.repeat.set(W / 3, D / 3);
  plane(W, D, new THREE.MeshStandardMaterial({ map: fl, roughness: .5, metalness: .05 }), 0, 0, 0, grp).rotation.x = -Math.PI / 2;
  const ct = texPlaster(pal.ceil); ct.repeat.set(W / 3, D / 3);
  plane(W, D, new THREE.MeshStandardMaterial({ map: ct, roughness: .95 }), 0, H, 0, grp).rotation.x = Math.PI / 2;
  const wp = texWallpaper(pal.wall, pal.acc), wt = texGrain(pal.wains);
  const tm = (src, rx, ry, r) => { const t = src.clone(); t.needsUpdate = true; t.repeat.set(rx, ry); ROOM_TEX.push(t); return new THREE.MeshStandardMaterial({ map: t, roughness: r }); };
  const along = (wall, tc, off, y, obj) => { const xf = wallXY(P, wall, tc, off); obj.position.set(xf.x, y, xf.z); obj.rotation.y = xf.rot; grp.add(obj); return obj; };
  function seg(wall, t0, t1, y0, y1, rails) {
    const len = t1 - t0, tc = (t0 + t1) / 2;
    along(wall, tc, 0, (y0 + y1) / 2, plane(len, y1 - y0, tm(wp, len / 1.2, (y1 - y0) / 1.2, .9)));
    if (!rails) return;
    along(wall, tc, .012, .5, plane(len, 1.0, tm(wt, len / 1.5, 1, .7)));
    for (let x = t0 + .35; x < t1 - .3; x += .7) along(wall, x, .02, .52, box(.5, .66, .012, trim));
    along(wall, tc, .025, 1.0, box(len, .05, .05, trim)); along(wall, tc, .022, .07, box(len, .14, .045, trim));
  }
  seg('N', -W / 2, -.6, 0, H, true); seg('N', .6, W / 2, 0, H, true); seg('N', -.6, .6, 2.3, H, false);
  seg('S', -W / 2, W / 2, 0, H, true); seg('E', -D / 2, D / 2, 0, H, true); seg('W', -D / 2, D / 2, 0, H, true);
  for (const [wl, L] of [['N', W], ['S', W], ['E', D], ['W', D]]) along(wl, 0, .04, H - .05, box(L, .1, .08, trim));
  for (let z = -D / 2 + 1.6; z < D / 2 - 1; z += 2.4) box(W, .16, .2, S.wood, 0, H - .08, z, grp);

  /* --- exit door, frame, sign, corridor --- */
  const fz = -D / 2;
  box(.12, 2.42, .1, trim, -.62, 1.21, fz + .03, grp); box(.12, 2.42, .1, trim, .62, 1.21, fz + .03, grp); box(1.36, .12, .1, trim, 0, 2.36, fz + .03, grp);
  const dp = new THREE.Group(); dp.position.set(-.56, 0, fz - .05); grp.add(dp); Rm.doorPivot = dp;
  const slab = new THREE.Group(); dp.add(slab); tagRef(slab, { type: 'door' });
  box(1.12, 2.3, .08, S.wood, .56, 1.15, 0, slab);
  for (const y of [.6, 1.65]) box(.8, .75, .02, S.dark, .56, y, .045, slab);
  mesh(gSphere(.035), S.brass, 1.0, 1.0, .07, slab); box(.06, .16, .02, S.brass, 1.0, .95, .05, slab);
  const sign = ctex(256, 96, (g, w, h) => { g.fillStyle = '#0b3b1c'; g.fillRect(0, 0, w, h); g.fillStyle = '#7dffa9'; g.font = 'bold 64px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('EXIT', w / 2, h / 2 + 3); });
  box(.46, .17, .05, M(0x111111), 0, 2.6, fz + .03, grp); plane(.42, .14, new THREE.MeshBasicMaterial({ map: sign }), 0, 2.6, fz + .056, grp);
  const cz = fz - 1.6, cm = M(0x3a3632, { r: .9 });
  plane(1.2, 3.2, M(0x2a2420, { r: .8 }), 0, 0, cz, grp).rotation.x = -Math.PI / 2;
  plane(1.2, 3.2, cm, 0, 2.3, cz, grp).rotation.x = Math.PI / 2;
  plane(3.2, 2.3, cm, -.6, 1.15, cz, grp).rotation.y = Math.PI / 2; plane(3.2, 2.3, cm, .6, 1.15, cz, grp).rotation.y = -Math.PI / 2;
  plane(1.2, 2.3, new THREE.MeshBasicMaterial({ color: 0xfff3d6 }), 0, 1.15, fz - 3.2, grp);
  const dl = new THREE.PointLight(0xfff0d0, 0, 7, 1.5); dl.position.set(0, 2, fz - 1.8); grp.add(dl); Rm.doorLight = dl;

  /* --- entrance (sealed) --- */
  const ent = new THREE.Group(); ent.position.set(0, 0, D / 2 - .03); ent.rotation.y = Math.PI; grp.add(ent); tagRef(ent, { type: 'entry' });
  box(.12, 2.42, .08, trim, -.62, 1.21, 0, ent); box(.12, 2.42, .08, trim, .62, 1.21, 0, ent); box(1.36, .12, .08, trim, 0, 2.36, 0, ent);
  box(1.12, 2.3, .05, S.wood, 0, 1.15, 0, ent); for (const y of [.6, 1.65]) box(.8, .75, .02, S.dark, 0, y, .03, ent); mesh(gSphere(.035), S.brass, .44, 1.0, .05, ent);

  /* --- lighting --- */
  grp.add(new THREE.HemisphereLight(0xc8b49a, 0x2a2018, .55));
  const main = new THREE.PointLight(0xffd3a0, 1.25, 20, 1.2); main.position.set(0, H - .75, 0); main.castShadow = true;
  main.shadow.mapSize.set(1024, 1024); main.shadow.bias = -.004; main.shadow.camera.near = .1; main.shadow.camera.far = 20; grp.add(main); Rm.mainLight = main;
  const ch = new THREE.Group(); ch.position.set(0, H, 0); grp.add(ch);
  cyl(.008, .008, .5, S.metal, 0, -.25, 0, ch); const ring = mesh(gTorus(.36, .018), S.brass, 0, -.62, 0, ch); ring.rotation.x = Math.PI / 2; ring.castShadow = false;
  mesh(gSphere(.08), S.brass, 0, -.62, 0, ch).castShadow = false;
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; const c = cyl(.018, .018, .09, M(0xf0e6cc), Math.cos(a) * .36, -.56, Math.sin(a) * .36, ch); c.castShadow = false; const f = mesh(gSphere(.016), BASIC(0xffe2a0), Math.cos(a) * .36, -.49, Math.sin(a) * .36, ch); f.scale.y = 1.6; f.castShadow = false; }

  /* --- furniture --- */
  let lamps = 0;
  for (const f of P.furn) {
    const m = FBUILD[f.type](S, rng); m.group.position.set(f.x, 0, f.z); m.group.rotation.y = f.rot; grp.add(m.group); m.group.updateMatrixWorld(true);
    Rm.furnG[f.idx] = m;
    const sw = Math.abs(Math.sin(f.rot)) > .5, hw = (sw ? f.d : f.w) / 2 + .02, hd = (sw ? f.w : f.d) / 2 + .02;
    Rm.colliders.push({ x0: f.x - hw, x1: f.x + hw, z0: f.z - hd, z1: f.z + hd });
    f.comps.forEach((cid, ci) => regComp(P.comps.find(c => c.id === cid), m.comps[ci]));
    if (m.lamp && lamps < 2) { lamps++; const l = new THREE.PointLight(0xffc070, .8, 4, 2); l.position.copy(m.group.localToWorld(_v.set(m.lamp.x, m.lamp.y, m.lamp.z))); grp.add(l); }
    // clutter: chairs, papers
    const chairAt = (lx, lz, rot) => {
      const c = fChair(S), p = m.group.localToWorld(new THREE.Vector3(lx, 0, lz)); c.position.copy(p); c.rotation.y = f.rot + rot + rng.range(-.2, .2); grp.add(c);
      Rm.colliders.push({ x0: p.x - .24, x1: p.x + .24, z0: p.z - .24, z1: p.z + .24 });
    };
    if (f.type === 'desk') { chairAt(.3, f.d / 2 + .32, Math.PI); const pp = fPapers(S, rng); pp.position.copy(m.group.localToWorld(new THREE.Vector3(-.15, f.h, -.12))); pp.rotation.y = f.rot; grp.add(pp); }
    if (f.type === 'table') { chairAt(f.w / 2 + .3, 0, -Math.PI / 2); chairAt(-f.w / 2 - .3, 0, Math.PI / 2); const pp = fPapers(S, rng); pp.position.copy(m.group.localToWorld(new THREE.Vector3(.3, f.h, .2))); grp.add(pp); }
    if (f.type === 'table') { const rug = plane(f.rot ? 2.2 : 3, f.rot ? 3 : 2.2, new THREE.MeshStandardMaterial({ map: texRug(...pal.rug), roughness: 1 }), f.x, .006, f.z, grp); rug.rotation.x = -Math.PI / 2; }
  }
  for (const [x, z] of [[-W / 2 + .35, D / 2 - .35], [W / 2 - .35, D / 2 - .35], [-W / 2 + .35, -D / 2 + .35], [W / 2 - .35, -D / 2 + .35]]) {
    if (P.spots.some(s => s.kind === 'floor' && Math.hypot(s.x - x, s.z - z) < .6) || Rm.colliders.some(c => x > c.x0 - .3 && x < c.x1 + .3 && z > c.z0 - .3 && z < c.z1 + .3)) continue;
    const l = fFloorLamp(S); l.position.set(x, 0, z); grp.add(l); Rm.colliders.push({ x0: x - .18, x1: x + .18, z0: z - .18, z1: z + .18 });
  }
  function regComp(pc, rc) { rc.pid = pc.id; rc.name = pc.name; rc.desc = pc.desc; rc.plan = pc; Rm.comps[pc.id] = rc; Rm.compList.push(rc); }

  /* --- wall features --- */
  for (const w of P.wall) {
    const xf = wallXY(P, w.bay.wall, w.bay.t, 0), g = new THREE.Group(); g.position.set(xf.x, w.bay.floor && !w.bay.tall ? 1.6 : 1.5, xf.z); g.rotation.y = xf.rot; grp.add(g);
    if (w.type === 'wallsafe') { const m = fWallSafe(S, texArt(rng)); g.add(m.group); regComp(P.comps.find(c => c.id === w.comp), m.comps[0]); }
    else if (w.type === 'painting') {
      const pw = rng.range(.6, .95), ph = pw * rng.range(.7, 1.1);
      box(pw + .08, ph + .08, .04, S.frame, 0, 0, .02, g); plane(pw, ph, new THREE.MeshStandardMaterial({ map: texArt(rng), roughness: .8 }), 0, 0, .041, g);
    } else if (w.type === 'clock') {
      const face = ctex(256, 256, (c) => {
        c.fillStyle = '#f2ead6'; c.beginPath(); c.arc(128, 128, 126, 0, TAU); c.fill(); c.fillStyle = '#222'; c.font = 'bold 30px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle';
        for (let i = 1; i <= 12; i++) { const a = i / 12 * TAU - Math.PI / 2; c.fillText(i, 128 + Math.cos(a) * 98, 128 + Math.sin(a) * 98); }
        for (let i = 0; i < 60; i++) { const a = i / 60 * TAU; c.fillRect(128 + Math.cos(a) * 118 - 1, 128 + Math.sin(a) * 118 - 1, i % 5 ? 2 : 4, i % 5 ? 2 : 4); }
        const hand = (a, len, wd) => { c.save(); c.translate(128, 128); c.rotate(a); c.fillRect(-wd / 2, -len, wd, len + 12); c.restore(); };
        hand(((w.h % 12) + w.m / 60) / 12 * TAU, 60, 9); hand(w.m / 60 * TAU, 92, 5); c.beginPath(); c.arc(128, 128, 8, 0, TAU); c.fill();
      });
      const rim = cyl(.3, .3, .06, S.frame, 0, 0, .03, g, 40); rim.rotation.x = Math.PI / 2;
      const fc = new THREE.Mesh(new THREE.CircleGeometry(.27, 40), new THREE.MeshStandardMaterial({ map: face, roughness: .5 })); fc.position.z = .061; g.add(fc);
      const pt = ctex(512, 96, (c, w2, h2) => { c.fillStyle = '#b8923e'; c.fillRect(0, 0, w2, h2); c.fillStyle = '#2a1a08'; c.font = 'italic bold 34px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('Stopped forever at that hour…', w2 / 2, h2 / 2); });
      plane(.55, .1, new THREE.MeshStandardMaterial({ map: pt, roughness: .4, metalness: .6 }), 0, -.42, .012, g);
    } else if (w.type === 'poster') {
      const t = ctex(400, 300, (c, w2, h2) => { c.fillStyle = '#efe4c8'; c.fillRect(0, 0, w2, h2); c.strokeStyle = '#6a4a2a'; c.lineWidth = 8; c.strokeRect(14, 14, w2 - 28, h2 - 28); drawClue(c, w.clue, 40, 70, w2 - 80, 170, '#2a1a10'); c.fillStyle = '#5a3a1a'; c.font = 'italic 24px Georgia'; c.textAlign = 'center'; c.fillText('~ remember the ' + w.host + ' ~', w2 / 2, 48); });
      box(.7, .54, .03, S.frame, 0, 0, .015, g); plane(.64, .48, new THREE.MeshStandardMaterial({ map: t, roughness: .8 }), 0, 0, .031, g);
    } else if (w.type === 'uv') {
      const t = ctex(512, 256, (c, w2, h2) => { c.shadowColor = '#c080ff'; c.shadowBlur = 18; drawClue(c, w.clue, 20, 60, w2 - 40, 170, '#f4e8ff'); c.fillStyle = '#e8d0ff'; c.font = 'italic 28px Georgia'; c.textAlign = 'center'; c.fillText('the ' + w.host + ':', w2 / 2, 36); });
      const m = plane(.95, .48, new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xe0c0ff }), 0, -.05, .015, g);
      m.layers.set(1); Rm.writings.push(m);
    }
  }

  /* --- locks --- */
  for (const pl of P.locks) {
    const L = new LockRT(pl); Rm.locks[pl.id] = L; Rm.lockList.push(L);
    if (pl.comp) { const rc = Rm.comps[pl.comp]; rc.lock = L; L.host = rc; L.build(rc.mount); }
    else L.build({ parent: grp, x: pl.door === 0 ? 1.0 : -1.0, y: 1.35, z: fz + .003 });
  }

  /* --- items & props --- */
  const spotWorld = s => s.kind === 'floor' ? new THREE.Vector3(s.x, 0, s.z) : Rm.furnG[s.f].group.localToWorld(new THREE.Vector3().copy(Rm.furnG[s.f].spots[s.li]));
  for (const pi of P.items) {
    const def = ITEMS[pi.kind], b = def.build(pi.color, pi);
    const it = { type: 'item', id: pi.id, plan: pi, kind: pi.kind, color: pi.color, def, mesh: b.obj, h: b.h, name: def.name(pi.color, pi), got: false };
    tagRef(it.mesh, it); Rm.items[pi.id] = it;
    if (pi.loc.type === 'comp') {
      const rc = Rm.comps[pi.loc.comp], s = rc.nextSlot(); s.parent.add(it.mesh);
      it.mesh.position.set(s.x + rng.range(-.03, .03), s.y, s.z + rng.range(-.03, .03));
    } else { it.mesh.position.copy(spotWorld(pi.loc.spot)).add(_v.set(rng.range(-.04, .04), 0, rng.range(-.04, .04))); grp.add(it.mesh); }
    it.mesh.rotation.y = rng.range(0, TAU);
  }
  for (const s of P.spots) if (s.cover) {
    const b = PROPS[s.cover].build(), pr = { type: 'prop', name: PROPS[s.cover].name, mesh: b.obj, h: b.h };
    tagRef(pr.mesh, pr); pr.mesh.position.copy(spotWorld(s)); pr.mesh.rotation.y = rng.range(0, TAU); grp.add(pr.mesh); Rm.props.push(pr);
  }

  /* --- dust motes --- */
  const N = 350, pos = new Float32Array(N * 3); for (let i = 0; i < N; i++) { pos[i * 3] = rng.range(-W / 2, W / 2); pos[i * 3 + 1] = rng.range(0, H); pos[i * 3 + 2] = rng.range(-D / 2, D / 2); }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xffe6c0, size: .018, transparent: true, opacity: .55, depthWrite: false })); dust.layers.set(1); grp.add(dust);

  Rm.onLockSolved = L => {
    markShadow(.3);
    if (L.host) { setTimeout(() => { L.host.open = true; Snd[L.host.sound](); toast(`🔓 The ${L.host.name} unlocks!`); }, 350); }
    else if (P.door.locks.every(id => Rm.locks[id].solved)) {
      setTimeout(() => { Rm.doorOpen = true; Snd.door(); Snd.success(); toast('🚪 <b>The exit door swings open!</b> Walk through it to escape.', 4000); $('objective').textContent = 'The door is open — walk through it!'; }, 500);
    } else toast('One lock on the exit door is open… another remains.');
    updateInfo();
  };
  markShadow(.5);
  return Rm;
}

/* =====================================================================
   HANDS (rendered in a separate overlay scene so they never clip)
   ===================================================================== */
function makeArm(side) {
  const g = new THREE.Group(), skin = M(0xc98a62, { r: .7 }), sl = M(0x2a3a52, { r: .95 }), cuff = M(0x1a2230, { r: .9 });
  box(.11, .11, .5, sl, 0, -.012, .31, g); box(.118, .118, .05, cuff, 0, -.012, .07, g);
  box(.08, .072, .1, skin, 0, 0, .01, g); box(.105, .038, .12, skin, 0, 0, -.09, g);
  const fingers = []; for (let i = 0; i < 4; i++) { const f = new THREE.Group(); f.position.set(-.039 + i * .026, 0, -.148); g.add(f); box(.021, .024, i === 0 || i === 3 ? .065 : .08, skin, 0, 0, -.035, f); fingers.push(f); }
  const th = new THREE.Group(); th.position.set(side * -.055, -.004, -.06); g.add(th); box(.024, .024, .07, skin, 0, 0, -.035, th); th.rotation.y = side * .55;
  g.userData = { fingers, th }; g.scale.setScalar(.85); hScene.add(g); return g;
}
function buildHands() {
  const R = makeArm(1), L = makeArm(-1), anchor = new THREE.Group(); anchor.position.set(0, .03, -.17); R.add(anchor);
  const carry = new THREE.Group(); hScene.add(carry);
  return { R, L, anchor, carry, curl: .3 };
}
function updateHands(dt, t) {
  const H = hands, mv = G.moving, bobY = Math.sin(G.bob * 2) * .012 * mv, bobX = Math.cos(G.bob) * .01 * mv, sway = Math.sin(t * 1.3) * .004;
  const rp = new THREE.Vector3(.27, -.29 + bobY + sway, -.6), lp = new THREE.Vector3(-.34, -.46 + bobY, -.6);
  let rr = [.28, .32, 0], lr = [.28, -.32, 0];
  if (G.carry) { rp.set(.23, -.3 + bobY, -.6); lp.set(-.23, -.3 + bobY, -.6); rr = [.15, .1, 1.25]; lr = [.15, -.1, -1.25]; H.carry.position.set(0, -.42 + bobY, -.86); }
  if (G.reachT < 1) {
    G.reachT = Math.min(1, G.reachT + dt / .38); const k = Math.sin(G.reachT * Math.PI);
    _v.copy(G.reachV); _v.z = Math.max(_v.z, -1.05); _v.sub(rp).multiplyScalar(.6 * k); rp.add(_v);
  }
  H.R.position.lerp(rp, Math.min(1, dt * 18)); H.L.position.lerp(lp, Math.min(1, dt * 10));
  H.R.rotation.set(rr[0], rr[1], rr[2]); H.L.rotation.set(lr[0], lr[1], lr[2]);
  const want = (heldItem() || G.carry) ? 1.15 : G.reachT < 1 ? .3 + Math.sin(G.reachT * Math.PI) * .9 : .3;
  H.curl += (want - H.curl) * Math.min(1, dt * 12);
  for (const arm of [H.R, H.L]) { arm.userData.fingers.forEach(f => f.rotation.x = -H.curl); }
  H.L.userData.fingers.forEach(f => f.rotation.x = G.carry ? -.9 : -.35);
  H.L.visible = true;
}
function reachTo(p) { G.reachT = 0; if (p) { G.reachV.copy(p); camera.worldToLocal(G.reachV); } else G.reachV.set(.2, -.15, -.7); }
function refreshHand() {
  const a = hands.anchor; while (a.children.length) a.remove(a.children[0]); hands.carry.clear();
  if (G.carry) { const m = G.carry.mesh; hands.carry.add(m); m.position.set(0, 0, 0); m.rotation.set(0, .4, 0); m.scale.setScalar(.85); }
  else { const it = G.inv[G.sel]; if (it) { const h = it.def.hold; a.add(it.mesh); it.mesh.position.set(...h.p); it.mesh.rotation.set(...h.r); it.mesh.scale.setScalar(1); } }
  updateHotbar();
}

/* =====================================================================
   INTERACTION
   ===================================================================== */
function aimRay(far) {
  raycaster.setFromCamera({ x: 0, y: 0 }, camera); raycaster.far = far;
  const hits = raycaster.intersectObject(room.group, true);
  return hits.length ? hits[0] : null;
}
const READABLE = new Set(['note', 'book', 'card']);
const KE = '<span class="k">E</span> ', KL = '<span class="k">L-Click</span> ';
function promptFor(ref) {
  const r = promptText(ref); if (!r) return '';
  return (ref.type === 'comp' ? KE : ref.type === 'door' || ref.type === 'entry' ? '' : KL) + r;
}
function promptText(ref) {
  const it = heldItem();
  switch (ref.type) {
    case 'item': return `Pick up <b>${ref.name}</b>`;
    case 'prop': return `Lift the <b>${ref.name}</b>`;
    case 'door': return room.doorOpen ? 'The way out!' : `<b>Exit door</b> — locked`;
    case 'entry': return 'The way you came in';
    case 'comp': {
      if (ref.lock && !ref.lock.solved) return `<b>${cap(ref.name)}</b> — locked (${LOCKDEFS[ref.lock.pl.def].label})`;
      if (ref.kind === 'wallsafe') return ref.open ? 'Swing the painting back' : 'Move the <b>painting</b>';
      return `${ref.open ? 'Close' : 'Open'} the <b>${ref.name}</b>`;
    }
    case 'lockpart': {
      const L = ref.lock; if (L.solved) return 'Unlocked';
      switch (ref.act) {
        case 'key': return `Press <b>${ref.i}</b>`; case 'clr': return 'Clear'; case 'ok': return 'Enter';
        case 'dial': return L.type === 'word' ? 'Turn letter dial' : 'Turn dial'; case 'color': return `Press <b style="color:${PAL[SEQ_COLORS[ref.i]].css}">${SEQ_COLORS[ref.i]}</b>`;
        case 'lever': return 'Flip lever'; case 'pry': return it && it.kind === 'crowbar' ? 'Pry the boards off' : 'Boards nailed across the lid';
        case 'slot': { if (L.filled[ref.i]) return 'Filled'; const c = L.pl.colors[ref.i]; return it && it.kind === L.pl.kind && it.color === c ? `Insert <b>${it.name}</b>` : `<b style="color:${PAL[c].css}">${cap(c)}</b> ${L.pl.kind} slot`; }
        default: return L.desc();
      }
    }
  }
  return '';
}
function doorMsg(ref) {
  if (ref.type === 'door' && !room.doorOpen) { Snd.locked(); toast('The exit door is locked tight. ' + room.lockList.filter(l => !l.host && !l.solved).map(l => l.desc()).join(' ')); }
  if (ref.type === 'entry') { Snd.locked(); toast('The door you came through has sealed shut. The only way is forward.'); }
}
/* Left-click: grab / use */
function interact() {
  if (G.noteOpen) { closeNote(); return; }
  const a = G.aim;
  if (!a || !a.ref) { const it = heldItem(); if (it && READABLE.has(it.kind)) openNote(it); else reachTo(a && a.point); return; }
  const ref = a.ref; reachTo(a.point);
  switch (ref.type) {
    case 'item': return pickItem(ref);
    case 'prop': return pickProp(ref);
    case 'door': case 'entry': return doorMsg(ref);
    case 'comp':
      if (ref.lock && !ref.lock.solved) { Snd.locked(); toast(`Locked. ${ref.lock.desc()}`); }
      else toast(`Press <b>E</b> to ${ref.open ? 'close' : 'open'} the ${ref.name}.`, 1500);
      return;
    case 'lockpart': if (G.carry) { toast('Put the ' + G.carry.name + ' down first (right-click).'); return; } ref.lock.use(ref); return;
  }
}
/* E: open / close */
function openClose() {
  if (G.noteOpen) { closeNote(); return; }
  const a = G.aim; if (!a || !a.ref) return;
  const ref = a.ref;
  if (ref.type === 'comp') {
    reachTo(a.point);
    if (ref.lock && !ref.lock.solved) { Snd.locked(); toast(`Locked. ${ref.lock.desc()}`); return; }
    ref.open = !ref.open; Snd[ref.sound](); markShadow(.8);
  } else if (ref.type === 'door' || ref.type === 'entry') doorMsg(ref);
  else if (ref.type === 'item' || ref.type === 'prop') toast('Left-click to pick that up.', 1500);
  else if (ref.type === 'lockpart') toast('Left-click to use the lock.', 1500);
}
function detach(m) { if (m.parent) m.parent.remove(m); }
function pickItem(it) {
  if (G.carry) { toast(`Your hands are full — put the ${G.carry.name} down first (G / right-click).`); return; }
  if (G.inv.length >= MAX_INV) { toast('Your pockets are full. Drop something with G / right-click.'); return; }
  detach(it.mesh); room.fallers = room.fallers.filter(f => f !== it); it.got = true; G.inv.push(it); G.sel = G.inv.length - 1;
  refreshHand(); Snd.pickup(); markShadow();
  if (READABLE.has(it.kind) && !it.read) openNote(it);
  else toast(`Picked up <b>${it.name}</b>${it.kind === 'uv' ? ' — hold it to reveal hidden writing.' : ''}`);
}
function pickProp(pr) {
  if (G.carry) { toast('You can only carry one big thing at a time.'); return; }
  detach(pr.mesh); room.fallers = room.fallers.filter(f => f !== pr); G.carry = pr; refreshHand(); Snd.pickup(); markShadow();
}
function consumeHeld() { const it = G.inv[G.sel]; G.inv.splice(G.sel, 1); detach(it.mesh); it.used = true; G.sel = Math.max(0, Math.min(G.sel, G.inv.length - 1)); refreshHand(); }
function dropHeld() {
  const it = G.carry || G.inv[G.sel]; if (!it) return;
  const hit = aimRay(3); camera.getWorldDirection(_v2); const P = room.plan;
  let p;
  if (hit) { const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : _v.set(0, 1, 0); p = hit.point.clone(); if (n.y < .6) p.addScaledVector(_v2, -.3); }
  else p = camera.position.clone().addScaledVector(_v2, 1.5);
  if (p.z < -P.D / 2 + .25 && !room.doorOpen) p.z = -P.D / 2 + .25;
  p.x = clamp(p.x, -P.W / 2 + .25, P.W / 2 - .25); p.z = clamp(p.z, -P.D / 2 - 2.8, P.D / 2 - .25); p.y = Math.max(p.y + .03, .03);
  detach(it.mesh); room.group.add(it.mesh); it.mesh.position.copy(p); it.mesh.rotation.set(0, G.yaw + Math.random() - .5, 0); it.mesh.scale.setScalar(1);
  it.vy = 0; room.fallers.push(it);
  if (G.carry) G.carry = null; else { G.inv.splice(G.sel, 1); G.sel = Math.max(0, Math.min(G.sel, G.inv.length - 1)); }
  reachTo(p); refreshHand(); markShadow();
}
function updateFallers(dt) {
  for (const it of room.fallers.slice()) {
    it.vy -= 9.8 * dt; const p = it.mesh.position, dy = it.vy * dt;
    downRay.set(_v.set(p.x, p.y + .15, p.z), _v2.set(0, -1, 0)); downRay.far = .15 - dy + .01;
    const hit = downRay.intersectObject(room.group, true).find(h => { const r = findRef(h.object); return !(r && (r.type === 'item' || r.type === 'prop')) && h.object.visible; });
    if (hit && hit.point.y >= p.y + dy - .001) {
      p.y = hit.point.y; room.fallers.splice(room.fallers.indexOf(it), 1); Snd.drop(); markShadow();
      const r = findRef(hit.object); if (r && r.type === 'comp' && r.drawerGroup) r.drawerGroup.attach(it.mesh); // rides along with the drawer
    }
    else if (p.y + dy < 0) { p.y = 0; room.fallers.splice(room.fallers.indexOf(it), 1); Snd.drop(); markShadow(); }
    else p.y += dy;
  }
}

/* ---------- notes ---------- */
function openNote(it) {
  const p = it.plan; G.noteOpen = it; it.read = true;
  $('noteBody').className = it.kind === 'book' ? 'book' : '';
  $('noteBody').innerHTML = `<h2>${it.kind === 'book' ? '📖 ' + p.title : p.title || cap(it.name)}</h2><div>${p.html || ''}</div>`;
  $('note').classList.add('show'); Snd.paper();
}
function closeNote() { G.noteOpen = null; $('note').classList.remove('show'); }

/* ---------- hints ---------- */
function hint() {
  const P = room.plan, got = id => room.items[id].got;
  const tokens = new Set(P.locks.flatMap(l => l.tokens));
  const ready = room.lockList.filter(L => !L.solved && L.pl.tokens.every(got) && (!L.host || !L.host.lock || true));
  const avail = P.items.filter(i => tokens.has(i.id) && !got(i.id) && i.reqs.every(got));
  G.hints++; updateInfo();
  let key, vague, exact;
  if (ready.length) { const L = ready[0]; key = L.pl.id; vague = `You already have what you need for the <b>${L.pl.host}</b>.`; exact = L.pl.clueHint; }
  else if (avail.length) {
    const i = avail[0], nm = i.kind === 'note' ? (i.scrap ? 'a torn scrap of paper' : 'a note') : i.kind === 'book' ? `the book “${i.title}”` : room.items[i.id].name;
    key = i.id; vague = `Something important is near ${i.wall ? WALLNAME[i.wall] : 'the middle of the room'}.`; exact = `Look for <b>${nm}</b> — it's ${i.where}.`;
  } else { key = 'x'; vague = exact = 'Open everything you can and lift objects to look underneath.'; }
  const second = G.lastHint && G.lastHint.key === key && performance.now() - G.lastHint.t < 20000;
  toast('💡 ' + (second ? exact : vague + ' <i>(press H again for more)</i>'), 6000);
  G.lastHint = { key, t: performance.now() };
}

/* =====================================================================
   PLAYER
   ===================================================================== */
function collide(p) {
  const r = .28, P = room.plan;
  for (const c of room.colliders) {
    const cx = clamp(p.x, c.x0, c.x1), cz = clamp(p.z, c.z0, c.z1), dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-9) { const d = Math.sqrt(d2); p.x = cx + dx / d * r; p.z = cz + dz / d * r; }
      else { const l = p.x - c.x0, rr = c.x1 - p.x, t = p.z - c.z0, b = c.z1 - p.z, m = Math.min(l, rr, t, b); if (m === l) p.x = c.x0 - r; else if (m === rr) p.x = c.x1 + r; else if (m === t) p.z = c.z0 - r; else p.z = c.z1 + r; }
    }
  }
  if (p.z < -P.D / 2 - .05 || (room.doorOpen && p.z < -P.D / 2 + r && Math.abs(p.x) < .55 - r + .06)) { p.x = clamp(p.x, -.55 + r, .55 - r); p.z = Math.max(p.z, -P.D / 2 - 3.0); }
  else { p.x = clamp(p.x, -P.W / 2 + r, P.W / 2 - r); p.z = clamp(p.z, -P.D / 2 + r, P.D / 2 - r); }
}
function updatePlayer(dt) {
  const k = G.keys, f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0), s = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
  const crouch = k.KeyC || k.ControlLeft; G.crouch += ((crouch ? 1 : 0) - G.crouch) * Math.min(1, dt * 10);
  const speed = (k.ShiftLeft || k.ShiftRight ? 4.2 : 2.6) * (crouch ? .5 : 1) * (G.carry ? .85 : 1);
  let mx = 0, mz = 0; if (f || s) { const l = Math.hypot(f, s); mx = (-Math.sin(G.yaw) * f + Math.cos(G.yaw) * s) / l; mz = (-Math.cos(G.yaw) * f - Math.sin(G.yaw) * s) / l; }
  G.moving += ((f || s ? 1 : 0) - G.moving) * Math.min(1, dt * 8);
  const ox = G.pos.x, oz = G.pos.z;
  G.pos.x += mx * speed * dt; collide(G.pos); G.pos.z += mz * speed * dt; collide(G.pos);
  const dist = Math.hypot(G.pos.x - ox, G.pos.z - oz); G.bob += dist * 3.2; G.stepAcc += dist;
  if (G.stepAcc > (speed > 3 ? .75 : .6)) { G.stepAcc = 0; Snd.step(); }
  camera.position.set(G.pos.x, EYE - G.crouch * .6 + Math.sin(G.bob * 2) * .025 * G.moving, G.pos.z);
  camera.rotation.set(G.pitch, G.yaw, 0);
  if (room.doorOpen && G.pos.z < -room.plan.D / 2 - 2.0) escaped();
}

/* =====================================================================
   HUD
   ===================================================================== */
function updateHotbar() {
  let h = '';
  for (let i = 0; i < MAX_INV; i++) {
    const it = G.inv[i], c = it && it.color ? PAL[it.color].css : 'transparent';
    h += `<div class="slot ${i === G.sel && !G.carry ? 'sel' : ''}"><span class="num">${i + 1}</span>${it ? `<span class="ic">${it.def.icon}</span><span class="chip" style="background:${c}"></span>` : ''}</div>`;
  }
  $('hotbar').innerHTML = h;
  const it = heldItem(); $('heldName').innerHTML = G.carry ? `Carrying: <b>${G.carry.name}</b> — G / right-click to put down` : it ? `<b>${cap(it.name)}</b>${READABLE.has(it.kind) ? ' — R to read' : ''}` : '';
}
function updateInfo() {
  if (!room) return; const sv = room.lockList.filter(l => l.solved).length;
  $('info').innerHTML = `<div class="room">ROOM ${G.level}</div><div>⏱ ${fmtTime(G.time)} &nbsp; 🔓 ${sv}/${room.lockList.length} locks &nbsp; 💡 ${G.hints}</div>`;
}

/* =====================================================================
   FLOW
   ===================================================================== */
function startRoom() {
  const seed = (Math.random() * 2 ** 31) | 0; const P = generateRoom(seed, G.level); buildRoom(P);
  G.inv = []; G.sel = 0; G.carry = null; G.time = 0; G.hints = 0; G.lastHint = null; refreshHand();
  G.pos.set(0, 0, P.D / 2 - 1.15); G.yaw = 0; G.pitch = -.05; closeNote();
  $('objective').textContent = 'Find a way to unlock the exit door.';
  G.state = 'play'; updateInfo(); fade(false);
  setTimeout(() => toast(`<b>Room ${G.level}</b> — the door slams shut behind you. Find a way out.`, 4000), 300);
  setTimeout(() => toast('Tip: lift objects, open everything, read notes. Press <b>H</b> for a hint.', 5000), 2200);
}
function escaped() {
  G.state = 'won'; Snd.win(); document.exitPointerLock();
  let best = 0; try { best = +localStorage.getItem('lockedin_best') || 0; if (G.level > best) localStorage.setItem('lockedin_best', G.level); } catch (e) { }
  fade(true);
  setTimeout(() => {
    const stars = G.hints === 0 ? 3 : G.hints <= 3 ? 2 : 1;
    const ranks = ['', 'Lucky Escapee', 'Sharp Detective', 'Master Escape Artist'];
    $('stars').innerHTML = [1, 2, 3].map(i => `<span class="${i <= stars ? 'on' : ''}" style="animation-delay:${.3 + i * .25}s">★</span>`).join('');
    $('winStats').innerHTML = `<div class="rank">${ranks[stars]}</div>Room ${G.level} escaped in <b>${fmtTime(G.time)}</b><br>${room.lockList.length} locks opened · ${G.hints} hint${G.hints === 1 ? '' : 's'} used`;
    const cf = $('confetti'); cf.innerHTML = '';
    for (let i = 0; i < 90; i++) { const d = document.createElement('i'); d.style.left = Math.random() * 100 + '%'; d.style.background = `hsl(${Math.random() * 360},85%,60%)`; d.style.animationDelay = Math.random() * 2.5 + 's'; d.style.animationDuration = 2.5 + Math.random() * 2.5 + 's'; cf.appendChild(d); }
    show('win');
  }, 900);
}
function fade(on) { $('fade').classList.toggle('on', on); }
function show(id) { for (const o of ['menu', 'pause', 'win']) $(o).classList.toggle('show', o === id); $('hud').style.display = id ? 'none' : 'block'; }
function lockPointer() { Snd.init(); renderer.domElement.requestPointerLock(); }

/* =====================================================================
   INIT & LOOP
   ===================================================================== */
function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); renderer.setSize(innerWidth, innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false; renderer.autoClear = false;
  $('game').appendChild(renderer.domElement);
  scene = new THREE.Scene(); scene.background = new THREE.Color(0x0a0806); scene.fog = new THREE.Fog(0x0a0806, 9, 26);
  camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, .03, 60); camera.rotation.order = 'YXZ'; camera.layers.enable(1); scene.add(camera);
  uvSpot = new THREE.SpotLight(0x9a5cff, 0, 9, .4, .6, 1.2); uvSpot.position.set(.15, -.1, 0); camera.add(uvSpot); const tg = new THREE.Object3D(); tg.position.set(0, 0, -1); camera.add(tg); uvSpot.target = tg;
  hScene = new THREE.Scene(); hCam = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, .01, 10);
  hScene.add(new THREE.AmbientLight(0xffe8d0, .28)); const dl = new THREE.DirectionalLight(0xffd8a8, .6); dl.position.set(-1, 2, 1.5); hScene.add(dl);
  hands = buildHands();
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = hCam.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); hCam.updateProjectionMatrix(); });

  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === renderer.domElement;
    if (!locked && G.state === 'play') { closeNote(); G.state = 'paused'; G.keys = {}; show('pause'); }
    else if (locked && G.state === 'paused') { G.state = 'play'; show(null); }
  });
  document.addEventListener('mousemove', e => {
    if (G.state !== 'play' || document.pointerLockElement !== renderer.domElement) return;
    const s = .0022 * (+$('sens').value || 1);
    G.yaw -= e.movementX * s; G.pitch = clamp(G.pitch - e.movementY * s, -1.45, 1.45);
  });
  renderer.domElement.addEventListener('mousedown', e => {
    if (G.state !== 'play') return;
    if (document.pointerLockElement !== renderer.domElement) { lockPointer(); return; }
    if (e.button === 0) interact(); else if (e.button === 2) { if (G.noteOpen) closeNote(); else dropHeld(); }
  });
  addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('wheel', e => { if (G.state !== 'play' || !G.inv.length || G.carry) return; G.sel = (G.sel + (e.deltaY > 0 ? 1 : -1) + G.inv.length) % G.inv.length; refreshHand(); });
  addEventListener('keydown', e => {
    G.keys[e.code] = true; if (G.state !== 'play') return;
    if (e.code === 'KeyE') openClose();
    else if (e.code === 'KeyF') interact();
    else if (e.code === 'KeyG' || e.code === 'KeyQ') { if (G.noteOpen) closeNote(); else dropHeld(); }
    else if (e.code === 'KeyR') { const it = heldItem(); if (G.noteOpen) closeNote(); else if (it && READABLE.has(it.kind)) openNote(it); }
    else if (e.code === 'KeyH') hint();
    else if (e.code === 'KeyM') toast(Snd.toggle() ? '🔇 Sound off' : '🔊 Sound on');
    else if (/^Digit[1-6]$/.test(e.code)) { const i = +e.code.slice(5) - 1; if (i < G.inv.length && !G.carry) { G.sel = i; refreshHand(); } }
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  });
  addEventListener('keyup', e => { G.keys[e.code] = false; });

  $('btnStart').onclick = () => { G.level = 1; show(null); startRoom(); lockPointer(); };
  $('btnResume').onclick = () => { show(null); lockPointer(); };
  $('btnRestart').onclick = () => { show(null); startRoom(); lockPointer(); };
  $('btnMenu').onclick = $('btnMenu2').onclick = () => { G.state = 'menu'; show('menu'); refreshBest(); };
  $('btnNext').onclick = () => { G.level++; show(null); startRoom(); lockPointer(); };
  refreshBest();

  // build a backdrop room for the title screen
  buildRoom(generate(12345, 1)); G.pos.set(0, 0, 0); G.yaw = 0;
  requestAnimationFrame(loop);
}
function refreshBest() { let b = 0; try { b = +localStorage.getItem('lockedin_best') || 0; } catch (e) { } $('best').textContent = b ? `Furthest room escaped: ${b}` : ''; }

let last = performance.now(), infoT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(.05, (now - last) / 1000); last = now; const t = now / 1000;
  if (G.state === 'play') {
    G.time += dt; updatePlayer(dt);
    const hit = aimRay(REACH), ref = hit ? findRef(hit.object) : null;
    G.aim = hit ? { ref, point: hit.point } : null;
    const pr = ref && !G.noteOpen ? promptFor(ref) : '';
    $('prompt').innerHTML = pr; $('cross').classList.toggle('active', !!pr);
    if ((infoT += dt) > .5) { infoT = 0; updateInfo(); }
  } else if (G.state === 'menu') {
    camera.position.set(Math.sin(t * .1) * 1.5, 1.7, 1.5 + Math.cos(t * .1) * .8); camera.rotation.set(-.08, Math.sin(t * .13) * .5, 0);
  }
  if (room) {
    for (const c of room.compList) if (c.update(dt)) markShadow(.05);
    for (const L of room.lockList) L.update(dt);
    if (room.fallers.length) updateFallers(dt);
    if (room.doorOpen && room.doorT < 1) { room.doorT = Math.min(1, room.doorT + dt * .7); room.doorPivot.rotation.y = ease(room.doorT) * 1.5; room.doorLight.intensity = ease(room.doorT) * 1.6; markShadow(.05); }
    room.mainLight.intensity = 1.25 + Math.sin(t * 7.3) * .015 + Math.sin(t * 13.1) * .01;
    // UV flashlight & hidden writing
    const it = heldItem(); G.uvOn = G.state === 'play' && it && it.kind === 'uv';
    uvSpot.intensity += ((G.uvOn ? 3 : 0) - uvSpot.intensity) * Math.min(1, dt * 10);
    camera.getWorldDirection(_v2);
    for (const w of room.writings) {
      w.getWorldPosition(_v); const d = _v.distanceTo(camera.position); _v.sub(camera.position).normalize();
      const target = G.uvOn && d < 6.5 ? clamp((_v.dot(_v2) - .9) / .07, 0, 1) : 0;
      w.material.opacity += (target - w.material.opacity) * Math.min(1, dt * 6);
    }
    const dp = dust.geometry.attributes.position; for (let i = 0; i < dp.count; i++) { let y = dp.getY(i) + dt * .02 * Math.sin(i + t * .3); dp.setY(i, y > room.plan.H ? 0 : y < 0 ? room.plan.H : y); dp.setX(i, dp.getX(i) + Math.sin(t * .2 + i) * dt * .01); } dp.needsUpdate = true;
  }
  updateHands(dt, t);
  if (G.shadowT > 0) { renderer.shadowMap.needsUpdate = true; G.shadowT -= dt; }
  renderer.clear(); renderer.render(scene, camera);
  if (G.state === 'play') { renderer.clearDepth(); renderer.render(hScene, hCam); }
}
init();
