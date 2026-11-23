/* Blockspell audio: synthesized SFX and a light generative music loop (no audio files). */
(function (root) {
  'use strict';
  const A = {
    ctx: null, master: null, sfx: null, music: null,
    soundOn: true, musicOn: true, adMuted: false, hidden: false,
    musicTimer: null, nextBeat: 0, beat: 0,
  };

  A.unlock = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    try {
      A.ctx = new AC();
      A.master = A.ctx.createGain(); A.master.gain.value = 0.9; A.master.connect(A.ctx.destination);
      const comp = A.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(A.master);
      A.sfx = A.ctx.createGain(); A.sfx.gain.value = 0.55; A.sfx.connect(comp);
      A.music = A.ctx.createGain(); A.music.gain.value = 0.0; A.music.connect(comp);
      A.apply();
      A.startMusic();
    } catch (e) { A.ctx = null; }
  };

  A.apply = function () {
    if (!A.ctx) return;
    const silent = A.adMuted || A.hidden;
    const t = A.ctx.currentTime;
    A.sfx.gain.setTargetAtTime(silent || !A.soundOn ? 0 : 0.55, t, 0.02);
    A.music.gain.setTargetAtTime(silent || !A.musicOn ? 0 : 0.16, t, 0.15);
  };
  A.setAdMute = function (m) { A.adMuted = m; A.apply(); };
  A.setHidden = function (h) { A.hidden = h; A.apply(); };

  function env(g, t, a, peak, d) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function tone(freq, dur, type, vol, opts) {
    if (!A.ctx || !A.soundOn) return;
    opts = opts || {};
    const t = A.ctx.currentTime + (opts.delay || 0);
    const o = A.ctx.createOscillator();
    const g = A.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(opts.slide, t + dur);
    o.connect(g); g.connect(opts.dest || A.sfx);
    env(g, t, opts.attack || 0.005, vol || 0.3, dur);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, vol, freq, opts) {
    if (!A.ctx || !A.soundOn) return;
    opts = opts || {};
    const t = A.ctx.currentTime + (opts.delay || 0);
    const len = Math.floor(A.ctx.sampleRate * dur);
    const buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = A.ctx.createBufferSource(); src.buffer = buf;
    const f = A.ctx.createBiquadFilter(); f.type = opts.type || 'lowpass'; f.frequency.value = freq || 1200;
    const g = A.ctx.createGain(); g.gain.value = vol || 0.2;
    src.connect(f); f.connect(g); g.connect(A.sfx);
    src.start(t);
  }

  const PENT = [0, 2, 4, 7, 9];
  function note(i) { // pentatonic index from C5
    const oct = Math.floor(i / 5), deg = ((i % 5) + 5) % 5;
    return 523.25 * Math.pow(2, (PENT[deg] + oct * 12) / 12);
  }

  A.pick = () => { tone(660, 0.07, 'triangle', 0.18, { slide: 880 }); };
  A.drop = () => { tone(330, 0.08, 'triangle', 0.15, { slide: 220 }); };
  A.place = (n) => { tone(180 - Math.min(n, 9) * 6, 0.12, 'sine', 0.45, { slide: 90 }); noise(0.06, 0.18, 900); tone(990, 0.04, 'square', 0.04); };
  A.clear = (lines, streak) => {
    const base = Math.min(8, Math.max(0, streak - 1));
    const n = Math.min(7, 2 + lines * 2);
    for (let i = 0; i < n; i++) {
      tone(note(base + i), 0.22, 'triangle', 0.22, { delay: i * 0.045 });
      tone(note(base + i) * 2, 0.12, 'sine', 0.06, { delay: i * 0.045 });
    }
    noise(0.25, 0.12, 4000, { type: 'highpass' });
  };
  A.word = (lvl) => { [0, 4, 7, 12].forEach((s, i) => tone(784 * Math.pow(2, (s + lvl * 2) / 12), 0.3, 'square', 0.06, { delay: 0.05 + i * 0.06 })); };
  A.coin = (i) => { const d = (i || 0) * 0.05; tone(1318, 0.05, 'square', 0.07, { delay: d }); tone(1760, 0.18, 'square', 0.07, { delay: d + 0.05 }); };
  A.tick = () => { tone(1800, 0.02, 'square', 0.06); };
  A.spinStart = () => { tone(300, 0.4, 'sawtooth', 0.06, { slide: 900 }); };
  A.good = () => { [0, 4, 7, 12, 16].forEach((s, i) => tone(523 * Math.pow(2, s / 12), 0.35, 'triangle', 0.2, { delay: i * 0.07 })); };
  A.bad = () => { [0, -1, -2, -5].forEach((s, i) => tone(330 * Math.pow(2, s / 12), 0.3, 'sawtooth', 0.08, { delay: i * 0.16 })); };
  A.win = () => {
    const seq = [0, 4, 7, 12, 7, 12, 16, 19];
    seq.forEach((s, i) => tone(523 * Math.pow(2, s / 12), 0.25, 'square', 0.07, { delay: i * 0.09 }));
    seq.forEach((s, i) => tone(523 * Math.pow(2, s / 12) / 2, 0.25, 'triangle', 0.15, { delay: i * 0.09 }));
    noise(0.6, 0.1, 6000, { type: 'highpass', delay: 0.6 });
  };
  A.lose = () => { [7, 4, 0, -5].forEach((s, i) => tone(392 * Math.pow(2, s / 12), 0.35, 'triangle', 0.18, { delay: i * 0.18 })); };
  A.click = () => { tone(880, 0.05, 'triangle', 0.12, { slide: 1200 }); };
  A.whoosh = () => { noise(0.3, 0.12, 1500, { type: 'bandpass' }); };
  A.boom = () => { tone(120, 0.4, 'sine', 0.5, { slide: 40 }); noise(0.4, 0.3, 700); };
  A.spell = () => { [12, 16, 19, 24].forEach((s, i) => tone(523 * Math.pow(2, s / 12), 0.15, 'sine', 0.12, { delay: i * 0.035 })); };
  A.buy = () => { A.coin(0); A.coin(1); tone(1046, 0.25, 'triangle', 0.15, { delay: 0.12 }); };
  A.error = () => { tone(200, 0.15, 'square', 0.08); tone(160, 0.2, 'square', 0.08, { delay: 0.08 }); };

  // ---- Music: soft arpeggios over I-vi-IV-V in C, 100 bpm ----
  const CHORDS = [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]];
  A.startMusic = function () {
    if (!A.ctx || A.musicTimer) return;
    A.nextBeat = A.ctx.currentTime + 0.1;
    A.beat = 0;
    A.musicTimer = setInterval(A.schedule, 60);
  };
  A.schedule = function () {
    if (!A.ctx) return;
    const spb = 60 / 100 / 2; // eighth notes
    while (A.nextBeat < A.ctx.currentTime + 0.25) {
      const b = A.beat;
      const bar = Math.floor(b / 8) % 4;
      const ch = CHORDS[bar];
      const step = b % 8;
      const pattern = [0, 1, 2, 1, 0, 2, 1, 2];
      const semis = ch[pattern[step]] + (step >= 4 ? 12 : 0);
      const f = 392 * Math.pow(2, semis / 12);
      sched(f, A.nextBeat, spb * 0.9, 'triangle', 0.09);
      if (step === 0 || step === 4) sched(98 * Math.pow(2, ch[0] / 12), A.nextBeat, spb * 3.5, 'sine', 0.28);
      if (step % 2 === 1 && Math.floor(b / 32) % 2 === 1) sched(f * 2, A.nextBeat, spb * 0.5, 'sine', 0.03);
      A.nextBeat += spb;
      A.beat++;
    }
  };
  function sched(freq, t, dur, type, vol) {
    const o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    o.connect(g); g.connect(A.music);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.05);
  }

  root.SFX = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
