'use strict';
/* =====================================================================
   LEVEL GENERATOR — builds a pure-data plan. Every lock's requirements
   are hidden *outside* that lock (only in empty/unlocked places, or in
   newly locked containers deeper in the chain), so a plan is always solvable.
   ===================================================================== */
const LOCKDEFS = {
  key1: { type: 'slots', kind: 'key', n: 1, label: 'a keyhole' }, key2: { type: 'slots', kind: 'key', n: 2, label: '2 keyholes' }, key3: { type: 'slots', kind: 'key', n: 3, label: '3 keyholes' },
  gem2: { type: 'slots', kind: 'gem', n: 2, label: '2 gem sockets' }, gem3: { type: 'slots', kind: 'gem', n: 3, label: '3 gem sockets' },
  code3: { type: 'code', n: 3, label: '3-digit keypad' }, code4: { type: 'code', n: 4, label: '4-digit keypad' },
  dial3: { type: 'dial', n: 3, label: 'symbol dials' }, dial4: { type: 'dial', n: 4, label: 'symbol dials' },
  color4: { type: 'colorseq', n: 4, label: 'colored buttons' }, color5: { type: 'colorseq', n: 5, label: 'colored buttons' },
  lever3: { type: 'levers', n: 3, label: 'lever panel' }, lever4: { type: 'levers', n: 4, label: 'lever panel' },
  tool: { type: 'tool', n: 1, label: 'nailed shut' },
  word4: { type: 'word', n: 4, label: '4-letter word lock' }, word5: { type: 'word', n: 5, label: '5-letter word lock' },
};
const ALLOWED = {
  drawer: ['key1'], crate: ['tool'], safe: ['code3', 'code4', 'code4', 'key1'],
  chest: ['key1', 'gem2', 'gem3', 'code3', 'code4', 'code4', 'dial4', 'color4', 'lever4', 'word4', 'word5'],
  cabinet: ['key1', 'gem2', 'code3', 'code4', 'dial3', 'dial4', 'lever3', 'lever4', 'word4'],
  door: ['key2', 'gem3', 'code4', 'code4', 'dial4', 'color4', 'color5', 'lever4', 'word5', 'word4'],
};
const RIDDLES = [
  ['ECHO', 'I speak without a mouth and hear without ears. I have no body, but I come alive with the wind.'],
  ['FIRE', 'I am not alive, but I grow. I have no lungs, but I need air. Water kills me.'],
  ['NAME', 'It belongs to you, yet other people use it far more than you do.'],
  ['DARK', 'The more of me there is, the less you see.'],
  ['HOLE', 'The more you take away from me, the bigger I get.'],
  ['BOOK', 'I have a spine but no bones, and leaves but no branches.'],
  ['TIME', 'I fly without wings and heal all wounds, yet no one has ever seen me.'],
  ['CLOCK', 'I have a face and two hands, but no arms or legs.'],
  ['PIANO', 'I have many keys, yet I cannot open a single lock.'],
  ['TOWEL', 'The more I dry, the wetter I get.'],
  ['STAMP', 'I travel all around the world while staying in one corner.'],
  ['RIVER', 'I have a bed but never sleep, and a mouth but never eat.'],
];
const DIGIT_FACTS = [
  ['the number of legs on a snake', 'the number of corners on a circle'],
  ['the number of horns on a unicorn', 'the number of noses on your face'],
  ['the number of wheels on a bicycle', 'the number of eyes on an owl'],
  ['the number of sides on a triangle', 'the number of wishes a genie grants', 'the number of blind mice in the rhyme'],
  ['the number of legs on a chair', 'the number of seasons in a year', 'the number of leaves on a lucky clover'],
  ['the number of fingers on one hand', 'the number of points on a starfish', 'the number of vowels (not counting Y)'],
  ['the number of legs on an insect', 'the number of faces on a die', 'the number of candles on this room\'s chandelier'],
  ['the number of days in a week', 'the number of colors in a rainbow', 'the number of dwarfs in Snow White'],
  ['the number of legs on a spider', 'the number of arms on an octopus', 'the number of sides on a stop sign'],
  ['the number of lives of a cat', 'the number of squares in a tic-tac-toe grid', 'the number of innings in a baseball game'],
];
const CIPHER_WORDS = { 3: ['BAD', 'BED', 'CAB', 'DIG', 'FIG', 'AID', 'BEG', 'HID'], 4: ['HIDE', 'BEAD', 'FACE', 'CAGE', 'ACHE', 'DICE', 'IDEA', 'AGED', 'HEAD', 'DEAF', 'FADE', 'BIDE', 'CHEF'] };
const ORD = ['1st', '2nd', '3rd', '4th', '5th'];
const BOOK_TITLES = ['A History of Locks', 'The Clockmaker\'s Daughter', 'Riddles & Enigmas', 'Atlas of Forgotten Places', 'Collected Poems', 'On the Origin of Keys', 'Secrets of the Old House', 'The Alchemist\'s Notes', 'Birds of the Moor', 'Victorian Plumbing, Vol. II'];
const DECOY_NOTES = [
  ['Shopping list', 'Eggs (12)<br>Milk (2)<br>Candles (6)<br>Lamp oil<br><i>…and don\'t forget the 3 letters!</i>'],
  ['Phone number', 'Call the locksmith: <b>555-0193</b>'],
  ['Diary page', 'Day 41. The professor changed the combination again. I think it starts with a <b>7</b>… or was it a 1?'],
  ['Crossed-out note', '<s>4 8 1 5</s> — wrong, wrong, WRONG.'],
  ['Reminder', 'The code is NOT my birthday (<b>0312</b>). Stop trying it.'],
  ['Recipe card', 'Bake at <b>180</b> degrees for <b>25</b> minutes. Serves 4.'],
  ['Scribbles', '▲ ▼ ▼ ▲ … no, that\'s not it either.'],
  ['Torn receipt', 'TOTAL: $<b>27.40</b> — THANK YOU'],
  ['Poem', 'Roses are red, violets are blue,<br>the answer is hidden — but not here for you.'],
  ['Letter', 'Dear J., the rusty key opens nothing of value. Don\'t waste your time. — M.'],
  ['Chess notes', 'Knight to <b>E4</b>. Bishop to <b>C6</b>. Checkmate in 3.'],
  ['Locker combo', 'Gym locker: <b>22-14-08</b>'],
  ['Riddle?', '"What has a neck but no head?" — a BOTTLE. (Not useful. Probably.)'],
  ['Note to self', 'Feed the cat. Water the plants. Hide the <b>gold</b> key somewhere clever.'],
];
const DECOY_BOOK = ['Chapter 7: The year was <b>1887</b>, and the house had <b>14</b> rooms…', 'The pages are dense footnotes about Victorian plumbing. Nothing useful.', 'Someone underlined the words “<i>look closer</i>”… but nothing else.', 'A pressed flower falls out. Pretty, but useless.', 'Page <b>394</b> is dog-eared. The text is about migrating geese.', 'Every page is blank except one: <b>“ECHO?”</b> scrawled in pencil.'];
const WALLNAME = { N: 'the far wall (by the exit)', S: 'the back wall (by the entrance)', E: 'the right-hand wall', W: 'the left-hand wall' };
const NOTE_FLAVOR = [
  'I keep forgetting the combination for the {h}, so I wrote it down:',
  'Memo to self — {h}:',
  'Whoever finds this: the {h} opens with',
  'Do NOT lose this again. For the {h}:',
  'Professor\'s reminder — the {h}:',
];

