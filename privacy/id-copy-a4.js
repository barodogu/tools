/*!
 * 착착도구 · 신분증 앞뒷면 A4 한 장 모아찍기 (실물 크기)
 * https://barodogu.blogspot.com
 * 사용법: 글에 <div id="bd-idcopy"></div> 를 넣고 이 스크립트를 불러오세요.
 * 모든 처리는 브라우저 안에서만 이뤄지며, 사진은 어디로도 전송되지 않아요.
 * 버전: 1.1 (아이폰·삼성 인터넷 저장/공유, 카메라 바로 찍기)
 */
(function () {
  'use strict';
  var ROOT_ID = 'bd-idcopy';
  var CARD_W_MM = 85.6, CARD_H_MM = 53.98;     // ISO/IEC 7810 ID-1 (주민등록증·운전면허증)
  var A4_W_MM = 210, A4_H_MM = 297;
  var CARD_TOP_MM = 30, CARD_GAP_MM = 15;       // 복사기 '신분증 복사' 모드와 비슷한 배치
  var CARD_DPI = 300, PAGE_DPI = 200;
  var MAX_SRC = 2400;                           // 아이폰 메모리 보호: 원본 긴 변 최대 픽셀
  var mm2px = function (mm, dpi) { return mm / 25.4 * dpi; };
  var CARD_PX_W = Math.round(mm2px(CARD_W_MM, CARD_DPI)); // 1011
  var CARD_PX_H = Math.round(mm2px(CARD_H_MM, CARD_DPI)); // 638
 
  /* ---------------- 스타일 ---------------- */
  var CSS = [
    '.bdic{box-sizing:border-box;max-width:680px;margin:16px auto;padding:16px;border:1px solid #dbe4f0;border-radius:16px;background:#fff;color:#1f2937;font-size:16px;line-height:1.55;-webkit-text-size-adjust:100%}',
    '.bdic *,.bdic *:before,.bdic *:after{box-sizing:border-box}',
    '.bdic h3.bdic-t{margin:0 0 4px;font-size:19px;color:#1d4ed8;border:0;padding:0}',
    '.bdic .bdic-sub{margin:0 0 12px;font-size:14px;color:#4b5563}',
    '.bdic .bdic-lock{display:inline-block;margin:0 0 12px;padding:4px 10px;border-radius:999px;background:#ecfdf5;color:#047857;font-size:13px;font-weight:700}',
    '.bdic button{font:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}',
    '.bdic .bdic-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:48px;padding:10px 16px;border-radius:12px;border:1px solid #cbd5e1;background:#f8fafc;color:#1f2937;font-weight:700;font-size:15px}',
    '.bdic .bdic-btn:active{transform:scale(.98)}',
    '.bdic .bdic-btn[disabled]{opacity:.45;cursor:not-allowed}',
    '.bdic .bdic-pri{background:#2563eb;border-color:#2563eb;color:#fff}',
    '.bdic .bdic-grn{background:#059669;border-color:#059669;color:#fff}',
    '.bdic .bdic-row{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}',
    '.bdic .bdic-row>.bdic-btn{flex:1 1 140px}',
    '.bdic .bdic-slots{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}',
    '@media (max-width:420px){.bdic .bdic-slots{grid-template-columns:1fr}}',
    '.bdic .bdic-slot{border:2px dashed #93c5fd;border-radius:14px;padding:10px;background:#f8fbff;text-align:center;min-width:0}',
    '.bdic .bdic-slot.ok{border-style:solid;border-color:#34d399;background:#f0fdf4}',
    '.bdic .bdic-slot b{display:block;margin-bottom:6px;color:#1e3a8a}',
    '.bdic .bdic-slot img{display:block;width:100%;height:auto;border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,.18);margin:4px 0 8px}',
    '.bdic .bdic-slot .bdic-btn{width:100%;margin-top:6px}',
    '.bdic .bdic-ed{margin:12px 0;padding:10px;border-radius:14px;background:#0f172a;color:#e2e8f0}',
    '.bdic .bdic-ed p{margin:2px 4px 8px;font-size:14px}',
    '.bdic .bdic-stage{position:relative;width:100%;touch-action:none;user-select:none;-webkit-user-select:none}',
    '.bdic .bdic-stage canvas.bdic-cv{display:block;width:100%;height:auto;border-radius:8px}',
    '.bdic .bdic-h{position:absolute;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;border:3px solid #fff;background:rgba(37,99,235,.85);box-shadow:0 0 0 2px #2563eb,0 2px 6px rgba(0,0,0,.4);pointer-events:none}',
    '.bdic .bdic-h.on{background:#f59e0b;box-shadow:0 0 0 2px #f59e0b,0 2px 6px rgba(0,0,0,.4)}',
    '.bdic .bdic-loupe{position:absolute;z-index:3;width:120px;height:120px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.5);pointer-events:none;display:none;background:#000}',
    '.bdic .bdic-ed .bdic-btn{background:#1e293b;border-color:#334155;color:#f1f5f9}',
    '.bdic .bdic-ed .bdic-btn.bdic-pri{background:#2563eb;border-color:#2563eb}',
    '.bdic .bdic-prev{margin:12px 0 4px;text-align:center}',
    '.bdic .bdic-prev canvas{width:100%;max-width:360px;height:auto;border:1px solid #cbd5e1;box-shadow:0 2px 10px rgba(0,0,0,.12);background:#fff}',
    '.bdic .bdic-cap{font-size:13px;color:#6b7280;text-align:center;margin:4px 0 0}',
    '.bdic .bdic-msg{margin:10px 0;padding:10px 12px;border-radius:10px;font-size:14px}',
    '.bdic .bdic-msg.err{background:#fef2f2;border-left:4px solid #dc2626;color:#991b1b}',
    '.bdic .bdic-msg.info{background:#eff6ff;border-left:4px solid #2563eb;color:#1e3a8a}',
    '.bdic .bdic-msg.ok{background:#ecfdf5;border-left:4px solid #059669;color:#065f46}',
    '.bdic .bdic-tip{font-size:13px;color:#92400e;background:#fffbeb;border-radius:10px;padding:8px 10px;margin:8px 0}',
    '.bdic input[type=file]{display:none}',
    '.bdic .bdic-mode{display:flex;gap:6px;margin:4px 0 8px;padding:4px;border-radius:14px;background:#eef2f7}',
    '.bdic .bdic-mode button{flex:1;min-height:44px;border:0;border-radius:10px;background:transparent;color:#475569;font-weight:700;font-size:14px}',
    '.bdic .bdic-mode button.on{background:#fff;color:#1d4ed8;box-shadow:0 1px 4px rgba(0,0,0,.12)}',
    '.bdic .bdic-warn{font-size:13px;color:#991b1b;background:#fef2f2;border-radius:10px;padding:8px 10px;margin:6px 0}',
    '.bdic .bdic-sb{display:grid;grid-template-columns:1fr 1fr;gap:6px}',
    '.bdic .bdic-sb .bdic-btn{margin:0;min-height:44px;padding:6px 4px;font-size:13px}',
    '.bdic .bdic-opt{margin:12px 0;padding:12px;border:1px solid #dbe4f0;border-radius:14px;background:#f8fafc}',
    '.bdic .bdic-opt h4{margin:0 0 8px;font-size:15px;color:#1e3a8a;border:0;padding:0}',
    '.bdic .bdic-chk{display:flex;align-items:center;gap:10px;min-height:44px;font-weight:700;font-size:15px;cursor:pointer}',
    '.bdic .bdic-chk input{width:22px;height:22px;flex:none;accent-color:#2563eb}',
    '.bdic .bdic-in{display:block;width:100%;min-height:46px;margin:4px 0 8px;padding:8px 12px;border:1px solid #cbd5e1;border-radius:10px;font:inherit;font-size:16px;background:#fff;color:#111}',
    '.bdic .bdic-seg{display:flex;gap:6px;margin:6px 0}',
    '.bdic .bdic-seg button{flex:1;min-height:44px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-weight:700;color:#475569}',
    '.bdic .bdic-seg button.on{background:#2563eb;border-color:#2563eb;color:#fff}',
    '.bdic .bdic-mbox{position:absolute;background:rgba(0,0,0,.92);outline:2px dashed #fbbf24;touch-action:none}',
    '.bdic .bdic-mbox.sel{outline:3px solid #f59e0b}',
    '.bdic .bdic-mbox i{position:absolute;right:-14px;bottom:-14px;width:28px;height:28px;border-radius:50%;background:#f59e0b;border:3px solid #fff}'
  ].join('\n');
 
  /* ---------------- 공통 유틸 ---------------- */
  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]);
    }
    if (html != null) e.innerHTML = html;
    return e;
  }
  function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function today() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
  }
 
  /* ---- 호모그래피(원근 변환): 4점 → 4점 ---- */
  function solve(A, b) { // 가우스 소거 (8x8)
    var n = b.length, i, j, k;
    for (i = 0; i < n; i++) {
      var max = i;
      for (j = i + 1; j < n; j++) if (Math.abs(A[j][i]) > Math.abs(A[max][i])) max = j;
      var t = A[i]; A[i] = A[max]; A[max] = t; var tb = b[i]; b[i] = b[max]; b[max] = tb;
      if (Math.abs(A[i][i]) < 1e-12) return null;
      for (j = i + 1; j < n; j++) {
        var f = A[j][i] / A[i][i];
        for (k = i; k < n; k++) A[j][k] -= f * A[i][k];
        b[j] -= f * b[i];
      }
    }
    var x = new Array(n);
    for (i = n - 1; i >= 0; i--) {
      var s = b[i];
      for (j = i + 1; j < n; j++) s -= A[i][j] * x[j];
      x[i] = s / A[i][i];
    }
    return x;
  }
  function homography(from, to) { // from[i]=[x,y] → to[i]
    var A = [], b = [];
    for (var i = 0; i < 4; i++) {
      var x = from[i][0], y = from[i][1], u = to[i][0], v = to[i][1];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    var h = solve(A, b);
    return h ? h.concat([1]) : null;
  }
  // dst 영역의 각 픽셀을 H(dst→src)로 역매핑해서 bilinear 샘플링
  function warpInto(dstData, dw, dh, srcData, sw, sh, H, bx0, by0, bx1, by1) {
    var d = dstData.data, s = srcData.data;
    bx0 = Math.max(0, bx0 | 0); by0 = Math.max(0, by0 | 0);
    bx1 = Math.min(dw, Math.ceil(bx1)); by1 = Math.min(dh, Math.ceil(by1));
    for (var y = by0; y < by1; y++) {
      for (var x = bx0; x < bx1; x++) {
        var px = x + 0.5, py = y + 0.5;
        var w = H[6] * px + H[7] * py + H[8];
        var u = (H[0] * px + H[1] * py + H[2]) / w - 0.5;
        var v = (H[3] * px + H[4] * py + H[5]) / w - 0.5;
        if (u < -0.5 || v < -0.5 || u > sw - 0.5 || v > sh - 0.5) continue;
        var x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
        var x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1);
        if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0;
        var i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4, i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
        var o = (y * dw + x) * 4;
        for (var c = 0; c < 3; c++) {
          var top = s[i00 + c] + (s[i10 + c] - s[i00 + c]) * fx;
          var bot = s[i01 + c] + (s[i11 + c] - s[i01 + c]) * fx;
          d[o + c] = top + (bot - top) * fy;
        }
        d[o + 3] = 255;
      }
    }
  }
  function orderCorners(pts) { // 시계방향 TL,TR,BR,BL 로 정렬
    var cx = 0, cy = 0;
    pts.forEach(function (p) { cx += p[0] / 4; cy += p[1] / 4; });
    var s = pts.slice().sort(function (a, b) {
      return Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx);
    });
    var k = 0, best = Infinity;
    s.forEach(function (p, i) { if (p[0] + p[1] < best) { best = p[0] + p[1]; k = i; } });
    return s.slice(k).concat(s.slice(0, k));
  }
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function quadArea(q) {
    var a = 0;
    for (var i = 0; i < 4; i++) { var p = q[i], n = q[(i + 1) % 4]; a += p[0] * n[1] - n[0] * p[1]; }
    return Math.abs(a) / 2;
  }
 
  /* ---- 최소 PDF 생성기 (라이브러리 없음, JPEG 한 장을 A4에 꽉 채움) ---- */
  function makePdf(jpg, pxW, pxH) {
    var W = (A4_W_MM / 25.4 * 72).toFixed(2), H = (A4_H_MM / 25.4 * 72).toFixed(2);
    var enc = function (s) { var a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 255; return a; };
    var parts = [], offs = [], len = 0;
    var push = function (u8) { parts.push(u8); len += u8.length; };
    var content = 'q ' + W + ' 0 0 ' + H + ' 0 0 cm /Im0 Do Q';
    push(enc('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
    var objs = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>',
      null,
      '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream'
    ];
    for (var i = 0; i < objs.length; i++) {
      offs.push(len);
      if (i === 3) {
        push(enc('4 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + pxW + ' /Height ' + pxH +
          ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpg.length + ' >>\nstream\n'));
        push(jpg);
        push(enc('\nendstream\nendobj\n'));
      } else push(enc((i + 1) + ' 0 obj\n' + objs[i] + '\nendobj\n'));
    }
    var xref = len, x = 'xref\n0 6\n0000000000 65535 f \n';
    offs.forEach(function (o) { x += ('000000000' + o).slice(-10) + ' 00000 n \n'; });
    x += 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
    push(enc(x));
    return new Blob(parts, { type: 'application/pdf' });
  }
  // JPEG의 JFIF 해상도 정보를 dpi로 바꿔서 '실제 크기' 인쇄가 맞게
  function setJpegDpi(u8, dpi) {
    if (u8[2] === 0xFF && u8[3] === 0xE0 && u8[6] === 0x4A && u8[7] === 0x46 && u8[8] === 0x49 && u8[9] === 0x46) {
      u8[13] = 1; u8[14] = dpi >> 8; u8[15] = dpi & 255; u8[16] = dpi >> 8; u8[17] = dpi & 255;
    }
    return u8;
  }
  function download(blob, name) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }
 
  /* ---- 모서리 자동 찾기 (가벼운 방식: 배경색과 다른 가장 큰 덩어리의 꼭짓점) ---- */
  function autoQuad(src, rectOnly) {
    try {
      var S = 320, k = S / Math.max(src.width, src.height);
      var w = Math.max(8, Math.round(src.width * k)), h = Math.max(8, Math.round(src.height * k));
      var c = canvas(w, h), g = c.getContext('2d');
      g.drawImage(src, 0, 0, w, h);
      var d = g.getImageData(0, 0, w, h).data, n = w * h, i, x, y;
      // 1) 가장자리 픽셀의 중앙값 = 배경색
      var rs = [], gs = [], bs = [];
      var addB = function (xx, yy) { var o = (yy * w + xx) * 4; rs.push(d[o]); gs.push(d[o + 1]); bs.push(d[o + 2]); };
      for (x = 0; x < w; x += 2) { addB(x, 1); addB(x, h - 2); }
      for (y = 0; y < h; y += 2) { addB(1, y); addB(w - 2, y); }
      var med = function (a) { a.sort(function (p, q) { return p - q; }); return a[a.length >> 1]; };
      var br = med(rs), bg = med(gs), bb = med(bs);
      // 2) 배경과의 색 차이 → 오츠(Otsu) 자동 문턱값
      var dist = new Float32Array(n), hist = new Array(256).fill(0);
      for (i = 0; i < n; i++) {
        var o = i * 4, dv = Math.min(255, Math.hypot(d[o] - br, d[o + 1] - bg, d[o + 2] - bb));
        dist[i] = dv; hist[dv | 0]++;
      }
      var sum = 0; for (i = 0; i < 256; i++) sum += i * hist[i];
      var sumB = 0, wB = 0, best = 0, th = 40;
      for (i = 0; i < 256; i++) {
        wB += hist[i]; if (!wB) continue; var wF = n - wB; if (!wF) break;
        sumB += i * hist[i]; var mB = sumB / wB, mF = (sum - sumB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
        if (v > best) { best = v; th = i; }
      }
      th = Math.max(th, 18);
      // 3) 가장 큰 연결 덩어리
      var lab = new Int32Array(n), stack = new Int32Array(n), cur = 0, bigL = 0, bigN = 0;
      for (i = 0; i < n; i++) {
        if (lab[i] || dist[i] <= th) continue;
        cur++; var sp = 0, cnt = 0; stack[sp++] = i; lab[i] = cur;
        while (sp) {
          var p = stack[--sp]; cnt++; var px = p % w, py = (p - px) / w;
          if (px > 0 && !lab[p - 1] && dist[p - 1] > th) { lab[p - 1] = cur; stack[sp++] = p - 1; }
          if (px < w - 1 && !lab[p + 1] && dist[p + 1] > th) { lab[p + 1] = cur; stack[sp++] = p + 1; }
          if (py > 0 && !lab[p - w] && dist[p - w] > th) { lab[p - w] = cur; stack[sp++] = p - w; }
          if (py < h - 1 && !lab[p + w] && dist[p + w] > th) { lab[p + w] = cur; stack[sp++] = p + w; }
        }
        if (cnt > bigN) { bigN = cnt; bigL = cur; }
      }
      if (bigN < n * 0.06 || bigN > n * 0.95) return null;
      // 4) 꼭짓점: x+y, x-y 가 가장 크고 작은 점
      var e = [[1e9, 0, 0], [-1e9, 0, 0], [-1e9, 0, 0], [1e9, 0, 0]], minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
      for (i = 0; i < n; i++) {
        if (lab[i] !== bigL) continue;
        x = i % w; y = (i - x) / w;
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (x + y < e[0][0]) e[0] = [x + y, x, y];
        if (x - y > e[1][0]) e[1] = [x - y, x, y];
        if (x + y > e[2][0]) e[2] = [x + y, x, y];
        if (x - y < e[3][0]) e[3] = [x - y, x, y];
      }
      var q = rectOnly
        ? [[minX, minY], [maxX + 1, minY], [maxX + 1, maxY + 1], [minX, maxY + 1]]
        : [[e[0][1], e[0][2]], [e[1][1] + 1, e[1][2]], [e[2][1] + 1, e[2][2] + 1], [e[3][1], e[3][2] + 1]];
      // 5) 신분증 모양인지 검사 (덩어리를 잘 덮고, 가로:세로 비율이 카드에 가까움)
      var qa = quadArea(q);
      if (qa < bigN * 0.85 || qa > bigN * 1.35) return null;
      var ww = (dist2(q[0], q[1]) + dist2(q[3], q[2])) / 2, hh = (dist2(q[0], q[3]) + dist2(q[1], q[2])) / 2;
      var ar = ww / hh; if (ar < 1.25 || ar > 2.1) return null;
      return q.map(function (p) { return [p[0] / k, p[1] / k]; });
    } catch (err) { return null; }
  }
  function dist2(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
 
  /* ---- 예시 데이터 (가짜 신분증 그림을 책상 위에 비스듬히 놓은 사진처럼) ---- */
  function drawSampleCard(back) {
    var c = canvas(CARD_PX_W, CARD_PX_H), g = c.getContext('2d'), W = CARD_PX_W, H = CARD_PX_H;
    var gr = g.createLinearGradient(0, 0, W, H);
    gr.addColorStop(0, back ? '#eef2f7' : '#e8f1fb'); gr.addColorStop(1, back ? '#dde3ea' : '#f6eedf');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(30,64,175,.12)'; g.lineWidth = 2;
    for (var i = -H; i < W; i += 26) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + H, H); g.stroke(); }
    g.fillStyle = '#1f2937'; g.textBaseline = 'alphabetic';
    var F = function (sz, w) { return (w || 700) + ' ' + sz + 'px "Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif'; };
    if (!back) {
      g.font = F(64, 800); g.fillText('주민등록증', 60, 110);
      g.fillStyle = '#dc2626'; g.font = F(34, 800); g.fillText('견본·SAMPLE', 420, 105);
      g.fillStyle = '#1f2937'; g.font = F(46, 700); g.fillText('홍길동 (洪吉童)', 60, 210);
      g.font = F(44, 600); g.fillText('900101-1234567', 60, 290);
      g.font = F(32, 500); g.fillText('서울특별시 종로구 세종대로 000', 60, 380);
      g.fillText('(예시동, 착착아파트)', 60, 430);
      g.font = F(30, 500); g.fillText('2026. 11. 12.', 60, 540);
      g.font = F(34, 700); g.fillText('예시시장', 300, 540);
      // 사진 자리
      g.fillStyle = '#cbd5e1'; g.fillRect(W - 300, 150, 230, 290);
      g.fillStyle = '#94a3b8';
      g.beginPath(); g.arc(W - 185, 250, 60, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(W - 185, 420, 100, 80, 0, Math.PI, 0); g.fill();
    } else {
      g.font = F(40, 800); g.fillText('주소 변경 / 기재 사항 (예시)', 60, 100);
      g.strokeStyle = '#94a3b8'; g.lineWidth = 2;
      for (var r = 0; r < 5; r++) { g.beginPath(); g.moveTo(60, 160 + r * 80); g.lineTo(W - 60, 160 + r * 80); g.stroke(); }
      g.font = F(30, 500);
      g.fillText('2024.03.02  서울특별시 마포구 예시로 12', 70, 145);
      g.fillText('2025.08.15  경기도 성남시 견본길 34', 70, 225);
      g.fillStyle = '#dc2626'; g.font = F(34, 800); g.fillText('견본·SAMPLE', W - 300, H - 50);
    }
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, W - 3, H - 3);
    return c;
  }
  function sampleScene(back) {
    var SW = 1600, SH = 1200, sc = canvas(SW, SH), g = sc.getContext('2d');
    var bg = g.createLinearGradient(0, 0, SW, SH);
    bg.addColorStop(0, '#8b6b4a'); bg.addColorStop(1, '#6b4f35');
    g.fillStyle = bg; g.fillRect(0, 0, SW, SH);
    g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 6;
    for (var y = 20; y < SH; y += 46) { g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(500, y + 18, 1100, y - 18, SW, y + 6); g.stroke(); }
    var quad = back
      ? [[300, 260], [1290, 330], [1240, 960], [250, 870]]
      : [[340, 220], [1330, 300], [1270, 940], [270, 850]];
    g.save(); g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 40; g.shadowOffsetY = 18; g.fillStyle = '#000';
    g.beginPath(); quad.forEach(function (p, i) { i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); }); g.closePath(); g.fill(); g.restore();
    var card = drawSampleCard(back), cd = card.getContext('2d').getImageData(0, 0, CARD_PX_W, CARD_PX_H);
    var H = homography(quad, [[0, 0], [CARD_PX_W, 0], [CARD_PX_W, CARD_PX_H], [0, CARD_PX_H]]);
    var dd = g.getImageData(0, 0, SW, SH);
    warpInto(dd, SW, SH, cd, CARD_PX_W, CARD_PX_H, H, 0, 0, SW, SH);
    g.putImageData(dd, 0, 0);
    // 실제 사진처럼 약간의 조명 얼룩
    var light = g.createRadialGradient(SW * 0.3, SH * 0.2, 50, SW * 0.3, SH * 0.2, 900);
    light.addColorStop(0, 'rgba(255,255,240,.18)'); light.addColorStop(1, 'rgba(0,0,0,.12)');
    g.fillStyle = light; g.fillRect(0, 0, SW, SH);
    return { canvas: sc, quad: quad };
  }
 
  /* ---------------- 메인 ---------------- */
  function Tool(root) {
    this.root = root;
    this.sides = { front: null, back: null }; // {src: canvas, quad, card: canvas}
    this.editing = null;
    this.opt = { mode: 'card', wm: false, wmText: '', gray: false, sharp: false };
    this.build();
  }
  var RRN_BOX = { x: 0.245, y: 0.37, w: 0.24, h: 0.12, rrn: 1 }; // 주민번호 뒷자리 기본 위치(카드 비율)
  Tool.prototype.setMode = function (m) {
    this.opt.mode = m;
    this.box.querySelectorAll('[data-act=mode]').forEach(function (b) { b.className = b.getAttribute('data-mode') === m ? 'on' : ''; });
    this.box.querySelector('[data-mw]').style.display = m === 'mobile' ? 'block' : 'none';
    this.renderSlot('front'); this.renderSlot('back');
  };
  Tool.prototype.setRrn = function (on) {
    var s = this.sides.front;
    if (!s) return;
    s.masks = (s.masks || []).filter(function (m) { return !m.rrn; });
    if (on) s.masks.push(Object.assign({}, RRN_BOX));
    this.refresh('front');
    if (on) this.msg('info', '앞면의 주민번호 뒷자리 위치에 검은 상자를 놓았어요. 위치가 다르면 <b>🙈 가릴 곳 편집</b>에서 옮겨 주세요.');
  };
  Tool.prototype.refresh = function (side) { this.renderSlot(side); this.update(); };
  Tool.prototype.refreshAll = function () { this.renderSlot('front'); this.renderSlot('back'); this.update(); };
  // 색 보정 + 가림 상자를 적용한 카드
  Tool.prototype.processCard = function (side) {
    var s = this.sides[side]; if (!s || !s.card) return null;
    var o = this.opt, c = canvas(CARD_PX_W, CARD_PX_H), g = c.getContext('2d');
    g.drawImage(s.card, 0, 0);
    if (o.gray || o.sharp) {
      var id = g.getImageData(0, 0, CARD_PX_W, CARD_PX_H), d = id.data;
      for (var i = 0; i < d.length; i += 4) {
        var r = d[i], gg = d[i + 1], b = d[i + 2];
        if (o.sharp) { r = (r - 128) * 1.3 + 140; gg = (gg - 128) * 1.3 + 140; b = (b - 128) * 1.3 + 140; }
        if (o.gray) { r = gg = b = 0.299 * r + 0.587 * gg + 0.114 * b; }
        d[i] = r; d[i + 1] = gg; d[i + 2] = b; // Uint8ClampedArray 가 0~255로 자름
      }
      g.putImageData(id, 0, 0);
    }
    g.fillStyle = '#000';
    (s.masks || []).forEach(function (m) { g.fillRect(m.x * CARD_PX_W, m.y * CARD_PX_H, m.w * CARD_PX_W, m.h * CARD_PX_H); });
    return c;
  };
  Tool.prototype.build = function () {
    var self = this, r = this.root;
    if (!document.getElementById('bdic-css')) {
      var st = el('style', { id: 'bdic-css' }); st.textContent = CSS; document.head.appendChild(st);
    }
    r.innerHTML = '';
    var box = el('div', { class: 'bdic' });
    box.innerHTML =
      '<h3 class="bdic-t">🪪 신분증 앞뒷면 A4 한 장 만들기</h3>' +
      '<p class="bdic-sub">주민등록증·운전면허증 사진 2장을 실제 크기(85.6×54mm)로 A4 한 장에 모아 드려요.</p>' +
      '<span class="bdic-lock">🔒 사진은 서버로 전송되지 않아요</span>' +
      '<div class="bdic-mode"><button type="button" class="on" data-act="mode" data-mode="card">📸 실물 신분증 사진</button>' +
      '<button type="button" data-act="mode" data-mode="mobile">📱 모바일 신분증 캡처</button></div>' +
      '<div class="bdic-warn" data-mw style="display:none">⚠️ 모바일 신분증 <b>캡처 화면</b>은 위·변조 우려로 받지 않는 곳이 많아요. 제출처에 먼저 확인하고, 가능하면 실물 신분증 사진을 쓰세요.</div>' +
      '<div class="bdic-row"><button type="button" class="bdic-btn" data-act="sample">🧪 예시로 체험하기</button></div>' +
      '<div class="bdic-slots">' +
        '<div class="bdic-slot" data-side="front"></div>' +
        '<div class="bdic-slot" data-side="back"></div>' +
      '</div>' +
      '<div class="bdic-ed" style="display:none"></div>' +
      '<div class="bdic-msgs"></div>' +
      '<div class="bdic-out" style="display:none">' +
        '<div class="bdic-opt">' +
          '<h4>🛡️ 사본 악용 막기</h4>' +
          '<label class="bdic-chk"><input type="checkbox" data-o="rrn"> 주민번호 뒷자리 가리기 (앞면)</label>' +
          '<label class="bdic-chk"><input type="checkbox" data-o="wm"> 용도 워터마크 넣기</label>' +
          '<input class="bdic-in" type="text" maxlength="30" data-o="wmtext" placeholder="예: ○○은행 계좌개설 제출용" style="display:none">' +
          '<h4 style="margin-top:6px">🎨 색상</h4>' +
          '<div class="bdic-seg"><button type="button" class="on" data-o="color" data-v="0">컬러</button><button type="button" data-o="color" data-v="1">흑백</button></div>' +
          '<label class="bdic-chk"><input type="checkbox" data-o="sharp"> 글씨 선명하게 (어두운 사진 보정)</label>' +
        '</div>' +
        '<div class="bdic-prev"><canvas width="420" height="594"></canvas></div>' +
        '<p class="bdic-cap">A4 미리보기 · 신분증은 실제 크기 85.6 × 54.0mm로 들어가요</p>' +
        '<div class="bdic-row">' +
          '<button type="button" class="bdic-btn bdic-pri" data-act="pdf">📄 PDF 저장</button>' +
          '<button type="button" class="bdic-btn bdic-grn" data-act="jpg">🖼️ JPG 저장</button>' +
          '<button type="button" class="bdic-btn" data-act="print">🖨️ 바로 인쇄</button>' +
          '<button type="button" class="bdic-btn" data-act="share" style="display:none">📤 공유·파일에 저장</button>' +
        '</div>' +
        '<div class="bdic-smsg"></div>' +
        '<div class="bdic-tip">💡 인쇄할 때는 PDF를 열고 <b>배율 「실제 크기(100%)」</b>를 고르세요. 「페이지에 맞춤」을 고르면 신분증이 조금 작게 나와요.</div>' +
      '</div>' +
      '<input type="file" accept="image/*" data-in="pick"><input type="file" accept="image/*" capture="environment" data-in="cam">';
    r.appendChild(box);
    this.box = box;
    this.file = box.querySelector('[data-in=pick]');
    this.cam = box.querySelector('[data-in=cam]');
    this.ed = box.querySelector('.bdic-ed');
    this.msgs = box.querySelector('.bdic-msgs');
    this.smsgs = box.querySelector('.bdic-smsg');
    this.out = box.querySelector('.bdic-out');
    this.prev = box.querySelector('.bdic-prev canvas');
    this.renderSlot('front'); this.renderSlot('back');
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
      var act = b.getAttribute('data-act'), side = b.getAttribute('data-side');
      if (act === 'pick') self.pick(side);
      else if (act === 'cam') { self.pickSide = side; self.cam.click(); }
      else if (act === 'reedit') self.openEditor(side);
      else if (act === 'del') { self.sides[side] = null; self.renderSlot(side); self.update(); }
      else if (act === 'sample') self.loadSample();
      else if (act === 'pdf' || act === 'jpg' || act === 'print' || act === 'share') self.save(act);
      else if (act === 'mask') self.openMaskEditor(side);
      else if (act === 'mode') self.setMode(b.getAttribute('data-mode'));
    });
    // 옵션
    var q = function (sel) { return box.querySelector(sel); };
    q('[data-o=rrn]').addEventListener('change', function () { self.setRrn(this.checked); });
    q('[data-o=wm]').addEventListener('change', function () {
      self.opt.wm = this.checked; q('[data-o=wmtext]').style.display = this.checked ? 'block' : 'none'; self.update();
    });
    q('[data-o=wmtext]').addEventListener('input', function () { self.opt.wmText = this.value; self.update(); });
    q('[data-o=sharp]').addEventListener('change', function () { self.opt.sharp = this.checked; self.refreshAll(); });
    box.querySelectorAll('[data-o=color]').forEach(function (b) {
      b.addEventListener('click', function () {
        self.opt.gray = b.getAttribute('data-v') === '1';
        box.querySelectorAll('[data-o=color]').forEach(function (x) { x.className = x === b ? 'on' : ''; });
        self.refreshAll();
      });
    });
    // 공유 버튼: 파일 공유를 지원하는 폰(아이폰 사파리·안드로이드 크롬)에서만 보이기
    try {
      if (navigator.canShare && navigator.canShare({ files: [new File(['x'], 't.pdf', { type: 'application/pdf' })] }))
        q('[data-act=share]').style.display = '';
    } catch (x) {}
    [this.file, this.cam].forEach(function (inp) {
      inp.addEventListener('change', function () {
        var f = inp.files && inp.files[0]; inp.value = '';
        if (f) self.loadFile(f, self.pickSide);
      });
    });
  };
  Tool.prototype.msg = function (type, html) {
    this.msgs.innerHTML = html ? '<div class="bdic-msg ' + type + '">' + html + '</div>' : '';
    if (this.smsgs) this.smsgs.innerHTML = '';
  };
  // 저장·공유·인쇄 결과는 버튼 바로 아래에 보여 줌
  Tool.prototype.smsg = function (type, html) {
    this.msgs.innerHTML = '';
    this.smsgs.innerHTML = html ? '<div class="bdic-msg ' + type + '">' + html + '</div>' : '';
  };
  Tool.prototype.renderSlot = function (side) {
    var s = this.sides[side], slot = this.box.querySelector('.bdic-slot[data-side=' + side + ']');
    var name = side === 'front' ? '앞면' : (this.opt.mode === 'mobile' ? '뒷면(선택)' : '뒷면');
    slot.className = 'bdic-slot' + (s && s.card ? ' ok' : '');
    if (s && s.card) {
      slot.innerHTML = '<b>' + name + ' ✔</b>';
      var img = new Image(); img.alt = name; img.src = this.processCard(side).toDataURL('image/jpeg', 0.8);
      slot.appendChild(img);
      slot.insertAdjacentHTML('beforeend', '<div class="bdic-sb">' +
        '<button type="button" class="bdic-btn" data-act="reedit" data-side="' + side + '">✂️ 모서리 조정</button>' +
        '<button type="button" class="bdic-btn" data-act="mask" data-side="' + side + '">🙈 가릴 곳 편집</button>' +
        '<button type="button" class="bdic-btn" data-act="pick" data-side="' + side + '">🖼️ 다른 사진</button>' +
        '<button type="button" class="bdic-btn" data-act="del" data-side="' + side + '">🗑️ 빼기</button></div>');
    } else {
      slot.innerHTML = '<b>' + name + '</b>' +
        '<div style="font-size:40px;line-height:1.2">' + (side === 'front' ? (this.opt.mode === 'mobile' ? '📱' : '🪪') : '🔄') + '</div>' +
        (this.opt.mode === 'mobile' ? '' :
          '<button type="button" class="bdic-btn bdic-pri" data-act="cam" data-side="' + side + '">📷 ' + name + ' 바로 찍기</button>') +
        '<button type="button" class="bdic-btn' + (this.opt.mode === 'mobile' ? ' bdic-pri' : '') + '" data-act="pick" data-side="' + side + '">🖼️ ' +
          name.replace('(선택)', '') + ' ' + (this.opt.mode === 'mobile' ? '캡처' : '사진') + ' 고르기</button>';
    }
  };
  Tool.prototype.pick = function (side) { this.pickSide = side; this.file.click(); };
 
  Tool.prototype.loadFile = function (f, side) {
    var self = this;
    var isHeic = /heic|heif/i.test(f.type) || /\.(heic|heif)$/i.test(f.name || '');
    if (f.type && !/^image\//.test(f.type) && !isHeic) {
      return self.msg('err', '<b>사진 파일이 아니에요.</b> 신분증을 찍은 사진(JPG·PNG)을 골라 주세요. PDF라면 먼저 캡처해서 사진으로 바꿔 주세요.');
    }
    self.msg('info', '사진을 불러오는 중이에요…');
    var url = URL.createObjectURL(f), img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      var w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) return self.msg('err', '<b>사진을 읽지 못했어요.</b> 다른 사진으로 다시 시도해 주세요.');
      var k = Math.min(1, MAX_SRC / Math.max(w, h));
      var c = canvas(Math.round(w * k), Math.round(h * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      self.msg('', '');
      var aq = autoQuad(c, self.opt.mode === 'mobile');
      self.sides[side] = { src: c, quad: aq, card: null, masks: [], auto: !!aq };
      if (side === 'front' && self.box.querySelector('[data-o=rrn]').checked) self.sides.front.masks.push(Object.assign({}, RRN_BOX));
      self.openEditor(side);
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      self.msg('err', isHeic
        ? '<b>아이폰 HEIC 사진은 이 브라우저에서 열리지 않아요.</b> 아이폰 사파리에서 직접 열거나, 착착도구의 「HEIC → JPG 바꾸기」로 먼저 바꾼 뒤 다시 골라 주세요.'
        : '<b>사진을 열 수 없어요.</b> 파일이 손상됐거나 지원하지 않는 형식이에요. 카메라로 다시 찍거나 JPG·PNG 사진을 골라 주세요.');
    };
    img.src = url;
  };
 
  Tool.prototype.loadSample = function () {
    var self = this;
    ['front', 'back'].forEach(function (side) {
      var s = sampleScene(side === 'back');
      self.sides[side] = { src: s.canvas, quad: autoQuad(s.canvas, false) || s.quad.map(function (p) { return p.slice(); }), card: null, masks: [] };
      self.sides[side].card = self.warpCard(self.sides[side]);
    });
    self.closeEditor();
    self.setMode('card');
    var b = self.box, rrn = b.querySelector('[data-o=rrn]'), wm = b.querySelector('[data-o=wm]'), wt = b.querySelector('[data-o=wmtext]');
    rrn.checked = true; self.setRrn(true);
    wm.checked = true; self.opt.wm = true; wt.style.display = 'block'; wt.value = self.opt.wmText = '착착은행 계좌개설 제출용';
    self.refreshAll();
    self.msg('ok', '예시 사진 2장의 모서리를 <b>자동으로 찾아</b> 반듯하게 폈어요. 주민번호 뒷자리 가림과 워터마크도 켜 두었어요. <b>✂️ 모서리 조정</b>·<b>🙈 가릴 곳 편집</b>도 눌러 보세요.');
  };
 
  /* ---- 모서리 4점 편집기 ---- */
  Tool.prototype.openEditor = function (side) {
    var self = this, s = this.sides[side]; if (!s) return;
    this.editing = side;
    var src = s.src, W = src.width, H = src.height;
    if (!s.quad) { // 기본값: 가운데에 신분증 비율 사각형
      var cw = Math.min(W * 0.8, H * 0.8 * CARD_W_MM / CARD_H_MM), ch = cw * CARD_H_MM / CARD_W_MM;
      var x0 = (W - cw) / 2, y0 = (H - ch) / 2;
      s.quad = [[x0, y0], [x0 + cw, y0], [x0 + cw, y0 + ch], [x0, y0 + ch]];
    }
    var q = s.quad.map(function (p) { return p.slice(); });
    var ed = this.ed;
    ed.style.display = 'block';
    ed.innerHTML =
      '<p>' + (s.auto ? '✨ 모서리를 <b>자동으로 찾았어요.</b> 어긋난 점만 끌어서 맞춰 주세요.' : '👆 파란 점 4개를 신분증 <b>네 모서리</b>에 끌어다 맞춰 주세요.') + ' 손가락 위치는 돋보기로 크게 보여요.</p>' +
      '<div class="bdic-stage"><canvas class="bdic-cv"></canvas>' +
      '<div class="bdic-h"></div><div class="bdic-h"></div><div class="bdic-h"></div><div class="bdic-h"></div>' +
      '<canvas class="bdic-loupe" width="240" height="240"></canvas></div>' +
      '<div class="bdic-row">' +
        '<button type="button" class="bdic-btn" data-e="rot">⟳ 사진 돌리기</button>' +
        '<button type="button" class="bdic-btn" data-e="cancel">취소</button>' +
        '<button type="button" class="bdic-btn bdic-pri" data-e="ok">✔ 이대로 자르기</button>' +
      '</div>';
    var stage = ed.querySelector('.bdic-stage'), cv = ed.querySelector('.bdic-cv');
    var hs = ed.querySelectorAll('.bdic-h'), loupe = ed.querySelector('.bdic-loupe');
    var ctx = cv.getContext('2d'), lctx = loupe.getContext('2d');
    var dpr = Math.min(2, window.devicePixelRatio || 1), scale = 1, active = -1;
 
    function layout() {
      var cssW = stage.clientWidth || 300;
      var maxH = Math.max(260, (window.innerHeight || 700) * 0.62);
      var cssScale = Math.min(cssW / src.width, maxH / src.height);
      var dispW = src.width * cssScale, dispH = src.height * cssScale;
      cv.style.width = dispW + 'px'; cv.style.height = dispH + 'px'; cv.style.margin = '0 auto';
      cv.width = Math.round(dispW * dpr); cv.height = Math.round(dispH * dpr);
      scale = cssScale;
      draw();
    }
    function offX() { return cv.offsetLeft; }
    function draw() {
      var k = scale * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(src, 0, 0, cv.width, cv.height);
      ctx.save(); ctx.scale(k, k);
      ctx.fillStyle = 'rgba(15,23,42,.55)';
      ctx.beginPath(); ctx.rect(0, 0, src.width, src.height);
      ctx.moveTo(q[0][0], q[0][1]); for (var i = 3; i >= 0; i--) ctx.lineTo(q[i][0], q[i][1]); ctx.closePath();
      ctx.fill('evenodd');
      ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 3 / scale;
      ctx.beginPath(); q.forEach(function (p, i) { i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }); ctx.closePath(); ctx.stroke();
      ctx.restore();
      for (var j = 0; j < 4; j++) {
        hs[j].style.left = (offX() + q[j][0] * scale) + 'px';
        hs[j].style.top = (q[j][1] * scale) + 'px';
        hs[j].className = 'bdic-h' + (j === active ? ' on' : '');
      }
    }
    function drawLoupe(p) {
      var R = 240, sz = Math.max(16, 48 / scale); // 화면 기준 약 2.5배 확대
      lctx.fillStyle = '#000'; lctx.fillRect(0, 0, R, R);
      lctx.drawImage(src, p[0] - sz / 2, p[1] - sz / 2, sz, sz, 0, 0, R, R);
      lctx.strokeStyle = '#f59e0b'; lctx.lineWidth = 3;
      lctx.beginPath(); lctx.moveTo(R / 2, 0); lctx.lineTo(R / 2, R); lctx.moveTo(0, R / 2); lctx.lineTo(R, R / 2); lctx.stroke();
    }
    function placeLoupe(p) { // 손가락에 가리지 않게 점 위쪽(위가 좁으면 아래쪽)에 띄움
      var fx = offX() + p[0] * scale, fy = p[1] * scale, L = 120;
      var top = fy - L - 40; if (top < 0) top = fy + 40;
      var left = Math.max(0, Math.min(stage.clientWidth - L, fx - L / 2));
      loupe.style.left = left + 'px'; loupe.style.top = top + 'px'; loupe.style.right = 'auto';
    }
    function pt(e) {
      var rc = cv.getBoundingClientRect();
      return [(e.clientX - rc.left) / scale, (e.clientY - rc.top) / scale];
    }
    stage.addEventListener('pointerdown', function (e) {
      if (e.target.closest('button')) return;
      var p = pt(e), best = -1, bd = 56 / scale; // 손가락 반경 56px
      for (var i = 0; i < 4; i++) { var d = dist(p, q[i]); if (d < bd) { bd = d; best = i; } }
      if (best < 0) return;
      active = best; e.preventDefault();
      try { stage.setPointerCapture(e.pointerId); } catch (x) {}
      loupe.style.display = 'block'; placeLoupe(q[best]);
      drawLoupe(q[best]); draw();
    });
    stage.addEventListener('pointermove', function (e) {
      if (active < 0) return; e.preventDefault();
      var p = pt(e);
      q[active] = [Math.max(0, Math.min(src.width, p[0])), Math.max(0, Math.min(src.height, p[1]))];
      placeLoupe(q[active]); drawLoupe(q[active]); draw();
    });
    var end = function () { if (active < 0) return; active = -1; loupe.style.display = 'none'; draw(); };
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
 
    ed.querySelector('[data-e=rot]').onclick = function () {
      var r = canvas(src.height, src.width), g = r.getContext('2d');
      g.translate(r.width, 0); g.rotate(Math.PI / 2); g.drawImage(src, 0, 0);
      var oldH = src.height;
      q = q.map(function (p) { return [oldH - p[1], p[0]]; });
      s.src = src = r; layout();
    };
    ed.querySelector('[data-e=cancel]').onclick = function () {
      if (!s.card) { self.sides[side] = null; self.renderSlot(side); }
      self.closeEditor();
    };
    ed.querySelector('[data-e=ok]').onclick = function () {
      var oq = orderCorners(q);
      if (quadArea(oq) < src.width * src.height * 0.03) {
        return self.msg('err', '<b>선택한 영역이 너무 작아요.</b> 파란 점 4개를 신분증의 네 모서리까지 넓게 벌려 주세요.');
      }
      var w = (dist(oq[0], oq[1]) + dist(oq[3], oq[2])) / 2, h = (dist(oq[0], oq[3]) + dist(oq[1], oq[2])) / 2;
      if (h > w * 1.15) {
        return self.msg('err', '<b>신분증이 세로로 누워 있어요.</b> <b>⟳ 사진 돌리기</b>를 눌러 글씨가 바로 보이게 돌린 뒤 다시 눌러 주세요.');
      }
      s.quad = oq;
      s.card = self.warpCard(s);
      self.msg('', '');
      self.renderSlot(side); self.closeEditor(); self.update();
      if (side === 'front' && !self.sides.back) self.msg('info', '앞면 완료! 이제 <b>📷 뒷면 사진 선택</b>을 눌러 주세요. (앞면만 필요하면 바로 저장해도 돼요)');
    };
    this._onResize = function () { if (self.editing === side) layout(); };
    window.addEventListener('resize', this._onResize);
    requestAnimationFrame(layout);
    setTimeout(function () { try { ed.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (x) {} }, 50);
  };
  Tool.prototype.closeEditor = function () {
    this.editing = null; this.ed.style.display = 'none'; this.ed.innerHTML = '';
    if (this._onResize) window.removeEventListener('resize', this._onResize);
  };
  /* ---- 가림 상자 편집기 ---- */
  Tool.prototype.openMaskEditor = function (side) {
    var self = this, s = this.sides[side]; if (!s || !s.card) return;
    this.closeEditor(); this.editing = side;
    s.masks = s.masks || [];
    var ed = this.ed, sel = s.masks.length ? s.masks.length - 1 : -1;
    ed.style.display = 'block';
    ed.innerHTML =
      '<p>🙈 검은 상자를 끌어서 가릴 곳에 놓고, 주황 점으로 크기를 바꿔요. 주민번호 뒷자리·면허번호처럼 <b>제출처가 요구하지 않는 정보</b>를 가리세요.</p>' +
      '<div class="bdic-stage"><canvas class="bdic-cv"></canvas></div>' +
      '<div class="bdic-row">' +
        '<button type="button" class="bdic-btn" data-e="add">➕ 상자 추가</button>' +
        '<button type="button" class="bdic-btn" data-e="rm">🗑️ 상자 지우기</button>' +
        '<button type="button" class="bdic-btn bdic-pri" data-e="ok">✔ 완료</button>' +
      '</div>';
    var stage = ed.querySelector('.bdic-stage'), cv = ed.querySelector('.bdic-cv');
    cv.width = CARD_PX_W; cv.height = CARD_PX_H;
    var base = this.sides[side].card;
    cv.getContext('2d').drawImage(base, 0, 0);
    function boxes() {
      stage.querySelectorAll('.bdic-mbox').forEach(function (b) { b.remove(); });
      var W = cv.clientWidth, H = cv.clientHeight;
      s.masks.forEach(function (m, i) {
        var b = el('div', { class: 'bdic-mbox' + (i === sel ? ' sel' : '') }, '<i></i>');
        b.style.left = m.x * W + 'px'; b.style.top = m.y * H + 'px';
        b.style.width = m.w * W + 'px'; b.style.height = m.h * H + 'px';
        b.setAttribute('data-i', i);
        stage.appendChild(b);
      });
    }
    var drag = null;
    stage.addEventListener('pointerdown', function (e) {
      var b = e.target.closest('.bdic-mbox'); if (!b) return;
      e.preventDefault();
      sel = +b.getAttribute('data-i'); var m = s.masks[sel];
      drag = { mode: e.target.tagName === 'I' ? 'size' : 'move', x: e.clientX, y: e.clientY, m0: Object.assign({}, m) };
      try { stage.setPointerCapture(e.pointerId); } catch (x) {}
      boxes();
    });
    stage.addEventListener('pointermove', function (e) {
      if (!drag) return; e.preventDefault();
      var m = s.masks[sel], dx = (e.clientX - drag.x) / cv.clientWidth, dy = (e.clientY - drag.y) / cv.clientHeight, a = drag.m0;
      if (drag.mode === 'move') {
        m.x = Math.max(0, Math.min(1 - a.w, a.x + dx)); m.y = Math.max(0, Math.min(1 - a.h, a.y + dy));
      } else {
        m.w = Math.max(0.04, Math.min(1 - a.x, a.w + dx)); m.h = Math.max(0.04, Math.min(1 - a.y, a.h + dy));
      }
      boxes();
    });
    var end = function () { drag = null; };
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
    ed.querySelector('[data-e=add]').onclick = function () {
      s.masks.push({ x: 0.35, y: 0.4, w: 0.3, h: 0.14 }); sel = s.masks.length - 1; boxes();
    };
    ed.querySelector('[data-e=rm]').onclick = function () {
      if (sel < 0 || !s.masks[sel]) return;
      if (s.masks[sel].rrn) self.box.querySelector('[data-o=rrn]').checked = false;
      s.masks.splice(sel, 1); sel = s.masks.length - 1; boxes();
    };
    ed.querySelector('[data-e=ok]').onclick = function () { self.closeEditor(); self.refresh(side); };
    this._onResize = function () { if (self.editing === side) boxes(); };
    window.addEventListener('resize', this._onResize);
    requestAnimationFrame(boxes);
    setTimeout(function () { try { ed.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (x) {} }, 50);
  };
  Tool.prototype.warpCard = function (s) {
    var src = s.src, sd = src.getContext('2d').getImageData(0, 0, src.width, src.height);
    var out = canvas(CARD_PX_W, CARD_PX_H), g = out.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, CARD_PX_W, CARD_PX_H);
    var dd = g.getImageData(0, 0, CARD_PX_W, CARD_PX_H);
    var H = homography([[0, 0], [CARD_PX_W, 0], [CARD_PX_W, CARD_PX_H], [0, CARD_PX_H]], s.quad);
    if (!H) throw new Error('homography');
    warpInto(dd, CARD_PX_W, CARD_PX_H, sd, src.width, src.height, H, 0, 0, CARD_PX_W, CARD_PX_H);
    g.putImageData(dd, 0, 0);
    return out;
  };
 
  /* ---- A4 페이지 그리기 ---- */
  Tool.prototype.cards = function () {
    var a = [], self = this;
    ['front', 'back'].forEach(function (k) { var c = self.processCard(k); if (c) a.push(c); });
    return a;
  };
  Tool.prototype.wmLine = function () {
    var d = today();
    return (this.opt.wmText.trim() || '제출용') + ' · ' + d.slice(0, 4) + '.' + d.slice(4, 6) + '.' + d.slice(6) + ' · 다른 용도 사용 불가';
  };
  Tool.prototype.renderPage = function (dpi, target) {
    var W = Math.round(mm2px(A4_W_MM, dpi)), H = Math.round(mm2px(A4_H_MM, dpi));
    var c = target || canvas(W, H);
    if (target) { c.width = W; c.height = H; }
    var g = c.getContext('2d'), o = this.opt;
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    g.imageSmoothingEnabled = true; if ('imageSmoothingQuality' in g) g.imageSmoothingQuality = 'high';
    var cw = mm2px(CARD_W_MM, dpi), ch = mm2px(CARD_H_MM, dpi), x = (W - cw) / 2, line = this.wmLine();
    var font = function (mm) { return '700 ' + mm2px(mm, dpi).toFixed(1) + 'px "Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif'; };
    var cards = this.cards(), lastY = 0;
    cards.forEach(function (card, i) {
      var y = mm2px(CARD_TOP_MM + i * (CARD_H_MM + CARD_GAP_MM), dpi);
      g.drawImage(card, x, y, cw, ch);
      lastY = y + ch;
      if (o.wm) { // 카드 위에 비스듬한 반투명 문구를 반복
        g.save();
        g.beginPath(); g.rect(x, y, cw, ch); g.clip();
        g.translate(x + cw / 2, y + ch / 2); g.rotate(-18 * Math.PI / 180);
        g.font = font(3.6); g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = o.gray ? 'rgba(60,60,60,.42)' : 'rgba(200,30,30,.40)';
        var step = mm2px(11, dpi);
        for (var r = -4; r <= 4; r++) g.fillText(line + '   ' + line, (r % 2) * mm2px(12, dpi), r * step);
        g.restore();
      }
    });
    if (o.wm && cards.length) { // 아래에 용도 문구 한 줄
      g.font = font(3.4); g.textAlign = 'center'; g.textBaseline = 'top';
      g.fillStyle = o.gray ? '#333' : '#b91c1c';
      g.fillText('※ ' + line, W / 2, lastY + mm2px(6, dpi));
    }
    return c;
  };
  Tool.prototype.update = function () {
    var has = !!((this.sides.front && this.sides.front.card) || (this.sides.back && this.sides.back.card));
    this.out.style.display = has ? 'block' : 'none';
    if (has) this.renderPage(96, this.prev); // 미리보기
  };
  // 저장·공유는 '버튼을 누른 그 순간' 안에 끝내야 해요.
  // (아이폰 사파리·삼성 인터넷은 기다렸다가 저장·공유하면 사용자 동작이 아니라고 보고 막아요)
  Tool.prototype.save = function (kind) {
    var self = this;
    if (!this.cards().length) return this.msg('err', '먼저 신분증 사진을 넣어 주세요.');
    var page, jpg;
    try {
      page = this.renderPage(PAGE_DPI);
      var bin = atob(page.toDataURL('image/jpeg', 0.92).split(',')[1]);
      jpg = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) jpg[i] = bin.charCodeAt(i);
      setJpegDpi(jpg, PAGE_DPI);
    } catch (e) {
      return this.smsg('err', '<b>메모리가 부족해요.</b> 다른 앱·탭을 닫고 다시 눌러 주세요.');
    }
    var name = '신분증사본_A4_' + today(), pw = page.width, ph = page.height;
    page.width = page.height = 1; // 아이폰 캔버스 메모리 즉시 반납
    if (kind === 'print') return this.print(jpg);
    var isPdf = kind !== 'jpg';
    var blob = isPdf ? makePdf(jpg, pw, ph) : new Blob([jpg], { type: 'image/jpeg' });
    var fname = name + (isPdf ? '.pdf' : '.jpg');
    if (kind === 'share') {
      var f;
      try { f = new File([blob], fname, { type: blob.type }); } catch (x) { f = null; }
      if (f && navigator.share && (!navigator.canShare || navigator.canShare({ files: [f] }))) {
        try {
          navigator.share({ files: [f], title: '신분증 사본' }).then(function () {
            self.smsg('ok', '공유 창을 열었어요. 「파일에 저장」이나 카톡으로 보낼 수 있어요.');
          }, function (e) {
            if (e && e.name === 'AbortError') self.smsg('', '');
            else self.fallback(blob, fname, '<b>이 브라우저는 파일 공유를 막고 있어요.</b>');
          });
          return;
        } catch (x) { /* 아래 대체 방법 */ }
      }
      return this.fallback(blob, fname, '<b>이 브라우저는 파일 공유를 지원하지 않아요.</b>');
    }
    download(blob, fname);
    this.fallback(blob, fname, (isPdf ? 'PDF' : 'JPG') + '를 저장했어요. 갤럭시는 「내 파일 → 다운로드」, 아이폰은 「파일」 앱 → 다운로드에서 찾을 수 있어요.', true);
  };
  // 자동 저장이 막힌 브라우저용: 사용자가 직접 누르는 링크를 띄움
  Tool.prototype.fallback = function (blob, fname, lead, ok) {
    if (this._fbUrl) URL.revokeObjectURL(this._fbUrl);
    var url = this._fbUrl = URL.createObjectURL(blob), isPdf = /pdf$/i.test(fname);
    this.smsg(ok ? 'ok' : 'err', lead +
      '<br>저장 창이 안 떴다면 👉 <a href="' + url + '" download="' + fname + '" target="_blank" rel="noopener" ' +
      'style="display:inline-block;margin-top:6px;padding:8px 14px;border-radius:10px;background:#2563eb;color:#fff;font-weight:700;text-decoration:none">' +
      (isPdf ? '📄 PDF 열기' : '🖼️ 사진 열기') + '</a><br><span style="font-size:13px">' +
      (isPdf ? '열린 PDF에서 공유 버튼(□↑) → 「파일에 저장」을 누르세요.' : '열린 사진을 길게 눌러 「사진 앱에 저장」을 누르세요.') + '</span>');
  };
  Tool.prototype.print = function (jpg) {
    var self = this, url = URL.createObjectURL(new Blob([jpg], { type: 'image/jpeg' }));
    var fr = document.createElement('iframe');
    fr.setAttribute('aria-hidden', 'true');
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
    document.body.appendChild(fr);
    var doc = fr.contentWindow.document;
    doc.open();
    doc.write('<!doctype html><html><head><meta charset="utf-8"><title>신분증 사본</title><style>@page{size:A4;margin:0}html,body{margin:0;padding:0}img{display:block;width:210mm;height:297mm}</style></head><body><img src="' + url + '"></body></html>');
    doc.close();
    var img = doc.querySelector('img'), go = function () {
      try { fr.contentWindow.focus(); fr.contentWindow.print(); }
      catch (e) { self.smsg('err', '<b>이 브라우저에서는 바로 인쇄가 안 돼요.</b> 「PDF 저장」 후 PDF를 열어 인쇄해 주세요.'); }
      setTimeout(function () { fr.remove(); URL.revokeObjectURL(url); }, 60000);
    };
    if (img.complete) setTimeout(go, 50); else img.onload = go;
    self.smsg('info', '인쇄 창에서 <b>여백 「없음」</b>, <b>배율 「100%(실제 크기)」</b>를 고르면 신분증이 실물 크기로 나와요.');
  };
 
  /* ---- 시작 ---- */
  function boot() {
    var root = document.getElementById(ROOT_ID);
    if (!root || root.getAttribute('data-ready')) return;
    root.setAttribute('data-ready', '1');
    try { root.__bdic = new Tool(root); }
    catch (e) { root.innerHTML = '<p style="color:#b91c1c">도구를 불러오지 못했어요. 최신 크롬·사파리에서 다시 열어 주세요.</p>'; }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.BDIdCopy = { _homography: homography, _warpInto: warpInto, _makePdf: makePdf, CARD_PX_W: CARD_PX_W, CARD_PX_H: CARD_PX_H };
})();
