/*!
 * ============================================================
 * 모듈명   : barodogu.imageColorPicker
 * 관리 ID  : BD071
 * 파일     : color/image-color-picker.js
 * 저장소   : https://github.com/barodogu/tools
 * CDN      : https://cdn.jsdelivr.net/gh/barodogu/tools@main/color/image-color-picker.js
 * 사용 블로그: https://barodogu.blogspot.com/
 * 용도     : 이미지 색상 추출기
 *            - 사진의 원하는 위치를 눌러 색상 코드(HEX·RGB·HSL) 확인·복사
 *            - 돋보기(11×11 픽셀 확대)와 평균 범위(1px·3×3·5×5) 선택
 *            - 주요 색상 팔레트 자동 추출(5·6·8·10색, 차지 비율 표시)
 *            ※ 사진은 서버로 전송하지 않고 사용자 브라우저(Canvas) 안에서만 처리
 * 사용법   : 글에 <div id="barodogu-image-color-picker"></div> 를 넣고
 *            이 파일을 <script src="…" defer></script> 로 불러오면 화면을 그립니다.
 * 버전     : 1.0.0
 * 최종수정 : 2026-10-22
 * ============================================================
 */
(function (window, document) {
  'use strict';

  var barodogu = window.barodogu = window.barodogu || {};

  /* ---------- 기준값: 이 객체만 수정하면 됩니다 ---------- */
  var CONFIG = {
    VERSION: '1.0.0',
    UPDATED: '2026-10-22',
    ROOT_ID: 'barodogu-image-color-picker',
    MAX_FILE_MB: 30,            // 불러올 원본 최대 용량
    MAX_SOURCE_PIXELS: 100e6,   // 원본 화소 상한(1억 화소)
    WORK_MAX_PIXELS: 16e6,      // 분석용 캔버스 화소 상한 — 넘으면 비율 유지 축소
    LOUPE_CELLS: 11,            // 돋보기 한 변 픽셀 수(홀수)
    LOUPE_ZOOM: 12,             // 돋보기 한 칸 크기(px)
    PALETTE_SIZES: [5, 6, 8, 10],
    PALETTE_DEFAULT: 6,
    PALETTE_SAMPLE_SIDE: 256,   // 팔레트 분석용 축소 한 변
    PALETTE_MIN_ALPHA: 128,     // 이보다 투명한 픽셀은 팔레트에서 제외
    PALETTE_ITER: 24,           // k-평균 반복 횟수
    PALETTE_MERGE_DE: 10,       // Lab 거리 이 값 미만이면 같은 색으로 합침
    ACCEPT: 'image/jpeg,image/png,image/webp,image/gif,image/bmp,.jpg,.jpeg,.png,.webp,.gif,.bmp'
  };

  /* ====================== 색상 계산 (순수 함수) ====================== */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hex2(n) { var s = clamp(Math.round(n), 0, 255).toString(16).toUpperCase(); return s.length < 2 ? '0' + s : s; }
  function toHex(r, g, b) { return '#' + hex2(r) + hex2(g) + hex2(b); }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    var h = 0, s = 0, l = (max + min) / 2;
    if (d !== 0) {
      s = d / (1 - Math.abs(2 * l - 1));
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return { h: Math.round(h) % 360, s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  function srgbToLinear(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function rgbToLab(r, g, b) {
    var R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
    var x = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047;
    var y = (R * 0.2126729 + G * 0.7151522 + B * 0.0721750);
    var z = (R * 0.0193339 + G * 0.1191920 + B * 0.9503041) / 1.08883;
    function f(t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; }
    var fx = f(x), fy = f(y), fz = f(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  function dist2(a, b) { var d0 = a[0] - b[0], d1 = a[1] - b[1], d2 = a[2] - b[2]; return d0 * d0 + d1 * d1 + d2 * d2; }
  function relLuminance(r, g, b) { return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b); }

  function formats(c) {
    var hsl = rgbToHsl(c.r, c.g, c.b);
    var a = c.a === undefined ? 255 : c.a;
    var alpha = Math.round(a / 255 * 100) / 100;
    return {
      hex: toHex(c.r, c.g, c.b),
      rgb: alpha < 1 ? 'rgba(' + c.r + ', ' + c.g + ', ' + c.b + ', ' + alpha + ')' : 'rgb(' + c.r + ', ' + c.g + ', ' + c.b + ')',
      hsl: alpha < 1 ? 'hsla(' + hsl.h + ', ' + hsl.s + '%, ' + hsl.l + '%, ' + alpha + ')' : 'hsl(' + hsl.h + ', ' + hsl.s + '%, ' + hsl.l + '%)',
      alpha: alpha
    };
  }

  /**
   * 주요 색상 추출 — RGBA 배열에서 대표색 k개와 차지 비율을 구합니다.
   * 1) 각 채널 5비트(32단계)로 묶어 히스토그램 작성(투명 픽셀 제외)
   * 2) 묶음의 평균색을 Lab 공간으로 바꿔 가중 k-평균(k-means++ 결정적 초기화)
   * 3) 너무 가까운 색은 합치고 비율 높은 순으로 정렬
   * 같은 사진은 항상 같은 결과가 나오도록 무작위 요소를 쓰지 않습니다.
   */
  function extractPalette(data, k, opt) {
    opt = opt || {};
    var minAlpha = opt.minAlpha === undefined ? CONFIG.PALETTE_MIN_ALPHA : opt.minAlpha;
    var iter = opt.iterations || CONFIG.PALETTE_ITER;
    var mergeDE = opt.mergeDE === undefined ? CONFIG.PALETTE_MERGE_DE : opt.mergeDE;
    var map = {}, keys = [], total = 0, i, n = data.length;

    for (i = 0; i < n; i += 4) {
      if (data[i + 3] < minAlpha) continue;
      var key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
      var bk = map[key];
      if (!bk) { bk = map[key] = { w: 0, r: 0, g: 0, b: 0 }; keys.push(key); }
      bk.w++; bk.r += data[i]; bk.g += data[i + 1]; bk.b += data[i + 2];
      total++;
    }
    if (!total) return { colors: [], total: 0 };

    var bins = [];
    for (i = 0; i < keys.length; i++) {
      var b0 = map[keys[i]];
      var rr = b0.r / b0.w, gg = b0.g / b0.w, bb = b0.b / b0.w;
      bins.push({ w: b0.w, rgb: [rr, gg, bb], lab: rgbToLab(rr, gg, bb), c: 0 });
    }
    bins.sort(function (a, b) { return b.w - a.w; });
    k = Math.max(1, Math.min(k, bins.length));

    /* 결정적 k-means++ : 가장 많은 색에서 시작, 이후 '가중치 × 거리²'가 최대인 색 */
    var cents = [bins[0].lab.slice()];
    var dmin = bins.map(function (bn) { return dist2(bn.lab, cents[0]); });
    while (cents.length < k) {
      var best = -1, bestScore = -1;
      for (i = 0; i < bins.length; i++) {
        var sc = bins[i].w * dmin[i];
        if (sc > bestScore) { bestScore = sc; best = i; }
      }
      if (bestScore <= 0) break;
      cents.push(bins[best].lab.slice());
      for (i = 0; i < bins.length; i++) dmin[i] = Math.min(dmin[i], dist2(bins[i].lab, cents[cents.length - 1]));
    }

    var K = cents.length, it, j;
    for (it = 0; it < iter; it++) {
      var acc = [];
      for (j = 0; j < K; j++) acc.push([0, 0, 0, 0]);
      for (i = 0; i < bins.length; i++) {
        var bi = bins[i], bj = 0, bd = Infinity;
        for (j = 0; j < K; j++) { var d = dist2(bi.lab, cents[j]); if (d < bd) { bd = d; bj = j; } }
        bi.c = bj;
        acc[bj][0] += bi.lab[0] * bi.w; acc[bj][1] += bi.lab[1] * bi.w; acc[bj][2] += bi.lab[2] * bi.w; acc[bj][3] += bi.w;
      }
      var moved = 0;
      for (j = 0; j < K; j++) {
        if (!acc[j][3]) continue;
        var nc = [acc[j][0] / acc[j][3], acc[j][1] / acc[j][3], acc[j][2] / acc[j][3]];
        moved = Math.max(moved, dist2(nc, cents[j]));
        cents[j] = nc;
      }
      if (moved < 0.01) break;
    }

    /* 군집별 실제 RGB 가중 평균 */
    var groups = [];
    for (j = 0; j < K; j++) groups.push({ w: 0, r: 0, g: 0, b: 0 });
    for (i = 0; i < bins.length; i++) {
      var gp = groups[bins[i].c], w = bins[i].w;
      gp.w += w; gp.r += bins[i].rgb[0] * w; gp.g += bins[i].rgb[1] * w; gp.b += bins[i].rgb[2] * w;
    }
    var out = [];
    for (j = 0; j < K; j++) {
      if (!groups[j].w) continue;
      var o = { r: Math.round(groups[j].r / groups[j].w), g: Math.round(groups[j].g / groups[j].w), b: Math.round(groups[j].b / groups[j].w), w: groups[j].w };
      o.lab = rgbToLab(o.r, o.g, o.b);
      out.push(o);
    }

    /* 거의 같은 색 합치기 */
    out.sort(function (a, b) { return b.w - a.w; });
    var merged = [];
    for (i = 0; i < out.length; i++) {
      var hit = null;
      for (j = 0; j < merged.length; j++) if (Math.sqrt(dist2(merged[j].lab, out[i].lab)) < mergeDE) { hit = merged[j]; break; }
      if (hit) {
        var tw = hit.w + out[i].w;
        hit.r = Math.round((hit.r * hit.w + out[i].r * out[i].w) / tw);
        hit.g = Math.round((hit.g * hit.w + out[i].g * out[i].w) / tw);
        hit.b = Math.round((hit.b * hit.w + out[i].b * out[i].w) / tw);
        hit.w = tw; hit.lab = rgbToLab(hit.r, hit.g, hit.b);
      } else merged.push(out[i]);
    }
    merged.sort(function (a, b) { return b.w - a.w; });
    return {
      total: total,
      colors: merged.map(function (c) {
        return { r: c.r, g: c.g, b: c.b, hex: toHex(c.r, c.g, c.b), ratio: c.w / total };
      })
    };
  }

  /* 지정 위치 주변 (2r+1)² 픽셀 평균. 투명도로 가중 */
  function sampleAt(data, width, height, x, y, radius) {
    var r = 0, g = 0, b = 0, a = 0, wsum = 0, cnt = 0;
    for (var yy = y - radius; yy <= y + radius; yy++) {
      if (yy < 0 || yy >= height) continue;
      for (var xx = x - radius; xx <= x + radius; xx++) {
        if (xx < 0 || xx >= width) continue;
        var p = (yy * width + xx) * 4, al = data[p + 3];
        r += data[p] * al; g += data[p + 1] * al; b += data[p + 2] * al; wsum += al; a += al; cnt++;
      }
    }
    if (!cnt) return null;
    if (!wsum) return { r: 0, g: 0, b: 0, a: 0 };
    return { r: Math.round(r / wsum), g: Math.round(g / wsum), b: Math.round(b / wsum), a: Math.round(a / cnt) };
  }

  /* ====================== 화면 ====================== */
  var CSS = [
    '#R{box-sizing:border-box;max-width:900px;margin:24px auto;color:#17283e;font:16px/1.65 system-ui,-apple-system,"Malgun Gothic",sans-serif;overflow-wrap:anywhere;}',
    '#R *{box-sizing:border-box;}',
    '#R .bdcp-card{border:1px solid #dbe3ee;border-radius:18px;background:#fff;padding:clamp(14px,3vw,28px);}',
    '#R .bdcp-kicker{margin:0;color:#1a6491;font-size:13px;font-weight:800;letter-spacing:.08em;}',
    '#R .bdcp-title{margin:6px 0 10px;color:#17283e;font-size:clamp(23px,4vw,32px);line-height:1.3;border:0;padding:0;}',
    '#R .bdcp-lead{margin:0 0 18px;}',
    '#R .bdcp-drop{border:2px dashed #96b9ce;border-radius:14px;background:#f2f9fc;padding:22px 14px;text-align:center;transition:background .15s;}',
    '#R .bdcp-drop.is-over{background:#dceff9;}',
    '#R .bdcp-drop strong{display:block;font-size:18px;}',
    '#R .bdcp-filebtn{display:inline-flex;align-items:center;justify-content:center;margin-top:12px;min-height:44px;padding:9px 18px;border-radius:10px;background:#1a6491;color:#fff;font-weight:700;cursor:pointer;}',
    '#R .bdcp-filebtn:focus-within{outline:3px solid #f2b705;outline-offset:2px;}',
    '#R .bdcp-file{position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;}',
    '#R .bdcp-small{font-size:13px;color:#53697b;margin:8px 0 0;}',
    '#R .bdcp-btn{font:inherit;min-height:44px;border:1px solid #bac9de;border-radius:10px;padding:8px 14px;background:#fff;color:#17283e;cursor:pointer;}',
    '#R .bdcp-btn:hover{background:#f2f6fb;}',
    '#R .bdcp-btn:focus-visible{outline:3px solid #f2b705;outline-offset:2px;}',
    '#R .bdcp-btn.is-primary{background:#1a6491;border-color:#1a6491;color:#fff;font-weight:700;}',
    '#R .bdcp-btn[disabled]{opacity:.5;cursor:not-allowed;}',
    '#R .bdcp-work{display:none;margin-top:18px;}',
    '#R .bdcp-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-bottom:10px;}',
    '#R .bdcp-meta{font-size:14px;color:#53697b;}',
    '#R .bdcp-stagewrap{background:repeating-conic-gradient(#e9eef4 0 25%,#fff 0 50%) 0 0/16px 16px;border:1px solid #dbe3ee;border-radius:12px;padding:8px;text-align:center;}',
    '#R .bdcp-stage{position:relative;display:inline-block;max-width:100%;vertical-align:top;}',
    '#R .bdcp-canvas{display:block;max-width:100%;max-height:min(70vh,640px);width:auto;height:auto;cursor:crosshair;touch-action:none;outline:none;}',
    '#R .bdcp-canvas:focus-visible{box-shadow:0 0 0 3px #f2b705;}',
    '#R .bdcp-loupe{position:absolute;left:0;top:0;display:none;pointer-events:none;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.35);overflow:hidden;background:#fff;z-index:2;}',
    '#R .bdcp-loupe canvas{display:block;}',
    '#R .bdcp-loupe span{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);background:rgba(23,40,62,.85);color:#fff;font:700 12px/1 ui-monospace,Consolas,monospace;padding:4px 6px;border-radius:6px;white-space:nowrap;}',
    '#R .bdcp-hint{font-size:13px;color:#53697b;margin:8px 0 0;}',
    '#R .bdcp-opts{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;margin:12px 0 0;font-size:14px;}',
    '#R .bdcp-opts select{font:inherit;min-height:40px;border:1px solid #bac9de;border-radius:9px;padding:6px 10px;background:#fff;color:#17283e;}',
    '#R .bdcp-panel{display:grid;grid-template-columns:minmax(0,120px) 1fr;gap:16px;align-items:start;margin-top:18px;padding:16px;border:1px solid #dbe3ee;border-radius:14px;background:#f8fafc;}',
    '@media (max-width:520px){#R .bdcp-panel{grid-template-columns:1fr;}}',
    '#R .bdcp-swatch{width:100%;aspect-ratio:1/1;max-height:120px;border-radius:12px;border:1px solid rgba(0,0,0,.12);background:#fff;}',
    '#R .bdcp-h3{margin:0 0 6px;font-size:16px;color:#17283e;border:0;padding:0;}',
    '#R .bdcp-row{display:flex;gap:8px;align-items:center;margin:6px 0;}',
    '#R .bdcp-row b{width:44px;flex:0 0 44px;font-size:13px;color:#53697b;}',
    '#R .bdcp-row output{flex:1;min-width:0;font:600 15px/1.4 ui-monospace,Consolas,monospace;background:#fff;border:1px solid #dbe3ee;border-radius:8px;padding:9px 10px;}',
    '#R .bdcp-row .bdcp-btn{min-height:40px;padding:6px 12px;font-size:14px;}',
    '#R .bdcp-pal{margin-top:22px;}',
    '#R .bdcp-strip{display:flex;height:22px;border-radius:8px;overflow:hidden;border:1px solid #dbe3ee;margin:10px 0 12px;}',
    '#R .bdcp-grid{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;}',
    '#R .bdcp-grid li{margin:0;padding:0;}',
    '#R .bdcp-chip{display:block;width:100%;border:1px solid #dbe3ee;border-radius:12px;background:#fff;padding:0;overflow:hidden;cursor:pointer;font:inherit;color:#17283e;text-align:left;}',
    '#R .bdcp-chip:focus-visible{outline:3px solid #f2b705;outline-offset:2px;}',
    '#R .bdcp-chip i{display:block;height:58px;}',
    '#R .bdcp-chip span{display:block;padding:7px 10px;font:700 14px/1.3 ui-monospace,Consolas,monospace;}',
    '#R .bdcp-chip small{display:block;font:400 12px/1.3 system-ui,sans-serif;color:#53697b;margin-top:2px;}',
    '#R .bdcp-msg{min-height:1.6em;margin:14px 0 0;padding:10px 12px;border-radius:10px;background:#f4f7fb;font-size:14px;}',
    '#R .bdcp-msg:empty{display:none;}',
    '#R .bdcp-msg.is-error{background:#fff3df;}',
    '#R .bdcp-msg.is-ok{background:#edf8f1;}',
    '#R .bdcp-foot{margin:16px 0 0;font-size:12px;color:#6b7f90;}'
  ].join('\n');

  function h(tag, attrs, html) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) el.setAttribute(k, attrs[k]);
    if (html !== undefined) el.innerHTML = html;
    return el;
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  function decodeFile(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return decodeWithImg(file); });
    }
    return decodeWithImg(file);
  }
  function decodeWithImg(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { resolve(img); setTimeout(function () { URL.revokeObjectURL(url); }, 0); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('이미지를 읽을 수 없습니다.')); };
      img.src = url;
    });
  }

  function init(target) {
    var root = typeof target === 'string' ? document.querySelector(target) : (target || document.getElementById(CONFIG.ROOT_ID));
    if (!root || root.getAttribute('data-bd-ready')) return root && root.barodoguApi;
    root.setAttribute('data-bd-ready', CONFIG.VERSION);
    if (!root.id) root.id = CONFIG.ROOT_ID;

    if (!document.getElementById('bdcp-style-' + root.id)) {
      var st = h('style', { id: 'bdcp-style-' + root.id });
      st.textContent = CSS.replace(/#R/g, '#' + root.id);
      (document.head || document.documentElement).appendChild(st);
    }

    var sizeOpts = CONFIG.PALETTE_SIZES.map(function (n) {
      return '<option value="' + n + '"' + (n === CONFIG.PALETTE_DEFAULT ? ' selected' : '') + '>' + n + '색</option>';
    }).join('');
    var uid = root.id;

    root.innerHTML =
      '<div class="bdcp-card">' +
      '<p class="bdcp-kicker">바로도구 / BD071</p>' +
      '<p class="bdcp-title" role="heading" aria-level="2">이미지 색상 추출기</p>' +
      '<p class="bdcp-lead">사진을 고르고 원하는 곳을 누르면 색상 코드가 나옵니다. 주요 색상 팔레트도 자동으로 뽑아 드려요.</p>' +
      '<div class="bdcp-drop" data-el="drop">' +
      '<strong>사진을 여기에 끌어다 놓으세요</strong>' +
      '<label class="bdcp-filebtn">이미지 파일 선택<input class="bdcp-file" data-el="file" type="file" accept="' + CONFIG.ACCEPT + '"></label>' +
      '<p class="bdcp-small">JPG · PNG · WebP · GIF · BMP / 최대 ' + CONFIG.MAX_FILE_MB + 'MB · PC는 Ctrl+V로 붙여넣기 가능</p>' +
      '</div>' +
      '<p class="bdcp-small">🔒 사진은 서버로 전송되지 않고 지금 쓰는 기기의 브라우저 안에서만 처리됩니다.</p>' +
      '<div class="bdcp-work" data-el="work">' +
      '<div class="bdcp-bar"><span class="bdcp-meta" data-el="meta"></span>' +
      '<button type="button" class="bdcp-btn" data-el="reset">다른 사진 고르기</button></div>' +
      '<div class="bdcp-stagewrap"><div class="bdcp-stage" data-el="stage">' +
      '<canvas class="bdcp-canvas" data-el="canvas" tabindex="0" aria-label="색상을 고를 사진. 방향키로 위치를 옮기고 Enter로 선택합니다."></canvas>' +
      '<div class="bdcp-loupe" data-el="loupe" aria-hidden="true"><canvas data-el="lcanvas"></canvas><span data-el="lhex"></span></div>' +
      '</div></div>' +
      '<p class="bdcp-hint">PC: 마우스를 올리면 돋보기가 따라오고, 클릭하면 선택됩니다. 휴대전화: 사진 위를 누른 채 움직이다 손을 떼면 그 위치가 선택됩니다. 방향키(Shift+방향키 10칸)와 Enter도 쓸 수 있습니다.</p>' +
      '<div class="bdcp-opts"><label>평균 범위 <select data-el="radius">' +
      '<option value="0" selected>1픽셀 그대로</option><option value="1">3×3 평균</option><option value="2">5×5 평균</option>' +
      '</select></label></div>' +
      '<section class="bdcp-panel" aria-labelledby="' + uid + '-pick-h">' +
      '<div class="bdcp-swatch" data-el="swatch" role="img" aria-label="선택한 색상"></div>' +
      '<div><p class="bdcp-h3" id="' + uid + '-pick-h"><strong>선택한 색상</strong> <span class="bdcp-meta" data-el="pos">— 사진을 눌러 주세요</span></p>' +
      '<div class="bdcp-row"><b>HEX</b><output data-el="hex">-</output><button type="button" class="bdcp-btn" data-copy="hex">복사</button></div>' +
      '<div class="bdcp-row"><b>RGB</b><output data-el="rgb">-</output><button type="button" class="bdcp-btn" data-copy="rgb">복사</button></div>' +
      '<div class="bdcp-row"><b>HSL</b><output data-el="hsl">-</output><button type="button" class="bdcp-btn" data-copy="hsl">복사</button></div>' +
      '</div></section>' +
      '<section class="bdcp-pal" aria-labelledby="' + uid + '-pal-h">' +
      '<div class="bdcp-bar"><p class="bdcp-h3" id="' + uid + '-pal-h"><strong>주요 색상 팔레트</strong></p>' +
      '<div class="bdcp-opts" style="margin:0"><label>색 개수 <select data-el="count">' + sizeOpts + '</select></label>' +
      '<button type="button" class="bdcp-btn" data-el="copyall">HEX 모두 복사</button></div></div>' +
      '<div class="bdcp-strip" data-el="strip" aria-hidden="true"></div>' +
      '<ul class="bdcp-grid" data-el="grid"></ul>' +
      '<p class="bdcp-hint">색 칸을 누르면 위 \'선택한 색상\'에 HEX·RGB·HSL이 표시됩니다. 비율은 투명한 부분을 뺀 사진 면적 기준입니다.</p>' +
      '</section>' +
      '</div>' +
      '<div class="bdcp-msg" data-el="msg" role="status" aria-live="polite"></div>' +
      '<p class="bdcp-foot">바로도구 · BD071 · v' + CONFIG.VERSION + ' · 사진은 브라우저에서 처리</p>' +
      '</div>';

    var el = {};
    var nodes = root.querySelectorAll('[data-el]');
    for (var ni = 0; ni < nodes.length; ni++) el[nodes[ni].getAttribute('data-el')] = nodes[ni];

    var ctx = null, imgData = null, W = 0, H = 0, srcW = 0, srcH = 0;
    var cursor = { x: 0, y: 0 }, current = null, palette = [], touchActive = false;
    var lc = CONFIG.LOUPE_CELLS, lz = CONFIG.LOUPE_ZOOM, lsize = lc * lz;
    el.lcanvas.width = lsize; el.lcanvas.height = lsize;
    el.lcanvas.style.width = lsize + 'px'; el.lcanvas.style.height = lsize + 'px';
    el.loupe.style.width = (lsize + 6) + 'px'; el.loupe.style.height = (lsize + 6) + 'px';
    var lctx = el.lcanvas.getContext('2d');

    function msg(text, type) {
      el.msg.textContent = text || '';
      el.msg.className = 'bdcp-msg' + (type ? ' is-' + type : '');
    }

    function load(file) {
      if (!file) return;
      if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name || '')) {
        msg('이미지 파일만 열 수 있습니다. (JPG·PNG·WebP·GIF·BMP)', 'error'); return;
      }
      if (/heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name || '')) {
        msg('HEIC·HEIF 사진은 브라우저에 따라 열리지 않을 수 있습니다. 먼저 JPG로 저장한 뒤 다시 시도해 주세요.', 'error');
      }
      if (file.size > CONFIG.MAX_FILE_MB * 1048576) {
        msg('파일이 ' + CONFIG.MAX_FILE_MB + 'MB를 넘습니다. 용량을 줄인 뒤 다시 시도해 주세요.', 'error'); return;
      }
      msg('사진을 읽는 중입니다…');
      decodeFile(file).then(function (img) {
        var w = img.width || img.naturalWidth, hh = img.height || img.naturalHeight;
        if (!w || !hh) throw new Error('이미지 크기를 확인할 수 없습니다.');
        if (w * hh > CONFIG.MAX_SOURCE_PIXELS) throw new Error('해상도가 너무 큽니다(최대 1억 화소).');
        srcW = w; srcH = hh;
        var scale = Math.min(1, Math.sqrt(CONFIG.WORK_MAX_PIXELS / (w * hh)));
        W = Math.max(1, Math.round(w * scale)); H = Math.max(1, Math.round(hh * scale));
        el.canvas.width = W; el.canvas.height = H;
        ctx = el.canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' }) || el.canvas.getContext('2d');
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(img, 0, 0, W, H);
        if (img.close) img.close();
        imgData = ctx.getImageData(0, 0, W, H).data;
        el.work.style.display = 'block';
        el.meta.textContent = (file.name ? file.name + ' · ' : '') + srcW.toLocaleString() + '×' + srcH.toLocaleString() + 'px' +
          (scale < 1 ? ' (분석은 ' + W.toLocaleString() + '×' + H.toLocaleString() + 'px로 축소)' : '');
        cursor.x = Math.floor(W / 2); cursor.y = Math.floor(H / 2);
        current = null; setPanel(null);
        runPalette();
        msg('사진을 불러왔습니다. 원하는 위치를 눌러 색상을 확인하세요.', 'ok');
      }).catch(function (err) {
        msg('사진을 열지 못했습니다: ' + (err && err.message ? err.message : '지원하지 않는 형식이거나 손상된 파일입니다.'), 'error');
      });
    }

    function toOrig(v, total, orig) { return Math.min(orig - 1, Math.floor((v + 0.5) * orig / total)); }

    function setPanel(c, label) {
      if (!c) {
        el.swatch.style.background = '#fff';
        el.hex.textContent = el.rgb.textContent = el.hsl.textContent = '-';
        el.pos.textContent = '— 사진을 눌러 주세요';
        return;
      }
      var f = formats(c);
      current = { hex: f.hex, rgb: f.rgb, hsl: f.hsl };
      el.swatch.style.background = f.alpha < 1 ? 'linear-gradient(' + f.rgb + ',' + f.rgb + '),repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0 0/14px 14px' : f.hex;
      el.swatch.setAttribute('aria-label', '선택한 색상 ' + f.hex);
      el.hex.textContent = f.hex;
      el.rgb.textContent = f.rgb;
      el.hsl.textContent = f.hsl;
      el.pos.textContent = label || '';
    }

    function sample(x, y) { return sampleAt(imgData, W, H, x, y, +el.radius.value || 0); }

    function drawLoupe(x, y) {
      var half = (lc - 1) / 2, rad = +el.radius.value || 0;
      lctx.imageSmoothingEnabled = false;
      for (var j = 0; j < lc; j++) for (var i = 0; i < lc; i++) {
        var px = x - half + i, py = y - half + j;
        if (px < 0 || py < 0 || px >= W || py >= H) {
          lctx.fillStyle = ((i + j) % 2) ? '#cfd6de' : '#eef1f4';
        } else {
          var p = (py * W + px) * 4;
          lctx.fillStyle = 'rgba(' + imgData[p] + ',' + imgData[p + 1] + ',' + imgData[p + 2] + ',' + (imgData[p + 3] / 255) + ')';
          lctx.clearRect(i * lz, j * lz, lz, lz);
        }
        lctx.fillRect(i * lz, j * lz, lz, lz);
      }
      lctx.strokeStyle = 'rgba(255,255,255,.25)'; lctx.lineWidth = 1;
      for (var g = 1; g < lc; g++) {
        lctx.beginPath(); lctx.moveTo(g * lz + .5, 0); lctx.lineTo(g * lz + .5, lsize); lctx.stroke();
        lctx.beginPath(); lctx.moveTo(0, g * lz + .5); lctx.lineTo(lsize, g * lz + .5); lctx.stroke();
      }
      var o = (half - rad) * lz, s = (2 * rad + 1) * lz;
      lctx.lineWidth = 2; lctx.strokeStyle = '#000'; lctx.strokeRect(o + 1, o + 1, s - 2, s - 2);
      lctx.strokeStyle = '#fff'; lctx.strokeRect(o + 3, o + 3, s - 6, s - 6);
      var c = sample(x, y);
      el.lhex.textContent = c ? toHex(c.r, c.g, c.b) : '';
    }

    function placeLoupe(cssX, cssY, touch) {
      var box = el.canvas.getBoundingClientRect(), L = lsize + 6;
      var lx = cssX + 18, ly = cssY + 18;
      if (touch) { lx = cssX - L / 2; ly = cssY - L - 36; }
      if (lx + L > box.width) lx = cssX - L - 18;
      if (lx < 0) lx = Math.max(0, Math.min(box.width - L, cssX + 18));
      if (ly + L > box.height) ly = cssY - L - 18;
      if (ly < -L / 2) ly = cssY + 36;
      el.loupe.style.transform = 'translate(' + Math.round(lx) + 'px,' + Math.round(ly) + 'px)';
      el.loupe.style.display = 'block';
    }

    function fromEvent(e) {
      var r = el.canvas.getBoundingClientRect();
      var cx = clamp(e.clientX - r.left, 0, r.width - 0.001), cy = clamp(e.clientY - r.top, 0, r.height - 0.001);
      return { x: Math.floor(cx / r.width * W), y: Math.floor(cy / r.height * H), cssX: cx, cssY: cy };
    }

    function pick(x, y, silent) {
      if (!imgData) return;
      var c = sample(x, y);
      if (!c) return;
      var ox = toOrig(x, W, srcW), oy = toOrig(y, H, srcH);
      setPanel(c, '위치 X ' + ox.toLocaleString() + ', Y ' + oy.toLocaleString() + (c.a < 255 ? ' · 투명도 ' + Math.round((1 - c.a / 255) * 100) + '%' : ''));
      if (!silent) msg('색상을 선택했습니다: ' + toHex(c.r, c.g, c.b) + ' — 복사 버튼으로 코드를 가져가세요.', 'ok');
    }

    function cssOfCursor() {
      var r = el.canvas.getBoundingClientRect();
      return { x: (cursor.x + 0.5) / W * r.width, y: (cursor.y + 0.5) / H * r.height };
    }

    function runPalette() {
      if (!ctx) return;
      var k = +el.count.value || CONFIG.PALETTE_DEFAULT;
      var side = CONFIG.PALETTE_SAMPLE_SIDE, sc = Math.min(1, side / Math.max(W, H));
      var sw = Math.max(1, Math.round(W * sc)), sh = Math.max(1, Math.round(H * sc));
      var tmp = document.createElement('canvas'); tmp.width = sw; tmp.height = sh;
      var tctx = tmp.getContext('2d', { willReadFrequently: true });
      tctx.imageSmoothingEnabled = true; tctx.imageSmoothingQuality = 'high';
      tctx.drawImage(el.canvas, 0, 0, sw, sh);
      var res = extractPalette(tctx.getImageData(0, 0, sw, sh).data, k);
      palette = res.colors;
      el.strip.innerHTML = ''; el.grid.innerHTML = '';
      if (!palette.length) {
        el.grid.innerHTML = '<li class="bdcp-meta">투명한 부분만 있어 팔레트를 만들 수 없습니다.</li>';
        return;
      }
      palette.forEach(function (c, idx) {
        var pct = c.ratio * 100, pctText = (pct >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10) + '%';
        var seg = h('i'); seg.style.cssText = 'display:block;height:100%;background:' + c.hex + ';flex:' + Math.max(c.ratio, 0.004) + ' 0 0;';
        el.strip.appendChild(seg);
        var li = h('li');
        var btn = h('button', { type: 'button', 'class': 'bdcp-chip', 'aria-label': (idx + 1) + '번째 색 ' + c.hex + ', 약 ' + pctText }, '<i style="background:' + c.hex + '"></i><span>' + c.hex + '<small>약 ' + pctText + '</small></span>');
        btn.addEventListener('click', function () {
          setPanel({ r: c.r, g: c.g, b: c.b, a: 255 }, '팔레트 ' + (idx + 1) + '번 · 약 ' + pctText);
          msg('팔레트 색을 선택했습니다: ' + c.hex, 'ok');
        });
        li.appendChild(btn); el.grid.appendChild(li);
      });
      if (palette.length < k) msg('색 종류가 적어 ' + palette.length + '색만 추출했습니다.', '');
    }

    /* ---------- 이벤트 ---------- */
    el.file.addEventListener('change', function () { load(el.file.files && el.file.files[0]); el.file.value = ''; });
    function hasFiles(e) { var t = e.dataTransfer && e.dataTransfer.types; return t && Array.prototype.indexOf.call(t, 'Files') >= 0; }
    el.drop.addEventListener('dragover', function (e) { if (!hasFiles(e)) return; e.preventDefault(); el.drop.classList.add('is-over'); });
    el.drop.addEventListener('dragleave', function () { el.drop.classList.remove('is-over'); });
    el.drop.addEventListener('drop', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault(); el.drop.classList.remove('is-over');
      load(e.dataTransfer.files[0]);
    });
    document.addEventListener('paste', function (e) {
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      for (var i = 0; i < items.length; i++) {
        if (items[i].kind === 'file' && /^image\//.test(items[i].type)) {
          var f = items[i].getAsFile();
          if (f) { e.preventDefault(); load(f); root.scrollIntoView({ block: 'nearest' }); }
          return;
        }
      }
    });

    el.canvas.addEventListener('pointermove', function (e) {
      if (!imgData) return;
      if (e.pointerType !== 'mouse' && !touchActive) return;
      var p = fromEvent(e); cursor.x = p.x; cursor.y = p.y;
      drawLoupe(p.x, p.y); placeLoupe(p.cssX, p.cssY, e.pointerType !== 'mouse');
      if (e.pointerType !== 'mouse') e.preventDefault();
    });
    el.canvas.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') el.loupe.style.display = 'none'; });
    el.canvas.addEventListener('pointerdown', function (e) {
      if (!imgData) return;
      var p = fromEvent(e); cursor.x = p.x; cursor.y = p.y;
      if (e.pointerType !== 'mouse') {
        touchActive = true;
        try { el.canvas.setPointerCapture(e.pointerId); } catch (x) { /* 무시 */ }
        drawLoupe(p.x, p.y); placeLoupe(p.cssX, p.cssY, true);
        e.preventDefault();
      }
    });
    el.canvas.addEventListener('pointerup', function (e) {
      if (!imgData) return;
      var p = fromEvent(e); cursor.x = p.x; cursor.y = p.y;
      pick(p.x, p.y);
      if (e.pointerType !== 'mouse') { touchActive = false; el.loupe.style.display = 'none'; }
    });
    el.canvas.addEventListener('pointercancel', function () { touchActive = false; el.loupe.style.display = 'none'; });
    el.canvas.addEventListener('keydown', function (e) {
      if (!imgData) return;
      var step = e.shiftKey ? 10 : 1, k = e.key, moved = true;
      if (k === 'ArrowLeft') cursor.x -= step;
      else if (k === 'ArrowRight') cursor.x += step;
      else if (k === 'ArrowUp') cursor.y -= step;
      else if (k === 'ArrowDown') cursor.y += step;
      else if (k === 'Enter' || k === ' ') { e.preventDefault(); pick(cursor.x, cursor.y); return; }
      else if (k === 'Escape') { el.loupe.style.display = 'none'; return; }
      else moved = false;
      if (!moved) return;
      e.preventDefault();
      cursor.x = clamp(cursor.x, 0, W - 1); cursor.y = clamp(cursor.y, 0, H - 1);
      var c = cssOfCursor(); drawLoupe(cursor.x, cursor.y); placeLoupe(c.x, c.y, false);
    });
    el.canvas.addEventListener('focus', function () {
      if (!imgData) return;
      var c = cssOfCursor(); drawLoupe(cursor.x, cursor.y); placeLoupe(c.x, c.y, false);
    });
    el.canvas.addEventListener('blur', function () { el.loupe.style.display = 'none'; });

    el.radius.addEventListener('change', function () {
      if (imgData && el.pos.textContent.indexOf('위치') === 0) pick(cursor.x, cursor.y, true);
    });
    el.count.addEventListener('change', runPalette);

    root.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-copy]') : null;
      if (!b || !root.contains(b)) return;
      if (!current) { msg('먼저 사진에서 색상을 선택해 주세요.', 'error'); return; }
      var text = current[b.getAttribute('data-copy')];
      copyText(text).then(function (ok) {
        msg(ok ? '복사했습니다: ' + text : '복사하지 못했습니다. 코드를 길게 눌러 직접 복사해 주세요.', ok ? 'ok' : 'error');
      });
    });
    el.copyall.addEventListener('click', function () {
      if (!palette.length) { msg('먼저 사진을 불러와 주세요.', 'error'); return; }
      var text = palette.map(function (c) { return c.hex; }).join(', ');
      copyText(text).then(function (ok) {
        msg(ok ? '팔레트 HEX를 복사했습니다: ' + text : '복사하지 못했습니다. 각 색 칸의 코드를 직접 확인해 주세요.', ok ? 'ok' : 'error');
      });
    });
    el.reset.addEventListener('click', function () {
      imgData = null; ctx = null; palette = []; current = null;
      el.canvas.width = 1; el.canvas.height = 1;
      el.work.style.display = 'none'; el.loupe.style.display = 'none';
      setPanel(null); msg('');
      el.file.click();
    });

    var api = { load: load, extractPalette: extractPalette, getPalette: function () { return palette.slice(); }, getCurrent: function () { return current; }, pickAt: pick };
    root.barodoguApi = api;
    return api;
  }

  barodogu.imageColorPicker = {
    version: CONFIG.VERSION,
    CONFIG: CONFIG,
    init: init,
    toHex: toHex,
    rgbToHsl: rgbToHsl,
    rgbToLab: rgbToLab,
    relLuminance: relLuminance,
    extractPalette: extractPalette,
    sampleAt: sampleAt
  };

  function auto() { if (document.getElementById(CONFIG.ROOT_ID)) init(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto, { once: true });
  else auto();
})(window, document);
