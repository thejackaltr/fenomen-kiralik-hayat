// Procedural art for Fenomen: Kiralık Hayat. Runs in a browser page (tools/art/build.mjs).
// Rules: no text in any image, no real brands/logos, files named by ID.
// Paper-doll layers: every doll/* file is DOLL_W x DOLL_H with the same pivot (feet centre) and is drawn in
// GRAYSCALE so the game can tint it at runtime (multiply). Files ending in _fx are untinted detail overlays.
(function () {
  const DW = 256, DH = 512, PIV = [128, 500];
  const files = {};
  const add = (id, w, h, draw, extra) => { files[id] = Object.assign({ w, h, draw, pivot: [w / 2, h] }, extra || {}); };
  const doll = (id, draw) => add('doll/' + id, DW, DH, draw, { pivot: PIV });

  // ---------- helpers ----------
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function ell(c, x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); }
  function poly(c, pts) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); }
  function fs(c, fill, stroke, lw) { if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 3; c.lineJoin = 'round'; c.stroke(); } }
  function vgrad(c, y0, y1, a, b) { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; }
  function hgrad(c, x0, x1, a, b) { const g = c.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, a); g.addColorStop(1, b); return g; }
  // gray shading used by tintable layers: light base, darker right side
  const G = { hi: '#f4f4f4', base: '#dedede', mid: '#c4c4c4', dark: '#9a9a9a', line: '#6e6e6e' };
  function shadeRight(c, x, y, w, h) { c.save(); c.clip(); c.fillStyle = 'rgba(0,0,0,0.10)'; c.fillRect(x + w * 0.62, y, w, h); c.restore(); }

  // ---------- doll geometry (shared by all layers) ----------
  // head centre (128,176) r58; torso 86..170 x 248..378; arms 64..86 / 170..192 from 254 to 368; hands y 376;
  // legs 94..124 / 132..162 y 372..482; feet y 470..498
  function skin(c, female) {
    const L = G.line;
    // legs
    rr(c, 95, 368, 29, 118, 12); fs(c, G.base, L, 3);
    rr(c, 132, 368, 29, 118, 12); fs(c, G.mid, L, 3);
    // feet
    ell(c, 106, 490, 17, 9); fs(c, G.base, L, 3); ell(c, 150, 490, 17, 9); fs(c, G.mid, L, 3);
    // arms
    rr(c, 64, 252, 24, 120, 12); fs(c, G.base, L, 3);
    rr(c, 168, 252, 24, 120, 12); fs(c, G.mid, L, 3);
    ell(c, 76, 378, 13, 13); fs(c, G.base, L, 3); ell(c, 180, 378, 13, 13); fs(c, G.mid, L, 3);
    // torso
    c.beginPath();
    if (female) { c.moveTo(90, 252); c.quadraticCurveTo(128, 240, 166, 252); c.quadraticCurveTo(160, 312, 166, 380); c.lineTo(90, 380); c.quadraticCurveTo(96, 312, 90, 252); }
    else { c.moveTo(86, 254); c.quadraticCurveTo(128, 240, 170, 254); c.lineTo(166, 380); c.lineTo(90, 380); c.closePath(); }
    c.closePath(); fs(c, G.base, L, 3); shadeRight(c, 86, 240, 84, 140);
    // neck
    rr(c, 114, 222, 28, 34, 8); fs(c, G.mid, L, 3);
    // ears + head
    ell(c, 70, 182, 10, 14); fs(c, G.base, L, 3); ell(c, 186, 182, 10, 14); fs(c, G.mid, L, 3);
    ell(c, 128, 176, 58, 56); fs(c, vgrad(c, 120, 232, G.hi, G.base), L, 3);
  }
  function face(c, female) {
    // eyes
    for (const x of [106, 150]) {
      ell(c, x, 184, 9, female ? 11 : 10); fs(c, '#ffffff', '#3a2a24', 2);
      ell(c, x + 1, 186, 6, 7); fs(c, '#3b2a20');
      ell(c, x + 3, 183, 2.2, 2.2); fs(c, '#ffffff');
      if (female) { c.strokeStyle = '#2a1c16'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(x - 10, 176); c.lineTo(x - 14, 172); c.moveTo(x + 9, 176); c.lineTo(x + 13, 172); c.stroke(); }
    }
    // brows
    c.strokeStyle = 'rgba(50,34,26,0.85)'; c.lineWidth = female ? 3 : 4.5; c.lineCap = 'round';
    c.beginPath(); c.moveTo(95, 166); c.quadraticCurveTo(106, 161, 116, 165); c.moveTo(140, 165); c.quadraticCurveTo(150, 161, 161, 166); c.stroke();
    // blush
    ell(c, 94, 204, 9, 5); fs(c, 'rgba(240,120,120,0.30)'); ell(c, 162, 204, 9, 5); fs(c, 'rgba(240,120,120,0.30)');
    // mouth
    c.beginPath(); c.moveTo(114, 208); c.quadraticCurveTo(128, 222, 142, 208);
    if (female) { c.quadraticCurveTo(128, 214, 114, 208); fs(c, '#c8505a', '#8a2a34', 2); }
    else { c.strokeStyle = '#6a3a30'; c.lineWidth = 3; c.stroke(); }
    // nose
    c.strokeStyle = 'rgba(80,50,40,0.35)'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(128, 190); c.quadraticCurveTo(122, 200, 130, 201); c.stroke();
  }
  doll('body_m', (c) => skin(c, false));
  doll('body_m_fx', (c) => face(c, false));
  doll('body_m_hair', (c) => {
    c.beginPath(); c.moveTo(70, 182); c.quadraticCurveTo(62, 116, 118, 112); c.quadraticCurveTo(170, 104, 188, 150); c.quadraticCurveTo(192, 168, 186, 184);
    c.quadraticCurveTo(178, 150, 150, 144); c.quadraticCurveTo(120, 160, 96, 148); c.quadraticCurveTo(80, 160, 70, 182); c.closePath();
    fs(c, vgrad(c, 106, 184, G.hi, G.mid), G.line, 3);
    c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 3; c.beginPath(); c.moveTo(110, 122); c.quadraticCurveTo(128, 132, 150, 128); c.moveTo(94, 132); c.quadraticCurveTo(104, 142, 118, 140); c.stroke();
  });
  doll('body_f', (c) => skin(c, true));
  doll('body_f_fx', (c) => face(c, true));
  doll('body_f_hairback', (c) => {
    c.beginPath(); c.moveTo(66, 176); c.quadraticCurveTo(58, 110, 128, 106); c.quadraticCurveTo(198, 110, 190, 176);
    c.quadraticCurveTo(200, 250, 184, 300); c.lineTo(72, 300); c.quadraticCurveTo(56, 250, 66, 176); c.closePath();
    fs(c, vgrad(c, 106, 300, G.base, G.dark), G.line, 3);
  });
  doll('body_f_hair', (c) => {
    c.beginPath(); c.moveTo(68, 196); c.quadraticCurveTo(60, 112, 128, 110); c.quadraticCurveTo(196, 112, 188, 196);
    c.quadraticCurveTo(182, 160, 160, 146); c.quadraticCurveTo(140, 164, 104, 158); c.quadraticCurveTo(82, 168, 68, 196); c.closePath();
    fs(c, vgrad(c, 106, 196, G.hi, G.mid), G.line, 3);
    c.strokeStyle = 'rgba(0,0,0,0.16)'; c.lineWidth = 3; c.beginPath(); c.moveTo(128, 116); c.quadraticCurveTo(120, 140, 104, 150); c.moveTo(140, 118); c.quadraticCurveTo(150, 134, 162, 140); c.stroke();
  });

  // ---------- tops ----------
  function torsoShape(c, y1) { c.beginPath(); c.moveTo(82, 256); c.quadraticCurveTo(128, 236, 174, 256); c.lineTo(170, y1); c.lineTo(86, y1); c.closePath(); }
  function sleeves(c, len, col) {
    rr(c, 60, 250, 30, len, 13); fs(c, col || G.base, G.line, 3);
    rr(c, 166, 250, 30, len, 13); fs(c, col || G.mid, G.line, 3);
  }
  doll('top_tshirt_01', (c) => {
    sleeves(c, 56); torsoShape(c, 380); fs(c, G.base, G.line, 3); shadeRight(c, 82, 236, 92, 150);
    c.beginPath(); c.moveTo(112, 246); c.quadraticCurveTo(128, 262, 144, 246); c.strokeStyle = G.line; c.lineWidth = 3; c.stroke();
  });
  doll('top_hoodie_01', (c) => {
    ell(c, 128, 248, 44, 16); fs(c, G.mid, G.line, 3);
    sleeves(c, 118); torsoShape(c, 384); fs(c, G.base, G.line, 3); shadeRight(c, 82, 236, 92, 150);
    rr(c, 100, 330, 56, 30, 8); fs(c, G.mid, G.line, 2.5);
    c.strokeStyle = G.line; c.lineWidth = 2.5; c.beginPath(); c.moveTo(118, 254); c.lineTo(116, 292); c.moveTo(138, 254); c.lineTo(140, 292); c.stroke();
    rr(c, 60, 356, 30, 12, 5); fs(c, G.dark); rr(c, 166, 356, 30, 12, 5); fs(c, G.dark);
  });
  // generic dark tailored suit jacket (tint near-black by default). Shirt + pocket square are in _fx.
  doll('top_suit_01', (c) => {
    sleeves(c, 118); 
    c.beginPath(); c.moveTo(80, 256); c.quadraticCurveTo(128, 236, 176, 256); c.lineTo(172, 392); c.lineTo(84, 392); c.closePath(); fs(c, G.base, G.line, 3); shadeRight(c, 80, 236, 96, 160);
    // lapels
    poly(c, [112, 246, 128, 320, 100, 270, 106, 250]); fs(c, G.hi, G.line, 2.5);
    poly(c, [144, 246, 128, 320, 156, 270, 150, 250]); fs(c, G.mid, G.line, 2.5);
    c.strokeStyle = G.line; c.lineWidth = 2.5; c.beginPath(); c.moveTo(128, 320); c.lineTo(128, 392); c.stroke();
    ell(c, 122, 342, 3.5, 3.5); fs(c, G.dark); ell(c, 122, 364, 3.5, 3.5); fs(c, G.dark);
    rr(c, 60, 360, 30, 8, 3); fs(c, G.dark); rr(c, 166, 360, 30, 8, 3); fs(c, G.dark);
  });
  doll('top_suit_01_fx', (c) => {
    poly(c, [114, 248, 128, 318, 142, 248, 128, 256]); fs(c, '#f2f2f4', '#9a9aa4', 2);
    poly(c, [114, 248, 122, 262, 128, 256]); fs(c, '#ffffff', '#9a9aa4', 1.5); poly(c, [142, 248, 134, 262, 128, 256]); fs(c, '#ffffff', '#9a9aa4', 1.5);
    poly(c, [148, 290, 160, 286, 162, 296, 150, 298]); fs(c, '#b0122a', '#6a0a18', 1.5);
  });

  // ---------- bottoms ----------
  function trousers(c, yEnd, crease) {
    c.beginPath(); c.moveTo(88, 364); c.lineTo(168, 364); c.lineTo(166, yEnd); c.lineTo(132, yEnd); c.lineTo(128, 400); c.lineTo(124, yEnd); c.lineTo(90, yEnd); c.closePath();
    fs(c, G.base, G.line, 3); shadeRight(c, 88, 364, 80, yEnd - 364);
    c.strokeStyle = G.line; c.lineWidth = 2; c.beginPath(); c.moveTo(88, 378); c.lineTo(168, 378); c.stroke();
    if (crease) { c.strokeStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.moveTo(107, 384); c.lineTo(107, yEnd - 4); c.moveTo(149, 384); c.lineTo(149, yEnd - 4); c.stroke(); }
  }
  doll('bottom_jeans_01', (c) => { trousers(c, 478); c.strokeStyle = 'rgba(0,0,0,0.2)'; c.lineWidth = 2; c.beginPath(); c.moveTo(96, 390); c.quadraticCurveTo(108, 400, 118, 390); c.moveTo(138, 390); c.quadraticCurveTo(150, 400, 160, 390); c.stroke(); });
  doll('bottom_suit_01', (c) => trousers(c, 480, true));
  doll('bottom_shorts_01', (c) => trousers(c, 426));
  doll('bottom_skirt_01', (c) => {
    c.beginPath(); c.moveTo(90, 364); c.lineTo(166, 364); c.lineTo(182, 432); c.quadraticCurveTo(128, 444, 74, 432); c.closePath(); fs(c, G.base, G.line, 3); shadeRight(c, 74, 364, 108, 80);
    c.strokeStyle = 'rgba(0,0,0,0.2)'; c.lineWidth = 2; c.beginPath(); for (const x of [104, 128, 152]) { c.moveTo(x, 372); c.lineTo(x + (x - 128) * 0.35, 436); } c.stroke();
  });

  // ---------- shoes ----------
  doll('shoes_sneakers_01', (c) => {
    for (const [x, col] of [[106, G.base], [150, G.mid]]) {
      c.beginPath(); c.moveTo(x - 18, 478); c.lineTo(x + 6, 474); c.quadraticCurveTo(x + 22, 480, x + 22, 492); c.lineTo(x - 20, 494); c.closePath(); fs(c, col, G.line, 3);
      rr(c, x - 22, 490, 46, 9, 4); fs(c, G.hi, G.line, 2.5);
      c.strokeStyle = G.line; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 6, 478); c.lineTo(x + 2, 486); c.stroke();
    }
  });
  doll('shoes_loafers_01', (c) => {
    for (const [x, col] of [[106, G.base], [150, G.mid]]) {
      c.beginPath(); c.moveTo(x - 17, 482); c.quadraticCurveTo(x + 4, 476, x + 22, 488); c.lineTo(x + 22, 496); c.lineTo(x - 18, 496); c.closePath(); fs(c, col, G.line, 3);
      ell(c, x + 6, 484, 7, 2.5); fs(c, 'rgba(255,255,255,0.7)');
    }
  });
  doll('shoes_boots_01', (c) => {
    for (const [x, col] of [[106, G.base], [150, G.mid]]) {
      c.beginPath(); c.moveTo(x - 16, 446); c.lineTo(x + 12, 446); c.lineTo(x + 12, 476); c.quadraticCurveTo(x + 24, 482, x + 24, 494); c.lineTo(x - 18, 496); c.closePath(); fs(c, col, G.line, 3);
      rr(c, x - 20, 492, 46, 7, 3); fs(c, G.dark);
    }
  });

  // ---------- accessories ----------
  doll('acc_chain_01', (c) => {
    c.strokeStyle = G.line; c.lineWidth = 7; c.beginPath(); c.moveTo(110, 244); c.quadraticCurveTo(128, 300, 146, 244); c.stroke();
    c.strokeStyle = G.hi; c.lineWidth = 4; c.setLineDash([5, 3]); c.stroke(); c.setLineDash([]);
    ell(c, 128, 282, 9, 9); fs(c, G.hi, G.line, 2.5);
  });
  doll('acc_cap_01', (c) => {
    c.beginPath(); c.moveTo(72, 150); c.quadraticCurveTo(76, 96, 128, 94); c.quadraticCurveTo(180, 96, 184, 150); c.closePath(); fs(c, vgrad(c, 94, 150, G.hi, G.base), G.line, 3);
    c.beginPath(); c.moveTo(70, 150); c.quadraticCurveTo(128, 136, 212, 152); c.quadraticCurveTo(206, 162, 186, 160); c.quadraticCurveTo(128, 150, 72, 160); c.closePath(); fs(c, G.mid, G.line, 3);
    ell(c, 128, 96, 6, 4); fs(c, G.dark);
  });
  // wrist watches shown in videos (accessory layer). Tinted gold / steel.
  function wristWatch(c, big) {
    for (const x of [76]) {
      rr(c, x - 14, 352, 28, 14, 4); fs(c, G.mid, G.line, 2.5);
      ell(c, x, 359, big ? 12 : 10, big ? 12 : 10); fs(c, G.hi, G.line, 2.5);
    }
  }
  doll('acc_watch_01', (c) => wristWatch(c, false));
  doll('acc_watch_02', (c) => wristWatch(c, true));
  doll('acc_watch_02_fx', (c) => { ell(c, 76, 359, 7, 7); fs(c, '#1e4fa8'); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; ell(c, 76 + Math.cos(a) * 10, 359 + Math.sin(a) * 10, 1.6, 1.6); fs(c, '#ffffff'); } });
  doll('acc_watch_01_fx', (c) => { ell(c, 76, 359, 6, 6); fs(c, '#fbf6e8'); c.strokeStyle = '#333'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(76, 359); c.lineTo(76, 354); c.moveTo(76, 359); c.lineTo(80, 360); c.stroke(); });

  // ---------- glasses ----------
  // flashy oversized shield sunglasses: frame tinted (default gold), gradient lenses in _fx
  doll('glasses_sun_01', (c) => {
    c.beginPath(); c.moveTo(80, 172); c.quadraticCurveTo(106, 164, 124, 172); c.quadraticCurveTo(128, 176, 132, 172); c.quadraticCurveTo(150, 164, 176, 172);
    c.lineTo(174, 190); c.quadraticCurveTo(168, 206, 150, 204); c.quadraticCurveTo(136, 202, 132, 188); c.lineTo(124, 188); c.quadraticCurveTo(120, 202, 106, 204); c.quadraticCurveTo(88, 206, 82, 190); c.closePath();
    fs(c, G.hi, G.line, 3);
    c.strokeStyle = G.line; c.lineWidth = 4; c.beginPath(); c.moveTo(80, 176); c.lineTo(68, 180); c.moveTo(176, 176); c.lineTo(188, 180); c.stroke();
  });
  doll('glasses_sun_01_fx', (c) => {
    for (const [a, b] of [[86, 124], [132, 170]]) {
      c.beginPath(); c.moveTo(a, 175); c.quadraticCurveTo((a + b) / 2, 168, b, 175); c.lineTo(b - 2, 188); c.quadraticCurveTo((a + b) / 2, 206, a + 2, 190); c.closePath();
      const g = c.createLinearGradient(0, 168, 0, 204); g.addColorStop(0, '#ff3fa4'); g.addColorStop(0.5, '#7a3cff'); g.addColorStop(1, '#16c6ff'); fs(c, g);
      c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 3; c.beginPath(); c.moveTo(a + 8, 180); c.lineTo(a + 16, 174); c.stroke();
    }
  });
  doll('glasses_round_01', (c) => {
    c.strokeStyle = G.line; c.lineWidth = 5; for (const x of [106, 150]) { ell(c, x, 184, 16, 15); c.stroke(); }
    c.beginPath(); c.moveTo(122, 182); c.quadraticCurveTo(128, 176, 134, 182); c.moveTo(90, 180); c.lineTo(72, 178); c.moveTo(166, 180); c.lineTo(184, 178); c.stroke();
    c.strokeStyle = G.hi; c.lineWidth = 2; for (const x of [106, 150]) { ell(c, x, 184, 16, 15); c.stroke(); }
  });

  // ---------- luxury items (full colour, generic shapes, no logos) ----------
  function wheel(c, x, y, r) {
    ell(c, x, y, r, r); fs(c, '#1b1b20'); ell(c, x, y, r * 0.62, r * 0.62); fs(c, '#b8bcc6', '#6a6e78', 2);
    c.strokeStyle = '#7a7e88'; c.lineWidth = 3; c.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; c.moveTo(x, y); c.lineTo(x + Math.cos(a) * r * 0.58, y + Math.sin(a) * r * 0.58); } c.stroke();
    ell(c, x, y, r * 0.16, r * 0.16); fs(c, '#50545e');
  }
  add('items/car_01', 480, 190, (c) => { // low wedge coupe
    ell(c, 240, 180, 220, 9); fs(c, 'rgba(0,0,0,0.25)');
    c.beginPath(); c.moveTo(20, 140); c.quadraticCurveTo(24, 112, 70, 106); c.lineTo(170, 96); c.quadraticCurveTo(220, 58, 290, 60); c.quadraticCurveTo(340, 64, 380, 96); c.lineTo(440, 108); c.quadraticCurveTo(468, 116, 466, 146); c.lineTo(460, 160); c.lineTo(26, 162); c.closePath();
    fs(c, vgrad(c, 60, 162, '#ff5a4a', '#b3131f'), '#5a0a10', 3);
    c.beginPath(); c.moveTo(186, 98); c.quadraticCurveTo(226, 70, 284, 70); c.quadraticCurveTo(330, 72, 362, 98); c.closePath(); fs(c, vgrad(c, 70, 98, '#9fd4ff', '#3a6e9e'), '#20303e', 2.5);
    c.strokeStyle = '#20303e'; c.lineWidth = 4; c.beginPath(); c.moveTo(276, 70); c.lineTo(270, 98); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 4; c.beginPath(); c.moveTo(60, 118); c.lineTo(420, 116); c.stroke();
    ell(c, 452, 126, 10, 6); fs(c, '#fff4c0'); rr(c, 22, 124, 14, 10, 3); fs(c, '#ff2030');
    rr(c, 190, 104, 30, 5, 2); fs(c, '#5a0a10');
    wheel(c, 110, 158, 30); wheel(c, 376, 158, 30);
  });
  add('items/car_02', 480, 210, (c) => { // boxy SUV
    ell(c, 240, 200, 220, 9); fs(c, 'rgba(0,0,0,0.25)');
    rr(c, 30, 90, 420, 86, 18); fs(c, vgrad(c, 90, 176, '#4a505e', '#1c1f27'), '#0c0d12', 3);
    c.beginPath(); c.moveTo(80, 92); c.lineTo(120, 30); c.lineTo(350, 30); c.lineTo(400, 92); c.closePath(); fs(c, vgrad(c, 30, 92, '#3e4452', '#262a34'), '#0c0d12', 3);
    poly(c, [100, 88, 130, 42, 230, 42, 230, 88]); fs(c, vgrad(c, 42, 88, '#a8dcff', '#3a6e9e'), '#10141c', 2.5);
    poly(c, [244, 88, 244, 42, 340, 42, 378, 88]); fs(c, vgrad(c, 42, 88, '#a8dcff', '#3a6e9e'), '#10141c', 2.5);
    rr(c, 118, 22, 240, 8, 3); fs(c, '#9aa0ac');
    c.strokeStyle = '#0c0d12'; c.lineWidth = 3; c.beginPath(); c.moveTo(237, 92); c.lineTo(237, 170); c.stroke();
    rr(c, 436, 112, 12, 16, 3); fs(c, '#fff4c0'); rr(c, 32, 112, 10, 18, 3); fs(c, '#ff2030');
    wheel(c, 120, 176, 34); wheel(c, 360, 176, 34);
  });
  function watchIcon(c, gold) {
    rr(c, 58, 6, 44, 148, 14); fs(c, gold ? vgrad(c, 0, 160, '#7a5a1a', '#c9a24a') : vgrad(c, 0, 160, '#5a6070', '#aab2c0'), '#2a2a30', 3);
    ell(c, 80, 80, 44, 44); fs(c, gold ? '#e8c060' : '#dfe6ef', '#3a3020', 4);
    ell(c, 80, 80, 34, 34); fs(c, gold ? '#fff8e6' : '#1e4fa8');
    c.strokeStyle = gold ? '#333' : '#fff'; c.lineWidth = 3; c.lineCap = 'round';
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; c.beginPath(); c.moveTo(80 + Math.cos(a) * 28, 80 + Math.sin(a) * 28); c.lineTo(80 + Math.cos(a) * 32, 80 + Math.sin(a) * 32); c.stroke(); }
    c.beginPath(); c.moveTo(80, 80); c.lineTo(80, 58); c.moveTo(80, 80); c.lineTo(96, 86); c.stroke();
    if (!gold) for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; ell(c, 80 + Math.cos(a) * 39, 80 + Math.sin(a) * 39, 2.5, 2.5); fs(c, '#ffffff'); }
    rr(c, 122, 72, 8, 16, 3); fs(c, gold ? '#c9a24a' : '#aab2c0', '#2a2a30', 2);
  }
  add('items/watch_01', 160, 160, (c) => watchIcon(c, true));
  add('items/watch_02', 160, 160, (c) => watchIcon(c, false));
  add('items/villa_01', 320, 220, (c) => {
    rr(c, 10, 176, 300, 36, 6); fs(c, '#3fb9e6', '#1d6e8e', 3);
    c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 3; c.beginPath(); c.moveTo(40, 190); c.lineTo(90, 190); c.moveTo(150, 200); c.lineTo(210, 200); c.stroke();
    rr(c, 30, 70, 170, 106, 4); fs(c, '#f4f1ea', '#8a8478', 3); rr(c, 120, 30, 170, 146, 4); fs(c, '#ffffff', '#8a8478', 3);
    rr(c, 20, 62, 190, 12, 3); fs(c, '#3a3a40'); rr(c, 110, 22, 190, 12, 3); fs(c, '#3a3a40');
    for (const [x, y, w, hh] of [[46, 96, 60, 60], [140, 50, 130, 50], [140, 116, 60, 60], [214, 116, 56, 60]]) { rr(c, x, y, w, hh, 2); fs(c, vgrad(c, y, y + hh, '#bfe6ff', '#5a8eb8'), '#3a4a58', 2); }
    ell(c, 290, 150, 18, 30); fs(c, '#3e9a4a'); rr(c, 286, 170, 8, 10, 2); fs(c, '#7a5a3a');
  });
  add('items/boat_01', 420, 190, (c) => {
    c.beginPath(); c.moveTo(10, 110); c.lineTo(400, 104); c.quadraticCurveTo(380, 160, 330, 170); c.lineTo(60, 170); c.quadraticCurveTo(24, 150, 10, 110); c.closePath(); fs(c, vgrad(c, 104, 170, '#ffffff', '#c8d0da'), '#5a6470', 3);
    c.strokeStyle = '#1d4f8e'; c.lineWidth = 6; c.beginPath(); c.moveTo(30, 136); c.lineTo(380, 132); c.stroke();
    c.beginPath(); c.moveTo(90, 108); c.lineTo(120, 64); c.lineTo(300, 60); c.lineTo(340, 106); c.closePath(); fs(c, '#f4f6f8', '#5a6470', 3);
    poly(c, [132, 100, 150, 72, 290, 70, 316, 100]); fs(c, vgrad(c, 70, 100, '#8cc8ee', '#2a5a80'), '#20303e', 2);
    c.beginPath(); c.moveTo(150, 60); c.lineTo(170, 30); c.lineTo(260, 28); c.lineTo(276, 58); c.closePath(); fs(c, '#e8ecf0', '#5a6470', 3);
    for (let x = 60; x < 360; x += 40) { c.beginPath(); c.moveTo(x, 186); c.quadraticCurveTo(x + 10, 178, x + 20, 186); c.strokeStyle = 'rgba(40,120,200,0.6)'; c.lineWidth = 3; c.stroke(); }
  });
  add('items/painting_01', 160, 200, (c) => {
    rr(c, 4, 4, 152, 192, 4); fs(c, '#c9a24a', '#6a5020', 3); rr(c, 16, 16, 128, 168, 2); fs(c, '#fbf7ee');
    ell(c, 60, 70, 30, 30); fs(c, '#e8483c'); poly(c, [80, 170, 140, 170, 110, 90]); fs(c, '#2a5ad8'); rr(c, 24, 120, 60, 22, 2); fs(c, '#f2c230');
    c.strokeStyle = '#111'; c.lineWidth = 4; c.beginPath(); c.moveTo(24, 110); c.quadraticCurveTo(80, 60, 136, 120); c.stroke();
  });
  add('items/sneaker_rare_01', 200, 120, (c) => { // collectible sneaker (generic)
    c.beginPath(); c.moveTo(20, 80); c.quadraticCurveTo(40, 30, 90, 36); c.lineTo(120, 60); c.quadraticCurveTo(180, 64, 186, 92); c.lineTo(20, 96); c.closePath(); fs(c, vgrad(c, 30, 96, '#ffffff', '#d8dce6'), '#3a3e4a', 3);
    c.beginPath(); c.moveTo(40, 80); c.quadraticCurveTo(90, 50, 150, 78); c.strokeStyle = '#ff6a1a'; c.lineWidth = 8; c.stroke();
    rr(c, 14, 92, 178, 14, 6); fs(c, '#2ad0a0', '#1a6a50', 2);
  });

  // ---------- investments / equipment / staff / paths (icons 160x160) ----------
  const ic = (id, draw) => add('items/' + id, 160, 160, draw);
  const disc = (c, col) => { ell(c, 80, 80, 74, 74); fs(c, col); };
  ic('inv_fund', (c) => { disc(c, '#1f3b2e'); for (const [i, hh] of [[0, 30], [1, 50], [2, 42], [3, 76]]) { rr(c, 34 + i * 24, 116 - hh, 18, hh, 3); fs(c, '#3fd28a'); } c.strokeStyle = '#ffe36a'; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(34, 96); c.lineTo(62, 76); c.lineTo(86, 84); c.lineTo(124, 44); c.stroke(); poly(c, [124, 44, 110, 46, 122, 58]); fs(c, '#ffe36a'); });
  ic('inv_land', (c) => { disc(c, '#2e3b1f'); poly(c, [20, 110, 80, 80, 140, 110, 80, 140]); fs(c, '#7ac04a', '#3a6a1a', 3); rr(c, 76, 44, 6, 60, 2); fs(c, '#7a5a3a'); rr(c, 60, 40, 44, 26, 3); fs(c, '#f2e6c8', '#7a5a3a', 2); c.strokeStyle = '#7a5a3a'; c.lineWidth = 3; c.beginPath(); c.moveTo(68, 50); c.lineTo(96, 50); c.moveTo(68, 57); c.lineTo(88, 57); c.stroke(); });
  ic('inv_cafe', (c) => { disc(c, '#3b2a1f'); rr(c, 32, 64, 96, 64, 4); fs(c, '#f4ead8', '#6a4a2a', 3); poly(c, [26, 66, 134, 66, 124, 40, 36, 40]); fs(c, '#d8483c', '#6a1a1a', 3); for (let i = 0; i < 5; i++) { poly(c, [36 + i * 18, 40, 54 + i * 18, 40, 54 + i * 18, 66, 36 + i * 18, 66]); if (i % 2) fs(c, '#ffffff'); } rr(c, 44, 84, 30, 44, 3); fs(c, '#8a5a3a'); rr(c, 86, 84, 32, 24, 3); fs(c, '#a8dcff', '#3a4a58', 2); ell(c, 118, 132, 12, 6); fs(c, '#ffffff'); });
  ic('eq_camera', (c) => { disc(c, '#23283a'); rr(c, 26, 56, 108, 68, 12); fs(c, '#2a2d36', '#0c0d12', 3); rr(c, 48, 44, 36, 16, 4); fs(c, '#3a3d46'); ell(c, 80, 90, 26, 26); fs(c, '#50545e', '#0c0d12', 3); ell(c, 80, 90, 16, 16); fs(c, '#1e4fa8'); ell(c, 74, 84, 5, 5); fs(c, '#ffffff'); ell(c, 118, 68, 5, 5); fs(c, '#ff4050'); });
  ic('eq_mic', (c) => { disc(c, '#2a233a'); rr(c, 60, 26, 40, 70, 20); fs(c, '#b8bcc6', '#3a3e4a', 3); c.strokeStyle = '#3a3e4a'; c.lineWidth = 2; for (let y = 38; y < 90; y += 8) { c.beginPath(); c.moveTo(62, y); c.lineTo(98, y); c.stroke(); } c.lineWidth = 6; c.beginPath(); c.arc(80, 70, 32, 0.1, Math.PI - 0.1); c.stroke(); rr(c, 76, 102, 8, 26, 2); fs(c, '#3a3e4a'); rr(c, 54, 126, 52, 8, 3); fs(c, '#3a3e4a'); });
  ic('eq_light', (c) => { disc(c, '#3a3323'); c.strokeStyle = '#fff6d8'; c.lineWidth = 14; ell(c, 80, 70, 40, 40); c.stroke(); c.strokeStyle = '#ffd35a'; c.lineWidth = 3; ell(c, 80, 70, 48, 48); c.stroke(); rr(c, 76, 110, 8, 30, 2); fs(c, '#50545e'); });
  ic('eq_pc', (c) => { disc(c, '#1f2a3b'); rr(c, 20, 36, 90, 62, 6); fs(c, '#141820', '#50545e', 3); rr(c, 26, 42, 78, 50, 3); fs(c, vgrad(c, 42, 92, '#6a3cff', '#16c6ff')); rr(c, 58, 98, 14, 14, 2); fs(c, '#50545e'); rr(c, 40, 110, 50, 6, 2); fs(c, '#50545e'); rr(c, 112, 40, 30, 80, 5); fs(c, '#141820', '#50545e', 3); for (const [y, col] of [[52, '#ff3fa4'], [68, '#3fd28a'], [84, '#16c6ff']]) { ell(c, 127, y, 7, 7); fs(c, col); } });
  ic('staff_editor', (c) => { disc(c, '#23303a'); ell(c, 80, 64, 24, 24); fs(c, '#e8b890'); rr(c, 44, 94, 72, 46, 20); fs(c, '#3fa0d2'); c.strokeStyle = '#222'; c.lineWidth = 6; c.beginPath(); c.arc(80, 62, 30, Math.PI, 0); c.stroke(); rr(c, 44, 56, 12, 20, 4); fs(c, '#222'); rr(c, 104, 56, 12, 20, 4); fs(c, '#222'); });
  ic('staff_manager', (c) => { disc(c, '#3a2330'); ell(c, 80, 62, 24, 24); fs(c, '#c89070'); rr(c, 40, 92, 80, 50, 18); fs(c, '#2a2d36'); poly(c, [70, 92, 90, 92, 80, 104]); fs(c, '#ffffff'); poly(c, [77, 100, 83, 100, 86, 128, 80, 136, 74, 128]); fs(c, '#d8483c'); ell(c, 80, 44, 24, 10); fs(c, '#3a2a20'); });
  ic('fanbox', (c) => { disc(c, '#3a2340'); poly(c, [30, 64, 80, 44, 130, 64, 80, 84]); fs(c, '#ffb0d8', '#8a2a5a', 3); poly(c, [30, 64, 80, 84, 80, 136, 30, 114]); fs(c, '#ff7ab8', '#8a2a5a', 3); poly(c, [130, 64, 80, 84, 80, 136, 130, 114]); fs(c, '#e8559a', '#8a2a5a', 3); c.beginPath(); c.moveTo(80, 36); c.bezierCurveTo(70, 20, 50, 30, 62, 44); c.lineTo(80, 58); c.lineTo(98, 44); c.bezierCurveTo(110, 30, 90, 20, 80, 36); fs(c, '#ff3f6a', '#8a1a2a', 2); });
  ic('path_vlog', (c) => { disc(c, '#3a2a23'); rr(c, 52, 22, 56, 116, 12); fs(c, '#1b1d24', '#50545e', 3); rr(c, 58, 32, 44, 90, 4); fs(c, vgrad(c, 32, 122, '#ffb35c', '#e0663a')); ell(c, 80, 70, 12, 12); fs(c, '#fff3e0'); rr(c, 68, 82, 24, 24, 10); fs(c, '#fff3e0'); ell(c, 118, 40, 8, 8); fs(c, '#ff4050'); });
  ic('path_oyun', (c) => { disc(c, '#23283a'); c.beginPath(); c.moveTo(30, 76); c.quadraticCurveTo(34, 52, 60, 54); c.lineTo(100, 54); c.quadraticCurveTo(126, 52, 130, 76); c.quadraticCurveTo(140, 120, 116, 118); c.quadraticCurveTo(104, 116, 98, 102); c.lineTo(62, 102); c.quadraticCurveTo(56, 116, 44, 118); c.quadraticCurveTo(20, 120, 30, 76); fs(c, '#e8ecf4', '#50545e', 3); rr(c, 46, 72, 22, 8, 2); fs(c, '#3a3e4a'); rr(c, 53, 65, 8, 22, 2); fs(c, '#3a3e4a'); for (const [x, y, col] of [[104, 68, '#ff4050'], [116, 78, '#3fd28a'], [104, 88, '#16c6ff'], [92, 78, '#ffd35a']]) { ell(c, x, y, 5, 5); fs(c, col); } });
  ic('path_egitim', (c) => { disc(c, '#233a2e'); poly(c, [20, 64, 80, 40, 140, 64, 80, 88]); fs(c, '#2a2d36', '#0c0d12', 3); rr(c, 50, 76, 60, 30, 8); fs(c, '#2a2d36'); c.strokeStyle = '#ffd35a'; c.lineWidth = 4; c.beginPath(); c.moveTo(128, 68); c.lineTo(128, 104); c.stroke(); ell(c, 128, 108, 6, 6); fs(c, '#ffd35a'); });
  ic('path_luks', (c) => { disc(c, '#3a3323'); poly(c, [40, 62, 60, 36, 100, 36, 120, 62, 80, 124]); fs(c, vgrad(c, 36, 124, '#d8f4ff', '#5ab4ea'), '#1d4f8e', 3); c.strokeStyle = '#1d4f8e'; c.lineWidth = 2; c.beginPath(); c.moveTo(40, 62); c.lineTo(120, 62); c.moveTo(60, 36); c.lineTo(70, 62); c.lineTo(80, 124); c.lineTo(90, 62); c.lineTo(100, 36); c.stroke(); });

  // v2 icons: Şöhret, achievement, Kanalı Sat (no text in images)
  const star = (c, cx, cy, R, r) => { const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r : R; pts.push(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); } poly(c, pts); };
  ic('fame_star', (c) => { disc(c, '#3a2a10'); star(c, 80, 84, 60, 26); fs(c, vgrad(c, 24, 144, '#fff1a0', '#f2a818'), '#8a5a0a', 4); star(c, 80, 84, 30, 13); fs(c, 'rgba(255,255,255,0.35)'); });
  ic('ach_trophy', (c) => { disc(c, '#2e2a3a'); c.strokeStyle = '#c8901a'; c.lineWidth = 8; c.beginPath(); c.arc(42, 62, 18, Math.PI * 0.5, Math.PI * 1.5); c.stroke(); c.beginPath(); c.arc(118, 62, 18, -Math.PI * 0.5, Math.PI * 0.5); c.stroke();
    c.beginPath(); c.moveTo(42, 36); c.lineTo(118, 36); c.quadraticCurveTo(116, 96, 80, 102); c.quadraticCurveTo(44, 96, 42, 36); fs(c, vgrad(c, 36, 102, '#ffe36a', '#e0a020'), '#8a5a0a', 3); rr(c, 72, 100, 16, 18, 2); fs(c, '#e0a020'); rr(c, 52, 116, 56, 16, 4); fs(c, '#6a4a2a', '#3a2a1a', 2); star(c, 80, 62, 16, 7); fs(c, '#fff6c0'); });
  ic('sell_channel', (c) => { disc(c, '#1f3a2e'); rr(c, 40, 24, 58, 108, 10); fs(c, '#1b1d24', '#50545e', 3); rr(c, 46, 34, 46, 84, 4); fs(c, vgrad(c, 34, 118, '#ff7ab8', '#7a3cff')); poly(c, [62, 62, 62, 90, 84, 76]); fs(c, '#ffffff');
    poly(c, [92, 92, 120, 64, 146, 90, 118, 118]); fs(c, '#3fd28a', '#1a6a3a', 3); ell(c, 118, 76, 5, 5); fs(c, '#1a6a3a'); c.strokeStyle = '#1a6a3a'; c.lineWidth = 4; c.beginPath(); c.moveTo(110, 98); c.lineTo(128, 98); c.moveTo(119, 90); c.lineTo(119, 106); c.stroke(); });

  // ---------- backgrounds 960x540 ----------
  const bg = (id, draw) => add('bg/' + id, 960, 540, draw, { pivot: [0, 0] });
  function floor(c, y, a, b) { c.fillStyle = vgrad(c, y, 540, a, b); c.fillRect(0, y, 960, 540 - y); }
  bg('bg_room_01', (c) => {
    c.fillStyle = vgrad(c, 0, 400, '#f3d9c4', '#e6bfa4'); c.fillRect(0, 0, 960, 400); floor(c, 400, '#b07a52', '#7a4e32');
    c.strokeStyle = 'rgba(0,0,0,0.08)'; c.lineWidth = 3; for (let x = -200; x < 960; x += 90) { c.beginPath(); c.moveTo(x, 540); c.lineTo(x + 140, 400); c.stroke(); }
    rr(c, 60, 80, 220, 170, 6); fs(c, vgrad(c, 80, 250, '#9fd8ff', '#e8f6ff'), '#fff', 10); c.strokeStyle = '#fff'; c.lineWidth = 6; c.beginPath(); c.moveTo(170, 80); c.lineTo(170, 250); c.stroke();
    rr(c, 40, 320, 300, 90, 16); fs(c, '#6a8ed8', '#3a5aa0', 4); rr(c, 60, 296, 110, 40, 14); fs(c, '#f4f1ea'); // bed
    rr(c, 760, 120, 140, 90, 6); fs(c, '#f7f2ea', '#b9a58e', 4); ell(c, 800, 150, 14, 14); fs(c, '#e8a040'); // shelf poster (no text)
    c.strokeStyle = '#3a3e4a'; c.lineWidth = 6; c.beginPath(); c.moveTo(700, 420); c.lineTo(740, 150); c.lineTo(780, 420); c.stroke(); // ring light stand
    c.strokeStyle = '#fff6d8'; c.lineWidth = 16; ell(c, 740, 150, 44, 44); c.stroke();
    ell(c, 880, 470, 50, 16); fs(c, 'rgba(0,0,0,0.12)'); rr(c, 860, 380, 40, 90, 10); fs(c, '#3e9a4a'); rr(c, 850, 440, 60, 34, 6); fs(c, '#c86a3a');
  });
  bg('bg_gaming_01', (c) => {
    c.fillStyle = vgrad(c, 0, 400, '#1b1630', '#2c2250'); c.fillRect(0, 0, 960, 400); floor(c, 400, '#231c3a', '#120e20');
    for (const [x, col] of [[0, '#ff3fa4'], [320, '#7a3cff'], [640, '#16c6ff']]) { c.fillStyle = col; c.globalAlpha = 0.85; c.fillRect(x + 20, 36, 280, 6); c.globalAlpha = 1; }
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { poly(c, [80 + i * 60, 100 + j * 52, 108 + i * 60, 86 + j * 52, 136 + i * 60, 100 + j * 52, 108 + i * 60, 114 + j * 52]); fs(c, (i + j) % 2 ? '#2e2656' : '#3a2f6e'); }
    rr(c, 560, 330, 380, 22, 4); fs(c, '#0c0a16', '#3a2f6e', 3); rr(c, 580, 352, 16, 90, 3); fs(c, '#0c0a16'); rr(c, 900, 352, 16, 90, 3); fs(c, '#0c0a16');
    rr(c, 600, 170, 250, 150, 8); fs(c, '#0c0a16', '#3a2f6e', 4); rr(c, 612, 182, 226, 126, 4); fs(c, vgrad(c, 182, 308, '#6a3cff', '#16c6ff'));
    for (let i = 0; i < 5; i++) { rr(c, 630 + i * 40, 270 - i * 16, 26, 30 + i * 16, 3); fs(c, 'rgba(255,255,255,0.35)'); }
    rr(c, 860, 200, 60, 130, 8); fs(c, '#0c0a16', '#ff3fa4', 3); for (let y = 220; y < 320; y += 24) { ell(c, 890, y, 9, 9); fs(c, ['#ff3fa4', '#3fd28a', '#16c6ff', '#ffd35a'][(y / 24) % 4 | 0]); }
  });
  bg('bg_villa_01', (c) => {
    c.fillStyle = vgrad(c, 0, 300, '#6ec6ff', '#d4f0ff'); c.fillRect(0, 0, 960, 300); ell(c, 820, 80, 40, 40); fs(c, '#fff4b0');
    rr(c, 330, 90, 560, 240, 6); fs(c, '#ffffff', '#b8b0a4', 4); rr(c, 310, 76, 600, 20, 4); fs(c, '#3a3a40'); rr(c, 500, 30, 330, 70, 4); fs(c, '#f4f1ea', '#b8b0a4', 4); rr(c, 490, 20, 350, 14, 4); fs(c, '#3a3a40');
    for (let i = 0; i < 4; i++) { rr(c, 360 + i * 130, 130, 100, 150, 3); fs(c, vgrad(c, 130, 280, '#bfe6ff', '#5a8eb8'), '#3a4a58', 3); }
    floor(c, 330, '#e8dcc4', '#d4c4a4'); rr(c, 0, 400, 960, 140, 0); c.fillStyle = vgrad(c, 400, 540, '#4ad0f0', '#1a8ab8'); c.fillRect(0, 410, 960, 130);
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 4; for (let i = 0; i < 12; i++) { c.beginPath(); c.moveTo(40 + i * 80, 450 + (i % 3) * 25); c.quadraticCurveTo(60 + i * 80, 440 + (i % 3) * 25, 80 + i * 80, 450 + (i % 3) * 25); c.stroke(); }
    for (const x of [80, 230]) { rr(c, x - 6, 150, 12, 190, 5); fs(c, '#8a6a4a'); for (let k = 0; k < 6; k++) { c.save(); c.translate(x, 150); c.rotate(k / 6 * Math.PI * 2); ell(c, 40, 0, 44, 12); fs(c, '#3e9a4a'); c.restore(); } }
  });
  bg('bg_lounge_01', (c) => {   // Lüks Yaşam home: penthouse lounge at night
    c.fillStyle = vgrad(c, 0, 380, '#140f24', '#2a1f3e'); c.fillRect(0, 0, 960, 380);
    rr(c, 40, 40, 880, 300, 4); fs(c, vgrad(c, 40, 340, '#0b1030', '#3a2a6a'), '#c8a060', 6);   // window wall
    for (let i = 0; i < 14; i++) { const hh = 70 + ((i * 67) % 170), x = 50 + i * 63; rr(c, x, 340 - hh, 52, hh, 2); fs(c, i % 2 ? '#1a1a3a' : '#24204a'); for (let y = 340 - hh + 10; y < 330; y += 18) for (let k = 0; k < 3; k++) if ((y + k * 7 + i * 3) % 4) { rr(c, x + 7 + k * 15, y, 8, 8, 1); fs(c, (y + i) % 3 ? '#ffd88a' : '#9ad0ff'); } }
    ell(c, 780, 100, 26, 26); fs(c, '#fff6d8');
    c.strokeStyle = '#c8a060'; c.lineWidth = 6; for (const x of [260, 480, 700]) { c.beginPath(); c.moveTo(x, 40); c.lineTo(x, 340); c.stroke(); }
    floor(c, 340, '#e8e2ee', '#b8aecb'); c.strokeStyle = 'rgba(120,100,150,0.25)'; c.lineWidth = 2; for (let x = -100; x < 960; x += 120) { c.beginPath(); c.moveTo(x, 540); c.lineTo(x + 60, 340); c.stroke(); } c.beginPath(); c.moveTo(0, 420); c.lineTo(960, 420); c.stroke();
    rr(c, 40, 360, 330, 110, 30); fs(c, '#6a1a4a', '#3a0a2a', 4); rr(c, 60, 330, 290, 60, 24); fs(c, '#8a2a5a', '#3a0a2a', 4); for (const x of [90, 190, 290]) { rr(c, x, 346, 60, 36, 14); fs(c, '#f2c230'); }   // velvet sofa
    rr(c, 400, 440, 160, 18, 6); fs(c, '#f4f1ea', '#c8a060', 3); rr(c, 430, 458, 12, 40, 3); fs(c, '#c8a060'); rr(c, 518, 458, 12, 40, 3); fs(c, '#c8a060');   // marble table
    rr(c, 460, 404, 24, 38, 8); fs(c, '#3fd2c8', '#1a6a6a', 2); for (const [dx, dy] of [[-10, -12], [0, -20], [10, -12]]) { ell(c, 472 + dx, 404 + dy, 8, 8); fs(c, '#ff7ab8'); }   // vase + flowers
    c.strokeStyle = '#c8a060'; c.lineWidth = 6; c.beginPath(); c.moveTo(860, 480); c.lineTo(860, 200); c.quadraticCurveTo(860, 160, 820, 160); c.stroke(); ell(c, 820, 176, 30, 16); fs(c, '#ffe9a8', '#c8a060', 3); ell(c, 860, 486, 34, 10); fs(c, '#c8a060');   // gold arc lamp
    c.fillStyle = 'rgba(255,233,168,0.18)'; poly(c, [790, 186, 850, 186, 900, 470, 740, 470]); c.fill();
  });
  bg('bg_street_01', (c) => {
    c.fillStyle = vgrad(c, 0, 320, '#ffb35c', '#ffe0b0'); c.fillRect(0, 0, 960, 320); ell(c, 180, 250, 70, 70); fs(c, '#fff0c0');
    for (let i = 0; i < 9; i++) { const hh = 120 + ((i * 53) % 130), x = i * 110 - 10; rr(c, x, 320 - hh, 100, hh, 3); fs(c, i % 2 ? '#6a5a7a' : '#8a6a8a'); for (let y = 320 - hh + 16; y < 300; y += 28) for (let k = 0; k < 3; k++) { rr(c, x + 14 + k * 28, y, 14, 16, 2); fs(c, (y + k + i) % 3 ? '#ffd88a' : '#4a3a5a'); } }
    c.fillStyle = '#b8b0a8'; c.fillRect(0, 320, 960, 40); c.fillStyle = vgrad(c, 360, 540, '#4a4a52', '#2a2a30'); c.fillRect(0, 360, 960, 180);
    c.fillStyle = '#f4f1ea'; for (let x = 20; x < 960; x += 120) c.fillRect(x, 470, 70, 8);
    for (const x of [80, 880]) { rr(c, x - 4, 150, 8, 180, 3); fs(c, '#3a3a40'); ell(c, x, 150, 16, 10); fs(c, '#fff4c0'); }
  });
  bg('bg_sea_01', (c) => {
    c.fillStyle = vgrad(c, 0, 280, '#5ab8ff', '#cfeeff'); c.fillRect(0, 0, 960, 280); ell(c, 160, 90, 44, 44); fs(c, '#fff4b0');
    for (const [x, y] of [[520, 70], [760, 120]]) { ell(c, x, y, 50, 18); fs(c, '#ffffff'); ell(c, x + 30, y - 10, 34, 16); fs(c, '#ffffff'); }
    poly(c, [600, 280, 720, 200, 820, 240, 960, 190, 960, 280]); fs(c, '#7aa89a');
    c.fillStyle = vgrad(c, 280, 540, '#2aa8e0', '#0a4a80'); c.fillRect(0, 280, 960, 260);
    c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 3; for (let i = 0; i < 30; i++) { const x = (i * 137) % 960, y = 300 + (i * 71) % 220; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 14, y - 8, x + 28, y); c.stroke(); }
    c.fillStyle = '#c9a26a'; c.fillRect(0, 470, 960, 70); c.fillStyle = '#a8824a'; for (let x = 0; x < 960; x += 64) c.fillRect(x, 470, 4, 70);
  });

  window.ART = { files, DOLL: { w: DW, h: DH, pivot: PIV } };
})();
