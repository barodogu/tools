/*! 착착도구 · 긴 캡처 자르기 v0.3.0 | 이미지는 브라우저 안에서만 처리 */
(function () {
  'use strict';
  var root = document.getElementById('bd-longcut');
  if (!root || root.getAttribute('data-ready')) return;
  root.setAttribute('data-ready', '1');

  var MAX_PIECES = 50;
  var MAX_CANVAS_AREA = 16000000;   // iOS 사파리 캔버스 한도(약 16.7M px) 여유분
  var MAX_SRC_PIXELS = 150000000;   // 원본 1.5억 픽셀 초과는 거절
  var MIN_PIECE = 40;               // 한 조각 최소 높이(px)
  var JSZIP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  var PDFLIB_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
  var OVERLAP = [0, 0.03, 0.06, 0.1];   // 겹침 여백(가로 폭 대비 비율): 없음·조금·보통·많이
  var PRESETS = {
    ig45:   { label: '인스타 4:5', desc: '1080×1350', ratio: 5 / 4, outW: 1080 },
    ig11:   { label: '인스타 1:1', desc: '1080×1080', ratio: 1, outW: 1080 },
    ig34:   { label: '인스타 3:4', desc: '1080×1440', ratio: 4 / 3, outW: 1080 },
    a4:     { label: 'A4 인쇄', desc: '세로 1:1.41', ratio: 1.4142, outW: 0 },
    equal:  { label: 'N장 균등', desc: '장수 지정' },
    height: { label: '높이 지정', desc: 'px 지정' }
  };

  var S = { img: null, url: null, name: 'capture', w: 0, h: 0,
            mode: 'ig45', n: 3, ph: 2000, fmt: 'image/png', bg: '#ffffff', smart: true, ov: 0,
            cuts: null, manual: false, outs: [], outUrls: [], busy: false };

  injectCss();
  root.innerHTML =
    '<div class="bdlc">' +
      '<label class="bdlc-drop">' +
        '<input type="file" accept="image/*,.heic,.heif" class="bdlc-file">' +
        '<strong>🖼️ 긴 캡처 이미지 선택</strong>' +
        '<span>여기를 눌러 고르세요 · PC는 끌어다 놓기, 캡처 후 Ctrl+V도 됩니다</span>' +
      '</label>' +
      '<p class="bdlc-safe">🔒 이미지는 서버로 전송되지 않고 이 브라우저 안에서만 처리됩니다.</p>' +
      '<div class="bdlc-msg" role="status" aria-live="polite"></div>' +
      '<div class="bdlc-work" hidden>' +
        '<div class="bdlc-info"></div>' +
        '<div class="bdlc-sec"><div class="bdlc-h">① 자르는 방식</div>' +
          '<div class="bdlc-presets"></div>' +
          '<div class="bdlc-opt bdlc-opt-n" hidden><label>장수 <input type="number" min="2" max="' + MAX_PIECES + '" value="3" class="bdlc-n" inputmode="numeric"> 장</label></div>' +
          '<div class="bdlc-opt bdlc-opt-h" hidden><label>한 장 높이 <input type="number" min="100" step="10" value="2000" class="bdlc-ph" inputmode="numeric"> px</label></div>' +
          '<div class="bdlc-opt"><label class="bdlc-chk"><input type="checkbox" class="bdlc-smart" checked> <b>글자 안 잘리게</b> <small>(스마트 자르기 · 자르는 위치를 가까운 빈 줄로 옮김)</small></label></div>' +
          '<div class="bdlc-opt"><label>겹침 여백 <select class="bdlc-ov">' +
            '<option value="0">없음</option><option value="1">조금</option><option value="2">보통</option><option value="3">많이</option>' +
          '</select></label> <small class="bdlc-sub">다음 장 위쪽에 앞 장 끝부분을 살짝 겹쳐 넣어 읽기 흐름이 이어져요</small></div>' +
          '<div class="bdlc-opt bdlc-opt-bg"><label>남는 칸 색 <input type="color" value="#ffffff" class="bdlc-bg"></label></div>' +
        '</div>' +
        '<div class="bdlc-sec"><div class="bdlc-h">② 저장 형식</div>' +
          '<select class="bdlc-fmt">' +
            '<option value="image/png">PNG (글자 선명, 기본)</option>' +
            '<option value="image/jpeg">JPG (용량 작게)</option>' +
            '<option value="image/webp">WebP (용량 더 작게)</option>' +
          '</select>' +
        '</div>' +
        '<div class="bdlc-sec"><div class="bdlc-h">③ 미리보기 <span class="bdlc-count"></span></div>' +
          '<p class="bdlc-tip">빨간 선의 <b>⇕</b>를 끌어 위치를 옮기고, <b>×</b>로 선을 지울 수 있어요.</p>' +
          '<div class="bdlc-tools">' +
            '<button type="button" class="bdlc-add">＋ 자르는 선 추가</button>' +
            '<button type="button" class="bdlc-reset">↺ 자동 위치로</button>' +
          '</div>' +
          '<div class="bdlc-pwrap"><canvas class="bdlc-loupe" aria-hidden="true"></canvas>' +
          '<div class="bdlc-preview"><div class="bdlc-stage"></div></div></div>' +
        '</div>' +
        '<div class="bdlc-actions"><button type="button" class="bdlc-run">✂️ 자르기</button></div>' +
        '<div class="bdlc-result" hidden>' +
          '<div class="bdlc-h">④ 결과</div>' +
          '<div class="bdlc-save">' +
            '<button type="button" class="bdlc-zip">🗜️ ZIP으로 한 번에 저장</button>' +
            '<button type="button" class="bdlc-pdf">📄 PDF로 저장 (A4)</button>' +
            '<button type="button" class="bdlc-all">⬇️ 한 장씩 모두 저장</button>' +
          '</div>' +
          '<p class="bdlc-tip">💡 휴대폰은 「한 장씩 모두 저장」이 갤러리에서 바로 보여 편해요. 크롬은 처음 한 번 "여러 파일 다운로드"를 물으니 허용을 눌러 주세요.</p>' +
          '<ul class="bdlc-list"></ul>' +
        '</div>' +
      '</div>' +
    '</div>';

  function $(s) { return root.querySelector(s); }
  var elFile = $('.bdlc-file'), elDrop = $('.bdlc-drop'), elMsg = $('.bdlc-msg'),
      elWork = $('.bdlc-work'), elInfo = $('.bdlc-info'), elPresets = $('.bdlc-presets'),
      elN = $('.bdlc-n'), elPh = $('.bdlc-ph'), elBg = $('.bdlc-bg'), elFmt = $('.bdlc-fmt'),
      elSmart = $('.bdlc-smart'), elCount = $('.bdlc-count'), elStage = $('.bdlc-stage'),
      elRun = $('.bdlc-run'), elResult = $('.bdlc-result'), elList = $('.bdlc-list'),
      elAll = $('.bdlc-all'), elZip = $('.bdlc-zip'), elAdd = $('.bdlc-add'), elReset = $('.bdlc-reset'),
      elOv = $('.bdlc-ov'), elPdf = $('.bdlc-pdf'), elLoupe = $('.bdlc-loupe');

  // ---------- 프리셋 버튼 ----------
  Object.keys(PRESETS).forEach(function (id) {
    var p = PRESETS[id], b = document.createElement('button');
    b.type = 'button'; b.className = 'bdlc-pre'; b.setAttribute('data-id', id);
    b.innerHTML = '<b>' + p.label + '</b><small>' + p.desc + '</small>';
    b.addEventListener('click', function () { S.mode = id; syncMode(); autoCuts(); });
    elPresets.appendChild(b);
  });

  function syncMode() {
    var bs = elPresets.querySelectorAll('.bdlc-pre');
    for (var i = 0; i < bs.length; i++) bs[i].setAttribute('aria-pressed', bs[i].getAttribute('data-id') === S.mode ? 'true' : 'false');
    $('.bdlc-opt-n').hidden = S.mode !== 'equal';
    $('.bdlc-opt-h').hidden = S.mode !== 'height';
    $('.bdlc-opt-bg').hidden = !PRESETS[S.mode].ratio;
  }

  // ---------- 입력 ----------
  elFile.addEventListener('change', function () { loadFile(elFile.files && elFile.files[0]); elFile.value = ''; });
  ['dragenter', 'dragover'].forEach(function (t) {
    elDrop.addEventListener(t, function (e) { e.preventDefault(); elDrop.classList.add('is-over'); });
  });
  ['dragleave', 'drop'].forEach(function (t) {
    elDrop.addEventListener(t, function (e) { e.preventDefault(); elDrop.classList.remove('is-over'); });
  });
  elDrop.addEventListener('drop', function (e) {
    loadFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
  });
  document.addEventListener('paste', function (e) {
    var items = (e.clipboardData && e.clipboardData.items) || [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf('image/') === 0) {
        var f = items[i].getAsFile();
        if (f) { e.preventDefault(); loadFile(f, true); return; }
      }
    }
  });

  var tN, tPh;
  elN.addEventListener('input', function () { S.n = parseInt(elN.value, 10) || 0; clearTimeout(tN); tN = setTimeout(autoCuts, 250); });
  elPh.addEventListener('input', function () { S.ph = parseInt(elPh.value, 10) || 0; clearTimeout(tPh); tPh = setTimeout(autoCuts, 250); });
  elSmart.addEventListener('change', function () { S.smart = elSmart.checked; autoCuts(); });
  elBg.addEventListener('input', function () { S.bg = elBg.value; clearResult(); });
  elFmt.addEventListener('change', function () { S.fmt = elFmt.value; clearResult(); });
  elRun.addEventListener('click', run);
  elAll.addEventListener('click', downloadAll);
  elZip.addEventListener('click', downloadZip);
  elPdf.addEventListener('click', downloadPdf);
  elOv.addEventListener('change', function () { S.ov = +elOv.value; autoCuts(); });
  elAdd.addEventListener('click', addLine);
  elReset.addEventListener('click', autoCuts);

  function isHeic(f) { return /heic|heif/i.test(f.type || '') || /\.(heic|heif)$/i.test(f.name || ''); }

  function loadFile(f, pasted) {
    if (!f || S.busy) return;
    var heic = isHeic(f);
    if (!heic && !/^image\//.test(f.type || '')) { msg('이미지 파일만 선택할 수 있어요.', 'err'); return; }
    msg('이미지를 여는 중이에요…');
    var url = URL.createObjectURL(f), img = new Image();
    img.onload = function () {
      var w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) { URL.revokeObjectURL(url); msg('이미지 크기를 읽을 수 없어요.', 'err'); return; }
      if (w * h > MAX_SRC_PIXELS) {
        URL.revokeObjectURL(url);
        msg('이미지가 너무 커요 (' + fmtNum(w) + '×' + fmtNum(h) + 'px). 캡처를 두세 번으로 나눠 찍어 주세요.', 'err');
        return;
      }
      if (S.url) URL.revokeObjectURL(S.url);
      S.img = img; S.url = url; S.w = w; S.h = h;
      S.name = (pasted || !f.name) ? 'capture' : f.name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '_') || 'capture';
      elInfo.textContent = (pasted ? '붙여넣은 이미지' : f.name) + ' · ' + fmtNum(w) + ' × ' + fmtNum(h) + ' px · ' + fmtSize(f.size);
      elWork.hidden = false;
      var stImg = new Image(); stImg.src = url; stImg.alt = '원본 미리보기'; stImg.className = 'bdlc-src'; stImg.draggable = false;
      elStage.innerHTML = ''; elStage.appendChild(stImg);
      msg('');
      syncMode(); autoCuts();
      if (h <= w) msg('세로가 짧은 이미지예요. 1장만 나올 수 있어요.', 'warn');
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      msg(heic ? '이 브라우저에서는 아이폰 HEIC 사진을 열 수 없어요. 아이폰 설정 → 카메라 → 포맷에서 「높은 호환성」을 고르거나, 스크린샷(PNG)으로 다시 시도해 주세요.'
               : '이미지를 열 수 없어요. 파일이 손상되지 않았는지 확인해 주세요.', 'err');
    };
    img.src = url;
  }

  // ---------- 한 장 최대 높이 ----------
  function maxPiece() {
    var p = PRESETS[S.mode];
    if (p.ratio) return Math.round(S.w * p.ratio);
    if (S.mode === 'height') return Math.round(S.ph);
    return Infinity;
  }

  // 겹침 여백(원본 px)
  function ovPx() {
    var v = Math.round(S.w * OVERLAP[S.ov]);
    var mx = maxPiece();
    if (mx !== Infinity) v = Math.min(v, Math.round(mx * 0.3));
    return v;
  }
  // i번째 조각이 담을 수 있는 원본 높이 (2번째부터는 겹침 여백만큼 줄어듦)
  function maxFor(i) {
    var mx = maxPiece();
    return i > 0 && mx !== Infinity ? mx - ovPx() : mx;
  }

  // ---------- 스마트 자르기: 빈 줄 찾기 ----------
  var scanCv = null;
  // [lo, hi) 구간 각 행의 '글자 정도'(0=완전히 균일)를 반환
  function scanRows(lo, hi) {
    var sw = Math.min(S.w, 360), hh = hi - lo;
    if (hh <= 0) return [];
    if (!scanCv) scanCv = document.createElement('canvas');
    scanCv.width = sw; scanCv.height = hh;
    var ctx = scanCv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(S.img, 0, lo, S.w, hh, 0, 0, sw, hh);
    var d = ctx.getImageData(0, 0, sw, hh).data, out = new Array(hh), y, x, i, sum, lum = new Float32Array(sw);
    for (y = 0; y < hh; y++) {
      sum = 0;
      for (x = 0; x < sw; x++) {
        i = (y * sw + x) * 4;
        lum[x] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        sum += lum[x];
      }
      var mean = sum / sw, dev = 0;
      for (x = 0; x < sw; x++) if (Math.abs(lum[x] - mean) > 22) dev++;
      out[y] = dev / sw;
    }
    return out;
  }

  // target 근처 [lo, hi]에서 자를 위치를 찾음. upOnly면 target보다 아래로는 안 감
  function snap(target, lo, hi, upOnly) {
    lo = Math.max(1, Math.round(lo)); hi = Math.min(S.h - 1, Math.round(hi));
    if (hi - lo < 3) return target;
    var sc = scanRows(lo, hi + 1), BLANK = 0.004, runs = [], s = -1, k;
    for (k = 0; k <= sc.length; k++) {
      var blank = k < sc.length && sc[k] <= BLANK;
      if (blank && s < 0) s = k;
      if (!blank && s >= 0) { runs.push([lo + s, lo + k - 1]); s = -1; }
    }
    var best = null, bestD = Infinity;
    runs.forEach(function (r) {
      var mid = Math.round((r[0] + r[1] + 1) / 2);
      if (upOnly) { if (r[0] > target) return; mid = Math.min(mid, target); }
      var dist = Math.abs(mid - target) - Math.min(r[1] - r[0], 12) * 2; // 넓은 여백 약간 우대
      if (dist < bestD) { bestD = dist; best = mid; }
    });
    if (best !== null) return best;
    // 빈 줄이 없으면 가장 덜 붐비는 행
    var bi = -1, bv = Infinity;
    for (k = 0; k < sc.length; k++) {
      var y = lo + k;
      if (upOnly && y > target) break;
      var v = sc[k] + Math.abs(y - target) / (hi - lo + 1) * 0.02;
      if (v < bv) { bv = v; bi = y; }
    }
    return bi > 0 ? bi : target;
  }

  // ---------- 자동 자르는 위치 ----------
  function autoCuts() {
    clearResult();
    S.manual = false;
    if (!S.img) return;
    var H = S.h, cuts = [], i, y;
    if (S.mode === 'equal') {
      var n = Math.round(S.n);
      if (!(n >= 2)) return fail('장수는 2 이상으로 입력해 주세요.');
      if (n > MAX_PIECES) return fail('최대 ' + MAX_PIECES + '장까지 나눌 수 있어요.');
      if (H / n < MIN_PIECE) return fail('한 장이 너무 얇아져요. 장수를 줄여 주세요.');
      var seg = H / n, win = Math.min(300, seg * 0.15), prev = 0;
      for (i = 1; i < n; i++) {
        var t = Math.round(i * seg);
        var c = S.smart ? snap(t, Math.max(prev + MIN_PIECE, t - win), Math.min(H - MIN_PIECE, t + win), false) : t;
        cuts.push(c); prev = c;
      }
    } else {
      if (S.mode === 'height' && !(maxPiece() >= 100)) return fail('한 장 높이는 100px 이상으로 입력해 주세요.');
      if (!fillFrom(0, cuts)) return fail(MAX_PIECES + '장을 넘어요. 한 장 높이를 늘리거나 다른 방식을 골라 주세요.');
    }
    S.cuts = cuts;
    if (elMsg.className.indexOf('is-err') > -1) msg('');
    draw();
  }

  // y부터 끝까지 최대 높이 단위로 자르는 선을 이어 붙임 (실패 시 false)
  function fillFrom(y, cuts) {
    var H = S.h, ph, w2;
    while (y + (ph = maxFor(cuts.length)) < H) {
      w2 = Math.min(300, Math.round(ph * 0.2));
      var tg = y + ph;
      var cc = S.smart ? snap(tg, Math.max(y + ph * 0.6, tg - w2), tg, true) : tg;
      if (cc <= y + MIN_PIECE) cc = tg;
      cuts.push(cc); y = cc;
      if (cuts.length + 1 > MAX_PIECES) return false;
    }
    return true;
  }

  // 선 idx를 옮긴 뒤, 그 아래 조각이 최대 높이를 넘으면 아래 선들을 다시 맞춤
  function reflowAfter(idx) {
    if (maxPiece() === Infinity) return 'ok';
    var bounds = S.cuts.concat([S.h]);
    for (var j = idx; j < bounds.length - 1; j++) {
      if (bounds[j + 1] - bounds[j] > maxFor(j + 1)) {
        var keep = S.cuts.slice(0, j + 1);
        if (!fillFrom(keep[j], keep)) return false;
        S.cuts = keep;
        return 'reflowed';
      }
    }
    return 'ok';
  }

  function fail(t) { S.cuts = null; draw(); msg(t, 'err'); }

  // withOv: 실제 저장할 때 겹침 여백을 반영
  function pieces(withOv) {
    var b = [0].concat(S.cuts, [S.h]), out = [], ov = withOv ? ovPx() : 0;
    for (var i = 0; i < b.length - 1; i++) {
      var o = i > 0 ? Math.min(ov, b[i] - b[i - 1]) : 0;
      // 겹침 시작점도 글자 중간이 아니도록 빈 줄로 (겹침은 줄어들기만 함)
      if (o > 10 && S.smart) o = b[i] - snap(b[i] - o, b[i] - o, b[i] - Math.round(o * 0.4), false);
      out.push({ sy: b[i] - o, sh: b[i + 1] - b[i] + o });
    }
    return out;
  }

  // ---------- 출력 크기 ----------
  function outSize(c) {
    var p = PRESETS[S.mode];
    var scale = p.outW ? p.outW / S.w : 1;
    var dw = Math.round(S.w * scale);
    var dh = p.ratio ? Math.round(dw * p.ratio) : Math.round(c.sh * scale);
    if (dw * dh > MAX_CANVAS_AREA) {
      var k = Math.sqrt(MAX_CANVAS_AREA / (dw * dh));
      scale *= k; dw = Math.floor(dw * k); dh = Math.floor(dh * k);
    }
    return { scale: scale, dw: Math.max(1, dw), dh: Math.max(1, dh) };
  }

  // ---------- 미리보기 그리기 ----------
  function draw() {
    var old = elStage.querySelectorAll('.bdlc-line, .bdlc-no, .bdlc-ovband');
    for (var i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);
    if (!S.cuts) { elCount.textContent = ''; elRun.disabled = true; elAdd.disabled = true; return; }
    elRun.disabled = false;
    var ps = pieces();
    elAdd.disabled = ps.length >= MAX_PIECES;
    var o = outSize(ps[0]);
    elCount.textContent = '· 총 ' + ps.length + '장' + (PRESETS[S.mode].ratio ? ' · 한 장 ' + fmtNum(o.dw) + '×' + fmtNum(o.dh) + 'px' : '') + (S.manual ? ' · 직접 조정함' : '');
    ps.forEach(function (c, idx) {
      var no = document.createElement('div'); no.className = 'bdlc-no';
      no.style.top = (c.sy / S.h * 100) + '%'; no.textContent = idx + 1;
      elStage.appendChild(no);
    });
    var ov = ovPx();
    if (ov > 0) S.cuts.forEach(function (y) {
      var band = document.createElement('div'); band.className = 'bdlc-ovband';
      band.style.top = ((y - ov) / S.h * 100) + '%'; band.style.height = (ov / S.h * 100) + '%';
      elStage.appendChild(band);
    });
    S.cuts.forEach(function (y, idx) {
      var ln = document.createElement('div'); ln.className = 'bdlc-line';
      ln.style.top = (y / S.h * 100) + '%';
      ln.innerHTML = '<span class="bdlc-grip" role="slider" tabindex="0" aria-label="' + (idx + 1) + '번째 자르는 선 위치" aria-valuemin="0" aria-valuemax="' + S.h + '" aria-valuenow="' + y + '">⇕</span>' +
                     '<button type="button" class="bdlc-del" aria-label="' + (idx + 1) + '번째 자르는 선 지우기">×</button>';
      bindLine(ln, idx);
      elStage.appendChild(ln);
    });
  }

  // 선 idx가 움직일 수 있는 범위
  function range(idx) {
    var prev = idx > 0 ? S.cuts[idx - 1] : 0, next = idx < S.cuts.length - 1 ? S.cuts[idx + 1] : S.h, mx = maxFor(idx);
    // 아래 조각이 길어지는 건 놓은 뒤 아래 선들을 다시 맞추므로 허용
    return [prev + MIN_PIECE, Math.min(next - MIN_PIECE, prev + mx)];
  }

  function bindLine(ln, idx) {
    var grip = ln.querySelector('.bdlc-grip'), del = ln.querySelector('.bdlc-del');
    var dragging = false;
    function moveTo(clientY) {
      var r = elStage.getBoundingClientRect();
      var y = Math.round((clientY - r.top) / r.height * S.h), rg = range(idx);
      y = Math.max(rg[0], Math.min(rg[1], y));
      S.cuts[idx] = y; ln.style.top = (y / S.h * 100) + '%';
      grip.setAttribute('aria-valuenow', y);
      var nos = elStage.querySelectorAll('.bdlc-no');
      if (nos[idx + 1]) nos[idx + 1].style.top = ln.style.top;
      var bands = elStage.querySelectorAll('.bdlc-ovband'), ov = ovPx();
      if (bands[idx]) bands[idx].style.top = ((y - ov) / S.h * 100) + '%';
      showLoupe(y);
    }
    grip.addEventListener('pointerdown', function (e) {
      e.preventDefault(); dragging = true; ln.classList.add('is-drag');
      try { grip.setPointerCapture(e.pointerId); } catch (_) {}
      showLoupe(S.cuts[idx]);
    });
    grip.addEventListener('pointermove', function (e) { if (dragging) moveTo(e.clientY); });
    function end() {
      if (!dragging) return;
      dragging = false; ln.classList.remove('is-drag');
      hideLoupe();
      commit(idx);
    }
    function commit(i) {
      var r = reflowAfter(i);
      if (!r) { autoCuts(); msg(MAX_PIECES + '장을 넘어서 자동 위치로 되돌렸어요.', 'warn'); return; }
      S.manual = true; clearResult(); draw();
      msg(r === 'reflowed' ? '아래쪽 선들은 한 장 최대 높이에 맞춰 다시 정렬했어요.' : '', 'warn');
    }
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
    grip.addEventListener('keydown', function (e) {
      var step = e.shiftKey ? 50 : 5, d = 0;
      if (e.key === 'ArrowUp') d = -step; else if (e.key === 'ArrowDown') d = step; else return;
      e.preventDefault();
      var rg = range(idx);
      S.cuts[idx] = Math.max(rg[0], Math.min(rg[1], S.cuts[idx] + d));
      commit(idx);
      var g = elStage.querySelectorAll('.bdlc-grip')[idx]; if (g) g.focus();
    });
    del.addEventListener('click', function () {
      var prev = idx > 0 ? S.cuts[idx - 1] : 0, next = idx < S.cuts.length - 1 ? S.cuts[idx + 1] : S.h;
      if (next - prev > maxFor(idx)) {
        msg('이 선을 지우면 한 장이 최대 높이(' + fmtNum(maxFor(idx)) + 'px)를 넘어요. 선을 옮겨서 조정해 주세요.', 'warn');
        return;
      }
      S.cuts.splice(idx, 1); S.manual = true; clearResult(); draw(); msg('');
    });
  }

  function addLine() {
    if (!S.cuts) return;
    var ps = pieces();
    if (ps.length >= MAX_PIECES) return;
    var bi = 0;
    ps.forEach(function (c, i) { if (c.sh > ps[bi].sh) bi = i; });
    var c = ps[bi];
    if (c.sh < MIN_PIECE * 2) { msg('더 나눌 수 있는 조각이 없어요.', 'warn'); return; }
    var t = c.sy + Math.round(c.sh / 2), win = Math.min(200, c.sh * 0.2);
    var y = S.smart ? snap(t, Math.max(c.sy + MIN_PIECE, t - win), Math.min(c.sy + c.sh - MIN_PIECE, t + win), false) : t;
    S.cuts.splice(bi, 0, y); S.manual = true; clearResult(); draw(); msg('');
  }

  // ---------- 돋보기 (선을 끄는 동안 원본 확대) ----------
  var LOUPE_ZOOM = 2;
  function showLoupe(y) {
    var wrapW = elLoupe.parentNode.clientWidth, cssW = Math.min(wrapW - 16, 420), cssH = 120;
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    var stW = elStage.clientWidth || 1;
    // 미리보기보다 LOUPE_ZOOM배 크게: 원본에서 잘라올 가로 폭
    var srcW = Math.min(S.w, S.w * cssW / (stW * LOUPE_ZOOM));
    var k = cssW / srcW, srcH = cssH / k;
    var sx = (S.w - srcW) / 2, sy = y - srcH / 2;
    elLoupe.style.width = cssW + 'px'; elLoupe.style.height = cssH + 'px';
    elLoupe.width = Math.round(cssW * dpr); elLoupe.height = Math.round(cssH * dpr);
    var ctx = elLoupe.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#e5e7eb'; ctx.fillRect(0, 0, cssW, cssH);
    var a = Math.max(0, sy), bEnd = Math.min(S.h, sy + srcH);
    if (bEnd > a) ctx.drawImage(S.img, sx, a, srcW, bEnd - a, 0, (a - sy) * k, cssW, (bEnd - a) * k);
    ctx.strokeStyle = '#e53935'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(0, cssH / 2); ctx.lineTo(cssW, cssH / 2); ctx.stroke();
    // 손가락(선)이 미리보기 위쪽에 있으면 돋보기를 아래쪽에 표시
    var pv = elStage.parentNode.getBoundingClientRect(), st = elStage.getBoundingClientRect();
    var lineY = st.top + y / S.h * st.height;
    elLoupe.classList.toggle('at-bottom', lineY < pv.top + pv.height / 2);
    elLoupe.classList.add('is-on');
  }
  function hideLoupe() { elLoupe.classList.remove('is-on'); }

  // ---------- 자르기 ----------
  function renderPiece(c) {
    var p = PRESETS[S.mode], o = outSize(c), cv = document.createElement('canvas');
    cv.width = o.dw; cv.height = o.dh;
    var ctx = cv.getContext('2d');
    if (p.ratio || S.fmt === 'image/jpeg') {
      ctx.fillStyle = p.ratio ? S.bg : '#ffffff';
      ctx.fillRect(0, 0, o.dw, o.dh);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(S.img, 0, c.sy, S.w, c.sh, 0, 0, o.dw, Math.min(o.dh, Math.round(c.sh * o.scale)));
    return new Promise(function (res, rej) {
      cv.toBlob(function (b) {
        cv.width = 0; cv.height = 0;
        if (b) res({ blob: b, w: o.dw, h: o.dh }); else rej(new Error('toBlob 실패'));
      }, S.fmt, 0.92);
    });
  }

  function run() {
    if (!S.cuts || S.busy) return;
    S.busy = true; elRun.disabled = true; clearResult();
    var cuts = pieces(true), out = [], i = 0;
    function next() {
      if (i >= cuts.length) { done(); return; }
      msg('자르는 중… ' + (i + 1) + ' / ' + cuts.length);
      renderPiece(cuts[i]).then(function (r) { out.push(r); i++; setTimeout(next, 0); })
        .catch(function () {
          S.busy = false; elRun.disabled = false;
          msg((i + 1) + '번째 조각을 만들지 못했어요. 기기 메모리가 부족할 수 있어요. 한 장 높이를 줄이거나 PNG 대신 JPG로 해 보세요.', 'err');
        });
    }
    function done() {
      S.busy = false; elRun.disabled = false;
      var pad = Math.max(2, String(out.length).length), total = 0;
      out.forEach(function (r, idx) {
        var url = URL.createObjectURL(r.blob);
        r.name = S.name + '_' + String(idx + 1).padStart(pad, '0') + '.' + extOf(r.blob.type);
        S.outUrls.push(url); S.outs.push(r); total += r.blob.size;
        var li = document.createElement('li');
        li.innerHTML = '<img alt="" loading="lazy"><div class="bdlc-meta"><b>' + (idx + 1) + '</b><span>' +
          fmtNum(r.w) + '×' + fmtNum(r.h) + ' · ' + fmtSize(r.blob.size) + '</span></div><a class="bdlc-dl">저장</a>';
        li.querySelector('img').src = url;
        var a = li.querySelector('a'); a.href = url; a.download = r.name;
        elList.appendChild(li);
      });
      elResult.hidden = false;
      var note = (S.fmt === 'image/webp' && out[0] && out[0].blob.type !== 'image/webp') ? ' (이 브라우저는 WebP 저장을 지원하지 않아 PNG로 저장했어요)' : '';
      msg('완료! ' + out.length + '장 · 합계 ' + fmtSize(total) + note, 'ok');
      elResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    next();
  }

  function downloadAll() {
    var as = elList.querySelectorAll('a.bdlc-dl'), i = 0;
    (function step() {
      if (i >= as.length) return;
      as[i++].click();
      setTimeout(step, 350);
    })();
  }

  var jszipP = null;
  function loadJSZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (jszipP) return jszipP;
    jszipP = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = JSZIP_URL; s.async = true;
      s.onload = function () { window.JSZip ? res(window.JSZip) : rej(new Error('JSZip 없음')); };
      s.onerror = function () { jszipP = null; rej(new Error('JSZip 로드 실패')); };
      document.head.appendChild(s);
    });
    return jszipP;
  }

  function downloadZip() {
    if (!S.outs.length || S.busy) return;
    S.busy = true; elZip.disabled = true;
    msg('ZIP 파일을 만드는 중…');
    loadJSZip().then(function (JSZip) {
      var zip = new JSZip();
      S.outs.forEach(function (r) { zip.file(r.name, r.blob); });
      return zip.generateAsync({ type: 'blob', compression: 'STORE' });
    }).then(function (blob) {
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = S.name + '_' + S.outs.length + '장.zip';
      document.body.appendChild(a); a.click();
      setTimeout(function () { a.parentNode && a.parentNode.removeChild(a); URL.revokeObjectURL(url); }, 30000);
      msg('ZIP 저장 완료! (' + fmtSize(blob.size) + ')', 'ok');
    }).catch(function () {
      msg('ZIP 기능을 불러오지 못했어요. 인터넷 연결이나 스크립트 차단 설정을 확인하고, 「한 장씩 모두 저장」을 써 주세요.', 'err');
    }).then(function () { S.busy = false; elZip.disabled = false; });
  }

  var pdfP = null;
  function loadPdfLib() {
    if (window.PDFLib) return Promise.resolve(window.PDFLib);
    if (pdfP) return pdfP;
    pdfP = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = PDFLIB_URL; s.async = true;
      s.onload = function () { window.PDFLib ? res(window.PDFLib) : rej(new Error('pdf-lib 없음')); };
      s.onerror = function () { pdfP = null; rej(new Error('pdf-lib 로드 실패')); };
      document.head.appendChild(s);
    });
    return pdfP;
  }

  // PDF에 넣을 수 있게 PNG/JPG 바이트로 (WebP는 JPG로 다시 변환)
  function toPdfBytes(r) {
    if (r.blob.type === 'image/png' || r.blob.type === 'image/jpeg') {
      return r.blob.arrayBuffer().then(function (b) { return { bytes: b, png: r.blob.type === 'image/png', w: r.w, h: r.h }; });
    }
    return new Promise(function (res, rej) {
      var im = new Image(), u = URL.createObjectURL(r.blob);
      im.onload = function () {
        var cv = document.createElement('canvas'); cv.width = r.w; cv.height = r.h;
        var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, r.w, r.h); cx.drawImage(im, 0, 0);
        URL.revokeObjectURL(u);
        cv.toBlob(function (b) {
          cv.width = 0; cv.height = 0;
          if (!b) return rej(new Error('변환 실패'));
          b.arrayBuffer().then(function (ab) { res({ bytes: ab, png: false, w: r.w, h: r.h }); });
        }, 'image/jpeg', 0.92);
      };
      im.onerror = function () { URL.revokeObjectURL(u); rej(new Error('읽기 실패')); };
      im.src = u;
    });
  }

  function downloadPdf() {
    if (!S.outs.length || S.busy) return;
    S.busy = true; elPdf.disabled = true;
    msg('PDF를 만드는 중…');
    var A4W = 595.28, A4H = 841.89, M = 20;
    loadPdfLib().then(function (PDFLib) {
      return PDFLib.PDFDocument.create().then(function (doc) {
        var i = 0;
        function next() {
          if (i >= S.outs.length) return doc.save();
          msg('PDF를 만드는 중… ' + (i + 1) + ' / ' + S.outs.length);
          return toPdfBytes(S.outs[i++]).then(function (d) {
            return (d.png ? doc.embedPng(d.bytes) : doc.embedJpg(d.bytes)).then(function (im) {
              var page = doc.addPage([A4W, A4H]);
              var k = Math.min((A4W - M * 2) / d.w, (A4H - M * 2) / d.h);
              var w = d.w * k, h = d.h * k;
              page.drawImage(im, { x: (A4W - w) / 2, y: A4H - M - h, width: w, height: h });
              return next();
            });
          });
        }
        return next();
      });
    }).then(function (bytes) {
      var blob = new Blob([bytes], { type: 'application/pdf' });
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = S.name + '_' + S.outs.length + '장.pdf';
      document.body.appendChild(a); a.click();
      setTimeout(function () { a.parentNode && a.parentNode.removeChild(a); URL.revokeObjectURL(url); }, 30000);
      msg('PDF 저장 완료! A4 ' + S.outs.length + '쪽 · ' + fmtSize(blob.size), 'ok');
    }).catch(function () {
      msg('PDF를 만들지 못했어요. 인터넷 연결이나 스크립트 차단 설정을 확인하고, 장수가 많으면 JPG 형식으로 다시 시도해 주세요.', 'err');
    }).then(function () { S.busy = false; elPdf.disabled = false; });
  }

  function clearResult() {
    S.outUrls.forEach(function (u) { URL.revokeObjectURL(u); });
    S.outUrls = []; S.outs = []; elList.innerHTML = ''; elResult.hidden = true;
  }

  // ---------- 유틸 ----------
  function msg(t, kind) { elMsg.textContent = t || ''; elMsg.className = 'bdlc-msg' + (kind ? ' is-' + kind : ''); }
  function fmtNum(n) { return Number(n).toLocaleString('ko-KR'); }
  function fmtSize(b) { return b >= 1048576 ? (b / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(b / 1024)) + 'KB'; }
  function extOf(t) { return t === 'image/jpeg' ? 'jpg' : t === 'image/webp' ? 'webp' : 'png'; }

  function injectCss() {
    if (document.getElementById('bdlc-css')) return;
    var css =
      '.bdlc{--c:#2563eb;--bd:#d6dbe3;--mut:#5b6472;--red:#e53935;font-size:15px;line-height:1.5;color:inherit;max-width:760px;margin:0 auto}' +
      '.bdlc *{box-sizing:border-box}' +
      '.bdlc-drop{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;padding:28px 16px;border:2px dashed var(--bd);border-radius:14px;cursor:pointer;text-align:center;background:rgba(37,99,235,.03)}' +
      '.bdlc-drop.is-over{border-color:var(--c);background:rgba(37,99,235,.08)}' +
      '.bdlc-drop input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}' +
      '.bdlc-drop strong{font-size:17px}.bdlc-drop span{font-size:13px;color:var(--mut)}' +
      '.bdlc-safe{font-size:13px;color:var(--mut);margin:8px 0}' +
      '.bdlc-msg{min-height:1.5em;font-size:14px;margin:4px 0}' +
      '.bdlc-msg.is-err{color:#c62828}.bdlc-msg.is-warn{color:#b26a00}.bdlc-msg.is-ok{color:#1b7f3b;font-weight:600}' +
      '.bdlc-info{font-size:13px;color:var(--mut);margin-bottom:8px;word-break:break-all}' +
      '.bdlc-sec{margin:14px 0}.bdlc-h{font-weight:700;margin-bottom:8px}' +
      '.bdlc-count{font-weight:400;font-size:13px;color:var(--mut)}' +
      '.bdlc-presets{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}' +
      '@media(max-width:480px){.bdlc-presets{grid-template-columns:repeat(2,1fr)}}' +
      '.bdlc-pre{display:flex;flex-direction:column;align-items:center;padding:8px 4px;border:1px solid var(--bd);border-radius:10px;background:#fff;color:#222;cursor:pointer;font:inherit}' +
      '.bdlc-pre small{font-size:12px;color:var(--mut)}' +
      '.bdlc-pre[aria-pressed=true]{border-color:var(--c);background:var(--c);color:#fff}.bdlc-pre[aria-pressed=true] small{color:#dbe6ff}' +
      '.bdlc-opt{margin-top:10px;font-size:14px}.bdlc-opt input[type=number]{width:96px;padding:6px 8px;border:1px solid var(--bd);border-radius:8px;font:inherit}' +
      '.bdlc-opt input[type=color]{width:40px;height:30px;border:1px solid var(--bd);border-radius:6px;vertical-align:middle;padding:0}' +
      '.bdlc-chk{cursor:pointer}.bdlc-chk input{width:17px;height:17px;vertical-align:-3px}.bdlc-chk small{color:var(--mut)}' +
      '.bdlc-fmt{width:100%;padding:9px;border:1px solid var(--bd);border-radius:8px;font:inherit;background:#fff;color:#222}' +
      '.bdlc-tip{font-size:12px;color:var(--mut);margin:0 0 8px}' +
      '.bdlc-tools{display:flex;gap:6px;margin-bottom:8px}' +
      '.bdlc-tools button,.bdlc-save button{flex:1;padding:8px 10px;border:1px solid var(--c);border-radius:8px;background:#fff;color:var(--c);font:inherit;font-size:14px;cursor:pointer}' +
      '.bdlc-tools button:disabled,.bdlc-save button:disabled{opacity:.45;cursor:not-allowed}' +
      '.bdlc-preview{max-height:70vh;overflow:auto;border:1px solid var(--bd);border-radius:10px;background:#f3f4f6;padding:8px 44px 8px 8px}' +
      '.bdlc-stage{position:relative;max-width:360px;margin:0 auto;user-select:none;-webkit-user-select:none}' +
      '.bdlc-src{display:block;width:100%;height:auto;pointer-events:none}' +
      '.bdlc-line{position:absolute;left:-6px;right:-38px;height:0;border-top:2px dashed var(--red);z-index:2}' +
      '.bdlc-line.is-drag{border-top-style:solid}' +
      '.bdlc-grip{position:absolute;right:0;top:-15px;width:30px;height:30px;border-radius:50%;background:var(--red);color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;cursor:ns-resize;touch-action:none;box-shadow:0 1px 4px rgba(0,0,0,.3)}' +
      '.bdlc-grip:focus-visible{outline:3px solid var(--c);outline-offset:2px}' +
      '.bdlc-del{position:absolute;right:36px;top:-12px;width:24px;height:24px;padding:0;border:0;border-radius:50%;background:#fff;color:var(--red);font-size:16px;line-height:24px;font-weight:700;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.3)}' +
      '.bdlc-no{position:absolute;left:4px;margin-top:4px;background:rgba(229,57,53,.9);color:#fff;font-size:12px;font-weight:700;padding:1px 7px;border-radius:9px;z-index:1}' +
      '.bdlc-actions{margin:16px 0}' +
      '.bdlc-sub{display:block;font-size:12px;color:var(--mut);margin-top:2px}' +
      '.bdlc-opt select{padding:5px 8px;border:1px solid var(--bd);border-radius:8px;font:inherit;background:#fff;color:#222}' +
      '.bdlc-ovband{position:absolute;left:0;right:0;background:rgba(37,99,235,.18);pointer-events:none}' +
      '.bdlc-pwrap{position:relative}' +
      '.bdlc-loupe{position:absolute;left:50%;top:8px;transform:translateX(-50%);z-index:5;border:2px solid #fff;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.35);display:none;pointer-events:none;background:#e5e7eb}' +
      '.bdlc-loupe.is-on{display:block}' +
      '.bdlc-loupe.at-bottom{top:auto;bottom:8px}' +
      '.bdlc-run{width:100%;padding:13px;border:0;border-radius:12px;background:var(--c);color:#fff;font:inherit;font-size:16px;font-weight:700;cursor:pointer}' +
      '.bdlc-run:disabled{opacity:.45;cursor:not-allowed}' +
      '.bdlc-save{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}.bdlc-save button{flex:1 1 140px}' +
      '.bdlc-save .bdlc-zip{background:var(--c);color:#fff}' +
      '.bdlc-list{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px}' +
      '.bdlc-list li{border:1px solid var(--bd);border-radius:10px;padding:6px;display:flex;flex-direction:column;gap:6px;background:#fff;color:#222}' +
      '.bdlc-list img{width:100%;aspect-ratio:3/4;object-fit:contain;background:#f3f4f6;border-radius:6px}' +
      '.bdlc-meta{display:flex;gap:6px;align-items:baseline;font-size:12px;color:var(--mut)}.bdlc-meta b{color:#222;font-size:13px}' +
      '.bdlc-dl{display:block;text-align:center;padding:6px;border-radius:7px;background:var(--c);color:#fff!important;text-decoration:none;font-size:13px}';
    var st = document.createElement('style'); st.id = 'bdlc-css'; st.textContent = css;
    document.head.appendChild(st);
  }
})();
