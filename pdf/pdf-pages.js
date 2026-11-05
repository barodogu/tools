/*!
 * 착착도구 · PDF 페이지 정리 (삭제 · 추출 · 합치기 · 순서 · 회전) v1.0.0
 * https://barodogu.blogspot.com
 * 사용법: 글에 <div id="bd-pdfpages"></div> 를 두고 이 스크립트를 불러오세요.
 * 파일은 서버로 전송하지 않습니다. 모든 처리는 브라우저 안에서만 이루어집니다.
 * 사용 라이브러리(필요할 때만 cdnjs에서 불러옴): pdf-lib 1.17.1 (MIT), pdf.js 3.11.174 (Apache-2.0), JSZip 3.10.1 (MIT)
 */
(function () {
  'use strict';

  var ROOT_ID = 'bd-pdfpages';
  var VER = '1.0.0';
  var CDN = {
    pdflib: 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
    pdfjs: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    pdfjsWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    jszip: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
  };
  var COLORS = ['#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed', '#0891b2', '#dc2626', '#4b5563'];
  var UA = navigator.userAgent || '';
  var IS_IOS = /iP(hone|ad|od)/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
  var LIMIT_FILE = IS_IOS ? 80 : 150;   // MB, 파일 1개
  var LIMIT_TOTAL = IS_IOS ? 150 : 400; // MB, 전체
  var LIMIT_PAGES = 2000;
  var A4 = [595.28, 841.89];

  /* ---------------- 스타일 ---------------- */
  var CSS = [
    '#R{--c-bg:#fff;--c-fg:#1f2937;--c-sub:#6b7280;--c-line:#e5e7eb;--c-soft:#f3f6fb;--c-pri:#2563eb;--c-pri-d:#1d4ed8;--c-ok:#059669;--c-err:#dc2626;--c-warn:#b45309;',
    'font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;color:var(--c-fg);line-height:1.5;margin:16px 0;-webkit-text-size-adjust:100%}',
    '#R *{box-sizing:border-box}',
    '#R .pp{background:var(--c-bg);border:1px solid var(--c-line);border-radius:16px;padding:16px;max-width:100%;overflow:hidden}',
    '#R .pp-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;margin-bottom:6px}',
    '#R .pp-head b{font-size:19px}',
    '#R .pp-head span{font-size:13px;color:var(--c-sub)}',
    '#R .pp-lock{font-size:13px;color:var(--c-ok);background:#ecfdf5;border-radius:10px;padding:8px 12px;margin:8px 0 12px}',
    '#R button{font:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}',
    '#R .pp-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:8px 14px;border-radius:12px;border:1px solid var(--c-line);background:#fff;color:var(--c-fg);font-size:15px;font-weight:600;text-decoration:none;line-height:1.2}',
    '#R .pp-btn:active{transform:translateY(1px)}',
    '#R .pp-btn[disabled]{opacity:.4;cursor:not-allowed}',
    '#R .pp-btn.pri{background:var(--c-pri);border-color:var(--c-pri);color:#fff}',
    '#R .pp-btn.pri:hover{background:var(--c-pri-d)}',
    '#R .pp-btn.ghost{background:var(--c-soft);border-color:transparent}',
    '#R .pp-btn.danger{color:var(--c-err)}',
    '#R .pp-btn.big{width:100%;min-height:52px;font-size:16px}',
    '#R .pp-btn.sm{min-height:40px;padding:6px 10px;font-size:14px}',
    '#R .pp-drop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:150px;border:2px dashed #bcd0f5;border-radius:14px;background:var(--c-soft);text-align:center;cursor:pointer;padding:16px;transition:background .15s}',
    '#R .pp-drop.over{background:#e0ebff;border-color:var(--c-pri)}',
    '#R .pp-drop-ic{font-size:34px;line-height:1;color:var(--c-pri)}',
    '#R .pp-drop-t{font-size:17px;font-weight:700}',
    '#R .pp-drop-s{font-size:13px;color:var(--c-sub)}',
    '#R .pp-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}',
    '#R .pp-row>.pp-btn{flex:1 1 auto}',
    '#R .pp-msg{margin-top:10px;font-size:14px;border-radius:10px;padding:0;white-space:pre-line}',
    '#R .pp-msg.on{padding:10px 12px}',
    '#R .pp-msg.info{background:#eff6ff;color:#1e40af}',
    '#R .pp-msg.err{background:#fef2f2;color:#991b1b}',
    '#R .pp-msg.warn{background:#fffbeb;color:#92400e}',
    '#R .pp-msg.ok{background:#ecfdf5;color:#065f46}',
    '#R .pp-files{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 8px}',
    '#R .pp-chip{display:inline-flex;align-items:center;gap:6px;max-width:100%;border:1px solid var(--c-line);border-radius:999px;padding:3px 4px 3px 4px;font-size:13px;background:#fff}',
    '#R .pp-chip i{font-style:normal;color:#fff;border-radius:999px;min-width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;padding:0 6px}',
    '#R .pp-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:170px}',
    '#R .pp-chip em{font-style:normal;color:var(--c-sub)}',
    '#R .pp-chip button{border:0;background:#f3f4f6;border-radius:999px;width:28px;height:28px;color:var(--c-sub);font-size:13px}',
    '#R .pp-chip.add{border-style:dashed;color:var(--c-pri);font-weight:600;padding:3px 12px;min-height:32px;cursor:pointer;background:#fff}',
    '#R .pp-bar{position:sticky;top:0;z-index:5;background:rgba(255,255,255,.96);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);border-bottom:1px solid var(--c-line);margin:0 -16px;padding:8px 16px}',
    '#R .pp-count{font-size:14px;color:var(--c-sub);margin-bottom:6px}',
    '#R .pp-count b{color:var(--c-fg)}',
    '#R .pp-tools{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}',
    '#R .pp-tools .pp-btn{min-height:44px;padding:4px 2px;font-size:13px;flex-direction:column;gap:0}',
    '#R .pp-tools .pp-btn s{text-decoration:none;font-size:17px;line-height:1.1}',
    '#R .pp-range{margin:10px 0 0;border:1px solid var(--c-line);border-radius:12px;padding:0 12px}',
    '#R .pp-range summary{min-height:44px;display:flex;align-items:center;font-size:14px;font-weight:600;cursor:pointer;list-style:none}',
    '#R .pp-range summary::-webkit-details-marker{display:none}',
    '#R .pp-range[open]{padding-bottom:12px}',
    '#R .pp-range input{flex:1 1 140px;min-width:0;min-height:44px;font-size:16px;border:1px solid var(--c-line);border-radius:10px;padding:6px 10px}',
    '#R .pp-tip{font-size:13px;color:var(--c-sub);margin:10px 0 8px}',
    '#R .pp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:10px;-webkit-user-select:none;user-select:none}',
    '@media(min-width:640px){#R .pp-grid{grid-template-columns:repeat(auto-fill,minmax(140px,1fr))}}',
    '#R .pp-card{position:relative;border:2px solid var(--c-line);border-radius:12px;background:#fff;overflow:hidden;transition:border-color .12s,box-shadow .12s}',
    '#R .pp-card.sel{border-color:var(--c-pri);box-shadow:0 0 0 3px rgba(37,99,235,.18)}',
    '#R .pp-card.drag{opacity:.35}',
    '#R .pp-card.drop-b{box-shadow:-5px 0 0 0 var(--c-pri)}',
    '#R .pp-card.drop-a{box-shadow:5px 0 0 0 var(--c-pri)}',
    '#R .pp-thumb{display:flex;align-items:center;justify-content:center;width:100%;aspect-ratio:3/4;border:0;padding:6px;background:#f8fafc;position:relative;overflow:hidden}',
    '@supports not (aspect-ratio:1){#R .pp-thumb{height:150px}}',
    '#R .pp-thumb img{max-width:100%;max-height:100%;box-shadow:0 1px 3px rgba(0,0,0,.25);background:#fff;transition:transform .2s;pointer-events:none}',
    '#R .pp-ph{font-size:22px;font-weight:700;color:#94a3b8;pointer-events:none;transition:transform .2s}',
    '#R .pp-no{position:absolute;left:6px;top:6px;background:rgba(17,24,39,.78);color:#fff;font-size:12px;font-weight:700;border-radius:8px;padding:1px 7px;pointer-events:none}',
    '#R .pp-chk{position:absolute;right:6px;top:6px;width:26px;height:26px;border-radius:50%;border:2px solid #cbd5e1;background:rgba(255,255,255,.9);display:flex;align-items:center;justify-content:center;color:#fff;font-size:15px;font-weight:700;pointer-events:none}',
    '#R .pp-card.sel .pp-chk{background:var(--c-pri);border-color:var(--c-pri)}',
    '#R .pp-zoom{position:absolute;right:6px;bottom:50px;width:34px;height:34px;border-radius:50%;border:1px solid var(--c-line);background:rgba(255,255,255,.92);font-size:15px}',
    '#R .pp-cbar{display:flex;align-items:stretch;border-top:1px solid var(--c-line);height:42px}',
    '#R .pp-handle{flex:1;display:flex;align-items:center;gap:4px;padding-left:6px;font-size:13px;color:var(--c-sub);cursor:grab;touch-action:none;min-width:0;white-space:nowrap;overflow:hidden}',
    '#R .pp-handle i{font-style:normal;color:#fff;border-radius:6px;padding:0 5px;font-size:11px;font-weight:700}',
    '#R .pp-handle b{font-size:16px;color:#94a3b8;font-weight:400}',
    '#R .pp-cbar button{width:40px;border:0;border-left:1px solid var(--c-line);background:#fff;font-size:16px;color:var(--c-fg)}',
    '#R .pp-cbar button.x{color:var(--c-err)}',
    '#R .pp-ghost{position:fixed;z-index:2147483000;pointer-events:none;width:90px;opacity:.9;transform:translate(-50%,-60%) rotate(-3deg);border:2px solid var(--c-pri);border-radius:10px;background:#fff;box-shadow:0 8px 24px rgba(0,0,0,.25);overflow:hidden}',
    '#R .pp-ghost .pp-thumb{padding:4px}',
    '#R .pp-out{margin-top:16px;display:grid;gap:8px;border-top:1px solid var(--c-line);padding-top:14px}',
    '#R .pp-out label{font-size:14px;font-weight:600;display:grid;gap:4px}',
    '#R .pp-out input{min-height:46px;font-size:16px;border:1px solid var(--c-line);border-radius:10px;padding:6px 12px;width:100%}',
    '#R .pp-result{margin-top:12px;border:2px solid var(--c-ok);border-radius:14px;padding:14px;background:#f0fdf4}',
    '#R .pp-result h4{margin:0 0 4px;font-size:16px;color:#065f46}',
    '#R .pp-result p{margin:0 0 10px;font-size:14px;color:#065f46;word-break:break-all}',
    '#R .pp-result .pp-row{margin-top:0}',
    '#R .pp-foot{margin-top:12px;font-size:11px;color:#9ca3af;text-align:right}',
    '#R .pp-modal{position:fixed;inset:0;z-index:2147483001;background:rgba(15,23,42,.88);display:flex;flex-direction:column}',
    '#R .pp-modal[hidden]{display:none}',
    '#R .pp-mtop{display:flex;align-items:center;gap:8px;padding:10px 12px;color:#fff;font-size:15px}',
    '#R .pp-mtop span{flex:1}',
    '#R .pp-mtop .pp-btn{min-height:42px}',
    '#R .pp-mbody{flex:1;overflow:auto;display:flex;align-items:center;justify-content:center;padding:8px;-webkit-overflow-scrolling:touch}',
    '#R .pp-mbody img{max-width:100%;max-height:100%;background:#fff;transition:transform .2s}',
    '#R .pp-mbody .ld{color:#cbd5e1}',
    '#R .pp-mbot{display:flex;gap:8px;padding:10px 12px calc(10px + env(safe-area-inset-bottom))}',
    '#R .pp-mbot .pp-btn{flex:1}',
    '#R .pp-pw{display:grid;gap:8px;background:#fff;border-radius:14px;padding:16px;max-width:360px;width:calc(100% - 32px);margin:auto}',
    '#R .pp-pw p{margin:0;font-size:14px}',
    '#R .pp-pw input{min-height:46px;font-size:16px;border:1px solid var(--c-line);border-radius:10px;padding:6px 12px}',
    '#R .pp-busy{pointer-events:none}',
    '#R .pp-busy .pp-grid,#R .pp-busy .pp-bar,#R .pp-busy .pp-out{opacity:.55}',
    '#R [hidden]{display:none!important}'
  ].join('\n').replace(/#R/g, '#' + ROOT_ID);

  /* ---------------- 유틸 ---------------- */
  function $(sel, el) { return (el || root).querySelector(sel); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtSize(n) { return n >= 1048576 ? (n / 1048576).toFixed(n >= 10485760 ? 0 : 1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB'; }
  function letter(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function baseName(n) { return String(n || '문서').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60) || '문서'; }
  function cleanName(n, ext) { n = String(n || '').trim().replace(/[\\/:*?"<>|]+/g, '_'); if (!n) n = '문서'; n = n.replace(new RegExp('\\.' + ext + '$', 'i'), ''); return n.slice(0, 80) + '.' + ext; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function raf() { return new Promise(function (r) { requestAnimationFrame(function () { r(); }); }); }

  var scriptCache = {};
  function loadScript(key) {
    if (scriptCache[key]) return scriptCache[key];
    var p = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      var t = setTimeout(function () { reject(new Error('timeout')); }, 30000);
      s.src = CDN[key];
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.referrerPolicy = 'no-referrer';
      s.onload = function () { clearTimeout(t); resolve(); };
      s.onerror = function () { clearTimeout(t); reject(new Error('load')); };
      document.head.appendChild(s);
    });
    scriptCache[key] = p.catch(function (e) { delete scriptCache[key]; throw e; });
    return scriptCache[key];
  }
  var LIBERR = 'PDF 처리 도구를 불러오지 못했어요.\n· 인터넷 연결을 확인한 뒤 새로고침해 주세요.\n· 회사·학교 와이파이나 광고 차단 앱이 막고 있을 수 있어요. 휴대폰 데이터로 바꾸거나 차단 앱을 잠시 끄고 다시 시도해 주세요.';
  function needPdfLib() {
    if (window.PDFLib && window.PDFLib.PDFDocument) return Promise.resolve(window.PDFLib);
    return loadScript('pdflib').then(function () {
      if (!window.PDFLib) throw new Error('nolib');
      return window.PDFLib;
    }).catch(function () { var e = new Error(LIBERR); e.user = true; throw e; });
  }
  var pdfjsP = null;
  function needPdfjs() {
    if (pdfjsP) return pdfjsP;
    pdfjsP = loadScript('pdfjs').then(function () {
      var lib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
      if (!lib) throw new Error('nopdfjs');
      lib.GlobalWorkerOptions.workerSrc = CDN.pdfjsWorker;
      return lib;
    }).catch(function () { pdfjsP = null; return null; });
    return pdfjsP;
  }
  function needZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    return loadScript('jszip').then(function () { return window.JSZip; }).catch(function () {
      var e = new Error('ZIP 만들기 도구를 불러오지 못했어요. 인터넷 연결을 확인하거나, 대신 「지금 순서대로 PDF 저장」으로 한 파일로 받아 주세요.'); e.user = true; throw e;
    });
  }

  /* ---------------- 상태 ---------------- */
  var root, ui = {};
  var S = { sources: {}, srcOrder: [], pages: [], hist: [], uid: 1, sid: 0, busy: false, thumbs: {}, result: null, noPreview: false };

  function totalBytes() { var t = 0; for (var k in S.sources) t += S.sources[k].size || 0; return t; }
  function selected() { return S.pages.filter(function (p) { return p.sel; }); }
  function pushHist() { S.hist.push(S.pages.map(function (p) { return { uid: p.uid, sid: p.sid, idx: p.idx, rot: p.rot, sel: p.sel }; })); if (S.hist.length > 40) S.hist.shift(); }

  /* ---------------- 메시지 ---------------- */
  var msgTimer;
  function msg(text, type, keep) {
    clearTimeout(msgTimer);
    ui.msg.className = 'pp-msg' + (text ? ' on ' + (type || 'info') : '');
    ui.msg.textContent = text || '';
    if (text && !keep && type !== 'err') msgTimer = setTimeout(function () { msg(''); }, 6000);
  }
  function setBusy(b, text) {
    S.busy = b;
    ui.wrap.classList.toggle('pp-busy', b);
    ui.wrap.setAttribute('aria-busy', b ? 'true' : 'false');
    if (b && text) msg(text, 'info', true);
  }

  /* ---------------- 화면 만들기 ---------------- */
  function build() {
    var st = document.createElement('style');
    st.id = ROOT_ID + '-style';
    st.textContent = CSS;
    if (!document.getElementById(st.id)) document.head.appendChild(st);

    root.innerHTML =
      '<div class="pp">' +
      '<div class="pp-head"><b>📄 PDF 페이지 정리</b><span>필요 없는 쪽 삭제 · 필요한 쪽만 추출 · 여러 PDF 합치기 · 순서 · 회전</span></div>' +
      '<div class="pp-lock">🔒 파일은 서버로 보내지 않아요. 지금 이 브라우저 안에서만 처리되고, 창을 닫으면 사라져요.</div>' +
      '<div class="pp-start">' +
      '<label class="pp-drop" tabindex="0"><input type="file" class="pp-file" multiple accept="application/pdf,.pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,.jpg,.jpeg,.png,.webp" hidden>' +
      '<div class="pp-drop-ic">＋</div><div class="pp-drop-t">PDF 고르기</div><div class="pp-drop-s">여러 개 한 번에 골라도 돼요 · 사진(JPG·PNG)도 쪽으로 넣을 수 있어요<br>PC는 파일을 여기로 끌어다 놓아도 돼요</div></label>' +
      '<div class="pp-row"><button type="button" class="pp-btn ghost" data-act="sample">🧪 예시 파일로 먼저 체험하기</button></div>' +
      '</div>' +
      '<div class="pp-msg" role="status" aria-live="polite"></div>' +
      '<div class="pp-work" hidden>' +
      '<div class="pp-files"></div>' +
      '<div class="pp-bar">' +
      '<div class="pp-count"></div>' +
      '<div class="pp-tools">' +
      '<button type="button" class="pp-btn" data-act="all"><s>☑</s>전체 선택</button>' +
      '<button type="button" class="pp-btn danger" data-act="del" data-need="sel"><s>🗑</s>선택 삭제</button>' +
      '<button type="button" class="pp-btn" data-act="rot" data-need="sel"><s>↻</s>선택 회전</button>' +
      '<button type="button" class="pp-btn" data-act="undo" data-need="hist"><s>↶</s>되돌리기</button>' +
      '<button type="button" class="pp-btn" data-act="none" data-need="sel"><s>☐</s>선택 해제</button>' +
      '<button type="button" class="pp-btn" data-act="left" data-need="sel"><s>◀</s>앞으로</button>' +
      '<button type="button" class="pp-btn" data-act="right" data-need="sel"><s>▶</s>뒤로</button>' +
      '<button type="button" class="pp-btn" data-act="keep" data-need="sel"><s>✂</s>선택만 남기기</button>' +
      '</div></div>' +
      '<details class="pp-range"><summary>🔢 쪽 번호로 한 번에 선택하기 (예: 1-3, 5)</summary>' +
      '<div class="pp-row" style="margin-top:0"><input type="text" class="pp-rin" inputmode="text" placeholder="예: 1-3, 5, 8-" aria-label="선택할 쪽 번호">' +
      '<button type="button" class="pp-btn pri sm" data-act="range">선택</button></div>' +
      '<div class="pp-row"><button type="button" class="pp-btn sm" data-act="odd">홀수 쪽</button><button type="button" class="pp-btn sm" data-act="even">짝수 쪽</button><button type="button" class="pp-btn sm" data-act="inv">선택 반전</button></div>' +
      '</details>' +
      '<p class="pp-tip">👆 쪽을 누르면 선택돼요. 아래 <b>⠿</b> 부분을 꾹 눌러 끌면 순서가 바뀌어요. 🔍로 크게 볼 수 있어요.</p>' +
      '<div class="pp-grid" role="list"></div>' +
      '<div class="pp-out">' +
      '<label>저장할 파일 이름<input type="text" class="pp-name" maxlength="80" autocomplete="off"></label>' +
      '<button type="button" class="pp-btn pri big" data-act="save-all"></button>' +
      '<button type="button" class="pp-btn big" data-act="save-sel" data-need="sel"></button>' +
      '<button type="button" class="pp-btn big" data-act="save-split"></button>' +
      '<div class="pp-result" hidden></div>' +
      '<button type="button" class="pp-btn ghost" data-act="reset">🔄 처음부터 다시</button>' +
      '</div>' +
      '</div>' +
      '<div class="pp-foot">착착도구 · PDF 페이지 정리 v' + VER + ' · 브라우저 안에서만 처리</div>' +
      '</div>' +
      '<div class="pp-modal" hidden role="dialog" aria-modal="true"></div>';

    ui.wrap = $('.pp');
    ui.file = $('.pp-file');
    ui.drop = $('.pp-drop');
    ui.msg = $('.pp-msg');
    ui.work = $('.pp-work');
    ui.files = $('.pp-files');
    ui.count = $('.pp-count');
    ui.grid = $('.pp-grid');
    ui.name = $('.pp-name');
    ui.result = $('.pp-result');
    ui.modal = $('.pp-modal');
    ui.rin = $('.pp-rin');

    ui.file.addEventListener('change', function () {
      var fl = Array.prototype.slice.call(ui.file.files || []);
      ui.file.value = '';
      if (fl.length) addFiles(fl);
    });
    ui.drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ui.file.click(); } });
    // 끌어다 놓기 (도구 전체)
    ['dragenter', 'dragover'].forEach(function (t) {
      ui.wrap.addEventListener(t, function (e) {
        if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') < 0) return;
        e.preventDefault(); ui.drop.classList.add('over');
      });
    });
    ['dragleave', 'drop'].forEach(function (t) { ui.wrap.addEventListener(t, function () { ui.drop.classList.remove('over'); }); });
    ui.wrap.addEventListener('drop', function (e) {
      if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
      e.preventDefault();
      addFiles(Array.prototype.slice.call(e.dataTransfer.files));
    });
    root.addEventListener('click', onClick);
    ui.rin.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); doAct('range'); } });
    ui.grid.addEventListener('pointerdown', onDragStart);
    document.addEventListener('keydown', function (e) { if (!ui.modal.hidden && e.key === 'Escape') closeModal(); });
  }

  /* ---------------- 파일 추가 ---------------- */
  function isPdfBytes(u8) { return u8.length > 4 && u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46; }
  function findPdfHeader(u8) { var n = Math.min(u8.length - 4, 1024); for (var i = 0; i < n; i++) { if (u8[i] === 0x25 && u8[i + 1] === 0x50 && u8[i + 2] === 0x44 && u8[i + 3] === 0x46) return i; } return -1; }
  function readFile(f) {
    if (f.arrayBuffer) return f.arrayBuffer();
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; r.readAsArrayBuffer(f); });
  }

  async function addFiles(list) {
    if (S.busy) return;
    var errs = [], warns = [], added = 0;
    setBusy(true, '파일을 읽는 중이에요…');
    try {
      var lib = await needPdfLib();
      for (var i = 0; i < list.length; i++) {
        var f = list[i], name = f.name || ('파일' + (i + 1));
        setBusy(true, '파일을 읽는 중이에요… (' + (i + 1) + '/' + list.length + ') ' + name);
        if (f.size > LIMIT_FILE * 1048576) { errs.push('「' + name + '」 파일이 너무 커요(' + fmtSize(f.size) + '). 이 기기에서는 한 파일 ' + LIMIT_FILE + 'MB까지 처리할 수 있어요. PC에서 하거나 파일을 나눠서 넣어 주세요.'); continue; }
        if (totalBytes() + f.size > LIMIT_TOTAL * 1048576) { errs.push('「' + name + '」을(를) 넣으면 전체 용량이 ' + LIMIT_TOTAL + 'MB를 넘어요. 먼저 한 번 저장한 뒤, 저장한 파일과 나머지를 다시 넣어 주세요.'); continue; }
        if (S.pages.length >= LIMIT_PAGES) { errs.push('한 번에 ' + LIMIT_PAGES + '쪽까지 다룰 수 있어요. 일부를 먼저 저장해 주세요.'); break; }
        var r;
        try {
          var isImg = /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(name);
          var buf = new Uint8Array(await readFile(f));
          if (!isImg || isPdfBytes(buf)) r = await addPdf(lib, buf, name);
          else r = await addImage(f, buf, name);
          if (r && r.warn) warns.push(r.warn);
          if (r) added++;
        } catch (e) {
          errs.push(e && e.user ? e.message : '「' + name + '」을(를) 열지 못했어요. 파일이 손상됐거나 지원하지 않는 형식이에요. PDF 뷰어에서 열리는지 확인하고, 열린다면 「인쇄 → PDF로 저장」으로 새로 만든 파일을 넣어 주세요.');
          if (window.console) console.warn('[착착도구]', e);
        }
      }
    } catch (e) {
      errs.push(e && e.user ? e.message : LIBERR);
    }
    setBusy(false);
    render();
    var out = [];
    if (added) out.push('✅ ' + added + '개 파일을 불러왔어요. 지금 총 ' + S.pages.length + '쪽이에요.');
    if (warns.length) out = out.concat(warns);
    if (errs.length) out = out.concat(errs.map(function (x) { return '⚠️ ' + x; }));
    msg(out.join('\n'), errs.length ? (added ? 'warn' : 'err') : (warns.length ? 'warn' : 'ok'), errs.length > 0 || warns.length > 0);
  }

  function newSource(o) {
    var id = 's' + (++S.sid);
    var n = S.srcOrder.length;
    o.id = id; o.letter = letter(n); o.color = COLORS[n % COLORS.length];
    S.sources[id] = o; S.srcOrder.push(id);
    var cnt = o.pageCount;
    if (S.pages.length + cnt > LIMIT_PAGES) throw Object.assign(new Error('쪽 수가 너무 많아요. 한 번에 ' + LIMIT_PAGES + '쪽까지 다룰 수 있어요.'), { user: true });
    pushHist();
    for (var i = 0; i < cnt; i++) S.pages.push({ uid: S.uid++, sid: id, idx: i, rot: 0, sel: false });
    if (!ui.name.value) ui.name.value = baseName(o.name) + '_정리';
    return o;
  }

  async function addPdf(lib, buf, name) {
    var off = findPdfHeader(buf);
    if (off < 0) throw Object.assign(new Error('「' + name + '」은(는) PDF 파일이 아니에요. 이름만 .pdf이거나 다운로드가 덜 된 파일일 수 있어요. 다시 내려받아 넣어 주세요.'), { user: true });
    if (off > 0) buf = buf.subarray(off);
    var doc;
    try {
      doc = await lib.PDFDocument.load(buf, { updateMetadata: false });
    } catch (e) {
      var m = String(e && e.message || e);
      if (/encrypt/i.test(m)) return addEncrypted(buf, name);
      throw e;
    }
    var cnt = doc.getPageCount();
    if (!cnt) throw Object.assign(new Error('「' + name + '」에 쪽이 없어요.'), { user: true });
    newSource({ kind: 'pdf', name: name, bytes: buf, size: buf.length, lib: doc, pageCount: cnt });
    return {};
  }

  // 보안(암호화)된 PDF: pdf.js로 열 수 있으면 이미지로 바꿔 처리
  async function addEncrypted(buf, name) {
    var pj = await needPdfjs();
    if (!pj) throw Object.assign(new Error('「' + name + '」은(는) 보안이 걸린 PDF예요. 이런 파일을 처리하려면 미리보기 도구가 필요한데 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.'), { user: true });
    var pw = '', doc = null, tries = 0;
    while (!doc) {
      try {
        doc = await pj.getDocument({ data: buf.slice(), password: pw || undefined, isEvalSupported: false }).promise;
      } catch (e) {
        if (e && e.name === 'PasswordException') {
          tries++;
          pw = await askPassword(name, tries > 1);
          if (pw === null) throw Object.assign(new Error('「' + name + '」은(는) 열 때 비밀번호가 필요한 PDF라서 건너뛰었어요. 비밀번호를 알면 다시 넣고 입력해 주세요.'), { user: true });
        } else throw e;
      }
    }
    var src = newSource({ kind: 'raster', name: name, bytes: buf, size: buf.length, pageCount: doc.numPages, password: pw || '' });
    src.jsDoc = Promise.resolve(doc);
    return { warn: '🔐 「' + name + '」은(는) 보안이 걸린 PDF라서, 저장할 때 각 쪽을 고화질 이미지로 바꿔 넣어요. 내용은 그대로 보이지만 글자 선택·검색은 안 되고 용량이 커질 수 있어요.' };
  }

  function decodeImage(blob) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(blob), im = new Image();
      im.onload = function () { res({ im: im, url: url }); };
      im.onerror = function () { URL.revokeObjectURL(url); rej(new Error('decode')); };
      im.src = url;
    });
  }
  function canvasToBlob(c, type, q) {
    return new Promise(function (res, rej) {
      if (c.toBlob) c.toBlob(function (b) { b ? res(b) : rej(new Error('toBlob')); }, type, q);
      else { try { var d = atob(c.toDataURL(type, q).split(',')[1]), a = new Uint8Array(d.length); for (var i = 0; i < d.length; i++) a[i] = d.charCodeAt(i); res(new Blob([a], { type: type })); } catch (e) { rej(e); } }
    });
  }
  async function addImage(f, buf, name) {
    var isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
    var d;
    try { d = await decodeImage(new Blob([buf], { type: f.type || '' })); }
    catch (e) {
      if (/\.(heic|heif)$/i.test(name) || /hei[cf]/i.test(f.type)) throw Object.assign(new Error('「' + name + '」은(는) 아이폰 HEIC 사진이라 이 브라우저에서 열 수 없어요. 아이폰 사파리에서 열거나, 설정 → 카메라 → 포맷 → 「높은 호환성」으로 바꾼 뒤 찍은 사진(JPG)을 넣어 주세요. 사진을 스크린샷으로 찍어 넣어도 돼요.'), { user: true });
      throw Object.assign(new Error('「' + name + '」 사진을 열지 못했어요. JPG나 PNG 사진으로 다시 시도해 주세요.'), { user: true });
    }
    var w = d.im.naturalWidth, h = d.im.naturalHeight, out, type;
    if (isPng && w * h <= 16e6) { out = buf; type = 'png'; }
    else {
      // JPG 등은 사진 방향(EXIF)을 반영하고 아이폰 캔버스 한계 안에서 다시 저장
      var maxPx = IS_IOS ? 12e6 : 24e6, k = Math.min(1, Math.sqrt(maxPx / (w * h)), 4000 / Math.max(w, h));
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
      var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(d.im, 0, 0, c.width, c.height);
      var b = await canvasToBlob(c, 'image/jpeg', 0.9);
      out = new Uint8Array(await readFile(b)); type = 'jpg'; w = c.width; h = c.height;
      c.width = c.height = 1;
    }
    URL.revokeObjectURL(d.url);
    var src = newSource({ kind: 'image', name: name, bytes: out, size: out.length, imgType: type, w: w, h: h, pageCount: 1 });
    S.thumbs[src.id + ':0'] = URL.createObjectURL(new Blob([out], { type: type === 'png' ? 'image/png' : 'image/jpeg' }));
    return {};
  }

  function askPassword(name, again) {
    return new Promise(function (resolve) {
      ui.modal.innerHTML = '<form class="pp-pw"><p>🔐 <b>' + esc(name) + '</b><br>' + (again ? '<span style="color:#dc2626">비밀번호가 맞지 않아요. 다시 입력해 주세요.</span>' : '열 때 비밀번호가 필요한 PDF예요. 비밀번호를 입력해 주세요.') + '</p>' +
        '<input type="password" autocomplete="off" aria-label="PDF 비밀번호"><p style="font-size:12px;color:#6b7280">비밀번호는 이 파일을 여는 데만 쓰이고 어디에도 저장·전송되지 않아요.</p>' +
        '<div class="pp-row" style="margin:0"><button type="button" class="pp-btn" data-pw="no">건너뛰기</button><button type="submit" class="pp-btn pri">열기</button></div></form>';
      ui.modal.hidden = false;
      var form = ui.modal.querySelector('form'), inp = form.querySelector('input');
      setTimeout(function () { inp.focus(); }, 50);
      function done(v) { ui.modal.hidden = true; ui.modal.innerHTML = ''; resolve(v); }
      form.addEventListener('submit', function (e) { e.preventDefault(); done(inp.value); });
      form.querySelector('[data-pw=no]').addEventListener('click', function () { done(null); });
    });
  }

  /* ---------------- 미리보기(썸네일) ---------------- */
  function getJsDoc(src) {
    if (src.jsDoc) return src.jsDoc;
    src.jsDoc = needPdfjs().then(function (pj) {
      if (!pj) return null;
      return pj.getDocument({ data: src.bytes.slice(), password: src.password || undefined, isEvalSupported: false }).promise;
    }).catch(function (e) { if (window.console) console.warn('[착착도구] preview', e); return null; });
    return src.jsDoc;
  }
  async function renderPageImage(src, idx, cssW, maxPx, quality) {
    if (src.kind === 'image') return null;
    var doc = await getJsDoc(src);
    if (!doc) return null;
    var page = await doc.getPage(idx + 1);
    var vp1 = page.getViewport({ scale: 1 });
    var scale = cssW / vp1.width;
    if (vp1.width * vp1.height * scale * scale > maxPx) scale = Math.sqrt(maxPx / (vp1.width * vp1.height));
    var vp = page.getViewport({ scale: scale });
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.floor(vp.width)); c.height = Math.max(1, Math.floor(vp.height));
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    var b = await canvasToBlob(c, 'image/jpeg', quality || 0.8);
    var w = c.width, h = c.height;
    c.width = c.height = 1; // 아이폰 메모리 반환
    page.cleanup();
    return { blob: b, w: w, h: h, ptW: vp1.width, ptH: vp1.height };
  }

  var tq = [], tActive = 0, io = null;
  function queueThumb(key) {
    if (S.thumbs[key]) return;
    S.thumbs[key] = 'pending';
    tq.push(key); pumpThumbs();
  }
  function pumpThumbs() {
    while (tActive < 2 && tq.length) {
      var key = tq.shift(); tActive++;
      (async function (key) {
        var parts = key.split(':'), src = S.sources[parts[0]];
        try {
          var dpr = Math.min(window.devicePixelRatio || 1, 2);
          var r = src ? await renderPageImage(src, +parts[1], 150 * dpr, 400000, 0.75) : null;
          if (r) S.thumbs[key] = URL.createObjectURL(r.blob);
          else { S.thumbs[key] = 'fail'; if (src && !S.noPreview && !window.pdfjsLib) { S.noPreview = true; msg('미리보기 그림을 불러오지 못해서 쪽 번호로 보여 드려요. 삭제·추출·저장은 그대로 할 수 있어요.', 'warn'); } }
        } catch (e) { S.thumbs[key] = 'fail'; }
        tActive--;
        paintThumb(key);
        pumpThumbs();
      })(key);
    }
  }
  function paintThumb(key) {
    var url = S.thumbs[key];
    var cards = ui.grid.querySelectorAll('[data-key="' + key + '"]');
    for (var i = 0; i < cards.length; i++) {
      var box = cards[i].querySelector('.pp-thumb'), old = box.querySelector('img,.pp-ph');
      if (url && url !== 'pending' && url !== 'fail') {
        if (old && old.tagName === 'IMG') continue;
        var im = document.createElement('img'); im.alt = ''; im.src = url; im.style.transform = old ? old.style.transform : '';
        if (old) box.replaceChild(im, old); else box.insertBefore(im, box.firstChild);
      }
    }
  }
  function observe() {
    if (!('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(ui.grid.querySelectorAll('.pp-card'), function (c) { queueThumb(c.getAttribute('data-key')); });
      return;
    }
    if (!io) io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) { if (en.isIntersecting) { io.unobserve(en.target); queueThumb(en.target.getAttribute('data-key')); } });
    }, { rootMargin: '400px 0px' });
    io.disconnect();
    Array.prototype.forEach.call(ui.grid.querySelectorAll('.pp-card'), function (c) {
      var k = c.getAttribute('data-key');
      if (!S.thumbs[k]) io.observe(c);
    });
  }

  /* ---------------- 그리기 ---------------- */
  function cardHTML(p, i) {
    var src = S.sources[p.sid], key = p.sid + ':' + p.idx, t = S.thumbs[key];
    var rot = 'transform:rotate(' + p.rot + 'deg)' + ((p.rot % 180) ? ' scale(.75)' : '');
    var inner = (t && t !== 'pending' && t !== 'fail') ? '<img alt="" src="' + t + '" style="' + rot + '">' : '<span class="pp-ph" style="' + rot + '">' + src.letter + '-' + (p.idx + 1) + '</span>';
    return '<div class="pp-card' + (p.sel ? ' sel' : '') + '" role="listitem" data-uid="' + p.uid + '" data-key="' + key + '">' +
      '<button type="button" class="pp-thumb" data-act="toggle" aria-pressed="' + p.sel + '" aria-label="' + (i + 1) + '쪽 (' + esc(src.name) + ' ' + (p.idx + 1) + '쪽) 선택">' + inner +
      '<span class="pp-no">' + (i + 1) + '</span><span class="pp-chk">' + (p.sel ? '✓' : '') + '</span></button>' +
      '<button type="button" class="pp-zoom" data-act="zoom" aria-label="' + (i + 1) + '쪽 크게 보기">🔍</button>' +
      '<div class="pp-cbar"><span class="pp-handle" title="끌어서 순서 바꾸기"><b>⠿</b><i style="background:' + src.color + '">' + src.letter + '</i>' + (p.idx + 1) + '쪽</span>' +
      '<button type="button" data-act="rot1" aria-label="' + (i + 1) + '쪽 오른쪽으로 돌리기">↻</button>' +
      '<button type="button" class="x" data-act="del1" aria-label="' + (i + 1) + '쪽 삭제">✕</button></div></div>';
  }
  function render() {
    var has = S.pages.length > 0;
    ui.work.hidden = !has && S.srcOrder.length === 0;
    $('.pp-start').hidden = !ui.work.hidden;
    if (!has && !ui.work.hidden) {
      ui.grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:#6b7280;padding:24px 0">남은 쪽이 없어요. 「되돌리기」를 누르거나 파일을 다시 추가해 주세요.</p>';
    } else {
      ui.grid.innerHTML = S.pages.map(cardHTML).join('');
    }
    // 파일 칩
    var used = {};
    S.pages.forEach(function (p) { used[p.sid] = (used[p.sid] || 0) + 1; });
    ui.files.innerHTML = S.srcOrder.filter(function (id) { return used[id]; }).map(function (id) {
      var s = S.sources[id];
      return '<span class="pp-chip"><i style="background:' + s.color + '">' + s.letter + '</i><span>' + esc(s.name) + '</span><em>' + used[id] + '/' + s.pageCount + '쪽' + (s.kind === 'raster' ? ' 🔐' : '') + '</em>' +
        '<button type="button" data-act="rmfile" data-sid="' + id + '" aria-label="' + esc(s.name) + ' 빼기">✕</button></span>';
    }).join('') + '<button type="button" class="pp-chip add" data-act="more">＋ 파일 더 추가</button>';
    updateBar();
    observe();
    clearResult();
  }
  function updateBar() {
    var n = S.pages.length, ns = selected().length;
    ui.count.innerHTML = '총 <b>' + n + '쪽</b>' + (ns ? ' · 선택 <b style="color:#2563eb">' + ns + '쪽</b>' : ' · 선택한 쪽 없음');
    Array.prototype.forEach.call(root.querySelectorAll('[data-need]'), function (b) {
      var need = b.getAttribute('data-need');
      b.disabled = need === 'sel' ? ns === 0 : S.hist.length === 0;
    });
    $('[data-act="all"]').disabled = n === 0;
    $('[data-act="save-all"]').innerHTML = '💾 지금 순서대로 PDF 저장 (' + n + '쪽)';
    $('[data-act="save-all"]').disabled = n === 0;
    $('[data-act="save-sel"]').innerHTML = '✂️ 선택한 쪽만 새 PDF로 저장 (' + ns + '쪽)';
    var nsp = ns || n;
    $('[data-act="save-split"]').innerHTML = '📦 한 쪽씩 따로 나눠 저장 (' + nsp + '개 파일' + (nsp > 1 ? ' · ZIP' : '') + ')';
    $('[data-act="save-split"]').disabled = n === 0;
  }
  function refreshSel() {
    // 선택 표시만 빠르게 갱신
    var map = {};
    S.pages.forEach(function (p) { map[p.uid] = p; });
    Array.prototype.forEach.call(ui.grid.querySelectorAll('.pp-card'), function (c) {
      var p = map[c.getAttribute('data-uid')]; if (!p) return;
      c.classList.toggle('sel', p.sel);
      c.querySelector('.pp-chk').textContent = p.sel ? '✓' : '';
      c.querySelector('.pp-thumb').setAttribute('aria-pressed', p.sel);
    });
    updateBar();
  }

  /* ---------------- 동작 ---------------- */
  function onClick(e) {
    var b = e.target.closest('[data-act]');
    if (!b || !root.contains(b)) return;
    if (b.tagName === 'LABEL') return;
    if (S.busy && b.getAttribute('data-act') !== 'mclose') return;
    var card = b.closest('.pp-card');
    doAct(b.getAttribute('data-act'), card ? +card.getAttribute('data-uid') : null, b);
  }
  function findIdx(uid) { for (var i = 0; i < S.pages.length; i++) if (S.pages[i].uid === uid) return i; return -1; }

  function parseRange(str, n) {
    var set = {}, ok = false;
    var parts = String(str).replace(/[~〜–—]/g, '-').replace(/쪽|페이지|p/gi, '').split(/[,\s·、]+/);
    for (var i = 0; i < parts.length; i++) {
      var t = parts[i].trim(); if (!t) continue;
      var m = t.match(/^(\d*)-(\d*)$/), a, b;
      if (m) { a = m[1] ? +m[1] : 1; b = m[2] ? +m[2] : n; }
      else if (/^\d+$/.test(t)) { a = b = +t; }
      else return null;
      if (a > b) { var x = a; a = b; b = x; }
      a = Math.max(1, a); b = Math.min(n, b);
      for (var k = a; k <= b; k++) { set[k - 1] = true; ok = true; }
    }
    return ok ? set : null;
  }

  function doAct(act, uid, el) {
    var i, p, sel;
    switch (act) {
      case 'sample': return loadSample();
      case 'more': return ui.file.click();
      case 'toggle':
        i = findIdx(uid); if (i < 0) return;
        S.pages[i].sel = !S.pages[i].sel; return refreshSel();
      case 'all': S.pages.forEach(function (p) { p.sel = true; }); return refreshSel();
      case 'none': S.pages.forEach(function (p) { p.sel = false; }); return refreshSel();
      case 'inv': S.pages.forEach(function (p) { p.sel = !p.sel; }); return refreshSel();
      case 'odd': case 'even':
        S.pages.forEach(function (p, k) { p.sel = (k % 2 === 0) === (act === 'odd'); }); refreshSel();
        return msg((act === 'odd' ? '홀수' : '짝수') + ' 쪽 ' + selected().length + '개를 선택했어요.', 'info');
      case 'range':
        var set = parseRange(ui.rin.value, S.pages.length);
        if (!set) return msg('쪽 번호를 알아보지 못했어요. 「1-3, 5」처럼 숫자와 - , 로 적어 주세요. (지금 총 ' + S.pages.length + '쪽)', 'err');
        S.pages.forEach(function (p, k) { p.sel = !!set[k]; }); refreshSel();
        return msg(selected().length + '쪽을 선택했어요. 이제 「선택 삭제」나 「선택한 쪽만 새 PDF로 저장」을 누르세요.', 'info');
      case 'del':
        sel = selected().length; if (!sel) return;
        pushHist(); S.pages = S.pages.filter(function (p) { return !p.sel; }); render();
        return msg('🗑 ' + sel + '쪽을 지웠어요. 실수였다면 「되돌리기」를 누르세요.', 'ok');
      case 'keep':
        sel = selected().length; if (!sel) return;
        pushHist(); var rm = S.pages.length - sel; S.pages = S.pages.filter(function (p) { return p.sel; }); S.pages.forEach(function (p) { p.sel = false; }); render();
        return msg('선택한 ' + sel + '쪽만 남기고 ' + rm + '쪽을 지웠어요.', 'ok');
      case 'del1':
        i = findIdx(uid); if (i < 0) return;
        pushHist(); S.pages.splice(i, 1); render();
        return msg((i + 1) + '쪽을 지웠어요. 「되돌리기」로 되살릴 수 있어요.', 'ok');
      case 'rot':
        pushHist(); S.pages.forEach(function (p) { if (p.sel) p.rot = (p.rot + 90) % 360; }); return render();
      case 'rot1':
        i = findIdx(uid); if (i < 0) return;
        pushHist(); S.pages[i].rot = (S.pages[i].rot + 90) % 360;
        var im = el.closest('.pp-card').querySelector('.pp-thumb img,.pp-thumb .pp-ph');
        if (im) im.style.transform = 'rotate(' + S.pages[i].rot + 'deg)' + ((S.pages[i].rot % 180) ? ' scale(.75)' : '');
        updateBar(); return clearResult();
      case 'left': case 'right':
        pushHist(); var a = S.pages, n = a.length, moved = false;
        if (act === 'left') { for (i = 1; i < n; i++) if (a[i].sel && !a[i - 1].sel) { p = a[i]; a[i] = a[i - 1]; a[i - 1] = p; moved = true; } }
        else { for (i = n - 2; i >= 0; i--) if (a[i].sel && !a[i + 1].sel) { p = a[i]; a[i] = a[i + 1]; a[i + 1] = p; moved = true; } }
        if (!moved) { S.hist.pop(); return msg(act === 'left' ? '이미 맨 앞이에요.' : '이미 맨 뒤예요.', 'info'); }
        render(); var first = ui.grid.querySelector('.pp-card.sel'); if (first && first.scrollIntoView) first.scrollIntoView({ block: 'nearest' });
        return;
      case 'undo':
        if (!S.hist.length) return;
        S.pages = S.hist.pop(); render(); return msg('↶ 한 단계 되돌렸어요.', 'info');
      case 'rmfile':
        var sid = el.getAttribute('data-sid');
        pushHist(); S.pages = S.pages.filter(function (p) { return p.sid !== sid; }); render();
        return msg('「' + S.sources[sid].name + '」의 쪽을 모두 뺐어요. 「되돌리기」로 되살릴 수 있어요.', 'ok');
      case 'zoom': i = findIdx(uid); if (i >= 0) openZoom(i); return;
      case 'save-all': return save(S.pages.slice(), 'all');
      case 'save-sel': return save(selected(), 'sel');
      case 'save-split': return saveSplit(selected().length ? selected() : S.pages.slice());
      case 'dl': return download(S.result);
      case 'share': return share(S.result);
      case 'reset':
        resetAll(); return msg('처음 상태로 돌아왔어요.', 'info');
    }
  }

  function resetAll() {
    for (var k in S.thumbs) if (/^blob:/.test(S.thumbs[k])) URL.revokeObjectURL(S.thumbs[k]);
    for (var id in S.sources) { var s = S.sources[id]; if (s.jsDoc) s.jsDoc.then(function (d) { if (d) d.destroy(); }); }
    clearResult();
    S.sources = {}; S.srcOrder = []; S.pages = []; S.hist = []; S.thumbs = {}; tq = []; S.noPreview = false;
    ui.name.value = '';
    render();
  }

  /* ---------------- 끌어서 순서 바꾸기 (터치·마우스 공통) ---------------- */
  var drag = null;
  function onDragStart(e) {
    var h = e.target.closest('.pp-handle');
    if (!h || S.busy || (e.button && e.button !== 0)) return;
    var card = h.closest('.pp-card');
    e.preventDefault();
    drag = { uid: +card.getAttribute('data-uid'), card: card, target: null, after: false, id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, ghost: null };
    try { h.setPointerCapture(e.pointerId); } catch (er) { }
    h.addEventListener('pointermove', onDragMove);
    h.addEventListener('pointerup', onDragEnd);
    h.addEventListener('pointercancel', onDragEnd);
    drag.h = h;
  }
  function onDragMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault();
    if (!drag.moved) {
      if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 6) return;
      drag.moved = true;
      drag.card.classList.add('drag');
      var g = document.createElement('div'); g.className = 'pp-ghost';
      g.innerHTML = drag.card.querySelector('.pp-thumb').outerHTML;
      root.appendChild(g); drag.ghost = g;
      drag.timer = setInterval(autoScroll, 30);
    }
    drag.x = e.clientX; drag.y = e.clientY;
    drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px';
    markTarget();
  }
  function markTarget() {
    var el = document.elementFromPoint(drag.x, drag.y);
    var c = el && el.closest ? el.closest('#' + ROOT_ID + ' .pp-card') : null;
    if (drag.target && drag.target !== c) drag.target.classList.remove('drop-b', 'drop-a');
    if (!c || c === drag.card) { drag.target = null; return; }
    var r = c.getBoundingClientRect(), after = drag.x > r.left + r.width / 2;
    c.classList.toggle('drop-a', after); c.classList.toggle('drop-b', !after);
    drag.target = c; drag.after = after;
  }
  function autoScroll() {
    if (!drag) return;
    var edge = 70, vh = window.innerHeight, dy = 0;
    if (drag.y < edge) dy = -Math.ceil((edge - drag.y) / 4);
    else if (drag.y > vh - edge) dy = Math.ceil((drag.y - (vh - edge)) / 4);
    if (dy) { window.scrollBy(0, dy); markTarget(); }
  }
  function onDragEnd(e) {
    if (!drag) return;
    var d = drag; drag = null;
    clearInterval(d.timer);
    d.h.removeEventListener('pointermove', onDragMove);
    d.h.removeEventListener('pointerup', onDragEnd);
    d.h.removeEventListener('pointercancel', onDragEnd);
    if (d.ghost) d.ghost.remove();
    d.card.classList.remove('drag');
    if (d.target) d.target.classList.remove('drop-b', 'drop-a');
    if (!d.moved || !d.target || e.type === 'pointercancel') return;
    var from = findIdx(d.uid), to = findIdx(+d.target.getAttribute('data-uid'));
    if (from < 0 || to < 0) return;
    pushHist();
    var p = S.pages.splice(from, 1)[0];
    if (from < to) to--;
    S.pages.splice(to + (d.after ? 1 : 0), 0, p);
    render();
    msg('순서를 바꿨어요: ' + (from + 1) + '쪽 → ' + (findIdx(d.uid) + 1) + '번째', 'ok');
  }

  /* ---------------- 크게 보기 ---------------- */
  var zoomAt = -1;
  function openZoom(i) {
    zoomAt = i;
    ui.modal.innerHTML = '<div class="pp-mtop"><span></span><button type="button" class="pp-btn sm" data-act="mclose">닫기 ✕</button></div>' +
      '<div class="pp-mbody"></div>' +
      '<div class="pp-mbot"><button type="button" class="pp-btn" data-m="prev">◀ 이전</button><button type="button" class="pp-btn pri" data-m="sel"></button><button type="button" class="pp-btn" data-m="next">다음 ▶</button></div>';
    ui.modal.hidden = false;
    ui.modal.onclick = function (e) {
      var b = e.target.closest('[data-m],[data-act="mclose"]');
      if (!b) { if (e.target === ui.modal.querySelector('.pp-mbody')) closeModal(); return; }
      if (b.getAttribute('data-act') === 'mclose') return closeModal();
      var m = b.getAttribute('data-m');
      if (m === 'prev' && zoomAt > 0) showZoom(zoomAt - 1);
      if (m === 'next' && zoomAt < S.pages.length - 1) showZoom(zoomAt + 1);
      if (m === 'sel') { S.pages[zoomAt].sel = !S.pages[zoomAt].sel; refreshSel(); showZoom(zoomAt, true); }
    };
    showZoom(i);
  }
  var zoomUrl = null, zoomSeq = 0;
  async function showZoom(i, selOnly) {
    zoomAt = i;
    var p = S.pages[i], src = S.sources[p.sid];
    ui.modal.querySelector('.pp-mtop span').textContent = (i + 1) + ' / ' + S.pages.length + '쪽 · ' + src.letter + ' ' + src.name + ' ' + (p.idx + 1) + '쪽';
    var sb = ui.modal.querySelector('[data-m="sel"]');
    sb.textContent = p.sel ? '✓ 선택됨' : '선택하기';
    sb.className = 'pp-btn' + (p.sel ? ' pri' : '');
    ui.modal.querySelector('[data-m="prev"]').disabled = i === 0;
    ui.modal.querySelector('[data-m="next"]').disabled = i === S.pages.length - 1;
    if (selOnly) return;
    var body = ui.modal.querySelector('.pp-mbody'), my = ++zoomSeq;
    body.innerHTML = '<span class="ld">불러오는 중…</span>';
    var url;
    if (src.kind === 'image') url = S.thumbs[p.sid + ':0'];
    else {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var r = await renderPageImage(src, p.idx, Math.min(1000, window.innerWidth) * dpr, IS_IOS ? 3e6 : 6e6, 0.85).catch(function () { return null; });
      if (my !== zoomSeq) return;
      if (!r) { body.innerHTML = '<span class="ld">미리보기를 불러오지 못했어요. (' + src.letter + '-' + (p.idx + 1) + '쪽)</span>'; return; }
      if (zoomUrl) URL.revokeObjectURL(zoomUrl);
      url = zoomUrl = URL.createObjectURL(r.blob);
    }
    if (my !== zoomSeq) return;
    body.innerHTML = '<img alt="' + (i + 1) + '쪽 미리보기" src="' + url + '" style="transform:rotate(' + p.rot + 'deg)' + ((p.rot % 180) ? ' scale(.7)' : '') + '">';
  }
  function closeModal() {
    zoomSeq++;
    ui.modal.hidden = true; ui.modal.innerHTML = ''; ui.modal.onclick = null;
    if (zoomUrl) { URL.revokeObjectURL(zoomUrl); zoomUrl = null; }
  }

  /* ---------------- PDF 만들기 ---------------- */
  async function buildPdf(list, onProg) {
    var lib = await needPdfLib();
    var out = await lib.PDFDocument.create();
    // 같은 원본의 쪽은 한 번에 복사해서 글꼴 등 공통 자료가 중복되지 않게
    var need = {};
    list.forEach(function (p) { var s = S.sources[p.sid]; if (s.kind === 'pdf') (need[p.sid] = need[p.sid] || []).push(p.idx); });
    var copied = {};
    for (var sid in need) {
      var idxs = need[sid].filter(function (v, k, a) { return a.indexOf(v) === k; });
      var pages = await out.copyPages(S.sources[sid].lib, idxs);
      idxs.forEach(function (ix, k) { copied[sid + ':' + ix] = pages[k]; });
    }
    var imgCache = {};
    for (var i = 0; i < list.length; i++) {
      var p = list[i], s = S.sources[p.sid], pg;
      if (onProg) onProg(i, list.length);
      if (s.kind === 'pdf') {
        pg = out.addPage(copied[p.sid + ':' + p.idx]);
        if (p.rot) pg.setRotation(lib.degrees(((pg.getRotation().angle || 0) + p.rot) % 360));
      } else if (s.kind === 'image') {
        var img = imgCache[s.id] || (imgCache[s.id] = s.imgType === 'png' ? await out.embedPng(s.bytes) : await out.embedJpg(s.bytes));
        var land = s.w > s.h, W = land ? A4[1] : A4[0], H = land ? A4[0] : A4[1], m = 18;
        var k = Math.min((W - m * 2) / s.w, (H - m * 2) / s.h);
        pg = out.addPage([W, H]);
        pg.drawImage(img, { x: (W - s.w * k) / 2, y: (H - s.h * k) / 2, width: s.w * k, height: s.h * k });
        if (p.rot) pg.setRotation(lib.degrees(p.rot));
      } else { // raster: 보안 PDF → 이미지
        var jd = await getJsDoc(s), pw0 = 595;
        if (jd) { try { pw0 = (await jd.getPage(p.idx + 1)).getViewport({ scale: 1 }).width; } catch (er) { } }
        var r = await renderPageImage(s, p.idx, pw0 * 150 / 72, IS_IOS ? 4e6 : 8e6, 0.88).catch(function () { return null; });
        if (!r) {
          // 기본 해상도(약 150dpi)로 다시 시도
          r = await renderPageImage(s, p.idx, 1240, 2.5e6, 0.85).catch(function () { return null; });
        }
        if (!r) { var e = new Error('보안 PDF의 ' + (p.idx + 1) + '쪽을 그리지 못했어요. 기기 메모리가 부족할 수 있어요. PC에서 다시 시도해 주세요.'); e.user = true; throw e; }
        var jb = new Uint8Array(await readFile(r.blob));
        var ji = await out.embedJpg(jb);
        pg = out.addPage([r.ptW, r.ptH]);
        pg.drawImage(ji, { x: 0, y: 0, width: r.ptW, height: r.ptH });
        if (p.rot) pg.setRotation(lib.degrees(p.rot));
      }
      if (i % 20 === 19) await raf();
    }
    out.setProducer('착착도구 PDF 페이지 정리 (브라우저 처리)');
    out.setCreator('착착도구 barodogu.blogspot.com');
    if (onProg) onProg(list.length, list.length, true);
    return out.save({ useObjectStreams: true });
  }
  function progText(what) {
    return function (i, n, saving) { msg(saving ? what + ' 파일로 저장하는 중이에요…' : what + ' 만드는 중… ' + (i + 1) + '/' + n + '쪽', 'info', true); };
  }

  async function save(list, mode) {
    if (S.busy || !list.length) return;
    clearResult();
    setBusy(true, 'PDF를 만드는 중이에요…');
    try {
      var bytes = await buildPdf(list, progText('PDF'));
      var nm = cleanName(ui.name.value || '문서_정리', 'pdf');
      if (mode === 'sel') nm = nm.replace(/\.pdf$/, '') .replace(/_정리$/, '') + '_추출.pdf';
      showResult(new Blob([bytes], { type: 'application/pdf' }), nm, list.length + '쪽 PDF');
    } catch (e) { failSave(e); }
    setBusy(false);
  }
  async function saveSplit(list) {
    if (S.busy || !list.length) return;
    clearResult();
    if (list.length === 1) return save(list, 'sel');
    setBusy(true, '한 쪽씩 나누는 중이에요…');
    try {
      var Z = await needZip(), zip = new Z();
      var base = cleanName(ui.name.value || '문서', 'pdf').replace(/\.pdf$/, '').replace(/_정리$/, '');
      var w = String(list.length).length < 2 ? 2 : String(list.length).length;
      for (var i = 0; i < list.length; i++) {
        msg('한 쪽씩 나누는 중… ' + (i + 1) + '/' + list.length, 'info', true);
        var b = await buildPdf([list[i]]);
        zip.file(base + '_' + String(i + 1).padStart(w, '0') + '.pdf', b);
        await raf();
      }
      msg('ZIP 파일로 묶는 중이에요…', 'info', true);
      var zb = await zip.generateAsync({ type: 'blob', compression: 'STORE', mimeType: 'application/zip' });
      showResult(zb, base + '_한쪽씩_' + list.length + '개.zip', list.length + '개 PDF가 든 ZIP');
    } catch (e) { failSave(e); }
    setBusy(false);
  }
  function failSave(e) {
    if (window.console) console.warn('[착착도구] save', e);
    var m = e && e.user ? e.message : '저장 파일을 만들지 못했어요.\n· 쪽 수가 많거나 파일이 크면 기기 메모리가 부족할 수 있어요. 쪽을 나눠서 두세 번에 저장해 보세요.\n· 그래도 안 되면 PC 크롬에서 해 보세요.';
    msg('⚠️ ' + m, 'err', true);
  }

  function clearResult() {
    if (S.result && S.result.url) URL.revokeObjectURL(S.result.url);
    S.result = null;
    if (ui.result) { ui.result.hidden = true; ui.result.innerHTML = ''; }
  }
  function showResult(blob, name, desc) {
    clearResult();
    var r = S.result = { blob: blob, name: name, url: URL.createObjectURL(blob) };
    var canShare = false;
    try { canShare = !!(navigator.canShare && window.File && navigator.canShare({ files: [new File([blob], name, { type: blob.type })] })); } catch (e) { }
    ui.result.innerHTML = '<h4>✅ 완성했어요!</h4><p>' + esc(name) + '<br>' + desc + ' · ' + fmtSize(blob.size) + '</p>' +
      '<div class="pp-row"><a class="pp-btn pri" data-act="dl" href="' + r.url + '" download="' + esc(name) + '">⬇️ 내 기기에 저장</a>' +
      (canShare ? '<button type="button" class="pp-btn" data-act="share">📤 공유 (카톡·메일)</button>' : '') + '</div>' +
      '<p style="margin:10px 0 0;font-size:12px;color:#047857">' + (IS_IOS ? '아이폰: 「내 기기에 저장」 → 「다운로드」를 누른 뒤 파일 앱 → 다운로드 폴더에서 확인하세요.' + (canShare ? ' 「공유」로 바로 카톡에 보내도 돼요.' : '') : '갤럭시: 내 파일 → 다운로드 폴더에 저장돼요. 저장 후 꼭 열어서 내용을 확인하세요.') + '</p>';
    ui.result.hidden = false;
    msg('');
    if (!IS_IOS) download(r, true);
    try { ui.result.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { }
  }
  function download(r, auto) {
    if (!r) return;
    if (!auto) return; // 버튼 자체가 download 링크라 브라우저가 처리
    var a = document.createElement('a');
    a.href = r.url; a.download = r.name; a.rel = 'noopener'; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); }, 1000);
  }
  async function share(r) {
    if (!r) return;
    try {
      await navigator.share({ files: [new File([r.blob], r.name, { type: r.blob.type })], title: r.name });
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      msg('이 브라우저에서는 바로 공유가 안 돼요. 「내 기기에 저장」을 누른 뒤 카톡·메일에서 파일을 첨부해 주세요.', 'warn');
    }
  }

  /* ---------------- 예시 파일 ---------------- */
  async function loadSample() {
    if (S.busy) return;
    setBusy(true, '예시 PDF를 만드는 중이에요…');
    var files;
    try {
      var lib = await needPdfLib();
      async function mk(title, color, n, landscapeAt) {
        var d = await lib.PDFDocument.create(), f = await d.embedFont(lib.StandardFonts.HelveticaBold), f2 = await d.embedFont(lib.StandardFonts.Helvetica);
        for (var i = 1; i <= n; i++) {
          var land = i === landscapeAt, W = land ? A4[1] : A4[0], H = land ? A4[0] : A4[1];
          var pg = d.addPage([W, H]);
          pg.drawRectangle({ x: 0, y: H - 90, width: W, height: 90, color: color });
          pg.drawText(title, { x: 40, y: H - 58, size: 26, font: f, color: lib.rgb(1, 1, 1) });
          pg.drawText(String(i), { x: W / 2 - (i > 9 ? 60 : 30), y: H / 2 - 60, size: 160, font: f, color: color });
          pg.drawText('Page ' + i + ' of ' + n + (land ? '  (landscape)' : ''), { x: 40, y: 60, size: 16, font: f2, color: lib.rgb(.35, .35, .35) });
          for (var l = 0; l < 6; l++) pg.drawRectangle({ x: 40, y: H - 140 - l * 22, width: (W - 80) * (l % 3 === 2 ? .6 : 1), height: 8, color: lib.rgb(.88, .9, .93) });
        }
        return d.save();
      }
      var a = await mk('APPLICATION FORM', lib.rgb(.15, .39, .92), 3, 0);
      var b = await mk('ATTACHMENT', lib.rgb(.86, .15, .47), 5, 4);
      files = [new File([a], '예시_신청서.pdf', { type: 'application/pdf' }), new File([b], '예시_증빙서류.pdf', { type: 'application/pdf' })];
    } catch (e) { setBusy(false); return msg(e && e.user ? e.message : LIBERR, 'err', true); }
    setBusy(false);
    await addFiles(files);
    msg('🧪 예시 PDF 2개(3쪽 + 5쪽)를 불러왔어요.\n해 보기: 쪽을 눌러 선택 → 「선택 삭제」, 가로로 된 B-4쪽은 ↻로 돌려 보세요.', 'ok', true);
  }

  /* ---------------- 시작 ---------------- */
  function init() {
    root = document.getElementById(ROOT_ID);
    if (!root || root.getAttribute('data-ready')) return;
    root.setAttribute('data-ready', '1');
    build();
    render();
    // 미리보기 라이브러리는 첫 파일을 고르기 전에 미리 받아 두지 않음(필요할 때만)
    window.BD_PDFPAGES = { version: VER, _state: S }; // 테스트·디버깅용
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