const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
function wallXY(P, wall, t, off) {
  switch (wall) {
    case 'N': return { x: t, z: -P.D / 2 + off, rot: 0 };
    case 'S': return { x: t, z: P.D / 2 - off, rot: Math.PI };
    case 'E': return { x: P.W / 2 - off, z: t, rot: -Math.PI / 2 };
    default: return { x: -P.W / 2 + off, z: t, rot: Math.PI / 2 };
  }
}

/* re-roll until the room's lock count fits the difficulty band for this level */
function generateRoom(seed, level) {
  const lo = Math.min(4 + Math.floor(level / 2), 8), hi = Math.min(7 + level, 13);
  let best = null;
  for (let k = 0; k < 40; k++) {
    const P = generate((seed + k * 104729) >>> 0, level), n = P.locks.length;
    const steps = n + P.items.filter(i => !i.decoy).length;
    if (n >= lo && n <= hi && steps >= 6 + level) return P;
    if (!best || Math.abs(n - (lo + hi) / 2) < Math.abs(best.locks.length - (lo + hi) / 2)) best = P;
  }
  return best;
}
function generate(seed, level) {
  const rng = new RNG(seed);
  const P = {
    seed, level, H: 3.0, W: rng.int(8, 9) + Math.min(3, Math.floor(level / 2)), D: rng.int(8, 9) + Math.min(3, Math.floor(level / 2)),
    bays: [], furn: [], comps: [], items: [], wall: [], props: [], locks: [], spots: [], door: { locks: [] }, palette: rng.int(0, 3), center: null, usedWords: []
  };
  const dmax = level <= 1 ? 3 : 4;
  const pLock = d => d === 1 ? 1 : d === 2 ? Math.min(.8, .4 + .08 * level) : Math.min(.6, .1 + .1 * level);
  const colorPools = { key: rng.shuffle(PAL_NAMES.slice()), gem: rng.shuffle(PAL_NAMES.slice()) };
  const lockUse = {}, typeUse = {};
  let uvItem = null, crowbar = null, clockUsed = false;

  /* ---------- layout: wall bays ---------- */
  for (const [wl, L, mar] of [['N', P.W, 0], ['S', P.W, 0], ['E', P.D, .9], ['W', P.D, .9]]) {
    let nb = Math.floor((L - 2 * mar) / 2.2); if ((wl === 'N' || wl === 'S') && nb % 2 === 0) nb--;
    const bw = (L - 2 * mar) / nb;
    for (let i = 0; i < nb; i++) {
      if ((wl === 'N' || wl === 'S') && i === (nb - 1) / 2) continue; // exit / entrance doors
      const t = -L / 2 + mar + bw * (i + .5);
      P.bays.push({ wall: wl, t, bw, floor: null, wallUsed: false, tall: false });
      for (const s of [-1, 1]) { const p = wallXY(P, wl, t + s * (bw / 2 - .24), .3); P.spots.push({ kind: 'floor', x: p.x, z: p.z, where: 'on the floor along ' + WALLNAME[wl], wall: wl }); }
    }
  }
  /* ---------- furniture ---------- */
  const bag = rng.shuffle(['desk', 'chest', 'cabinet', 'dresser', 'safe', 'bookshelf', 'chest', 'cabinet', 'crate', 'dresser', 'desk', 'bookshelf', 'safe', 'chest', 'cabinet']);
  const drawerNames = n => n === 2 ? ['top drawer', 'bottom drawer'] : ['top drawer', 'middle drawer', 'bottom drawer'];
  const addComp = (kind, name, wall, extra) => { const c = Object.assign({ id: 'c' + P.comps.length, kind, name, desc: name + ' by ' + WALLNAME[wall], wall, items: [], lock: null, reqs: [], cap: 3 }, extra); P.comps.push(c); return c; };
  for (const b of rng.shuffle(P.bays.slice())) {
    if (!bag.length || rng.chance(.12)) continue;
    let type = bag.pop(); const [w, d, h] = FDIMS[type];
    if (w > b.bw - .3) continue;
    const xf = wallXY(P, b.wall, b.t, d / 2 + .03);
    const f = { idx: P.furn.length, type, x: xf.x, z: xf.z, rot: xf.rot, w, d, h, wall: b.wall, comps: [] };
    P.furn.push(f); b.floor = f; b.tall = h > 1.3;
    if (type === 'desk' || type === 'dresser') {
      const names = drawerNames(type === 'desk' ? 2 : 3);
      names.forEach((nm, ci) => f.comps.push(addComp('drawer', `${type}'s ${nm}`, b.wall, { furn: f.idx, ci, cap: 2 }).id));
    } else if (type !== 'bookshelf' && type !== 'table') {
      const nm = { chest: 'chest', cabinet: 'cabinet', safe: 'safe', crate: 'wooden crate' }[type];
      f.comps.push(addComp(type, nm, b.wall, { furn: f.idx, ci: 0 }).id);
    }
    const nsp = { desk: 3, dresser: 2, safe: 1 }[type] || 0;
    for (let li = 0; li < nsp; li++) P.spots.push({ kind: 'furn', f: f.idx, li, where: `on top of the ${type} by ${WALLNAME[b.wall]}`, wall: b.wall });
  }
  // center table + rug
  if (rng.chance(.85)) {
    P.center = { x: rng.range(-.6, .6), z: rng.range(-.8, .1), rot: rng.chance(.5) ? 0 : Math.PI / 2 };
    const f = { idx: P.furn.length, type: 'table', x: P.center.x, z: P.center.z, rot: P.center.rot, w: FDIMS.table[0], d: FDIMS.table[1], h: FDIMS.table[2], wall: null, comps: [] };
    P.furn.push(f);
    for (let li = 0; li < 4; li++) P.spots.push({ kind: 'furn', f: f.idx, li, where: 'on the table in the middle of the room', wall: null });
  }
  // disambiguate identical furniture on the same wall ("…nearer the exit", "…on the left")
  const byKey = {};
  for (const f of P.furn) if (f.wall) (byKey[f.type + f.wall] = byKey[f.type + f.wall] || []).push(f);
  for (const list of Object.values(byKey)) if (list.length > 1) {
    const ew = list[0].wall === 'E' || list[0].wall === 'W';
    list.sort((a, b) => ew ? a.z - b.z : a.x - b.x).forEach((f, k) => {
      const q = ew ? (k === 0 ? ' (nearer the exit)' : ' (nearer the entrance)') : (k === 0 ? ' (left one)' : ' (right one)');
      for (const cid of f.comps) { const c = P.comps.find(c => c.id === cid); c.desc = c.name + q + ' by ' + WALLNAME[f.wall]; }
    });
  }
  rng.shuffle(P.spots);

  /* ---------- helpers ---------- */
  const freeWallBays = () => P.bays.filter(b => !b.wallUsed && !b.tall);
  const takeWallBay = () => { const f = freeWallBays(); if (!f.length) return null; const b = rng.pick(f); b.wallUsed = true; return b; };
  const takeSpot = () => {
    let s = P.spots.find(s => !s.used);
    for (let k = 0; !s && k < 30; k++) {
      const x = rng.range(-P.W / 2 + 1.4, P.W / 2 - 1.4), z = rng.range(-P.D / 2 + 1.4, P.D / 2 - 2);
      if (P.center && Math.hypot(x - P.center.x, z - P.center.z) < 1.4) continue;
      if (P.spots.some(o => o.kind === 'floor' && Math.hypot(o.x - x, o.z - z) < .6)) continue;
      s = { kind: 'floor', x, z, where: 'on the floor', wall: null }; P.spots.push(s);
    }
    if (!s) { s = { kind: 'floor', x: rng.range(-1, 1), z: P.D / 2 - 2.2, where: 'on the floor', wall: null }; P.spots.push(s); }
    s.used = true; return s;
  };
  const newItem = (kind, extra) => { const it = Object.assign({ id: 'i' + P.items.length, kind, loc: null, reqs: [] }, extra); P.items.push(it); return it; };
  const putIn = (it, c) => { it.loc = { type: 'comp', comp: c.id }; c.items.push(it.id); it.reqs = c.reqs.slice(); it.where = c.kind === 'wallsafe' ? c.desc : 'in the ' + c.desc; it.wall = c.wall; };
  const makeWallSafe = () => { const b = takeWallBay(); if (!b) return null; const c = addComp('wallsafe', 'painting', b.wall, { cap: 2 }); c.desc = 'behind the painting on ' + WALLNAME[b.wall]; P.wall.push({ type: 'wallsafe', bay: b, comp: c.id }); return c; };
  const pickLockable = () => {
    const c = P.comps.filter(c => !c.lock && !c.items.length && c.kind !== 'wallsafe');
    if (!c.length) return null;
    return rng.weighted(c.map(x => [x, x.kind === 'drawer' ? .22 : x.kind === 'crate' ? 1.2 : 3]));
  };
  const pickOpenComp = () => { const c = P.comps.filter(c => !c.lock && c.items.length < c.cap); return c.length ? rng.pick(c) : null; };

  function hide(it, depth) {
    if (depth < dmax && rng.chance(pLock(depth))) { const c = pickLockable(); if (c) { lockComp(c, depth); putIn(it, c); return; } }
    const m = rng.weighted([['spot', 3], ['prop', 3], ['comp', 4], ['wallsafe', 2]]);
    if (m === 'comp') { const c = pickOpenComp(); if (c) { putIn(it, c); return; } }
    if (m === 'wallsafe') { const c = makeWallSafe(); if (c) { putIn(it, c); return; } }
    const s = takeSpot(); it.loc = { type: 'spot', spot: s }; it.reqs = []; it.wall = s.wall;
    if (m === 'prop' || rng.chance(.2)) { s.cover = rng.pick(Object.keys(PROPS)); it.where = `under the ${PROPS[s.cover].name} ${s.where}`; }
    else it.where = s.where;
  }
  function makeLock(def, host) {
    const d = LOCKDEFS[def], L = { id: 'L' + P.locks.length, def, type: d.type, kind: d.kind, n: d.n, host, colors: [], answer: [], tokens: [], clueHint: '' };
    P.locks.push(L); lockUse[def] = (lockUse[def] || 0) + 1; typeUse[d.type] = (typeUse[d.type] || 0) + 1;
    if (d.type === 'slots') for (let i = 0; i < d.n; i++) L.colors.push(colorPools[d.kind].pop() || 'white');
    if (d.type === 'code') for (let i = 0; i < d.n; i++) L.answer.push(rng.int(0, 9));
    if (d.type === 'dial') for (let i = 0; i < d.n; i++) L.answer.push(rng.int(0, 5));
    if (d.type === 'colorseq') { do { L.answer = []; for (let i = 0; i < d.n; i++) L.answer.push(rng.int(0, 3)); } while (new Set(L.answer).size < 3); }
    if (d.type === 'word') {
      const r = rng.pick(RIDDLES.filter(r => r[0].length === d.n && !P.usedWords.includes(r[0]))) || rng.pick(RIDDLES.filter(r => r[0].length === d.n));
      P.usedWords.push(r[0]); L.word = r[0]; L.riddle = r[1]; L.answer = r[0].split('');
      L.letters = L.answer.map(ch => { const s = new Set([ch]); while (s.size < 6) s.add('ABCDEFGHIKLMNOPRSTUW'[rng.int(0, 19)]); return rng.shuffle([...s]); });
    }
    if (d.type === 'levers') { do { L.answer = []; for (let i = 0; i < d.n; i++) L.answer.push(rng.chance(.5) ? 1 : 0); } while (!L.answer.includes(1) || !L.answer.includes(0)); }
    return L;
  }
  function chooseDef(list) { return rng.weighted(list.map(d => [d, 1 / (1 + 2.5 * (lockUse[d] || 0) + 1.5 * (typeUse[LOCKDEFS[d].type] || 0))])); }
  function lockComp(c, depth) {
    const L = makeLock(chooseDef(ALLOWED[c.kind]), c.desc); c.lock = L.id; L.comp = c.id;
    provide(L, depth + 1); c.reqs = L.tokens.slice();
  }
  function provide(L, depth) {
    if (L.type === 'slots') {
      for (const col of L.colors) { const it = newItem(L.kind, { color: col }); hide(it, depth); L.tokens.push(it.id); }
      L.clueHint = `Use the ${L.colors.join(', ')} ${L.kind}${L.n > 1 ? 's' : ''} on the ${L.host}.`;
    } else if (L.type === 'tool') {
      if (crowbar) L.tokens.push(crowbar.id); else { const it = newItem('crowbar'); hide(it, depth); crowbar = it; L.tokens.push(it.id); }
      L.clueHint = `Pry the ${L.host} open with the crowbar.`;
    } else deliverClue(L, depth);
  }
  // a readable clue: either a loose note or a book with a slip tucked inside
  function paper(depth, title, html) {
    const book = rng.chance(.35);
    const it = newItem(book ? 'book' : 'note', { title: book ? rng.pick(BOOK_TITLES) : title, html: book ? `<i>Tucked between the pages is a slip of paper:</i><br>${html}` : html });
    hide(it, depth); return it;
  }
  function deliverClue(L, depth) {
    const H = L.host, hasWall = () => freeWallBays().length > 0, tk = it => L.tokens.push(it.id);
    const wallClue = (type, clue) => { const b = takeWallBay(); P.wall.push({ type, bay: b, clue, host: H }); return b; };
    const uvClue = clue => { const b = wallClue('uv', clue); if (uvItem) L.tokens.push(uvItem.id); else { const u = newItem('uv'); hide(u, depth); uvItem = u; L.tokens.push(u.id); } return b; };
    if (L.type === 'code') {
      const opts = [['direct', .6], ['split', 3], ['facts', 3], ['cards', 3]];
      if (L.n <= 4) opts.push(['cipher', 3]);
      if (L.n === 4 && !clockUsed && hasWall()) opts.push(['clock', 2.5]);
      if (hasWall()) opts.push(['uv', 1.5]);
      const m = rng.weighted(opts);
      if (m === 'clock') {
        const h = rng.int(1, 12), mi = rng.int(0, 11) * 5; L.answer = [h / 10 | 0, h % 10, mi / 10 | 0, mi % 10]; clockUsed = true;
        const b = takeWallBay(); P.wall.push({ type: 'clock', bay: b, h, m: mi, lock: L.id, host: H });
        L.clueHint = `The clock on ${WALLNAME[b.wall]} has stopped — its time (HHMM) is the code for the ${H}.`; L.clockClue = true;
      } else if (m === 'cipher') {
        const word = rng.pick(CIPHER_WORDS[L.n]); L.answer = word.split('').map(c => 'ABCDEFGHI'.indexOf(c) + 1);
        tk(paper(depth, 'Odd note', `The <b>${H}</b> answers to a word, not a number:<div class="clue">${clueHTML({ type: 'word', value: word })}</div>`));
        if (hasWall() && rng.chance(.5)) { const b = wallClue('poster', { type: 'cipher' }); L.clueHint = `Turn the code word into numbers with the letter chart on ${WALLNAME[b.wall]}, then use it on the ${H}.`; }
        else { tk(paper(depth, 'Strange card', `A card with a chart printed on it:<div class="clue">${clueHTML({ type: 'cipher' })}</div>`)); L.clueHint = `Find the code word AND the letter→number chart, then convert the word for the ${H}.`; }
      } else if (m === 'facts') {
        const lines = L.answer.map((d, i) => `The ${ORD[i]} digit is ${rng.pick(DIGIT_FACTS[d])}.`);
        if (L.n >= 4 && rng.chance(.5)) { const h = Math.ceil(L.n / 2); tk(paper(depth, 'Riddle page (1 of 2)', `The code for the <b>${H}</b>…${clueHTML({ type: 'riddles', value: lines.slice(0, h) })}`)); tk(paper(depth, 'Riddle page (2 of 2)', `…continued:${clueHTML({ type: 'riddles', value: lines.slice(h) })}`)); }
        else tk(paper(depth, 'Riddle page', `Work out the code for the <b>${H}</b>:${clueHTML({ type: 'riddles', value: lines })}`));
        L.clueHint = `Solve each digit's riddle to get the code for the ${H}.`;
      } else if (m === 'cards') {
        const cols = rng.shuffle(PAL_NAMES.slice()).slice(0, L.n);
        L.answer.forEach((d, i) => { const it = newItem('card', { color: cols[i], digit: d, title: `${cap1(cols[i])} number card`, html: `A card with a <b style="color:${PAL[cols[i]].css}">${cols[i]}</b> border and a single number:<div class="clue"><span class="big">${d}</span></div>` }); hide(it, depth); tk(it); });
        if (hasWall() && rng.chance(.55)) { const b = wallClue('poster', { type: 'colororder', value: cols }); L.clueHint = `Collect all ${L.n} colored number cards and read them in the color order shown on ${WALLNAME[b.wall]}.`; }
        else { tk(paper(depth, 'Color order', `For the <b>${H}</b>, read the cards in this order:<div class="clue">${clueHTML({ type: 'colororder', value: cols })}</div>`)); L.clueHint = `Collect the colored number cards, then find the note with their color order (for the ${H}).`; }
      } else if (m === 'split') {
        const k = L.n >= 4 ? rng.int(2, 3) : 2, pos = rng.shuffle([...Array(L.n).keys()]);
        for (let j = 0; j < k; j++) {
          const mine = pos.filter((_, q) => q % k === j), partial = L.answer.map((v, i) => mine.includes(i) ? v : null);
          const it = newItem('note', { title: `Torn scrap (${j + 1} of ${k})`, scrap: true, html: `…part of the code for the <b>${H}</b>…<div class="clue">${clueHTML({ type: 'digits', value: L.answer, partial })}</div><i>The rest is torn away.</i>` }); hide(it, depth); tk(it);
        }
        L.clueHint = `The ${H} code was torn into ${k} scraps — find every piece.`;
      } else if (m === 'uv') {
        const b = uvClue({ type: 'digits', value: L.answer.slice() }); L.clueHint = `Hold the UV flashlight and look at ${WALLNAME[b.wall]} — hidden writing gives the code for the ${H}.`;
      } else {
        tk(paper(depth, 'Handwritten note', `${rng.pick(NOTE_FLAVOR).replace('{h}', '<b>' + H + '</b>')}<div class="clue">${clueHTML({ type: 'digits', value: L.answer })}</div>`)); L.clueHint = `A note somewhere has the code for the ${H}.`;
      }
      return;
    }
    if (L.type === 'word') {
      const clue = { type: 'text', value: L.riddle }, opts = [['paper', 4]]; if (hasWall()) opts.push(['poster', 2], ['uv', 1.5]);
      const m = rng.weighted(opts);
      if (m === 'paper') { tk(paper(depth, 'A riddle', `Scrawled next to a doodle of the <b>${H}</b>:${clueHTML(clue)}<small>(${L.n} letters)</small>`)); L.clueHint = `Find the riddle — its ${L.n}-letter answer opens the ${H}.`; }
      else if (m === 'poster') { const b = wallClue('poster', clue); L.clueHint = `Solve the framed riddle on ${WALLNAME[b.wall]} — its ${L.n}-letter answer opens the ${H}.`; }
      else { const b = uvClue(clue); L.clueHint = `A riddle is written in UV ink on ${WALLNAME[b.wall]} — its answer opens the ${H}.`; }
      return;
    }
    const clue = { type: { dial: 'symbols', colorseq: 'colors', levers: 'levers' }[L.type], value: L.answer.slice() }, opts = [['paper', 3]];
    if (hasWall()) opts.push(['poster', 3], ['uv', 2]);
    const m = rng.weighted(opts);
    if (m === 'paper') { tk(paper(depth, 'Sketch', `A sketch labelled “<b>${H}</b>”:<div class="clue">${clueHTML(clue)}</div>`)); L.clueHint = `A drawing somewhere shows the pattern for the ${H}.`; }
    else if (m === 'poster') { const b = wallClue('poster', clue); L.clueHint = `The framed card on ${WALLNAME[b.wall]} shows the pattern for the ${H}.`; }
    else { const b = uvClue(clue); L.clueHint = `Hold the UV flashlight and look at ${WALLNAME[b.wall]} — the pattern for the ${H} is written there.`; }
  }

  /* ---------- the exit door ---------- */
  const doorPool = level <= 1 ? ['code4', 'gem3', 'color4', 'lever4', 'dial4', 'word5'] : ALLOWED.door;
  const nDoor = level >= 3 && rng.chance(.4 + .1 * level) ? 2 : 1;
  for (let k = 0; k < nDoor; k++) {
    const pool = doorPool.filter(d => !P.door.locks.some(id => P.locks.find(l => l.id === id).type === LOCKDEFS[d].type));
    const L = makeLock(chooseDef(pool), 'exit door'); L.door = k; P.door.locks.push(L.id); provide(L, 1);
  }
  /* ---------- decoys ---------- */
  const junk = Object.keys(ITEMS).filter(k => ITEMS[k].junk), decoys = [];
  for (let i = 0, n = rng.int(6, 9); i < n; i++) decoys.push(newItem(rng.pick(junk), { decoy: true }));
  for (let i = 0, n = rng.int(3, 5); i < n; i++) {
    if (rng.chance(.4)) decoys.push(newItem('book', { decoy: true, title: rng.pick(BOOK_TITLES), html: rng.pick(DECOY_BOOK) }));
    else { const [t, h] = rng.pick(DECOY_NOTES); decoys.push(newItem('note', { decoy: true, title: t, html: h })); }
  }
  if (rng.chance(.75)) decoys.push(newItem('key', { decoy: true, color: 'rusty' }));
  for (const it of decoys) {
    const c = rng.chance(.55) ? pickOpenComp() : null;
    if (c) putIn(it, c); else { const s = takeSpot(); it.loc = { type: 'spot', spot: s }; it.where = s.where; if (rng.chance(.25)) s.cover = rng.pick(Object.keys(PROPS)); }
  }
  for (let i = 0, n = rng.int(6, 9); i < n; i++) { const s = takeSpot(); s.cover = rng.pick(Object.keys(PROPS)); }
  // leftover wall bays get decorative paintings
  for (const b of freeWallBays()) if (rng.chance(.75)) { b.wallUsed = true; P.wall.push({ type: 'painting', bay: b }); }
  return P;
}
