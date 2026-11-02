/*! 바로도구 신분증 가림 도구 v1.0
 *  모든 처리는 브라우저 안에서만 이루어지며, 사진은 어디에도 전송·저장되지 않습니다.
 *  외부 라이브러리 없음 (PDF도 직접 생성). 필요: id-mask-templates.js
 *  https://github.com/barodogu/tools
 */
(function () {
  'use strict';

  var T = window.IDMASK_TEMPLATES || { custom: { name: '직접 가리기', aspect: 0, mm: null, fields: [] } };
  var MAX_SIDE = 2400;  // 원본 처리 해상도 상한(긴 변)
  var OUT_MIN = 800, OUT_MAX = 2000; // 보정 결과 가로 크기 범위
  var HANDLE = 22, MIN_BOX = 10, CORNER_R = 14, CORNER_HIT = 44;

  var root = document.getElementById('idmask-app');
  if (!root) return;

  var typeOpts = '';
  for (var t in T) if (Object.prototype.hasOwnProperty.call(T, t)) {
    typeOpts += '<option value="' + t + '">' + T[t].name + '</option>';
  }

  root.innerHTML =
    '<div class="idm">' +
      // 1단계: 사진 선택
      '<div class="idm-drop" data-ref="drop">' +
        '<p class="idm-drop-title">신분증 사진을 선택하세요</p>' +
        '<p class="idm-drop-sub">사진은 이 기기 밖으로 전송되지 않습니다</p>' +
        '<label class="idm-btn idm-btn-primary">사진 선택' +
          '<input type="file" accept="image/*" class="idm-hidden" data-ref="file">' +
        '</label>' +
      '</div>' +
      // 2단계: 종류 선택 + 기울기 보정
      '<div data-ref="adjust" hidden>' +
        '<p class="idm-step">1/2 · 신분증 종류와 모서리 맞추기</p>' +
        '<label class="idm-label">신분증 종류 <select class="idm-select" data-ref="type">' + typeOpts + '</select></label>' +
        '<p class="idm-help">파란 점 4개를 신분증의 네 모서리(왼쪽 위부터 시계 방향)에 맞추면 반듯하게 펴집니다. 사진이 옆으로 누웠다면 먼저 회전하세요.</p>' +
        '<div class="idm-canvas-wrap"><canvas class="idm-canvas" data-ref="acanvas"></canvas></div>' +
        '<div class="idm-row">' +
          '<button type="button" class="idm-btn" data-act="rotate">↻ 90° 회전</button>' +
          '<button type="button" class="idm-btn" data-act="skip">보정 없이 진행</button>' +
          '<button type="button" class="idm-btn idm-btn-primary" data-act="apply">보정 적용 →</button>' +
        '</div>' +
        '<div class="idm-row"><button type="button" class="idm-btn idm-btn-ghost" data-act="reset">처음부터 (사진 지우기)</button></div>' +
      '</div>' +
      // 3단계: 가리기 + 워터마크 + 저장
      '<div data-ref="edit" hidden>' +
        '<p class="idm-step">2/2 · 가릴 항목 확인하고 저장</p>' +
        '<fieldset class="idm-box"><legend>가릴 항목</legend><div class="idm-checks" data-ref="checks"></div></fieldset>' +
        '<p class="idm-warn">자동 상자는 견본 기준의 대략적인 위치입니다. 글자가 완전히 덮였는지 꼭 확인하고, 필요하면 상자를 옮기세요.</p>' +
        '<p class="idm-help">빈 곳을 끌면 상자 추가 · 상자를 끌면 이동 · 빨간 모서리를 끌면 크기 조절</p>' +
        '<div class="idm-canvas-wrap"><canvas class="idm-canvas" data-ref="canvas"></canvas></div>' +
        '<div class="idm-row">' +
          '<button type="button" class="idm-btn" data-act="del" disabled>선택 상자 삭제</button>' +
          '<button type="button" class="idm-btn" data-act="clear">상자 모두 지우기</button>' +
        '</div>' +
        '<fieldset class="idm-box"><legend>워터마크</legend>' +
          '<label class="idm-check"><input type="checkbox" data-ref="wmOn" checked> 워터마크 넣기 (도용 방지)</label>' +
          '<input type="text" class="idm-input" data-ref="wmText" maxlength="40" placeholder="예: ○○은행 계좌개설 제출용">' +
          '<div class="idm-ranges">' +
            '<label>진하기 <input type="range" min="10" max="70" value="28" data-ref="wmOp"></label>' +
            '<label>글자 크기 <input type="range" min="3" max="12" value="6" data-ref="wmSize"></label>' +
          '</div>' +
        '</fieldset>' +
        '<p class="idm-summary" data-ref="summary"></p>' +
        '<div class="idm-row">' +
          '<select class="idm-select" data-ref="fmt">' +
            '<option value="jpg">JPG로 저장</option>' +
            '<option value="png">PNG로 저장</option>' +
            '<option value="pdf">PDF로 저장 (A4, 실제 크기)</option>' +
          '</select>' +
          '<button type="button" class="idm-btn idm-btn-primary" data-act="save">가림 파일 저장</button>' +
        '</div>' +
        '<div class="idm-row">' +
          '<button type="button" class="idm-btn idm-btn-ghost" data-act="back">← 모서리 다시 맞추기</button>' +
          '<button type="button" class="idm-btn idm-btn-ghost" data-act="reset">처음부터 (사진 지우기)</button>' +
        '</div>' +
        '<p class="idm-status" data-ref="status" role="status" aria-live="polite"></p>' +
      '</div>' +
    '</div>';

  function $(n) { return root.querySelector('[data-ref="' + n + '"]'); }
  function acts(n) { return root.querySelectorAll('[data-act="' + n + '"]'); }
  function on(n, fn) { var l = acts(n); for (var i = 0; i < l.length; i++) l[i].addEventListener('click', fn); }

  var drop = $('drop'), adjust = $('adjust'), edit = $('edit'), fileInput = $('file');
  var typeSel = $('type'), acanvas = $('acanvas'), actx = acanvas.getContext('2d');
  var canvas = $('canvas'), ctx = canvas.getContext('2d');
  var checks = $('checks'), summaryEl = $('summary'), statusEl = $('status'), fmtSel = $('fmt');
  var wmOn = $('wmOn'), wmText = $('wmText'), wmOp = $('wmOp'), wmSize = $('wmSize');
  var delBtn = acts('del')[0];

  var src = null;     // 원본(축소본)
  var quad = null;    // 모서리 4점 [TL, TR, BR, BL] (원본 좌표)
  var cornerDrag = -1;
  var base = null;    // 편집 대상 (보정 결과 또는 원본)
  var rectified = false;
  var boxes = [];     // {x,y,w,h,key}
  var sel = -1, drag = null;

  var today = (function () {
    var d = new Date();
    return d.getFullYear() + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + ('0' + d.getDate()).slice(-2);
  })();
  wmText.value = '제출용 · ' + today;

  function status(m) { statusEl.textContent = m || ''; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function copy(b) { return { x: b.x, y: b.y, w: b.w, h: b.h }; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function tpl() { return T[typeSel.value] || T.custom; }
  function show(step) {
    drop.hidden = step !== 'drop';
    adjust.hidden = step !== 'adjust';
    edit.hidden = step !== 'edit';
  }
  function kOf(cv) { var w = cv.getBoundingClientRect().width; return w > 0 ? cv.width / w : 1; }
  function toImg(cv, e) {
    var r = cv.getBoundingClientRect(), k = cv.width / r.width;
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k, k: k };
  }
  function capture(cv, e) { try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ } }

  // ================= 1. 불러오기 =================
  function loadFile(file) {
    if (!file) return;
    if (file.type && !/^image\//.test(file.type)) { alert('이미지 파일만 사용할 수 있습니다.'); return; }
    var url = URL.createObjectURL(file), im = new Image();
    im.onload = function () {
      var s = Math.min(1, MAX_SIDE / Math.max(im.naturalWidth, im.naturalHeight));
      var c = document.createElement('canvas');
      c.width = Math.round(im.naturalWidth * s);
      c.height = Math.round(im.naturalHeight * s);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      im.src = '';
      src = c;
      // 세로로 긴 사진은 모바일 캡처일 가능성이 높음
      if (c.height > c.width * 1.3 && T.mobile) typeSel.value = 'mobile';
      startAdjust();
    };
    im.onerror = function () {
      URL.revokeObjectURL(url);
      alert('이 사진 형식은 열 수 없습니다. HEIC 사진이라면 JPG로 바꿔서 올려주세요.');
    };
    im.src = url;
  }

  fileInput.addEventListener('change', function () { loadFile(fileInput.files && fileInput.files[0]); });
  drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('idm-drop-on'); });
  drop.addEventListener('dragleave', function () { drop.classList.remove('idm-drop-on'); });
  drop.addEventListener('drop', function (e) {
    e.preventDefault();
    drop.classList.remove('idm-drop-on');
    loadFile(e.dataTransfer.files && e.dataTransfer.files[0]);
  });

  // ================= 2. 기울기 보정 =================
  function defaultQuad() {
    var w = src.width, h = src.height, mx = w * 0.06, my = h * 0.06;
    return [{ x: mx, y: my }, { x: w - mx, y: my }, { x: w - mx, y: h - my }, { x: mx, y: h - my }];
  }

  function startAdjust() {
    if (!quad) quad = defaultQuad();
    acanvas.width = src.width;
    acanvas.height = src.height;
    show('adjust');
    renderAdjust();
  }

  function renderAdjust() {
    if (!src) return;
    var k = kOf(acanvas);
    actx.drawImage(src, 0, 0);
    // 바깥쪽 어둡게
    actx.save();
    actx.fillStyle = 'rgba(0,0,0,0.45)';
    actx.beginPath();
    actx.rect(0, 0, src.width, src.height);
    actx.moveTo(quad[0].x, quad[0].y);
    for (var i = 3; i >= 1; i--) actx.lineTo(quad[i].x, quad[i].y);
    actx.closePath();
    actx.fill('evenodd');
    actx.restore();
    // 테두리와 모서리 점
    actx.save();
    actx.lineWidth = 2.5 * k;
    actx.strokeStyle = '#2563eb';
    actx.beginPath();
    actx.moveTo(quad[0].x, quad[0].y);
    for (var j = 1; j < 4; j++) actx.lineTo(quad[j].x, quad[j].y);
    actx.closePath();
    actx.stroke();
    for (var n = 0; n < 4; n++) {
      actx.beginPath();
      actx.arc(quad[n].x, quad[n].y, CORNER_R * k, 0, Math.PI * 2);
      actx.fillStyle = n === cornerDrag ? '#ff3b30' : '#2563eb';
      actx.fill();
      actx.lineWidth = 3 * k;
      actx.strokeStyle = '#fff';
      actx.stroke();
    }
    actx.restore();
  }

  acanvas.addEventListener('pointerdown', function (e) {
    if (!src) return;
    e.preventDefault();
    var p = toImg(acanvas, e), best = -1, bd = CORNER_HIT * p.k;
    for (var i = 0; i < 4; i++) { var d = dist(p, quad[i]); if (d < bd) { bd = d; best = i; } }
    if (best < 0) return;
    cornerDrag = best;
    capture(acanvas, e);
    renderAdjust();
  });
  acanvas.addEventListener('pointermove', function (e) {
    if (cornerDrag < 0) return;
    e.preventDefault();
    var p = toImg(acanvas, e);
    quad[cornerDrag] = { x: clamp(p.x, 0, src.width), y: clamp(p.y, 0, src.height) };
    renderAdjust();
  });
  function endCorner() { if (cornerDrag >= 0) { cornerDrag = -1; renderAdjust(); } }
  acanvas.addEventListener('pointerup', endCorner);
  acanvas.addEventListener('pointercancel', endCorner);

  on('rotate', function () {
    var c = document.createElement('canvas');
    c.width = src.height;
    c.height = src.width;
    var g = c.getContext('2d');
    g.translate(c.width, 0);
    g.rotate(Math.PI / 2);
    g.drawImage(src, 0, 0);
    src.width = src.height = 0;
    src = c;
    quad = defaultQuad();
    startAdjust();
  });

  // 단위 정사각형 → 사각형 투시 변환 (Heckbert)
  function squareToQuad(q) {
    var x0 = q[0].x, y0 = q[0].y, x1 = q[1].x, y1 = q[1].y, x2 = q[2].x, y2 = q[2].y, x3 = q[3].x, y3 = q[3].y;
    var dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
    var dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    var g = 0, h = 0;
    if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
      var det = dx1 * dy2 - dx2 * dy1;
      if (Math.abs(det) < 1e-9) return null;
      g = (dx3 * dy2 - dx2 * dy3) / det;
      h = (dx1 * dy3 - dx3 * dy1) / det;
    }
    return {
      a: x1 - x0 + g * x1, b: x3 - x0 + h * x3, c: x0,
      d: y1 - y0 + g * y1, e: y3 - y0 + h * y3, f: y0, g: g, h: h
    };
  }

  function warp(q, W, H) {
    var m = squareToQuad(q);
    if (!m) return null;
    var sw = src.width, sh = src.height;
    var sd = src.getContext('2d').getImageData(0, 0, sw, sh).data;
    var out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    var oc = out.getContext('2d'), od = oc.createImageData(W, H), o = od.data;
    for (var y = 0; y < H; y++) {
      var v = (y + 0.5) / H;
      for (var x = 0; x < W; x++) {
        var u = (x + 0.5) / W;
        var den = m.g * u + m.h * v + 1;
        var sx = (m.a * u + m.b * v + m.c) / den - 0.5;
        var sy = (m.d * u + m.e * v + m.f) / den - 0.5;
        var ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
        var xa = clamp(ix, 0, sw - 1), xb = clamp(ix + 1, 0, sw - 1);
        var ya = clamp(iy, 0, sh - 1), yb = clamp(iy + 1, 0, sh - 1);
        var p00 = (ya * sw + xa) * 4, p10 = (ya * sw + xb) * 4, p01 = (yb * sw + xa) * 4, p11 = (yb * sw + xb) * 4;
        var w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        var oi = (y * W + x) * 4;
        o[oi] = sd[p00] * w00 + sd[p10] * w10 + sd[p01] * w01 + sd[p11] * w11;
        o[oi + 1] = sd[p00 + 1] * w00 + sd[p10 + 1] * w10 + sd[p01 + 1] * w01 + sd[p11 + 1] * w11;
        o[oi + 2] = sd[p00 + 2] * w00 + sd[p10 + 2] * w10 + sd[p01 + 2] * w01 + sd[p11 + 2] * w11;
        o[oi + 3] = 255;
      }
    }
    oc.putImageData(od, 0, 0);
    return out;
  }

  on('apply', function () {
    var top = dist(quad[0], quad[1]), bot = dist(quad[3], quad[2]);
    var lef = dist(quad[0], quad[3]), rig = dist(quad[1], quad[2]);
    var wq = Math.max(top, bot), hq = Math.max(lef, rig);
    if (wq < 40 || hq < 40) { alert('모서리 점이 너무 가깝습니다. 신분증 네 모서리에 맞춰 주세요.'); return; }
    var t = tpl();
    var W = Math.round(clamp(wq, OUT_MIN, OUT_MAX));
    var H = Math.round(t.aspect ? W / t.aspect : W * hq / wq);
    var out = warp(quad, W, H);
    if (!out) { alert('모서리 모양이 올바르지 않습니다. 점이 서로 교차하지 않게 맞춰 주세요.'); return; }
    startEdit(out, true);
  });

  on('skip', function () {
    var c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    c.getContext('2d').drawImage(src, 0, 0);
    startEdit(c, false);
  });

  // ================= 3. 가리기 =================
  function startEdit(img, isRect) {
    if (base) base.width = base.height = 0;
    base = img;
    rectified = isRect;
    canvas.width = img.width;
    canvas.height = img.height;
    boxes = [];
    sel = -1;
    buildChecks();
    show('edit');
    status(isRect ? '' : '보정 없이 진행하면 자동 상자 위치가 많이 어긋날 수 있습니다. 상자를 직접 맞춰 주세요.');
    if (!tpl().fields.some(function (f) { return f.on; }) && tpl().fields.length) {
      status('이 신분증에는 기본으로 가릴 주민번호가 없습니다. 필요한 항목을 체크하세요.');
    }
    update();
  }

  function buildChecks() {
    var f = tpl().fields, html = '';
    for (var i = 0; i < f.length; i++) {
      html += '<label class="idm-check"><input type="checkbox" data-key="' + f[i].key + '"' +
        (f[i].on ? ' checked' : '') + '> ' + f[i].label + '</label>';
      if (f[i].on) addFieldBox(f[i]);
    }
    checks.innerHTML = html || '<p class="idm-help">자동 항목이 없습니다. 사진 위를 끌어서 직접 가리세요.</p>';
  }

  function addFieldBox(f) {
    var W = base.width, H = base.height, r = f.rect;
    boxes.push({ x: r[0] * W, y: r[1] * H, w: r[2] * W, h: r[3] * H, key: f.key });
  }

  checks.addEventListener('change', function (e) {
    var key = e.target.getAttribute('data-key');
    if (!key) return;
    if (e.target.checked) {
      var f = tpl().fields.filter(function (x) { return x.key === key; })[0];
      if (f) addFieldBox(f);
    } else {
      boxes = boxes.filter(function (b) { return b.key !== key; });
    }
    sel = -1;
    update();
  });

  function drawWatermark(c, W, H) {
    var text = (wmText.value || '').trim();
    if (!wmOn.checked || !text) return;
    var fs = Math.max(12, Math.round(Math.min(W, H) * (+wmSize.value) / 100));
    c.save();
    c.globalAlpha = (+wmOp.value) / 100;
    c.fillStyle = '#3a3a3a';
    c.font = '700 ' + fs + 'px "Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.translate(W / 2, H / 2);
    c.rotate(-Math.PI / 7);
    var step = c.measureText(text).width + fs * 2.2, line = fs * 3.2, R = Math.hypot(W, H) / 2 + step;
    for (var y = -R, row = 0; y <= R; y += line, row++) {
      for (var x = -R + (row % 2 ? step / 2 : 0); x <= R; x += step) c.fillText(text, x, y);
    }
    c.restore();
  }

  function composite(c, W, H) {
    c.drawImage(base, 0, 0);
    c.fillStyle = '#000';
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i], x0 = Math.floor(b.x), y0 = Math.floor(b.y);
      c.fillRect(x0, y0, Math.ceil(b.x + b.w) - x0, Math.ceil(b.y + b.h) - y0);
    }
    drawWatermark(c, W, H);
  }

  function render() {
    if (!base) return;
    var k = kOf(canvas);
    composite(ctx, canvas.width, canvas.height);
    if (sel >= 0 && boxes[sel]) {
      var s = boxes[sel], h = HANDLE * k;
      ctx.save();
      ctx.lineWidth = 2 * k;
      ctx.strokeStyle = '#ff3b30';
      ctx.setLineDash([6 * k, 4 * k]);
      ctx.strokeRect(s.x, s.y, s.w, s.h);
      ctx.setLineDash([]);
      ctx.fillStyle = '#ff3b30';
      ctx.fillRect(s.x + s.w - h / 2, s.y + s.h - h / 2, h, h);
      ctx.restore();
    }
  }

  function updateSummary() {
    var labels = [], manual = 0, seen = {};
    var f = tpl().fields;
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      if (!b.key) { manual++; continue; }
      if (seen[b.key]) continue;
      seen[b.key] = 1;
      for (var j = 0; j < f.length; j++) if (f[j].key === b.key) labels.push(f[j].label);
    }
    if (manual) labels.push('직접 그린 상자 ' + manual + '개');
    summaryEl.textContent = labels.length ? '가려지는 항목: ' + labels.join(', ') : '아직 가린 항목이 없습니다.';
    summaryEl.className = 'idm-summary' + (labels.length ? '' : ' idm-summary-empty');
  }

  function update() {
    delBtn.disabled = sel < 0;
    updateSummary();
    render();
  }

  function hitTest(x, y) {
    for (var i = boxes.length - 1; i >= 0; i--) {
      var b = boxes[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return i;
    }
    return -1;
  }
  function onHandle(p) {
    if (sel < 0) return false;
    var b = boxes[sel], h = HANDLE * p.k;
    return Math.abs(p.x - (b.x + b.w)) <= h && Math.abs(p.y - (b.y + b.h)) <= h;
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (!base) return;
    e.preventDefault();
    var p = toImg(canvas, e);
    capture(canvas, e);
    if (onHandle(p)) {
      drag = { mode: 'resize', sx: p.x, sy: p.y, o: copy(boxes[sel]) };
    } else {
      var hit = hitTest(p.x, p.y);
      if (hit >= 0) {
        sel = hit;
        drag = { mode: 'move', sx: p.x, sy: p.y, o: copy(boxes[hit]) };
      } else {
        boxes.push({ x: p.x, y: p.y, w: 0, h: 0, key: null });
        sel = boxes.length - 1;
        drag = { mode: 'draw', sx: p.x, sy: p.y };
      }
    }
    update();
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!drag) return;
    e.preventDefault();
    var p = toImg(canvas, e), W = canvas.width, H = canvas.height;
    var b = boxes[sel], dx = p.x - drag.sx, dy = p.y - drag.sy;
    var x = clamp(p.x, 0, W), y = clamp(p.y, 0, H);
    if (drag.mode === 'draw') {
      b.x = Math.min(drag.sx, x); b.y = Math.min(drag.sy, y);
      b.w = Math.abs(x - drag.sx); b.h = Math.abs(y - drag.sy);
    } else if (drag.mode === 'move') {
      b.x = clamp(drag.o.x + dx, 0, W - b.w);
      b.y = clamp(drag.o.y + dy, 0, H - b.h);
    } else {
      var m = MIN_BOX * p.k;
      b.w = clamp(drag.o.w + dx, m, W - b.x);
      b.h = clamp(drag.o.h + dy, m, H - b.y);
    }
    render();
  });

  function endDrag() {
    if (!drag) return;
    if (drag.mode === 'draw') {
      var b = boxes[sel], m = MIN_BOX * kOf(canvas);
      if (b.w < m || b.h < m) { boxes.splice(sel, 1); sel = -1; }
    }
    drag = null;
    update();
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  function syncCheckbox(key) {
    if (!key || boxes.some(function (b) { return b.key === key; })) return;
    var cb = checks.querySelector('[data-key="' + key + '"]');
    if (cb) cb.checked = false;
  }

  function removeSelected() {
    if (sel < 0) return;
    var key = boxes[sel].key;
    boxes.splice(sel, 1);
    sel = -1;
    syncCheckbox(key);
    update();
  }
  delBtn.addEventListener('click', removeSelected);

  on('clear', function () {
    boxes = [];
    sel = -1;
    var cbs = checks.querySelectorAll('input[type=checkbox]');
    for (var i = 0; i < cbs.length; i++) cbs[i].checked = false;
    update();
  });

  document.addEventListener('keydown', function (e) {
    if (!base || sel < 0 || edit.hidden) return;
    if (/INPUT|SELECT|TEXTAREA/.test((e.target && e.target.tagName) || '')) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); }
  });

  [wmOn, wmText, wmOp, wmSize].forEach(function (el) {
    el.addEventListener('input', render);
    el.addEventListener('change', render);
  });
  window.addEventListener('resize', function () { renderAdjust(); render(); });

  // ================= 4. 저장 =================
  function stamp() {
    var d = new Date();
    return d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) +
      '_' + ('0' + d.getHours()).slice(-2) + ('0' + d.getMinutes()).slice(-2);
  }

  function download(blob, name) {
    var u = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = u;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 2000);
  }

  // JPEG 한 장을 A4 PDF로 감싸기 (외부 라이브러리 없이)
  function makePdf(jpg, pxW, pxH, mmW, mmH) {
    var PT = 72 / 25.4, pw = 595.28, ph = 841.89;
    var dw = mmW * PT, dh = mmH * PT, x = (pw - dw) / 2, y = ph - 56.7 - dh;
    var enc = new TextEncoder(), parts = [], offs = [], len = 0;
    function put(s) { var b = typeof s === 'string' ? enc.encode(s) : s; parts.push(b); len += b.length; }
    function obj(n) { offs[n] = len; put(n + ' 0 obj\n'); }
    var content = 'q ' + dw.toFixed(2) + ' 0 0 ' + dh.toFixed(2) + ' ' + x.toFixed(2) + ' ' + y.toFixed(2) + ' cm /Im0 Do Q';
    put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    obj(1); put('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    obj(2); put('<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
    obj(3); put('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pw + ' ' + ph + '] ' +
      '/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n');
    obj(4); put('<< /Type /XObject /Subtype /Image /Width ' + pxW + ' /Height ' + pxH +
      ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpg.length + ' >>\nstream\n');
    put(jpg); put('\nendstream\nendobj\n');
    obj(5); put('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream\nendobj\n');
    var xref = len, s = 'xref\n0 6\n0000000000 65535 f \n';
    for (var i = 1; i <= 5; i++) s += ('000000000' + offs[i]).slice(-10) + ' 00000 n \n';
    put(s + 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    return new Blob(parts, { type: 'application/pdf' });
  }

  function pdfSize(W, H) {
    var t = tpl();
    if (rectified && t.mm) return t.mm;           // 실물 크기로 인쇄
    var maxW = 170, maxH = 240;                    // 그 외에는 A4 여백 안에 맞춤
    if (typeSel.value === 'mobile') maxH = 160;
    var s = Math.min(maxW / W, maxH / H);
    return [W * s, H * s];
  }

  on('save', function () {
    if (!base) return;
    if (!boxes.length && !window.confirm('가린 상자가 없습니다. 그대로 저장할까요?')) return;
    var fmt = fmtSel.value, W = base.width, H = base.height;
    var out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    var c = out.getContext('2d');
    c.fillStyle = '#fff';
    c.fillRect(0, 0, W, H);
    composite(c, W, H);
    var mime = fmt === 'png' ? 'image/png' : 'image/jpeg';
    out.toBlob(function (blob) {
      out.width = out.height = 0;
      if (!blob) { status('저장에 실패했습니다. 다른 형식으로 다시 시도해 주세요.'); return; }
      var name = '신분증_가림_' + stamp();
      if (fmt !== 'pdf') {
        download(blob, name + '.' + fmt);
        status('저장했습니다. 촬영 위치 등 사진 정보(EXIF)는 들어 있지 않습니다.');
        return;
      }
      blob.arrayBuffer().then(function (buf) {
        var mm = pdfSize(W, H);
        download(makePdf(new Uint8Array(buf), W, H, mm[0], mm[1]), name + '.pdf');
        status(rectified && tpl().mm
          ? 'PDF로 저장했습니다. 100% 크기로 인쇄하면 실물과 같은 크기로 나옵니다.'
          : 'PDF로 저장했습니다.');
      });
    }, mime, 0.92);
  });

  on('back', function () {
    if (boxes.some(function (b) { return !b.key; }) &&
        !window.confirm('직접 그린 상자는 지워집니다. 모서리를 다시 맞출까요?')) return;
    if (base) base.width = base.height = 0;
    base = null;
    boxes = [];
    sel = -1;
    startAdjust();
  });

  typeSel.addEventListener('change', renderAdjust);

  on('reset', function () {
    [src, base].forEach(function (c) { if (c) c.width = c.height = 0; });
    src = base = quad = null;
    boxes = [];
    sel = -1;
    drag = null;
    cornerDrag = -1;
    canvas.width = canvas.height = acanvas.width = acanvas.height = 0;
    fileInput.value = '';
    status('');
    show('drop');
  });
})();