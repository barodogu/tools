/*!
 * 착착도구 · PDF 용량 줄이기 (pdf/pdf-compress.js) v1.0
 * https://barodogu.blogspot.com
 * - 모든 처리는 브라우저 안에서만 이루어지며, 파일을 어디에도 전송하지 않습니다.
 * - 사용법: 글에 <div id="bd-pdfc"></div> 를 두고 이 스크립트를 불러오세요.
 */
(function () {
  'use strict';
  var ROOT_ID = 'bd-pdfc';
  var LIB = {
    pdfjs: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    pdflib: 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
    jszip: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
  };
  var MB = 1024 * 1024;
  var MAX_FILE = 300 * MB;          // 한 파일 최대 (폰 메모리 한계)
  var MAX_FILES = 20;
  var MAX_PIXELS = 4000000;         // 아이폰 사파리 캔버스 안전선 (한 장당)
  var MAX_SIDE = 4096;
  var MAX_DECODE = 16000000;        // 이보다 큰 원본 이미지는 건드리지 않음
  // 화질 단계: 해상도(dpi)와 JPG 품질. 아래로 갈수록 작아짐
  var LADDER = [
    { dpi: 200, q: 0.85 }, { dpi: 170, q: 0.8 }, { dpi: 150, q: 0.75 }, { dpi: 130, q: 0.7 },
    { dpi: 115, q: 0.64 }, { dpi: 100, q: 0.58 }, { dpi: 90, q: 0.52 }, { dpi: 80, q: 0.46 },
    { dpi: 72, q: 0.4 }
  ];
  var QUALITY = {
    high: { label: '선명하게', idx: 0, desc: '글씨가 아주 또렷해요' },
    mid: { label: '보통', idx: 2, desc: '대부분 서류에 알맞아요' },
    low: { label: '작게', idx: 5, desc: '용량을 가장 많이 줄여요' }
  };
  var TARGETS = [
    [10, '쪽 많은 서류'], [5, '가장 많이 씀'], [3, '학교·회사 제출'], [2, '이메일 첨부'], [1, '아주 작게']
  ];

  /* ---------------- 스타일 ---------------- */
  var CSS = '' +
    '#bd-pdfc{--b:#2563eb;--bd:#1d4ed8;--bl:#eff6ff;--g:#16a34a;--t:#1f2937;--m:#6b7280;--line:#e5e7eb;' +
    'font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;color:var(--t);' +
    'max-width:640px;margin:16px auto;box-sizing:border-box;line-height:1.55;-webkit-text-size-adjust:100%;text-align:left}' +
    '#bd-pdfc *{box-sizing:border-box}' +
    '#bd-pdfc .pc-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:18px;box-shadow:0 2px 10px rgba(0,0,0,.05)}' +
    '#bd-pdfc .pc-title{font-size:20px;font-weight:800;margin:0 0 4px}' +
    '#bd-pdfc .pc-sub{font-size:14px;color:var(--m);margin:0 0 14px}' +
    '#bd-pdfc .pc-drop{border:2px dashed #93c5fd;background:var(--bl);border-radius:14px;padding:18px 14px;text-align:center;transition:.15s}' +
    '#bd-pdfc .pc-drop.on{background:#dbeafe;border-color:var(--b)}' +
    '#bd-pdfc .pc-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:50px;padding:10px 14px;border-radius:12px;' +
    'border:0;font-size:16px;font-weight:700;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;text-decoration:none;font-family:inherit;line-height:1.3}' +
    '#bd-pdfc .pc-btn:disabled{opacity:.5;cursor:default}' +
    '#bd-pdfc .pc-main{background:var(--b);color:#fff;width:100%}' +
    '#bd-pdfc .pc-main:active{background:var(--bd)}' +
    '#bd-pdfc .pc-ghost{background:#fff;color:var(--b);border:1.5px solid #bfdbfe}' +
    '#bd-pdfc .pc-ok{background:var(--g);color:#fff}' +
    '#bd-pdfc .pc-sm{min-height:42px;font-size:14px;padding:8px 10px}' +
    '#bd-pdfc .pc-row{display:flex;flex-wrap:wrap;gap:8px}' +
    '#bd-pdfc .pc-row>.pc-btn{flex:1 1 130px}' +
    '#bd-pdfc .pc-hint{font-size:13px;color:var(--m);margin:10px 0 0}' +
    '#bd-pdfc .pc-files{margin-top:14px;display:flex;flex-direction:column;gap:8px}' +
    '#bd-pdfc .pc-file{display:flex;align-items:center;gap:10px;background:#f9fafb;border:1px solid var(--line);border-radius:12px;padding:10px 12px;word-break:break-all}' +
    '#bd-pdfc .pc-file b{display:block;font-size:15px}' +
    '#bd-pdfc .pc-file small{color:var(--m);font-size:13px}' +
    '#bd-pdfc .pc-file .pc-x{margin-left:auto;flex:0 0 auto;width:42px;min-height:42px;padding:0;font-size:18px}' +
    '#bd-pdfc .pc-sec{margin-top:16px}' +
    '#bd-pdfc .pc-lab{font-weight:800;font-size:15px;margin:0 0 8px}' +
    '#bd-pdfc .pc-tabs{display:flex;background:#f3f4f6;border-radius:12px;padding:4px;gap:4px;margin-bottom:10px}' +
    '#bd-pdfc .pc-tab{flex:1;min-height:44px;border:0;border-radius:9px;background:transparent;font-size:15px;font-weight:700;color:var(--m);cursor:pointer;font-family:inherit}' +
    '#bd-pdfc .pc-tab.sel{background:#fff;color:var(--b);box-shadow:0 1px 4px rgba(0,0,0,.08)}' +
    '#bd-pdfc .pc-chips{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px}' +
    '#bd-pdfc .pc-chip{min-height:48px;border:1.5px solid var(--line);background:#fff;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;color:var(--t);padding:6px;font-family:inherit}' +
    '#bd-pdfc .pc-chip small{display:block;font-weight:500;font-size:12px;color:var(--m)}' +
    '#bd-pdfc .pc-chip.sel{border-color:var(--b);background:var(--bl);color:var(--b)}' +
    '#bd-pdfc .pc-chip.dim{opacity:.45}' +
    '#bd-pdfc .pc-q{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}' +
    '#bd-pdfc details.pc-more{margin-top:12px;border:1px solid var(--line);border-radius:12px;padding:0 12px}' +
    '#bd-pdfc details.pc-more summary{min-height:46px;display:flex;align-items:center;font-weight:700;font-size:15px;cursor:pointer;list-style:none}' +
    '#bd-pdfc details.pc-more summary::-webkit-details-marker{display:none}' +
    '#bd-pdfc details.pc-more summary:after{content:"▾";margin-left:auto;color:var(--m)}' +
    '#bd-pdfc details.pc-more[open] summary:after{content:"▴"}' +
    '#bd-pdfc .pc-chk{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-top:1px solid #f3f4f6;cursor:pointer;font-size:15px}' +
    '#bd-pdfc .pc-chk input{width:22px;height:22px;flex:0 0 auto;margin:1px 0 0;accent-color:var(--b)}' +
    '#bd-pdfc .pc-chk small{display:block;color:var(--m);font-size:13px}' +
    '#bd-pdfc .pc-range{padding:10px 0 12px;border-top:1px solid #f3f4f6}' +
    '#bd-pdfc .pc-range input{width:100%;min-height:46px;border:1.5px solid var(--line);border-radius:10px;padding:8px 12px;font-size:16px;font-family:inherit;margin-top:6px}' +
    '#bd-pdfc .pc-prog{margin-top:14px}' +
    '#bd-pdfc .pc-bar{height:12px;background:#e5e7eb;border-radius:99px;overflow:hidden}' +
    '#bd-pdfc .pc-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#3b82f6,#2563eb);transition:width .2s}' +
    '#bd-pdfc .pc-ptxt{font-size:14px;color:var(--m);margin:6px 0 0;display:flex;justify-content:space-between;gap:8px;align-items:center}' +
    '#bd-pdfc .pc-res{margin-top:12px;border-radius:14px;padding:14px;background:#f0fdf4;border:1px solid #bbf7d0}' +
    '#bd-pdfc .pc-res.warn{background:#fffbeb;border-color:#fde68a}' +
    '#bd-pdfc .pc-res.bad{background:#fef2f2;border-color:#fecaca}' +
    '#bd-pdfc .pc-rname{font-size:14px;font-weight:700;word-break:break-all;margin:0 0 4px;text-align:center}' +
    '#bd-pdfc .pc-big{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;font-size:22px;font-weight:800;margin:4px 0 2px;text-align:center}' +
    '#bd-pdfc .pc-big s{color:var(--m);font-weight:600;font-size:18px}' +
    '#bd-pdfc .pc-big em{font-style:normal;color:var(--g)}' +
    '#bd-pdfc .pc-badge{display:inline-block;font-size:13px;font-weight:800;padding:3px 10px;border-radius:99px;background:var(--g);color:#fff}' +
    '#bd-pdfc .pc-res.warn .pc-badge{background:#d97706}' +
    '#bd-pdfc .pc-res.bad .pc-badge{background:#dc2626}' +
    '#bd-pdfc .pc-msg{font-size:14px;margin:6px 0 10px;text-align:center}' +
    '#bd-pdfc .pc-all{margin-top:12px;padding:14px;border-radius:14px;background:var(--bl);border:1px solid #bfdbfe}' +
    '#bd-pdfc .pc-err{margin-top:14px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:12px;padding:12px 14px;font-size:14px}' +
    '#bd-pdfc .pc-err b{display:block;font-size:15px;margin-bottom:2px}' +
    '#bd-pdfc .pc-note{margin-top:10px;font-size:13px;color:var(--m);background:rgba(255,255,255,.7);border-radius:10px;padding:10px 12px}' +
    '#bd-pdfc .pc-cmp{margin-top:10px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px}' +
    '#bd-pdfc .pc-cmpbar{display:flex;align-items:center;gap:6px;margin-bottom:8px}' +
    '#bd-pdfc .pc-cmpbar span{flex:1;text-align:center;font-size:14px;font-weight:700}' +
    '#bd-pdfc .pc-cmpbar .pc-btn{min-height:40px;padding:6px 10px;font-size:14px;flex:0 0 auto}' +
    '#bd-pdfc .pc-cols{display:grid;grid-template-columns:1fr 1fr;gap:6px}' +
    '#bd-pdfc .pc-col{min-width:0}' +
    '#bd-pdfc .pc-col p{margin:0 0 4px;font-size:12px;font-weight:700;color:var(--m);text-align:center}' +
    '#bd-pdfc .pc-view{height:300px;overflow:auto;border:1px solid var(--line);border-radius:8px;background:#f3f4f6;-webkit-overflow-scrolling:touch}' +
    '#bd-pdfc .pc-view canvas{display:block;width:100%;height:auto;background:#fff}' +
    '#bd-pdfc .pc-view.zoom canvas{width:260%;max-width:none}' +
    '#bd-pdfc .pc-lock{margin:12px 0 0;font-size:13px;color:#166534;text-align:center}' +
    '#bd-pdfc [hidden]{display:none!important}';

  /* ---------------- 유틸 ---------------- */
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(b) {
    if (b >= MB) return (b / MB).toFixed(b >= 100 * MB ? 0 : 1) + 'MB';
    return Math.max(1, Math.round(b / 1024)) + 'KB';
  }
  function secText(s) { s = Math.round(s); return s < 60 ? s + '초' : Math.floor(s / 60) + '분 ' + (s % 60) + '초'; }
  var loading = {};
  function loadScript(src) {
    if (loading[src]) return loading[src];
    loading[src] = new Promise(function (res, rej) {
      var s = document.createElement('script');
      var t = setTimeout(function () { delete loading[src]; rej(new Error('LIB_TIMEOUT')); }, 25000);
      s.src = src; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = function () { clearTimeout(t); res(); };
      s.onerror = function () { clearTimeout(t); delete loading[src]; rej(new Error('LIB_FAIL')); };
      document.head.appendChild(s);
    });
    return loading[src];
  }
  function loadLibs() {
    return Promise.all([loadScript(LIB.pdfjs), loadScript(LIB.pdflib)]).then(function () {
      if (!window.pdfjsLib || !window.PDFLib) throw new Error('LIB_FAIL');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = LIB.worker;
    });
  }
  function readBlob(b) {
    if (b.arrayBuffer) return b.arrayBuffer();
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsArrayBuffer(b); });
  }
  function canvasToJpg(cv, q) {
    return new Promise(function (res, rej) {
      if (cv.toBlob) {
        cv.toBlob(function (b) { if (!b) return rej(new Error('CANVAS')); readBlob(b).then(res, rej); }, 'image/jpeg', q);
      } else {
        try {
          var d = cv.toDataURL('image/jpeg', q), bin = atob(d.split(',')[1]), u = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
          res(u.buffer);
        } catch (e) { rej(e); }
      }
    });
  }
  function toGray(ctx, w, h) {
    var img = ctx.getImageData(0, 0, w, h), d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var y = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
      d[i] = d[i + 1] = d[i + 2] = y;
    }
    ctx.putImageData(img, 0, 0);
  }
  function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }
  function u8(buf) { return new Uint8Array(buf.slice(0)); }
  function range(n) { var a = []; for (var i = 1; i <= n; i++) a.push(i); return a; }

  // "1-3, 5, 8-" → [1,2,3,5,8,...,n]
  function parseRange(str, n) {
    str = (str || '').replace(/\s+/g, '').replace(/[~〜]/g, '-');
    if (!str) return null;
    var set = {}, parts = str.split(/[,，]/);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i]; if (!p) continue;
      var m = /^(\d*)-(\d*)$/.exec(p), a, b;
      if (m) { a = m[1] ? +m[1] : 1; b = m[2] ? +m[2] : n; }
      else if (/^\d+$/.test(p)) { a = b = +p; }
      else throw new Error('RANGE_BAD');
      if (a > b) { var t = a; a = b; b = t; }
      if (a < 1 || b > n) throw new Error('RANGE_OUT');
      for (var k = a; k <= b; k++) set[k] = 1;
    }
    var list = Object.keys(set).map(Number).sort(function (x, y) { return x - y; });
    if (!list.length) throw new Error('RANGE_BAD');
    return list;
  }

  /* ---------------- 오류 문구 ---------------- */
  function errInfo(e, n) {
    var s = (e && (e.name || '')) + ' ' + (e && e.message || '');
    if (/ZIP_FAIL/.test(s)) return ['ZIP 만들기 도구를 불러오지 못했어요', '인터넷 연결을 확인해 주세요. 그동안은 파일마다 「저장하기」로 하나씩 받을 수 있어요.'];
    if (/LIB_FAIL|LIB_TIMEOUT/.test(s)) return ['도구 구성 파일을 불러오지 못했어요', '인터넷 연결이 불안정하거나 광고 차단 앱이 막았을 수 있어요. 와이파이·데이터를 확인하고 새로고침해 주세요. 계속 안 되면 다른 브라우저(크롬·사파리)로 열어 보세요.'];
    if (/Password/i.test(s)) return ['비밀번호가 걸린 PDF예요', '비밀번호가 있는 PDF는 열 수 없어요. 카드명세서·보험서류처럼 잠긴 PDF라면, 비밀번호로 연 다음 「인쇄 → PDF로 저장」으로 잠금 없는 PDF를 만든 뒤 다시 넣어 주세요.'];
    if (/NOT_PDF|InvalidPDF|Invalid PDF|FormatError/i.test(s)) return ['PDF 파일이 아니거나 손상됐어요', '확장자만 .pdf인 다른 파일이거나 내려받다 끊긴 파일일 수 있어요. 원래 받은 곳에서 다시 내려받아 주세요. 사진이라면 「사진 PDF로 바꾸기」 도구를 먼저 써 주세요.'];
    if (/TOO_BIG/.test(s)) return ['파일이 너무 커요 (300MB 초과)', '휴대폰 메모리로는 처리하기 어려워요. PC에서 해 보거나, 「PDF 페이지 정리」 도구로 몇 쪽씩 나눈 다음 줄여 주세요.'];
    if (/TOO_MANY/.test(s)) return ['파일이 너무 많아요', '한 번에 ' + MAX_FILES + '개까지 넣을 수 있어요. 나머지는 이번 작업이 끝난 뒤 넣어 주세요.'];
    if (/NO_PAGES/.test(s)) return ['쪽이 하나도 없는 PDF예요', '빈 PDF라서 줄일 내용이 없어요. 원본 파일을 다시 확인해 주세요.'];
    if (/RANGE_OUT/.test(s)) return ['쪽 번호가 범위를 벗어났어요', '이 PDF는 ' + (n || '?') + '쪽까지 있어요. 「1-3, 5」처럼 있는 쪽 번호만 적어 주세요.'];
    if (/RANGE_BAD/.test(s)) return ['쪽 범위를 알아볼 수 없어요', '숫자와 - , 만 써서 「1-3, 5」처럼 적어 주세요. 전체를 줄이려면 칸을 비워 두세요.'];
    if (/memory|allocation|CANVAS|RangeError/i.test(s)) return ['폰 메모리가 부족해요', '쪽이 많거나 아주 큰 PDF예요. 다른 앱과 탭을 닫고 다시 하거나, 「화질 고르기 → 작게」로 해 보세요. PC에서 하면 더 잘 돼요.'];
    if (/CANCEL/.test(s)) return null;
    return ['처리 중에 문제가 생겼어요', '새로고침한 뒤 다시 해 주세요. 같은 파일에서 계속 안 되면 「화질 고르기 → 작게」로 바꾸거나 PC에서 시도해 주세요.'];
  }

  /* ============ 압축 엔진 ============ */

  // [A] 쪽 전체를 이미지로 다시 그리기 (가장 확실하게 줄어듦)
  async function renderPage(pdf, i, lv, gray) {
    var page = await pdf.getPage(i);
    var base = page.getViewport({ scale: 1 });
    var s = lv.dpi / 72;
    var w = base.width * s, h = base.height * s;
    s *= Math.min(1, Math.sqrt(MAX_PIXELS / (w * h)), MAX_SIDE / Math.max(w, h));
    var vp = page.getViewport({ scale: s });
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.floor(vp.width)); cv.height = Math.max(1, Math.floor(vp.height));
    var ctx = cv.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: ctx, viewport: vp, intent: 'print' }).promise;
    if (gray) toGray(ctx, cv.width, cv.height);
    var jpg = await canvasToJpg(cv, lv.q);
    cv.width = cv.height = 0; // 아이폰 메모리 반환
    page.cleanup();
    return { jpg: jpg, w: base.width, h: base.height };
  }
  async function buildRaster(pdf, pages, lv, gray, onProg, isCancel) {
    var out = await window.PDFLib.PDFDocument.create();
    for (var i = 0; i < pages.length; i++) {
      if (isCancel()) throw new Error('CANCEL');
      var r = await renderPage(pdf, pages[i], lv, gray);
      var img = await out.embedJpg(r.jpg);
      out.addPage([r.w, r.h]).drawImage(img, { x: 0, y: 0, width: r.w, height: r.h });
      onProg((i + 1) / pages.length);
      await tick();
    }
    out.setProducer('barodogu.blogspot.com'); out.setCreator('착착도구 PDF 용량 줄이기');
    return out.save({ useObjectStreams: true });
  }
  async function estimate(pdf, pages, idx, gray, isCancel) {
    var n = pages.length, picks = n <= 3 ? pages.slice() : [pages[0], pages[Math.floor(n / 2)], pages[n - 1]];
    var sum = 0;
    for (var j = 0; j < picks.length; j++) {
      if (isCancel()) throw new Error('CANCEL');
      sum += (await renderPage(pdf, picks[j], LADDER[idx], gray)).jpg.byteLength;
    }
    return (sum / picks.length) * n * 1.02 + 2000;
  }

  // [B] 쪽 범위만 남긴 PDF (글자 그대로)
  async function subsetDoc(bytes, pages, total) {
    var P = window.PDFLib;
    var src = await P.PDFDocument.load(bytes, { updateMetadata: false });
    if (!pages || pages.length === total) return src;
    var out = await P.PDFDocument.create();
    var cp = await out.copyPages(src, pages.map(function (x) { return x - 1; }));
    cp.forEach(function (p) { out.addPage(p); });
    return out;
  }
  async function losslessTry(bytes, pages, total) {
    try { return await (await subsetDoc(bytes, pages, total)).save({ useObjectStreams: true }); }
    catch (e) { return null; }
  }

  // [C] 글자는 그대로 두고 PDF 속 사진·스캔 이미지만 다시 압축
  async function inflate(data) {
    if (typeof DecompressionStream === 'undefined') throw new Error('NO_INFLATE');
    var ds = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(ds).arrayBuffer());
  }
  function unpredict(data, w, colors, pred) {
    if (pred < 10) return pred === 1 ? data : null;
    var row = w * colors, rows = Math.floor(data.length / (row + 1)), out = new Uint8Array(row * rows);
    var prev = new Uint8Array(row), pos = 0;
    for (var r = 0; r < rows; r++) {
      var f = data[pos++], cur = out.subarray(r * row, (r + 1) * row);
      for (var i = 0; i < row; i++) {
        var x = data[pos + i], a = i >= colors ? cur[i - colors] : 0, b = prev[i], c = i >= colors ? prev[i - colors] : 0;
        if (f === 1) x += a; else if (f === 2) x += b; else if (f === 3) x += (a + b) >> 1;
        else if (f === 4) { var p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); x += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
        cur[i] = x & 255;
      }
      prev = cur; pos += row;
    }
    return out;
  }
  function imageFrom(blob) {
    if (window.createImageBitmap) return createImageBitmap(blob);
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(blob), im = new Image();
      im.onload = function () { URL.revokeObjectURL(url); res(im); };
      im.onerror = function () { URL.revokeObjectURL(url); rej(new Error('IMG')); };
      im.src = url;
    });
  }
  // PDF 안의 이미지 목록 (다시 압축해도 안전한 것만 고름)
  function listImages(doc) {
    var P = window.PDFLib, N = P.PDFName.of, out = [];
    doc.context.enumerateIndirectObjects().forEach(function (pair) {
      var ref = pair[0], obj = pair[1];
      if (!(obj instanceof P.PDFRawStream)) return;
      var d = obj.dict;
      if (d.get(N('Subtype')) !== N('Image')) return;
      if (d.get(N('ImageMask')) || d.get(N('Decode')) || d.get(N('Mask'))) return;
      var num = function (k) { var v = d.lookup(N(k)); return v && v.asNumber ? v.asNumber() : 0; };
      var w = num('Width'), h = num('Height');
      if (w * h < 40000 || w * h > MAX_DECODE || num('BitsPerComponent') !== 8) return;
      var f = d.lookup(N('Filter'));
      if (f instanceof P.PDFArray) { if (f.size() !== 1) return; f = f.lookup(0); }
      if (f !== N('DCTDecode') && f !== N('FlateDecode')) return;
      var filter = f === N('DCTDecode') ? 'DCT' : 'Flate';
      var cs = d.lookup(N('ColorSpace')), ch = 0;
      if (cs === N('DeviceRGB')) ch = 3; else if (cs === N('DeviceGray')) ch = 1;
      else if (cs instanceof P.PDFArray && cs.lookup(0) === N('ICCBased')) {
        var icc = cs.lookup(1), nn = icc && icc.dict && icc.dict.lookup(N('N'));
        ch = nn && nn.asNumber ? nn.asNumber() : 0;
        if (ch !== 1 && ch !== 3) ch = 0;
      }
      if (!ch) return; // CMYK·인덱스 색상은 색이 틀어질 수 있어 건너뜀
      var parms = d.lookup(N('DecodeParms')), pred = 1;
      if (parms instanceof P.PDFArray) parms = parms.lookup(0);
      if (parms && parms.lookup) {
        if (filter === 'DCT') return;
        var pv = parms.lookup(N('Predictor')); pred = pv && pv.asNumber ? pv.asNumber() : 1;
        var cv = parms.lookup(N('Colors')), co = parms.lookup(N('Columns'));
        if ((cv && cv.asNumber() !== ch) || (co && co.asNumber() !== w)) return;
      }
      out.push({ ref: ref, obj: obj, w: w, h: h, ch: ch, filter: filter, pred: pred, smask: d.get(N('SMask')) });
    });
    return out;
  }
  async function recompressImages(bytes, pages, total, lv, gray, onProg, isCancel) {
    var doc;
    try { doc = await subsetDoc(bytes, pages, total); } catch (e) { return null; }
    var imgs = listImages(doc);
    if (!imgs.length) return null;
    var maxSide = Math.round(lv.dpi * 11.7), changed = 0;
    for (var i = 0; i < imgs.length; i++) {
      if (isCancel()) throw new Error('CANCEL');
      var it = imgs[i], src = it.obj.contents, cv = null;
      try {
        var scale = Math.min(1, maxSide / Math.max(it.w, it.h), Math.sqrt(MAX_PIXELS / (it.w * it.h)));
        var tw = Math.max(1, Math.round(it.w * scale)), th = Math.max(1, Math.round(it.h * scale));
        cv = document.createElement('canvas'); cv.width = tw; cv.height = th;
        var ctx = cv.getContext('2d', { alpha: false });
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, tw, th);
        if (it.filter === 'DCT') {
          var bm = await imageFrom(new Blob([src], { type: 'image/jpeg' }));
          ctx.drawImage(bm, 0, 0, tw, th);
          if (bm.close) bm.close();
        } else {
          var raw = unpredict(await inflate(src), it.w, it.ch, it.pred);
          if (!raw || raw.length < it.w * it.h * it.ch) throw new Error('SKIP');
          var tmp = document.createElement('canvas'); tmp.width = it.w; tmp.height = it.h;
          var tctx = tmp.getContext('2d'), id = tctx.createImageData(it.w, it.h), dd = id.data;
          for (var p = 0, q = 0, o = 0; p < it.w * it.h; p++, q += it.ch, o += 4) {
            if (it.ch === 3) { dd[o] = raw[q]; dd[o + 1] = raw[q + 1]; dd[o + 2] = raw[q + 2]; }
            else { dd[o] = dd[o + 1] = dd[o + 2] = raw[q]; }
            dd[o + 3] = 255;
          }
          tctx.putImageData(id, 0, 0);
          ctx.drawImage(tmp, 0, 0, tw, th);
          tmp.width = tmp.height = 0;
        }
        if (gray) toGray(ctx, tw, th);
        var jpg = new Uint8Array(await canvasToJpg(cv, lv.q));
        if (jpg.length < src.length * 0.92) {
          var dict = { Type: 'XObject', Subtype: 'Image', Width: tw, Height: th, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'DCTDecode' };
          if (it.smask) dict.SMask = it.smask;
          doc.context.assign(it.ref, doc.context.stream(jpg, dict));
          changed++;
        }
      } catch (e) {
        if (/CANCEL/.test(e && e.message)) throw e; // 다른 오류는 그 이미지만 건너뜀
      } finally { if (cv) cv.width = cv.height = 0; }
      onProg((i + 1) / imgs.length);
      if (i % 3 === 2) await tick();
    }
    if (!changed) return null;
    doc.setProducer('barodogu.blogspot.com');
    return doc.save({ useObjectStreams: true });
  }

  /* ---------------- 한 파일 압축 ---------------- */
  // opt: {mode, target(bytes), qIdx, gray, keepText, pages}
  async function compressOne(item, opt, report, isCancel) {
    var orig = item.bytes.byteLength;
    var pdf = await window.pdfjsLib.getDocument({ data: u8(item.bytes) }).promise;
    var total = pdf.numPages, pages = opt.pages || range(total);
    var best = null, keptText = false, lv = null, how = '';
    function take(bytes, kt, l, h) {
      if (bytes && (!best || bytes.byteLength < best.byteLength)) { best = bytes; keptText = kt; lv = l; how = h; }
    }
    function done(t) { return best && best.byteLength <= t; }
    try {
      if (opt.mode === 'target') {
        var target = opt.target;
        report(0.02, '글자를 살린 채 줄여 보는 중…');
        if (!opt.gray) take(await losslessTry(u8(item.bytes), opt.pages, total), true, null, 'lossless');
        if (!done(target) && opt.keepText) {
          var steps = [0, 2, 4, 6, 8];
          for (var s = 0; s < steps.length && !done(target); s++) {
            var r = await recompressImages(u8(item.bytes), opt.pages, total, LADDER[steps[s]], opt.gray, function (f) {
              report(0.04 + (s + f) / steps.length * 0.3, '글자는 두고 사진만 줄이는 중…');
            }, isCancel);
            if (!r) break;
            if (r.byteLength <= target) { best = null; take(r, true, LADDER[steps[s]], 'images'); }
            else take(r, true, LADDER[steps[s]], 'images');
          }
        }
        if (!done(target)) {
          report(0.36, '알맞은 화질을 찾는 중…');
          var idx = 0, est = await estimate(pdf, pages, 0, opt.gray, isCancel);
          while (est > target * 0.9 && idx < LADDER.length - 1) {
            idx = Math.min(LADDER.length - 1, idx + (est / (target * 0.9) > 2.5 ? 2 : 1));
            report(0.36 + idx * 0.006, '알맞은 화질을 찾는 중…');
            est = await estimate(pdf, pages, idx, opt.gray, isCancel);
          }
          for (var t = 0; t < 4; t++) {
            var out = await buildRaster(pdf, pages, LADDER[idx], opt.gray, function (f) {
              report(0.42 + f * 0.56, Math.round(f * pages.length) + ' / ' + pages.length + '쪽 줄이는 중' + (t ? ' (한 번 더)' : ''));
            }, isCancel);
            take(out, false, LADDER[idx], 'raster');
            if (out.byteLength <= target || idx >= LADDER.length - 1) break;
            idx = Math.min(LADDER.length - 1, idx + (out.byteLength / target > 1.6 ? 2 : 1));
          }
        }
      } else {
        var lv2 = LADDER[opt.qIdx];
        if (opt.keepText) {
          var r2 = await recompressImages(u8(item.bytes), opt.pages, total, lv2, opt.gray, function (f) { report(f * 0.3, '글자는 두고 사진만 줄이는 중…'); }, isCancel);
          if (r2 && r2.byteLength < orig * 0.8) take(r2, true, lv2, 'images');
        }
        if (!best) {
          take(await buildRaster(pdf, pages, lv2, opt.gray, function (f) {
            report(0.3 + f * 0.68, Math.round(f * pages.length) + ' / ' + pages.length + '쪽 줄이는 중');
          }, isCancel), false, lv2, 'raster');
        }
      }
    } finally { try { pdf.destroy(); } catch (x) { } }
    // 쪽 범위 없이 결과가 원본보다 크면 원본 그대로 돌려줌
    var same = false;
    if (!opt.pages && best.byteLength >= orig * 0.97) { best = new Uint8Array(item.bytes); keptText = true; same = true; }
    return { bytes: best, orig: orig, size: best.byteLength, keptText: keptText, lv: lv, how: how, same: same, pages: pages, total: total };
  }

  /* ---------------- 예시 PDF ---------------- */
  async function makeSample() {
    var doc = await window.PDFLib.PDFDocument.create();
    var titles = ['주민등록표 등본(예시)', '재직증명서(예시)', '소득금액증명(예시)', '통장 사본(예시)'];
    for (var p = 0; p < titles.length; p++) {
      var W = 1654, H = 2339, cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      var c = cv.getContext('2d', { alpha: false });
      c.fillStyle = '#f4f1ea'; c.fillRect(0, 0, W, H);
      var img = c.getImageData(0, 0, W, H), d = img.data, seed = 7 + p;
      for (var k = 0; k < d.length; k += 4) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        var nz = (seed % 34) - 17;
        d[k] += nz; d[k + 1] += nz; d[k + 2] += nz - 3;
      }
      c.putImageData(img, 0, 0);
      c.save(); c.translate(W / 2, H / 2); c.rotate(0.006 * (p % 2 ? 1 : -1)); c.translate(-W / 2, -H / 2);
      c.fillStyle = '#222'; c.font = 'bold 64px sans-serif'; c.textAlign = 'center';
      c.fillText(titles[p], W / 2, 230);
      c.textAlign = 'left'; c.font = '34px sans-serif'; c.strokeStyle = '#555'; c.lineWidth = 3;
      c.strokeRect(150, 320, W - 300, 1500);
      for (var l = 0; l < 22; l++) {
        var y = 390 + l * 66;
        c.beginPath(); c.moveTo(150, y + 18); c.lineTo(W - 150, y + 18); c.lineWidth = 1; c.stroke();
        c.fillText((l + 1) + '. 착착도구 예시 문서입니다 · 실제 개인정보가 아니에요 · 홍길동 ' + (1990 + l), 180, y);
      }
      c.strokeStyle = c.fillStyle = 'rgba(200,30,30,.75)'; c.lineWidth = 10;
      c.beginPath(); c.arc(W - 330, 2000, 110, 0, Math.PI * 2); c.stroke();
      c.font = 'bold 50px sans-serif'; c.textAlign = 'center'; c.fillText('직인', W - 330, 2018);
      c.restore();
      var jpg = await canvasToJpg(cv, 0.95);
      cv.width = cv.height = 0;
      var im = await doc.embedJpg(jpg);
      doc.addPage([595.28, 841.89]).drawImage(im, { x: 0, y: 0, width: 595.28, height: 841.89 });
    }
    var b = await doc.save();
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  }

  /* ============ 화면 ============ */
  function mount(root) {
    if (root.getAttribute('data-ready')) return;
    root.setAttribute('data-ready', '1');
    if (!document.getElementById('bd-pdfc-style')) {
      var st = document.createElement('style'); st.id = 'bd-pdfc-style'; st.textContent = CSS; document.head.appendChild(st);
    }
    var S = { files: [], mode: 'target', target: 5, quality: 'mid', busy: false, cancel: false, results: [], urls: [] };

    root.innerHTML =
      '<div class="pc-card">' +
      '<p class="pc-title">📉 PDF 용량 줄이기</p>' +
      '<p class="pc-sub">원하는 용량을 고르면 거기에 맞춰 자동으로 줄여 드려요.</p>' +
      '<div class="pc-drop" data-r="drop">' +
      '<div class="pc-row"><button type="button" class="pc-btn pc-main" data-r="pick">📂 PDF 파일 선택하기</button></div>' +
      '<div class="pc-row" style="margin-top:8px"><button type="button" class="pc-btn pc-ghost" data-r="sample">🧪 예시 PDF로 체험하기</button></div>' +
      '<p class="pc-hint">여러 개를 한 번에 골라도 돼요. PC에서는 PDF를 이 상자로 끌어다 놓아도 돼요.</p>' +
      '<input type="file" accept="application/pdf,.pdf" multiple data-r="input" hidden>' +
      '</div>' +
      '<div class="pc-files" data-r="files" hidden></div>' +
      '<div class="pc-row" data-r="morebox" style="margin-top:8px" hidden><button type="button" class="pc-btn pc-ghost pc-sm" data-r="add">＋ 파일 더 넣기</button>' +
      '<button type="button" class="pc-btn pc-ghost pc-sm" data-r="clear">처음부터 다시</button></div>' +
      '<div class="pc-sec" data-r="opts" hidden>' +
      '<p class="pc-lab">어떻게 줄일까요?</p>' +
      '<div class="pc-tabs"><button type="button" class="pc-tab sel" data-mode="target">🎯 목표 용량</button><button type="button" class="pc-tab" data-mode="quality">🖼 화질 고르기</button></div>' +
      '<div data-r="tgt" class="pc-chips"></div>' +
      '<div data-r="qual" class="pc-chips pc-q" hidden></div>' +
      '<details class="pc-more" data-r="more"><summary>⚙️ 더 보기 설정</summary>' +
      '<label class="pc-chk"><input type="checkbox" data-r="gray"><span>흑백으로 만들기<small>스캔한 서류에 추천해요. 색이 빠지면서 조금 더 줄어요.</small></span></label>' +
      '<label class="pc-chk"><input type="checkbox" data-r="keep" checked><span>글자 살리기 먼저 해 보기<small>PDF 속 사진만 줄여서 글자 복사·검색이 그대로 돼요. 부족하면 자동으로 더 줄여요.</small></span></label>' +
      '<div class="pc-range"><b style="font-size:15px">쪽 범위</b> <small style="color:#6b7280">(비우면 전체)</small>' +
      '<input type="text" inputmode="text" data-r="range" placeholder="예: 1-3, 5" autocomplete="off"><small data-r="rangehint" style="color:#6b7280;font-size:13px"></small></div>' +
      '</details>' +
      '<div class="pc-row" style="margin-top:14px"><button type="button" class="pc-btn pc-main" data-r="go">✨ 용량 줄이기</button></div>' +
      '</div>' +
      '<div class="pc-prog" data-r="prog" hidden><div class="pc-bar"><i data-r="bar"></i></div>' +
      '<p class="pc-ptxt"><span data-r="ptxt">준비 중…</span><button type="button" class="pc-btn pc-ghost pc-sm" data-r="cancel">취소</button></p></div>' +
      '<div data-r="err" hidden></div>' +
      '<div data-r="res" hidden></div>' +
      '<p class="pc-lock">🔒 파일은 서버로 전송되지 않고 이 기기 안에서만 처리돼요.</p>' +
      '</div>';

    function $(r) { return root.querySelector('[data-r="' + r + '"]'); }
    var input = $('input');

    $('tgt').innerHTML = TARGETS.map(function (t) {
      return '<button type="button" class="pc-chip' + (t[0] === S.target ? ' sel' : '') + '" data-t="' + t[0] + '">' + t[0] + 'MB 이하<small>' + t[1] + '</small></button>';
    }).join('');
    $('qual').innerHTML = Object.keys(QUALITY).map(function (k) {
      return '<button type="button" class="pc-chip' + (k === S.quality ? ' sel' : '') + '" data-q="' + k + '">' + QUALITY[k].label + '<small>' + QUALITY[k].desc + '</small></button>';
    }).join('');

    function showErr(e, n, prefix) {
      var info = errInfo(e, n), box = $('err');
      if (!info) { box.hidden = true; return; }
      box.innerHTML = '<div class="pc-err">' + (prefix ? '<b>📄 ' + esc(prefix) + '</b>' : '') + '<b>⚠️ ' + esc(info[0]) + '</b>' + esc(info[1]) + '</div>';
      box.hidden = false;
    }
    function clearOut() {
      $('err').hidden = true; $('res').hidden = true; $('res').innerHTML = '';
      S.results.forEach(function (r) { if (r.cmp) { try { r.cmp.a.destroy(); r.cmp.b.destroy(); } catch (e) { } } });
      S.urls.forEach(function (u) { URL.revokeObjectURL(u); }); S.urls = []; S.results = [];
    }
    function setBusy(b) {
      S.busy = b;
      root.querySelectorAll('button,input').forEach(function (x) {
        if (x.getAttribute('data-r') === 'cancel') return;
        x.disabled = b || (x.getAttribute('data-r') === 'range' && S.files.length !== 1);
      });
      $('prog').hidden = !b;
    }
    function prog(f, txt) { $('bar').style.width = Math.round(Math.min(1, f) * 100) + '%'; if (txt) $('ptxt').textContent = txt; }

    function renderFiles() {
      var box = $('files'), has = S.files.length > 0;
      box.innerHTML = S.files.map(function (f, i) {
        return '<div class="pc-file"><span style="font-size:26px">📄</span><div><b>' + esc(f.name) + '</b><small>' + fmt(f.bytes.byteLength) + ' · ' + f.pages + '쪽</small></div>' +
          '<button type="button" class="pc-btn pc-ghost pc-x" data-del="' + i + '" aria-label="빼기">✕</button></div>';
      }).join('');
      box.hidden = $('opts').hidden = $('morebox').hidden = !has; $('drop').hidden = has;
      var single = S.files.length === 1;
      $('range').disabled = !single; if (!single) $('range').value = '';
      $('rangehint').textContent = single ? '이 PDF는 ' + S.files[0].pages + '쪽까지 있어요. 고른 쪽만 남겨서 줄여요.' : '쪽 범위는 파일이 1개일 때만 쓸 수 있어요.';
      var biggest = S.files.reduce(function (m, f) { return Math.max(m, f.bytes.byteLength); }, 0);
      root.querySelectorAll('[data-t]').forEach(function (c) { c.classList.toggle('dim', has && +c.getAttribute('data-t') * MB >= biggest); });
      if (has) {
        var under = TARGETS.map(function (t) { return t[0]; }).filter(function (t) { return t * MB < biggest * 0.9; });
        if (under.length && under.indexOf(S.target) < 0) selTarget(under[0]);
      }
    }
    function selTarget(t) {
      S.target = t;
      root.querySelectorAll('[data-t]').forEach(function (c) { c.classList.toggle('sel', +c.getAttribute('data-t') === t); });
    }

    async function addFiles(list) {
      clearOut();
      var over = S.files.length + list.length > MAX_FILES;
      if (over) list = list.slice(0, Math.max(0, MAX_FILES - S.files.length));
      if (!list.length) { if (over) showErr(new Error('TOO_MANY')); return; }
      setBusy(true); prog(0.05, '파일을 여는 중…');
      var lastErr = null, bad = [];
      try { await loadLibs(); } catch (e) { setBusy(false); showErr(e); return; }
      for (var i = 0; i < list.length; i++) {
        var name = list[i].name, bytes;
        try {
          bytes = list[i].bytes || await readBlob(list[i].file);
          if (bytes.byteLength > MAX_FILE) throw new Error('TOO_BIG');
          var head = new Uint8Array(bytes.slice(0, 1024)), ok = false;
          for (var k = 0; k < head.length - 4; k++) if (head[k] === 37 && head[k + 1] === 80 && head[k + 2] === 68 && head[k + 3] === 70) { ok = true; break; }
          if (!ok) throw new Error('NOT_PDF');
          var pdf = await window.pdfjsLib.getDocument({ data: u8(bytes) }).promise;
          var n = pdf.numPages; pdf.destroy();
          if (!n) throw new Error('NO_PAGES');
          S.files.push({ name: name, base: name.replace(/\.pdf$/i, '') || 'document', bytes: bytes, pages: n });
        } catch (e) { lastErr = e; bad.push(name); }
        prog(0.05 + (i + 1) / list.length * 0.9);
      }
      setBusy(false); renderFiles();
      if (lastErr) showErr(lastErr, 0, list.length > 1 ? bad.join(', ') : '');
      else if (over) showErr(new Error('TOO_MANY'));
    }

    async function run() {
      if (!S.files.length || S.busy) return;
      clearOut();
      var opt = { mode: S.mode, target: S.target * MB, qIdx: QUALITY[S.quality].idx, gray: $('gray').checked, keepText: $('keep').checked, pages: null };
      if (S.files.length === 1 && $('range').value.trim()) {
        try { opt.pages = parseRange($('range').value, S.files[0].pages); }
        catch (e) { showErr(e, S.files[0].pages); return; }
      }
      S.cancel = false; setBusy(true);
      var isCancel = function () { return S.cancel; };
      var t0 = Date.now(), nf = S.files.length;
      try { await loadLibs(); } catch (e) { setBusy(false); showErr(e); return; }
      for (var i = 0; i < nf; i++) {
        var f = S.files[i];
        try {
          var res = await compressOne(f, opt, function (p, txt) {
            var all = (i + p) / nf, el = (Date.now() - t0) / 1000, left = all > 0.08 && el > 3 ? el / all - el : 0;
            prog(all, (nf > 1 ? '파일 ' + (i + 1) + '/' + nf + ' · ' : '') + txt + (left > 2 ? ' · 약 ' + secText(left) + ' 남음' : ''));
          }, isCancel);
          res.file = f; S.results.push(res);
        } catch (e) {
          if (/CANCEL/.test(e && e.message)) break;
          S.results.push({ file: f, error: e });
        }
      }
      setBusy(false);
      if (!S.results.length) return;
      showResults(opt);
    }

    function verdict(r, opt) {
      if (r.error) { var info = errInfo(r.error); return { cls: 'bad', badge: '⚠️ 실패', msg: info ? info[0] + ' — ' + info[1] : '' }; }
      var tgtMB = opt.target / MB, hit = opt.mode !== 'target' || r.size <= opt.target;
      if (r.same) {
        return r.orig <= opt.target && opt.mode === 'target'
          ? { cls: '', badge: '✅ 이미 ' + tgtMB + 'MB 이하', msg: '원본이 이미 목표보다 작아요. 줄이지 않고 그대로 올려도 돼요.' }
          : { cls: 'warn', badge: '이미 작은 파일', msg: '이 PDF는 이미 충분히 작아서 더 줄이지 못했어요. 목표가 더 작다면 쪽 범위로 필요한 쪽만 남기거나 「PDF 페이지 정리」로 나눠 보세요.' };
      }
      if (!hit) return { cls: 'warn', badge: '⚠️ 목표보다 큼', msg: tgtMB + 'MB까지는 못 줄였어요. 쪽이 많아서 그래요. 쪽 범위로 나눠서 두 번 줄이거나, 「PDF 페이지 정리」로 필요 없는 쪽을 지워 보세요.' };
      var m = r.how === 'lossless' ? '글자와 화질은 그대로 두고 군더더기만 정리했어요.'
        : r.how === 'images' ? '글자는 그대로 두고 PDF 속 사진만 줄였어요. 글자 복사·검색도 돼요.'
          : '각 쪽을 깨끗한 이미지로 바꿔 줄였어요 (해상도 ' + r.lv.dpi + 'dpi). 제출 전에 「비교해 보기」로 글씨가 잘 보이는지 확인해 주세요.';
      return { cls: '', badge: opt.mode === 'target' ? '✅ ' + tgtMB + 'MB 이하 성공' : '✅ 완료', msg: m };
    }

    function showResults(opt) {
      var box = $('res'), html = '', okList = [];
      S.results.forEach(function (r, i) {
        var v = verdict(r, opt);
        html += '<div class="pc-res ' + v.cls + '" data-i="' + i + '">';
        if (S.results.length > 1 || r.error) html += '<p class="pc-rname">📄 ' + esc(r.file.name) + '</p>';
        html += '<div style="text-align:center"><span class="pc-badge">' + esc(v.badge) + '</span></div>';
        if (!r.error) {
          var blob = new Blob([r.bytes], { type: 'application/pdf' }), url = URL.createObjectURL(blob);
          S.urls.push(url); r.blob = blob; r.url = url;
          r.fname = r.file.base + (r.same ? '' : '_압축') + '.pdf';
          okList.push(r);
          var pct = Math.max(0, Math.round((1 - r.size / r.orig) * 100));
          html += '<div class="pc-big"><s>' + fmt(r.orig) + '</s><span>→</span><em>' + fmt(r.size) + '</em></div>';
          if (!r.same) html += '<p class="pc-msg" style="margin:0"><b>' + pct + '%</b> 줄었어요' + (r.pages.length !== r.total ? ' · ' + r.pages.length + '쪽만 남김' : '') + '</p>';
        }
        html += '<p class="pc-msg">' + esc(v.msg) + '</p>';
        if (!r.error) {
          html += '<div class="pc-row"><button type="button" class="pc-btn pc-ok" data-a="save">💾 저장하기</button>' +
            '<button type="button" class="pc-btn pc-ghost" data-a="cmp">👀 비교해 보기</button></div>' +
            '<div class="pc-cmp" data-r="cmp' + i + '" hidden></div>';
          if (!r.keptText) html += '<div class="pc-note">💡 쪽마다 이미지로 바뀌어서 글자를 드래그해 복사할 수는 없어요. 제출·보관용으로는 문제없어요.</div>';
        }
        html += '</div>';
      });
      var shareAll = okList.length && canShare(okList);
      html += '<div class="pc-all">' +
        (okList.length > 1 ? '<div class="pc-row" style="margin-bottom:8px"><button type="button" class="pc-btn pc-main" data-a="zip">📦 전부 ZIP으로 저장 (' + okList.length + '개)</button></div>' : '') +
        '<div class="pc-row">' +
        (shareAll ? '<button type="button" class="pc-btn pc-ghost" data-a="share">📤 공유·파일에 저장</button>' : '') +
        '<button type="button" class="pc-btn pc-ghost" data-a="again">🔄 다른 설정으로</button></div></div>';
      box.innerHTML = html; box.hidden = false;
      if (box.scrollIntoView) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function canShare(list) {
      try {
        if (!navigator.canShare || !window.File) return false;
        return navigator.canShare({ files: list.map(function (r) { return new File([r.blob], r.fname, { type: 'application/pdf' }); }) });
      } catch (e) { return false; }
    }
    function download(url, name) {
      var a = document.createElement('a');
      a.href = url; a.download = name; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
    }
    async function saveZip(btn) {
      var ok = S.results.filter(function (r) { return !r.error; });
      btn.disabled = true; var old = btn.textContent; btn.textContent = 'ZIP 만드는 중…';
      try {
        try { await loadScript(LIB.jszip); } catch (e) { throw new Error('ZIP_FAIL'); }
        if (!window.JSZip) throw new Error('ZIP_FAIL');
        var zip = new window.JSZip(), used = {};
        ok.forEach(function (r) {
          var n = r.fname, k = 2; while (used[n]) n = r.fname.replace(/\.pdf$/, '(' + (k++) + ').pdf'); used[n] = 1;
          zip.file(n, r.bytes);
        });
        var blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
        var url = URL.createObjectURL(blob); S.urls.push(url);
        download(url, 'PDF_용량줄이기_' + ok.length + '개.zip');
      } catch (e) { showErr(e); }
      btn.disabled = false; btn.textContent = old;
    }

    // 원본과 결과를 나란히 비교
    async function toggleCompare(i, btn) {
      var r = S.results[i], box = $('cmp' + i);
      if (!box.hidden) { box.hidden = true; btn.textContent = '👀 비교해 보기'; return; }
      box.hidden = false; btn.textContent = '👀 비교 닫기';
      if (!r.cmp) {
        r.cmp = { page: 1, zoom: false };
        box.innerHTML = '<div class="pc-cmpbar"><button type="button" class="pc-btn pc-ghost" data-c="prev" aria-label="이전 쪽">‹</button><span data-c="lab"></span>' +
          '<button type="button" class="pc-btn pc-ghost" data-c="next" aria-label="다음 쪽">›</button><button type="button" class="pc-btn pc-ghost" data-c="zoom">🔍 확대</button></div>' +
          '<div class="pc-cols"><div class="pc-col"><p>원본 ' + fmt(r.orig) + '</p><div class="pc-view" data-c="v0"></div></div>' +
          '<div class="pc-col"><p>줄인 결과 ' + fmt(r.size) + '</p><div class="pc-view" data-c="v1"></div></div></div>';
        var v0 = box.querySelector('[data-c=v0]'), v1 = box.querySelector('[data-c=v1]'), lock = false;
        var sync = function (a, b) { a.addEventListener('scroll', function () { if (lock) return; lock = true; b.scrollTop = a.scrollTop; b.scrollLeft = a.scrollLeft; lock = false; }); };
        sync(v0, v1); sync(v1, v0);
        box.addEventListener('click', function (ev) {
          var b = ev.target.closest('[data-c]'); if (!b || b.tagName !== 'BUTTON') return;
          var c = b.getAttribute('data-c');
          if (c === 'prev' && r.cmp.page > 1) { r.cmp.page--; drawCmp(r, box); }
          else if (c === 'next' && r.cmp.page < r.pages.length) { r.cmp.page++; drawCmp(r, box); }
          else if (c === 'zoom') { r.cmp.zoom = !r.cmp.zoom; b.textContent = r.cmp.zoom ? '↩ 전체' : '🔍 확대'; drawCmp(r, box); }
        });
        try {
          r.cmp.a = await window.pdfjsLib.getDocument({ data: u8(r.file.bytes) }).promise;
          r.cmp.b = await window.pdfjsLib.getDocument({ data: new Uint8Array(r.bytes) }).promise;
        } catch (e) { box.innerHTML = '<p class="pc-msg">미리보기를 만들지 못했어요. 「저장하기」로 받아서 열어 확인해 주세요.</p>'; return; }
      }
      drawCmp(r, box);
    }
    async function drawCmp(r, box) {
      var c = r.cmp, n = r.pages.length, my = (c.seq = (c.seq || 0) + 1);
      box.querySelector('[data-c=lab]').textContent = c.page + ' / ' + n + '쪽';
      var views = [box.querySelector('[data-c=v0]'), box.querySelector('[data-c=v1]')];
      var docs = [c.a, c.b], pnum = [r.pages[c.page - 1], c.page];
      var cssW = views[0].clientWidth || 160, dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (var k = 0; k < 2; k++) {
        try {
          var page = await docs[k].getPage(pnum[k]), vp1 = page.getViewport({ scale: 1 });
          var scale = Math.min(cssW * dpr * (c.zoom ? 2.6 : 1) / vp1.width, Math.sqrt(MAX_PIXELS / (vp1.width * vp1.height)));
          var vp = page.getViewport({ scale: scale }), cv = document.createElement('canvas');
          cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
          await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
          page.cleanup();
          if (my !== c.seq) { cv.width = cv.height = 0; return; } // 그사이 다른 쪽을 눌렀으면 버림
          var old = views[k].querySelector('canvas'); if (old) { old.width = old.height = 0; old.remove(); }
          views[k].classList.toggle('zoom', c.zoom); views[k].appendChild(cv);
        } catch (e) { }
      }
      views[0].scrollTop = c.zoom ? views[0].scrollHeight * 0.1 : 0; views[0].scrollLeft = 0;
    }

    /* 이벤트 */
    function pick() { if (S.busy) return; input.value = ''; input.click(); }
    $('pick').onclick = pick; $('add').onclick = pick;
    input.onchange = function () {
      var fs = Array.prototype.slice.call(input.files || []); input.value = '';
      addFiles(fs.map(function (f) { return { name: f.name, file: f }; }));
    };
    $('sample').onclick = async function () {
      clearOut(); setBusy(true); prog(0.3, '예시 PDF를 만드는 중…');
      try { await loadLibs(); var b = await makeSample(); setBusy(false); await addFiles([{ name: '예시_제출서류.pdf', bytes: b }]); }
      catch (e) { setBusy(false); showErr(e); }
    };
    $('clear').onclick = function () { clearOut(); S.files = []; renderFiles(); };
    $('cancel').onclick = function () { S.cancel = true; $('ptxt').textContent = '취소하는 중…'; };
    $('go').onclick = run;
    root.addEventListener('click', function (ev) {
      var t = ev.target.closest('button'); if (!t || t.disabled || t.hasAttribute('data-c')) return;
      var card = t.closest('[data-i]'), a = t.getAttribute('data-a');
      if (t.hasAttribute('data-t')) selTarget(+t.getAttribute('data-t'));
      else if (t.hasAttribute('data-del')) { clearOut(); S.files.splice(+t.getAttribute('data-del'), 1); renderFiles(); }
      else if (t.hasAttribute('data-q')) {
        S.quality = t.getAttribute('data-q');
        root.querySelectorAll('[data-q]').forEach(function (c) { c.classList.toggle('sel', c === t); });
      } else if (t.hasAttribute('data-mode')) {
        S.mode = t.getAttribute('data-mode');
        root.querySelectorAll('[data-mode]').forEach(function (c) { c.classList.toggle('sel', c === t); });
        $('tgt').hidden = S.mode !== 'target'; $('qual').hidden = S.mode === 'target';
      } else if (a === 'save' && card) { var r = S.results[+card.getAttribute('data-i')]; download(r.url, r.fname); }
      else if (a === 'cmp' && card) toggleCompare(+card.getAttribute('data-i'), t);
      else if (a === 'zip') saveZip(t);
      else if (a === 'share') {
        var files = S.results.filter(function (r) { return !r.error; }).map(function (r) { return new File([r.blob], r.fname, { type: 'application/pdf' }); });
        navigator.share({ files: files }).catch(function () { });
      } else if (a === 'again') {
        $('res').hidden = true; if ($('opts').scrollIntoView) $('opts').scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    var drop = $('drop');
    ['dragenter', 'dragover'].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.add('on'); }); });
    ['dragleave', 'drop'].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.remove('on'); }); });
    drop.addEventListener('drop', function (e) {
      var fs = Array.prototype.slice.call((e.dataTransfer && e.dataTransfer.files) || []);
      if (fs.length) addFiles(fs.map(function (f) { return { name: f.name, file: f }; }));
    });
  }

  function init() { var root = document.getElementById(ROOT_ID); if (root) mount(root); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();