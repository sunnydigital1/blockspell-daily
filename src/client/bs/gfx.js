/* Blockspell graphics: palette, block sprites, icons, mascot, logo, text helpers. */
(function (root) {
  'use strict';

  const PAL = {
    bg0: '#120a2b', bg1: '#2b1466', bg2: '#4a1f8f',
    panel: 'rgba(22,12,54,0.86)', panel2: 'rgba(40,22,92,0.92)', edge: '#7b5cff', edgeDim: 'rgba(123,92,255,0.35)',
    ink: '#ffffff', dim: '#bfb0ff', mute: '#8c7cd6', outline: '#1a0b3d',
    chips: '#3ec5ff', mult: '#ff4d6d', gold: '#ffd23f', good: '#2ee6a6', bad: '#ff4d6d',
    cell: 'rgba(255,255,255,0.055)', boardBg: '#170d38',
  };
  // [base, light, dark]
  const BLOCK = [
    ['#ff4d6d', '#ff9db0', '#b3123a'],
    ['#ff9f1c', '#ffcc7a', '#c25e00'],
    ['#ffd23f', '#fff09a', '#c48f00'],
    ['#2ee6a6', '#9af7d6', '#0c9466'],
    ['#3ec5ff', '#a3e6ff', '#0a7fc0'],
    ['#a66cff', '#d6b8ff', '#6526d4'],
  ];
  const GOLD = ['#f2a900', '#ffe58a', '#8a5200'];
  const STONE = ['#6c638f', '#9a91bd', '#3e3660'];
  const ICE = ['#9fe6ff', '#e8fbff', '#4fb4e0'];

  const FONT_D = '"Lilita One", "Arial Rounded MT Bold", "Trebuchet MS", sans-serif';
  const FONT_B = 'Fredoka, "Nunito", "Trebuchet MS", sans-serif';

  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------- Caches ----------
  // PX = device pixels per logical unit. Sprites are rendered at this resolution.
  let PX = 1;
  const cache = new Map();   // block sprites
  const tcache = new Map();  // text sprites
  const pcache = new Map();  // panels, buttons, badges
  const wcache = new Map();  // word-wrap results
  const mcanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const mctx = mcanvas ? mcanvas.getContext('2d') : null;
  function clearCache() { cache.clear(); tcache.clear(); pcache.clear(); wcache.clear(); }
  function setScale(px) { if (Math.abs(px - PX) > 1e-6) { PX = px; clearCache(); } }
  function lruGet(map, key) { const v = map.get(key); if (v !== undefined) { map.delete(key); map.set(key, v); } return v; }
  function lruSet(map, key, v, max) { map.set(key, v); if (map.size > max) map.delete(map.keys().next().value); return v; }
  function offscreen(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w * PX)); c.height = Math.max(1, Math.ceil(h * PX)); const g = c.getContext('2d'); g.scale(PX, PX); return { c, g }; }

  // ---------- Block sprites ----------

  function blockSprite(cols, px, kind) {
    px = Math.max(4, Math.round(px / 2) * 2);
    const key = cols[0] + '|' + px + '|' + (kind || '');
    let c = lruGet(cache, key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = Math.max(4, Math.ceil(px));
    const g = c.getContext('2d');
    const s = c.width;
    const r = s * 0.2;
    const [base, light, dark] = cols;
    // shadow/edge
    rr(g, 0, 0, s, s, r); g.fillStyle = dark; g.fill();
    // main body (leaves bottom lip)
    rr(g, 0, 0, s, s * 0.9, r); g.fillStyle = base; g.fill();
    // inner face gradient
    const inset = s * 0.13;
    const grd = g.createLinearGradient(0, inset, 0, s * 0.8);
    grd.addColorStop(0, light); grd.addColorStop(1, base);
    rr(g, inset, inset * 0.85, s - inset * 2, s * 0.9 - inset * 1.9, r * 0.6);
    g.fillStyle = grd; g.fill();
    // gloss
    g.globalAlpha = kind === 'ice' ? 0.8 : 0.55;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(s * 0.32, s * 0.26, s * 0.16, s * 0.08, -0.5, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    if (kind === 'stone') {
      g.strokeStyle = dark; g.lineWidth = Math.max(1, s * 0.05); g.lineCap = 'round';
      g.beginPath(); g.moveTo(s * 0.3, s * 0.35); g.lineTo(s * 0.48, s * 0.52); g.lineTo(s * 0.42, s * 0.7); g.stroke();
      g.beginPath(); g.moveTo(s * 0.48, s * 0.52); g.lineTo(s * 0.7, s * 0.48); g.stroke();
    }
    if (kind === 'ice') {
      g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = Math.max(1, s * 0.05); g.lineCap = 'round';
      g.beginPath(); g.moveTo(s * 0.62, s * 0.3); g.lineTo(s * 0.75, s * 0.43); g.stroke();
      g.beginPath(); g.moveTo(s * 0.25, s * 0.62); g.lineTo(s * 0.35, s * 0.72); g.stroke();
    }
    if (kind === 'gold') {
      // metallic shine bands + rim
      g.save();
      rr(g, 0, 0, s, s * 0.9, r); g.clip();
      g.globalAlpha = 0.55; g.fillStyle = '#fffbe0';
      g.beginPath(); g.moveTo(s * 0.18, s); g.lineTo(s * 0.42, s); g.lineTo(s * 0.92, 0); g.lineTo(s * 0.68, 0); g.closePath(); g.fill();
      g.globalAlpha = 0.35;
      g.beginPath(); g.moveTo(s * 0.5, s); g.lineTo(s * 0.58, s); g.lineTo(s * 1.08, 0); g.lineTo(s * 1.0, 0); g.closePath(); g.fill();
      g.restore();
      g.lineWidth = Math.max(1, s * 0.06); g.strokeStyle = '#8a5200';
      rr(g, s * 0.03, s * 0.03, s * 0.94, s * 0.94, r); g.stroke();
      g.fillStyle = '#ffffff';
      star(g, s * 0.72, s * 0.62, s * 0.12, s * 0.045, 4); g.fill();
    }
    lruSet(cache, key, c, 360);
    return c;
  }

  function colsFor(cell) {
    if (!cell) return BLOCK[0];
    if (cell.kind === 'stone') return STONE;
    if (cell.kind === 'ice') return ICE;
    if (cell.gold) return GOLD;
    return BLOCK[((cell.color % 6) + 6) % 6];
  }
  function kindFor(cell) {
    if (cell.kind === 'stone') return 'stone';
    if (cell.kind === 'ice') return 'ice';
    if (cell.gold) return 'gold';
    return '';
  }

  // draw a block in logical coords. scalePx = device px per logical unit
  function drawBlock(ctx, x, y, s, cell, scalePx, t, opts) {
    opts = opts || {};
    const cols = opts.colorOverride != null ? BLOCK[opts.colorOverride] : colsFor(cell);
    const kind = opts.colorOverride != null ? '' : kindFor(cell);
    const spr = blockSprite(cols, Math.round(s * scalePx), kind);
    const pad = s * 0.04;
    ctx.drawImage(spr, x + pad, y + pad, s - pad * 2, s - pad * 2);
    if (cell && cell.orb && !opts.noOverlay) drawOrbMark(ctx, x + s / 2, y + s / 2, s * 0.34, t);
    if (cell && cell.bomb && !opts.noOverlay) drawBombMark(ctx, x + s / 2, y + s / 2 + s * 0.04, s * 0.26, t);
    if (cell && cell.kind === 'ice' && !opts.noOverlay) {
      text(ctx, String(cell.t), x + s / 2, y + s / 2 + 1, { size: s * 0.42, color: '#0a5d86', font: 'd' });
    }
    if (cell && cell.gold && !opts.noOverlay) {
      const tw = (Math.sin(t * 3 + x * 0.05 + y * 0.03) + 1) / 2;
      ctx.globalAlpha = 0.5 * tw;
      ctx.fillStyle = '#ffffff';
      star(ctx, x + s * 0.3, y + s * 0.3, s * 0.12 * (0.6 + tw * 0.6), s * 0.04, 4); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawOrbMark(ctx, cx, cy, r, t) {
    const p = 1 + Math.sin(t * 5) * 0.06;
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(p, p);
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, '#f0c8ff'); g.addColorStop(1, '#8a2be2');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = r * 0.14; ctx.strokeStyle = '#3d0f6e'; ctx.stroke();
    text(ctx, '?', 0, r * 0.06, { size: r * 1.35, color: '#ffffff', stroke: '#3d0f6e', sw: r * 0.28, font: 'd' });
    ctx.restore();
  }

  function drawBombMark(ctx, cx, cy, r, t) {
    ctx.save();
    ctx.fillStyle = '#1b1430';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(cx - r * 0.35, cy - r * 0.35, r * 0.25, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#d9b27a'; ctx.lineWidth = r * 0.22; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx + r * 0.5, cy - r * 0.7); ctx.quadraticCurveTo(cx + r * 0.9, cy - r * 1.3, cx + r * 1.2, cy - r * 1.1); ctx.stroke();
    const f = 0.7 + Math.sin(t * 18) * 0.3;
    ctx.fillStyle = '#ffd23f';
    star(ctx, cx + r * 1.2, cy - r * 1.15, r * 0.45 * f, r * 0.18, 5); ctx.fill();
    ctx.restore();
  }

  // ---------- Shapes ----------
  function star(ctx, cx, cy, ro, ri, pts) {
    ctx.beginPath();
    for (let i = 0; i < pts * 2; i++) {
      const a = (i * Math.PI) / pts - Math.PI / 2;
      const r = i % 2 === 0 ? ro : ri;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  // ---------- Text ----------
  function textDirect(g, str, x, y, size, fam, weight, o) {
    g.font = `${weight}${size}px ${fam}`;
    g.textAlign = 'left'; g.textBaseline = 'middle';
    if (o.stroke) {
      g.lineJoin = 'round';
      g.lineWidth = o.sw || size * 0.18;
      g.strokeStyle = o.stroke;
      g.strokeText(str, x, y);
    }
    if (o.grad) {
      const gr = g.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.45);
      o.grad.forEach((c, i) => gr.addColorStop(i / (o.grad.length - 1), c));
      g.fillStyle = gr;
    } else g.fillStyle = o.color || '#fff';
    g.fillText(str, x, y);
  }

  // Text is rendered once into a sprite and reused; stroked text is costly to rasterize every frame.
  function text(ctx, str, x, y, o) {
    o = o || {};
    str = String(str);
    if (!str) return;
    let size = o.size || 20;
    const fam = o.font === 'b' ? FONT_B : FONT_D;
    const weight = o.font === 'b' ? (o.weight || 600) + ' ' : '';
    if (o.maxWidth) {
      mctx.font = `${weight}${size}px ${fam}`;
      const w = mctx.measureText(str).width;
      if (w > o.maxWidth) size = size * (o.maxWidth / w);
    }
    size = Math.round(size * 4) / 4;
    const key = str + '|' + size + '|' + (o.font || 'd') + (o.weight || '') + '|' + (o.color || '') + '|' + (o.stroke || '') + '|' + (o.sw || '') + '|' + (o.grad ? o.grad.join(',') : '');
    let sp = lruGet(tcache, key);
    if (!sp) {
      mctx.font = `${weight}${size}px ${fam}`;
      const tw = mctx.measureText(str).width;
      const sw = o.stroke ? (o.sw || size * 0.18) : 0;
      const pad = Math.ceil(sw / 2 + size * 0.15) + 2;
      const cw = tw + pad * 2, ch = size * 1.45 + pad * 2;
      const { c, g } = offscreen(cw, ch);
      textDirect(g, str, pad, ch / 2, size, fam, weight, o);
      sp = lruSet(tcache, key, { c, w: cw, h: ch, pad, tw }, 900);
    }
    const align = o.align || 'center';
    const dx = align === 'center' ? x - sp.w / 2 : align === 'right' ? x - sp.tw - sp.pad : x - sp.pad;
    ctx.drawImage(sp.c, dx, y - sp.h / 2, sp.w, sp.h);
  }

  // Rapidly changing numbers (score roll-ups): draw from per-character sprites so no new sprite per frame.
  function numText(ctx, str, x, y, o) {
    o = o || {};
    str = String(str);
    const size = o.size || 20;
    mctx.font = `${size}px ${FONT_D}`;
    const adv = [];
    let total = 0;
    for (const ch of str) { const w = mctx.measureText(ch).width; adv.push(w); total += w; }
    const align = o.align || 'center';
    let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    let i = 0;
    for (const ch of str) { text(ctx, ch, cx + adv[i] / 2, y, Object.assign({}, o, { align: 'center', maxWidth: 0 })); cx += adv[i]; i++; }
    return total;
  }

  function wrap(ctx, str, maxW, size, font) {
    const wk = str + '|' + maxW + '|' + size + '|' + font;
    const hit = wcache.get(wk);
    if (hit) return hit;
    const lines = wrapRaw(mctx, str, maxW, size, font);
    lruSet(wcache, wk, lines, 300);
    return lines;
  }
  function wrapRaw(ctx, str, maxW, size, font) {
    ctx.font = `${font === 'd' ? '' : '500 '}${size}px ${font === 'd' ? FONT_D : FONT_B}`;
    const words = str.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function para(ctx, str, x, y, maxW, size, color, align, lh) {
    const lines = wrap(ctx, str, maxW, size, 'b');
    lh = lh || size * 1.25;
    lines.forEach((l, i) => text(ctx, l, x, y + i * lh, { size, color, font: 'b', weight: 500, align: align || 'center' }));
    return lines.length * lh;
  }

  // ---------- Panels & buttons ----------
  function panelDirect(ctx, x, y, w, h, o) {
    o = o || {};
    const r = o.r || 22;
    ctx.save();
    rr(ctx, x, y + 6, w, h, r); ctx.fillStyle = 'rgba(5,0,20,0.45)'; ctx.fill();
    rr(ctx, x, y, w, h, r); ctx.fillStyle = o.fill || PAL.panel; ctx.fill();
    ctx.lineWidth = o.lw || 3; ctx.strokeStyle = o.edge || PAL.edgeDim; ctx.stroke();
    // top sheen
    rr(ctx, x + 6, y + 5, w - 12, Math.min(28, h * 0.25), r * 0.7);
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill();
    ctx.restore();
  }

  const BTN = {
    green: ['#2ee6a6', '#0c9466', '#ffffff', '#064a33'],
    purple: ['#8d5cff', '#4e22b8', '#ffffff', '#2a0f6e'],
    gold: ['#ffd23f', '#c48f00', '#3a2400', '#ffffff'],
    red: ['#ff4d6d', '#b3123a', '#ffffff', '#5e0019'],
    blue: ['#3ec5ff', '#0a7fc0', '#ffffff', '#053b5c'],
    ghost: ['rgba(255,255,255,0.08)', 'rgba(0,0,0,0.25)', '#d8ccff', 'rgba(0,0,0,0)'],
  };
  function buttonDirect(ctx, x, y, w, h, label, style, state, o) {
    o = o || {};
    const c = BTN[style] || BTN.green;
    const lip = Math.min(8, h * 0.12);
    const down = state === 'down' ? lip * 0.7 : 0;
    const r = o.r || Math.min(22, h * 0.4);
    ctx.save();
    if (o.disabled) ctx.globalAlpha = 0.45;
    rr(ctx, x, y + lip, w, h - lip, r); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();
    rr(ctx, x, y + down, w, h - lip, r); ctx.fillStyle = c[1]; ctx.fill();
    rr(ctx, x, y + down, w, h - lip - lip * 0.6, r);
    const g = ctx.createLinearGradient(0, y + down, 0, y + down + h - lip);
    g.addColorStop(0, lighten(c[0], state === 'hover' ? 0.18 : 0.08)); g.addColorStop(1, c[0]);
    ctx.fillStyle = style === 'ghost' ? c[0] : g; ctx.fill();
    if (style !== 'ghost') {
      rr(ctx, x + 8, y + down + 5, w - 16, (h - lip) * 0.28, r * 0.6);
      ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill();
    }
    const ty = y + down + (h - lip) / 2 + 1;
    let tx = x + w / 2;
    if (o.ad && !root.BS_NO_ADS) {
      // ad badge on the left
      const bh = h * 0.42, bw = bh * 1.25;
      const bx = x + 14, by = ty - bh / 2;
      rr(ctx, bx, by, bw, bh, 6); ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fill();
      clapper(ctx, bx + bw / 2, by + bh / 2 + bh * 0.04, bh * 0.78, c[2]);
      tx += bw * 0.5;
    }
    const size = o.size || Math.min(h * 0.42, 34);
    text(ctx, label, tx, ty, { size, color: c[2], stroke: style === 'gold' || style === 'ghost' ? null : c[3], sw: size * 0.16, maxWidth: w - (o.ad && !root.BS_NO_ADS ? 70 : 24), font: o.font || 'd' });
    ctx.restore();
  }

  function panel(ctx, x, y, w, h, o) {
    o = o || {};
    const key = 'p|' + w.toFixed(1) + '|' + h.toFixed(1) + '|' + (o.r || 22) + '|' + (o.fill || '') + '|' + (o.edge || '') + '|' + (o.lw || 3);
    let sp = lruGet(pcache, key);
    if (!sp) {
      const pad = 6;
      const { c, g } = offscreen(w + pad * 2, h + pad * 2 + 6);
      panelDirect(g, pad, pad, w, h, o);
      sp = lruSet(pcache, key, { c, pad }, 260);
    }
    ctx.drawImage(sp.c, x - sp.pad, y - sp.pad, w + sp.pad * 2, h + sp.pad * 2 + 6);
  }

  function button(ctx, x, y, w, h, label, style, state, o) {
    o = o || {};
    const key = 'b|' + w.toFixed(1) + '|' + h.toFixed(1) + '|' + label + '|' + style + '|' + (state || '') + '|' + (o.disabled ? 1 : 0) + (o.ad ? 1 : 0) + '|' + (o.size || '') + '|' + (o.font || '') + '|' + (o.r || '');
    let sp = lruGet(pcache, key);
    if (!sp) {
      const pad = 2;
      const { c, g } = offscreen(w + pad * 2, h + pad * 2);
      buttonDirect(g, pad, pad, w, h, label, style, state, o);
      sp = lruSet(pcache, key, { c, pad }, 260);
    }
    ctx.drawImage(sp.c, x - sp.pad, y - sp.pad, w + sp.pad * 2, h + sp.pad * 2);
  }

  // Clapperboard: the film icon Poki asks for on rewarded-ad buttons.
  function clapper(ctx, cx, cy, s, col) {
    const { c, g } = offscreen(s * 1.3, s * 1.2);
    const w = s, h = s * 0.62, ox = s * 0.15, oy = s * 0.5;
    g.fillStyle = col;
    rr(g, ox, oy - h * 0.18, w, h, s * 0.08); g.fill();
    g.save(); g.translate(ox, oy - h * 0.22); g.rotate(-0.32);
    rr(g, 0, -h * 0.34, w, h * 0.3, s * 0.05); g.fill();
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(w * (0.18 + i * 0.28), -h * 0.34); g.lineTo(w * (0.3 + i * 0.28), -h * 0.34); g.lineTo(w * (0.22 + i * 0.28), -h * 0.04); g.lineTo(w * (0.1 + i * 0.28), -h * 0.04); g.closePath(); g.fill(); }
    g.restore();
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(ox + w * (0.12 + i * 0.3), oy - h * 0.18); g.lineTo(ox + w * (0.24 + i * 0.3), oy - h * 0.18); g.lineTo(ox + w * (0.16 + i * 0.3), oy + h * 0.12); g.lineTo(ox + w * (0.04 + i * 0.3), oy + h * 0.12); g.closePath(); g.fill(); }
    ctx.drawImage(c, cx - s * 0.65, cy - s * 0.5 - s * 0.06, s * 1.3, s * 1.2);
  }

  function lighten(hex, amt) {
    if (hex[0] !== '#') return hex;
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.round(r + (255 - r) * amt); g = Math.round(g + (255 - g) * amt); b = Math.round(b + (255 - b) * amt);
    return `rgb(${r},${g},${b})`;
  }

  // ---------- Icons ----------
  const RARITY = { 0: ['#ff4d6d', 'Curse'], 1: ['#9fb6ff', 'Common'], 2: ['#d08bff', 'Rare'], 3: ['#ffd23f', 'Epic'] };
  const CURSE_COLS = ['#4a1438', '#7d2c5c', '#1f0617'];

  function spellBadge(ctx, spell, x, y, s, scalePx, t, o) {
    o = o || {};
    const cols = spell.curse ? CURSE_COLS : BLOCK[spell.hue];
    const spr = blockSprite(cols, Math.round(s * PX), '');
    // rarity ring
    const ring = RARITY[spell.r][0];
    ctx.save();
    if (spell.curse) {
      ctx.globalAlpha = 0.3 + 0.25 * Math.sin(t * 5);
      rr(ctx, x - 6, y - 6, s + 12, s + 12, s * 0.28); ctx.fillStyle = '#ff4d6d'; ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (spell.r === 3) {
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 3);
      rr(ctx, x - 5, y - 5, s + 10, s + 10, s * 0.26); ctx.fillStyle = ring; ctx.fill();
      ctx.globalAlpha = 1;
    }
    const key = 's|' + spell.id + '|' + s.toFixed(1);
    let sp = lruGet(pcache, key);
    if (!sp) {
      const pad = 4;
      const { c, g } = offscreen(s + pad * 2, s + pad * 2);
      rr(g, pad - 3, pad - 3, s + 6, s + 6, s * 0.24); g.fillStyle = ring; g.fill();
      g.drawImage(spr, pad, pad, s, s);
      icon(g, spell.icon, pad + s / 2, pad + s * 0.46, s * 0.5);
      sp = lruSet(pcache, key, { c, pad }, 260);
    }
    ctx.drawImage(sp.c, x - sp.pad, y - sp.pad, s + sp.pad * 2, s + sp.pad * 2);
    ctx.restore();
  }

  function icon(ctx, name, cx, cy, s) {
    ctx.save();
    ctx.translate(cx, cy);
    const k = s / 2;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const W = '#ffffff', D = 'rgba(30,8,60,0.75)';
    const fillOut = () => { ctx.lineWidth = k * 0.22; ctx.strokeStyle = D; ctx.stroke(); ctx.fillStyle = W; ctx.fill(); };
    switch (name) {
      case 'flame':
      case 'flame2': {
        const f = (sx, sy, sc) => {
          ctx.beginPath();
          ctx.moveTo(sx, sy - k * sc);
          ctx.bezierCurveTo(sx + k * 0.75 * sc, sy - k * 0.2 * sc, sx + k * 0.7 * sc, sy + k * 0.9 * sc, sx, sy + k * 0.9 * sc);
          ctx.bezierCurveTo(sx - k * 0.7 * sc, sy + k * 0.9 * sc, sx - k * 0.75 * sc, sy - k * 0.1 * sc, sx, sy - k * sc);
          ctx.closePath();
        };
        if (name === 'flame2') { f(-k * 0.35, k * 0.1, 0.7); fillOut(); f(k * 0.3, 0, 0.85); fillOut(); }
        else { f(0, 0, 1); fillOut(); ctx.fillStyle = '#ffb02e'; f(0, k * 0.35, 0.45); ctx.fill(); }
        break;
      }
      case 'gem':
        ctx.beginPath(); ctx.moveTo(-k * 0.8, -k * 0.25); ctx.lineTo(-k * 0.4, -k * 0.75); ctx.lineTo(k * 0.4, -k * 0.75); ctx.lineTo(k * 0.8, -k * 0.25); ctx.lineTo(0, k * 0.85); ctx.closePath(); fillOut();
        ctx.strokeStyle = D; ctx.lineWidth = k * 0.1; ctx.beginPath(); ctx.moveTo(-k * 0.8, -k * 0.25); ctx.lineTo(k * 0.8, -k * 0.25); ctx.stroke();
        break;
      case 'x2': text(ctx, 'x2', 0, k * 0.08, { size: k * 1.5, color: W, stroke: D, sw: k * 0.3 }); break;
      case 'coin':
        ctx.beginPath(); ctx.arc(0, 0, k * 0.8, 0, Math.PI * 2); ctx.lineWidth = k * 0.22; ctx.strokeStyle = D; ctx.stroke(); ctx.fillStyle = '#ffe066'; ctx.fill();
        ctx.beginPath(); ctx.arc(0, 0, k * 0.5, 0, Math.PI * 2); ctx.lineWidth = k * 0.12; ctx.strokeStyle = '#c48f00'; ctx.stroke();
        break;
      case 'plus':
        rr(ctx, -k * 0.22, -k * 0.75, k * 0.44, k * 1.5, k * 0.15); fillOut();
        rr(ctx, -k * 0.75, -k * 0.22, k * 1.5, k * 0.44, k * 0.15); fillOut();
        rr(ctx, -k * 0.2, -k * 0.2, k * 0.4, k * 0.4, 2); ctx.fillStyle = W; ctx.fill();
        break;
      case 'weight':
        ctx.beginPath(); ctx.arc(0, k * 0.2, k * 0.62, 0, Math.PI * 2); fillOut();
        ctx.beginPath(); ctx.arc(0, -k * 0.45, k * 0.35, Math.PI, 0); ctx.lineWidth = k * 0.25; ctx.strokeStyle = D; ctx.stroke();
        ctx.beginPath(); ctx.arc(0, -k * 0.45, k * 0.35, Math.PI, 0); ctx.lineWidth = k * 0.12; ctx.strokeStyle = W; ctx.stroke();
        break;
      case 'frame':
        rr(ctx, -k * 0.75, -k * 0.75, k * 1.5, k * 1.5, k * 0.2); ctx.lineWidth = k * 0.45; ctx.strokeStyle = D; ctx.stroke(); ctx.lineWidth = k * 0.25; ctx.strokeStyle = W; ctx.stroke();
        break;
      case 'dot':
        rr(ctx, -k * 0.45, -k * 0.45, k * 0.9, k * 0.9, k * 0.2); fillOut();
        break;
      case 'spark': star(ctx, 0, 0, k * 0.95, k * 0.3, 4); fillOut(); break;
      case 'star': star(ctx, 0, k * 0.05, k * 0.95, k * 0.42, 5); fillOut(); break;
      case 'crown':
      case 'crown2':
        ctx.beginPath(); ctx.moveTo(-k * 0.8, k * 0.55); ctx.lineTo(-k * 0.85, -k * 0.45); ctx.lineTo(-k * 0.4, 0); ctx.lineTo(0, -k * 0.7); ctx.lineTo(k * 0.4, 0); ctx.lineTo(k * 0.85, -k * 0.45); ctx.lineTo(k * 0.8, k * 0.55); ctx.closePath(); fillOut();
        if (name === 'crown2') { ctx.fillStyle = '#ff4d6d'; ctx.beginPath(); ctx.arc(0, k * 0.2, k * 0.17, 0, Math.PI * 2); ctx.fill(); }
        break;
      case 'orb':
        ctx.beginPath(); ctx.arc(0, 0, k * 0.8, 0, Math.PI * 2); fillOut();
        text(ctx, '?', 0, k * 0.08, { size: k * 1.3, color: '#7a2fd0' });
        break;
      case 'clover':
        for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2 + Math.PI / 4; ctx.beginPath(); ctx.arc(Math.cos(a) * k * 0.36, Math.sin(a) * k * 0.36 - k * 0.1, k * 0.36, 0, Math.PI * 2); fillOut(); }
        ctx.strokeStyle = W; ctx.lineWidth = k * 0.14; ctx.beginPath(); ctx.moveTo(0, k * 0.2); ctx.quadraticCurveTo(k * 0.1, k * 0.7, k * 0.35, k * 0.85); ctx.stroke();
        break;
      case 'burst': star(ctx, 0, 0, k * 0.95, k * 0.5, 8); fillOut(); break;
      case 'swirl':
        ctx.beginPath();
        for (let i = 0; i <= 60; i++) { const a = i * 0.2; const r = k * 0.08 + i * k * 0.013; const px = Math.cos(a) * r, py = Math.sin(a) * r; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
        ctx.lineWidth = k * 0.4; ctx.strokeStyle = D; ctx.stroke(); ctx.lineWidth = k * 0.2; ctx.strokeStyle = W; ctx.stroke();
        break;
      case 'bomb':
        ctx.beginPath(); ctx.arc(-k * 0.1, k * 0.15, k * 0.6, 0, Math.PI * 2); ctx.lineWidth = k * 0.2; ctx.strokeStyle = D; ctx.stroke(); ctx.fillStyle = '#2a2140'; ctx.fill();
        ctx.strokeStyle = W; ctx.lineWidth = k * 0.15; ctx.beginPath(); ctx.moveTo(k * 0.25, -k * 0.3); ctx.quadraticCurveTo(k * 0.5, -k * 0.8, k * 0.75, -k * 0.65); ctx.stroke();
        ctx.fillStyle = '#ffd23f'; star(ctx, k * 0.78, -k * 0.7, k * 0.3, k * 0.12, 5); ctx.fill();
        break;
      case 'prism':
        ctx.beginPath(); ctx.moveTo(0, -k * 0.8); ctx.lineTo(k * 0.8, k * 0.65); ctx.lineTo(-k * 0.8, k * 0.65); ctx.closePath(); fillOut();
        ['#ff4d6d', '#ffd23f', '#3ec5ff'].forEach((c, i) => { ctx.strokeStyle = c; ctx.lineWidth = k * 0.12; ctx.beginPath(); ctx.moveTo(-k * 0.3 + i * k * 0.3, k * 0.45); ctx.lineTo(-k * 0.1 + i * k * 0.2, -k * 0.2); ctx.stroke(); });
        break;
      case 'hourglass':
        ctx.beginPath(); ctx.moveTo(-k * 0.6, -k * 0.8); ctx.lineTo(k * 0.6, -k * 0.8); ctx.lineTo(0, 0); ctx.lineTo(k * 0.6, k * 0.8); ctx.lineTo(-k * 0.6, k * 0.8); ctx.lineTo(0, 0); ctx.closePath(); fillOut();
        ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(-k * 0.35, k * 0.65); ctx.lineTo(k * 0.35, k * 0.65); ctx.lineTo(0, k * 0.25); ctx.closePath(); ctx.fill();
        break;
      case 'moon':
        ctx.beginPath(); ctx.arc(0, 0, k * 0.8, Math.PI * 0.35, Math.PI * 1.65); ctx.arc(k * 0.35, -k * 0.1, k * 0.62, Math.PI * 1.45, Math.PI * 0.55, true); ctx.closePath(); fillOut();
        break;
      case 'corner':
        ctx.beginPath(); ctx.moveTo(-k * 0.7, -k * 0.75); ctx.lineTo(-k * 0.25, -k * 0.75); ctx.lineTo(-k * 0.25, k * 0.25); ctx.lineTo(k * 0.75, k * 0.25); ctx.lineTo(k * 0.75, k * 0.75); ctx.lineTo(-k * 0.7, k * 0.75); ctx.closePath(); fillOut();
        break;
      case 'bolt':
        ctx.beginPath(); ctx.moveTo(k * 0.2, -k * 0.9); ctx.lineTo(-k * 0.6, k * 0.15); ctx.lineTo(-k * 0.05, k * 0.15); ctx.lineTo(-k * 0.25, k * 0.9); ctx.lineTo(k * 0.6, -k * 0.2); ctx.lineTo(k * 0.05, -k * 0.2); ctx.closePath(); fillOut();
        break;
      case 'snow':
        for (let i = 0; i < 3; i++) {
          ctx.save(); ctx.rotate((i * Math.PI) / 3);
          ctx.lineWidth = k * 0.32; ctx.strokeStyle = D; ctx.beginPath(); ctx.moveTo(0, -k * 0.85); ctx.lineTo(0, k * 0.85); ctx.stroke();
          ctx.lineWidth = k * 0.16; ctx.strokeStyle = W; ctx.beginPath(); ctx.moveTo(0, -k * 0.85); ctx.lineTo(0, k * 0.85); ctx.stroke();
          ctx.restore();
        }
        break;
      case 'battery':
        rr(ctx, -k * 0.75, -k * 0.45, k * 1.35, k * 0.9, k * 0.15); fillOut();
        rr(ctx, k * 0.6, -k * 0.2, k * 0.2, k * 0.4, 2); ctx.fillStyle = W; ctx.fill();
        ctx.fillStyle = '#2ee6a6'; rr(ctx, -k * 0.58, -k * 0.28, k * 0.9, k * 0.56, 3); ctx.fill();
        break;
      case 'sparkle':
        star(ctx, -k * 0.2, -k * 0.1, k * 0.7, k * 0.22, 4); fillOut();
        star(ctx, k * 0.55, -k * 0.55, k * 0.32, k * 0.1, 4); fillOut();
        star(ctx, k * 0.5, k * 0.55, k * 0.28, k * 0.09, 4); fillOut();
        break;
      case 'skull':
        ctx.beginPath(); ctx.arc(0, -k * 0.1, k * 0.62, Math.PI * 0.85, Math.PI * 2.15); ctx.lineTo(k * 0.38, k * 0.75); ctx.lineTo(-k * 0.38, k * 0.75); ctx.closePath(); fillOut();
        ctx.fillStyle = '#4a1438';
        ctx.beginPath(); ctx.ellipse(-k * 0.24, -k * 0.08, k * 0.17, k * 0.2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(k * 0.24, -k * 0.08, k * 0.17, k * 0.2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, k * 0.18); ctx.lineTo(-k * 0.08, k * 0.34); ctx.lineTo(k * 0.08, k * 0.34); ctx.closePath(); ctx.fill();
        ctx.fillRect(-k * 0.2, k * 0.55, k * 0.06, k * 0.2); ctx.fillRect(k * 0.14, k * 0.55, k * 0.06, k * 0.2);
        break;
      case 'crack':
        ctx.beginPath(); ctx.moveTo(-k * 0.8, -k * 0.25); ctx.lineTo(-k * 0.4, -k * 0.75); ctx.lineTo(k * 0.4, -k * 0.75); ctx.lineTo(k * 0.8, -k * 0.25); ctx.lineTo(0, k * 0.85); ctx.closePath(); fillOut();
        ctx.strokeStyle = '#4a1438'; ctx.lineWidth = k * 0.14; ctx.beginPath(); ctx.moveTo(-k * 0.1, -k * 0.75); ctx.lineTo(k * 0.12, -k * 0.25); ctx.lineTo(-k * 0.15, k * 0.1); ctx.lineTo(k * 0.05, k * 0.5); ctx.stroke();
        break;
      case 'xmark':
        ctx.lineWidth = k * 0.55; ctx.strokeStyle = D; ctx.beginPath(); ctx.moveTo(-k * 0.55, -k * 0.55); ctx.lineTo(k * 0.55, k * 0.55); ctx.moveTo(k * 0.55, -k * 0.55); ctx.lineTo(-k * 0.55, k * 0.55); ctx.stroke();
        ctx.lineWidth = k * 0.3; ctx.strokeStyle = W; ctx.stroke();
        break;
      case 'cloud':
        ctx.beginPath(); ctx.arc(-k * 0.35, k * 0.05, k * 0.35, Math.PI * 0.5, Math.PI * 1.5); ctx.arc(0, -k * 0.2, k * 0.42, Math.PI, Math.PI * 2); ctx.arc(k * 0.38, k * 0.05, k * 0.35, Math.PI * 1.5, Math.PI * 0.5); ctx.closePath(); fillOut();
        ctx.strokeStyle = '#7ab8ff'; ctx.lineWidth = k * 0.12;
        [-0.3, 0, 0.3].forEach((dx) => { ctx.beginPath(); ctx.moveTo(dx * k, k * 0.55); ctx.lineTo(dx * k - k * 0.1, k * 0.85); ctx.stroke(); });
        break;
      case 'rock':
        ctx.beginPath(); ctx.moveTo(-k * 0.75, k * 0.55); ctx.lineTo(-k * 0.6, -k * 0.2); ctx.lineTo(-k * 0.1, -k * 0.65); ctx.lineTo(k * 0.55, -k * 0.4); ctx.lineTo(k * 0.78, k * 0.55); ctx.closePath(); fillOut();
        ctx.strokeStyle = '#4a1438'; ctx.lineWidth = k * 0.1; ctx.beginPath(); ctx.moveTo(-k * 0.2, -k * 0.3); ctx.lineTo(0, k * 0.1); ctx.lineTo(k * 0.3, k * 0.2); ctx.stroke();
        break;
      default:
        ctx.beginPath(); ctx.arc(0, 0, k * 0.6, 0, Math.PI * 2); fillOut();
    }
    ctx.restore();
  }

  // ---------- Mascots (characters), hats, face items ----------
  const SKINS = {
    blip:   { name: 'Blip',   body: 'cube',  cols: BLOCK[3] },
    pip:    { name: 'Pip',    body: 'blob',  cols: BLOCK[4] },
    mochi:  { name: 'Mochi',  body: 'blob',  cols: ['#ff7ec2', '#ffd1ea', '#c43f86'] },
    sparky: { name: 'Sparky', body: 'cube',  cols: BLOCK[2], pattern: 'bolt' },
    ember:  { name: 'Ember',  body: 'blob',  cols: BLOCK[0], pattern: 'flame' },
    frosty: { name: 'Frosty', body: 'cube',  cols: ICE, pattern: 'ice' },
    rocky:  { name: 'Rocky',  body: 'cube',  cols: STONE, pattern: 'stone', brows: true },
    boo:    { name: 'Boo',    body: 'ghost', cols: ['#efeaff', '#ffffff', '#b3a6e0'] },
    nova:   { name: 'Nova',   body: 'blob',  cols: ['#4b22c9', '#9d7dff', '#25097a'], pattern: 'galaxy' },
    goldie: { name: 'Goldie', body: 'cube',  cols: GOLD, pattern: 'gold' },
  };

  function bodyPath(ctx, shape, x, y, w, h) {
    if (shape === 'ghost') {
      const r = w / 2;
      ctx.beginPath();
      ctx.moveTo(x, y + r);
      ctx.arc(x + r, y + r, r, Math.PI, 0);
      ctx.lineTo(x + w, y + h - h * 0.08);
      const bumps = 3, bw = w / bumps;
      for (let i = 0; i < bumps; i++) {
        const bx = x + w - i * bw;
        ctx.quadraticCurveTo(bx - bw * 0.25, y + h + h * 0.06, bx - bw * 0.5, y + h - h * 0.05);
        ctx.quadraticCurveTo(bx - bw * 0.75, y + h - h * 0.16, bx - bw, y + h - h * 0.04);
      }
      ctx.closePath();
      return;
    }
    rr(ctx, x, y, w, h, Math.min(w, h) * (shape === 'blob' ? 0.42 : 0.2));
  }

  function drawPattern(ctx, pat, s, h, cols, t) {
    ctx.save();
    if (pat === 'stone') {
      ctx.strokeStyle = cols[2]; ctx.lineWidth = s * 0.03; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-h * 0.7, -h * 0.55); ctx.lineTo(-h * 0.45, -h * 0.35); ctx.lineTo(-h * 0.55, -h * 0.1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(h * 0.55, h * 0.45); ctx.lineTo(h * 0.35, h * 0.62); ctx.stroke();
    } else if (pat === 'ice') {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = s * 0.035; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(h * 0.45, -h * 0.65); ctx.lineTo(h * 0.68, -h * 0.42); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-h * 0.7, h * 0.45); ctx.lineTo(-h * 0.55, h * 0.62); ctx.stroke();
    } else if (pat === 'galaxy') {
      const dots = [[-0.6, -0.5, 0.05], [0.55, -0.6, 0.035], [0.65, 0.5, 0.045], [-0.5, 0.6, 0.03], [0.1, -0.75, 0.03], [-0.75, 0.05, 0.025]];
      dots.forEach(([dx, dy, r], i) => { ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 3 + i); ctx.fillStyle = i % 2 ? '#ffe98a' : '#ffffff'; star(ctx, dx * h, dy * h, r * s * 1.6, r * s * 0.6, 4); ctx.fill(); });
    } else if (pat === 'gold') {
      ctx.globalAlpha = 0.45; ctx.fillStyle = '#fffbe0';
      ctx.beginPath(); ctx.moveTo(-h * 0.2, h); ctx.lineTo(h * 0.15, h); ctx.lineTo(h * 0.95, -h); ctx.lineTo(h * 0.6, -h); ctx.closePath(); ctx.fill();
    } else if (pat === 'bolt') {
      ctx.fillStyle = '#ff9f1c';
      [-1, 1].forEach((sd) => { ctx.save(); ctx.translate(sd * h * 0.72, h * 0.32); ctx.scale(0.5, 0.5); ctx.beginPath(); ctx.moveTo(h * 0.1, -h * 0.4); ctx.lineTo(-h * 0.2, h * 0.05); ctx.lineTo(0, h * 0.05); ctx.lineTo(-h * 0.1, h * 0.4); ctx.lineTo(h * 0.2, -h * 0.05); ctx.lineTo(0, -h * 0.05); ctx.closePath(); ctx.fill(); ctx.restore(); });
    } else if (pat === 'flame') {
      const fl = 1 + Math.sin(t * 9) * 0.08;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.moveTo(-h * 0.35, -h * 0.82); ctx.quadraticCurveTo(-h * 0.2, -h * 1.25 * fl, 0, -h * 1.05 * fl); ctx.quadraticCurveTo(h * 0.15, -h * 1.35 * fl, h * 0.3, -h * 0.82); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // Hats are drawn with their brim centered at (0,0) on top of the head; s = mascot size.
  function drawHat(ctx, hat, s, t, cols) {
    if (!hat || hat === 'none') return;
    ctx.save();
    const lw = s * 0.025;
    ctx.lineJoin = 'round';
    switch (hat) {
      case 'wizard': {
        ctx.rotate(-0.12 + Math.sin(t * 2.4 + 0.6) * 0.04);
        ctx.fillStyle = '#3b1491'; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.5, s * 0.1, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5b25c9'; ctx.beginPath(); ctx.ellipse(0, -s * 0.02, s * 0.46, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-s * 0.32, -s * 0.03); ctx.quadraticCurveTo(-s * 0.1, -s * 0.45, s * 0.05, -s * 0.72); ctx.quadraticCurveTo(s * 0.3, -s * 0.62, s * 0.42, -s * 0.5); ctx.quadraticCurveTo(s * 0.18, -s * 0.48, s * 0.12, -s * 0.38); ctx.quadraticCurveTo(s * 0.22, -s * 0.2, s * 0.32, -s * 0.03); ctx.closePath();
        const hg = ctx.createLinearGradient(-s * 0.3, 0, s * 0.3, -s * 0.6); hg.addColorStop(0, '#6b2fe0'); hg.addColorStop(1, '#a66cff');
        ctx.fillStyle = hg; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = '#2a0f6e'; ctx.stroke();
        ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(-s * 0.31, -s * 0.06); ctx.quadraticCurveTo(0, -s * 0.12, s * 0.31, -s * 0.06); ctx.lineTo(s * 0.3, -s * 0.13); ctx.quadraticCurveTo(0, -s * 0.19, -s * 0.28, -s * 0.13); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffe98a';
        star(ctx, -s * 0.06, -s * 0.33, s * 0.06, s * 0.025, 5); ctx.fill();
        star(ctx, s * 0.12, -s * 0.24, s * 0.035, s * 0.015, 5); ctx.fill();
        star(ctx, s * 0.43, -s * 0.5, s * 0.055, s * 0.022, 5); ctx.fill();
        break;
      }
      case 'witch': {
        ctx.rotate(0.1);
        ctx.fillStyle = '#1b1430'; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.55, s * 0.11, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.03); ctx.lineTo(s * 0.02, -s * 0.78); ctx.quadraticCurveTo(s * 0.14, -s * 0.66, s * 0.3, -s * 0.72); ctx.lineTo(s * 0.3, -s * 0.03); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#a66cff'; ctx.fillRect(-s * 0.29, -s * 0.16, s * 0.58, s * 0.1);
        ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = lw * 1.4; ctx.strokeRect(-s * 0.06, -s * 0.17, s * 0.12, s * 0.12);
        break;
      }
      case 'crown': {
        const g = ctx.createLinearGradient(0, -s * 0.35, 0, 0); g.addColorStop(0, '#fff09a'); g.addColorStop(1, '#f2a900');
        ctx.beginPath(); ctx.moveTo(-s * 0.3, 0); ctx.lineTo(-s * 0.34, -s * 0.3); ctx.lineTo(-s * 0.16, -s * 0.15); ctx.lineTo(0, -s * 0.36); ctx.lineTo(s * 0.16, -s * 0.15); ctx.lineTo(s * 0.34, -s * 0.3); ctx.lineTo(s * 0.3, 0); ctx.closePath();
        ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = '#8a5200'; ctx.stroke();
        [[-0.34, -0.3, '#ff4d6d'], [0, -0.36, '#3ec5ff'], [0.34, -0.3, '#2ee6a6']].forEach(([dx, dy, c]) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(dx * s, dy * s, s * 0.045, 0, Math.PI * 2); ctx.fill(); });
        ctx.fillStyle = '#ff4d6d'; ctx.beginPath(); ctx.arc(0, -s * 0.08, s * 0.04, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'party': {
        ctx.rotate(-0.15);
        ctx.save();
        ctx.beginPath(); ctx.moveTo(-s * 0.2, 0); ctx.lineTo(0, -s * 0.55); ctx.lineTo(s * 0.2, 0); ctx.closePath();
        ctx.fillStyle = '#3ec5ff'; ctx.fill(); ctx.clip();
        ctx.fillStyle = '#ffd23f';
        for (let i = -3; i < 4; i++) { ctx.save(); ctx.translate(i * s * 0.12, -s * 0.25); ctx.rotate(0.6); ctx.fillRect(-s * 0.03, -s * 0.5, s * 0.05, s); ctx.restore(); }
        ctx.restore();
        ctx.fillStyle = '#ff4d6d'; ctx.beginPath(); ctx.arc(0, -s * 0.57, s * 0.07, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'tophat': {
        ctx.fillStyle = '#1b1430'; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.42, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
        rr(ctx, -s * 0.24, -s * 0.48, s * 0.48, s * 0.46, s * 0.05); ctx.fill();
        ctx.fillStyle = '#ff4d6d'; ctx.fillRect(-s * 0.24, -s * 0.14, s * 0.48, s * 0.08);
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-s * 0.18, -s * 0.44, s * 0.06, s * 0.28);
        break;
      }
      case 'catears': {
        const c = cols || BLOCK[3];
        [-1, 1].forEach((sd) => {
          ctx.beginPath(); ctx.moveTo(sd * s * 0.42, s * 0.1); ctx.lineTo(sd * s * 0.34, -s * 0.28); ctx.lineTo(sd * s * 0.08, s * 0.1); ctx.closePath();
          ctx.fillStyle = c[0]; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = c[2]; ctx.stroke();
          ctx.beginPath(); ctx.moveTo(sd * s * 0.36, s * 0.07); ctx.lineTo(sd * s * 0.32, -s * 0.15); ctx.lineTo(sd * s * 0.16, s * 0.07); ctx.closePath();
          ctx.fillStyle = '#ff9ec7'; ctx.fill();
        });
        break;
      }
      case 'halo': {
        ctx.translate(0, -s * 0.22 + Math.sin(t * 2.5) * s * 0.03);
        ctx.strokeStyle = '#ffe98a'; ctx.lineWidth = s * 0.05;
        ctx.beginPath(); ctx.ellipse(0, 0, s * 0.3, s * 0.07, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = s * 0.015;
        ctx.beginPath(); ctx.ellipse(0, -s * 0.005, s * 0.3, s * 0.07, 0, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
        break;
      }
      case 'propeller': {
        ctx.fillStyle = '#ff4d6d'; ctx.beginPath(); ctx.arc(0, 0, s * 0.3, Math.PI, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(0, 0, s * 0.3, Math.PI, Math.PI * 1.33); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#3ec5ff'; ctx.beginPath(); ctx.arc(0, 0, s * 0.3, Math.PI * 1.66, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#1b1430'; ctx.fillRect(-s * 0.36, -s * 0.02, s * 0.72, s * 0.05);
        ctx.fillRect(-s * 0.012, -s * 0.38, s * 0.024, s * 0.1);
        const sp = Math.cos(t * 14);
        ctx.fillStyle = '#ff9f1c';
        ctx.beginPath(); ctx.ellipse(0, -s * 0.38, s * 0.26 * Math.abs(sp) + s * 0.02, s * 0.035, 0, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'chef': {
        ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#c9c2e8'; ctx.lineWidth = lw;
        rr(ctx, -s * 0.22, -s * 0.2, s * 0.44, s * 0.2, s * 0.03); ctx.fill(); ctx.stroke();
        [[-0.16, -0.3, 0.14], [0.16, -0.3, 0.14], [0, -0.38, 0.17]].forEach(([dx, dy, r]) => { ctx.beginPath(); ctx.arc(dx * s, dy * s, r * s, 0, Math.PI * 2); ctx.fill(); });
        ctx.beginPath(); ctx.moveTo(-s * 0.2, -s * 0.2); ctx.lineTo(s * 0.2, -s * 0.2); ctx.stroke();
        break;
      }
      case 'pumpkin': {
        ctx.translate(0, -s * 0.15);
        ctx.fillStyle = '#ff8a1c';
        [-0.13, 0.13, 0].forEach((dx) => { ctx.beginPath(); ctx.ellipse(dx * s, 0, s * 0.16, s * 0.15, 0, 0, Math.PI * 2); ctx.fill(); });
        ctx.strokeStyle = '#c25e00'; ctx.lineWidth = lw; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.27, s * 0.15, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#2a7a2a'; ctx.fillRect(-s * 0.025, -s * 0.22, s * 0.05, s * 0.09);
        ctx.fillStyle = '#3a1400';
        ctx.beginPath(); ctx.moveTo(-s * 0.12, -s * 0.03); ctx.lineTo(-s * 0.07, -s * 0.08); ctx.lineTo(-s * 0.03, -s * 0.03); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(s * 0.03, -s * 0.03); ctx.lineTo(s * 0.07, -s * 0.08); ctx.lineTo(s * 0.12, -s * 0.03); ctx.closePath(); ctx.fill();
        break;
      }
    }
    ctx.restore();
  }

  // Face items drawn in face space (0,0 = center of face), eyes at y = -0.04s.
  function drawFace(ctx, face, s) {
    if (!face || face === 'none') return;
    ctx.save();
    const ey = -s * 0.04;
    switch (face) {
      case 'shades':
        ctx.fillStyle = '#14101f';
        rr(ctx, -s * 0.31, ey - s * 0.08, s * 0.26, s * 0.16, s * 0.05); ctx.fill();
        rr(ctx, s * 0.05, ey - s * 0.08, s * 0.26, s * 0.16, s * 0.05); ctx.fill();
        ctx.fillRect(-s * 0.06, ey - s * 0.06, s * 0.12, s * 0.03);
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-s * 0.27, ey - s * 0.05, s * 0.08, s * 0.025); ctx.fillRect(s * 0.09, ey - s * 0.05, s * 0.08, s * 0.025);
        break;
      case 'hearts':
        ctx.fillStyle = '#ff4d6d';
        [-0.17, 0.17].forEach((dx) => { const x = dx * s, y = ey, r = s * 0.075; ctx.beginPath(); ctx.moveTo(x, y + r); ctx.bezierCurveTo(x - r * 2, y - r * 0.2, x - r * 0.8, y - r * 1.6, x, y - r * 0.4); ctx.bezierCurveTo(x + r * 0.8, y - r * 1.6, x + r * 2, y - r * 0.2, x, y + r); ctx.fill(); });
        ctx.strokeStyle = '#7a0025'; ctx.lineWidth = s * 0.02; ctx.beginPath(); ctx.moveTo(-s * 0.07, ey - s * 0.03); ctx.lineTo(s * 0.07, ey - s * 0.03); ctx.stroke();
        break;
      case 'monocle':
        ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = s * 0.025;
        ctx.beginPath(); ctx.arc(s * 0.17, ey, s * 0.12, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s * 0.28, ey + s * 0.05); ctx.quadraticCurveTo(s * 0.36, ey + s * 0.25, s * 0.3, ey + s * 0.38); ctx.stroke();
        break;
      case 'mustache':
        ctx.fillStyle = '#3a1f12';
        ctx.beginPath(); ctx.moveTo(0, s * 0.07);
        ctx.bezierCurveTo(-s * 0.08, s * 0.03, -s * 0.2, s * 0.06, -s * 0.22, s * 0.0);
        ctx.bezierCurveTo(-s * 0.2, s * 0.13, -s * 0.08, s * 0.12, 0, s * 0.1);
        ctx.bezierCurveTo(s * 0.08, s * 0.12, s * 0.2, s * 0.13, s * 0.22, s * 0.0);
        ctx.bezierCurveTo(s * 0.2, s * 0.06, s * 0.08, s * 0.03, 0, s * 0.07); ctx.fill();
        break;
      case 'stars':
        ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#8a5200'; ctx.lineWidth = s * 0.012;
        star(ctx, -s * 0.31, s * 0.13, s * 0.065, s * 0.028, 5); ctx.fill(); ctx.stroke();
        star(ctx, s * 0.33, s * 0.1, s * 0.05, s * 0.022, 5); ctx.fill(); ctx.stroke();
        break;
    }
    ctx.restore();
  }

  // mood: 'idle' | 'happy' | 'worried' | 'shocked' | 'wow'
  // o.skin (id), o.hat (id, default 'wizard'), o.face (id), o.hue (legacy: recolored Blip)
  function mascot(ctx, cx, cy, s, t, o) {
    o = o || {};
    const mood = o.mood || 'idle';
    const skin = SKINS[o.skin] || SKINS.blip;
    const cols = o.hue != null ? BLOCK[o.hue] : skin.cols;
    const shape = skin.body;
    const hat = o.hat === undefined ? 'wizard' : o.hat;
    const covered = o.face === 'shades' || o.face === 'hearts';
    const bob = Math.sin(t * 2.4) * s * 0.03 + (mood === 'happy' ? -Math.abs(Math.sin(t * 9)) * s * 0.1 : 0);
    const squash = mood === 'happy' ? 1 + Math.sin(t * 18) * 0.03 : 1;
    ctx.save();
    ctx.translate(cx, cy + bob);
    ctx.scale(1 / squash, squash);
    const h = s * 0.5;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(0, h + s * 0.08 - bob, s * 0.42, s * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    if (skin.pattern === 'flame') drawPattern(ctx, 'flame', s, h, cols, t);
    // body
    bodyPath(ctx, shape, -h, -h, s, s); ctx.fillStyle = cols[2]; ctx.fill();
    bodyPath(ctx, shape, -h, -h, s, s * 0.92); ctx.fillStyle = cols[0]; ctx.fill();
    const g = ctx.createLinearGradient(0, -h, 0, h);
    g.addColorStop(0, cols[1]); g.addColorStop(1, cols[0]);
    bodyPath(ctx, shape, -h + s * 0.09, -h + s * 0.07, s * 0.82, s * 0.76); ctx.fillStyle = g; ctx.fill();
    if (skin.pattern && skin.pattern !== 'flame') {
      ctx.save(); bodyPath(ctx, shape, -h, -h, s, s * 0.92); ctx.clip();
      drawPattern(ctx, skin.pattern, s, h, cols, t);
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.ellipse(-h + s * 0.25, -h + s * 0.2, s * 0.11, s * 0.05, -0.5, 0, Math.PI * 2); ctx.fill();
    // cheeks
    ctx.fillStyle = 'rgba(255,92,160,0.62)';
    ctx.beginPath(); ctx.ellipse(-s * 0.3, s * 0.12, s * 0.08, s * 0.05, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(s * 0.3, s * 0.12, s * 0.08, s * 0.05, 0, 0, Math.PI * 2); ctx.fill();
    // eyes
    const lx = o.lookX || 0, ly = o.lookY || 0;
    const blink = (t % 4.3) < 0.12;
    if (!covered) for (const ex of [-s * 0.17, s * 0.17]) {
      const ey = -s * 0.04;
      if (mood === 'happy' || mood === 'wow') {
        ctx.strokeStyle = '#1a0b3d'; ctx.lineWidth = s * 0.05; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(ex, ey + s * 0.03, s * 0.08, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
        continue;
      }
      if (blink) { ctx.strokeStyle = '#1a0b3d'; ctx.lineWidth = s * 0.04; ctx.beginPath(); ctx.moveTo(ex - s * 0.07, ey); ctx.lineTo(ex + s * 0.07, ey); ctx.stroke(); continue; }
      const er = mood === 'shocked' ? s * 0.12 : s * 0.1;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(ex, ey, er * 0.85, er, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1a0b3d';
      const pr = mood === 'shocked' ? er * 0.35 : er * 0.55;
      ctx.beginPath(); ctx.arc(ex + lx * er * 0.3, ey + ly * er * 0.3 + er * 0.1, pr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(ex + lx * er * 0.3 - pr * 0.35, ey + ly * er * 0.3 - pr * 0.2, pr * 0.35, 0, Math.PI * 2); ctx.fill();
    }
    if (skin.brows) {
      ctx.strokeStyle = '#2a2240'; ctx.lineWidth = s * 0.04; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-s * 0.26, -s * 0.18); ctx.lineTo(-s * 0.1, -s * 0.15); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * 0.26, -s * 0.18); ctx.lineTo(s * 0.1, -s * 0.15); ctx.stroke();
    }
    // mouth
    ctx.strokeStyle = '#1a0b3d'; ctx.lineWidth = s * 0.04; ctx.lineCap = 'round';
    if (mood === 'happy' || mood === 'wow') {
      ctx.fillStyle = '#5a0d2e';
      ctx.beginPath(); ctx.moveTo(-s * 0.1, s * 0.13); ctx.quadraticCurveTo(0, s * 0.32, s * 0.1, s * 0.13); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff7aa2'; ctx.beginPath(); ctx.ellipse(0, s * 0.23, s * 0.045, s * 0.03, 0, 0, Math.PI * 2); ctx.fill();
    } else if (mood === 'shocked') {
      ctx.fillStyle = '#5a0d2e'; ctx.beginPath(); ctx.ellipse(0, s * 0.19, s * 0.06, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    } else if (mood === 'worried') {
      ctx.beginPath(); ctx.moveTo(-s * 0.09, s * 0.2); ctx.quadraticCurveTo(-s * 0.045, s * 0.16, 0, s * 0.2); ctx.quadraticCurveTo(s * 0.045, s * 0.24, s * 0.09, s * 0.2); ctx.stroke();
      ctx.fillStyle = '#9fe6ff';
      ctx.beginPath(); ctx.moveTo(h * 0.75, -h * 0.4); ctx.quadraticCurveTo(h * 0.9, -h * 0.15, h * 0.75, -h * 0.08); ctx.quadraticCurveTo(h * 0.6, -h * 0.15, h * 0.75, -h * 0.4); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(0, s * 0.11, s * 0.08, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke();
    }
    drawFace(ctx, o.face, s);
    // wand (in front, held at the right side)
    if (!o.noWand) {
      ctx.save();
      ctx.translate(h * 0.82, h * 0.38);
      ctx.rotate(0.55 + Math.sin(t * 2.4) * 0.1 + (mood === 'happy' || mood === 'wow' ? Math.sin(t * 12) * 0.25 : 0));
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#2a140a'; ctx.lineWidth = s * 0.085; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s * 0.5); ctx.stroke();
      ctx.strokeStyle = '#a0683f'; ctx.lineWidth = s * 0.045; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s * 0.5); ctx.stroke();
      ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#7a4b00'; ctx.lineWidth = s * 0.02;
      const tw = 1 + Math.sin(t * 6) * 0.12;
      star(ctx, 0, -s * 0.58, s * 0.13 * tw, s * 0.055 * tw, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = cols[0]; ctx.strokeStyle = cols[2]; ctx.lineWidth = s * 0.025;
      ctx.beginPath(); ctx.arc(0, -s * 0.04, s * 0.065, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    // hat
    ctx.save();
    ctx.translate(s * 0.04, -h + s * 0.02 + (shape === 'ghost' ? s * 0.04 : 0));
    drawHat(ctx, hat, s, t, cols);
    ctx.restore();
    ctx.restore();
  }

  // ---------- Logo ----------
  function logo(ctx, cx, cy, w, t, scalePx, o) {
    o = o || {};
    const letters = 'BLOCK'.split('');
    const tile = w / 5.6;
    const gap = tile * 0.12;
    const total = letters.length * tile + (letters.length - 1) * gap;
    const y1 = cy - tile * 0.62;
    const hues = [0, 1, 2, 3, 4];
    letters.forEach((ch, i) => {
      const x = cx - total / 2 + i * (tile + gap);
      const wob = Math.sin(t * 2 + i * 0.9) * tile * 0.04;
      const rot = (i % 2 ? 1 : -1) * 0.06 + Math.sin(t * 1.5 + i) * 0.015;
      ctx.save();
      ctx.translate(x + tile / 2, y1 + wob);
      ctx.rotate(rot);
      const spr = blockSprite(BLOCK[hues[i]], Math.round(tile * scalePx), '');
      ctx.drawImage(spr, -tile / 2, -tile / 2, tile, tile);
      text(ctx, ch, 0, -tile * 0.02, { size: tile * 0.78, color: '#ffffff', stroke: BLOCK[hues[i]][2], sw: tile * 0.12 });
      ctx.restore();
    });
    // SPELL
    const sy = cy + tile * 0.62;
    const size = tile * 1.22;
    ctx.save();
    ctx.translate(cx, sy);
    text(ctx, 'SPELL', 0, size * 0.07, { size, color: '#1a0b3d', stroke: '#1a0b3d', sw: size * 0.3 });
    text(ctx, 'SPELL', 0, 0, { size, grad: ['#fff6b0', '#ffd23f', '#ff9f1c', '#ff4d9a'], stroke: '#2a0f6e', sw: size * 0.16 });
    ctx.restore();
    // sparkles
    const sp = [[-0.47, 0.75, 0.09], [0.5, 0.5, 0.07], [0.44, -0.95, 0.06], [-0.52, -0.9, 0.05]];
    sp.forEach(([px, py, ps], i) => {
      const tw = 0.6 + 0.4 * Math.sin(t * 4 + i * 1.7);
      ctx.fillStyle = i % 2 ? '#ffe98a' : '#ffffff';
      star(ctx, cx + px * w, cy + py * tile, w * ps * 0.5 * tw, w * ps * 0.15 * tw, 4); ctx.fill();
    });
    // hat on the K tile
    if (!o.noHat) {
      const kx = cx - total / 2 + 4 * (tile + gap) + tile / 2;
      ctx.save();
      ctx.translate(kx + tile * 0.12, y1 - tile * 0.5);
      ctx.rotate(0.28);
      const s = tile * 1.05;
      ctx.fillStyle = '#3b1491'; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.45, s * 0.09, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-s * 0.28, -s * 0.02); ctx.quadraticCurveTo(-s * 0.08, -s * 0.4, s * 0.05, -s * 0.65); ctx.quadraticCurveTo(s * 0.26, -s * 0.56, s * 0.38, -s * 0.46); ctx.quadraticCurveTo(s * 0.16, -s * 0.44, s * 0.1, -s * 0.34); ctx.quadraticCurveTo(s * 0.2, -s * 0.18, s * 0.28, -s * 0.02); ctx.closePath();
      const hg = ctx.createLinearGradient(-s * 0.3, 0, s * 0.3, -s * 0.6); hg.addColorStop(0, '#6b2fe0'); hg.addColorStop(1, '#b07cff');
      ctx.fillStyle = hg; ctx.fill(); ctx.lineWidth = s * 0.03; ctx.strokeStyle = '#2a0f6e'; ctx.stroke();
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(-s * 0.27, -s * 0.05); ctx.quadraticCurveTo(0, -s * 0.11, s * 0.27, -s * 0.05); ctx.lineTo(s * 0.26, -s * 0.12); ctx.quadraticCurveTo(0, -s * 0.18, -s * 0.25, -s * 0.12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffe98a'; star(ctx, -s * 0.04, -s * 0.3, s * 0.06, s * 0.025, 5); ctx.fill();
      ctx.restore();
    }
  }

  root.GFX = { numText, SKINS, drawHat, setScale, offscreen, getPX: () => PX, textDirect, panelDirect, buttonDirect, PAL, BLOCK, GOLD, STONE, ICE, FONT_D, FONT_B, RARITY, rr, star, text, wrap, para, panel, button, blockSprite, drawBlock, colsFor, clearCache, spellBadge, icon, mascot, logo, lighten, drawOrbMark, drawBombMark };
})(typeof globalThis !== 'undefined' ? globalThis : this);
