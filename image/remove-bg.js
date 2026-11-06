/*!
 * 착착도구 · 사진 배경 지우기 (브라우저 AI)  v1.1
 * https://barodogu.blogspot.com
 * 사용법: 글에 <div id="bd-rmbg"></div> 를 두고 이 스크립트를 불러오세요.
 * 원칙: 사진은 서버로 보내지 않습니다. AI 모델 파일만 처음 한 번 내려받아 기기 안에서 처리합니다.
 * 사용 라이브러리: onnxruntime-web 1.30.0 (MIT, cdnjs)
 * AI 모델: MODNet (Apache-2.0) – Hugging Face Xenova/modnet (커밋 고정)
 */
(function () {
  'use strict';
  var ROOT_ID = 'bd-rmbg';
  var ORT_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/onnxruntime-web/1.30.0/';
  var MODEL_BASE = 'https://huggingface.co/Xenova/modnet/resolve/d73298e811956d07bafec4ce9446ea4ecaa14438/onnx/';
  var MODELS = {
    fast: { file: 'model_quantized.onnx', label: '⚡ 빠르게', size: '6.6MB', side: 512 },
    hq: { file: 'model.onnx', label: '🎯 정밀하게', size: '26MB', side: 768 }
  };
  var CACHE_NAME = 'bd-rmbg-models-v1';
  var MAX_SIDE = 4096, MAX_PIXELS = 12e6; // 아이폰 사파리 캔버스 한도 고려
  var BGS = [
    { id: 'none', name: '투명', color: null },
    { id: 'white', name: '흰색', color: '#ffffff' },
    { id: 'sky', name: '하늘색', color: '#dbeafe' },
    { id: 'gray', name: '연회색', color: '#e5e7eb' },
    { id: 'blue', name: '파랑', color: '#1d4ed8' }
  ];

  var root = document.getElementById(ROOT_ID);
  if (!root) return;

  /* ---------------- 스타일 ---------------- */
  var css = '' +
    '#bd-rmbg{--c:#2563eb;--cd:#1e40af;--bg:#fff;--line:#e2e8f0;--sub:#64748b;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;color:#0f172a;max-width:720px;margin:0 auto;box-sizing:border-box;line-height:1.55;-webkit-text-size-adjust:100%}' +
    '#bd-rmbg *{box-sizing:border-box}' +
    '#bd-rmbg .r-card{background:var(--bg);border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:0 2px 10px rgba(15,23,42,.06)}' +
    '#bd-rmbg .r-head{display:flex;align-items:center;gap:8px;font-weight:800;font-size:18px;margin:0 0 4px}' +
    '#bd-rmbg .r-safe{display:inline-block;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;border-radius:999px;font-size:12.5px;padding:3px 10px;font-weight:700;margin:2px 0 12px}' +
    '#bd-rmbg .r-drop{border:2px dashed #93c5fd;background:#eff6ff;border-radius:14px;padding:22px 12px;text-align:center;cursor:pointer;transition:background .15s}' +
    '#bd-rmbg .r-drop.over{background:#dbeafe}' +
    '#bd-rmbg .r-drop b{display:block;font-size:16px;margin:6px 0 2px;color:var(--cd)}' +
    '#bd-rmbg .r-drop small{color:var(--sub)}' +
    '#bd-rmbg .r-btn{appearance:none;-webkit-appearance:none;border:0;border-radius:12px;min-height:48px;padding:10px 16px;font-size:15.5px;font-weight:700;cursor:pointer;background:var(--c);color:#fff;font-family:inherit;touch-action:manipulation}' +
    '#bd-rmbg .r-btn:active{transform:scale(.98)}' +
    '#bd-rmbg .r-btn[disabled]{opacity:.5;cursor:not-allowed}' +
    '#bd-rmbg .r-btn.ghost{background:#fff;color:var(--cd);border:1.5px solid #bfdbfe}' +
    '#bd-rmbg .r-btn.green{background:#059669}' +
    '#bd-rmbg .r-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}' +
    '#bd-rmbg .r-row>.r-btn{flex:1 1 140px}' +
    '#bd-rmbg .r-lbl{font-size:13.5px;font-weight:800;color:#334155;margin:14px 0 6px}' +
    '#bd-rmbg .r-seg{display:flex;gap:6px;background:#f1f5f9;border-radius:12px;padding:4px}' +
    '#bd-rmbg .r-seg button{flex:1;border:0;background:transparent;border-radius:9px;min-height:44px;font-size:14.5px;font-weight:700;color:#475569;cursor:pointer;font-family:inherit;touch-action:manipulation;line-height:1.25}' +
    '#bd-rmbg .r-seg button small{display:block;font-weight:500;font-size:11.5px;color:#94a3b8}' +
    '#bd-rmbg .r-seg button.on{background:#fff;color:var(--cd);box-shadow:0 1px 4px rgba(0,0,0,.12)}' +
    '#bd-rmbg .r-seg button.on small{color:var(--c)}' +
    '#bd-rmbg .r-prog{margin-top:14px;display:none}' +
    '#bd-rmbg .r-bar{height:10px;background:#e2e8f0;border-radius:99px;overflow:hidden}' +
    '#bd-rmbg .r-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#3b82f6,#06b6d4);transition:width .2s}' +
    '#bd-rmbg .r-ptxt{font-size:13.5px;color:#334155;margin-top:6px}' +
    '#bd-rmbg .r-err{display:none;margin-top:12px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:12px;padding:12px;font-size:14px}' +
    '#bd-rmbg .r-err b{display:block;margin-bottom:2px}' +
    '#bd-rmbg .r-stage{display:none;margin-top:14px}' +
    '#bd-rmbg .r-view{position:relative;border-radius:12px;overflow:hidden;border:1px solid var(--line);background-color:#fff;background-image:linear-gradient(45deg,#e5e7eb 25%,transparent 25%),linear-gradient(-45deg,#e5e7eb 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e5e7eb 75%),linear-gradient(-45deg,transparent 75%,#e5e7eb 75%);background-size:20px 20px;background-position:0 0,0 10px,10px -10px,-10px 0;text-align:center;line-height:0}' +
    '#bd-rmbg .r-view canvas{max-width:100%;max-height:70vh;width:auto;height:auto;display:inline-block}' +
    '#bd-rmbg .r-tag{position:absolute;left:8px;top:8px;background:rgba(15,23,42,.72);color:#fff;font-size:12px;line-height:1.4;padding:3px 8px;border-radius:99px}' +
    '#bd-rmbg .r-sw{display:flex;flex-wrap:wrap;gap:8px}' +
    '#bd-rmbg .r-sw button{display:flex;flex-direction:column;align-items:center;gap:3px;border:0;background:none;cursor:pointer;font-size:12px;color:#334155;font-family:inherit;padding:0;min-width:48px;touch-action:manipulation}' +
    '#bd-rmbg .r-sw span{width:40px;height:40px;border-radius:50%;border:2px solid #cbd5e1;display:block}' +
    '#bd-rmbg .r-sw button.on span{border:3px solid var(--c);box-shadow:0 0 0 2px #bfdbfe}' +
    '#bd-rmbg .r-sw .chk{background-image:linear-gradient(45deg,#cbd5e1 25%,transparent 25%),linear-gradient(-45deg,#cbd5e1 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#cbd5e1 75%),linear-gradient(-45deg,transparent 75%,#cbd5e1 75%);background-size:10px 10px;background-position:0 0,0 5px,5px -5px,-5px 0;background-color:#fff}' +
    '#bd-rmbg .r-sw label{position:relative}' +
    '#bd-rmbg .r-sw input[type=color]{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer}' +
    '#bd-rmbg .r-opt{display:flex;align-items:center;gap:8px;font-size:14px;margin-top:10px;color:#334155}' +
    '#bd-rmbg .r-opt input{width:20px;height:20px}' +
    '#bd-rmbg .r-note{font-size:12.5px;color:var(--sub);margin-top:8px}' +
    '#bd-rmbg .r-info{font-size:13px;color:#334155;margin-top:8px;background:#f8fafc;border-radius:10px;padding:8px 10px}' +
    '#bd-rmbg .r-hide{display:none!important}' +
    '#bd-rmbg .r-view.edit canvas,#bd-rmbg .r-view.pan canvas{touch-action:none;cursor:crosshair}' +
    '#bd-rmbg .r-view.pan canvas{cursor:grab}' +
    '#bd-rmbg .r-cur{position:absolute;border:2px solid #fff;outline:1.5px solid rgba(15,23,42,.6);border-radius:50%;pointer-events:none;display:none;transform:translate(-50%,-50%)}' +
    '#bd-rmbg .r-tool{display:none;margin-top:10px;background:#f8fafc;border:1px solid var(--line);border-radius:12px;padding:10px}' +
    '#bd-rmbg .r-range{display:flex;align-items:center;gap:10px;font-size:13.5px;color:#334155;margin-top:8px}' +
    '#bd-rmbg .r-range input{flex:1;min-width:0;height:28px}' +
    '#bd-rmbg .r-mini{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}' +
    '#bd-rmbg .r-mini .r-btn{min-height:42px;font-size:14px;padding:8px 12px;flex:1 1 90px}' +
    '#bd-rmbg .r-sel{width:100%;min-height:46px;border:1.5px solid #cbd5e1;border-radius:12px;padding:8px 10px;font-size:15px;font-family:inherit;background:#fff;color:#0f172a}' +
    '#bd-rmbg .r-warn{font-size:12.5px;color:#9a3412;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:8px 10px;margin-top:8px}';

  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  /* ---------------- 화면 ---------------- */
  root.innerHTML = '' +
    '<div class="r-card">' +
    '<div class="r-head">✂️ 사진 배경 지우기</div>' +
    '<div class="r-safe">🔒 사진은 서버로 전송되지 않아요 · 이 기기에서만 처리</div>' +
    '<div class="r-drop" data-r="drop" role="button" tabindex="0" aria-label="사진 선택">' +
    '<div style="font-size:34px;line-height:1">🖼️</div><b>사진 선택하기</b><small>여기를 누르거나 사진을 끌어다 놓으세요 (JPG·PNG·WEBP)</small></div>' +
    '<input type="file" accept="image/*" data-r="file" class="r-hide">' +
    '<div class="r-row"><button class="r-btn ghost" data-r="sample">👀 예시 사진으로 체험하기</button></div>' +
    '<div class="r-lbl">AI 정밀도</div>' +
    '<div class="r-seg" data-r="mode">' +
    '<button data-m="fast" class="on">⚡ 빠르게<small>모델 6.6MB · 폰 추천</small></button>' +
    '<button data-m="hq">🎯 정밀하게<small>모델 26MB · 머리카락·옷 경계</small></button></div>' +
    '<div class="r-note">처음 한 번만 AI 모델을 내려받고, 다음부터는 저장된 모델을 바로 써요. 사람(인물) 사진에 맞춰진 AI예요.</div>' +
    '<div class="r-prog" data-r="prog"><div class="r-bar"><i data-r="bar"></i></div><div class="r-ptxt" data-r="ptxt"></div></div>' +
    '<div class="r-err" data-r="err"></div>' +
    '<div class="r-stage" data-r="stage">' +
    '<div class="r-view" data-r="vbox"><canvas data-r="view"></canvas><div class="r-tag" data-r="tag">결과</div><div class="r-cur" data-r="cur"></div></div>' +
    '<div class="r-row"><button class="r-btn ghost" data-r="cmp">👆 누르고 있으면 원본 보기</button>' +
    '<button class="r-btn ghost" data-r="editbtn">✏️ 손으로 다듬기</button></div>' +
    '<div class="r-tool" data-r="tool">' +
    '<div class="r-seg" data-r="brush"><button data-b="erase" class="on">🧽 지우기</button><button data-b="restore">🖌️ 되살리기</button></div>' +
    '<div class="r-range">붓 크기 <input type="range" min="6" max="90" value="30" data-r="bsize"><b data-r="bsv">30</b></div>' +
    '<div class="r-mini"><button class="r-btn ghost" data-r="undo">↩️ 되돌리기</button><button class="r-btn ghost" data-r="reset">🧹 손댄 것 모두 취소</button></div>' +
    '<div class="r-note">흐리게 보이는 부분이 지워진 곳이에요. 손가락으로 문질러 지우거나 되살리세요.</div></div>' +
    '<div class="r-lbl">배경 색</div>' +
    '<div class="r-sw" data-r="sw"></div>' +
    '<div class="r-lbl">가장자리</div>' +
    '<div class="r-seg" data-r="edge">' +
    '<button data-e="soft">부드럽게</button><button data-e="mid" class="on">보통</button><button data-e="hard">선명하게</button></div>' +
    '<label class="r-opt"><input type="checkbox" data-r="fill" checked> 얼굴·옷 안쪽 구멍·얼룩 메우기 (증명사진 추천)</label>' +
    '<div class="r-lbl">사진 크기 (증명사진 규격)</div>' +
    '<select class="r-sel" data-r="preset">' +
    '<option value="orig">원본 그대로</option>' +
    '<option value="35x45">3.5×4.5cm · 자격증·각종 증명 (413×531)</option>' +
    '<option value="30x40">3×4cm 반명함 · 이력서 (354×472)</option>' +
    '<option value="sq">정사각형 · 프로필·SNS (1080×1080)</option></select>' +
    '<div class="r-tool" data-r="croptool">' +
    '<div class="r-range">크기 <input type="range" min="60" max="160" value="100" data-r="zoom"><b data-r="zv">100%</b></div>' +
    '<div class="r-mini"><button class="r-btn ghost" data-r="autofit">🎯 자동 맞춤</button><button class="r-btn ghost" data-r="sheet">🖨️ 인화용 4×6 한 장에 모아 저장</button></div>' +
    '<div class="r-note" data-r="cropnote">사진을 손가락으로 끌어 위치를 맞추세요. 점선은 정수리·턱 위치 기준이에요(3.5×4.5).</div>' +
    '<div class="r-warn">⚠️ <b>여권</b>은 포토샵 등으로 수정한 사진을 받지 않아요. 여권·외국 비자용은 사진관에서 찍으세요.</div></div>' +
    '<div class="r-lbl">파일 용량</div>' +
    '<select class="r-sel" data-r="limit"><option value="0">제한 없음 (최고 화질)</option><option value="500">500KB 이하</option><option value="200">200KB 이하</option><option value="100">100KB 이하</option></select>' +
    '<div class="r-info" data-r="info"></div>' +
    '<div class="r-row">' +
    '<button class="r-btn" data-r="save">💾 이미지 저장</button>' +
    '<button class="r-btn green r-hide" data-r="share">📤 공유·사진앱 저장</button></div>' +
    '<div class="r-row"><button class="r-btn ghost" data-r="again">🔄 다른 사진 하기</button></div>' +
    '<div class="r-note" data-r="savenote"></div>' +
    '</div></div>';

  function $(n) { return root.querySelector('[data-r="' + n + '"]'); }

  var S = {
    mode: 'fast', edge: 'mid', bg: 'none', custom: '#fde68a', fill: true,
    srcCanvas: null, matte: null, mw: 0, mh: 0, name: 'photo', busy: false,
    showOrig: false, editing: false, brush: 'erase', bsize: 30, strokes: [], preset: 'orig', crop: null, savedNote: ''
  };
  var sessions = {}; var ortLib = null;

  /* ---------------- 공통 안내 ---------------- */
  function showErr(why, how) {
    var e = $('err');
    e.innerHTML = '<b>⚠️ ' + why + '</b>' + (how ? '👉 ' + how : '');
    e.style.display = 'block';
  }
  function clearErr() { $('err').style.display = 'none'; }
  function prog(p, txt) {
    $('prog').style.display = 'block';
    $('bar').style.width = Math.max(0, Math.min(100, p)) + '%';
    $('ptxt').textContent = txt;
  }
  function progDone() { $('prog').style.display = 'none'; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function isIOS() { return /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }

  /* ---------------- 라이브러리·모델 ---------------- */
  function loadOrt() {
    if (ortLib) return Promise.resolve(ortLib);
    return import(ORT_BASE + 'ort.wasm.bundle.min.mjs').then(function (m) {
      var o = m.default && m.default.InferenceSession ? m.default : m;
      o.env.wasm.wasmPaths = ORT_BASE;
      o.env.wasm.numThreads = 1; // 블로그는 교차출처 격리가 없어 단일 스레드로
      o.env.wasm.proxy = false;
      ortLib = o;
      return o;
    });
  }

  function fetchModel(key) {
    var url = MODEL_BASE + MODELS[key].file;
    var cachePromise = (window.caches && caches.open) ? caches.open(CACHE_NAME).catch(function () { return null; }) : Promise.resolve(null);
    return cachePromise.then(function (cache) {
      var hit = cache ? cache.match(url).catch(function () { return null; }) : Promise.resolve(null);
      return hit.then(function (res) {
        if (res) { prog(60, '저장된 AI 모델을 불러오는 중…'); return res.arrayBuffer(); }
        return fetch(url, { mode: 'cors', credentials: 'omit' }).then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          var total = +r.headers.get('content-length') || 0;
          if (!r.body || !r.body.getReader) {
            prog(30, 'AI 모델 내려받는 중… (처음 한 번만)');
            return r.arrayBuffer();
          }
          var reader = r.body.getReader(), chunks = [], got = 0;
          function pump() {
            return reader.read().then(function (d) {
              if (d.done) return;
              chunks.push(d.value); got += d.value.length;
              var mb = (got / 1048576).toFixed(1);
              prog(total ? got / total * 70 : 35, 'AI 모델 내려받는 중… ' + mb + 'MB' + (total ? ' / ' + (total / 1048576).toFixed(1) + 'MB' : '') + ' (처음 한 번만)');
              return pump();
            });
          }
          return pump().then(function () {
            var buf = new Uint8Array(got), o = 0;
            chunks.forEach(function (c) { buf.set(c, o); o += c.length; });
            if (cache) {
              try { cache.put(url, new Response(buf.slice(0), { headers: { 'Content-Type': 'application/octet-stream' } })).catch(function () {}); } catch (e) {}
            }
            return buf.buffer;
          });
        });
      });
    });
  }

  function getSession(key) {
    if (sessions[key]) return Promise.resolve(sessions[key]);
    prog(3, 'AI 엔진 준비 중…');
    return loadOrt().catch(function (e) {
      var err = new Error('ORT'); err.cause = e; throw err;
    }).then(function (o) {
      return fetchModel(key).catch(function (e) {
        var err = new Error('MODEL'); err.cause = e; throw err;
      }).then(function (buf) {
        prog(75, 'AI 모델 준비 중…');
        return o.InferenceSession.create(new Uint8Array(buf), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      }).then(function (s) { sessions[key] = s; return s; });
    });
  }

  /* ---------------- 이미지 불러오기 ---------------- */
  function fitSize(w, h) {
    var s = Math.min(1, MAX_SIDE / Math.max(w, h), Math.sqrt(MAX_PIXELS / (w * h)));
    if (isIOS()) s = Math.min(s, 2400 / Math.max(w, h));
    return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)), scaled: s < 1 };
  }

  function loadFile(file) {
    clearErr();
    if (!file) return;
    var n = (file.name || '').toLowerCase();
    if (/\.(heic|heif)$/.test(n) || /heic|heif/.test(file.type || '')) {
      // 사파리는 대부분 자동 변환되므로 일단 시도해 보고, 실패하면 안내
    } else if (file.type && !/^image\//.test(file.type)) {
      showErr('사진 파일이 아니에요.', 'JPG·PNG·WEBP 같은 사진 파일을 골라 주세요.');
      return;
    }
    S.name = (file.name || 'photo').replace(/\.[^.]+$/, '') || 'photo';
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      var f = fitSize(img.naturalWidth, img.naturalHeight);
      var c = document.createElement('canvas'); c.width = f.w; c.height = f.h;
      var x = c.getContext('2d');
      x.imageSmoothingQuality = 'high';
      x.drawImage(img, 0, 0, f.w, f.h);
      URL.revokeObjectURL(url);
      newImage();
      S.scaledNote = f.scaled ? '사진이 커서 ' + f.w + '×' + f.h + '로 줄여서 처리했어요 (휴대폰 메모리 보호).' : '';
      run(c);
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      if (/\.(heic|heif)$/.test(n)) showErr('이 브라우저는 아이폰 HEIC 사진을 열 수 없어요.', '아이폰 설정 › 카메라 › 포맷에서 「높은 호환성」을 고르거나, HEIC를 JPG로 바꾼 뒤 다시 올려 주세요.');
      else showErr('사진을 열 수 없어요. 파일이 깨졌거나 지원하지 않는 형식일 수 있어요.', '사진을 JPG나 PNG로 다시 저장하거나, 화면을 캡처한 이미지로 다시 시도해 보세요.');
    };
    img.src = url;
  }

  /* 예시 사진: 저작권 걱정 없도록 그 자리에서 그린 일러스트 인물 */
  function makeSample() {
    var W = 600, H = 800, c = document.createElement('canvas'); c.width = W; c.height = H;
    var x = c.getContext('2d'), seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    // 배경: 작은 캔버스에 책장을 그린 뒤 확대해 흐릿하게(인물 사진의 배경 흐림처럼)
    var b = document.createElement('canvas'); b.width = 150; b.height = 200;
    var bx = b.getContext('2d');
    var g = bx.createLinearGradient(0, 0, 150, 200); g.addColorStop(0, '#d9cbb4'); g.addColorStop(1, '#a8957a');
    bx.fillStyle = g; bx.fillRect(0, 0, 150, 200);
    for (var y = 0; y < 200; y += 33) {
      bx.fillStyle = '#6e503c'; bx.fillRect(0, y + 28, 150, 4);
      var px = 2;
      while (px < 145) {
        var bw = 3 + rnd() * 5, bh = 15 + rnd() * 10;
        bx.fillStyle = 'hsl(' + Math.floor(rnd() * 360) + ',45%,' + Math.floor(40 + rnd() * 30) + '%)';
        bx.fillRect(px, y + 28 - bh, bw, bh); px += bw + 1;
      }
    }
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(b, 0, 0, W, H);
    var cx = 300;
    function ell(ex, ey, rx, ry, col, a0, a1, rot) { x.beginPath(); x.ellipse(ex, ey, rx, ry, rot || 0, a0 || 0, a1 == null ? Math.PI * 2 : a1); x.fillStyle = col; x.fill(); }
    function rad(ex, ey, r, c0, c1) { var q = x.createRadialGradient(ex - r * .3, ey - r * .3, r * .1, ex, ey, r); q.addColorStop(0, c0); q.addColorStop(1, c1); return q; }
    // 몸(셔츠)
    x.fillStyle = rad(cx, 700, 260, '#3b4f66', '#1c2735');
    x.beginPath(); x.moveTo(cx - 240, H); x.bezierCurveTo(cx - 235, 660, cx - 190, 600, cx - 110, 585); x.lineTo(cx + 110, 585); x.bezierCurveTo(cx + 190, 600, cx + 235, 660, cx + 240, H); x.closePath(); x.fill();
    // 목
    x.fillStyle = rad(cx, 520, 90, '#d9ad88', '#b98a66'); x.fillRect(cx - 48, 460, 96, 140);
    x.fillStyle = '#f1f1f1'; x.beginPath(); x.moveTo(cx - 52, 585); x.lineTo(cx, 650); x.lineTo(cx + 52, 585); x.fill();
    // 뒷머리
    ell(cx, 335, 152, 178, rad(cx, 300, 190, '#3a302b', '#141110'));
    // 귀·얼굴
    ell(cx - 118, 372, 20, 34, '#c99a74'); ell(cx + 118, 372, 20, 34, '#c99a74');
    ell(cx, 362, 120, 152, rad(cx, 360, 170, '#ebc4a0', '#c08f69'));
    // 앞머리
    ell(cx, 252, 138, 88, rad(cx, 230, 150, '#3a302b', '#141110'), Math.PI, Math.PI * 2);
    ell(cx - 22, 242, 122, 58, '#1d1816', 0, Math.PI, 15 * Math.PI / 180);
    // 눈·눈썹·코·입
    [-1, 1].forEach(function (s) {
      ell(cx + s * 45, 352, 19, 9, '#f6f3ef'); ell(cx + s * 45, 352, 8, 8, '#2a1f19'); ell(cx + s * 47, 349, 2.5, 2.5, '#fff');
      ell(cx + s * 45, 322, 27, 6, '#2a2220', Math.PI, Math.PI * 2);
    });
    x.strokeStyle = 'rgba(150,100,70,.6)'; x.lineWidth = 3; x.beginPath(); x.moveTo(cx + 2, 362); x.quadraticCurveTo(cx - 12, 405, cx + 6, 410); x.stroke();
    ell(cx, 447, 34, 11, '#b05a55', 0, Math.PI);
    // 사진 느낌: 약한 노이즈
    var id = x.getImageData(0, 0, W, H), d = id.data;
    for (var i = 0; i < d.length; i += 4) { var nz = (rnd() - .5) * 14; d[i] += nz; d[i + 1] += nz; d[i + 2] += nz; }
    x.putImageData(id, 0, 0);
    return c;
  }

  /* ---------------- AI 실행 ---------------- */
  function inferSize(w, h, side) {
    var s = side / Math.max(w, h);
    var iw = Math.max(32, Math.round(w * s / 32) * 32), ih = Math.max(32, Math.round(h * s / 32) * 32);
    return { w: iw, h: ih };
  }

  function run(srcCanvas) {
    if (S.busy) return;
    S.busy = true; setBusy(true); clearErr();
    S.srcCanvas = srcCanvas;
    var key = S.mode, t0 = performance.now();
    getSession(key).then(function (sess) {
      prog(85, 'AI가 사람과 배경을 구분하는 중…');
      return wait(30).then(function () {
        var sz = inferSize(srcCanvas.width, srcCanvas.height, MODELS[key].side);
        var c = document.createElement('canvas'); c.width = sz.w; c.height = sz.h;
        var x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
        x.drawImage(srcCanvas, 0, 0, sz.w, sz.h);
        var d = x.getImageData(0, 0, sz.w, sz.h).data, n = sz.w * sz.h;
        var f = new Float32Array(3 * n);
        for (var i = 0, j = 0; i < n; i++, j += 4) {
          f[i] = d[j] / 127.5 - 1; f[i + n] = d[j + 1] / 127.5 - 1; f[i + 2 * n] = d[j + 2] / 127.5 - 1;
        }
        var feeds = {}; feeds[sess.inputNames[0]] = new ortLib.Tensor('float32', f, [1, 3, sz.h, sz.w]);
        return sess.run(feeds).then(function (out) {
          var o = out[sess.outputNames[0]];
          S.matte = new Float32Array(o.data); S.mw = sz.w; S.mh = sz.h;
          S.lastMs = Math.round(performance.now() - t0);
          S.lastIn = sz.w + '×' + sz.h;
        });
      });
    }).then(function () {
      progDone();
      $('stage').style.display = 'block';
      invalidate('matte');
      if (PRESETS[S.preset] && !S.crop) autoFit();
      render();
      $('stage').scrollIntoView && $('stage').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }).catch(function (e) {
      progDone();
      if (window.console) console.warn('[bd-rmbg]', e, e && e.cause);
      if (e && e.message === 'ORT') showErr('AI 엔진(onnxruntime)을 불러오지 못했어요.', '인터넷 연결을 확인하고 새로고침해 주세요. 회사·학교 와이파이에서 막힌 경우 휴대폰 데이터로 해 보세요. 아주 오래된 브라우저라면 크롬·사파리를 최신으로 업데이트해 주세요.');
      else if (e && e.message === 'MODEL') showErr('AI 모델 파일을 내려받지 못했어요.', '인터넷 연결을 확인한 뒤 다시 눌러 주세요. 회사망·광고차단 앱이 huggingface.co 를 막으면 받을 수 없어요. 사진은 전송되지 않고 모델만 내려받아요.');
      else if (e && /memory|alloc|RangeError/i.test(String(e.message || e))) showErr('휴대폰 메모리가 부족해요.', '다른 앱·탭을 닫고 「⚡ 빠르게」로 다시 해 보세요. 그래도 안 되면 사진을 조금 작게 캡처해서 올려 주세요.');
      else showErr('처리 중 문제가 생겼어요.', '페이지를 새로고침한 뒤 「⚡ 빠르게」로 다시 시도해 주세요. 계속되면 PC 크롬에서 해 보세요.');
    }).then(function () { S.busy = false; setBusy(false); });
  }

  function newImage() {
    S.strokes = []; S.crop = null; S.savedNote = ''; S.editing = false;
  }

  function setBusy(b) {
    ['sample', 'save', 'share', 'again', 'sheet', 'editbtn'].forEach(function (k) { var el = $(k); if (el) el.disabled = b; });
    $('drop').style.opacity = b ? .5 : 1;
    $('drop').style.pointerEvents = b ? 'none' : '';
  }

  /* ---------------- 후처리 ---------------- */
  function processedMatte() {
    var w = S.mw, h = S.mh, n = w * h, a = new Float32Array(S.matte);
    var lo = 0, hi = 1;
    if (S.edge === 'mid') { lo = 0.08; hi = 0.92; }
    if (S.edge === 'hard') { lo = 0.3; hi = 0.7; }
    for (var i = 0; i < n; i++) { var v = (a[i] - lo) / (hi - lo); a[i] = v < 0 ? 0 : v > 1 ? 1 : v; }
    if (S.fill) fillHoles(a, w, h);
    return a;
  }

  // 테두리와 이어지지 않은(=사람 안쪽에 갇힌) 투명 구멍을 채움
  function fillHoles(a, w, h) {
    var n = w * h, T = 0.5, seen = new Uint8Array(n), q = new Int32Array(n), qh = 0, qt = 0, i, p;
    function push(k) { if (!seen[k] && a[k] < T) { seen[k] = 1; q[qt++] = k; } }
    for (i = 0; i < w; i++) push(i); // 아래 테두리는 몸이 닿아 있어 제외
    for (i = 0; i < h; i++) { push(i * w); push(i * w + w - 1); }
    while (qh < qt) {
      p = q[qh++]; var px = p % w;
      if (px > 0) push(p - 1); if (px < w - 1) push(p + 1);
      if (p >= w) push(p - w); if (p < n - w) push(p + w);
    }
    // 배경에서 R픽셀보다 멀리 떨어진 안쪽은 모두 불투명하게(갈라진 금·반투명 얼룩 제거)
    var R = Math.max(2, Math.round(Math.max(w, h) / 160)), INF = 1e6, dist = new Float32Array(n), x, y, k;
    for (i = 0; i < n; i++) dist[i] = seen[i] ? 0 : INF;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      k = y * w + x;
      if (x > 0 && dist[k - 1] + 1 < dist[k]) dist[k] = dist[k - 1] + 1;
      if (y > 0 && dist[k - w] + 1 < dist[k]) dist[k] = dist[k - w] + 1;
    }
    for (y = h - 1; y >= 0; y--) for (x = w - 1; x >= 0; x--) {
      k = y * w + x;
      if (x < w - 1 && dist[k + 1] + 1 < dist[k]) dist[k] = dist[k + 1] + 1;
      if (y < h - 1 && dist[k + w] + 1 < dist[k]) dist[k] = dist[k + w] + 1;
    }
    for (i = 0; i < n; i++) if (dist[i] > R) a[i] = 1;
  }

  /* ---------------- 마스크 (AI 결과 + 손으로 다듬은 것) ---------------- */
  var PRESETS = {
    '35x45': { w: 413, h: 531, head: 0.755, top: 0.09, guide: true, sheet: true, label: '3.5x4.5' },
    '30x40': { w: 354, h: 472, head: 0.70, top: 0.10, sheet: true, label: '3x4' },
    'sq': { w: 1080, h: 1080, head: 0.48, top: 0.16, label: 'square' }
  };
  function free(c) { if (c) { c.width = 0; c.height = 0; } }
  function newCanvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  function baseMask() {
    if (S.baseMask) return S.baseMask;
    var W = S.srcCanvas.width, H = S.srcCanvas.height, a = processedMatte();
    S.pm = a;
    var mc = newCanvas(S.mw, S.mh), mx = mc.getContext('2d'), id = mx.createImageData(S.mw, S.mh), d = id.data;
    for (var i = 0, j = 0; i < a.length; i++, j += 4) { d[j + 3] = Math.round(a[i] * 255); }
    mx.putImageData(id, 0, 0);
    var b = newCanvas(W, H), bx = b.getContext('2d');
    bx.imageSmoothingEnabled = true; bx.imageSmoothingQuality = 'high';
    bx.drawImage(mc, 0, 0, W, H);
    S.baseMask = b; return b;
  }

  // 붓질 한 번을 마스크에 그림 (i0부터 이어서 그리면 끌고 있는 중에도 빠름)
  function drawStroke(ctx, s, i0) {
    var p = s.pts;
    ctx.save();
    ctx.globalCompositeOperation = s.m === 'erase' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = ctx.fillStyle = '#000';
    ctx.lineWidth = s.r * 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (p.length === 1) { ctx.arc(p[0][0], p[0][1], s.r, 0, Math.PI * 2); ctx.fill(); }
    else {
      var k = Math.max(0, (i0 || 0) - 1);
      ctx.moveTo(p[k][0], p[k][1]);
      for (k = k + 1; k < p.length; k++) ctx.lineTo(p[k][0], p[k][1]);
      ctx.stroke();
    }
    ctx.restore();
  }

  function curMask() {
    if (S.curMask) return S.curMask;
    var b = baseMask(), c = newCanvas(b.width, b.height), x = c.getContext('2d');
    x.drawImage(b, 0, 0);
    S.strokes.forEach(function (s) { drawStroke(x, s, 0); });
    S.curMask = c; return c;
  }

  function invalidate(level) {
    if (level === 'matte') { free(S.baseMask); S.baseMask = null; }
    if (level === 'matte' || level === 'strokes') { free(S.curMask); S.curMask = null; }
    if (level !== 'crop') { free(S.cut); S.cut = null; }
    free(S.result); S.result = null;
  }

  // 사람만 남긴 투명 이미지 (원본 크기)
  function cutout() {
    if (S.cut) return S.cut;
    var src = S.srcCanvas, c = newCanvas(src.width, src.height), x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(curMask(), 0, 0);
    S.cut = c; return c;
  }

  // 크게 줄일 때 사파리 계단현상 방지: 절반씩 줄여 가며 축소
  function stepDown(img, scale) {
    var c = img, s = 1;
    while (scale / s < 0.5 && c.width > 64) {
      var n = newCanvas(Math.max(1, Math.round(c.width / 2)), Math.max(1, Math.round(c.height / 2)));
      var x = n.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, n.width, n.height);
      if (c !== img) free(c);
      c = n; s = s / 2;
    }
    return { c: c, s: s };
  }

  function cropRect() {
    var P = PRESETS[S.preset], h = S.crop.h0 * 100 / S.crop.zoom, w = h * P.w / P.h;
    return { x: S.crop.cx - w / 2, y: S.crop.cy - h / 2, w: w, h: h };
  }

  // 정수리·턱 위치를 AI 결과에서 짐작해 규격에 맞게 자동 배치
  function autoFit() {
    var P = PRESETS[S.preset]; if (!P || !S.matte) return;
    baseMask();
    var a = S.pm, w = S.mw, h = S.mh, T = 0.5, widths = new Int32Array(h), cxs = new Float32Array(h), y, x;
    for (y = 0; y < h; y++) {
      var cnt = 0, sx = 0;
      for (x = 0; x < w; x++) if (a[y * w + x] > T) { cnt++; sx += x; }
      widths[y] = cnt; cxs[y] = cnt ? sx / cnt : w / 2;
    }
    var top = -1;
    for (y = 0; y < h; y++) if (widths[y] >= Math.max(2, w * 0.02)) { top = y; break; }
    var k = S.srcCanvas.width / w, W = S.srcCanvas.width, H = S.srcCanvas.height;
    if (top < 0) { S.crop = { cx: W / 2, cy: H / 2, h0: H, zoom: 100 }; return; }
    var maxW = 0, neck = -1;
    for (y = top; y < h; y++) {
      if (widths[y] > maxW) maxW = widths[y];
      if (y - top > maxW * 0.6 && widths[y] < maxW * 0.8) { neck = y; break; }
    }
    var chin = neck > 0 ? top + (neck - top) * 1.25 : top + maxW * 1.2;
    var end = neck > 0 ? neck : Math.min(h - 1, Math.round(chin)), sc = 0, n = 0;
    for (y = top; y <= end; y++) { sc += cxs[y]; n++; }
    var headLen = (chin - top) * k, h0 = headLen / P.head;
    S.crop = { cx: (n ? sc / n : w / 2) * k, cy: top * k - P.top * h0 + h0 / 2, h0: h0, zoom: 100 };
    $('zoom').value = 100; $('zv').textContent = '100%';
  }

  // 배경색 + 규격 자르기까지 반영한 최종 이미지
  function finalCanvas() {
    if (S.result) return S.result;
    var cut = cutout(), col = bgColor(), P = PRESETS[S.preset], out, x;
    if (!P) {
      out = newCanvas(cut.width, cut.height); x = out.getContext('2d');
      if (col) { x.fillStyle = col; x.fillRect(0, 0, out.width, out.height); }
      x.drawImage(cut, 0, 0);
    } else {
      if (!S.crop) autoFit();
      out = newCanvas(P.w, P.h); x = out.getContext('2d');
      if (col) { x.fillStyle = col; x.fillRect(0, 0, P.w, P.h); }
      var cr = cropRect(), sc = P.w / cr.w, sd = stepDown(cut, sc), s2 = sc / sd.s;
      x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      x.setTransform(s2, 0, 0, s2, -cr.x * sc, -cr.y * sc);
      x.drawImage(sd.c, 0, 0);
      x.setTransform(1, 0, 0, 1, 0, 0);
      if (sd.c !== cut) free(sd.c);
    }
    S.result = out; return out;
  }

  function bgColor() {
    if (S.bg === 'custom') return S.custom;
    for (var i = 0; i < BGS.length; i++) if (BGS[i].id === S.bg) return BGS[i].color;
    return null;
  }

  /* ---------------- 화면 그리기 ---------------- */
  var rafId = 0;
  function scheduleRender() { if (!rafId) rafId = requestAnimationFrame(function () { rafId = 0; render(); }); }

  function render() {
    if (!S.matte) return;
    var v = $('view'), vx = v.getContext('2d'), P = PRESETS[S.preset], src;
    var vbox = $('vbox');
    vbox.classList.toggle('edit', S.editing);
    vbox.classList.toggle('pan', !S.editing && !!P && !S.showOrig);
    if (S.showOrig) {
      src = S.srcCanvas;
      if (v.width !== src.width || v.height !== src.height) { v.width = src.width; v.height = src.height; }
      vx.clearRect(0, 0, v.width, v.height); vx.drawImage(src, 0, 0);
      $('tag').textContent = '원본';
    } else if (S.editing) {
      src = S.srcCanvas;
      if (v.width !== src.width || v.height !== src.height) { v.width = src.width; v.height = src.height; }
      vx.clearRect(0, 0, v.width, v.height);
      vx.globalAlpha = 0.28; vx.drawImage(src, 0, 0); vx.globalAlpha = 1;
      vx.drawImage(cutout(), 0, 0);
      $('tag').textContent = '✏️ 다듬는 중 (흐린 곳 = 지워진 곳)';
    } else {
      src = finalCanvas();
      if (v.width !== src.width || v.height !== src.height) { v.width = src.width; v.height = src.height; }
      vx.clearRect(0, 0, v.width, v.height); vx.drawImage(src, 0, 0);
      if (P && P.guide) {
        var lw = Math.max(1, v.width / 300);
        vx.save(); vx.setLineDash([6 * lw, 5 * lw]); vx.lineWidth = lw; vx.strokeStyle = 'rgba(220,38,38,.85)';
        [P.top, P.top + 3.2 / 4.5, P.top + 3.6 / 4.5].forEach(function (f) { vx.beginPath(); vx.moveTo(0, f * v.height); vx.lineTo(v.width, f * v.height); vx.stroke(); });
        vx.setLineDash([]); vx.strokeStyle = 'rgba(37,99,235,.5)'; vx.beginPath(); vx.moveTo(v.width / 2, 0); vx.lineTo(v.width / 2, v.height); vx.stroke();
        vx.restore();
      }
      $('tag').textContent = P ? '결과 · 끌어서 위치 조정' : '결과';
    }
    var out = S.editing || S.showOrig ? null : src;
    var info = '✅ ' + (S.mode === 'fast' ? '⚡ 빠르게' : '🎯 정밀하게') + ' · AI ' + (S.lastMs / 1000).toFixed(1) + '초';
    if (out) info += ' · 저장 크기 ' + out.width + '×' + out.height + ' ' + (bgColor() ? 'JPG' : 'PNG');
    if (S.strokes.length) info += ' · 손질 ' + S.strokes.length + '번';
    if (S.scaledNote) info += '<br>' + S.scaledNote;
    if (S.savedNote) info += '<br>' + S.savedNote;
    $('info').innerHTML = info;
    $('save').textContent = bgColor() ? '💾 JPG로 저장' : '💾 투명 PNG로 저장';
    $('share').classList.toggle('r-hide', !(navigator.canShare && window.File));
    $('savenote').textContent = isIOS() ? '아이폰: 「공유·사진앱 저장」 → 「이미지 저장」을 누르면 사진 앱에 들어가요.' : '';
    $('tool').style.display = S.editing ? 'block' : 'none';
    $('croptool').style.display = P && !S.editing ? 'block' : 'none';
    $('sheet').style.display = P && P.sheet ? '' : 'none';
    $('editbtn').textContent = S.editing ? '✅ 다듬기 끝' : '✏️ 손으로 다듬기';
  }

  /* ---------------- 저장 ---------------- */
  // 일부 브라우저가 한글 파일명을 'download'로 바꿔버려서 영문 이름으로 저장
  function outName(ext, tag) {
    var n = /^[\w.\- ]+$/.test(S.name) ? S.name.replace(/\s+/g, '_') : 'photo';
    var t = new Date(), p = function (v) { return (v < 10 ? '0' : '') + v; };
    return n + '_nobg' + (tag ? '_' + tag : '') + '_' + p(t.getMonth() + 1) + p(t.getDate()) + '-' + p(t.getHours()) + p(t.getMinutes()) + p(t.getSeconds()) + '.' + ext;
  }
  function toBlob(c, type, q) {
    return new Promise(function (res, rej) { c.toBlob(function (b) { b ? res(b) : rej(new Error('blob')); }, type, q); });
  }
  // 용량 제한이 있으면 JPG 화질(→필요하면 크기)을 낮춰 맞춤
  function encodeLimited(c, limitKB) {
    var max = limitKB * 1024;
    function tryScale(cv, tries) {
      var lo = 0.4, hi = 0.95, best = null, n = 0;
      function step() {
        if (n++ >= 6) return Promise.resolve(best);
        var q = (lo + hi) / 2;
        return toBlob(cv, 'image/jpeg', q).then(function (b) {
          if (b.size <= max) { best = { blob: b, q: q, w: cv.width, h: cv.height }; lo = q; } else hi = q;
          return step();
        });
      }
      return toBlob(cv, 'image/jpeg', 0.95).then(function (b) {
        if (b.size <= max) return { blob: b, q: 0.95, w: cv.width, h: cv.height };
        return step();
      }).then(function (r) {
        if (r || tries >= 6) return r || toBlob(cv, 'image/jpeg', 0.4).then(function (b) { return { blob: b, q: 0.4, w: cv.width, h: cv.height }; });
        var n2 = newCanvas(Math.round(cv.width * 0.8), Math.round(cv.height * 0.8)), x = n2.getContext('2d');
        x.imageSmoothingQuality = 'high'; x.drawImage(cv, 0, 0, n2.width, n2.height);
        return tryScale(n2, tries + 1);
      });
    }
    return tryScale(c, 0);
  }
  function resultBlob() {
    var c = finalCanvas(), jpg = !!bgColor(), lim = +$('limit').value;
    var p = jpg && lim ? encodeLimited(c, lim) : toBlob(c, jpg ? 'image/jpeg' : 'image/png', 0.95).then(function (b) { return { blob: b, w: c.width, h: c.height }; });
    return p.then(function (r) {
      var kb = Math.round(r.blob.size / 1024);
      S.savedNote = '💾 저장 파일: ' + r.w + '×' + r.h + ' · ' + (jpg ? 'JPG' : 'PNG') + ' · ' + kb + 'KB';
      if (!jpg && lim && r.blob.size > lim * 1024) S.savedNote += ' — 투명 PNG는 용량을 줄이기 어려워요. 흰색 배경을 고르면 JPG로 작게 저장돼요.';
      else if (jpg && lim && r.blob.size > lim * 1024) S.savedNote += ' — 최대한 줄였지만 목표보다 커요. 「사진 크기」에서 규격을 골라 보세요.';
      else if (r.w !== c.width) S.savedNote += ' (용량에 맞추려고 크기를 줄였어요)';
      render();
      return { blob: r.blob, ext: jpg ? 'jpg' : 'png' };
    });
  }
  function download(blob, name) {
    var a = document.createElement('a'), url = URL.createObjectURL(blob);
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  function saveFail() { showErr('이미지를 만들지 못했어요.', '사진이 너무 크면 휴대폰이 버거워해요. 다른 탭을 닫고 다시 저장해 보세요.'); }
  function save() {
    clearErr();
    resultBlob().then(function (r) { download(r.blob, outName(r.ext, PRESETS[S.preset] && PRESETS[S.preset].label)); }).catch(saveFail);
  }
  function share() {
    clearErr();
    resultBlob().then(function (r) {
      var file = new File([r.blob], outName(r.ext, PRESETS[S.preset] && PRESETS[S.preset].label), { type: r.blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], title: '배경 지운 사진' });
      download(r.blob, file.name);
    }).catch(function (e) { if (e && e.name !== 'AbortError') saveFail(); });
  }
  // 4×6인치(10×15cm) 인화지 한 장에 여러 장 배치
  function saveSheet() {
    var P = PRESETS[S.preset]; if (!P || !P.sheet) return;
    clearErr();
    var one = finalCanvas(), SW = 1800, SH = 1200, gap = 12, m = 24;
    var cols = Math.floor((SW - 2 * m + gap) / (P.w + gap)), rows = Math.floor((SH - 2 * m + gap) / (P.h + gap));
    var sh = newCanvas(SW, SH), x = sh.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, SW, SH);
    var ox = Math.round((SW - cols * P.w - (cols - 1) * gap) / 2), oy = Math.round((SH - rows * P.h - (rows - 1) * gap) / 2);
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
      var px = ox + c * (P.w + gap), py = oy + r * (P.h + gap);
      x.drawImage(one, px, py);
      x.strokeStyle = '#c0c4cc'; x.lineWidth = 1; x.strokeRect(px - 0.5, py - 0.5, P.w + 1, P.h + 1);
    }
    x.fillStyle = '#94a3b8'; x.font = '18px sans-serif'; x.fillText('4x6 inch (10x15cm) · 300dpi · ' + (cols * rows) + ' photos · barodogu.blogspot.com', m, SH - 6);
    toBlob(sh, 'image/jpeg', 0.95).then(function (b) {
      S.savedNote = '🖨️ 인화용 저장: 1800×1200 (4×6인치, 300dpi) · ' + (cols * rows) + '장 · ' + Math.round(b.size / 1024) + 'KB — 인화할 때 「원본 크기·여백 없음」으로 주문하세요.';
      render(); download(b, outName('jpg', '4x6print'));
      free(sh);
    }).catch(saveFail);
  }

  /* ---------------- 이벤트 ---------------- */
  var fileIn = $('file'), drop = $('drop');
  drop.addEventListener('click', function () { fileIn.click(); });
  drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); } });
  fileIn.addEventListener('change', function () { loadFile(fileIn.files[0]); fileIn.value = ''; });
  ['dragenter', 'dragover'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files[0]; if (f) loadFile(f); });
  $('sample').addEventListener('click', function () { S.name = 'sample'; newImage(); S.scaledNote = ''; run(makeSample()); });

  $('mode').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || S.busy) return;
    S.mode = b.getAttribute('data-m');
    [].forEach.call($('mode').children, function (k) { k.classList.toggle('on', k === b); });
    if (S.srcCanvas && S.matte) run(S.srcCanvas);
  });
  $('edge').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    S.edge = b.getAttribute('data-e');
    [].forEach.call($('edge').children, function (k) { k.classList.toggle('on', k === b); });
    if (S.matte) { invalidate('matte'); render(); }
  });
  $('fill').addEventListener('change', function () { S.fill = this.checked; if (S.matte) { invalidate('matte'); render(); } });

  var sw = $('sw');
  BGS.forEach(function (b) {
    var el = document.createElement('button');
    el.setAttribute('data-bg', b.id);
    el.innerHTML = '<span class="' + (b.color ? '' : 'chk') + '" style="' + (b.color ? 'background:' + b.color : '') + '"></span>' + b.name;
    if (b.id === S.bg) el.className = 'on';
    sw.appendChild(el);
  });
  var cust = document.createElement('label');
  cust.innerHTML = '<button type="button" data-bg="custom"><span style="background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red)"></span>직접 선택</button><input type="color" value="' + S.custom + '" aria-label="배경 색 직접 고르기">';
  sw.appendChild(cust);
  function pickBg(id) {
    S.bg = id; S.savedNote = '';
    if (S.matte) invalidate('crop');
    [].forEach.call(sw.querySelectorAll('button'), function (k) { k.classList.toggle('on', k.getAttribute('data-bg') === id); });
    render();
  }
  sw.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (b && b.getAttribute('data-bg') !== 'custom') pickBg(b.getAttribute('data-bg'));
  });
  var ci = cust.querySelector('input');
  ci.addEventListener('input', function () { S.custom = ci.value; cust.querySelector('span').style.background = ci.value; pickBg('custom'); });

  var cmp = $('cmp');
  function orig(on) { if (S.showOrig === on || !S.matte) return; S.showOrig = on; render(); }
  cmp.addEventListener('pointerdown', function (e) { e.preventDefault(); orig(true); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (t) { cmp.addEventListener(t, function () { orig(false); }); });
  cmp.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* ---- 손으로 다듬기 ---- */
  var view = $('view'), cur = $('cur'), drag = null;
  function toImg(e) {
    var r = view.getBoundingClientRect();
    return { x: (e.clientX - r.left) * view.width / r.width, y: (e.clientY - r.top) * view.height / r.height, k: view.width / r.width, rx: e.clientX - r.left, ry: e.clientY - r.top };
  }
  function showCur(e) {
    if (!S.editing) { cur.style.display = 'none'; return; }
    var vr = $('vbox').getBoundingClientRect();
    cur.style.display = 'block'; cur.style.width = cur.style.height = S.bsize + 'px';
    cur.style.left = (e.clientX - vr.left) + 'px'; cur.style.top = (e.clientY - vr.top) + 'px';
  }
  view.addEventListener('pointerdown', function (e) {
    if (!S.matte || S.showOrig || S.busy) return;
    var p = toImg(e);
    if (S.editing) {
      e.preventDefault();
      var st = { m: S.brush, r: S.bsize / 2 * p.k, pts: [[p.x, p.y]] };
      S.strokes.push(st); curMask(); drawStroke(S.curMask.getContext('2d'), st, 0);
      invalidate('cut'); drag = { type: 'brush', st: st };
      showCur(e); scheduleRender();
    } else if (PRESETS[S.preset]) {
      e.preventDefault();
      drag = { type: 'pan', x: e.clientX, y: e.clientY };
    } else return;
    try { view.setPointerCapture(e.pointerId); } catch (er) {}
  });
  view.addEventListener('pointermove', function (e) {
    showCur(e);
    if (!drag) return;
    e.preventDefault();
    if (drag.type === 'brush') {
      var p = toImg(e), pts = drag.st.pts, last = pts[pts.length - 1];
      if (Math.abs(p.x - last[0]) + Math.abs(p.y - last[1]) < drag.st.r * 0.15) return;
      pts.push([p.x, p.y]);
      drawStroke(S.curMask.getContext('2d'), drag.st, pts.length - 1);
      invalidate('cut'); scheduleRender();
    } else {
      var r = view.getBoundingClientRect(), cr = cropRect(), f = cr.w / r.width;
      S.crop.cx -= (e.clientX - drag.x) * f; S.crop.cy -= (e.clientY - drag.y) * f;
      drag.x = e.clientX; drag.y = e.clientY;
      free(S.result); S.result = null; scheduleRender();
    }
  });
  ['pointerup', 'pointercancel'].forEach(function (t) { view.addEventListener(t, function () { drag = null; S.savedNote = ''; scheduleRender(); }); });
  view.addEventListener('pointerleave', function () { cur.style.display = 'none'; });

  $('editbtn').addEventListener('click', function () { S.editing = !S.editing; cur.style.display = 'none'; render(); });
  $('brush').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    S.brush = b.getAttribute('data-b');
    [].forEach.call($('brush').children, function (k) { k.classList.toggle('on', k === b); });
  });
  $('bsize').addEventListener('input', function () { S.bsize = +this.value; $('bsv').textContent = this.value; });
  $('undo').addEventListener('click', function () { if (S.strokes.length) { S.strokes.pop(); invalidate('strokes'); render(); } });
  $('reset').addEventListener('click', function () { if (S.strokes.length) { S.strokes = []; invalidate('strokes'); render(); } });

  /* ---- 증명사진 규격 ---- */
  $('preset').addEventListener('change', function () {
    S.preset = this.value; S.savedNote = '';
    if (S.matte) { S.crop = null; if (PRESETS[S.preset]) autoFit(); invalidate('crop'); render(); }
  });
  $('zoom').addEventListener('input', function () {
    $('zv').textContent = this.value + '%';
    if (S.crop) { S.crop.zoom = +this.value; free(S.result); S.result = null; scheduleRender(); }
  });
  $('autofit').addEventListener('click', function () { autoFit(); free(S.result); S.result = null; render(); });
  $('sheet').addEventListener('click', saveSheet);
  $('limit').addEventListener('change', function () { S.savedNote = ''; if (S.matte) render(); });

  $('save').addEventListener('click', save);
  $('share').addEventListener('click', share);
  $('again').addEventListener('click', function () { fileIn.click(); });

  // 테스트용 훅
  root._bdRmbg = { state: S, run: run, render: render, makeSample: makeSample, finalCanvas: finalCanvas, cropRect: cropRect };
})();
