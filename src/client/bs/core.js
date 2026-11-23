/* Blockspell core rules: pure game logic, no rendering. Runs in browser and Node. */
(function (root) {
  'use strict';

  // ---------- RNG ----------
  function mulberry(state) {
    let s = state >>> 0;
    return {
      next() {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      },
      get state() { return s; },
    };
  }
  function hashStr(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  // stream helpers operating on run.rng[name]
  function rnd(run, stream) {
    const r = mulberry(run.rng[stream]);
    const v = r.next();
    run.rng[stream] = r.state;
    return v;
  }
  function rint(run, stream, n) { return Math.floor(rnd(run, stream) * n); }
  function pick(run, stream, arr) { return arr[rint(run, stream, arr.length)]; }
  function weighted(run, stream, items, wfn) {
    let total = 0;
    for (const it of items) total += wfn(it);
    let r = rnd(run, stream) * total;
    for (const it of items) { r -= wfn(it); if (r <= 0) return it; }
    return items[items.length - 1];
  }
  function shuffle(run, stream, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = rint(run, stream, i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // ---------- Shapes ----------
  const S = {};
  function add(id, cells, w) { S[id] = { id, cells, w }; }
  add('1', [[0, 0]], 1.0);
  add('2h', [[0, 0], [1, 0]], 2); add('2v', [[0, 0], [0, 1]], 2);
  add('3h', [[0, 0], [1, 0], [2, 0]], 2); add('3v', [[0, 0], [0, 1], [0, 2]], 2);
  add('4h', [[0, 0], [1, 0], [2, 0], [3, 0]], 1.4); add('4v', [[0, 0], [0, 1], [0, 2], [0, 3]], 1.4);
  add('5h', [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], 0.9); add('5v', [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], 0.9);
  add('sq2', [[0, 0], [1, 0], [0, 1], [1, 1]], 2.4);
  add('sq3', [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]], 0.8);
  add('r23', [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]], 0.7);
  add('r32', [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]], 0.7);
  add('c3a', [[0, 0], [1, 0], [0, 1]], 1.1); add('c3b', [[0, 0], [1, 0], [1, 1]], 1.1);
  add('c3c', [[0, 0], [0, 1], [1, 1]], 1.1); add('c3d', [[1, 0], [0, 1], [1, 1]], 1.1);
  add('L4a', [[0, 0], [0, 1], [0, 2], [1, 2]], 0.55); add('L4b', [[1, 0], [1, 1], [1, 2], [0, 2]], 0.55);
  add('L4c', [[0, 0], [1, 0], [0, 1], [0, 2]], 0.55); add('L4d', [[0, 0], [1, 0], [1, 1], [1, 2]], 0.55);
  add('L4e', [[0, 0], [1, 0], [2, 0], [0, 1]], 0.55); add('L4f', [[0, 0], [1, 0], [2, 0], [2, 1]], 0.55);
  add('L4g', [[0, 0], [0, 1], [1, 1], [2, 1]], 0.55); add('L4h', [[2, 0], [0, 1], [1, 1], [2, 1]], 0.55);
  add('Ta', [[0, 0], [1, 0], [2, 0], [1, 1]], 0.55); add('Tb', [[1, 0], [0, 1], [1, 1], [2, 1]], 0.55);
  add('Tc', [[0, 0], [0, 1], [1, 1], [0, 2]], 0.55); add('Td', [[1, 0], [0, 1], [1, 1], [1, 2]], 0.55);
  add('Sa', [[1, 0], [2, 0], [0, 1], [1, 1]], 0.45); add('Sb', [[0, 0], [0, 1], [1, 1], [1, 2]], 0.45);
  add('Za', [[0, 0], [1, 0], [1, 1], [2, 1]], 0.45); add('Zb', [[1, 0], [0, 1], [1, 1], [0, 2]], 0.45);
  add('B5a', [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]], 0.45); add('B5b', [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2]], 0.45);
  add('B5c', [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]], 0.45); add('B5d', [[2, 0], [2, 1], [0, 2], [1, 2], [2, 2]], 0.45);
  const SHAPES = S;
  const SHAPE_IDS = Object.keys(S);

  const COLORS = 6; // color indices 0..5

  // ---------- Spells ----------
  // rarity: 1 common, 2 rare, 3 epic. icon names are drawn by the renderer.
  const SPELLS = [
    { id: 'ember', name: 'Ember Rune', r: 1, icon: 'flame', hue: 0, desc: '+1 Mult on every clear.' },
    { id: 'sharp', name: 'Sharp Eye', r: 1, icon: 'gem', hue: 4, desc: '+4 Chips for every block cleared.' },
    { id: 'twin', name: 'Twin Spell', r: 1, icon: 'x2', hue: 5, desc: 'Clear 2+ lines at once: +2 Mult.' },
    { id: 'piggy', name: 'Piggy Bank', r: 1, icon: 'coin', hue: 2, desc: 'After each round, +1 coin for every 4 you hold (max +5).', noEndless: true },
    { id: 'pockets', name: 'Deep Pockets', r: 1, icon: 'plus', hue: 3, desc: '+4 pieces every round.', noEndless: true },
    { id: 'lifter', name: 'Heavy Lifter', r: 1, icon: 'weight', hue: 1, desc: 'Place a piece of 5+ blocks: +30 points.' },
    { id: 'edge', name: 'Edge Runner', r: 1, icon: 'frame', hue: 4, desc: 'Lines along the board\'s edge: +2 Mult each.' },
    { id: 'tiny', name: 'Tiny Titan', r: 1, icon: 'dot', hue: 3, desc: 'A single block that finishes a line: +3 Mult.' },
    { id: 'kindle', name: 'Kindling', r: 1, icon: 'spark', hue: 1, desc: 'Your streak starts at level 2.' },
    { id: 'midas', name: 'Midas Ink', r: 1, icon: 'crown', hue: 2, desc: '1 in 4 pieces arrive as Gold. Gold blocks give +15 Chips and a coin.' },
    { id: 'magnet', name: 'Orb Magnet', r: 1, icon: 'orb', hue: 5, desc: 'Mystery Orbs show up twice as often.' },
    { id: 'clover', name: 'Four-Leaf', r: 1, icon: 'clover', hue: 3, desc: 'The Spell Wheel lands on good spells more often.' },
    { id: 'fireworks', name: 'Fireworks', r: 2, icon: 'burst', hue: 0, desc: 'Clear 3+ lines at once: x2 Mult.' },
    { id: 'hotstreak', name: 'Hot Streak', r: 2, icon: 'flame2', hue: 1, desc: 'Streak bonus is doubled.' },
    { id: 'echo', name: 'Echo', r: 2, icon: 'swirl', hue: 4, desc: 'Your first clear each round scores twice.', noEndless: true },
    { id: 'bombkit', name: 'Bomb Kit', r: 2, icon: 'bomb', hue: 0, desc: '1 in 5 pieces carries a bomb. Clearing it blasts a 3x3 area.' },
    { id: 'prism', name: 'Prism', r: 2, icon: 'prism', hue: 5, desc: '+1 Mult for each different color in the cleared lines.' },
    { id: 'patience', name: 'Patience', r: 2, icon: 'hourglass', hue: 2, desc: 'Leftover pieces pay 2 coins each instead of 1.', noEndless: true },
    { id: 'zen', name: 'Zen Garden', r: 2, icon: 'moon', hue: 4, desc: 'After 2 moves with no clear, your next clear gets +4 Mult.' },
    { id: 'corner', name: 'Corner Witch', r: 2, icon: 'corner', hue: 5, desc: 'Clearing a corner block: +40 Chips.' },
    { id: 'glass', name: 'Glass Cannon', r: 3, icon: 'bolt', hue: 4, desc: 'x2 Mult on every clear, but 6 fewer pieces each round.', noEndless: true },
    { id: 'kingmidas', name: 'King Midas', r: 3, icon: 'crown2', hue: 2, desc: 'Each Gold block cleared adds +1 Mult.' },
    { id: 'snowball', name: 'Snowball', r: 3, icon: 'snow', hue: 4, desc: 'Gains +0.5 Mult every round you clear.', lock: 2 },
    { id: 'overcharge', name: 'Overcharge', r: 3, icon: 'battery', hue: 3, desc: 'Every 4th clear gets x3 Mult.', lock: 3 },
    { id: 'sweep', name: 'Clean Sweep', r: 3, icon: 'sparkle', hue: 3, desc: 'Empty the whole board: +1,000 points and x3 on that clear.', lock: 4 },
    { id: 'lucky', name: 'Lucky Star', r: 3, icon: 'star', hue: 2, desc: 'Bad Spell Wheel results get one free re-roll.', lock: 5 },
  ];
  // Curses: negative spells. They take a spell slot and wear off after CURSE_MOVES moves.
  const CURSE_MOVES = 8;
  const MAX_SLOTS = 4;
  const CURSES = [
    { id: 'c_rust', name: 'Rusty Wand', icon: 'skull', desc: '-1 Mult on every clear.' },
    { id: 'c_dull', name: 'Dull Blocks', icon: 'crack', desc: '-5 Chips for every block cleared.' },
    { id: 'c_jinx', name: 'Jinx', icon: 'xmark', desc: 'Your streak bonus does nothing.' },
    { id: 'c_heavy', name: 'Heavy Curse', icon: 'weight', desc: 'No pieces smaller than 3 blocks.' },
    { id: 'c_gloom', name: 'Gloom', icon: 'cloud', desc: 'The Spell Wheel lands on bad spells more often.' },
    { id: 'c_clutter', name: 'Clutter', icon: 'rock', desc: 'Every 4 moves, a stone drops onto the board.' },
    { id: 'c_leak', name: 'Coin Leak', icon: 'coin', desc: 'Lose 1 coin every time you clear.', noEndless: true },
  ].map((c) => Object.assign({ curse: true, r: 0, hue: -1 }, c));
  const SPELL = {};
  SPELLS.forEach((s) => (SPELL[s.id] = s));
  CURSES.forEach((c) => (SPELL[c.id] = c));
  const PRICE = { 1: 4, 2: 6, 3: 8 };

  // ---------- Wizards ----------
  const WIZARDS = [
    { id: 'apprentice', name: 'Apprentice', hue: 3, desc: 'Starts with Ember Rune.', spells: ['ember'], coins: 4, unlock: null },
    { id: 'pyro', name: 'Pyromancer', hue: 0, desc: 'Starts with Bomb Kit. Bomb blasts add +1 Mult.', spells: ['bombkit'], coins: 4, unlock: 'Reach floor 2' },
    { id: 'alchemist', name: 'Alchemist', hue: 2, desc: 'Starts with Midas Ink and Piggy Bank, plus 8 coins.', spells: ['midas', 'piggy'], coins: 8, unlock: 'Earn 150 coins in total' },
    { id: 'trickster', name: 'Trickster', hue: 5, desc: 'Starts with Orb Magnet and Four-Leaf.', spells: ['magnet', 'clover'], coins: 4, unlock: 'Beat a full run' },
  ];
  const WIZARD = {};
  WIZARDS.forEach((w) => (WIZARD[w.id] = w));

  // ---------- Bosses ----------
  const BOSSES = [
    { id: 'stones', name: 'Stone Garden', desc: 'The board starts covered in stones.' },
    { id: 'nocols', name: 'Column Curse', desc: 'Columns don\'t clear. Only rows count.' },
    { id: 'squeeze', name: 'The Squeeze', desc: 'The board shrinks to 7x7.' },
    { id: 'heavy', name: 'Heavy Hand', desc: 'Only big pieces (4+ blocks).' },
    { id: 'halfmoon', name: 'Half Moon', desc: 'All Mult is halved.' },
    { id: 'single', name: 'Single File', desc: 'Pieces come one at a time.' },
  ];
  const BOSS = {};
  BOSSES.forEach((b) => (BOSS[b.id] = b));

  // ---------- Orb outcomes ----------
  const ORB_GOOD = [
    { id: 'tiny', name: 'Tiny Trio', desc: 'Three bonus single blocks!' },
    { id: 'kaboom', name: 'Kaboom!', desc: 'Blast the busiest 3x3 area.' },
    { id: 'double', name: 'Double Up', desc: 'x2 Mult on your next 3 clears.' },
    { id: 'zap', name: 'Line Zap', desc: 'Instantly clear your fullest row.' },
    { id: 'gold', name: 'Gold Rush', desc: '+5 coins.' },
    { id: 'more', name: 'Bonus Pieces', desc: '+4 pieces this round.' },
    { id: 'stars', name: 'Star Shower', desc: 'Free points: 12% of this round\'s target.' },
    { id: 'gift', name: 'Spell Gift', desc: 'You get a free random spell!' },
  ];
  const ORB_BAD = [
    { id: 'chonk', name: 'Chonky Block', desc: 'A piece in your tray turns into a 3x3.' },
    { id: 'freeze', name: 'Freeze', desc: '3 empty cells freeze for 6 moves.' },
    { id: 'fizzle', name: 'Fizzle', desc: 'x0.5 Mult on your next 2 clears.' },
    { id: 'gremlin', name: 'Gremlin', desc: 'A gremlin drops 3 stones on the board.' },
    { id: 'thief', name: 'Coin Thief', desc: 'Lose 3 coins.' },
    { id: 'butter', name: 'Butterfingers', desc: 'Lose 3 pieces this round.' },
    { id: 'shuffle', name: 'Shuffle', desc: 'Your tray pieces get swapped out.' },
    { id: 'curse', name: 'Cursed!', desc: 'A curse takes one of your spell slots for 8 moves.' },
  ];
  const ORB = {};
  ORB_GOOD.forEach((o) => (ORB[o.id] = Object.assign({ good: true }, o)));
  ORB_BAD.forEach((o) => (ORB[o.id] = Object.assign({ good: false }, o)));

  // ---------- Shop boosts ----------
  const BOOSTS = [
    { id: 'pieces', name: '+3 Pieces', desc: '+3 pieces every round, for the rest of the run.', price: 5, repeat: true },
    { id: 'hold', name: 'Hold Pocket', desc: 'A pocket to stash one piece for later.', price: 6, repeat: false },
    { id: 'trim', name: 'Trim Deck', desc: 'Removes the 5-long bars and 3x3 squares from your deck.', price: 5, repeat: false },
    { id: 'goldleaf', name: 'Gold Leaf', desc: '+10% chance for Gold pieces.', price: 4, repeat: true },
    { id: 'seed', name: 'Clover Seed', desc: 'Spell Wheel lands good a little more often.', price: 3, repeat: true },
  ];
  const BOOST = {};
  BOOSTS.forEach((b) => (BOOST[b.id] = b));

  // ---------- Balance ----------
  const BASE_PIECES = 24;
  const RUN_TARGETS = [
    [300, 550, 900],
    [1200, 1700, 2300],
    [3000, 3700, 4600],
  ];
  const DAILY_TARGETS = [[400, 850, 1500]];
  // Endless: cumulative score needed to reach the next level.
  function endlessTarget(level) { let t = 0; for (let i = 1; i <= level; i++) t += 800 + 600 * (i - 1); return t; }
  function levelBonus(run) { return Math.round((run.level - 1) * 0.25 * 100) / 100; }
  function levelStep(run) { return endlessTarget(run.level) - endlessTarget(run.level - 1); }
  const ORB_CHANCE = 1 / 7;
  const STREAK_STEP = 0.5;
  const MISS_LIMIT = 3;

  // ---------- Helpers ----------
  const has = (run, id) => run.spells.some((s) => s.id === id);
  const spellData = (run, id) => { const s = run.spells.find((x) => x.id === id); return s ? s.data : null; };

  function boardNew(n) { return { n, cells: new Array(n * n).fill(null) }; }
  function cellAt(b, x, y) { return b.cells[y * b.n + x]; }
  function setCell(b, x, y, v) { b.cells[y * b.n + x] = v; }
  function filledCount(b) { let c = 0; for (const v of b.cells) if (v) c++; return c; }
  function fullness(b) { return filledCount(b) / (b.n * b.n); }

  function canPlace(b, piece, x, y) {
    for (const [cx, cy] of piece.cells) {
      const gx = x + cx, gy = y + cy;
      if (gx < 0 || gy < 0 || gx >= b.n || gy >= b.n) return false;
      if (cellAt(b, gx, gy)) return false;
    }
    return true;
  }
  function anyPlacement(b, piece) {
    for (let y = 0; y < b.n; y++) for (let x = 0; x < b.n; x++) if (canPlace(b, piece, x, y)) return true;
    return false;
  }
  function pieceSize(piece) {
    let w = 0, h = 0;
    for (const [x, y] of piece.cells) { w = Math.max(w, x + 1); h = Math.max(h, y + 1); }
    return { w, h };
  }

  // lines that would be complete after placing piece at x,y (no mutation)
  function previewLines(run, piece, x, y) {
    const b = run.board;
    const n = b.n;
    const occ = new Set();
    for (const [cx, cy] of piece.cells) occ.add((y + cy) * n + (x + cx));
    const filled = (gx, gy) => !!cellAt(b, gx, gy) || occ.has(gy * n + gx);
    const rows = [], cols = [];
    for (let r = 0; r < n; r++) { let ok = true; for (let c = 0; c < n; c++) if (!filled(c, r)) { ok = false; break; } if (ok) rows.push(r); }
    if (run.boss !== 'nocols') for (let c = 0; c < n; c++) { let ok = true; for (let r = 0; r < n; r++) if (!filled(c, r)) { ok = false; break; } if (ok) cols.push(c); }
    return { rows, cols };
  }

  // ---------- Run lifecycle ----------
  function newRun(opts) {
    const seedStr = opts.seed || String(Date.now()) + ':' + Math.random();
    const seed = hashStr(seedStr);
    const w = WIZARD[opts.wizard || 'apprentice'];
    const run = {
      v: 1,
      mode: opts.mode || 'run',
      seedStr,
      wizard: w.id,
      floor: 0, round: 0,
      floors: opts.mode === 'run' || !opts.mode ? 3 : 1,
      level: 1, moves: 0, deals: 0,
      firstRun: !!opts.firstRun,
      coins: w.coins,
      spells: w.spells.map((id) => ({ id, data: {} })),
      slots: MAX_SLOTS,
      unlockedLevel: opts.level || 1,
      boosts: { pieces: 0, hold: false, trim: false, goldleaf: 0, seed: 0 },
      totalScore: 0, roundScore: 0, target: 0, boss: null,
      board: boardNew(8), pool: 0, tray: [null, null, null], hold: null,
      streak: 0, misses: 0, clears: 0, roundClears: 0, zen: false,
      mods: { double: 0, fizzle: 0 },
      revived: false, respins: 0,
      rng: { pieces: seed ^ 0x1234567, spells: seed ^ 0x2468ace, orbs: seed ^ 0x13579bd, misc: seed ^ 0x55aa55a },
      phase: 'play',
      offer: null, shop: null,
      stats: { lines: 0, best: 0, spins: 0, coinsEarned: 0, maxStreak: 0 },
      roundsWon: 0,
      history: [],
    };
    startRound(run);
    return run;
  }

  function targetFor(run) {
    const t = run.mode === 'daily' ? DAILY_TARGETS : RUN_TARGETS;
    return t[run.floor][run.round];
  }

  function piecesForRound(run) {
    let p = BASE_PIECES + run.boosts.pieces * 3;
    if (has(run, 'pockets')) p += 4;
    if (has(run, 'glass')) p -= 6;
    return Math.max(8, p);
  }

  function startRound(run) {
    run.phase = 'play';
    run.boss = run.round === 2 ? (run.history.bossPlan ? run.history.bossPlan[run.floor] : null) : null;
    if (run.round === 2 && !run.boss) run.boss = pickBoss(run);
    if (run.mode === 'endless') run.boss = null;
    run.board = boardNew(run.boss === 'squeeze' ? 7 : 8);
    run.target = run.mode === 'endless' ? endlessTarget(run.level) : targetFor(run);
    run.roundScore = 0;
    run.pool = run.mode === 'endless' ? 1e9 : piecesForRound(run);
    run.tray = [null, null, null];
    run.streak = 0; run.misses = 0; run.roundClears = 0; run.zen = false;
    run.mods = { double: 0, fizzle: 0 };
    run.respins = 0;
    run.firstClear = true;
    if (run.boss === 'stones') placeStones(run, 9, true);
    deal(run);
  }

  function pickBoss(run) {
    if (!run.usedBosses) run.usedBosses = [];
    const pool = BOSSES.filter((b) => !run.usedBosses.includes(b.id));
    const b = pick(run, 'misc', pool.length ? pool : BOSSES);
    run.usedBosses.push(b.id);
    return b.id;
  }

  function placeStones(run, count, avoidLines) {
    const b = run.board;
    const placed = [];
    let tries = 0;
    while (placed.length < count && tries < 400) {
      tries++;
      const x = rint(run, 'misc', b.n), y = rint(run, 'misc', b.n);
      if (cellAt(b, x, y)) continue;
      if (avoidLines) {
        // don't let any row/col exceed 3 stones
        let rc = 0, cc = 0;
        for (let i = 0; i < b.n; i++) { if (cellAt(b, i, y)) rc++; if (cellAt(b, x, i)) cc++; }
        if (rc >= 3 || cc >= 3) continue;
      }
      setCell(b, x, y, { color: -1, kind: 'stone' });
      placed.push([x, y]);
    }
    return placed;
  }

  function deckFor(run) {
    let ids = SHAPE_IDS;
    if (run.boosts.trim) ids = ids.filter((id) => !['5h', '5v', 'sq3'].includes(id));
    if (run.boss === 'heavy') ids = ids.filter((id) => SHAPES[id].cells.length >= 4);
    if (has(run, 'c_heavy')) ids = ids.filter((id) => SHAPES[id].cells.length >= 3);
    if (run.boss === 'squeeze') ids = ids.filter((id) => !['5h', '5v'].includes(id) || true);
    return ids;
  }

  // Endless: as the level rises, small pieces get rarer and big awkward ones more common.
  function shapeWeight(run, id) {
    const w = SHAPES[id].w;
    if (run.mode !== 'endless' || run.level <= 1) return w;
    const L = run.level - 1, size = SHAPES[id].cells.length;
    if (size <= 2) return w * Math.max(0.4, 1 - 0.05 * L);
    if (size === 4) return w * Math.min(1.5, 1 + 0.04 * L);
    if (size >= 5) return w * Math.min(2.2, 1 + 0.1 * L);
    return w;
  }
  // Endless gremlins: from level 4, stones drop every few moves; faster and heavier as you climb.
  function gremlinPlan(level) {
    if (level < 4) return null;
    return { every: Math.max(7, 18 - level), count: level >= 10 ? 3 : level >= 7 ? 2 : 1 };
  }

  function makePiece(run, forceShape) {
    const ids = deckFor(run);
    const id = forceShape || weighted(run, 'pieces', ids, (i) => shapeWeight(run, i)).toString();
    const shape = SHAPES[id];
    const piece = { shape: id, cells: shape.cells.map((c) => c.slice()), color: rint(run, 'pieces', COLORS), gold: false, orb: -1, bomb: -1 };
    let goldChance = run.boosts.goldleaf * 0.1;
    if (has(run, 'midas')) goldChance += 0.25;
    if (forceShape !== '1' && rnd(run, 'pieces') < goldChance) piece.gold = true;
    let orbChance = ORB_CHANCE * (has(run, 'magnet') ? 2 : 1);
    if (rnd(run, 'pieces') < orbChance) piece.orb = rint(run, 'pieces', piece.cells.length);
    if (has(run, 'bombkit') && rnd(run, 'pieces') < 0.2) {
      let bi = rint(run, 'pieces', piece.cells.length);
      if (bi === piece.orb) bi = (bi + 1) % piece.cells.length;
      if (bi !== piece.orb) piece.bomb = bi;
    }
    return piece;
  }

  function deal(run) {
    if (run.tray.some((p) => p)) return false;
    const per = run.boss === 'single' ? 1 : 3;
    const n = Math.min(per, run.pool);
    for (let i = 0; i < n; i++) run.tray[i] = makePiece(run);
    run.pool -= n;
    run.deals = (run.deals || 0) + 1;
    // A player's very first run shows a Mystery Orb early, so the Spell Wheel appears in the first minute.
    if (run.firstRun && run.floor === 0 && run.round === 0 && run.deals === 2 && run.tray[0]) {
      const p = run.tray.reduce((a, b) => (b && (!a || b.cells.length > a.cells.length) ? b : a), null);
      if (p) { p.orb = 0; p.bomb = -1; }
    }
    return n > 0;
  }

  function piecesLeft(run) {
    return run.pool + run.tray.filter((p) => p).length + (run.hold ? 1 : 0);
  }

  // ---------- Scoring ----------
  function streakBonus(run) {
    const s = run.streak;
    if (s <= 1 || has(run, 'c_jinx')) return 0;
    return STREAK_STEP * (s - 1) * (has(run, 'hotstreak') ? 2 : 1);
  }

  // Score a set of cleared cells. info: {rows, cols, piece, source:'move'|'zap'|'kaboom'}
  function scoreCells(run, cells, info) {
    const b = run.board;
    const n = b.n;
    const lines = (info.rows ? info.rows.length : 0) + (info.cols ? info.cols.length : 0);
    let chipsPer = 10 + (has(run, 'sharp') ? 4 : 0) - (has(run, 'c_dull') ? 5 : 0);
    let chips = 0, coins = 0, golds = 0, bombs = 0, orbs = 0;
    const colors = new Set();
    let corners = 0;
    for (const [x, y] of cells) {
      const c = cellAt(b, x, y);
      if (!c) continue;
      if (c.kind === 'stone' || c.kind === 'ice') chips += 5;
      else { chips += chipsPer; colors.add(c.color); }
      if (c.gold) { chips += 15; coins += 1; golds++; }
      if (c.bomb) bombs++;
      if (c.orb) orbs++;
      if ((x === 0 || x === n - 1) && (y === 0 || y === n - 1)) corners++;
    }
    const parts = []; // [label, kind('chips'|'mult'|'x'), value]
    let mult = 1;
    if (info.source === 'move') {
      if (lines > 1) { mult += lines - 1; }
      const sb = streakBonus(run);
      if (sb > 0) { mult += sb; parts.push(['Streak', 'mult', sb]); }
      if (has(run, 'ember')) { mult += 1; parts.push(['Ember Rune', 'mult', 1]); }
      if (has(run, 'twin') && lines >= 2) { mult += 2; parts.push(['Twin Spell', 'mult', 2]); }
      if (has(run, 'edge')) {
        let e = 0;
        for (const r of info.rows || []) if (r === 0 || r === n - 1) e++;
        for (const c of info.cols || []) if (c === 0 || c === n - 1) e++;
        if (e) { mult += 2 * e; parts.push(['Edge Runner', 'mult', 2 * e]); }
      }
      if (has(run, 'tiny') && info.piece && info.piece.cells.length === 1) { mult += 3; parts.push(['Tiny Titan', 'mult', 3]); }
      if (has(run, 'prism') && colors.size) { mult += colors.size; parts.push(['Prism', 'mult', colors.size]); }
      if (has(run, 'zen') && run.zen) { mult += 4; parts.push(['Zen Garden', 'mult', 4]); run.zen = false; }
      if (run.mode === 'endless' && run.level > 1) { const lb = levelBonus(run); mult += lb; parts.push(['Level bonus', 'mult', lb]); }
    }
    if (has(run, 'c_dull')) parts.push(['Dull Blocks', 'chips', -5]);
    if (has(run, 'corner') && corners) { chips += 40 * corners; parts.push(['Corner Witch', 'chips', 40 * corners]); }
    if (has(run, 'kingmidas') && golds) { mult += golds; parts.push(['King Midas', 'mult', golds]); }
    if (has(run, 'snowball')) { const st = (spellData(run, 'snowball').stacks || 0) * 0.5; if (st) { mult += st; parts.push(['Snowball', 'mult', st]); } }
    if (run.wizard === 'pyro' && bombs) { mult += bombs; parts.push(['Pyromancer', 'mult', bombs]); }
    if (has(run, 'c_rust') && info.source === 'move') { mult = Math.max(1, mult - 1); parts.push(['Rusty Wand', 'mult', -1]); }
    // multiplicative
    let x = 1;
    if (info.source === 'move') {
      if (has(run, 'fireworks') && lines >= 3) { x *= 2; parts.push(['Fireworks', 'x', 2]); }
      if (has(run, 'overcharge') && (run.clears + 1) % 4 === 0) { x *= 3; parts.push(['Overcharge', 'x', 3]); }
    }
    if (has(run, 'glass')) { x *= 2; parts.push(['Glass Cannon', 'x', 2]); }
    if (run.mods.double > 0 && info.source === 'move') { x *= 2; run.mods.double--; parts.push(['Double Up', 'x', 2]); }
    if (run.mods.fizzle > 0 && info.source === 'move') { x *= 0.5; run.mods.fizzle--; parts.push(['Fizzle', 'x', 0.5]); }
    if (run.boss === 'halfmoon') { x *= 0.5; parts.push(['Half Moon', 'x', 0.5]); }
    let total = mult * x;
    let gain = Math.round(chips * total);
    let echo = false;
    if (info.source === 'move' && run.firstClear && has(run, 'echo')) { gain *= 2; echo = true; parts.push(['Echo', 'x', 2]); }
    return { chips, mult: total, gain, coins, golds, bombs, orbs, lines, parts, echo, colors: colors.size };
  }

  function bombExpand(run, cellSet) {
    // returns extra cells to clear from bombs in cellSet (one wave)
    const b = run.board;
    const extra = [];
    const seen = new Set(cellSet);
    for (const k of cellSet) {
      const x = k % b.n, y = Math.floor(k / b.n);
      const c = b.cells[k];
      if (c && c.bomb) {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const gx = x + dx, gy = y + dy;
          if (gx < 0 || gy < 0 || gx >= b.n || gy >= b.n) continue;
          const kk = gy * b.n + gx;
          if (!seen.has(kk) && b.cells[kk]) { seen.add(kk); extra.push(kk); }
        }
      }
    }
    return extra;
  }

  // Place a piece from tray slot (or 'hold') at x,y. Returns event.
  function place(run, slot, x, y) {
    const piece = slot === 'hold' ? run.hold : run.tray[slot];
    if (!piece || !canPlace(run.board, piece, x, y)) return null;
    const b = run.board;
    const placed = [];
    piece.cells.forEach(([cx, cy], i) => {
      const cell = { color: piece.color, kind: 'normal' };
      if (piece.gold) cell.gold = true;
      if (i === piece.orb) cell.orb = true;
      if (i === piece.bomb) cell.bomb = true;
      setCell(b, x + cx, y + cy, cell);
      placed.push([x + cx, y + cy]);
    });
    if (slot === 'hold') run.hold = null; else run.tray[slot] = null;

    const ev = { placed, piece, points: piece.cells.length, clear: null, coins: 0 };
    if (has(run, 'lifter') && piece.cells.length >= 5) { ev.points += 30; ev.lifter = true; }

    // melt ice timers
    const melted = [];
    for (let i = 0; i < b.cells.length; i++) {
      const c = b.cells[i];
      if (c && c.kind === 'ice') { c.t--; if (c.t <= 0) { b.cells[i] = null; melted.push(i); } }
    }
    ev.melted = melted;

    // lines
    const n = b.n;
    const rows = [], cols = [];
    for (let r = 0; r < n; r++) { let ok = true; for (let c = 0; c < n; c++) if (!cellAt(b, c, r)) { ok = false; break; } if (ok) rows.push(r); }
    if (run.boss !== 'nocols') for (let c = 0; c < n; c++) { let ok = true; for (let r = 0; r < n; r++) if (!cellAt(b, c, r)) { ok = false; break; } if (ok) cols.push(c); }

    if (rows.length || cols.length) {
      run.streak = run.streak === 0 && has(run, 'kindle') ? 2 : run.streak + 1;
      run.misses = 0;
      const set = new Set();
      for (const r of rows) for (let c = 0; c < n; c++) set.add(r * n + c);
      for (const c of cols) for (let r = 0; r < n; r++) set.add(r * n + c);
      const lineKeys = Array.from(set);
      const bombKeys = bombExpand(run, lineKeys);
      // second wave (bomb hitting bomb)
      const bombKeys2 = bombExpand(run, lineKeys.concat(bombKeys)).filter((k) => !bombKeys.includes(k));
      const all = lineKeys.concat(bombKeys, bombKeys2);
      const cells = all.map((k) => [k % n, Math.floor(k / n)]);
      const sc = scoreCells(run, cells, { rows, cols, piece, source: 'move' });
      const snap = all.map((k) => ({ k, x: k % n, y: Math.floor(k / n), cell: b.cells[k] }));
      for (const k of all) b.cells[k] = null;
      let sweep = false;
      if (filledCount(b) === 0) {
        sweep = true;
        if (has(run, 'sweep')) { sc.gain = sc.gain * 3 + 1000; sc.parts.push(['Clean Sweep', 'x', 3]); }
        else { sc.gain += 300; }
      }
      run.clears++; run.roundClears++;
      run.firstClear = false;
      run.coins += sc.coins; run.stats.coinsEarned += sc.coins;
      run.stats.lines += rows.length + cols.length;
      run.stats.maxStreak = Math.max(run.stats.maxStreak, run.streak);
      ev.clear = Object.assign(sc, { rows, cols, cells: snap, bombCells: bombKeys.concat(bombKeys2), sweep, streak: run.streak });
      ev.spins = sc.orbs;
    } else {
      run.misses++;
      if (run.misses >= 2 && has(run, 'zen')) run.zen = true;
      if (run.misses >= MISS_LIMIT) run.streak = 0;
      ev.spins = 0;
    }
    const gained = ev.points + (ev.clear ? ev.clear.gain : 0);
    run.roundScore += gained;
    run.totalScore += gained;
    ev.gained = gained;
    if (gained > run.stats.best) run.stats.best = gained;
    run.moves = (run.moves || 0) + 1;
    if (ev.clear && has(run, 'c_leak') && run.coins > 0) { run.coins--; ev.leak = 1; }
    // curses wear off
    ev.expired = [];
    for (let i = run.spells.length - 1; i >= 0; i--) {
      const sp = run.spells[i];
      if (sp.curse) { sp.left--; if (sp.left <= 0) { ev.expired.push(sp.id); run.spells.splice(i, 1); } }
    }
    if (has(run, 'c_clutter') && run.moves % 4 === 0) ev.clutter = placeStones(run, 1, true).map(([cx, cy]) => cy * b.n + cx);
    const gp = run.mode === 'endless' ? gremlinPlan(run.level) : null;
    if (gp) {
      if (run.gremlinIn == null || run.gremlinIn > gp.every) run.gremlinIn = gp.every;
      run.gremlinIn--;
      if (run.gremlinIn <= 0) { ev.gremlin = placeStones(run, gp.count, true).map(([cx, cy]) => cy * b.n + cx); run.gremlinIn = gp.every; }
    }
    return ev;
  }

  // After a move (and after any wheel spins resolve). Deals, checks win/lose.
  function postMove(run) {
    if (run.mode === 'endless') {
      let lv = 0;
      while (run.roundScore >= run.target) {
        run.level++; lv++;
        run.target = endlessTarget(run.level);
        if (has(run, 'snowball')) { const d = spellData(run, 'snowball'); d.stacks = (d.stacks || 0) + 1; }
      }
      if (!run.tray.some((p) => p)) deal(run);
      const av = run.tray.filter((p) => p).concat(run.hold ? [run.hold] : []);
      if (!av.some((p) => anyPlacement(run.board, p))) { run.phase = 'failed'; run.pendingLevelUps = (run.pendingLevelUps || 0) + lv; return 'stuck'; }
      if (lv) { run.pendingLevelUps = (run.pendingLevelUps || 0) + lv; return 'levelup'; }
      return 'ok';
    }
    if (run.roundScore >= run.target) { run.phase = 'roundwon'; return 'won'; }
    if (!run.tray.some((p) => p)) deal(run);
    const avail = run.tray.filter((p) => p).concat(run.hold ? [run.hold] : []);
    if (avail.length === 0) { run.phase = 'failed'; return 'out'; }
    if (!avail.some((p) => anyPlacement(run.board, p))) { run.phase = 'failed'; return 'stuck'; }
    return 'ok';
  }

  // ---------- Orbs / wheel ----------
  function goodChance(run) {
    let p = 0.5;
    if (has(run, 'clover')) p += 0.2;
    p += run.boosts.seed * 0.08;
    const f = fullness(run.board);
    if (f > 0.55) p += 0.15;
    if (run.mode === 'endless') {
      p -= Math.min(0.25, (run.level - 1) * 0.025);
    } else {
      const total = piecesForRound(run);
      const used = 1 - piecesLeft(run) / total;
      const prog = run.roundScore / run.target;
      if (prog < used - 0.2) p += 0.1;
      if (prog > used + 0.25) p -= 0.1;
    }
    if (has(run, 'c_gloom')) p -= 0.15;
    p = Math.max(0.3, Math.min(0.9, p));
    if (has(run, 'lucky')) p = 1 - (1 - p) * (1 - p);
    if (run.mode === 'run' && run.floor === 0 && run.round === 0 && run.stats.spins === 0) p = 1; // first spin is always kind
    return p;
  }

  function spinWheel(run) {
    const goods = shuffle(run, 'orbs', ORB_GOOD.filter((o) => validOrb(run, o.id))).slice(0, 4);
    const bads = shuffle(run, 'orbs', ORB_BAD.filter((o) => validOrb(run, o.id))).slice(0, 4);
    const segs = [];
    for (let i = 0; i < 4; i++) { segs.push(goods[i % goods.length].id); segs.push(bads[i % bads.length].id); }
    const good = rnd(run, 'orbs') < goodChance(run);
    const candidates = segs.map((id, i) => i).filter((i) => ORB[segs[i]].good === good);
    const index = candidates[rint(run, 'orbs', candidates.length)];
    run.stats.spins++;
    return { segs, index, id: segs[index], good };
  }

  function validOrb(run, id) {
    if (run.mode === 'endless' && ['thief', 'gold', 'butter', 'more'].includes(id)) return false;
    if (id === 'gift' && !availableSpells(run).length) return false;
    if (id === 'curse' && run.firstRun) return false;
    if (id === 'curse' && (!availableCurses(run).length || (run.spells.length >= run.slots && !run.spells.some((sp) => !sp.curse)))) return false;
    if (id === 'thief' && run.coins < 1) return false;
    if (id === 'butter' && run.pool < 3) return false;
    if (id === 'zap' && !fullestRow(run).count) return false;
    if (id === 'kaboom' && filledCount(run.board) < 3) return false;
    if (id === 'chonk' && !run.tray.some((p) => p)) return false;
    if (id === 'shuffle' && !run.tray.some((p) => p)) return false;
    return true;
  }

  function fullestRow(run) {
    const b = run.board;
    let best = -1, count = 0;
    for (let r = 0; r < b.n; r++) {
      let c = 0;
      for (let x = 0; x < b.n; x++) if (cellAt(b, x, r)) c++;
      if (c > count) { count = c; best = r; }
    }
    return { row: best, count };
  }

  function busiest3x3(run) {
    const b = run.board;
    let best = null, bc = -1;
    for (let y = 0; y <= b.n - 3; y++) for (let x = 0; x <= b.n - 3; x++) {
      let c = 0;
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) if (cellAt(b, x + dx, y + dy)) c++;
      if (c > bc) { bc = c; best = [x, y]; }
    }
    return best;
  }

  function clearKeys(run, keys, source) {
    const b = run.board;
    const n = b.n;
    const cells = keys.map((k) => [k % n, Math.floor(k / n)]);
    const sc = scoreCells(run, cells, { rows: source === 'zap' ? [Math.floor(keys[0] / n)] : [], cols: [], source });
    const snap = keys.filter((k) => b.cells[k]).map((k) => ({ k, x: k % n, y: Math.floor(k / n), cell: b.cells[k] }));
    for (const k of keys) b.cells[k] = null;
    run.coins += sc.coins; run.stats.coinsEarned += sc.coins;
    run.roundScore += sc.gain; run.totalScore += sc.gain;
    return Object.assign(sc, { cells: snap });
  }

  function applyOrb(run, id) {
    const ev = { id, good: ORB[id].good };
    const b = run.board;
    switch (id) {
      case 'tiny': {
        const back = run.tray.filter((p) => p).length;
        run.pool += back;
        run.tray = [makePiece(run, '1'), makePiece(run, '1'), makePiece(run, '1')];
        run.tray.forEach((p) => { p.orb = -1; p.bomb = -1; });
        break;
      }
      case 'kaboom': {
        const at = busiest3x3(run);
        if (at) {
          const keys = [];
          for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) { const k = (at[1] + dy) * b.n + at[0] + dx; if (b.cells[k]) keys.push(k); }
          ev.clear = clearKeys(run, keys, 'kaboom');
          ev.center = [at[0] + 1, at[1] + 1];
        }
        break;
      }
      case 'double': run.mods.double += 3; break;
      case 'zap': {
        const fr = fullestRow(run);
        if (fr.count) {
          const keys = [];
          for (let x = 0; x < b.n; x++) { const k = fr.row * b.n + x; if (b.cells[k]) keys.push(k); }
          ev.clear = clearKeys(run, keys, 'zap');
          ev.row = fr.row;
        }
        break;
      }
      case 'gold': run.coins += 5; run.stats.coinsEarned += 5; ev.coins = 5; break;
      case 'more': run.pool += 4; break;
      case 'stars': { const g = Math.round((run.mode === 'endless' ? levelStep(run) : run.target) * 0.12); run.roundScore += g; run.totalScore += g; ev.gain = g; break; }
      case 'gift': {
        const id2 = offerSpells(run, 1)[0];
        ev.spell = id2;
        if (id2 && run.spells.length < run.slots) addSpell(run, id2); else ev.needReplace = id2;
        break;
      }
      case 'curse': {
        const pool = availableCurses(run);
        const cid = pool[rint(run, 'orbs', pool.length)].id;
        ev.curse = cid;
        if (run.spells.length < run.slots) placeCurse(run, cid); else ev.curseReplace = cid;
        break;
      }
      case 'chonk': {
        let idx = -1, min = 99;
        run.tray.forEach((p, i) => { if (p && p.cells.length < min) { min = p.cells.length; idx = i; } });
        if (idx >= 0) { const p = makePiece(run, 'sq3'); p.orb = -1; p.bomb = -1; p.gold = false; run.tray[idx] = p; ev.slot = idx; }
        break;
      }
      case 'freeze': {
        const empties = [];
        for (let i = 0; i < b.cells.length; i++) if (!b.cells[i]) empties.push(i);
        const chosen = shuffle(run, 'misc', empties).slice(0, 3);
        for (const k of chosen) b.cells[k] = { color: -1, kind: 'ice', t: 6 };
        ev.cells = chosen;
        break;
      }
      case 'fizzle': run.mods.fizzle += 2; break;
      case 'gremlin': {
        const p = placeStones(run, 3, false);
        ev.cells = p.map(([x, y]) => y * b.n + x);
        break;
      }
      case 'thief': { const l = Math.min(3, run.coins); run.coins -= l; ev.coins = -l; break; }
      case 'butter': { const l = Math.min(3, run.pool); run.pool -= l; ev.lost = l; break; }
      case 'shuffle': {
        run.tray = run.tray.map((p) => (p ? makePiece(run) : null));
        break;
      }
    }
    return ev;
  }

  // ---------- Round end / rewards ----------
  function roundRewards(run) {
    const isBoss = run.round === 2;
    const left = run.pool + run.tray.filter((p) => p).length + (run.hold ? 1 : 0);
    const per = has(run, 'patience') ? 2 : 1;
    const base = isBoss ? 6 : 3;
    const leftover = left * per;
    const interest = has(run, 'piggy') ? Math.min(5, Math.floor(run.coins / 4)) : 0;
    const total = base + leftover + interest;
    run.coins += total;
    run.stats.coinsEarned += total;
    if (has(run, 'snowball')) { const d = spellData(run, 'snowball'); d.stacks = (d.stacks || 0) + 1; }
    run.roundsWon++;
    return { base, leftover, left, interest, total, isBoss };
  }

  function availableSpells(run) {
    return SPELLS.filter((s) => !s.lock || s.lock <= run.unlockedLevel).filter((s) => !has(run, s.id)).filter((s) => !(run.mode === 'endless' && s.noEndless));
  }
  function availableCurses(run) {
    return CURSES.filter((c) => !has(run, c.id)).filter((c) => !(run.mode === 'endless' && c.noEndless));
  }
  // Put a curse in a free slot, or over the (non-curse) spell at replaceIdx.
  function placeCurse(run, cid, replaceIdx) {
    if (has(run, cid)) return false;
    const entry = { id: cid, curse: true, left: CURSE_MOVES, data: {} };
    if (run.spells.length < run.slots) { run.spells.push(entry); return true; }
    if (replaceIdx != null && run.spells[replaceIdx] && !run.spells[replaceIdx].curse) { run.spells[replaceIdx] = entry; return true; }
    return false;
  }
  function spellIds(run) { return run.spells.map((sp) => sp.id); }

  function offerSpells(run, count) {
    const pool = availableSpells(run);
    const out = [];
    const tries = 50;
    for (let t = 0; t < tries && out.length < count && pool.length; t++) {
      const rr = rnd(run, 'spells');
      const rarity = rr < 0.6 ? 1 : rr < 0.9 ? 2 : 3;
      const opts = pool.filter((s) => s.r === rarity && !out.includes(s.id));
      const any = opts.length ? opts : pool.filter((s) => !out.includes(s.id));
      if (!any.length) break;
      out.push(any[rint(run, 'spells', any.length)].id);
    }
    return out;
  }

  function makeShop(run) {
    const spells = offerSpells(run, 3).map((id) => ({ type: 'spell', id, price: PRICE[SPELL[id].r], sold: false }));
    const boosts = BOOSTS.filter((b) => b.repeat || !run.boosts[b.id]);
    const b = boosts.length ? boosts[rint(run, 'spells', boosts.length)] : null;
    const items = spells;
    if (b) items.push({ type: 'boost', id: b.id, price: b.price, sold: false });
    return { items, reroll: 2 };
  }

  function buyBoost(run, id) {
    if (id === 'pieces') run.boosts.pieces++;
    else if (id === 'hold') run.boosts.hold = true;
    else if (id === 'trim') run.boosts.trim = true;
    else if (id === 'goldleaf') run.boosts.goldleaf++;
    else if (id === 'seed') run.boosts.seed++;
  }

  // Spells are unique: a spell already in your book (or a curse) can never be added twice.
  function addSpell(run, id, replaceIdx) {
    if (!id || has(run, id) || !SPELL[id] || SPELL[id].curse) return false;
    if (run.spells.length < run.slots) { run.spells.push({ id, data: {} }); return true; }
    if (replaceIdx != null && run.spells[replaceIdx] && !run.spells[replaceIdx].curse) { run.spells[replaceIdx] = { id, data: {} }; return true; }
    return false;
  }

  function sellValue(id) { return SPELL[id].curse ? -3 : Math.max(1, Math.floor(PRICE[SPELL[id].r] / 2)); }

  function nextRound(run) {
    run.round++;
    if (run.round > 2) { run.round = 0; run.floor++; }
    if (run.floor >= run.floors) { run.phase = 'victory'; return 'victory'; }
    run.hold = null;
    startRound(run);
    return 'ok';
  }

  // Revive: clear the 3 fullest lines (rows or cols) and add pieces.
  function revive(run) {
    const b = run.board;
    const n = b.n;
    if (run.mode === 'endless') {
      const snap = [];
      for (let k = 0; k < b.cells.length; k++) if (b.cells[k]) { snap.push({ k, x: k % n, y: Math.floor(k / n), cell: b.cells[k] }); b.cells[k] = null; }
      run.revived = true; run.phase = 'play';
      if (!run.tray.some((p) => p)) deal(run);
      return { cells: snap, wiped: true };
    }
    const lines = [];
    for (let r = 0; r < n; r++) { let c = 0; for (let x = 0; x < n; x++) if (cellAt(b, x, r)) c++; lines.push({ t: 'r', i: r, c }); }
    for (let x = 0; x < n; x++) { let c = 0; for (let r = 0; r < n; r++) if (cellAt(b, x, r)) c++; lines.push({ t: 'c', i: x, c }); }
    lines.sort((a, b2) => b2.c - a.c);
    const keys = new Set();
    for (const l of lines.slice(0, 3)) for (let j = 0; j < n; j++) keys.add(l.t === 'r' ? l.i * n + j : j * n + l.i);
    const snap = Array.from(keys).filter((k) => b.cells[k]).map((k) => ({ k, x: k % n, y: Math.floor(k / n), cell: b.cells[k] }));
    for (const k of keys) b.cells[k] = null;
    run.pool += 6;
    run.revived = true;
    run.phase = 'play';
    if (!run.tray.some((p) => p)) deal(run);
    return { cells: snap };
  }

  // XP and unlocks at run end
  function xpForRun(run) {
    return Math.floor(run.totalScore / 25) + run.roundsWon * 40 + (run.mode === 'endless' ? (run.level - 1) * 40 : 0);
  }
  function xpNeeded(level) { return 500 + level * 300; }

  const api = {
    CURSES, CURSE_MOVES, MAX_SLOTS, endlessTarget, levelStep, levelBonus, gremlinPlan, availableSpells, availableCurses, placeCurse, spellIds,
    SHAPES, SHAPE_IDS, COLORS, SPELLS, SPELL, WIZARDS, WIZARD, BOSSES, BOSS, ORB, ORB_GOOD, ORB_BAD, BOOSTS, BOOST, PRICE,
    RUN_TARGETS, DAILY_TARGETS, BASE_PIECES,
    mulberry, hashStr, newRun, startRound, nextRound, deal, place, postMove, canPlace, anyPlacement, previewLines,
    spinWheel, applyOrb, roundRewards, offerSpells, makeShop, buyBoost, addSpell, sellValue, revive, piecesLeft,
    piecesForRound, fullness, has, spellData, pieceSize, xpForRun, xpNeeded, goodChance, streakBonus, cellAt,
    rnd, rint,
  };
  root.BS = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
