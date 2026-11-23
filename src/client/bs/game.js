/* Blockspell: scenes, input, effects, platform integration (Poki or Reddit). */
(function () {
  'use strict';
  const { PAL, BLOCK, text, rr, panel, button, drawBlock, spellBadge, mascot, logo, para, star, icon, RARITY } = GFX;
  const cvs = document.getElementById('game');
  // Opaque canvas: the browser can skip blending it over the page every frame.
  const ctx = cvs.getContext('2d', { alpha: false });

  // ---------- utils ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const easeBack = (t) => { t = clamp(t, 0, 1); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const inR = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  const haptic = (ms) => { try { if (G.save.sound && navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* ignore */ } };

  // ---------- Platform hooks ----------
  // On Reddit, BS_PLATFORM (set by the Devvit entry script) syncs saves, records daily scores and
  // shares results. There are no ads there, so "rewarded" buttons simply grant their reward.
  const PF = window.BS_PLATFORM || null;
  const NO_ADS = !!(PF && PF.noAds);

  // ---------- Poki SDK wrapper ----------
  // Poki SDK rules: gameplayStart/Stop never fire twice in a row or while an ad is playing,
  // commercialBreak only on the way back into gameplay, rewards only when an ad really played.
  const Poki = {
    sdk: null, playing: false, inAd: false,
    init() {
      const s = window.PokiSDK;
      if (!s) return Promise.resolve();
      return s.init().then(() => { Poki.sdk = s; }).catch(() => { Poki.sdk = s; });
    },
    call(fn, ...a) { try { if (Poki.sdk && Poki.sdk[fn]) return Poki.sdk[fn](...a); } catch (e) { /* ignore */ } return null; },
    loadingDone() { Poki.call('gameLoadingFinished'); },
    start() { if (Poki.playing || Poki.inAd) return; Poki.playing = true; Poki.call('gameplayStart'); },
    stop() { if (!Poki.playing || Poki.inAd) return; Poki.playing = false; Poki.call('gameplayStop'); },
    commercial() {
      Poki.stop();
      if (Poki.inAd || !Poki.sdk) return Promise.resolve();
      Poki.inAd = true;
      return new Promise((res) => {
        const done = () => { Poki.inAd = false; G.adActive = false; SFX.setAdMute(false); res(); };
        try {
          Poki.sdk.commercialBreak(() => { G.adActive = true; SFX.setAdMute(true); }).then(done).catch(done);
        } catch (e) { done(); }
      });
    },
    rewarded(size) {
      if (NO_ADS) return Promise.resolve(true);
      if (Poki.inAd) return Promise.resolve(false);
      if (!Poki.sdk) {
        // No SDK (preview build, or the SDK was blocked): only the preview shows a placeholder ad.
        if (!window.BS_PREVIEW) return Promise.resolve(false);
        Poki.inAd = true;
        return new Promise((res) => { G.fakeAd = { t0: G.t, dur: 1.6, res: (ok) => { Poki.inAd = false; res(ok); } }; SFX.setAdMute(true); });
      }
      Poki.inAd = true;
      return new Promise((res) => {
        const done = (ok) => { Poki.inAd = false; G.adActive = false; SFX.setAdMute(false); res(!!ok); };
        try {
          Poki.sdk.rewardedBreak({ size: size || 'medium', onStart: () => { G.adActive = true; SFX.setAdMute(true); } })
            .then(done).catch(() => done(false));
        } catch (e) { done(false); }
      });
    },
    shareURL(params) {
      if (Poki.sdk && Poki.sdk.shareableURL) { try { return Poki.sdk.shareableURL(params).catch(() => null); } catch (e) { /* ignore */ } }
      return Promise.resolve(null);
    },
  };

  // ---------- Save ----------
  const SAVE_KEY = 'blockspell.save.v1';
  function defaultSave() {
    return {
      xp: 0, level: 1, runs: 0, wins: 0, best: 0, maxFloor: 0, coinsTotal: 0, wizards: ['apprentice'], sound: true, music: true, tut: {},
      daily: { streak: 0, last: null, results: {} }, run: null, dailyRun: null,
      gems: 60, owned: { mascot: ['blip'], hat: ['wizard', 'none'], face: ['none'], bg: ['night'] },
      equip: { mascot: 'blip', hat: 'wizard', face: 'none', bg: 'night' }, freeGems: { date: null, n: 0 },
      endlessRun: null, endlessBest: 0,
    };
  }
  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && typeof s === 'object') {
          const d = defaultSave();
          const m = Object.assign(d, s);
          m.owned = Object.assign(defaultSave().owned, s.owned || {});
          m.equip = Object.assign(defaultSave().equip, s.equip || {});
          if (typeof m.gems !== 'number') m.gems = 60;
          return m;
        }
      }
    } catch (e) { /* ignore */ }
    return defaultSave();
  }
  function persist() { G.save.savedAt = Date.now(); try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.save)); } catch (e) { /* ignore */ } if (PF) PF.save(G.save); }
  function persistRun() {
    if (!G.run) return;
    if (G.run.mode === 'daily') G.save.dailyRun = G.run;
    else if (G.run.mode === 'endless') G.save.endlessRun = G.run;
    else G.save.run = G.run;
    persist();
  }

  // ---------- Cosmetics ----------
  const THEMES = {
    night: { id: 'night', name: 'Night Sky', top: '#2a1166', mid: '#170b3d', bot: '#0c0626', blobs: ['rgba(166,108,255,0.22)', 'rgba(255,77,154,0.14)', 'rgba(62,197,255,0.13)', 'rgba(46,230,166,0.10)'], star: '#ffffff' },
    ocean: { id: 'ocean', name: 'Deep Ocean', top: '#0a4a7a', mid: '#05305a', bot: '#021630', blobs: ['rgba(62,197,255,0.28)', 'rgba(46,230,166,0.18)', 'rgba(30,90,200,0.25)', 'rgba(120,255,230,0.12)'], star: '#bff1ff', glitter: ['#a3e6ff', '#9af7d6', '#ffffff'], deco: 'rays' },
    forest: { id: 'forest', name: 'Firefly Forest', top: '#123f2a', mid: '#0a2618', bot: '#04120b', blobs: ['rgba(46,230,166,0.2)', 'rgba(255,210,63,0.12)', 'rgba(20,120,60,0.3)', 'rgba(150,255,120,0.1)'], star: '#fff3a8', glitter: ['#fff09a', '#d4ff7a'], deco: 'trees' },
    sunset: { id: 'sunset', name: 'Sunset', top: '#3a0f55', mid: '#8a2459', bot: '#c8553a', blobs: ['rgba(255,159,28,0.25)', 'rgba(255,77,154,0.22)', 'rgba(255,210,63,0.2)', 'rgba(166,108,255,0.15)'], star: '#ffe6b3', glitter: ['#ffd23f', '#ff9db0'], deco: 'sun' },
    candy: { id: 'candy', name: 'Candy Land', top: '#5a1f6e', mid: '#3e1658', bot: '#25103f', blobs: ['rgba(255,126,194,0.3)', 'rgba(163,230,255,0.2)', 'rgba(255,240,154,0.15)', 'rgba(214,184,255,0.25)'], star: '#ffd1ea', glitter: ['#ff7ec2', '#a3e6ff', '#fff09a'] },
    lava: { id: 'lava', name: 'Lava Cave', top: '#3a0a06', mid: '#220604', bot: '#0e0202', blobs: ['rgba(255,77,0,0.3)', 'rgba(255,159,28,0.2)', 'rgba(200,20,20,0.25)', 'rgba(255,210,63,0.12)'], star: '#ffcc7a', glitter: ['#ff9f1c', '#ff4d1c', '#ffd23f'] },
    haunted: { id: 'haunted', name: 'Haunted Hill', top: '#160b2e', mid: '#0f1a14', bot: '#05080a', blobs: ['rgba(120,255,140,0.14)', 'rgba(166,108,255,0.2)', 'rgba(80,200,120,0.14)', 'rgba(255,159,28,0.1)'], star: '#d6ffd6', glitter: ['#9cff9c', '#c7a6ff'], deco: 'moon' },
    galaxy: { id: 'galaxy', name: 'Galaxy', top: '#07041a', mid: '#0b0620', bot: '#000000', blobs: ['rgba(255,77,154,0.25)', 'rgba(62,197,255,0.25)', 'rgba(166,108,255,0.3)', 'rgba(46,230,166,0.15)'], star: '#ffffff', glitter: ['#ffffff', '#a3e6ff', '#ffd6f0'], deco: 'planet' },
  };
  const HAT_NAMES = { wizard: 'Wizard Hat', none: 'No Hat', party: 'Party Hat', catears: 'Cat Ears', chef: 'Chef Hat', pumpkin: 'Pumpkin', propeller: 'Propeller Cap', tophat: 'Top Hat', witch: 'Witch Hat', halo: 'Halo', crown: 'Crown' };
  const FACE_NAMES = { none: 'Nothing', stars: 'Star Stickers', mustache: 'Mustache', monocle: 'Monocle', shades: 'Cool Shades', hearts: 'Heart Glasses' };
  const CATALOG = {
    mascot: [['blip', 0], ['pip', 120], ['mochi', 150], ['sparky', 200], ['ember', 200], ['frosty', 250], ['rocky', 250], ['boo', 300], ['nova', 350], ['goldie', 600]],
    hat: [['wizard', 0], ['none', 0], ['party', 60], ['catears', 80], ['chef', 100], ['pumpkin', 120], ['propeller', 120], ['tophat', 150], ['witch', 150], ['halo', 200], ['crown', 300]],
    face: [['none', 0], ['stars', 50], ['mustache', 60], ['monocle', 80], ['shades', 100], ['hearts', 100]],
    bg: [['night', 0], ['ocean', 100], ['forest', 100], ['sunset', 150], ['candy', 150], ['lava', 200], ['haunted', 200], ['galaxy', 300]],
  };
  const TABS = [['mascot', 'Mascots'], ['hat', 'Hats'], ['face', 'Faces'], ['bg', 'Backgrounds']];
  const FREE_GEMS = 15, FREE_GEMS_PER_DAY = 5;
  function itemName(tab, id) {
    if (tab === 'mascot') return GFX.SKINS[id].name;
    if (tab === 'hat') return HAT_NAMES[id];
    if (tab === 'face') return FACE_NAMES[id];
    return THEMES[id].name;
  }
  function currentTheme() { return THEMES[G.save.equip.bg] || THEMES.night; }
  function look(over) { const e = G.save.equip; return Object.assign({ skin: e.mascot, hat: e.hat, face: e.face }, over || {}); }
  function drawMascotLook(x, y, s, o) { mascot(ctx, x, y, s, G.t, look(o)); }
  function themeDeco(g, th, W, H, px) {
    g.save();
    if (th.deco === 'moon') {
      const r = Math.min(W, H) * 0.08, mx = W * 0.9, my = H * 0.1;
      const rg = g.createRadialGradient(mx, my, r * 0.2, mx, my, r * 2.6); rg.addColorStop(0, 'rgba(230,255,220,0.22)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.fillRect(0, 0, W, H);
      g.globalAlpha = 0.6;
      g.fillStyle = '#eaffde'; g.beginPath(); g.arc(mx, my, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(160,190,150,0.6)'; [[-0.3, -0.2, 0.22], [0.25, 0.15, 0.16], [-0.1, 0.4, 0.12]].forEach(([dx, dy, rr2]) => { g.beginPath(); g.arc(mx + dx * r, my + dy * r, rr2 * r, 0, Math.PI * 2); g.fill(); });
      g.globalAlpha = 1;
    } else if (th.deco === 'planet') {
      const r = Math.min(W, H) * 0.09, cx = W * 0.14, cy = H * 0.2;
      g.fillStyle = '#ff7ec2'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.arc(cx - r * 0.3, cy - r * 0.3, r * 0.5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(163,230,255,0.8)'; g.lineWidth = r * 0.12; g.beginPath(); g.ellipse(cx, cy, r * 1.8, r * 0.45, -0.35, 0, Math.PI * 2); g.stroke();
    } else if (th.deco === 'sun') {
      const r = Math.min(W, H) * 0.22;
      const rg = g.createRadialGradient(W * 0.5, H * 1.02, r * 0.2, W * 0.5, H * 1.02, r * 2.5); rg.addColorStop(0, 'rgba(255,230,120,0.5)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,214,120,0.5)'; g.beginPath(); g.arc(W * 0.5, H * 1.02, r, Math.PI, 0); g.fill();
    } else if (th.deco === 'rays') {
      g.globalAlpha = 0.07; g.fillStyle = '#bff1ff';
      for (let i = 0; i < 5; i++) { const x = W * (0.1 + i * 0.2); g.beginPath(); g.moveTo(x, 0); g.lineTo(x + W * 0.06, 0); g.lineTo(x + W * 0.2, H); g.lineTo(x + W * 0.08, H); g.closePath(); g.fill(); }
    } else if (th.deco === 'trees') {
      g.fillStyle = 'rgba(2,12,6,0.75)';
      for (let i = 0; i < 9; i++) { const x = W * (i / 8), h2 = H * (0.16 + ((i * 37) % 10) / 70), w2 = W * 0.08; g.beginPath(); g.moveTo(x - w2, H); g.lineTo(x, H - h2); g.lineTo(x + w2, H); g.closePath(); g.fill(); }
    }
    g.restore();
  }
  function themeSwatch(g, th, x, y, w, h, r) {
    g.save();
    rr(g, x, y, w, h, r); g.clip();
    const lg = g.createLinearGradient(0, y, 0, y + h); lg.addColorStop(0, th.top); lg.addColorStop(0.55, th.mid); lg.addColorStop(1, th.bot);
    g.fillStyle = lg; g.fillRect(x, y, w, h);
    [[0.2, 0.25], [0.8, 0.2], [0.7, 0.85], [0.2, 0.9]].forEach(([bx, by], i) => { const rg = g.createRadialGradient(x + bx * w, y + by * h, 0, x + bx * w, y + by * h, Math.max(w, h) * 0.5); rg.addColorStop(0, th.blobs[i]); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(x, y, w, h); });
    g.save(); g.translate(x, y); themeDeco(g, th, w, h, 1); g.restore();
    let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    g.fillStyle = th.star; for (let i = 0; i < 18; i++) { g.globalAlpha = 0.4 + rnd() * 0.5; g.fillRect(x + rnd() * w, y + rnd() * h, 1.6, 1.6); }
    g.restore();
  }
  function gemIcon(x, y, r) {
    ctx.save();
    ctx.fillStyle = '#0a5f9a';
    ctx.beginPath(); ctx.moveTo(x - r, y - r * 0.3); ctx.lineTo(x - r * 0.5, y - r * 0.85); ctx.lineTo(x + r * 0.5, y - r * 0.85); ctx.lineTo(x + r, y - r * 0.3); ctx.lineTo(x, y + r * 0.95); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3ec5ff';
    ctx.beginPath(); ctx.moveTo(x - r * 0.82, y - r * 0.3); ctx.lineTo(x - r * 0.42, y - r * 0.72); ctx.lineTo(x + r * 0.42, y - r * 0.72); ctx.lineTo(x + r * 0.82, y - r * 0.3); ctx.lineTo(x, y + r * 0.72); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#b8f0ff';
    ctx.beginPath(); ctx.moveTo(x - r * 0.42, y - r * 0.72); ctx.lineTo(x, y - r * 0.3); ctx.lineTo(x - r * 0.82, y - r * 0.3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; star(ctx, x + r * 0.35, y - r * 0.5, r * 0.25, r * 0.08, 4); ctx.fill();
    ctx.restore();
  }
  function gemsForRun(run, victory) {
    if (run.mode === 'daily') return 10 + run.roundsWon * 5;
    if (run.mode === 'endless') return Math.max(3, Math.floor(run.totalScore / 400) + (run.level - 1) * 3);
    return Math.max(3, run.roundsWon * 5 + Math.floor(run.totalScore / 500) + (victory ? 60 : 0));
  }

  // ---------- Date helpers for daily ----------
  // Days roll over at midnight UTC so every player in the world gets the same daily spell.
  function localDate(d) { d = d || new Date(); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); }
  function dayNumber() { const now = new Date(); const a = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()); const b = Date.UTC(2026, 10, 23); /* Daily #1 = Reddit launch day */ return Math.floor((a - b) / 864e5) + 1; }
  function yesterday() { const d = new Date(Date.now() - 864e5); return localDate(d); }
  function msToNextDay() { const now = new Date(); return Math.max(0, Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime()); }

  // ---------- State ----------
  const G = {
    scene: 'loading', t: 0, dt: 0, run: null, save: loadSave(),
    drag: null, returning: null, busy: false, overlay: null, tip: null, fakeAd: null, adActive: false,
    parts: [], floats: [], words: [], banner: null, ghosts: [], beams: [], rings: [], timers: [],
    pop: {}, shake: 0, flash: 0, flashColor: '#ffffff', dispScore: 0, dispCoins: 0, scorePulse: 0, coinPulse: 0,
    wiggle: {}, moodUntil: 0, mood: 'idle', say: null, trayAnim: -10, pendingSpins: 0, wheelAng: 0,
    stars: [], glitter: [], reward: null, sel: null, bookSel: null, confirm: null, dailyURL: null, copied: 0,
  };
  SFX.soundOn = G.save.sound; SFX.musicOn = G.save.music;

  function after(sec, fn) { G.timers.push({ at: G.t + sec, fn }); }

  // ---------- View / layout ----------
  let V = { cw: 1, ch: 1, dpr: 1, s: 1, lw: 1280, lh: 720, port: false, px: 1 };
  const L = {};
  let staticLayer = null;

  // ---------- Quality governor ----------
  // Pixel count is what costs the most, so each tier renders fewer pixels and fewer effects.
  const TIERS = [
    { maxPix: 2.2e6, maxDpr: 2, minDpr: 1, stars: 40, glitter: 22, parts: 320, conf: 1 },
    { maxPix: 1.3e6, maxDpr: 1.5, minDpr: 0.8, stars: 28, glitter: 10, parts: 200, conf: 0.7 },
    { maxPix: 0.9e6, maxDpr: 1, minDpr: 0.7, stars: 18, glitter: 0, parts: 130, conf: 0.5 },
    { maxPix: 0.55e6, maxDpr: 0.75, minDpr: 0.55, stars: 12, glitter: 0, parts: 90, conf: 0.35 },
  ];
  const Q = { tier: 0, auto: 0, acc: 0, n: 0, since: 0, locked: false, prevAvg: 0, avg: 0 };
  try { const q = JSON.parse(localStorage.getItem('blockspell.gfx') || '{}'); Q.auto = Math.max(0, Math.min(3, (q.tier | 0) - 1)); } catch (e) { /* ignore */ }
  function effTier() { return G.save.gfx === 'fast' ? Math.max(2, Q.auto) : Q.auto; }
  function T() { return TIERS[effTier()]; }
  function saveTier() { try { localStorage.setItem('blockspell.gfx', JSON.stringify({ tier: Q.auto })); } catch (e) { /* ignore */ } }
  function governor(delta, active) {
    if (Q.locked || G.save.gfx === 'fast' || document.hidden || G.adActive || G.fakeAd || delta > 250 || !active) return;
    if (G.t - Q.since < 1.5) return;
    Q.acc += delta; Q.n++;
    if (Q.n < 50) return;
    const avg = Q.acc / Q.n; Q.acc = 0; Q.n = 0; Q.avg = avg;
    // If the last downgrade did not help, the browser is capping frames, not struggling: undo and stop.
    if (Q.prevAvg && avg > Q.prevAvg * 0.9) { Q.auto = Math.max(0, Q.auto - 1); Q.locked = true; Q.prevAvg = 0; resize(); saveTier(); return; }
    Q.prevAvg = 0;
    if (avg > 21 && Q.auto < 3) { Q.prevAvg = avg; Q.auto++; Q.since = G.t; resize(); saveTier(); }
  }

  function resize() {
    const r = cvs.getBoundingClientRect();
    const cw = Math.max(1, r.width), ch = Math.max(1, r.height);
    const tier = T();
    let dpr = Math.min(window.devicePixelRatio || 1, tier.maxDpr);
    if (cw * ch * dpr * dpr > tier.maxPix) dpr = Math.sqrt(tier.maxPix / (cw * ch));
    dpr = Math.max(tier.minDpr, dpr);
    cvs.width = Math.round(cw * dpr); cvs.height = Math.round(ch * dpr);
    const port = ch > cw * 1.05;
    const bw = port ? 720 : 1280, bh = port ? 1280 : 720;
    const s = Math.min(cw / bw, ch / bh);
    V = { cw, ch, dpr, s, lw: cw / s, lh: ch / s, port, px: s * dpr };
    GFX.setScale(V.px);
    GFX.clearCache();
    layout();
    staticLayer = null;
    initStars();
  }

  function layout() {
    const { lw, lh } = V;
    L.cx = lw / 2; L.cy = lh / 2;
    const hold = G.run && G.run.boosts.hold;
    if (!V.port) {
      const bs = Math.min(600, lh - 100);
      const leftW = 300, rightW = 250, gap = 28;
      const total = leftW + gap + bs + gap + rightW;
      const x0 = (lw - total) / 2;
      L.board = { x: x0 + leftW + gap, y: (lh - bs) / 2 + 14, size: bs };
      L.score = { x: x0, y: L.board.y, w: leftW, h: 236 };
      L.spells = { x: x0, y: L.board.y + 250, w: leftW, h: 96, cols: 4, slot: 64 };
      L.mascot = { x: x0 + leftW / 2, y: L.board.y + bs - 92, s: 112 };
      const rx = L.board.x + bs + gap;
      L.tray = [];
      let ty = L.board.y;
      if (hold) { L.hold = { x: rx, y: ty, w: rightW, h: 120 }; ty += 132; } else L.hold = null;
      const sh = (L.board.y + bs - ty - 24) / 3;
      for (let i = 0; i < 3; i++) L.tray.push({ x: rx, y: ty + i * (sh + 12), w: rightW, h: sh });
      L.pause = { x: lw - 50, y: 42, r: 27 };
    } else {
      const ex = Math.max(0, lh - 1280);
      const x0 = (lw - 720) / 2 + 24;
      L.pause = { x: x0 + 26, y: 46 + ex * 0.1, r: 26 };
      L.score = { x: x0, y: 90 + ex * 0.2, w: 672, h: 172 };
      L.mascot = { x: x0 + 76, y: L.score.y + L.score.h / 2 + 12, s: 96 };
      L.spells = { x: x0, y: L.score.y + L.score.h + 14, w: 672, h: 96, cols: 6, slot: 80 };
      L.board = { x: x0, y: L.spells.y + L.spells.h + 16 + ex * 0.25, size: 672 };
      const ty = L.board.y + 672 + 18 + ex * 0.15;
      const th = Math.min(190, lh - ty - 16);
      L.tray = [];
      const slots = hold ? 4 : 3;
      const sw = (672 - (slots - 1) * 12) / slots;
      let sx = x0;
      if (hold) { L.hold = { x: sx, y: ty, w: sw, h: th }; sx += sw + 12; } else L.hold = null;
      for (let i = 0; i < 3; i++) L.tray.push({ x: sx + i * (sw + 12), y: ty, w: sw, h: th });
    }
  }

  function initStars() {
    G.stars = [];
    for (let i = 0; i < T().stars; i++) G.stars.push({ x: Math.random() * V.lw, y: Math.random() * V.lh, s: 0.6 + Math.random() * 2.2, p: Math.random() * 6.28, sp: 0.6 + Math.random() * 2 });
    G.glitter = [];
    for (let i = 0; i < T().glitter; i++) G.glitter.push({ x: Math.random() * V.lw, y: Math.random() * V.lh, vy: 8 + Math.random() * 18, s: 2 + Math.random() * 3, p: Math.random() * 6, c: BLOCK[i % 6][1] });
  }

  function renderBg(g, W, H) {
    const th = currentTheme();
    const lg = g.createLinearGradient(0, 0, 0, H);
    lg.addColorStop(0, th.top); lg.addColorStop(0.55, th.mid); lg.addColorStop(1, th.bot);
    g.fillStyle = lg; g.fillRect(0, 0, W, H);
    const pos = [[0.15, 0.2, 0.45], [0.85, 0.15, 0.4], [0.7, 0.85, 0.5], [0.2, 0.9, 0.35]];
    pos.forEach(([bx, by, br], i) => {
      const rg = g.createRadialGradient(bx * W, by * H, 0, bx * W, by * H, br * Math.max(W, H));
      rg.addColorStop(0, th.blobs[i]); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.fillRect(0, 0, W, H);
    });
    g.strokeStyle = 'rgba(255,255,255,0.025)'; g.lineWidth = 1;
    const step = 48 * V.px;
    for (let x = 0; x < W; x += step) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y < H; y += step) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    // static dim stars (the twinkling ones are drawn live)
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    g.fillStyle = th.star;
    for (let i = 0; i < 110; i++) { g.globalAlpha = 0.15 + rnd() * 0.35; const sz = (0.6 + rnd() * 1.4) * V.px; g.fillRect(rnd() * W, rnd() * H, sz, sz); }
    g.globalAlpha = 1;
    if (th.deco) themeDeco(g, th, W, H, V.px);
  }

  // Everything that does not move is baked into one opaque layer, rebuilt only when it changes.
  function staticKey() {
    const th = currentTheme().id;
    let k = th + '|' + cvs.width + 'x' + cvs.height + '|' + G.scene;
    if (G.scene === 'play' && G.run) {
      const run = G.run;
      k += '|' + V.port + '|' + run.board.n + '|' + (run.boss ? 1 : 0) + '|' + (L.hold ? 1 : 0) + '|' + run.slots;
    }
    return k;
  }
  function buildStatic() {
    const key = staticKey();
    if (staticLayer && staticLayer.key === key) return;
    const c = (staticLayer && staticLayer.c) || document.createElement('canvas');
    c.width = cvs.width; c.height = cvs.height;
    const g = c.getContext('2d', { alpha: false });
    g.setTransform(1, 0, 0, 1, 0, 0);
    renderBg(g, c.width, c.height);
    if (G.scene === 'play' && G.run) {
      g.setTransform(V.px, 0, 0, V.px, 0, 0);
      drawPlayChrome(g);
    }
    staticLayer = { key, c };
  }
  function chromeRects() {
    const B = L.board;
    const out = [{ x: B.x - 16, y: B.y - 16, w: B.size + 32, h: B.size + 32 }, L.score, L.spells].concat(L.tray);
    if (L.hold) out.push(L.hold);
    return out;
  }
  function drawPlayChrome(g) {
    const run = G.run;
    const B = L.board, n = run.board.n, cell = B.size / n;
    rr(g, B.x - 16, B.y - 10, B.size + 32, B.size + 32, 28); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fill();
    rr(g, B.x - 16, B.y - 16, B.size + 32, B.size + 32, 28); g.fillStyle = '#1c0f46'; g.fill();
    g.lineWidth = 4; g.strokeStyle = run.boss ? 'rgba(255,77,109,0.75)' : 'rgba(141,107,255,0.7)'; g.stroke();
    rr(g, B.x - 6, B.y - 6, B.size + 12, B.size + 12, 20); g.fillStyle = PAL.boardBg; g.fill();
    g.fillStyle = PAL.cell;
    for (let yy = 0; yy < n; yy++) for (let xx = 0; xx < n; xx++) { rr(g, B.x + xx * cell + 3, B.y + yy * cell + 3, cell - 6, cell - 6, cell * 0.18); g.fill(); }
    const S = L.score;
    GFX.panelDirect(g, S.x, S.y, S.w, S.h, { edge: run.boss ? 'rgba(255,77,109,0.6)' : PAL.edgeDim });
    const SP = L.spells;
    GFX.panelDirect(g, SP.x, SP.y, SP.w, SP.h, {});
    for (const r of L.tray) {
      rr(g, r.x, r.y, r.w, r.h, 20); g.fillStyle = 'rgba(255,255,255,0.04)'; g.fill();
      g.lineWidth = 2; g.strokeStyle = 'rgba(191,176,255,0.12)'; g.stroke();
    }
    if (L.hold) { const r = L.hold; rr(g, r.x, r.y, r.w, r.h, 20); g.fillStyle = 'rgba(62,197,255,0.07)'; g.fill(); }
  }

  // ---------- UI hit system ----------
  const UI = { hits: [], prev: [], down: null, px: -9999, py: -9999, layer: 0 };
  function hitArea(id, x, y, w, h, fn) {
    UI.hits.push({ id, x, y, w, h, fn, layer: UI.layer });
    const p = { x: UI.px, y: UI.py };
    const inside = inR(p, { x, y, w, h });
    const topL = UI.prevTop || 0;
    if (UI.layer < topL) return '';
    if (UI.down && UI.down.id === id) return inside ? 'down' : '';
    return inside && UI.mouse ? 'hover' : '';
  }
  function btn(id, x, y, w, h, label, style, fn, o) {
    o = o || {};
    const st = o.disabled ? '' : hitArea(id, x, y, w, h, o.disabled ? null : fn);
    button(ctx, x, y, w, h, label, style, st, o);
  }
  function topHitAt(p) {
    let top = -1, found = null;
    for (const h of UI.prev) if (h.layer > top) top = h.layer;
    for (let i = UI.prev.length - 1; i >= 0; i--) {
      const h = UI.prev[i];
      if (h.layer === top && h.fn && inR(p, h)) { found = h; break; }
    }
    return found;
  }

  // ---------- Input ----------
  function toLogical(e) {
    const r = cvs.getBoundingClientRect();
    return { x: (e.clientX - r.left) / V.s, y: (e.clientY - r.top) / V.s };
  }
  cvs.addEventListener('pointerdown', (e) => {
    SFX.unlock();
    if (G.adActive || G.fakeAd) return;
    const p = toLogical(e);
    UI.px = p.x; UI.py = p.y; UI.mouse = e.pointerType === 'mouse';
    try { cvs.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
    if (G.scene === 'play' && !G.overlay && !G.busy && !Poki.inAd && tryStartDrag(p, e.pointerType)) {
      if (G.awaitStart) { G.awaitStart = false; Poki.start(); }
      return;
    }
    const h = topHitAt(p);
    UI.down = h ? { id: h.id } : null;
    if (!h && G.tip) G.tip = null;
  });
  cvs.addEventListener('pointermove', (e) => {
    const p = toLogical(e);
    UI.px = p.x; UI.py = p.y; UI.mouse = e.pointerType === 'mouse';
    UI.dirty = true;
    if (G.drag) updateDrag(p);
  });
  cvs.addEventListener('pointerup', (e) => {
    const p = toLogical(e);
    UI.px = p.x; UI.py = p.y;
    if (G.drag) { updateDrag(p); endDrag(); return; }
    if (UI.down) {
      const h = topHitAt(p);
      const id = UI.down.id;
      UI.down = null;
      if (h && h.id === id && !G.adActive && !G.fakeAd) { SFX.click(); h.fn(); }
    }
    if (e.pointerType !== 'mouse') { UI.px = -9999; UI.py = -9999; }
  });
  cvs.addEventListener('pointercancel', () => { if (G.drag) { G.drag.gx = null; endDrag(); } UI.down = null; });
  cvs.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (ev) => {
    if (['ArrowDown', 'ArrowUp', ' '].includes(ev.key)) ev.preventDefault();
    if (G.adActive || G.fakeAd) return;
    if (ev.key === 'Escape' && G.scene === 'play') { if (G.overlay && G.overlay.type === 'pause') resume(); else if (!G.overlay) pause(); }
  });
  window.addEventListener('wheel', (ev) => ev.preventDefault(), { passive: false });
  document.addEventListener('visibilitychange', () => {
    SFX.setHidden(document.hidden);
    if (document.hidden && G.scene === 'play' && !G.overlay && !G.busy && !Poki.inAd) pause();
  });
  window.addEventListener('resize', () => { resize(); });

  // ---------- Drag & drop ----------
  function cellSize() { return L.board.size / G.run.board.n; }
  function trayCell(piece, r) {
    const { w, h } = BS.pieceSize(piece);
    return Math.min(cellSize() * 0.62, (r.w * 0.86) / Math.max(w, 2.2), (r.h * 0.82) / Math.max(h, 2.2));
  }
  function tryStartDrag(p, ptype) {
    const run = G.run;
    for (let i = 0; i < 3; i++) {
      if (run.tray[i] && inR(p, L.tray[i])) { beginDrag(i, run.tray[i], p, ptype, L.tray[i]); return true; }
    }
    if (L.hold && run.hold && inR(p, L.hold)) { beginDrag('hold', run.hold, p, ptype, L.hold); return true; }
    return false;
  }
  function beginDrag(slot, piece, p, ptype, r) {
    G.drag = { slot, piece, touch: ptype !== 'mouse', t0: G.t, gx: null, gy: null, preview: null, fromCell: trayCell(piece, r) };
    G.tip = null;
    SFX.pick(); haptic(8);
    updateDrag(p);
  }
  function updateDrag(p) {
    const d = G.drag, run = G.run;
    const cell = cellSize();
    const { w, h } = BS.pieceSize(d.piece);
    const lift = d.touch ? cell * 0.9 + (h * cell) / 2 : 0;
    d.px = p.x; d.py = p.y;
    d.x = p.x - (w * cell) / 2;
    d.y = p.y - (h * cell) / 2 - lift;
    const fx = (d.x - L.board.x) / cell, fy = (d.y - L.board.y) / cell;
    let best = null, bd = 1.1;
    const rx = Math.round(fx), ry = Math.round(fy);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const gx = rx + dx, gy = ry + dy;
      if (!BS.canPlace(run.board, d.piece, gx, gy)) continue;
      const dist = Math.hypot(gx - fx, gy - fy);
      if (dist < bd) { bd = dist; best = [gx, gy]; }
    }
    const prev = d.gx + ',' + d.gy;
    if (best) { d.gx = best[0]; d.gy = best[1]; d.preview = BS.previewLines(run, d.piece, d.gx, d.gy); }
    else { d.gx = null; d.gy = null; d.preview = null; }
    if (best && prev !== d.gx + ',' + d.gy && d.preview && (d.preview.rows.length || d.preview.cols.length)) SFX.tick();
    d.overHold = L.hold && !run.hold && d.slot !== 'hold' && inR(p, L.hold);
  }
  function endDrag() {
    const d = G.drag;
    G.drag = null;
    if (!d) return;
    const run = G.run;
    if (d.gx != null) { doPlace(d.slot, d.gx, d.gy); return; }
    if (d.overHold) {
      run.hold = d.piece; run.tray[d.slot] = null;
      SFX.drop();
      const wasEmpty = !run.tray.some((x) => x);
      if (wasEmpty) { BS.postMove(run); G.trayAnim = G.t; checkPhase(); }
      persistRun();
      return;
    }
    SFX.drop();
    const r = d.slot === 'hold' ? L.hold : L.tray[d.slot];
    G.returning = { piece: d.piece, slot: d.slot, x0: d.x, y0: d.y, c0: cellSize(), r, t0: G.t };
  }

  // ---------- Effects ----------
  function spawnParts(x, y, color, n, o) {
    o = o || {};
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (o.speed || 260) * (0.4 + Math.random() * 0.8);
      G.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up || 120), g: o.g != null ? o.g : 900, life: 0, max: (o.life || 0.7) * (0.6 + Math.random() * 0.6), s: (o.size || 9) * (0.5 + Math.random()), c: color, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, type: o.type || 'sq' });
    }
    const cap = T().parts;
    if (G.parts.length > cap) G.parts.splice(0, G.parts.length - cap);
  }
  function confetti(n, x, y) {
    n = Math.round(n * T().conf);
    for (let i = 0; i < n; i++) {
      const c = BLOCK[i % 6][0];
      G.parts.push({ x: x != null ? x : Math.random() * V.lw, y: y != null ? y : -20, vx: (Math.random() - 0.5) * (x != null ? 900 : 120), vy: x != null ? -300 - Math.random() * 600 : 100 + Math.random() * 200, g: 500, life: 0, max: 2.2 + Math.random(), s: 7 + Math.random() * 6, c, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, type: 'conf' });
    }
  }
  function floatText(str, x, y, o) {
    o = o || {};
    G.floats.push(Object.assign({ text: str, x, y, t0: G.t, life: 0.9, size: 30, color: '#fff', vy: -60, kind: 'text' }, o));
  }
  function bigWord(str, lvl) {
    G.words.push({ text: str, t0: G.t, lvl });
    SFX.word(lvl);
  }
  function coinFly(n, x, y) {
    const target = L.coinPos || { x: L.score.x + 40, y: L.score.y + 40 };
    for (let i = 0; i < n; i++) {
      G.parts.push({ type: 'coinfly', x0: x + (Math.random() - 0.5) * 30, y0: y + (Math.random() - 0.5) * 30, x1: target.x, y1: target.y, life: -i * 0.07, max: 0.65, s: 13, c: '#ffd23f', played: false });
    }
  }
  function wiggleSpell(name) {
    const sp = BS.SPELLS.find((s) => s.name === name);
    if (sp) G.wiggle[sp.id] = G.t;
  }
  function setMood(m, dur) { G.mood = m; G.moodUntil = G.t + (dur || 1.2); }
  function say(str, dur) { G.say = { text: str, until: G.t + (dur || 3.5), t0: G.t }; }

  // ---------- Game flow ----------
  function startRun(wizard) {
    G.run = BS.newRun({ wizard, level: G.save.level, mode: 'run', firstRun: G.save.runs === 0 });
    G.save.run = G.run;
    persist();
    enterPlay(true);
  }
  function startDaily() {
    const date = localDate();
    G.run = BS.newRun({ wizard: 'apprentice', level: 99, mode: 'daily', seed: 'daily-' + date });
    G.run.date = date;
    G.save.dailyRun = G.run;
    persist();
    enterPlay(true);
  }
  function startEndless() {
    G.run = BS.newRun({ wizard: 'apprentice', level: G.save.level, mode: 'endless' });
    G.save.endlessRun = G.run;
    persist();
    enterPlay(true);
  }
  function enterPlay(withIntro) {
    layout();
    G.scene = 'play';
    G.dispScore = G.run.roundScore; G.dispCoins = G.run.coins;
    G.parts = []; G.floats = []; G.words = []; G.ghosts = []; G.beams = []; G.pop = {};
    G.overlay = null; G.busy = false; G.drag = null; G.banner = null;
    const ph = G.run.phase;
    if (ph === 'reward' || ph === 'roundwon') { if (ph === 'roundwon') toReward(); else G.scene = 'reward'; return; }
    if (ph === 'shop') { G.scene = 'shop'; return; }
    if (ph === 'failed') { showFail(); return; }
    if (ph === 'victory') { endRun(true); return; }
    // Straight into play: a short non-blocking banner instead of a menu. gameplayStart fires on the first touch.
    G.roundIntro = { t0: G.t };
    G.awaitStart = true;
    Poki.commercial().then(() => { if (G.roundIntro) G.roundIntro.t0 = G.t; G.trayAnim = G.t; });
    G.trayAnim = G.t;
    if (!G.save.tut.drag) G.tutHand = G.t;
  }
  function dismissIntro() {
    G.overlay = null;
    Poki.start();
    G.trayAnim = G.t;
    SFX.whoosh();
    const tut = G.save.tut;
    if (!tut.drag) G.tutHand = G.t;
  }
  function pause() { if (G.scene !== 'play' || G.overlay || Poki.inAd) return; G.overlay = { type: 'pause', t0: G.t }; Poki.stop(); }
  function resume() {
    G.overlay = null;
    Poki.commercial().then(() => { if (G.scene === 'play' && !G.overlay) { Poki.start(); G.awaitStart = false; } });
  }

  function doPlace(slot, gx, gy) {
    const run = G.run;
    const piece = slot === 'hold' ? run.hold : run.tray[slot];
    const ev = BS.place(run, slot, gx, gy);
    if (!ev) return;
    const n = run.board.n, cell = cellSize();
    for (const [x, y] of ev.placed) G.pop[y * n + x] = G.t;
    SFX.place(piece.cells.length); haptic(10);
    let sx = 0, sy = 0;
    for (const [x, y] of ev.placed) { sx += x; sy += y; }
    sx = sx / ev.placed.length; sy = sy / ev.placed.length;
    const cxp = L.board.x + (sx + 0.5) * cell, cyp = L.board.y + (sy + 0.5) * cell;
    for (const [x, y] of ev.placed) spawnParts(L.board.x + (x + 0.5) * cell, L.board.y + (y + 0.9) * cell, 'rgba(255,255,255,0.7)', 2, { speed: 90, up: 30, g: 200, life: 0.35, size: 5 });
    floatText('+' + ev.points, cxp, cyp - cell * 0.4, { size: 26, color: '#e9e2ff', life: 0.7 });
    if (ev.lifter) { floatText('Heavy Lifter!', cxp, cyp - cell, { size: 24, color: '#ffcc7a' }); wiggleSpell('Heavy Lifter'); }
    for (const k of ev.melted) spawnParts(L.board.x + ((k % n) + 0.5) * cell, L.board.y + (Math.floor(k / n) + 0.5) * cell, '#bff1ff', 10, { speed: 200 });
    if (ev.clear) handleClear(ev.clear, sx, sy);
    (ev.expired || []).forEach((id, i) => after(0.3 + i * 0.3, () => { floatText('Curse lifted!', L.spells.x + L.spells.w / 2, L.spells.y, { size: 30, color: '#9af7d6', stroke: '#06302a', life: 1.3 }); SFX.spell(); }));
    for (const k of (ev.clutter || []).concat(ev.gremlin || [])) after(0.25, () => { G.pop[k] = G.t; spawnParts(L.board.x + ((k % n) + 0.5) * cell, L.board.y + (Math.floor(k / n) + 0.5) * cell, '#9a91bd', 8, { speed: 160 }); SFX.place(2); });
    if (ev.gremlin && ev.gremlin.length) after(0.2, () => floatText('Gremlin attack!', L.board.x + L.board.size / 2, L.board.y + 40, { size: 34, color: '#bfb0ff', stroke: '#1a0b3d', life: 1.3 }));
    if (ev.leak) floatText('-1 coin', L.coinPos ? L.coinPos.x : cxp, (L.coinPos ? L.coinPos.y : cyp) - 24, { size: 24, color: '#ff8fa3', stroke: '#3a0010', life: 0.9 });
    G.pendingSpins = ev.spins || 0;
    G.busy = true;
    const tut = G.save.tut;
    if (!tut.drag) { tut.drag = 1; G.tutHand = null; say('Fill a whole row or column to clear it!', 5); }
    if (ev.clear && !tut.clear) { tut.clear = 1; after(0.9, () => say('Hit the target score to win the round!', 4.5)); }
    after(ev.clear ? 0.55 : 0.08, afterMove);
    persistRun();
  }

  function handleClear(c, ox, oy) {
    const run = G.run;
    const n = run.board.n, cell = cellSize();
    let mx = 0, my = 0;
    for (const s of c.cells) {
      const d = Math.hypot(s.x - ox, s.y - oy);
      G.ghosts.push({ x: s.x, y: s.y, cell: s.cell, t0: G.t + d * 0.03, done: false, bomb: c.bombCells && c.bombCells.includes(s.k) });
      mx += s.x; my += s.y;
    }
    mx /= c.cells.length || 1; my /= c.cells.length || 1;
    for (const r of c.rows || []) G.beams.push({ kind: 'row', i: r, t0: G.t });
    for (const col of c.cols || []) G.beams.push({ kind: 'col', i: col, t0: G.t });
    const lines = (c.rows || []).length + (c.cols || []).length;
    if (c.bombCells && c.bombCells.length) { SFX.boom(); G.shake = Math.max(G.shake, 16); G.rings.push({ x: L.board.x + (mx + 0.5) * cell, y: L.board.y + (my + 0.5) * cell, t0: G.t, c: '#ffb02e' }); }
    SFX.clear(Math.max(1, lines), c.streak || 1);
    G.shake = Math.max(G.shake, Math.min(20, 5 + lines * 4 + (c.streak || 0)));
    G.flash = lines >= 3 || c.sweep ? 0.4 : 0.14;
    G.flashColor = '#ffffff';
    haptic(lines >= 2 ? 45 : 22);
    const px = L.board.x + (mx + 0.5) * cell, py = L.board.y + (my + 0.5) * cell;
    G.floats.push({ kind: 'calc', chips: c.chips, mult: c.mult, gain: c.gain, x: clamp(px, L.board.x + 120, L.board.x + L.board.size - 120), y: clamp(py, L.board.y + 70, L.board.y + L.board.size - 60), t0: G.t, life: 1.5 });
    G.scorePulse = G.t;
    let word = null, lvl = 0;
    if (c.sweep) { word = 'CLEAN SWEEP!'; lvl = 4; }
    else if (lines >= 4) { word = 'SPELLBOUND!'; lvl = 4; }
    else if (lines === 3) { word = 'AMAZING!'; lvl = 3; }
    else if (lines === 2) { word = 'GREAT!'; lvl = 2; }
    else if ((c.streak || 0) >= 5) { word = 'ON FIRE!'; lvl = 2; }
    else if ((c.streak || 0) >= 3) { word = 'COMBO x' + c.streak; lvl = 1; }
    if (word) after(0.12, () => bigWord(word, lvl));
    if (lines >= 3 || c.sweep) after(0.2, () => confetti(60, L.board.x + L.board.size / 2, L.board.y + L.board.size / 2));
    for (const p of c.parts || []) wiggleSpell(p[0]);
    if (c.coins) {
      const gs = c.cells.filter((s) => s.cell && s.cell.gold);
      gs.forEach((s, i) => after(0.15 + i * 0.05, () => coinFly(1, L.board.x + (s.x + 0.5) * cell, L.board.y + (s.y + 0.5) * cell)));
    }
    setMood(lines >= 2 ? 'wow' : 'happy', 1.3);
    if (lines >= 3 && Math.random() < 0.6) say(['Whoa!!', 'So sparkly!', 'Magic hands!', 'Blip approves!'][Math.floor(Math.random() * 4)], 1.8);
  }

  function afterMove() {
    const run = G.run;
    if (!run || G.scene !== 'play') return;
    // Score counts first: if this move reached the target, the round ends and pending spins are skipped.
    if (run.mode !== 'endless' && run.roundScore >= run.target) G.pendingSpins = 0;
    if (G.pendingSpins > 0) { G.pendingSpins--; openWheel(); return; }
    const wasEmpty = !run.tray.some((p) => p);
    const r = BS.postMove(run);
    G.busy = false;
    if ((r === 'ok' || r === 'levelup') && wasEmpty && run.tray.some((p) => p)) { G.trayAnim = G.t; SFX.whoosh(); }
    if (r === 'levelup') { after(0.25, openLevelUp); persistRun(); return; }
    checkPhase();
    persistRun();
    // orb tutorial
    if (!G.save.tut.orb && run.tray.some((p) => p && p.orb >= 0) && run.phase === 'play') {
      G.save.tut.orb = 1;
      say('See the ? block? Clear its line to spin the Spell Wheel!', 5);
    }
  }

  function checkPhase() {
    const run = G.run;
    if (run.phase === 'roundwon') roundWon();
    else if (run.phase === 'failed') roundFailed();
  }

  function roundWon() {
    const run = G.run;
    G.busy = true;
    Poki.stop();
    const boss = run.round === 2;
    G.banner = { text: boss ? 'BOSS BEATEN!' : 'ROUND CLEAR!', sub: fmt(run.roundScore) + ' points', t0: G.t };
    SFX.win(); haptic(60);
    confetti(120);
    setMood('wow', 2.5);
    after(1.9, () => { if (G.run !== run || G.scene !== 'play') return; G.banner = null; toReward(); });
  }

  function toReward() {
    const run = G.run;
    if (!run) return;
    const rew = BS.roundRewards(run);
    run.rewardInfo = rew;
    run.offer = rew.isBoss ? null : BS.offerSpells(run, 3);
    run.extraUsed = false;
    run.picked = null;
    run.phase = 'reward';
    if (run.floor === run.floors - 1 && run.round === 2) run.lastRound = true;
    G.scene = 'reward';
    G.rewardT = G.t;
    G.busy = false;
    G.dispCoins = run.coins - rew.total;
    persistRun();
  }

  function roundFailed() {
    Poki.stop();
    G.busy = false;
    SFX.lose(); haptic(80);
    setMood('worried', 3);
    showFail();
  }
  function showFail() {
    G.scene = 'play';
    G.overlay = { type: 'fail', t0: G.t };
    persistRun();
  }

  function useRevive() {
    Poki.rewarded('medium').then((ok) => {
      if (!ok) { SFX.error(); return; }
      const run = G.run;
      const res = BS.revive(run);
      const n = run.board.n;
      const mid = (n - 1) / 2;
      for (const s of res.cells) G.ghosts.push({ x: s.x, y: s.y, cell: s.cell, t0: G.t + (res.wiped ? Math.hypot(s.x - mid, s.y - mid) * 0.05 : Math.random() * 0.2) });
      G.overlay = null;
      SFX.spell(); SFX.clear(3, 3);
      G.flash = 0.4; G.flashColor = '#bff7e6';
      confetti(res.wiped ? 120 : 50, L.board.x + L.board.size / 2, L.board.y + L.board.size / 2);
      if (res.wiped) { after(0.15, () => bigWord('BOARD WIPED!', 4)); G.shake = 16; }
      else floatText('+6 pieces', L.board.x + L.board.size / 2, L.board.y + L.board.size / 2, { size: 44, color: '#2ee6a6', stroke: '#063', life: 1.4 });
      if (run.pendingLevelUps > 0) after(0.9, openLevelUp);
      G.trayAnim = G.t;
      G.awaitStart = false;
      Poki.start();
      setMood('happy', 2);
      const r = BS.postMove(run);
      if (r === 'stuck' || r === 'out') after(0.6, roundFailed);
      persistRun();
    });
  }

  function startNextRound() {
    const run = G.run;
    if (run.lastRound) { run.phase = 'victory'; endRun(true); return; }
    const r = BS.nextRound(run);
    run.offer = null; run.shop = null; run.rewardInfo = null;
    if (r === 'victory') { endRun(true); return; }
    persistRun();
    enterPlay(true);
  }

  function endRun(victory) {
    const run = G.run;
    if (!run) return;
    Poki.stop();
    const s = G.save;
    const res = { victory, score: run.totalScore, floor: run.floor, round: run.round, stats: run.stats, mode: run.mode, rounds: run.roundsWon, wizard: run.wizard, unlocks: [], levelUps: 0, xp: 0 };
    if (run.mode === 'endless') {
      res.level = run.level;
      res.newBest = run.totalScore > (s.endlessBest || 0);
      s.endlessBest = Math.max(s.endlessBest || 0, run.totalScore);
      s.endlessRun = null;
    }
    const gems = gemsForRun(run, victory);
    s.gems += gems;
    res.gems = gems;
    if (run.mode === 'daily') {
      const date = run.date || localDate();
      s.daily.results[date] = { score: run.totalScore, cleared: run.roundsWon };
      if (s.daily.last !== date) { s.daily.streak = s.daily.last === yesterday() ? s.daily.streak + 1 : 1; s.daily.last = date; }
      s.dailyRun = null;
      res.dailyNo = dayNumber();
      res.streak = s.daily.streak;
      if (PF) {
        G.board = null;
        PF.submitDaily({ date, score: run.totalScore, cleared: run.roundsWon, streak: s.daily.streak }).then((b) => { if (b) G.board = b; }).catch(() => null);
      } else Poki.shareURL({ daily: '1' }).then((u) => { G.dailyURL = u; });
    } else if (run.mode === 'endless') {
      const xp = BS.xpForRun(run);
      res.xp = xp; s.xp += xp;
      while (s.xp >= BS.xpNeeded(s.level)) {
        s.xp -= BS.xpNeeded(s.level); s.level++; res.levelUps++; s.gems += 25; res.gems += 25;
        BS.SPELLS.filter((sp) => sp.lock === s.level).forEach((sp) => res.unlocks.push('New spell: ' + sp.name));
      }
    } else {
      s.run = null;
      s.runs++;
      if (victory) s.wins++;
      s.best = Math.max(s.best, run.totalScore);
      s.maxFloor = Math.max(s.maxFloor, run.floor + (victory ? 1 : 0));
      s.coinsTotal += run.stats.coinsEarned;
      const xp = BS.xpForRun(run);
      res.xp = xp;
      res.xpFrom = s.xp; res.levelFrom = s.level;
      s.xp += xp;
      while (s.xp >= BS.xpNeeded(s.level)) {
        s.xp -= BS.xpNeeded(s.level); s.level++; res.levelUps++; s.gems += 25; res.gems += 25;
        BS.SPELLS.filter((sp) => sp.lock === s.level).forEach((sp) => res.unlocks.push('New spell: ' + sp.name));
      }
      const unlockW = (id, cond) => { if (cond && !s.wizards.includes(id)) { s.wizards.push(id); res.unlocks.push('New wizard: ' + BS.WIZARD[id].name); } };
      unlockW('pyro', s.maxFloor >= 1);
      unlockW('alchemist', s.coinsTotal >= 150);
      unlockW('trickster', s.wins >= 1);
    }
    persist();
    G.end = res;
    G.endT = G.t;
    G.scene = 'end';
    G.overlay = null;
    G.banner = null;
    G.run = null;
    if (victory) { SFX.win(); confetti(200); }
  }

  // ---------- Wheel ----------
  function openWheel() {
    const run = G.run;
    const spin = BS.spinWheel(run);
    G.overlay = { type: 'wheel', spin, t0: G.t, from: G.wheelAng, to: targetAngle(spin.index, G.wheelAng), dur: 2.7, done: false, lastSeg: -1 };
    Poki.stop();
    SFX.spinStart();
    setMood('wow', 3);
    persistRun();
  }
  function targetAngle(idx, from) {
    const seg = (Math.PI * 2) / 8;
    const jitter = (Math.random() - 0.5) * seg * 0.55;
    let want = -(idx + 0.5) * seg + jitter;
    let delta = (want - from) % (Math.PI * 2);
    if (delta < 0) delta += Math.PI * 2;
    return from + Math.PI * 2 * 5 + delta;
  }
  function wheelUpdate(o) {
    const k = (G.t - o.t0) / o.dur;
    const ang = lerp(o.from, o.to, 1 - Math.pow(1 - clamp(k, 0, 1), 4));
    const seg = (Math.PI * 2) / 8;
    const si = Math.floor((ang + 1e-6) / seg);
    if (si !== o.lastSeg && k < 1) { if (o.lastSeg !== -1) { SFX.tick(); o.flick = G.t; } o.lastSeg = si; }
    G.wheelAng = ang;
    if (k >= 1 && !o.done) {
      o.done = true; o.doneT = G.t;
      const good = BS.ORB[o.spin.id].good;
      if (good) { SFX.good(); confetti(70, L.cx, L.cy - 60); setMood('wow', 2); }
      else { SFX.bad(); G.shake = 12; setMood('shocked', 2); }
    }
  }
  function wheelRespin() {
    Poki.rewarded('small').then((ok) => {
      if (!ok) { SFX.error(); return; }
      const run = G.run;
      run.respins = 1;
      const spin = BS.spinWheel(run);
      G.overlay = { type: 'wheel', spin, t0: G.t, from: G.wheelAng, to: targetAngle(spin.index, G.wheelAng), dur: 2.4, done: false, lastSeg: -1, respun: true };
      SFX.spinStart();
    });
  }
  function wheelAccept() {
    const o = G.overlay;
    const run = G.run;
    const id = o.spin.id;
    G.overlay = null;
    const ev = BS.applyOrb(run, id);
    const n = run.board.n, cell = cellSize();
    const cx = L.board.x + L.board.size / 2, cy = L.board.y + L.board.size / 2;
    switch (id) {
      case 'kaboom':
      case 'zap':
        if (ev.clear) {
          for (const s of ev.clear.cells) G.ghosts.push({ x: s.x, y: s.y, cell: s.cell, t0: G.t + Math.random() * 0.12 });
          if (id === 'zap') G.beams.push({ kind: 'row', i: ev.row, t0: G.t });
          else { SFX.boom(); G.rings.push({ x: L.board.x + (ev.center[0] + 0.5) * cell, y: L.board.y + (ev.center[1] + 0.5) * cell, t0: G.t, c: '#ffb02e' }); }
          SFX.clear(2, 2); G.shake = 14; G.flash = 0.25; G.scorePulse = G.t;
          floatText('+' + fmt(ev.clear.gain), cx, cy, { size: 54, color: '#ffd23f', stroke: '#5a2a00', life: 1.2, vy: -50 });
        }
        break;
      case 'stars':
        floatText('+' + fmt(ev.gain), cx, cy, { size: 54, color: '#ffd23f', stroke: '#5a2a00', life: 1.3, vy: -50 });
        for (let i = 0; i < 24; i++) spawnParts(L.board.x + Math.random() * L.board.size, L.board.y - 10, '#ffe98a', 1, { type: 'star', speed: 60, up: -200, g: 400, life: 1.2, size: 14 });
        G.scorePulse = G.t; SFX.spell();
        break;
      case 'gold': coinFly(5, cx, cy); break;
      case 'thief': floatText('-' + Math.abs(ev.coins) + ' coins', L.coinPos ? L.coinPos.x : cx, (L.coinPos ? L.coinPos.y : cy) - 20, { size: 30, color: '#ff4d6d', stroke: '#3a0010' }); G.coinPulse = G.t; break;
      case 'more': floatText('+4 pieces', cx, cy, { size: 46, color: '#2ee6a6', stroke: '#063', life: 1.2 }); break;
      case 'butter': floatText('-' + ev.lost + ' pieces', cx, cy, { size: 46, color: '#ff4d6d', stroke: '#3a0010', life: 1.2 }); break;
      case 'double': floatText('x2 Mult ready!', cx, cy, { size: 46, color: '#ff4d6d', stroke: '#3a0010', life: 1.2 }); break;
      case 'fizzle': floatText('Mult fizzled...', cx, cy, { size: 40, color: '#bfb0ff', stroke: '#1a0b3d', life: 1.2 }); break;
      case 'tiny': case 'chonk': case 'shuffle': G.trayAnim = G.t; SFX.whoosh(); break;
      case 'gift':
        if (ev.spell && !ev.needReplace) { floatText('New spell: ' + BS.SPELL[ev.spell].name, cx, cy, { size: 38, color: '#9af7d6', stroke: '#06302a', life: 1.5 }); SFX.spell(); G.wiggle[ev.spell] = G.t; }
        break;
      case 'curse':
        if (!ev.curseReplace) { floatText('Cursed: ' + BS.SPELL[ev.curse].name, cx, cy, { size: 38, color: '#ff8fa3', stroke: '#3a0010', life: 1.6 }); G.wiggle[ev.curse] = G.t; setMood('shocked', 1.5); }
        break;
      case 'freeze': case 'gremlin':
        for (const k of ev.cells || []) { G.pop[k] = G.t; spawnParts(L.board.x + ((k % n) + 0.5) * cell, L.board.y + (Math.floor(k / n) + 0.5) * cell, id === 'freeze' ? '#bff1ff' : '#9a91bd', 8, { speed: 160 }); }
        SFX.place(3); G.shake = 8;
        break;
    }
    if (ev.needReplace) { G.overlay = { type: 'replace', mode: 'gift', id: ev.needReplace, t0: G.t }; persistRun(); return; }
    if (ev.curseReplace) { G.overlay = { type: 'replace', mode: 'curse', id: ev.curseReplace, t0: G.t }; persistRun(); return; }
    if (!G.awaitStart) Poki.start();
    G.busy = true;
    after(0.5, afterMove);
    persistRun();
  }

  // ---------- Reward & shop actions ----------
  function takeSpell(id, replaceIdx) {
    const run = G.run;
    if (run.spells.length >= run.slots && replaceIdx == null) { G.overlay = { type: 'replace', mode: 'reward', id, t0: G.t }; return; }
    if (!BS.addSpell(run, id, replaceIdx)) { SFX.error(); return; }
    run.picked = id;
    run.offer = null;
    G.overlay = null;
    SFX.spell(); haptic(20);
    persistRun();
  }
  function skipReward() {
    const run = G.run;
    run.coins += 3; run.offer = null; run.picked = 'skip';
    SFX.coin(0);
    persistRun();
  }
  function extraChoice() {
    Poki.rewarded('small').then((ok) => {
      if (!ok) return;
      const run = G.run;
      const more = BS.offerSpells(run, 6).filter((id) => !run.offer.includes(id));
      if (more.length) run.offer.push(more[0]);
      run.extraUsed = true;
      SFX.spell();
      persistRun();
    });
  }
  function toShop() {
    const run = G.run;
    run.shop = BS.makeShop(run);
    run.phase = 'shop';
    G.scene = 'shop';
    G.shopT = G.t;
    persistRun();
  }
  function buyItem(i) {
    const run = G.run;
    const it = run.shop.items[i];
    if (!it || it.sold) return;
    if (run.coins < it.price) { SFX.error(); floatText('Not enough coins', L.cx, L.cy, { size: 30, color: '#ff4d6d', stroke: '#3a0010' }); return; }
    if (it.type === 'spell') {
      if (run.spells.length >= run.slots) { G.overlay = { type: 'replace', mode: 'shop', id: it.id, t0: G.t, shopIdx: i }; return; }
      if (!BS.addSpell(run, it.id)) { SFX.error(); return; }
    } else BS.buyBoost(run, it.id);
    run.coins -= it.price;
    it.sold = true;
    SFX.buy(); haptic(20);
    layout();
    persistRun();
  }
  function reroll() {
    const run = G.run;
    const cost = run.shop.reroll;
    if (run.coins < cost) { SFX.error(); return; }
    run.coins -= cost;
    const keep = run.shop.items.filter((it) => it.type === 'boost');
    const fresh = BS.makeShop(run).items.filter((it) => it.type === 'spell');
    run.shop.items = fresh.concat(keep);
    run.shop.reroll = cost + 1;
    SFX.whoosh();
    G.shopT = G.t;
    persistRun();
  }
  function sellSpell(idx) {
    const run = G.run;
    const sp = run.spells[idx];
    if (!sp) return;
    if (sp.curse && run.coins < 3) { SFX.error(); return; }
    run.coins += BS.sellValue(sp.id);
    run.spells.splice(idx, 1);
    G.sel = null;
    SFX.coin(0); SFX.coin(1);
    persistRun();
  }

  // ---------- Drawing: shared ----------
  function drawBg(sx, sy) {
    buildStatic();
    const th = currentTheme();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (sx || sy) { ctx.fillStyle = th.bot; ctx.fillRect(0, 0, cvs.width, cvs.height); }
    ctx.drawImage(staticLayer.c, Math.round(sx * V.px), Math.round(sy * V.px));
    ctx.setTransform(V.px, 0, 0, V.px, sx * V.px, sy * V.px);
    // In play, the board and panels are part of the background layer: keep twinkles out of them.
    const rects = G.scene === 'play' && G.run ? chromeRects() : null;
    const blocked = (x, y) => { if (!rects) return false; for (const r of rects) if (x > r.x - 6 && x < r.x + r.w + 6 && y > r.y - 6 && y < r.y + r.h + 6) return true; return false; };
    for (const s of G.stars) {
      if (blocked(s.x, s.y)) continue;
      const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(G.t * s.sp + s.p));
      ctx.globalAlpha = a; ctx.fillStyle = '#ffffff';
      if (s.s > 2) { star(ctx, s.x, s.y, s.s * 1.6, s.s * 0.4, 4); ctx.fill(); }
      else { ctx.fillRect(s.x, s.y, s.s, s.s); }
    }
    for (const g of G.glitter) {
      g.y -= g.vy * G.dt; if (g.y < -10) { g.y = V.lh + 10; g.x = Math.random() * V.lw; }
      if (blocked(g.x + Math.sin(G.t + g.p) * 8, g.y)) continue;
      ctx.globalAlpha = 0.35 + 0.3 * Math.sin(G.t * 3 + g.p);
      ctx.fillStyle = th.glitter ? th.glitter[Math.floor(g.p * 10) % th.glitter.length] : g.c;
      ctx.beginPath(); ctx.arc(g.x + Math.sin(G.t + g.p) * 8, g.y, g.s, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function iconButton(id, x, y, r, draw, fn, o) {
    o = o || {};
    const st = hitArea(id, x - r, y - r, r * 2, r * 2, fn);
    const dy = st === 'down' ? 3 : 0;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(x, y + 4, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = st === 'hover' ? '#5a35c9' : '#4a24b0'; ctx.beginPath(); ctx.arc(x, y + dy, r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#8d6bff'; ctx.stroke();
    ctx.translate(x, y + dy);
    if (o.off) ctx.globalAlpha = 0.45;
    draw(r);
    ctx.restore();
    if (o.off) { ctx.save(); ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - r * 0.5, y + r * 0.5); ctx.lineTo(x + r * 0.5, y - r * 0.5); ctx.stroke(); ctx.restore(); }
  }
  const drawPauseIcon = (r) => { ctx.fillStyle = '#fff'; rr(ctx, -r * 0.32, -r * 0.38, r * 0.22, r * 0.76, 3); ctx.fill(); rr(ctx, r * 0.1, -r * 0.38, r * 0.22, r * 0.76, 3); ctx.fill(); };
  const drawSoundIcon = (r) => { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-r * 0.45, -r * 0.15); ctx.lineTo(-r * 0.2, -r * 0.15); ctx.lineTo(r * 0.1, -r * 0.42); ctx.lineTo(r * 0.1, r * 0.42); ctx.lineTo(-r * 0.2, r * 0.15); ctx.lineTo(-r * 0.45, r * 0.15); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(r * 0.12, 0, r * 0.32, -0.7, 0.7); ctx.stroke(); };
  const drawMusicIcon = (r) => { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(-r * 0.12, r * 0.25); ctx.lineTo(-r * 0.12, -r * 0.42); ctx.lineTo(r * 0.36, -r * 0.5); ctx.lineTo(r * 0.36, r * 0.15); ctx.stroke(); ctx.beginPath(); ctx.ellipse(-r * 0.24, r * 0.28, r * 0.16, r * 0.12, -0.4, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(r * 0.24, r * 0.18, r * 0.16, r * 0.12, -0.4, 0, Math.PI * 2); ctx.fill(); };
  const drawBackIcon = (r) => { ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(r * 0.15, -r * 0.4); ctx.lineTo(-r * 0.25, 0); ctx.lineTo(r * 0.15, r * 0.4); ctx.stroke(); };

  function toggleSound() { G.save.sound = !G.save.sound; SFX.soundOn = G.save.sound; SFX.apply(); persist(); }
  function toggleGfx() { G.save.gfx = G.save.gfx === 'fast' ? 'auto' : 'fast'; persist(); resize(); }
  function toggleMusic() { G.save.music = !G.save.music; SFX.musicOn = G.save.music; SFX.apply(); persist(); }

  function coinIcon(x, y, r) {
    ctx.fillStyle = '#b07a00'; ctx.beginPath(); ctx.arc(x, y + r * 0.15, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e0a800'; ctx.lineWidth = r * 0.18; ctx.beginPath(); ctx.arc(x, y, r * 0.62, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.38, r * 0.25, r * 0.13, -0.6, 0, Math.PI * 2); ctx.fill();
  }
  function pieceIcon(x, y, s) {
    const c = s / 2.2;
    drawBlock(ctx, x - c, y - c, c, { color: 4, kind: 'normal' }, V.px, G.t, {});
    drawBlock(ctx, x, y - c, c, { color: 4, kind: 'normal' }, V.px, G.t, {});
    drawBlock(ctx, x - c, y, c, { color: 4, kind: 'normal' }, V.px, G.t, {});
  }
  function flameIcon(x, y, s, c) {
    ctx.save(); ctx.translate(x, y);
    const k = s / 2;
    ctx.fillStyle = c || '#ff9f1c';
    ctx.beginPath(); ctx.moveTo(0, -k); ctx.bezierCurveTo(k * 0.75, -k * 0.2, k * 0.7, k * 0.9, 0, k * 0.9); ctx.bezierCurveTo(-k * 0.7, k * 0.9, -k * 0.75, -k * 0.1, 0, -k); ctx.fill();
    ctx.fillStyle = '#ffe98a'; ctx.beginPath(); ctx.moveTo(0, -k * 0.1); ctx.bezierCurveTo(k * 0.35, k * 0.3, k * 0.3, k * 0.85, 0, k * 0.85); ctx.bezierCurveTo(-k * 0.3, k * 0.85, -k * 0.35, k * 0.3, 0, -k * 0.1); ctx.fill();
    ctx.restore();
  }

  function speechBubble(str, x, y, maxW, dir) {
    const lines = GFX.wrap(ctx, str, maxW, 22, 'b');
    const w = Math.min(maxW, Math.max(...lines.map((l) => { ctx.font = `600 22px ${GFX.FONT_B}`; return ctx.measureText(l).width; }))) + 32;
    const h = lines.length * 27 + 22;
    let bx = x - w / 2, by = y - h;
    bx = clamp(bx, 10, V.lw - w - 10);
    ctx.save();
    rr(ctx, bx, by + 4, w, h, 18); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();
    rr(ctx, bx, by, w, h, 18); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.beginPath();
    const tx = clamp(x, bx + 24, bx + w - 24);
    if (dir === 'up') { ctx.moveTo(tx - 12, by); ctx.lineTo(tx, by - 14); ctx.lineTo(tx + 12, by); }
    else { ctx.moveTo(tx - 12, by + h - 1); ctx.lineTo(tx, by + h + 14); ctx.lineTo(tx + 12, by + h - 1); }
    ctx.fill();
    lines.forEach((l, i) => text(ctx, l, bx + w / 2, by + 24 + i * 27, { size: 22, color: '#2a0f6e', font: 'b', weight: 600 }));
    ctx.restore();
  }

  function drawParts() {
    const dt = G.dt;
    for (let i = G.parts.length - 1; i >= 0; i--) {
      const p = G.parts[i];
      p.life += dt;
      if (p.type === 'coinfly') {
        if (p.life < 0) continue;
        const k = clamp(p.life / p.max, 0, 1);
        const e = k * k;
        const mx = (p.x0 + p.x1) / 2 + 80, my = Math.min(p.y0, p.y1) - 120;
        const x = (1 - e) * (1 - e) * p.x0 + 2 * (1 - e) * e * mx + e * e * p.x1;
        const y = (1 - e) * (1 - e) * p.y0 + 2 * (1 - e) * e * my + e * e * p.y1;
        coinIcon(x, y, p.s * (1 - k * 0.3));
        if (k >= 1) { if (!p.played) { SFX.coin(0); G.coinPulse = G.t; } G.parts.splice(i, 1); }
        continue;
      }
      if (p.life >= p.max) { G.parts.splice(i, 1); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.type === 'conf') { p.vx *= 0.985; }
      const a = 1 - p.life / p.max;
      ctx.globalAlpha = clamp(a * 1.5, 0, 1);
      ctx.fillStyle = p.c;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      if (p.type === 'star') { star(ctx, 0, 0, p.s, p.s * 0.4, 4); ctx.fill(); }
      else if (p.type === 'conf') { ctx.scale(1, Math.sin(p.life * 10 + p.rot)); ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); }
      else ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    for (let i = G.rings.length - 1; i >= 0; i--) {
      const r = G.rings[i]; const k = (G.t - r.t0) / 0.5;
      if (k >= 1) { G.rings.splice(i, 1); continue; }
      ctx.globalAlpha = 1 - k; ctx.strokeStyle = r.c; ctx.lineWidth = 14 * (1 - k);
      ctx.beginPath(); ctx.arc(r.x, r.y, 30 + k * 160, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawFloats() {
    for (let i = G.floats.length - 1; i >= 0; i--) {
      const f = G.floats[i];
      const k = (G.t - f.t0) / f.life;
      if (k >= 1) { G.floats.splice(i, 1); continue; }
      if (f.kind === 'calc') {
        const ph1 = 0.42;
        if (G.t - f.t0 < ph1) {
          const e = easeBack((G.t - f.t0) / 0.18);
          ctx.save(); ctx.translate(f.x, f.y); ctx.scale(e, e);
          const cs = fmt(f.chips), ms = (Math.round(f.mult * 10) / 10).toString();
          ctx.font = `34px ${GFX.FONT_D}`;
          const w1 = ctx.measureText(cs).width + 28, w2 = ctx.measureText(ms).width + 28;
          const tw = w1 + w2 + 36;
          let x = -tw / 2;
          rr(ctx, x, -24, w1, 48, 14); ctx.fillStyle = PAL.chips; ctx.fill();
          text(ctx, cs, x + w1 / 2, 1, { size: 34, color: '#fff', stroke: '#06456b', sw: 6 });
          text(ctx, 'x', x + w1 + 18, 0, { size: 30, color: '#fff', stroke: '#1a0b3d', sw: 6 });
          rr(ctx, x + w1 + 36, -24, w2, 48, 14); ctx.fillStyle = PAL.mult; ctx.fill();
          text(ctx, ms, x + w1 + 36 + w2 / 2, 1, { size: 34, color: '#fff', stroke: '#6b0020', sw: 6 });
          ctx.restore();
        } else {
          const k2 = (G.t - f.t0 - ph1) / (f.life - ph1);
          const e = easeBack(k2 * 4);
          const sz = 52 + Math.min(40, Math.log10(Math.max(10, f.gain)) * 8);
          ctx.save(); ctx.globalAlpha = 1 - clamp((k2 - 0.6) / 0.4, 0, 1);
          ctx.translate(f.x, f.y - k2 * 70); ctx.scale(e, e);
          text(ctx, '+' + fmt(f.gain), 0, 0, { size: sz, grad: ['#fff6b0', '#ffd23f', '#ff9f1c'], stroke: '#4a1a00', sw: sz * 0.16 });
          ctx.restore();
        }
        continue;
      }
      ctx.globalAlpha = 1 - clamp((k - 0.6) / 0.4, 0, 1);
      const e = easeBack(k * 5);
      ctx.save(); ctx.translate(f.x, f.y + f.vy * k); ctx.scale(e, e);
      text(ctx, f.text, 0, 0, { size: f.size, color: f.color, stroke: f.stroke || '#1a0b3d', sw: f.size * 0.18 });
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  function drawWords() {
    for (let i = G.words.length - 1; i >= 0; i--) {
      const w = G.words[i];
      const k = (G.t - w.t0) / 1.25;
      if (k >= 1) { G.words.splice(i, 1); continue; }
      const cx = L.board.x + L.board.size / 2, cy = L.board.y + L.board.size * 0.32;
      const e = easeBack(clamp(k / 0.22, 0, 1));
      const sz = 70 + w.lvl * 12;
      const grads = [['#ffffff', '#9af7d6', '#2ee6a6'], ['#ffffff', '#a3e6ff', '#3ec5ff'], ['#fff6b0', '#ffd23f', '#ff9f1c'], ['#ffd6f0', '#ff6ad5', '#a66cff'], ['#fff6b0', '#ff9f1c', '#ff4d6d']];
      ctx.save();
      ctx.globalAlpha = 1 - clamp((k - 0.7) / 0.3, 0, 1);
      ctx.translate(cx, cy - k * 30);
      ctx.rotate(-0.06 + Math.sin(G.t * 8) * 0.015);
      ctx.scale(e, e);
      text(ctx, w.text, 0, 6, { size: sz, color: '#1a0b3d', stroke: '#1a0b3d', sw: sz * 0.3, maxWidth: L.board.size * 0.95 });
      text(ctx, w.text, 0, 0, { size: sz, grad: grads[Math.min(4, w.lvl)], stroke: '#2a0f6e', sw: sz * 0.14, maxWidth: L.board.size * 0.95 });
      ctx.restore();
    }
  }

  // ---------- Play scene ----------
  function drawPlay() {
    const run = G.run;
    const B = L.board;
    const n = run.board.n;
    const cell = B.size / n;

    // board frame, empty cells and panels live in the static layer
    const d = G.drag;
    const pv = d && d.preview;
    const prevRows = pv ? new Set(pv.rows) : null, prevCols = pv ? new Set(pv.cols) : null;
    const pulse = 0.5 + 0.5 * Math.sin(G.t * 12);

    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const k = y * n + x;
      const c = run.board.cells[k];
      const px = B.x + x * cell, py = B.y + y * cell;
      if (!c) continue;
      let s = 1;
      const pt = G.pop[k];
      if (pt != null && G.t - pt < 0.18) s = 1.22 - ((G.t - pt) / 0.18) * 0.22;
      const inLine = pv && (prevRows.has(y) || prevCols.has(x));
      const o = inLine && c.kind === 'normal' && !c.gold ? { colorOverride: d.piece.gold ? 2 : d.piece.color } : {};
      ctx.save();
      ctx.translate(px + cell / 2, py + cell / 2); ctx.scale(s, s);
      drawBlock(ctx, -cell / 2, -cell / 2, cell, c, V.px, G.t, o);
      if (inLine) { ctx.globalAlpha = 0.25 + pulse * 0.3; rr(ctx, -cell / 2 + 3, -cell / 2 + 3, cell - 6, cell - 6, cell * 0.2); ctx.fillStyle = '#fff'; ctx.fill(); }
      ctx.restore();
    }
    // line preview glow for empty-filled-by-piece rows
    if (pv) {
      ctx.save();
      ctx.globalAlpha = 0.18 + pulse * 0.12; ctx.fillStyle = '#ffffff';
      for (const r of pv.rows) { rr(ctx, B.x, B.y + r * cell, B.size, cell, 10); ctx.fill(); }
      for (const c of pv.cols) { rr(ctx, B.x + c * cell, B.y, cell, B.size, 10); ctx.fill(); }
      ctx.restore();
    }
    // ghost
    if (d && d.gx != null) {
      ctx.save(); ctx.globalAlpha = 0.42;
      for (const [cx2, cy2] of d.piece.cells) drawBlock(ctx, B.x + (d.gx + cx2) * cell, B.y + (d.gy + cy2) * cell, cell, { color: d.piece.color, gold: d.piece.gold, kind: 'normal' }, V.px, G.t, { noOverlay: true });
      ctx.restore();
    }
    // clearing ghosts
    for (let i = G.ghosts.length - 1; i >= 0; i--) {
      const g = G.ghosts[i];
      const dt = G.t - g.t0;
      const px = B.x + g.x * cell, py = B.y + g.y * cell;
      if (dt > 0.32) { G.ghosts.splice(i, 1); continue; }
      ctx.save();
      ctx.translate(px + cell / 2, py + cell / 2);
      if (dt < 0) { drawBlock(ctx, -cell / 2, -cell / 2, cell, g.cell, V.px, G.t, {}); ctx.restore(); continue; }
      if (dt >= 0.1 && !g.done) {
        g.done = true;
        const col = GFX.colsFor(g.cell);
        spawnParts(px + cell / 2, py + cell / 2, col[0], 4, { speed: 320, size: cell * 0.2 });
        spawnParts(px + cell / 2, py + cell / 2, col[1], 1, { type: 'star', speed: 240, size: cell * 0.18 });
      }
      const sc = dt < 0.1 ? 1 + dt * 1.5 : Math.max(0, 1.15 - (dt - 0.1) / 0.22);
      ctx.scale(sc, sc); ctx.rotate(dt > 0.1 ? (dt - 0.1) * 4 : 0);
      drawBlock(ctx, -cell / 2, -cell / 2, cell, g.cell, V.px, G.t, { noOverlay: true });
      ctx.globalAlpha = dt < 0.1 ? dt / 0.1 : 1 - (dt - 0.1) / 0.22;
      rr(ctx, -cell / 2 + 2, -cell / 2 + 2, cell - 4, cell - 4, cell * 0.2); ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.restore();
    }
    // beams
    for (let i = G.beams.length - 1; i >= 0; i--) {
      const b = G.beams[i];
      const k = (G.t - b.t0) / 0.45;
      if (k >= 1) { G.beams.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.8;
      const th = cell * (0.6 + k * 1.2);
      if (b.kind === 'row') {
        const y = B.y + (b.i + 0.5) * cell;
        const g2 = ctx.createLinearGradient(0, y - th / 2, 0, y + th / 2);
        g2.addColorStop(0, 'rgba(255,255,255,0)'); g2.addColorStop(0.5, 'rgba(255,255,255,1)'); g2.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g2; ctx.fillRect(B.x - 20, y - th / 2, B.size + 40, th);
      } else {
        const x = B.x + (b.i + 0.5) * cell;
        const g2 = ctx.createLinearGradient(x - th / 2, 0, x + th / 2, 0);
        g2.addColorStop(0, 'rgba(255,255,255,0)'); g2.addColorStop(0.5, 'rgba(255,255,255,1)'); g2.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g2; ctx.fillRect(x - th / 2, B.y - 20, th, B.size + 40);
      }
      ctx.restore();
    }

    drawHUD();
    drawSpellBar();
    drawTray();
    drawMascotHUD();
    drawRoundIntro();

    iconButton('pause', L.pause.x, L.pause.y, L.pause.r, drawPauseIcon, pause);

    // tutorial hand
    if (G.tutHand != null && !G.overlay && run.tray[0]) {
      const k = ((G.t - G.tutHand) % 2.2) / 2.2;
      const r0 = L.tray[0];
      const sx = r0.x + r0.w / 2, sy = r0.y + r0.h / 2;
      const ex = B.x + B.size / 2, ey = B.y + B.size / 2;
      const e = easeOut(clamp((k - 0.15) / 0.6, 0, 1));
      const hx = lerp(sx, ex, e), hy = lerp(sy, ey, e);
      ctx.save(); ctx.globalAlpha = k > 0.85 ? (1 - k) / 0.15 : 1;
      drawHand(hx, hy, 1);
      ctx.restore();
      text(ctx, 'Drag a piece onto the board', B.x + B.size / 2, B.y - 40, { size: 30, color: '#fff', stroke: '#1a0b3d', sw: 6 });
    }

    // dragging piece (on top)
    if (d) {
      const cellT = lerp(d.fromCell, cell, easeOut((G.t - d.t0) / 0.12));
      const { w, h } = BS.pieceSize(d.piece);
      const ox = d.x + ((w * cell) - (w * cellT)) / 2, oy = d.y + ((h * cell) - (h * cellT)) / 2;
      ctx.save();
      ctx.globalAlpha = 0.3; ctx.fillStyle = '#000';
      for (const [cx2, cy2] of d.piece.cells) { rr(ctx, ox + cx2 * cellT + 6, oy + cy2 * cellT + 12, cellT - 4, cellT - 4, cellT * 0.2); ctx.fill(); }
      ctx.restore();
      d.piece.cells.forEach(([cx2, cy2], i) => {
        drawBlock(ctx, ox + cx2 * cellT, oy + cy2 * cellT, cellT, { color: d.piece.color, gold: d.piece.gold, kind: 'normal', orb: i === d.piece.orb, bomb: i === d.piece.bomb }, V.px, G.t, {});
      });
    }
    // returning piece
    if (G.returning) {
      const r = G.returning;
      const k = easeOut((G.t - r.t0) / 0.18);
      const tc = trayCell(r.piece, r.r);
      const { w, h } = BS.pieceSize(r.piece);
      const tx = r.r.x + r.r.w / 2 - (w * tc) / 2, ty = r.r.y + r.r.h / 2 - (h * tc) / 2;
      const c = lerp(r.c0, tc, k);
      const x = lerp(r.x0, tx, k), y = lerp(r.y0, ty, k);
      r.piece.cells.forEach(([cx2, cy2], i) => drawBlock(ctx, x + cx2 * c, y + cy2 * c, c, { color: r.piece.color, gold: r.piece.gold, kind: 'normal', orb: i === r.piece.orb, bomb: i === r.piece.bomb }, V.px, G.t, {}));
      if (k >= 1) G.returning = null;
    }
  }

  // Non-blocking round banner: shows the goal (and the boss rule) without stopping play.
  function drawRoundIntro() {
    const ri = G.roundIntro, run = G.run;
    if (!ri || !run) return;
    const life = run.boss ? 3.4 : 2.2;
    let k = (G.t - ri.t0) / life;
    if (G.drag && k < 0.75) { ri.t0 = G.t - life * 0.75; k = 0.75; }
    if (k >= 1) { G.roundIntro = null; return; }
    const B = L.board;
    const a = k < 0.12 ? k / 0.12 : k > 0.75 ? (1 - k) / 0.25 : 1;
    const e = easeBack(Math.min(1, k / 0.12));
    const h = run.boss ? 150 : 112;
    const y = B.y + B.size * 0.3;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(B.x + B.size / 2, y); ctx.scale(e, e);
    rr(ctx, -B.size / 2 - 10, -h / 2, B.size + 20, h, 22);
    ctx.fillStyle = run.boss ? 'rgba(74,15,36,0.92)' : 'rgba(26,11,61,0.9)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = run.boss ? '#ff4d6d' : '#8d6bff'; ctx.stroke();
    let title, sub;
    if (run.mode === 'endless') { title = 'ENDLESS'; sub = 'Unlimited pieces. It gets harder as you climb.'; }
    else if (run.boss) { title = 'BOSS: ' + BS.BOSS[run.boss].name.toUpperCase(); sub = BS.BOSS[run.boss].desc; }
    else { title = (run.mode === 'daily' ? 'DAILY \u00B7 ' : '') + 'ROUND ' + (run.round + 1); sub = 'Score ' + fmt(run.target) + ' to win'; }
    text(ctx, title, 0, run.boss ? -34 : -20, { size: run.boss ? 40 : 46, color: run.boss ? '#ff8fa3' : '#ffffff', stroke: '#1a0b3d', sw: 8, maxWidth: B.size - 20 });
    text(ctx, sub, 0, run.boss ? 14 : 26, { size: 24, color: run.boss ? '#ffd6de' : '#ffd23f', font: 'b', weight: 600, maxWidth: B.size - 30 });
    if (run.boss) text(ctx, 'Score ' + fmt(run.target) + ' to win', 0, 50, { size: 21, color: '#ffd23f', font: 'b', weight: 600 });
    ctx.restore();
  }

  function drawHand(x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.rotate(-0.3);
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#1a0b3d'; ctx.lineWidth = 4;
    rr(ctx, -10, -6, 20, 46, 10); ctx.fill(); ctx.stroke();
    rr(ctx, -22, 22, 44, 40, 14); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawHUD() {
    const run = G.run;
    const S = L.score;
    const port = V.port;
    const cx = port ? S.x + 160 : S.x + 22;
    const right = S.x + S.w - 22;
    const endless = run.mode === 'endless';
    const label = endless ? `ENDLESS · LEVEL ${run.level}` : run.mode === 'daily' ? `DAILY SPELL · ROUND ${run.round + 1}` : run.boss ? `BOSS · ${BS.BOSS[run.boss].name.toUpperCase()}` : `FLOOR ${run.floor + 1} · ROUND ${run.round + 1}`;
    text(ctx, label, cx, S.y + 28, { size: 19, color: run.boss ? '#ff8fa3' : PAL.dim, font: 'b', weight: 600, align: 'left', maxWidth: right - cx });
    if (run.boss && run.mode !== 'daily') text(ctx, BS.BOSS[run.boss].desc, cx, S.y + 52, { size: 15, color: '#ffb3c1', font: 'b', weight: 500, align: 'left', maxWidth: right - cx });
    // score roll
    G.dispScore += (run.roundScore - G.dispScore) * Math.min(1, G.dt * 9);
    if (Math.abs(run.roundScore - G.dispScore) < 1) G.dispScore = run.roundScore;
    let pk = G.t - G.scorePulse < 0.3 ? 1 + 0.18 * (1 - (G.t - G.scorePulse) / 0.3) : 1;
    if (!V.port && G.dispScore >= 10000) pk *= 0.86;
    const sy = S.y + (run.boss ? 96 : 86);
    ctx.save(); ctx.translate(cx, sy); ctx.scale(pk, pk);
    const sw = GFX.numText(ctx, fmt(G.dispScore), 0, 0, { size: 58, color: '#ffffff', stroke: '#1a0b3d', sw: 10, align: 'left' }) * pk;
    ctx.restore();
    text(ctx, (endless ? 'next ' : '/ ') + fmt(run.target), cx + sw + 12, sy + 8, { size: endless ? 22 : 26, color: PAL.dim, align: 'left', maxWidth: Math.max(40, right - (cx + sw + 12)) });
    // progress bar
    const by = sy + 40, bw = right - cx, bh = 20;
    const base = endless ? BS.endlessTarget(run.level - 1) : 0;
    const prog = clamp((G.dispScore - base) / (run.target - base), 0, 1);
    rr(ctx, cx, by, bw, bh, 10); ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill();
    if (prog > 0) {
      rr(ctx, cx, by, Math.max(bh, bw * prog), bh, 10);
      const g = ctx.createLinearGradient(cx, 0, cx + bw, 0);
      g.addColorStop(0, '#2ee6a6'); g.addColorStop(0.6, '#3ec5ff'); g.addColorStop(1, '#ffd23f');
      ctx.fillStyle = g; ctx.fill();
      rr(ctx, cx + 4, by + 3, Math.max(0, bw * prog - 8), bh * 0.3, 4); ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fill();
      ctx.fillStyle = '#fff'; star(ctx, cx + bw * prog, by + bh / 2, 10 + Math.sin(G.t * 8) * 2, 4, 4); ctx.fill();
    }
    // bottom row: pieces, coins, streak
    const ry = by + 44;
    const left = BS.piecesLeft(run);
    pieceIcon(cx + 14, ry, 26);
    if (endless) text(ctx, '\u221E', cx + 36, ry + 1, { size: 32, color: '#fff', stroke: '#1a0b3d', sw: 6, align: 'left' });
    else text(ctx, String(left), cx + 36, ry + 1, { size: 28, color: left <= 3 ? '#ff8fa3' : '#fff', stroke: '#1a0b3d', sw: 6, align: 'left' });
    G.dispCoins += (run.coins - G.dispCoins) * Math.min(1, G.dt * 8);
    const cp = G.t - G.coinPulse < 0.25 ? 1.25 : 1;
    const coinX = cx + 112;
    if (!endless) {
      ctx.save(); ctx.translate(coinX, ry); ctx.scale(cp, cp); coinIcon(0, 0, 13); ctx.restore();
      L.coinPos = { x: coinX, y: ry };
      GFX.numText(ctx, String(Math.round(G.dispCoins)), coinX + 22, ry + 1, { size: 28, color: '#ffd23f', stroke: '#3a2400', sw: 6, align: 'left' });
    } else {
      text(ctx, 'Best ' + fmt(Math.max(G.save.endlessBest || 0, run.totalScore)), coinX - 20, ry + 1, { size: 20, color: PAL.dim, align: 'left' });
    }
    // streak & mods
    let mx = V.port ? coinX + 92 : cx;
    const ry2 = V.port ? ry : ry + 36;
    if (run.streak >= 2) {
      flameIcon(mx + 10, ry2 - 2, 26, run.streak >= 5 ? '#ff4d6d' : '#ff9f1c');
      text(ctx, '+' + BS.streakBonus(run) + ' streak', mx + 28, ry2 + 1, { size: 20, color: '#ffcc7a', stroke: '#3a1400', sw: 5, align: 'left' });
      mx += 140;
    }
    const tags = [];
    if (run.mods.double) tags.push(['x2 Mult (' + run.mods.double + ')', '#ff4d6d']);
    if (run.mods.fizzle) tags.push(['x0.5 (' + run.mods.fizzle + ')', '#8c7cd6']);
    if (BS.has(run, 'zen') && run.zen) tags.push(['Zen ready', '#3ec5ff']);
    if (endless) {
      const gp = BS.gremlinPlan(run.level);
      if (gp) { const n2 = run.gremlinIn == null ? gp.every : run.gremlinIn; tags.push(['Gremlin in ' + n2, n2 <= 2 ? '#ff4d6d' : '#6b4fb8']); }
    }
    tags.forEach(([t2, c2]) => {
      if (mx > right - 40) return;
      ctx.font = `600 16px ${GFX.FONT_B}`;
      const w = ctx.measureText(t2).width + 16;
      rr(ctx, mx, ry2 - 13, w, 26, 13); ctx.fillStyle = c2; ctx.fill();
      text(ctx, t2, mx + w / 2, ry2, { size: 16, color: '#fff', font: 'b', weight: 600 });
      mx += w + 8;
    });
  }

  function drawSpellBar() {
    const run = G.run;
    const S = L.spells;
    const n = run.slots, slot = S.slot;
    const gapX = (S.w - n * slot) / (n + 1);
    const gapY = (S.h - slot) / 2;
    for (let i = 0; i < n; i++) {
      const x = S.x + gapX + i * (slot + gapX);
      const y = S.y + gapY;
      const sp = run.spells[i];
      if (!sp) {
        ctx.save(); ctx.setLineDash([6, 6]); ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(191,176,255,0.35)';
        rr(ctx, x + 4, y + 4, slot - 8, slot - 8, 16); ctx.stroke(); ctx.restore();
        continue;
      }
      const def = BS.SPELL[sp.id];
      const wk = G.wiggle[sp.id] != null ? G.t - G.wiggle[sp.id] : 9;
      const s2 = wk < 0.4 ? 1 + Math.sin(wk * 30) * 0.12 * (1 - wk / 0.4) : 1;
      ctx.save(); ctx.translate(x + slot / 2, y + slot / 2); ctx.scale(s2, s2); ctx.rotate(wk < 0.4 ? Math.sin(wk * 40) * 0.15 * (1 - wk / 0.4) : 0);
      spellBadge(ctx, def, -slot / 2 + 6, -slot / 2 + 6, slot - 12, V.px, G.t);
      ctx.restore();
      if (sp.curse) {
        ctx.fillStyle = '#ff4d6d'; ctx.beginPath(); ctx.arc(x + slot - 10, y + slot - 10, 13, 0, Math.PI * 2); ctx.fill();
        text(ctx, String(sp.left), x + slot - 10, y + slot - 9, { size: 17, color: '#fff' });
      }
      if (sp.id === 'snowball' && sp.data.stacks) text(ctx, '+' + sp.data.stacks * 0.5, x + slot - 8, y + slot - 8, { size: 18, color: '#fff', stroke: '#06456b', sw: 5 });
      hitArea('spell' + i, x, y, slot, slot, () => { if (!UI.mouse) G.tip = G.tip && G.tip.i === i ? null : { i, x: x + slot / 2, y: y + slot, id: sp.id }; });
      hoverTip(sp.id, x, y, slot);
    }
  }

  // Mouse: hovering a spell shows its tooltip. Touch: tapping toggles it (G.tip).
  function hoverTip(id, x, y, size) {
    if (!UI.mouse || G.drag || G.overlay) return;
    if (inR({ x: UI.px, y: UI.py }, { x, y, w: size, h: size })) G.hoverTip = { id, x: x + size / 2, y: y + size };
  }
  function drawTip() {
    const tp = G.hoverTip || (G.scene === 'play' && G.run ? G.tip : null);
    if (!tp) return;
    const sp = BS.SPELL[tp.id];
    if (!sp) { G.tip = null; return; }
    const w = 320;
    let desc = sp.desc;
    if (sp.curse && G.run) { const held = G.run.spells.find((x) => x.id === sp.id); if (held) desc += ' Wears off in ' + held.left + ' move' + (held.left === 1 ? '' : 's') + '.'; }
    const lines = GFX.wrap(ctx, desc, w - 32, 19, 'b');
    const h = 70 + lines.length * 24;
    let x = clamp(tp.x - w / 2, 10, V.lw - w - 10), y = tp.y + 10;
    if (y + h > V.lh - 10) y = tp.y - h - 90;
    panel(ctx, x, y, w, h, { fill: '#2b1670', edge: RARITY[sp.r][0], r: 18 });
    text(ctx, sp.name, x + 18, y + 28, { size: 24, color: '#fff', align: 'left' });
    text(ctx, RARITY[sp.r][1], x + w - 18, y + 28, { size: 16, color: RARITY[sp.r][0], font: 'b', align: 'right' });
    lines.forEach((l, i) => text(ctx, l, x + 18, y + 58 + i * 24, { size: 19, color: '#e6deff', font: 'b', weight: 500, align: 'left' }));
  }

  function drawTray() {
    const run = G.run;
    const ak = G.t - G.trayAnim;
    for (let i = 0; i < 3; i++) {
      const r = L.tray[i];
      const p = run.tray[i];
      if (!p || (G.drag && G.drag.slot === i) || (G.returning && G.returning.slot === i)) continue;
      drawTrayPiece(p, r, ak - i * 0.07);
    }
    if (L.hold) {
      const r = L.hold;
      ctx.save();
      rr(ctx, r.x, r.y, r.w, r.h, 20);
      ctx.setLineDash([8, 6]); ctx.lineWidth = 2.5; ctx.strokeStyle = G.drag && G.drag.overHold ? '#3ec5ff' : 'rgba(62,197,255,0.45)'; ctx.stroke();
      ctx.restore();
      if (run.hold && !(G.drag && G.drag.slot === 'hold') && !(G.returning && G.returning.slot === 'hold')) drawTrayPiece(run.hold, r, 9);
      else text(ctx, 'HOLD', r.x + r.w / 2, r.y + r.h / 2, { size: 22, color: 'rgba(163,230,255,0.6)' });
    }
  }

  function drawTrayPiece(p, r, ak) {
    const run = G.run;
    const tc = trayCell(p, r);
    const { w, h } = BS.pieceSize(p);
    let ox = r.x + r.w / 2 - (w * tc) / 2, oy = r.y + r.h / 2 - (h * tc) / 2;
    let sc = 1;
    if (ak < 0.35) { const e = easeBack(clamp(ak / 0.35, 0, 1)); oy += (1 - e) * 120; sc = Math.max(0.01, e); }
    const can = BS.anyPlacement(run.board, p);
    const hov = UI.mouse && inR({ x: UI.px, y: UI.py }, r) && !G.drag && can;
    ctx.save();
    ctx.translate(r.x + r.w / 2, r.y + r.h / 2); ctx.scale(sc * (hov ? 1.06 : 1), sc * (hov ? 1.06 : 1)); ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
    if (!can) ctx.globalAlpha = 0.32;
    p.cells.forEach(([cx, cy], i) => drawBlock(ctx, ox + cx * tc, oy + cy * tc, tc, { color: p.color, gold: p.gold, kind: 'normal', orb: i === p.orb, bomb: i === p.bomb }, V.px, G.t, {}));
    ctx.restore();
  }

  function drawMascotHUD() {
    const run = G.run;
    const m = L.mascot;
    let mood = 'idle';
    if (G.t < G.moodUntil) mood = G.mood;
    else if (BS.fullness(run.board) > 0.62) mood = 'worried';
    const lx = clamp((UI.px - m.x) / 300, -1, 1), ly = clamp((UI.py - m.y) / 300, -1, 1);
    drawMascotLook(m.x, m.y, m.s, { mood, lookX: lx, lookY: ly });
    if (G.say && G.t < G.say.until) {
      const bw = V.port ? 420 : 300;
      if (V.port) speechBubble(G.say.text, m.x + 180, L.board.y + 20, bw, 'up');
      else speechBubble(G.say.text, m.x, m.y - m.s * 0.95, bw, 'down');
    }
  }

  // ---------- Overlays ----------
  function dim(a) { ctx.save(); ctx.fillStyle = `rgba(8,3,24,${a})`; ctx.fillRect(0, 0, V.lw, V.lh); ctx.restore(); }

  function drawOverlay() {
    const o = G.overlay;
    if (!o) return;
    UI.layer = 1;
    if (o.type === 'intro') drawIntro(o);
    else if (o.type === 'pause') drawPause(o);
    else if (o.type === 'wheel') drawWheel(o);
    else if (o.type === 'fail') drawFail(o);
    else if (o.type === 'replace') drawReplace(o);
    else if (o.type === 'levelup') drawLevelUp(o);
    else if (o.type === 'confirm') drawConfirm(o);
    UI.layer = 0;
  }

  function drawIntro(o) {
    const run = G.run;
    const k = easeBack((G.t - o.t0) / 0.35);
    dim(0.55 * clamp((G.t - o.t0) / 0.2, 0, 1));
    const w = Math.min(560, V.lw - 40), h = run.boss ? 400 : 330;
    const x = L.cx - w / 2, y = L.cy - h / 2;
    ctx.save(); ctx.translate(L.cx, L.cy); ctx.scale(k, k); ctx.translate(-L.cx, -L.cy);
    panel(ctx, x, y, w, h, { fill: '#26125e', edge: run.boss ? '#ff4d6d' : '#8d6bff', lw: 4 });
    const head = run.mode === 'endless' ? 'Endless' : run.mode === 'daily' ? `Daily Spell #${dayNumber()}` : `Floor ${run.floor + 1}`;
    text(ctx, head, L.cx, y + 48, { size: 26, color: PAL.dim });
    text(ctx, run.mode === 'endless' ? `LEVEL ${run.level}` : run.boss ? 'BOSS ROUND' : `ROUND ${run.round + 1}`, L.cx, y + 98, { size: 56, color: run.boss ? '#ff4d6d' : '#fff', stroke: '#1a0b3d', sw: 10 });
    let yy = y + 150;
    if (run.mode === 'endless') {
      text(ctx, 'Unlimited pieces. It gets harder as you climb.', L.cx, yy + 6, { size: 24, color: '#fff', font: 'b', weight: 600, maxWidth: w - 40 });
      text(ctx, 'Best: ' + fmt(G.save.endlessBest || 0), L.cx, yy + 44, { size: 26, color: '#ffd23f', stroke: '#3a2400', sw: 5 });
      ctx.restore();
      if (o.wait) { text(ctx, 'Loading…', L.cx, y + h - 60, { size: 26, color: PAL.dim }); return; }
      btn('introGo', L.cx - 130, y + h - 100, 260, 78, "Let's go!", 'green', dismissIntro);
      return;
    }
    if (run.boss) {
      text(ctx, BS.BOSS[run.boss].name, L.cx, yy, { size: 34, color: '#ffd23f', stroke: '#3a1400', sw: 7 });
      text(ctx, BS.BOSS[run.boss].desc, L.cx, yy + 40, { size: 22, color: '#ffd6de', font: 'b', weight: 600, maxWidth: w - 40 });
      yy += 84;
    }
    text(ctx, 'Score ' + fmt(run.target) + ' with ' + BS.piecesLeft(run) + ' pieces', L.cx, yy + 6, { size: 28, color: '#fff', stroke: '#1a0b3d', sw: 6, maxWidth: w - 40 });
    ctx.restore();
    if (o.wait) { text(ctx, 'Loading…', L.cx, y + h - 60, { size: 26, color: PAL.dim }); return; }
    btn('introGo', L.cx - 130, y + h - 100, 260, 78, run.boss ? 'Bring it on!' : "Let's go!", run.boss ? 'red' : 'green', dismissIntro);
  }

  function drawPause() {
    dim(0.65);
    const w = Math.min(480, V.lw - 40), h = 520;
    const x = L.cx - w / 2, y = L.cy - h / 2;
    panel(ctx, x, y, w, h, { fill: '#26125e', edge: '#8d6bff', lw: 4 });
    text(ctx, 'Paused', L.cx, y + 62, { size: 54, color: '#fff', stroke: '#1a0b3d', sw: 10 });
    btn('resume', x + 40, y + 110, w - 80, 80, 'Resume', 'green', resume);
    btn('psound', x + 40, y + 206, (w - 96) / 2, 70, G.save.sound ? 'Sound: on' : 'Sound: off', 'purple', toggleSound, { size: 24 });
    btn('pmusic', x + 56 + (w - 96) / 2, y + 206, (w - 96) / 2, 70, G.save.music ? 'Music: on' : 'Music: off', 'purple', toggleMusic, { size: 24 });
    btn('pgfx', x + 40, y + 292, w - 80, 70, G.save.gfx === 'fast' ? 'Graphics: fast' : 'Graphics: auto', 'purple', toggleGfx, { size: 24 });
    btn('quit', x + 40, y + 380, w - 80, 70, 'Save and quit', 'ghost', () => { G.overlay = null; Poki.stop(); persistRun(); G.run = null; G.scene = 'title'; }, { size: 26 });
    text(ctx, 'Your run is saved. Continue it from the menu.', L.cx, y + h - 30, { size: 17, color: PAL.mute, font: 'b', weight: 500 });
  }

  function drawWheel(o) {
    wheelUpdate(o);
    dim(0.62);
    const R = Math.min(V.lw, V.lh) * (V.port ? 0.36 : 0.3);
    const cx = L.cx, cy = L.cy - (o.done ? R * 0.28 : 0) * easeOut((G.t - (o.doneT || G.t)) / 0.35);
    const seg = (Math.PI * 2) / 8;
    const ang = G.wheelAng;
    // glow
    ctx.save();
    const rg = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.45);
    rg.addColorStop(0, 'rgba(166,108,255,0.45)'); rg.addColorStop(1, 'rgba(166,108,255,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(cx, cy, R * 1.45, 0, Math.PI * 2); ctx.fill();
    // rim
    ctx.fillStyle = '#2a0f6e'; ctx.beginPath(); ctx.arc(cx, cy, R + 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(cx, cy, R + 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c48f00'; ctx.beginPath(); ctx.arc(cx, cy, R + 6, 0, Math.PI * 2); ctx.fill();
    const goodCols = ['#2ee6a6', '#3ec5ff', '#ffd23f', '#a66cff'];
    for (let i = 0; i < 8; i++) {
      const id = o.spin.segs[i];
      const good = BS.ORB[id].good;
      const a0 = ang + i * seg - Math.PI / 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0, a0 + seg); ctx.closePath();
      ctx.fillStyle = good ? goodCols[(i / 2) % 4 | 0] : (i % 4 === 1 ? '#ff4d6d' : '#c2264a');
      if (o.done && i === o.spin.index) ctx.fillStyle = GFX.lighten(good ? goodCols[(i / 2) % 4 | 0] : '#ff4d6d', 0.25 + 0.2 * Math.sin(G.t * 10));
      ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(26,11,61,0.6)'; ctx.stroke();
      ctx.save();
      const am = a0 + seg / 2;
      ctx.translate(cx, cy); ctx.rotate(am); ctx.translate(R * 0.6, 0);
      if (Math.cos(am) < -0.05) ctx.rotate(Math.PI);
      text(ctx, BS.ORB[id].name, 0, 0, { size: R * 0.095, color: '#fff', stroke: good ? 'rgba(10,40,60,0.85)' : '#5e0019', sw: R * 0.022, maxWidth: R * 0.62 });
      ctx.restore();
    }
    // studs
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + ang;
      const on = (Math.floor(G.t * 6) + i) % 2 === 0;
      ctx.fillStyle = on ? '#ffffff' : '#fff1a8';
      star(ctx, cx + Math.cos(a) * (R + 10), cy + Math.sin(a) * (R + 10), on ? 6 : 4, 2, 4); ctx.fill();
    }
    // hub
    ctx.fillStyle = '#2a0f6e'; ctx.beginPath(); ctx.arc(cx, cy, R * 0.2, 0, Math.PI * 2); ctx.fill();
    GFX.drawOrbMark(ctx, cx, cy, R * 0.16, G.t);
    // pointer
    const fk = o.flick ? clamp((G.t - o.flick) / 0.12, 0, 1) : 1;
    ctx.save(); ctx.translate(cx, cy - R - 16); ctx.rotate((1 - fk) * 0.35);
    ctx.fillStyle = '#1a0b3d'; ctx.beginPath(); ctx.moveTo(-22, -16); ctx.lineTo(22, -16); ctx.lineTo(0, 30); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff4d9a'; ctx.beginPath(); ctx.moveTo(-16, -12); ctx.lineTo(16, -12); ctx.lineTo(0, 22); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -6, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.restore();
    text(ctx, 'SPELL WHEEL', cx, cy - R - 60, { size: 40, grad: ['#fff6b0', '#ffd23f', '#ff9f1c'], stroke: '#2a0f6e', sw: 8 });
    if (!o.done) return;
    // result card
    const orb = BS.ORB[o.spin.id];
    const k = easeBack((G.t - o.doneT) / 0.35);
    const w = Math.min(560, V.lw - 40), h = 210;
    const x = cx - w / 2, y = cy + R * 0.72 + 40;
    ctx.save(); ctx.translate(cx, y + h / 2); ctx.scale(k, k); ctx.translate(-cx, -(y + h / 2));
    panel(ctx, x, y, w, h, { fill: orb.good ? '#0f3d3a' : '#4a0f24', edge: orb.good ? '#2ee6a6' : '#ff4d6d', lw: 4 });
    text(ctx, orb.name, cx, y + 44, { size: 44, color: orb.good ? '#9af7d6' : '#ffb3c1', stroke: '#1a0b3d', sw: 8 });
    text(ctx, orb.desc, cx, y + 88, { size: 22, color: '#fff', font: 'b', weight: 600, maxWidth: w - 40 });
    ctx.restore();
    if (G.t - o.doneT < 0.35) return;
    const canRespin = !orb.good && G.run.respins === 0;
    if (canRespin) {
      const bw = (w - 60) / 2;
      btn('wOk', x + 20, y + h - 92, bw, 72, 'OK', 'green', wheelAccept);
      btn('wRe', x + 40 + bw, y + h - 92, bw, 72, 'Re-spin', 'gold', wheelRespin, { ad: true });
    } else {
      btn('wOk', cx - 140, y + h - 92, 280, 72, orb.good ? 'Awesome!' : 'OK', 'green', wheelAccept);
    }
  }

  function drawFail(o) {
    const run = G.run;
    dim(0.6 * clamp((G.t - o.t0) / 0.3, 0, 1));
    const k = easeBack((G.t - o.t0 - 0.15) / 0.35);
    const w = Math.min(560, V.lw - 40), h = run.revived ? 330 : 430;
    const x = L.cx - w / 2, y = L.cy - h / 2;
    ctx.save(); ctx.translate(L.cx, L.cy); ctx.scale(Math.max(0.01, k), Math.max(0.01, k)); ctx.translate(-L.cx, -L.cy);
    panel(ctx, x, y, w, h, { fill: '#2b1043', edge: '#ff4d6d', lw: 4 });
    const endless = run.mode === 'endless';
    const out = !endless && BS.piecesLeft(run) === 0;
    text(ctx, out ? 'Out of pieces!' : 'No more room!', L.cx, y + 60, { size: 48, color: '#ff8fa3', stroke: '#1a0b3d', sw: 9 });
    if (endless) {
      text(ctx, fmt(run.totalScore) + ' points', L.cx, y + 116, { size: 34, color: '#fff', stroke: '#1a0b3d', sw: 6 });
      const best = G.save.endlessBest || 0;
      text(ctx, run.totalScore > best ? 'New best score!' : 'Level ' + run.level + ' · best ' + fmt(best), L.cx, y + 154, { size: 22, color: run.totalScore > best ? '#ffd23f' : PAL.dim, font: 'b', weight: 600 });
    } else {
      text(ctx, fmt(run.roundScore) + ' / ' + fmt(run.target), L.cx, y + 116, { size: 34, color: '#fff', stroke: '#1a0b3d', sw: 6 });
      const missing = run.target - run.roundScore;
      text(ctx, 'Only ' + fmt(missing) + ' points to go!', L.cx, y + 154, { size: 22, color: PAL.dim, font: 'b', weight: 600 });
    }
    ctx.restore();
    if (k < 0.9) return;
    if (!run.revived) {
      // Poki rule: the standard (green) choice sits beside the rewarded one and is at least as big.
      const bw2 = (w - 100) / 2;
      btn('giveup', x + 40, y + 200, bw2, 90, run.mode === 'run' ? 'End run' : 'See score', 'green', () => endRun(false), { size: 28 });
      btn('revive', x + 60 + bw2, y + 200, bw2, 90, endless ? 'Wipe board' : 'Revive', 'gold', useRevive, { ad: true, size: 28 });
      text(ctx, (NO_ADS ? (endless ? 'One free wipe: clear the whole board' : 'One free revive: clear 3 lines and get 6 more pieces') : (endless ? 'Watch a short ad to clear the whole board' : 'Watch a short ad to clear 3 lines and get 6 more pieces')), L.cx, y + 318, { size: 18, color: PAL.dim, font: 'b', weight: 500, maxWidth: w - 40 });
    } else {
      btn('giveup', x + 60, y + 200, w - 120, 84, run.mode === 'run' ? 'See results' : 'See my score', 'green', () => endRun(false));
    }
  }

  // Swap screen. Modes: reward | shop | gift | levelup (optional) and curse (forced: you must give up a spell).
  function drawReplace(o) {
    const run = G.run;
    const forced = o.mode === 'curse';
    const inc = BS.SPELL[o.id];
    dim(0.72);
    const w = Math.min(700, V.lw - 32), h = forced ? 390 : 480;
    const x = L.cx - w / 2, y = L.cy - h / 2;
    panel(ctx, x, y, w, h, { fill: forced ? '#3a0f2a' : '#26125e', edge: forced ? '#ff4d6d' : '#8d6bff', lw: 4 });
    text(ctx, forced ? 'Cursed!' : 'Spell book full!', L.cx, y + 46, { size: 42, color: forced ? '#ff8fa3' : '#fff', stroke: '#1a0b3d', sw: 8 });
    // incoming spell
    spellBadge(ctx, inc, x + 34, y + 84, 70, V.px, G.t);
    text(ctx, inc.name, x + 124, y + 104, { size: 26, color: forced ? '#ffb3c1' : '#fff', align: 'left', maxWidth: w - 150 });
    const dl = GFX.wrap(ctx, inc.desc, w - 160, 18, 'b');
    dl.slice(0, 2).forEach((l, i) => text(ctx, l, x + 124, y + 134 + i * 22, { size: 18, color: '#e6deff', font: 'b', weight: 500, align: 'left' }));
    text(ctx, forced ? 'Pick a spell to lose. Curses wear off after ' + BS.CURSE_MOVES + ' moves.' : 'Tap a spell to swap it out', L.cx, y + 200, { size: 20, color: forced ? '#ffd6de' : PAL.dim, font: 'b', weight: 600, maxWidth: w - 40 });
    const n = run.spells.length;
    const slot = Math.min(96, (w - 60) / n - 16);
    const tot = n * slot + (n - 1) * 16;
    run.spells.forEach((sp, i) => {
      const sx = L.cx - tot / 2 + i * (slot + 16), sy = y + 228;
      const locked = sp.curse;
      const st = locked ? '' : hitArea('rep' + i, sx, sy, slot, slot + 40, () => resolveReplace(o, i));
      ctx.save();
      if (locked) ctx.globalAlpha = 0.4;
      if (st) { ctx.translate(sx + slot / 2, sy + slot / 2); ctx.scale(1.08, 1.08); ctx.translate(-(sx + slot / 2), -(sy + slot / 2)); }
      spellBadge(ctx, BS.SPELL[sp.id], sx, sy, slot, V.px, G.t);
      ctx.restore();
      text(ctx, BS.SPELL[sp.id].name, sx + slot / 2, sy + slot + 22, { size: 15, color: locked ? '#8c7cd6' : '#e6deff', font: 'b', weight: 600, maxWidth: slot + 14 });
    });
    if (!forced) {
      const label = o.mode === 'gift' ? 'No thanks' : o.mode === 'levelup' ? 'Skip' : 'Keep my spells';
      btn('repCancel', L.cx - 140, y + h - 96, 280, 72, label, 'ghost', () => resolveReplace(o, -1), { size: 24 });
    }
  }

  function resolveReplace(o, i) {
    const run = G.run;
    G.overlay = null;
    if (o.mode === 'reward') { if (i >= 0) takeSpell(o.id, i); return; }
    if (o.mode === 'shop') {
      if (i >= 0) {
        const it = run.shop.items[o.shopIdx];
        if (it && !it.sold && run.coins >= it.price && BS.addSpell(run, it.id, i)) { run.coins -= it.price; it.sold = true; SFX.buy(); }
      }
      persistRun(); return;
    }
    if (o.mode === 'gift') { if (i >= 0 && BS.addSpell(run, o.id, i)) { SFX.spell(); G.wiggle[o.id] = G.t; } continueAfterOverlay(); return; }
    if (o.mode === 'curse') { if (BS.placeCurse(run, o.id, i)) { SFX.bad(); G.wiggle[o.id] = G.t; setMood('shocked', 1.5); } continueAfterOverlay(); return; }
    if (o.mode === 'levelup') { if (i >= 0 && BS.addSpell(run, o.id, i)) { SFX.spell(); G.wiggle[o.id] = G.t; } levelupDone(); }
  }
  function continueAfterOverlay() { if (!G.awaitStart) Poki.start(); G.busy = true; after(0.35, afterMove); persistRun(); }

  // ---------- Endless level-up ----------
  function openLevelUp() {
    const run = G.run;
    if (!run || !run.pendingLevelUps) return;
    run.pendingLevelUps--;
    const lvl = run.level - run.pendingLevelUps;
    G.overlay = { type: 'levelup', t0: G.t, offer: BS.offerSpells(run, 3), level: lvl };
    SFX.win(); confetti(90); setMood('wow', 2);
    Poki.stop();
    persistRun();
  }
  function pickLevelSpell(id) {
    const run = G.run;
    if (run.spells.length >= run.slots) { G.overlay = { type: 'replace', mode: 'levelup', id, t0: G.t }; return; }
    BS.addSpell(run, id);
    SFX.spell(); G.wiggle[id] = G.t;
    levelupDone();
  }
  function levelupDone() {
    G.overlay = null;
    persistRun();
    if (G.run && G.run.pendingLevelUps > 0) { openLevelUp(); return; }
    Poki.commercial().then(() => { if (G.scene === 'play' && !G.overlay && !G.awaitStart) Poki.start(); });
  }
  function drawLevelUp(o) {
    const run = G.run;
    dim(0.68);
    const k = easeBack((G.t - o.t0) / 0.4);
    ctx.save(); ctx.translate(L.cx, V.port ? 250 : 92); ctx.scale(k, k);
    text(ctx, 'LEVEL ' + o.level + '!', 0, 0, { size: 84, grad: ['#fff6b0', '#ffd23f', '#ff9f1c'], stroke: '#2a0f6e', sw: 14 });
    ctx.restore();
    if (G.t - o.t0 < 0.35) return;
    const gp = BS.gremlinPlan(o.level), gpPrev = BS.gremlinPlan(o.level - 1);
    let warn = 'Bigger pieces ahead';
    if (gp && !gpPrev) warn = 'Gremlins arrive! They drop stones on the board';
    else if (gp && gpPrev && gp.count > gpPrev.count) warn = 'Gremlins now drop ' + gp.count + ' stones at a time';
    else if (gp) warn = 'Gremlins come faster';
    text(ctx, '+' + ((o.level - 1) * 0.25) + ' Mult level bonus  ·  ' + warn, L.cx, (V.port ? 250 : 92) + 62, { size: 20, color: '#ffd6de', stroke: '#1a0b3d', sw: 5, maxWidth: V.lw - 40 });
    const y0 = V.port ? 362 : 196;
    text(ctx, o.offer.length ? 'Pick a spell' : 'Your spell book is complete!', L.cx, y0, { size: 32, color: '#fff', stroke: '#1a0b3d', sw: 7 });
    const n = o.offer.length;
    const cw = V.port ? Math.min(210, (V.lw - 60) / Math.max(n, 1) - 14) : 220, ch = V.port ? 330 : 300, gap = 16;
    const tot = n * cw + (n - 1) * gap;
    o.offer.forEach((id, i) => {
      const cx = L.cx - tot / 2 + i * (cw + gap), cy = y0 + 34;
      const st = hitArea('lv' + i, cx, cy, cw, ch, () => pickLevelSpell(id));
      spellCard(BS.SPELL[id], cx, cy - (st === 'hover' ? 6 : 0), cw, ch);
    });
    btn('lvSkip', L.cx - 130, Math.min(y0 + ch + 50, V.lh - 80), 260, 70, n ? 'Skip' : 'Keep playing', n ? 'ghost' : 'green', levelupDone, { size: 26 });
  }

  function drawConfirm(o) {
    dim(0.7);
    const w = Math.min(560, V.lw - 40), h = 300;
    const x = L.cx - w / 2, y = L.cy - h / 2;
    panel(ctx, x, y, w, h, { fill: '#26125e', edge: '#8d6bff', lw: 4 });
    text(ctx, o.title, L.cx, y + 56, { size: 40, color: '#fff', stroke: '#1a0b3d', sw: 8 });
    para(ctx, o.body, L.cx, y + 104, w - 60, 21, PAL.dim);
    const bw = (w - 60) / 2;
    btn('cNo', x + 20, y + h - 96, bw, 72, 'Cancel', 'ghost', () => { G.overlay = null; }, { size: 26 });
    btn('cYes', x + 40 + bw, y + h - 96, bw, 72, o.yes, 'red', () => { G.overlay = null; o.fn(); }, { size: 26 });
  }

  function drawFakeAd() {
    const f = G.fakeAd;
    if (!f) return;
    const k = (G.t - f.t0) / f.dur;
    ctx.save(); ctx.fillStyle = 'rgba(5,2,15,0.92)'; ctx.fillRect(0, 0, V.lw, V.lh); ctx.restore();
    text(ctx, 'Ad break', L.cx, L.cy - 40, { size: 48, color: '#fff' });
    text(ctx, 'On Poki, a short ad plays here.', L.cx, L.cy + 10, { size: 24, color: PAL.dim, font: 'b', weight: 600 });
    rr(ctx, L.cx - 150, L.cy + 50, 300, 14, 7); ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fill();
    rr(ctx, L.cx - 150, L.cy + 50, 300 * clamp(k, 0, 1), 14, 7); ctx.fillStyle = '#ffd23f'; ctx.fill();
    if (k >= 1) { const r = f.res; G.fakeAd = null; SFX.setAdMute(false); r(true); }
  }

  // ---------- Title ----------
  function drawTitle() {
    const s = G.save;
    const port = V.port;
    const logoW = port ? 600 : 560;
    const ly = port ? 300 : 175;
    logo(ctx, L.cx, ly, logoW, G.t, V.px);
    const my = port ? 660 : 470;
    const mx = port ? L.cx : L.cx - 380;
    drawMascotLook(mx, my, 150, { mood: G.t % 6 < 1.2 ? 'happy' : 'idle', lookX: clamp((UI.px - mx) / 400, -1, 1), lookY: clamp((UI.py - my) / 400, -1, 1) });
    const bw = port ? 520 : 440;
    let by = port ? 790 : 330;
    const bx = L.cx - bw / 2 + (port ? 0 : 60);
    const hasRun = !!s.run;
    if (hasRun) {
      btn('continue', bx, by, bw, 96, 'Continue run', 'green', () => { G.run = s.run; enterPlay(true); }, { size: 40 });
      by += 112;
      btn('newrun', bx, by, bw, 76, 'New run', 'purple', () => {
        G.overlay = { type: 'confirm', title: 'Start over?', body: 'Your current run will end and its progress will be lost.', yes: 'New run', fn: () => { s.run = null; persist(); goNewRun(); } };
      }, { size: 30 });
      by += 92;
    } else {
      btn('play', bx, by, bw, 104, 'Play', 'green', goNewRun, { size: 48 });
      by += 122;
    }
    const today = localDate();
    const done = s.daily.results[today];
    const dlabel = s.dailyRun && s.dailyRun.date === today ? 'Continue daily' : done ? 'Daily: done' : 'Daily spell #' + dayNumber();
    const hw0 = (bw - 14) / 2;
    btn('endless', bx, by, hw0, 76, s.endlessRun ? 'Continue endless' : 'Endless', 'purple', () => { if (s.endlessRun) { G.run = s.endlessRun; enterPlay(true); } else startEndless(); }, { size: 26 });
    btn('daily', bx + hw0 + 14, by, hw0, 76, dlabel, 'gold', openDaily, { size: 24 });
    if (s.daily.streak > 0 && (s.daily.last === today || s.daily.last === yesterday())) {
      flameIcon(bx + bw - 26, by + 6, 28, '#ff4d6d');
      text(ctx, String(s.daily.streak), bx + bw - 26, by + 12, { size: 16, color: '#fff', stroke: '#5e0019', sw: 4 });
    }
    by += 92;
    const hw = (bw - 14) / 2;
    btn('book', bx, by, hw, 68, 'Spellbook', 'ghost', () => { G.scene = 'book'; G.bookSel = null; G.bookTab = 'spells'; }, { size: 26 });
    btn('closet', bx + hw + 14, by, hw, 68, 'Style shop', 'blue', openCloset, { size: 26 });
    // level badge
    const lx = port ? 24 : 24, lyb = 24;
    panel(ctx, lx, lyb, 250, 64, { r: 18 });
    text(ctx, 'Lv ' + s.level, lx + 22, lyb + 32, { size: 30, color: '#ffd23f', stroke: '#3a2400', sw: 6, align: 'left' });
    const need = BS.xpNeeded(s.level);
    rr(ctx, lx + 100, lyb + 24, 130, 16, 8); ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill();
    rr(ctx, lx + 100, lyb + 24, Math.max(16, 130 * (s.xp / need)), 16, 8); ctx.fillStyle = '#a66cff'; ctx.fill();
    // gems
    panel(ctx, lx, lyb + 76, 160, 54, { r: 18 });
    gemIcon(lx + 30, lyb + 103, 15);
    text(ctx, String(s.gems), lx + 54, lyb + 104, { size: 28, color: '#a3e6ff', stroke: '#06304a', sw: 5, align: 'left' });
    // sound toggles
    iconButton('snd', V.lw - 110, 52, 26, drawSoundIcon, toggleSound, { off: !s.sound });
    iconButton('mus', V.lw - 48, 52, 26, drawMusicIcon, toggleMusic, { off: !s.music });
    const bests = [];
    if (s.best > 0) bests.push('Best run ' + fmt(s.best));
    if (s.endlessBest > 0) bests.push('Best endless ' + fmt(s.endlessBest));
    if (bests.length) text(ctx, bests.join('   ·   '), L.cx + (port ? 0 : 60), by + 100, { size: 20, color: PAL.mute, font: 'b', weight: 600 });
  }

  function goNewRun() {
    if (G.save.runs === 0) { startRun('apprentice'); return; }
    G.scene = 'wizards'; G.sceneT = G.t;
  }

  function backButton(fn) { iconButton('back', 52, 52, 28, drawBackIcon, fn); }

  // ---------- Wizards ----------
  function drawWizards() {
    backButton(() => { G.scene = 'title'; });
    text(ctx, 'Choose your wizard', L.cx, 70, { size: 46, color: '#fff', stroke: '#1a0b3d', sw: 9 });
    const port = V.port;
    const cols = port ? 2 : 4;
    const cw = port ? 320 : 280, ch = port ? 470 : 470;
    const gap = 20;
    const tot = cols * cw + (cols - 1) * gap;
    const x0 = L.cx - tot / 2, y0 = port ? 140 : 140;
    BS.WIZARDS.forEach((w, i) => {
      const x = x0 + (i % cols) * (cw + gap), y = y0 + Math.floor(i / cols) * (ch + gap);
      const unlocked = G.save.wizards.includes(w.id);
      const st = unlocked ? hitArea('wiz' + i, x, y, cw, ch, () => startRun(w.id)) : '';
      const lift = st === 'hover' ? -6 : st === 'down' ? 3 : 0;
      panel(ctx, x, y + lift, cw, ch, { fill: unlocked ? '#26125e' : '#1a0f3a', edge: unlocked ? BLOCK[w.hue][0] : 'rgba(255,255,255,0.12)', lw: 4 });
      ctx.save(); if (!unlocked) ctx.globalAlpha = 0.35;
      mascot(ctx, x + cw / 2, y + lift + 130, 120, G.t + i, { hue: w.hue, mood: st === 'hover' ? 'happy' : 'idle' });
      ctx.restore();
      text(ctx, w.name, x + cw / 2, y + lift + 260, { size: 34, color: unlocked ? '#fff' : '#8c7cd6', stroke: '#1a0b3d', sw: 7 });
      if (unlocked) {
        para(ctx, w.desc, x + cw / 2, y + lift + 300, cw - 36, 19, '#e6deff');
        const sp = w.spells.map((id) => BS.SPELL[id]);
        const bs = 64, tw = sp.length * bs + (sp.length - 1) * 12;
        sp.forEach((s, j) => { const bx = x + cw / 2 - tw / 2 + j * (bs + 12), by2 = y + lift + ch - 96; spellBadge(ctx, s, bx, by2, bs, V.px, G.t); hoverTip(s.id, bx, by2, bs); });
      } else {
        text(ctx, 'Locked', x + cw / 2, y + lift + 304, { size: 26, color: '#ffd23f' });
        para(ctx, w.unlock, x + cw / 2, y + lift + 344, cw - 40, 19, '#bfb0ff');
      }
    });
  }

  // ---------- Spellbook ----------
  function drawBook() {
    backButton(() => { G.scene = 'title'; });
    text(ctx, 'Spellbook', L.cx, 64, { size: 48, color: '#fff', stroke: '#1a0b3d', sw: 9 });
    const tab = G.bookTab || 'spells';
    const tw = 200;
    btn('bkSpells', L.cx - tw - 8, 104, tw, 54, 'Spells', tab === 'spells' ? 'purple' : 'ghost', () => { G.bookTab = 'spells'; G.bookSel = null; }, { size: 22 });
    btn('bkCurses', L.cx + 8, 104, tw, 54, 'Curses', tab === 'curses' ? 'red' : 'ghost', () => { G.bookTab = 'curses'; G.bookSel = null; }, { size: 22 });
    const list = tab === 'curses' ? BS.CURSES : BS.SPELLS;
    const port = V.port;
    const cols = port ? 5 : 9;
    const slot = port ? 112 : 96;
    const gap = port ? 18 : 16;
    const tot = cols * slot + (cols - 1) * gap;
    const x0 = L.cx - tot / 2, y0 = 182;
    let hov = null;
    list.forEach((sp, i) => {
      const x = x0 + (i % cols) * (slot + gap), y = y0 + Math.floor(i / cols) * (slot + 40);
      const locked = sp.lock && sp.lock > G.save.level;
      const st = hitArea('bk' + tab + i, x, y, slot, slot + 30, () => { if (!UI.mouse) G.bookSel = i; });
      if (st === 'hover' || st === 'down') hov = i;
      const active = hov === i || (hov == null && G.bookSel === i);
      ctx.save();
      if (active) { rr(ctx, x - 8, y - 8, slot + 16, slot + 44, 20); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill(); }
      if (locked) {
        rr(ctx, x + 6, y + 6, slot - 12, slot - 12, 20); ctx.fillStyle = '#2a1a55'; ctx.fill();
        text(ctx, '?', x + slot / 2, y + slot / 2, { size: 50, color: '#5a4a90' });
      } else spellBadge(ctx, sp, x + 6, y + 6, slot - 12, V.px, G.t);
      ctx.restore();
      text(ctx, locked ? 'Level ' + sp.lock : sp.name, x + slot / 2, y + slot + 16, { size: 15, color: locked ? '#8c7cd6' : sp.curse ? '#ffb3c1' : '#e6deff', font: 'b', weight: 600, maxWidth: slot + 14 });
    });
    // Mouse: hovering shows the description. Touch: tapping does.
    const sel = hov != null ? hov : G.bookSel;
    const rows = Math.ceil(list.length / cols);
    const py = Math.min(y0 + rows * (slot + 40) + 6, V.lh - 150);
    if (sel != null && list[sel]) {
      const sp = list[sel];
      const locked = sp.lock && sp.lock > G.save.level;
      const w = Math.min(760, V.lw - 40);
      panel(ctx, L.cx - w / 2, py, w, 140, { fill: sp.curse ? '#3a0f2a' : '#26125e', edge: RARITY[sp.r][0], lw: 3 });
      text(ctx, locked ? 'Locked spell' : sp.name, L.cx, py + 38, { size: 32, color: '#fff', stroke: '#1a0b3d', sw: 6 });
      const tail = sp.curse ? '  (Curse: takes a spell slot for ' + BS.CURSE_MOVES + ' moves)' : '  (' + RARITY[sp.r][1] + ')';
      para(ctx, locked ? 'Reach level ' + sp.lock + ' to unlock this spell.' : sp.desc + tail, L.cx, py + 82, w - 40, 21, '#e6deff');
    } else {
      const hint = tab === 'curses' ? 'Curses come from bad Spell Wheel spins. They wear off after a few moves.' : 'Spells drop between rounds, in the shop, on the Spell Wheel and on Endless level-ups.';
      text(ctx, (UI.mouse ? 'Hover over one to read it. ' : 'Tap one to read it. ') + hint, L.cx, py + 40, { size: 19, color: PAL.mute, font: 'b', weight: 600, maxWidth: V.lw - 40 });
    }
  }

  // ---------- Daily ----------
  function drawDaily() {
    backButton(() => { G.scene = 'title'; });
    const s = G.save;
    const today = localDate();
    const res = s.daily.results[today];
    const bd = PF ? G.board : null;
    const w = Math.min(600, V.lw - 40), h = PF && res ? 660 : 560;
    const x = L.cx - w / 2, y = Math.max(12, L.cy - h / 2 + (V.port ? 90 : PF && res ? 6 : 34));
    if (V.port) drawMascotLook(L.cx, y - 110, 130, { mood: res ? 'happy' : 'idle' });
    else drawMascotLook(x - 110, L.cy + 40, 130, { mood: res ? 'happy' : 'idle' });
    panel(ctx, x, y, w, h, { fill: '#2b1650', edge: '#ffd23f', lw: 4 });
    text(ctx, 'Daily Spell #' + dayNumber(), L.cx, y + 58, { size: 48, grad: ['#fff6b0', '#ffd23f', '#ff9f1c'], stroke: '#3a1400', sw: 9 });
    text(ctx, today, L.cx, y + 104, { size: 22, color: '#ffcc7a', font: 'b', weight: 600 });
    if (s.daily.streak > 0 && (s.daily.last === today || s.daily.last === yesterday())) {
      flameIcon(L.cx - 70, y + 150, 34, '#ff4d6d');
      text(ctx, s.daily.streak + ' day streak', L.cx + 10, y + 152, { size: 28, color: '#fff', stroke: '#3a1400', sw: 6 });
    }
    if (res && PF) {
      // Reddit: score, rank, today's top five, then comment / share.
      text(ctx, "Today's score", L.cx, y + 200, { size: 22, color: '#ffcc7a' });
      text(ctx, fmt(res.score), L.cx, y + 244, { size: 58, color: '#fff', stroke: '#3a1400', sw: 9 });
      const rankLine = !bd ? 'Loading the leaderboard...' : bd.me ? `#${bd.me.rank} of ${fmt(bd.total)} ${bd.total === 1 ? 'player' : 'players'} today` : bd.signedIn ? 'Saving your score...' : 'Log in to Reddit to join the leaderboard';
      text(ctx, rankLine, L.cx, y + 290, { size: 24, color: '#9af7d6', font: 'b', weight: 700, maxWidth: w - 60 });
      const top = bd ? bd.top.slice(0, 5) : [];
      const ry = y + 324;
      rr(ctx, x + 30, ry, w - 60, 178, 16); ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fill();
      if (!top.length) text(ctx, bd ? 'No scores yet. You could be first!' : '', L.cx, ry + 89, { size: 20, color: PAL.dim, font: 'b', weight: 600 });
      top.forEach((r, i) => {
        const yy = ry + 22 + i * 34;
        const mine = bd.me && r.username === bd.me.username;
        if (mine) { rr(ctx, x + 38, yy - 15, w - 76, 30, 10); ctx.fillStyle = 'rgba(255,210,63,0.18)'; ctx.fill(); }
        const medal = ['#ffd23f', '#d8ccff', '#ff9f5a'][i] || '#ffe6b3';
        text(ctx, String(i + 1), x + 62, yy, { size: 22, color: medal, stroke: '#1a0b3d', sw: 4 });
        text(ctx, 'u/' + r.username, x + 88, yy, { size: 20, color: '#fff', font: 'b', weight: 600, align: 'left', maxWidth: w - 260 });
        text(ctx, fmt(r.score), x + w - 50, yy, { size: 22, color: '#fff', align: 'right' });
      });
      const by = y + 520, bw = (w - 120 - 16) / 2;
      const cLabel = G.commented === today ? 'Posted!' : G.commenting ? 'Posting...' : 'Comment score';
      btn('dcomment', x + 60, by, bw, 76, cLabel, 'gold', commentDaily, { size: 26, disabled: G.commented === today || !(bd && bd.signedIn) });
      btn('share', x + 60 + bw + 16, by, bw, 76, 'Share', 'blue', shareDaily, { size: 28 });
      const left = msToNextDay();
      const hh = Math.floor(left / 3.6e6), mm = Math.floor((left % 3.6e6) / 6e4);
      text(ctx, `Next spell in ${hh}h ${mm}m`, L.cx, y + 630, { size: 22, color: '#ffcc7a', font: 'b', weight: 600 });
    } else if (res) {
      text(ctx, "Today's score", L.cx, y + 214, { size: 24, color: '#ffcc7a' });
      text(ctx, fmt(res.score), L.cx, y + 268, { size: 70, color: '#fff', stroke: '#3a1400', sw: 10 });
      for (let i = 0; i < 3; i++) drawBlock(ctx, L.cx - 75 + i * 52, y + 304, 46, i < res.cleared ? { color: 3, kind: 'normal' } : { color: -1, kind: 'stone' }, V.px, G.t, {});
      btn('share', x + 60, y + 360, w - 120, 84, G.t - G.copied < 2 ? 'Copied!' : 'Share score', 'gold', shareDaily, { size: 34 });
      const left = msToNextDay();
      const hh = Math.floor(left / 3.6e6), mm = Math.floor((left % 3.6e6) / 6e4);
      text(ctx, `Next spell in ${hh}h ${mm}m`, L.cx, y + 490, { size: 22, color: '#ffcc7a', font: 'b', weight: 600 });
    } else {
      para(ctx, 'Everyone gets the same pieces, the same spells and the same boss today. One try. How high can you score?', L.cx, y + 214, w - 80, 23, '#ffe6b3');
      if (bd && bd.total > 0 && bd.top[0]) {
        text(ctx, `${fmt(bd.total)} ${bd.total === 1 ? 'player' : 'players'} today  ·  top: ${fmt(bd.top[0].score)} by u/${bd.top[0].username}`, L.cx, y + 336, { size: 19, color: '#9af7d6', font: 'b', weight: 700, maxWidth: w - 50 });
      }
      const cont = s.dailyRun && s.dailyRun.date === today;
      btn('dplay', x + 60, y + 380, w - 120, 100, cont ? 'Continue' : 'Play daily', 'gold', () => {
        if (cont) { G.run = s.dailyRun; enterPlay(true); } else startDaily();
      }, { size: 42 });
    }
  }

  function shareTextFor(res) {
    const sq = '\u{1F7E9}'.repeat(res.cleared) + '⬛'.repeat(Math.max(0, 3 - res.cleared));
    let t = `Blockspell Daily #${dayNumber()}\n${sq} ${fmt(res.score)}`;
    if (G.dailyURL) t += '\n' + G.dailyURL;
    return t;
  }
  function openDaily() {
    G.scene = 'daily'; G.sceneT = G.t;
    if (PF) PF.board(localDate()).then((b) => { if (b) G.board = b; }).catch(() => null);
  }
  function commentDaily() {
    const res = G.save.daily.results[localDate()];
    if (!res || !PF || G.commenting) return;
    G.commenting = true;
    PF.comment(shareTextFor(res)).then((ok) => { G.commenting = false; if (ok) G.commented = localDate(); }).catch(() => { G.commenting = false; });
  }
  function shareDaily() {
    const res = G.save.daily.results[localDate()];
    if (!res) return;
    const t = shareTextFor(res);
    if (PF) { PF.share(t); return; }
    try {
      navigator.clipboard.writeText(t).then(() => { G.copied = G.t; }).catch(() => { G.copied = G.t; G.shareFallback = t; });
    } catch (e) { G.shareFallback = t; G.copied = G.t; }
  }

  // ---------- Reward ----------
  function drawReward() {
    const run = G.run;
    const rew = run.rewardInfo;
    const port = V.port;
    const t = G.t - (G.rewardT || 0);
    const w = Math.min(port ? 680 : 980, V.lw - 32);
    const x = L.cx - w / 2;
    let y = port ? 70 : 28;
    text(ctx, rew.isBoss ? 'Boss beaten!' : 'Round cleared!', L.cx, y + 34, { size: 52, grad: ['#ffffff', '#9af7d6', '#2ee6a6'], stroke: '#06302a', sw: 10 });
    y += 82;
    // coin tally
    const rowsT = [['Round bonus', rew.base], ['Leftover pieces (' + rew.left + ')', rew.leftover]];
    if (rew.interest) rowsT.push(['Piggy Bank', rew.interest]);
    const ph = 52 + rowsT.length * 38;
    panel(ctx, x + (port ? 0 : 160), y, w - (port ? 0 : 320), ph, { fill: '#2a1a12', edge: 'rgba(255,210,63,0.5)' });
    rowsT.forEach(([lab, v], i) => {
      const vis = t > 0.2 + i * 0.25;
      if (vis && !G['tallied' + i + '_' + G.rewardT]) { G['tallied' + i + '_' + G.rewardT] = 1; if (v) SFX.coin(i); }
      ctx.globalAlpha = vis ? 1 : 0.2;
      text(ctx, lab, x + (port ? 30 : 190), y + 34 + i * 38, { size: 22, color: '#ffe6b3', font: 'b', weight: 600, align: 'left' });
      coinIcon(x + w - (port ? 90 : 250), y + 34 + i * 38, 11);
      text(ctx, '+' + v, x + w - (port ? 30 : 190), y + 35 + i * 38, { size: 26, color: '#ffd23f', stroke: '#3a2400', sw: 5, align: 'right' });
      ctx.globalAlpha = 1;
    });
    text(ctx, 'Coins: ' + run.coins, L.cx, y + ph - 18, { size: 24, color: '#fff', stroke: '#3a2400', sw: 5 });
    y += ph + 26;
    if (rew.isBoss && run.lastRound) {
      drawMascotLook(L.cx, y + 175, 130, { mood: 'happy' });
      btn('finish', L.cx - 190, y + 270, 380, 92, 'Finish run', 'green', startNextRound, { size: 38 });
      return;
    }
    if (rew.isBoss) {
      text(ctx, 'The Wandering Shop is open', L.cx, y + 24, { size: 30, color: '#fff' });
      drawMascotLook(L.cx, y + 205, 120, { mood: 'happy' });
      btn('toShop', L.cx - 190, Math.min(y + 300, V.lh - 104), 380, 92, 'Visit the shop', 'gold', toShop, { size: 36 });
      return;
    }
    if (run.offer) {
      text(ctx, 'Pick a spell', L.cx, y + 22, { size: 34, color: '#fff', stroke: '#1a0b3d', sw: 7 });
      y += 52;
      const n = run.offer.length;
      const cw = port ? Math.min(210, (w - (n - 1) * 14) / n) : Math.min(220, (w - (n - 1) * 18) / n);
      const ch = port ? 330 : 300;
      const gap = port ? 14 : 18;
      const tot = n * cw + (n - 1) * gap;
      run.offer.forEach((id, i) => {
        const sp = BS.SPELL[id];
        const cx = L.cx - tot / 2 + i * (cw + gap);
        const ap = easeBack((t - 0.5 - i * 0.12) / 0.35);
        if (ap <= 0) return;
        const st = hitArea('offer' + i, cx, y, cw, ch, () => takeSpell(id));
        const lift = st === 'hover' ? -8 : st === 'down' ? 4 : 0;
        ctx.save(); ctx.translate(cx + cw / 2, y + ch / 2); ctx.scale(ap, ap); ctx.translate(-(cx + cw / 2), -(y + ch / 2));
        spellCard(sp, cx, y + lift, cw, ch);
        ctx.restore();
      });
      y += ch + 20;
      const bw = port ? 300 : 300;
      btn('skip', L.cx - bw / 2, y, bw, 70, 'Skip (+3 coins)', 'ghost', skipReward, { size: 24 });
    } else {
      const sp = run.picked && run.picked !== 'skip' ? BS.SPELL[run.picked] : null;
      if (sp) {
        text(ctx, 'New spell!', L.cx, y + 26, { size: 32, color: '#fff' });
        spellCard(sp, L.cx - 110, y + 54, 220, port ? 330 : 280);
        y += port ? 400 : 350;
      } else { y += 40; }
      btn('next', L.cx - 200, y, 400, 96, run.lastRound ? 'Finish run' : 'Next round', 'green', startNextRound, { size: 40 });
    }
  }

  function cardBody(x, y, w, h, nameStr, nameStroke, tag, tagColor, desc, descColor, compact) {
    const bs = compact ? 70 : Math.min(92, w * 0.46);
    let yy = y + 16 + bs + 30;
    text(ctx, nameStr, x + w / 2, yy, { size: 25, color: '#fff', stroke: nameStroke, sw: 6, maxWidth: w - 20 });
    yy += 26;
    text(ctx, tag, x + w / 2, yy, { size: 14, color: tagColor, font: 'b', weight: 700 });
    yy += 28;
    let fs = 18;
    let lines = GFX.wrap(ctx, desc, w - 24, fs, 'b');
    if (lines.length > 3) { fs = 16; lines = GFX.wrap(ctx, desc, w - 22, fs, 'b'); }
    lines.forEach((l, i) => text(ctx, l, x + w / 2, yy + i * (fs + 4), { size: fs, color: descColor, font: 'b', weight: 500 }));
    return bs;
  }

  function spellCard(sp, x, y, w, h, o) {
    o = o || {};
    panel(ctx, x, y, w, h, { fill: '#26125e', edge: RARITY[sp.r][0], lw: sp.r === 3 ? 5 : 3, r: 22 });
    const compact = o.price != null || h < 300;
    const bs = compact ? 70 : Math.min(92, w * 0.46);
    spellBadge(ctx, sp, x + w / 2 - bs / 2, y + 16, bs, V.px, G.t);
    cardBody(x, y, w, h, sp.name, '#1a0b3d', RARITY[sp.r][1].toUpperCase(), RARITY[sp.r][0], sp.desc, '#e6deff', compact);
    if (o.price != null) priceTag(x, y, w, h, o.price, o.sold, o.state);
  }

  function priceTag(x, y, w, h, price, sold, st) {
    const by = y + h - 58;
    button(ctx, x + 16, by, w - 32, 50, '', sold ? 'ghost' : 'gold', st || '', {});
    if (sold) text(ctx, 'Sold', x + w / 2, by + 21, { size: 24, color: '#bfb0ff' });
    else { coinIcon(x + w / 2 - 22, by + 21, 12); text(ctx, String(price), x + w / 2 + 6, by + 22, { size: 26, color: '#3a2400', align: 'left' }); }
  }

  // ---------- Shop ----------
  function drawShop() {
    const run = G.run;
    const port = V.port;
    const t = G.t - (G.shopT || 0);
    let y = port ? 70 : 30;
    text(ctx, 'The Wandering Shop', L.cx, y + 30, { size: port ? 50 : 46, grad: ['#fff6b0', '#ffd23f', '#ff9f1c'], stroke: '#3a1400', sw: 10 });
    coinIcon(L.cx - 50, y + 80, 16);
    text(ctx, String(run.coins), L.cx - 26, y + 82, { size: 36, color: '#ffd23f', stroke: '#3a2400', sw: 7, align: 'left' });
    y += port ? 120 : 108;
    const items = run.shop.items;
    const n = items.length;
    const cols = port ? 2 : n;
    const cw = port ? 300 : 214, ch = port ? 320 : 300, gap = port ? 18 : 18;
    const tot = cols * cw + (cols - 1) * gap;
    items.forEach((it, i) => {
      const cx = L.cx - tot / 2 + (i % cols) * (cw + gap);
      const cy = y + Math.floor(i / cols) * (ch + gap);
      const ap = easeBack((t - i * 0.08) / 0.35);
      if (ap <= 0) return;
      const st = it.sold ? '' : hitArea('shop' + i, cx, cy, cw, ch, () => buyItem(i));
      ctx.save(); ctx.translate(cx + cw / 2, cy + ch / 2); ctx.scale(ap, ap); ctx.translate(-(cx + cw / 2), -(cy + ch / 2));
      if (it.type === 'spell') spellCard(BS.SPELL[it.id], cx, cy - (st === 'hover' ? 6 : 0), cw, ch, { price: it.price, sold: it.sold, state: st });
      else boostCard(BS.BOOST[it.id], cx, cy - (st === 'hover' ? 6 : 0), cw, ch, it, st);
      ctx.restore();
    });
    y += Math.ceil(n / cols) * (ch + gap) + (port ? 10 : 2);
    text(ctx, 'Your spells (tap one to sell, or cleanse a curse)', L.cx, y + 12, { size: 20, color: PAL.dim, font: 'b', weight: 600 });
    y += 30;
    const ss = port ? 76 : 62;
    const tot2 = run.slots * ss + (run.slots - 1) * 12;
    for (let i = 0; i < run.slots; i++) {
      const sx = L.cx - tot2 / 2 + i * (ss + 12);
      const sp = run.spells[i];
      if (!sp) { ctx.save(); ctx.setLineDash([6, 6]); ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(191,176,255,0.35)'; rr(ctx, sx + 4, y + 4, ss - 8, ss - 8, 16); ctx.stroke(); ctx.restore(); continue; }
      hitArea('own' + i, sx, y, ss, ss, () => { G.sel = G.sel === i ? null : i; });
      if (G.sel === i) { rr(ctx, sx - 6, y - 6, ss + 12, ss + 12, 20); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fill(); }
      spellBadge(ctx, BS.SPELL[sp.id], sx + 4, y + 4, ss - 8, V.px, G.t);
      hoverTip(sp.id, sx, y, ss);
    }
    y += ss + 14;
    const bw = port ? 300 : 280;
    const by = Math.min(y, V.lh - 88);
    if (G.sel != null && run.spells[G.sel]) {
      const sp = run.spells[G.sel];
      const isCurse = !!sp.curse;
      btn('sell', L.cx - bw - 10, by, bw, 76, isCurse ? 'Cleanse for 3' : 'Sell for ' + BS.sellValue(sp.id), isCurse ? 'purple' : 'red', () => sellSpell(G.sel), { size: 26, disabled: isCurse && run.coins < 3 });
    } else {
      btn('reroll', L.cx - bw - 10, by, bw, 76, 'Reroll (' + run.shop.reroll + ')', 'purple', reroll, { size: 28, disabled: run.coins < run.shop.reroll });
    }
    btn('leave', L.cx + 10, by, bw, 76, 'Next floor', 'green', startNextRound, { size: 32 });
  }

  function boostCard(b, x, y, w, h, it, st) {
    panel(ctx, x, y, w, h, { fill: '#123048', edge: '#3ec5ff', lw: 3, r: 22 });
    const bs = 70;
    const spr = GFX.blockSprite(BLOCK[4], Math.round(bs * V.px), '');
    ctx.drawImage(spr, x + w / 2 - bs / 2, y + 16, bs, bs);
    const ic = { pieces: 'plus', slot: 'sparkle', hold: 'dot', trim: 'corner', goldleaf: 'crown', seed: 'clover' }[b.id];
    icon(ctx, ic, x + w / 2, y + 16 + bs * 0.46, bs * 0.5);
    cardBody(x, y, w, h, b.name, '#06304a', 'BOOST', '#a3e6ff', b.desc, '#d8f3ff', true);
    priceTag(x, y, w, h, it.price, it.sold, st);
  }

  // ---------- End screen ----------
  function drawEnd() {
    const e = G.end;
    const t = G.t - G.endT;
    const port = V.port;
    const w = Math.min(640, V.lw - 32);
    const x = L.cx - w / 2;
    let y = port ? 100 : 24;
    const title = e.mode === 'daily' ? 'Daily complete!' : e.mode === 'endless' ? (e.newBest ? 'New best!' : 'Game over') : e.victory ? 'You win!' : 'Run over';
    const k = easeBack(t / 0.4);
    ctx.save(); ctx.translate(L.cx, y + 40); ctx.scale(k, k);
    text(ctx, title, 0, 0, { size: 64, grad: e.victory ? ['#fff6b0', '#ffd23f', '#ff9f1c'] : ['#ffffff', '#d6b8ff', '#a66cff'], stroke: '#2a0f6e', sw: 12 });
    ctx.restore();
    const mood = e.victory || e.mode === 'daily' || e.newBest ? 'happy' : 'worried';
    if (port) { y += 90; drawMascotLook(L.cx, y + 125, 110, { mood }); y += 200; }
    else { drawMascotLook(x - 100, 330, 120, { mood }); y += 92; }
    const h = (e.mode === 'daily' ? 220 : 280 + (e.unlocks.length ? 20 + e.unlocks.length * 30 : 0)) + 44;
    panel(ctx, x, y, w, h, { fill: '#26125e', edge: '#8d6bff', lw: 3 });
    text(ctx, 'Total score', L.cx, y + 32, { size: 22, color: PAL.dim, font: 'b', weight: 600 });
    const shown = Math.min(e.score, e.score * easeOut(t / 1.2));
    GFX.numText(ctx, fmt(shown), L.cx, y + 80, { size: 60, color: '#fff', stroke: '#1a0b3d', sw: 10 });
    const stats = e.mode === 'daily'
      ? [['Rounds cleared', e.rounds + ' / 3'], ['Best move', fmt(e.stats.best)]]
      : e.mode === 'endless'
      ? [['Level', String(e.level)], ['Lines cleared', String(e.stats.lines)], ['Best move', fmt(e.stats.best)], ['Top streak', 'x' + e.stats.maxStreak]]
      : [['Reached', 'Floor ' + (Math.min(e.floor, 2) + 1)], ['Lines cleared', String(e.stats.lines)], ['Best move', fmt(e.stats.best)], ['Top streak', 'x' + e.stats.maxStreak]];
    stats.forEach(([a, b], i) => {
      const sx = i % 2 === 0 ? x + 36 : L.cx + 20;
      const sy = y + 134 + Math.floor(i / 2) * 38;
      text(ctx, a, sx, sy, { size: 19, color: PAL.dim, font: 'b', weight: 600, align: 'left' });
      text(ctx, b, sx + (w / 2 - 56), sy, { size: 22, color: '#fff', align: 'right' });
    });
    if (e.mode !== 'daily') {
      const xy = y + 228;
      text(ctx, '+' + e.xp + ' XP', x + 36, xy, { size: 24, color: '#d6b8ff', align: 'left' });
      text(ctx, 'Level ' + G.save.level, x + w - 36, xy, { size: 24, color: '#ffd23f', align: 'right' });
      if (e.levelUps) text(ctx, 'LEVEL UP!', L.cx, xy, { size: 26, color: '#ffd23f', stroke: '#3a2400', sw: 6 });
      e.unlocks.forEach((u, i) => text(ctx, u, L.cx, xy + 40 + i * 30, { size: 22, color: '#9af7d6', stroke: '#06302a', sw: 5 }));
    }
    const gy = y + h - 30;
    gemIcon(L.cx - 62, gy, 15);
    text(ctx, '+' + (e.gems || 0) + ' gems', L.cx - 40, gy + 1, { size: 26, color: '#a3e6ff', stroke: '#06304a', sw: 5, align: 'left' });
    y += h + 22;
    const mainLabel = e.mode === 'daily' ? (PF ? 'Leaderboard' : G.t - G.copied < 2 ? 'Copied!' : 'Share score') : 'Play again';
    const mainFn = e.mode === 'daily' ? (PF ? openDaily : shareDaily) : e.mode === 'endless' ? startEndless : goNewRun;
    const mainStyle = e.mode === 'daily' ? 'gold' : 'green';
    if (port) {
      btn('emain', x + 30, y, w - 60, 92, mainLabel, mainStyle, mainFn, { size: 40 });
      btn('emenu', x + 120, y + 108, w - 240, 70, 'Menu', 'ghost', () => { G.scene = 'title'; }, { size: 28 });
    } else {
      const bw = (w - 20) / 2;
      btn('emenu', x, y, bw * 0.7, 84, 'Menu', 'ghost', () => { G.scene = 'title'; }, { size: 28 });
      btn('emain', x + bw * 0.7 + 20, y, w - bw * 0.7 - 20, 84, mainLabel, mainStyle, mainFn, { size: 36 });
    }
  }

  // ---------- Style shop ----------
  function openCloset() { G.scene = 'closet'; G.closet = { tab: 'mascot', sel: G.save.equip.mascot, t0: G.t }; }
  function owns(tab, id) { return G.save.owned[tab].includes(id); }
  function priceOf(tab, id) { const it = CATALOG[tab].find((x) => x[0] === id); return it ? it[1] : 0; }
  function closetAction() {
    const c = G.closet, s = G.save;
    const id = c.sel, tab = c.tab;
    if (owns(tab, id)) { s.equip[tab] = id; SFX.spell(); persist(); return; }
    const price = priceOf(tab, id);
    if (s.gems < price) { SFX.error(); G.closetMsg = { t: G.t, text: 'You need ' + (price - s.gems) + ' more gems' }; return; }
    s.gems -= price; s.owned[tab].push(id); s.equip[tab] = id;
    SFX.buy(); haptic(30); confetti(80, L.cx, L.cy);
    G.closetMsg = { t: G.t, text: itemName(tab, id) + ' unlocked!' };
    persist();
  }
  function freeGems() {
    const s = G.save, today = localDate();
    if (s.freeGems.date !== today) s.freeGems = { date: today, n: 0 };
    if (s.freeGems.n >= FREE_GEMS_PER_DAY) return;
    Poki.rewarded('small').then((ok) => {
      if (!ok) return;
      s.freeGems.n++; s.gems += FREE_GEMS; persist();
      SFX.coin(0); SFX.coin(1); G.closetMsg = { t: G.t, text: '+' + FREE_GEMS + ' gems!' };
    });
  }
  function previewLook() {
    const c = G.closet, e = G.save.equip;
    const o = { skin: e.mascot, hat: e.hat, face: e.face, bg: e.bg };
    o[c.tab === 'mascot' ? 'skin' : c.tab] = c.sel;
    return o;
  }
  function thumb(tab, id, w, h) {
    const e = G.save.equip;
    const key = 'th|' + tab + '|' + id + '|' + e.mascot + '|' + e.hat + '|' + e.face + '|' + w.toFixed(0) + '|' + V.px;
    G.thumbs = G.thumbs || new Map();
    let sp = G.thumbs.get(key);
    if (!sp) {
      const { c, g } = GFX.offscreen(w, h);
      if (tab === 'bg') themeSwatch(g, THEMES[id], 0, 0, w, h, 14);
      else {
        const o = { skin: e.mascot, hat: tab === 'hat' ? e.hat : 'none', face: e.face, noWand: true, mood: 'idle' };
        if (tab === 'mascot') o.skin = id; else o[tab] = id;
        const ms = Math.min(w, h) * (tab === 'hat' ? 0.56 : 0.72);
        mascot(g, w / 2, h * (tab === 'hat' ? 0.66 : 0.5), ms, 0.4, o);
      }
      sp = { c };
      G.thumbs.set(key, sp);
      if (G.thumbs.size > 120) G.thumbs.delete(G.thumbs.keys().next().value);
    }
    return sp.c;
  }
  function drawCloset() {
    const c = G.closet, s = G.save, port = V.port;
    backButton(() => { G.scene = 'title'; });
    text(ctx, 'Style shop', L.cx, port ? 60 : 52, { size: 48, color: '#fff', stroke: '#1a0b3d', sw: 9 });
    // gem counter + free gems
    const today = localDate();
    const used = s.freeGems.date === today ? s.freeGems.n : 0;
    const gx = port ? L.cx + 360 - 24 : V.lw - 40;
    panel(ctx, gx - 160, port ? 96 : 24, 160, 54, { r: 18 });
    gemIcon(gx - 132, (port ? 96 : 24) + 27, 15);
    text(ctx, String(s.gems), gx - 108, (port ? 96 : 24) + 28, { size: 28, color: '#a3e6ff', stroke: '#06304a', sw: 5, align: 'left' });
    const fbx = port ? L.cx - 336 : V.lw - 420, fby = port ? 96 : 24;
    btn('freegems', fbx, fby, 220, 58, used >= FREE_GEMS_PER_DAY ? 'Back tomorrow' : '+' + FREE_GEMS + ' free gems', 'blue', freeGems, { ad: used < FREE_GEMS_PER_DAY, size: 20, disabled: used >= FREE_GEMS_PER_DAY });
    // preview panel
    const pv = port ? { x: L.cx - 336, y: 170, w: 672, h: 360 } : { x: (V.lw - 1200) / 2, y: 100, w: 400, h: 590 };
    const look2 = previewLook();
    const th = THEMES[look2.bg] || THEMES.night;
    const pkey = 'pv|' + th.id + '|' + pv.w + '|' + pv.h + '|' + V.px;
    if (!G.pvCache || G.pvCache.key !== pkey) { const o = GFX.offscreen(pv.w, pv.h); themeSwatch(o.g, th, 0, 0, pv.w, pv.h, 24); G.pvCache = { key: pkey, c: o.c }; }
    ctx.drawImage(G.pvCache.c, pv.x, pv.y, pv.w, pv.h);
    ctx.save(); rr(ctx, pv.x, pv.y, pv.w, pv.h, 24); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(141,107,255,0.7)'; ctx.stroke(); ctx.restore();
    const ms = port ? 150 : 170;
    mascot(ctx, pv.x + pv.w / 2, pv.y + (port ? pv.h * 0.5 : pv.h * 0.42), ms, G.t, { skin: look2.skin, hat: look2.hat, face: look2.face, mood: (G.t - (c.t0 || 0)) < 0.8 ? 'happy' : 'idle', lookX: clamp((UI.px - pv.x - pv.w / 2) / 400, -1, 1), lookY: clamp((UI.py - pv.y - pv.h / 2) / 400, -1, 1) });
    const name = itemName(c.tab, c.sel);
    if (port) text(ctx, name, pv.x + 26, pv.y + 36, { size: 30, color: '#fff', stroke: '#1a0b3d', sw: 7, align: 'left' });
    else text(ctx, name, pv.x + pv.w / 2, pv.y + pv.h - 150, { size: 32, color: '#fff', stroke: '#1a0b3d', sw: 7 });
    // action button
    const owned = owns(c.tab, c.sel), equipped = s.equip[c.tab] === c.sel, price = priceOf(c.tab, c.sel);
    const abw = port ? 300 : 320, abx = pv.x + pv.w / 2 - abw / 2, aby = pv.y + pv.h - (port ? 84 : 104);
    if (equipped) btn('cact', abx, aby, abw, 76, 'Equipped', 'ghost', () => {}, { size: 30 });
    else if (owned) btn('cact', abx, aby, abw, 76, 'Equip', 'green', closetAction, { size: 34 });
    else {
      btn('cact', abx, aby, abw, 76, 'Buy for ' + price, 'gold', closetAction, { size: 32, disabled: s.gems < price });
    }
    if (G.closetMsg && G.t - G.closetMsg.t < 2.2) text(ctx, G.closetMsg.text, pv.x + pv.w / 2, aby - 24, { size: 22, color: '#ffe98a', stroke: '#1a0b3d', sw: 5 });
    // tabs
    const area = port ? { x: L.cx - 336, y: 556, w: 672 } : { x: pv.x + pv.w + 30, y: 100, w: 1200 - pv.w - 30 };
    const tw = (area.w - 3 * 10) / 4;
    TABS.forEach(([id, label], i) => {
      const x = area.x + i * (tw + 10);
      btn('tab' + id, x, area.y, tw, 58, label, c.tab === id ? 'purple' : 'ghost', () => { c.tab = id; c.sel = s.equip[id]; c.t0 = G.t; }, { size: 21 });
    });
    // grid
    const items = CATALOG[c.tab];
    const cols = port ? 4 : 5;
    const gap = 12;
    const cw = (area.w - (cols - 1) * gap) / cols, ch = port ? 176 : 166;
    const gy = area.y + 74;
    items.forEach(([id, pr], i) => {
      const x = area.x + (i % cols) * (cw + gap), y = gy + Math.floor(i / cols) * (ch + gap);
      const st = hitArea('it' + c.tab + id, x, y, cw, ch, () => { c.sel = id; c.t0 = G.t; SFX.pick(); });
      const isSel = c.sel === id, isEq = s.equip[c.tab] === id, own = owns(c.tab, id);
      panel(ctx, x, y - (st === 'hover' ? 4 : 0), cw, ch, { fill: isSel ? '#3a1f86' : '#22114f', edge: isSel ? '#ffd23f' : isEq ? '#2ee6a6' : 'rgba(141,107,255,0.3)', lw: isSel ? 4 : 3, r: 18 });
      const lift = st === 'hover' ? -4 : 0;
      const tw2 = cw - 16, th2 = ch - 62;
      ctx.drawImage(thumb(c.tab, id, tw2, th2), x + 8, y + 8 + lift, tw2, th2);
      text(ctx, itemName(c.tab, id), x + cw / 2, y + ch - 42 + lift, { size: 16, color: '#fff', font: 'b', weight: 600, maxWidth: cw - 12 });
      if (isEq) text(ctx, 'Equipped', x + cw / 2, y + ch - 18 + lift, { size: 16, color: '#2ee6a6', font: 'b', weight: 700 });
      else if (own) text(ctx, 'Owned', x + cw / 2, y + ch - 18 + lift, { size: 16, color: '#bfb0ff', font: 'b', weight: 700 });
      else { gemIcon(x + cw / 2 - 20, y + ch - 19 + lift, 10); text(ctx, String(pr), x + cw / 2 - 5, y + ch - 18 + lift, { size: 20, color: s.gems >= pr ? '#a3e6ff' : '#8c7cd6', align: 'left' }); }
    });
  }

  // ---------- Loop ----------
  let last = performance.now();
  // Is anything moving fast enough to need 60 fps? Idle screens (gentle bobbing only) run at 30.
  let lastScene = '', sceneAt = 0, frameNo = 0;
  function animating() {
    if (G.scene !== lastScene) { lastScene = G.scene; sceneAt = G.t; }
    if (G.t - sceneAt < 1.6 || UI.dirty || UI.down) return true;
    if (G.drag || G.returning || G.parts.length || G.floats.length || G.words.length || G.ghosts.length || G.beams.length || G.rings.length) return true;
    if (G.banner || G.roundIntro || G.flash > 0.01 || G.shake > 0.3 || G.fakeAd || G.timers.length) return true;
    if (G.overlay && (G.overlay.type === 'wheel' || G.t - (G.overlay.t0 || 0) < 1.2)) return true;
    if (G.closet && G.scene === 'closet' && G.t - (G.closet.t0 || 0) < 1) return true;
    if (G.run && Math.abs(G.dispScore - G.run.roundScore) > 0.5) return true;
    if (G.t - G.trayAnim < 0.7 || G.t - (G.copied || -9) < 2) return true;
    return false;
  }

  let lastRaw = performance.now();
  function frame(now) {
    const raw = now - lastRaw; lastRaw = now;
    G.dt = Math.min(0.05, (now - last) / 1000) * (G.speed || 1);
    last = now;
    G.t += G.dt;
    for (let i = G.timers.length - 1; i >= 0; i--) if (G.timers[i].at <= G.t) { const tm = G.timers.splice(i, 1)[0]; tm.fn(); }
    const active = animating();
    governor(raw, active);
    frameNo++;
    if (!active && (frameNo & 1) && G.scene !== 'loading') { requestAnimationFrame(frame); return; }
    G.dt = Math.min(0.1, G.dt * (active ? 1 : 2));
    UI.dirty = false;
    UI.prevTop = UI.prev.reduce((m, h) => Math.max(m, h.layer), 0);
    UI.hits = []; UI.layer = 0; G.hoverTip = null;

    // shake
    let sx = 0, sy = 0;
    if (G.shake > 0.3) { sx = (Math.random() - 0.5) * G.shake; sy = (Math.random() - 0.5) * G.shake; G.shake *= Math.pow(0.002, G.dt); } else G.shake = 0;
    drawBg(sx, sy);

    switch (G.scene) {
      case 'loading': text(ctx, 'Loading…', L.cx, L.cy, { size: 40, color: '#fff' }); break;
      case 'title': drawTitle(); break;
      case 'wizards': drawWizards(); break;
      case 'book': drawBook(); break;
      case 'daily': drawDaily(); break;
      case 'play': drawPlay(); break;
      case 'reward': drawReward(); break;
      case 'shop': drawShop(); break;
      case 'end': drawEnd(); break;
      case 'closet': drawCloset(); break;
    }
    drawParts();
    if (G.scene === 'play') { drawFloats(); drawWords(); }
    drawTip();
    if (G.banner) drawBanner();
    if (G.flash > 0.01) {
      ctx.save(); ctx.globalAlpha = G.flash * 0.8; ctx.fillStyle = G.flashColor;
      if (G.scene === 'play' && L.board) { rr(ctx, L.board.x - 16, L.board.y - 16, L.board.size + 32, L.board.size + 32, 28); ctx.fill(); }
      ctx.restore(); G.flash *= Math.pow(0.0005, G.dt);
    }
    drawOverlay();
    if (G.shareFallback && G.scene !== 'play') {
      text(ctx, 'Copy this: ' + G.shareFallback.replace(/\n/g, '  '), L.cx, V.lh - 24, { size: 16, color: '#fff', font: 'b', weight: 500, maxWidth: V.lw - 20 });
    }
    drawFakeAd();
    UI.prev = UI.hits;
    requestAnimationFrame(frame);
  }

  function drawBanner() {
    const b = G.banner;
    const k = easeBack((G.t - b.t0) / 0.4);
    ctx.save();
    ctx.translate(L.cx, L.cy - 40);
    ctx.rotate(-0.05);
    ctx.scale(k, k);
    ctx.fillStyle = 'rgba(26,11,61,0.85)';
    ctx.beginPath(); ctx.moveTo(-V.lw, -70); ctx.lineTo(V.lw, -90); ctx.lineTo(V.lw, 70); ctx.lineTo(-V.lw, 90); ctx.closePath(); ctx.fill();
    text(ctx, b.text, 0, -8, { size: 92, grad: ['#fff6b0', '#ffd23f', '#ff9f1c'], stroke: '#2a0f6e', sw: 14, maxWidth: V.lw - 40 });
    if (b.sub) text(ctx, b.sub, 0, 58, { size: 30, color: '#fff', stroke: '#1a0b3d', sw: 6 });
    ctx.restore();
  }

  // ---------- Boot ----------
  function boot(hotData) {
    resize();
    requestAnimationFrame(frame);
    const fontsReady = (document.fonts && document.fonts.load)
      ? Promise.all([document.fonts.load('40px "Lilita One"'), document.fonts.load('600 20px Fredoka'), document.fonts.load('500 20px Fredoka')]).catch(() => null)
      : Promise.resolve();
    const timeout = new Promise((r) => setTimeout(r, 2500));
    Promise.all([Poki.init(), Promise.race([fontsReady, timeout])]).then(() => {
      GFX.clearCache();
      Poki.loadingDone();
      // Brand-new players skip the menu and land on the board with the tutorial hand.
      if (PF && PF.startOnDaily) openDaily();
      else if (G.save.runs === 0 && !G.save.run && !G.save.tut.drag) startRun('apprentice');
      else G.scene = 'title';
    });
  }
  if (window.BS_DEBUG) window.__blockspell = { pause, resume, Q, effTier, resize, startEndless, openLevelUp, pickLevelSpell, levelupDone, resolveReplace, G, BS, startRun, startDaily, doPlace, layout, V: () => V, L, openWheel, toReward, toShop, roundFailed, endRun, afterMove, handleClear, enterPlay, wheelAccept, takeSpell, skipReward, startNextRound, buyItem, dismissIntro, useRevive, wheelRespin };
  const hot = window.claude && window.claude.hot;
  if (hot && hot.ready) hot.ready(boot); else boot(hot && hot.data ? hot.data : {});
})();
