/*!
 * 착착도구 · PDF 비밀번호 해제 · 잠금 v1.0.0
 * https://barodogu.blogspot.com
 * ---------------------------------------------------------------------------
 * · 비밀번호 해제 : 암호가 걸린 PDF를 열어(비밀번호 입력) 암호를 제거한 사본을 만듭니다.
 * · 비밀번호 잠금 : 일반 PDF에 열기 비밀번호와 인쇄·복사·편집 권한을 걸어 저장합니다.
 * · 문서를 다시 그리지 않고 구조를 그대로 옮기므로 텍스트·벡터·페이지 크기가 유지됩니다.
 * · 모든 처리는 브라우저 안에서만 이루어집니다. (파일·비밀번호 서버 전송 없음)
 * · 사용 라이브러리: @cantoo/pdf-lib 2.11.1 (MIT, pdf-lib 포크 · AES-256 암호화 지원)
 *   필요할 때만 jsDelivr에서 불러옵니다.
 * 사용법: 글에 <div id="bd-pdfpw"></div> 를 두고 이 스크립트를 불러오세요.
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';

  if (window.__bdPdfPwLoaded) return;
  window.__bdPdfPwLoaded = true;

  var ROOT_ID = 'bd-pdfpw';
  var VER = '1.0.0';
  var LIB_URLS = [
    'https://cdn.jsdelivr.net/npm/@cantoo/pdf-lib@2.11.1/dist/pdf-lib.min.js',
    'https://unpkg.com/@cantoo/pdf-lib@2.11.1/dist/pdf-lib.min.js'
  ];
  var UA = navigator.userAgent || '';
  var IS_IOS = /iP(hone|ad|od)/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
  var LIMIT_MB = IS_IOS ? 80 : 150;

  /* ───────────────────────── 공통 유틸 ───────────────────────── */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function fmtSize(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return Math.round(b / 1024) + 'KB';
    return (b / 1024 / 1024).toFixed(1) + 'MB';
  }

  function pageSizeLabel(w, h, short) {
    var W = Math.round(w * 25.4 / 72), H = Math.round(h * 25.4 / 72);
    var land = w > h;
    var short = Math.min(w, h), long = Math.max(w, h);
    var name = '';
    if (Math.abs(short - 595.28) < 4 && Math.abs(long - 841.89) < 4) name = 'A4';
    else if (Math.abs(short - 419.53) < 4 && Math.abs(long - 595.28) < 4) name = 'A5';
    else if (Math.abs(short - 612) < 4 && Math.abs(long - 792) < 4) name = 'Letter';
    else if (Math.abs(short - 841.89) < 4 && Math.abs(long - 1190.55) < 4) name = 'A3';
    var dim = W + '×' + H + 'mm';
    if (short) return (name || dim) + (land ? ' 가로' : '');
    return (name ? name + ' · ' : '') + dim + (land ? ' (가로)' : '');
  }

  function baseName(name) {
    return String(name || 'file.pdf').replace(/\.pdf$/i, '');
  }

  function safeName(name) {
    // 파일명에 쓸 수 없는 문자만 정리 (한글·공백은 그대로 둡니다)
    return String(name).replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || 'pdf';
  }

  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ─────────────────────── 라이브러리 로딩 ─────────────────────── */

  var libPromise = null;

  function loadLib() {
    if (window.PDFLib && window.PDFLib.PDFDocument) return Promise.resolve(window.PDFLib);
    if (libPromise) return libPromise;

    libPromise = new Promise(function (resolve, reject) {
      var idx = 0;
      var done = false;
      var timer = null;

      function finish(ok) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (ok && window.PDFLib && window.PDFLib.PDFDocument) resolve(window.PDFLib);
        else { libPromise = null; reject(new Error('LIB_LOAD')); }
      }

      function tryNext() {
        if (done) return;
        if (idx >= LIB_URLS.length) { finish(false); return; }
        var s = document.createElement('script');
        s.src = LIB_URLS[idx++];
        s.async = true;
        s.onload = function () {
          if (window.PDFLib && window.PDFLib.PDFDocument) finish(true);
          else tryNext();
        };
        s.onerror = tryNext;
        document.head.appendChild(s);
      }

      timer = setTimeout(function () { finish(false); }, 25000);
      tryNext();
    });

    return libPromise;
  }

  /* ──────────────────────── 스타일 ──────────────────────── */

  var CSS = [
    '#R{--pw-pri:#2563eb;--pw-pri-d:#1d4ed8;--pw-fg:#1f2937;--pw-sub:#6b7280;--pw-line:#e5e7eb;--pw-soft:#f3f6fb;--pw-ok:#059669;--pw-err:#dc2626;--pw-warn:#b45309;',
    'font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;color:var(--pw-fg);line-height:1.55;margin:18px 0;-webkit-text-size-adjust:100%;font-size:15px}',
    '#R *{box-sizing:border-box}',
    '#R [hidden]{display:none!important}',
    '#R .pw-card{background:#fff;border:1px solid var(--pw-line);border-radius:16px;padding:16px;max-width:100%;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,.04)}',
    '#R .pw-head{display:flex;align-items:center;gap:10px;margin:0 0 4px}',
    '#R .pw-head-ic{width:38px;height:38px;flex:0 0 38px;border-radius:11px;background:linear-gradient(135deg,#2563eb,#1e40af);display:flex;align-items:center;justify-content:center;font-size:19px;line-height:1}',
    '#R .pw-head b{display:block;font-size:19px;line-height:1.3;letter-spacing:-.2px}',
    '#R .pw-head span{display:block;font-size:12.5px;color:var(--pw-sub);margin-top:1px}',
    '#R .pw-safe{display:flex;align-items:flex-start;gap:7px;font-size:12.5px;color:#065f46;background:#ecfdf5;border-radius:10px;padding:9px 11px;margin:12px 0 14px;line-height:1.45}',
    '#R .pw-tabs{display:flex;gap:6px;background:var(--pw-soft);border-radius:12px;padding:5px;margin:0 0 14px}',
    '#R .pw-tab{flex:1 1 0;min-height:44px;border:0;background:transparent;border-radius:9px;font:inherit;font-size:14.5px;font-weight:700;color:var(--pw-sub);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;transition:background .15s,color .15s}',
    '#R .pw-tab.is-on{background:#fff;color:var(--pw-pri);box-shadow:0 1px 3px rgba(15,23,42,.12)}',
    '#R button{font:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}',
    '#R .pw-panel[hidden]{display:none}',
    '#R .pw-drop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;min-height:158px;border:2px dashed #bcd0f5;border-radius:14px;background:var(--pw-soft);text-align:center;cursor:pointer;padding:18px 14px;transition:background .15s,border-color .15s}',
    '#R .pw-drop:hover{background:#eaf1ff}',
    '#R .pw-drop.over{background:#e0ebff;border-color:var(--pw-pri)}',
    '#R .pw-drop-ic{font-size:34px;line-height:1.1;margin-bottom:2px}',
    '#R .pw-drop-t{font-size:16px;font-weight:700;letter-spacing:-.2px}',
    '#R .pw-drop-s{font-size:12.5px;color:var(--pw-sub)}',
    '#R .pw-drop-btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;margin-top:9px;padding:0 18px;border-radius:10px;background:#fff;border:1px solid #c7d7f2;color:var(--pw-pri);font-weight:700;font-size:14px}',
    '#R .pw-file{display:flex;align-items:center;gap:11px;background:#f8fafc;border:1px solid var(--pw-line);border-radius:12px;padding:12px}',
    '#R .pw-file-ic{flex:0 0 40px;width:40px;height:46px;border-radius:7px;background:#fee2e2;color:#b91c1c;font-size:11px;font-weight:800;display:flex;align-items:flex-end;justify-content:center;padding-bottom:6px;letter-spacing:.3px;position:relative}',
    '#R .pw-file-ic:after{content:"";position:absolute;top:0;right:0;border-width:0 10px 10px 0;border-style:solid;border-color:#fff #fff #fca5a5 #fca5a5;border-radius:0 7px 0 2px}',
    '#R .pw-file-main{flex:1 1 auto;min-width:0}',
    '#R .pw-file-name{font-size:14.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#R .pw-file-meta{display:flex;flex-wrap:nowrap;align-items:center;font-size:12px;color:var(--pw-sub);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#R .pw-file-meta span+span:before{content:"·";margin:0 6px;color:#cbd5e1;font-weight:700}',
    '#R .pw-file-tag{display:inline-flex;align-items:center;gap:4px;margin-top:6px;font-size:11.5px;font-weight:700;border-radius:6px;padding:2px 7px;background:#fef3c7;color:#92400e}',
    '#R .pw-file-tag.plain{background:#e0f2fe;color:#075985}',
    '#R .pw-file-tag.ok{background:#dcfce7;color:#166534}',
    '#R .pw-x{flex:0 0 34px;width:34px;height:34px;border:0;border-radius:9px;background:#eef2f7;color:#64748b;font-size:14px;line-height:1;align-self:flex-start}',
    '#R .pw-x:hover{background:#e2e8f0}',
    '#R .pw-label{display:block;font-size:13px;font-weight:700;margin:16px 0 6px}',
    '#R .pw-label .req{color:var(--pw-pri)}',
    '#R .pw-label .opt{color:var(--pw-sub);font-weight:600;font-size:12px}',
    '#R .pw-pw{position:relative;display:flex;align-items:center}',
    '#R .pw-pw input{width:100%;height:48px;padding:0 48px 0 13px;border:1px solid #cbd5e1;border-radius:11px;font:inherit;font-size:16px;background:#fff;color:var(--pw-fg);letter-spacing:.02em}',
    '#R .pw-pw input:focus{outline:none;border-color:var(--pw-pri);box-shadow:0 0 0 3px rgba(37,99,235,.13)}',
    '#R .pw-pw input.bad{border-color:#fca5a5;background:#fff7f7}',
    '#R .pw-eye{position:absolute;right:5px;width:38px;height:38px;border:0;border-radius:8px;background:transparent;font-size:16px;color:#64748b;display:flex;align-items:center;justify-content:center}',
    '#R .pw-eye:hover{background:#f1f5f9}',
    '#R .pw-hint{font-size:12px;color:var(--pw-sub);margin:6px 0 0;display:flex;gap:5px;flex-wrap:wrap}',
    '#R .pw-chk{display:flex;align-items:flex-start;gap:9px;padding:10px 11px;border:1px solid var(--pw-line);border-radius:10px;background:#fff;cursor:pointer;margin:0}',
    '#R .pw-chk+.pw-chk{margin-top:6px}',
    '#R .pw-chk input{flex:0 0 auto;width:20px;height:20px;margin:1px 0 0;accent-color:var(--pw-pri)}',
    '#R .pw-chk b{font-size:13.5px;font-weight:700;display:block}',
    '#R .pw-chk small{font-size:11.5px;color:var(--pw-sub);display:block;margin-top:1px}',
    '#R .pw-opts{margin-top:12px}',
    '#R .pw-note{margin:12px 0 0;background:#fffbeb;color:#92400e;border-radius:10px;padding:9px 11px;font-size:12px;line-height:1.5}',
    '#R .pw-opts-t{font-size:12.5px;font-weight:700;color:var(--pw-sub);margin:0 0 7px;display:flex;align-items:center;gap:6px}',
    '#R .pw-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:50px;padding:0 16px;border-radius:12px;border:1px solid var(--pw-line);background:#fff;color:var(--pw-fg);font-size:15.5px;font-weight:800;text-decoration:none;line-height:1.2;transition:background .15s}',
    '#R .pw-btn:active{transform:translateY(1px)}',
    '#R .pw-btn:disabled{opacity:.45;cursor:not-allowed}',
    '#R .pw-btn.pri{background:var(--pw-pri);border-color:var(--pw-pri);color:#fff;box-shadow:0 2px 8px rgba(37,99,235,.22)}',
    '#R .pw-btn.pri:hover:not(:disabled){background:var(--pw-pri-d)}',
    '#R .pw-btn.big{width:100%;margin-top:16px;min-height:54px;font-size:16px}',
    '#R .pw-row{display:flex;gap:8px;margin-top:10px}',
    '#R .pw-row>.pw-btn{flex:1 1 0}',
    '#R .pw-prog{margin-top:14px}',
    '#R .pw-prog-top{display:flex;justify-content:space-between;font-size:12.5px;color:var(--pw-sub);margin-bottom:6px}',
    '#R .pw-prog-top b{color:var(--pw-pri);font-variant-numeric:tabular-nums}',
    '#R .pw-prog-bar{height:7px;border-radius:99px;background:#e5e7eb;overflow:hidden}',
    '#R .pw-prog-in{height:100%;width:0;border-radius:99px;background:linear-gradient(90deg,#3b82f6,#2563eb);transition:width .25s ease}',
    '#R .pw-msg{margin-top:13px;font-size:13.5px;border-radius:11px;padding:11px 13px;line-height:1.5;display:none;white-space:pre-line}',
    '#R .pw-msg.on{display:block}',
    '#R .pw-msg.info{background:#eff6ff;color:#1e40af}',
    '#R .pw-msg.ok{background:#ecfdf5;color:#065f46}',
    '#R .pw-msg.err{background:#fef2f2;color:#991b1b}',
    '#R .pw-msg.warn{background:#fffbeb;color:#92400e}',
    '#R .pw-result{margin-top:14px;border:1px solid #a7f3d0;background:#f0fdf6;border-radius:13px;padding:14px}',
    '#R .pw-result-head{display:flex;align-items:center;gap:8px;font-weight:800;font-size:15px;color:#065f46}',
    '#R .pw-result-ic{width:30px;height:30px;flex:0 0 30px;border-radius:50%;background:#059669;color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px}',
    '#R .pw-result p{margin:7px 0 0;font-size:13px;color:#065f46}',
    '#R .pw-result-name{margin-top:10px;background:#fff;border:1px solid #d1fae5;border-radius:9px;padding:9px 13px;font-size:13px;font-weight:700;color:#1f2937;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#R .pw-result-name>span{display:block;font-weight:600;color:var(--pw-sub);font-size:11px;letter-spacing:.2px}',
    '#R .pw-result-name>div{margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#R .pw-foot{margin-top:14px;padding-top:12px;border-top:1px dashed var(--pw-line);font-size:11.5px;color:var(--pw-sub);display:flex;flex-wrap:wrap;align-items:center}',
    '#R .pw-foot span+span:before{content:"·";margin:0 6px;color:#cbd5e1}',
    '@media (max-width:480px){#R .pw-card{padding:14px}#R .pw-head b{font-size:17.5px}#R .pw-tab{font-size:13.5px;gap:4px}#R .pw-drop{min-height:140px}#R .pw-drop-t{font-size:15px}#R .pw-file-name{font-size:14px}#R .pw-btn.big{min-height:52px}#R .pw-foot span+span:before{content:"";margin:0 5px}}'
  ].join('');

  /* ──────────────────────── 마크업 ──────────────────────── */

  function dropHTML(tab) {
    var locked = tab === 'unlock';
    return '' +
      '<div class="pw-drop" data-drop="' + tab + '" role="button" tabindex="0" aria-label="PDF 파일 선택">' +
        '<div class="pw-drop-ic">' + (locked ? '🔓' : '🔒') + '</div>' +
        '<div class="pw-drop-t">' + (locked ? '암호가 걸린 PDF를 여기에 놓으세요' : '잠글 PDF를 여기에 놓으세요') + '</div>' +
        '<div class="pw-drop-s">드래그해서 놓거나 아래 버튼으로 선택</div>' +
        '<div class="pw-drop-btn">PDF 파일 선택</div>' +
      '</div>' +
      '<input type="file" accept="application/pdf,.pdf" data-input="' + tab + '" hidden>';
  }

  function fileHTML(tab) {
    return '' +
      '<div class="pw-file" data-file="' + tab + '" hidden>' +
        '<div class="pw-file-ic">PDF</div>' +
        '<div class="pw-file-main">' +
          '<div class="pw-file-name"></div>' +
          '<div class="pw-file-meta"></div>' +
          '<div class="pw-file-tag"></div>' +
        '</div>' +
        '<button type="button" class="pw-x" data-reset="' + tab + '" aria-label="다른 파일 선택">✕</button>' +
      '</div>';
  }

  function progHTML(tab) {
    return '' +
      '<div class="pw-prog" data-prog="' + tab + '" hidden>' +
        '<div class="pw-prog-top"><span data-prog-label="' + tab + '">준비 중</span><b data-prog-pct="' + tab + '">0%</b></div>' +
        '<div class="pw-prog-bar"><div class="pw-prog-in" data-prog-in="' + tab + '"></div></div>' +
      '</div>';
  }

  function msgHTML(tab) {
    return '<div class="pw-msg" data-msg="' + tab + '" role="status" aria-live="polite"></div>';
  }

  function resultHTML(tab) {
    return '' +
      '<div class="pw-result" data-result="' + tab + '" hidden>' +
        '<div class="pw-result-head"><span class="pw-result-ic">✓</span><span data-result-title="' + tab + '"></span></div>' +
        '<p data-result-desc="' + tab + '"></p>' +
        '<div class="pw-result-name"><span>저장 파일</span><div data-result-name="' + tab + '"></div></div>' +
        '<div class="pw-row">' +
          '<button type="button" class="pw-btn pri" data-dl="' + tab + '">⬇ 다운로드</button>' +
          '<button type="button" class="pw-btn" data-again="' + tab + '">다른 파일</button>' +
        '</div>' +
      '</div>';
  }

  function unlockPanel() {
    return '' +
      '<section class="pw-panel" data-panel="unlock">' +
        dropHTML('unlock') +
        fileHTML('unlock') +
        '<div data-flow="unlock" hidden>' +
          '<label class="pw-label" for="bd-pdfpw-pw1">PDF 열기 비밀번호 <span class="req">*</span></label>' +
          '<div class="pw-pw">' +
            '<input id="bd-pdfpw-pw1" type="password" data-pw="unlock" inputmode="text" autocomplete="off" spellcheck="false" placeholder="PDF를 열 때 쓰는 비밀번호">' +
            '<button type="button" class="pw-eye" data-eye="unlock" aria-label="비밀번호 보기">👁</button>' +
          '</div>' +
          '<p class="pw-hint" data-pwhint="unlock">대소문자를 구분합니다. 문서에 걸린 비밀번호를 모르면 열 수 없습니다.</p>' +
          '<button type="button" class="pw-btn pri big" data-go="unlock">🔓 비밀번호 해제하고 저장</button>' +
        '</div>' +
        progHTML('unlock') +
        msgHTML('unlock') +
        resultHTML('unlock') +
      '</section>';
  }

  function lockPanel() {
    return '' +
      '<section class="pw-panel" data-panel="lock" hidden>' +
        dropHTML('lock') +
        fileHTML('lock') +
        '<div data-flow="lock" hidden>' +
          '<label class="pw-label" for="bd-pdfpw-pw2">열기 비밀번호 <span class="req">*</span></label>' +
          '<div class="pw-pw">' +
            '<input id="bd-pdfpw-pw2" type="password" data-pw="lock" inputmode="text" autocomplete="new-password" spellcheck="false" placeholder="PDF를 열 때 입력할 비밀번호">' +
            '<button type="button" class="pw-eye" data-eye="lock" aria-label="비밀번호 보기">👁</button>' +
          '</div>' +
          '<label class="pw-label" for="bd-pdfpw-pw2c">비밀번호 확인 <span class="req">*</span></label>' +
          '<div class="pw-pw">' +
            '<input id="bd-pdfpw-pw2c" type="password" data-pw="lock2" inputmode="text" autocomplete="new-password" spellcheck="false" placeholder="한 번 더 입력">' +
            '<button type="button" class="pw-eye" data-eye="lock2" aria-label="비밀번호 보기">👁</button>' +
          '</div>' +
          '<p class="pw-hint">한글·영문·숫자 모두 됩니다. 잊어버리면 열 수 없으니 꼭 기억되는 비밀번호로 정하세요.</p>' +
          '<div class="pw-opts">' +
            '<p class="pw-opts-t">📄 받는 사람에게 허용할 기능 <span style="font-weight:600">(체크를 풀면 제한됩니다)</span></p>' +
            '<label class="pw-chk"><input type="checkbox" data-perm="print" checked><span><b>인쇄 허용</b><small>체크를 풀면 인쇄가 막힙니다.</small></span></label>' +
            '<label class="pw-chk"><input type="checkbox" data-perm="copy" checked><span><b>텍스트·이미지 복사 허용</b><small>체크를 풀면 내용을 복사할 수 없습니다.</small></span></label>' +
            '<label class="pw-chk"><input type="checkbox" data-perm="edit" checked><span><b>내용 편집 허용</b><small>체크를 풀면 페이지 편집·주석 달기가 막힙니다.</small></span></label>' +
          '</div>' +
          '<p class="pw-note">⚠️ 이 비밀번호는 되돌릴 수 없습니다. 잊어버리면 파일을 열 수 없으니 안전한 곳에 적어 두세요.</p>' +
          '<button type="button" class="pw-btn pri big" data-go="lock">🔒 비밀번호 걸고 저장</button>' +
        '</div>' +
        progHTML('lock') +
        msgHTML('lock') +
        resultHTML('lock') +
      '</section>';
  }

  function markup() {
    return '' +
      '<div class="pw-card">' +
        '<div class="pw-head">' +
          '<div class="pw-head-ic">🔐</div>' +
          '<div><b>PDF 비밀번호 해제 · 잠금</b><span>암호 풀기와 걸기, 한 화면에서</span></div>' +
        '</div>' +
        '<div class="pw-safe"><span>🔒</span><span>파일과 비밀번호는 <b>서버로 전송되지 않고</b> 이 브라우저 안에서만 처리됩니다.</span></div>' +
        '<div class="pw-tabs" role="tablist">' +
          '<button type="button" class="pw-tab is-on" role="tab" aria-selected="true" data-tab="unlock">🔓 비밀번호 해제</button>' +
          '<button type="button" class="pw-tab" role="tab" aria-selected="false" data-tab="lock">🔒 비밀번호 잠금</button>' +
        '</div>' +
        unlockPanel() +
        lockPanel() +
        '<div class="pw-foot"><span>설치·회원가입 없음</span><span>파일 최대 ' + LIMIT_MB + 'MB</span><span>텍스트·페이지 그대로 유지</span><span>v' + VER + '</span></div>' +
      '</div>';
  }

  /* ──────────────────────── 상태 ──────────────────────── */

  var st = {
    tab: 'unlock',
    unlock: { file: null, bytes: null, info: null, tries: 0, out: null, outName: '' },
    lock: { file: null, bytes: null, info: null, out: null, outName: '' },
    busy: false
  };

  var root = null;

  function P(tab, sel) { return $(sel.replace('{t}', tab), root); }

  /* ──────────────────────── UI 도우미 ──────────────────────── */

  function setMsg(tab, kind, text) {
    var el = P(tab, '[data-msg="{t}"]');
    if (!el) return;
    el.className = 'pw-msg' + (text ? ' on ' + kind : '');
    el.textContent = text || '';
  }

  function setProg(tab, pct, label) {
    var box = P(tab, '[data-prog="{t}"]');
    if (!box) return;
    if (pct === null) { box.hidden = true; return; }
    box.hidden = false;
    P(tab, '[data-prog-label="{t}"]').textContent = label || '';
    P(tab, '[data-prog-pct="{t}"]').textContent = Math.round(pct) + '%';
    P(tab, '[data-prog-in="{t}"]').style.width = Math.max(0, Math.min(100, pct)) + '%';
  }

  function setBusy(tab, on, label) {
    st.busy = on;
    var btn = P(tab, '[data-go="{t}"]');
    if (btn) {
      btn.disabled = on;
      if (on) {
        btn.dataset.label = btn.dataset.label || btn.innerHTML;
        btn.innerHTML = label || '처리 중…';
      } else if (btn.dataset.label) {
        btn.innerHTML = btn.dataset.label;
      }
    }
    var drop = P(tab, '[data-drop="{t}"]');
    if (drop) drop.style.pointerEvents = on ? 'none' : '';
    var x = P(tab, '[data-reset="{t}"]');
    if (x) x.disabled = on;
  }

  function showResult(tab, title, desc, name, blob) {
    var s = st[tab];
    s.out = blob;
    s.outName = name;
    var box = P(tab, '[data-result="{t}"]');
    P(tab, '[data-result-title="{t}"]').textContent = title;
    P(tab, '[data-result-desc="{t}"]').textContent = desc;
    P(tab, '[data-result-name="{t}"]').textContent = name;
    box.hidden = false;
    var flow = P(tab, '[data-flow="{t}"]');
    if (flow) flow.hidden = true;
    var drop = P(tab, '[data-drop="{t}"]');
    if (drop) drop.hidden = true;
    if (window.innerWidth < 760 && box.scrollIntoView) {
      try { box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {}
    }
  }

  function clearResult(tab) {
    P(tab, '[data-result="{t}"]').hidden = true;
  }

  function setFlow(tab, on) {
    var flow = P(tab, '[data-flow="{t}"]');
    if (flow) flow.hidden = !on;
  }

  function renderFile(tab) {
    var s = st[tab];
    var box = P(tab, '[data-file="{t}"]');
    var drop = P(tab, '[data-drop="{t}"]');
    if (!s.file || !s.info) {
      box.hidden = true;
      drop.hidden = false;
      return;
    }
    box.hidden = false;
    drop.hidden = true;
    $('.pw-file-name', box).textContent = s.file.name;
    var meta = $('.pw-file-meta', box);
    meta.innerHTML = '';
    var narrow = (window.innerWidth || 1024) < 430;
    var items = [s.info.pages + '페이지', pageSizeLabel(s.info.size.width, s.info.size.height, narrow), fmtSize(s.file.size)];
    items.forEach(function (t) {
      var sp = document.createElement('span');
      sp.textContent = t;
      meta.appendChild(sp);
    });
    var tag = $('.pw-file-tag', box);
    tag.className = 'pw-file-tag';
    if (tab === 'unlock') {
      if (s.info.encrypted) {
        tag.textContent = '🔐 비밀번호가 걸린 문서';
      } else {
        tag.textContent = '🔓 비밀번호 없음';
        tag.classList.add('plain');
      }
    } else {
      tag.textContent = s.info.encrypted ? '⚠️ 이미 비밀번호가 걸려 있음' : '🔓 비밀번호 없는 문서';
      if (!s.info.encrypted) tag.classList.add('plain');
    }
  }

  /* ──────────────────────── 파일 처리 ──────────────────────── */

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(new Uint8Array(fr.result)); };
      fr.onerror = function () { reject(new Error('READ')); };
      fr.readAsArrayBuffer(file);
    });
  }

  function isPdfName(file) {
    if (/\.pdf$/i.test(file.name || '')) return true;
    return file.type === 'application/pdf';
  }

  async function inspect(bytes) {
    var PDFLib = await loadLib();
    var doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    var pageSize = doc.getPageCount() ? doc.getPage(0).getSize() : { width: 595.28, height: 841.89 };
    var info = {
      pages: doc.getPageCount(),
      size: pageSize,
      encrypted: !!doc.isEncrypted,
      restrictedOnly: false
    };
    if (info.encrypted) {
      try {
        await PDFLib.PDFDocument.load(bytes, { password: '', updateMetadata: false });
        info.restrictedOnly = true;   // 열기 비밀번호는 없고 인쇄·복사 제한만 있는 문서
      } catch (e) { /* 열기 비밀번호가 있는 문서 */ }
    }
    return info;
  }

  async function acceptFile(tab, file) {
    if (!file) return;
    setMsg(tab, '', '');
    clearResult(tab);

    if (!isPdfName(file)) {
      setMsg(tab, 'err', 'PDF 파일만 사용할 수 있습니다. 확장자가 .pdf인 파일을 선택해 주세요.');
      return;
    }
    if (file.size > LIMIT_MB * 1024 * 1024) {
      setMsg(tab, 'err', '파일이 너무 큽니다. ' + LIMIT_MB + 'MB 이하의 PDF를 사용해 주세요. (현재 ' + fmtSize(file.size) + ')');
      return;
    }
    if (file.size === 0) {
      setMsg(tab, 'err', '빈 파일입니다. 다른 PDF를 선택해 주세요.');
      return;
    }

    setBusy(tab, true, '파일 확인 중…');
    try {
      var bytes = await readFile(file);
      var head = '';
      for (var i = 0; i < Math.min(5, bytes.length); i++) head += String.fromCharCode(bytes[i]);
      if (head.indexOf('%PDF') !== 0) throw new Error('NOT_PDF');
      var info = await inspect(bytes);

      st[tab].file = file;
      st[tab].bytes = bytes;
      st[tab].info = info;
      st[tab].tries = 0;
      st[tab].out = null;

      renderFile(tab);
      afterFile(tab);
    } catch (e) {
      resetFile(tab);
      if (e && e.message === 'LIB_LOAD') {
        setMsg(tab, 'err', '도구를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침해 주세요.');
      } else if (e && (e.message === 'NOT_PDF' || /PDF|parse|Invalid/i.test(e.name + ' ' + e.message))) {
        setMsg(tab, 'err', 'PDF를 읽지 못했습니다. 파일이 손상되었거나 PDF가 아닌 것 같습니다.');
      } else {
        setMsg(tab, 'err', 'PDF를 읽지 못했습니다. 파일이 손상되었는지 확인해 주세요.');
      }
    } finally {
      setBusy(tab, false);
    }
  }

  function afterFile(tab) {
    var s = st[tab];
    if (tab === 'unlock') {
      if (!s.info.encrypted) {
        setFlow('unlock', false);
        setMsg('unlock', 'info', '이 PDF에는 열기 비밀번호가 걸려 있지 않습니다.\n바로 사용하셔도 되고, 잠그고 싶다면 위의 [비밀번호 잠금] 탭을 눌러 주세요.');
        return;
      }
      setFlow('unlock', true);
      var pw = P('unlock', '[data-pw="unlock"]');
      pw.value = '';
      pw.classList.remove('bad');
      if (s.info.restrictedOnly) {
        setMsg('unlock', 'warn', '이 문서는 열 때 비밀번호는 없지만 인쇄·복사 제한이 걸려 있습니다.\n비밀번호 칸을 비워 둔 채 [비밀번호 해제하고 저장]을 누르면 제한이 풀린 사본이 만들어집니다.');
      } else {
        setMsg('unlock', '', '');
      }
      setTimeout(function () { try { pw.focus(); } catch (e) {} }, 60);
    } else {
      if (s.info.encrypted) {
        setFlow('lock', false);
        setMsg('lock', 'warn', '이미 비밀번호가 걸린 PDF입니다.\n[비밀번호 해제] 탭에서 암호를 먼저 푼 뒤 잠가 주세요.');
        return;
      }
      setFlow('lock', true);
      setMsg('lock', '', '');
      var p1 = P('lock', '[data-pw="lock"]');
      p1.value = '';
      P('lock', '[data-pw="lock2"]').value = '';
      setTimeout(function () { try { p1.focus(); } catch (e) {} }, 60);
    }
  }

  function resetFile(tab) {
    st[tab].file = null;
    st[tab].bytes = null;
    st[tab].info = null;
    st[tab].out = null;
    st[tab].tries = 0;
    var input = P(tab, '[data-input="{t}"]');
    if (input) input.value = '';
    var p1 = P(tab, '[data-pw="lock"]'), p2 = P(tab, '[data-pw="lock2"]'), pu = P(tab, '[data-pw="unlock"]');
    if (p1) p1.value = '';
    if (p2) p2.value = '';
    if (pu) { pu.value = ''; pu.classList.remove('bad'); }
    setFlow(tab, false);
    clearResult(tab);
    setProg(tab, null);
    setMsg(tab, '', '');
    renderFile(tab);
  }

  /* ──────────────────────── 실행: 해제 ──────────────────────── */

  async function runUnlock() {
    var s = st.unlock;
    if (st.busy || !s.file) return;
    var input = P('unlock', '[data-pw="unlock"]');
    var pw = input.value;
    input.classList.remove('bad');

    if (!pw && !s.info.restrictedOnly) {
      input.classList.add('bad');
      setMsg('unlock', 'err', 'PDF 열기 비밀번호를 입력해 주세요.');
      try { input.focus(); } catch (e) {}
      return;
    }

    st.tab = 'unlock';
    setMsg('unlock', '', '');
    clearResult('unlock');
    setBusy('unlock', true, '처리 중…');
    setProg('unlock', 6, 'PDF를 읽는 중');

    try {
      var PDFLib = await loadLib();
      setProg('unlock', 18, 'PDF 구조를 확인하는 중');
      await sleep(30);

      var doc;
      try {
        setProg('unlock', 38, '비밀번호를 확인하는 중');
        doc = await PDFLib.PDFDocument.load(s.bytes, { password: pw, updateMetadata: false });
      } catch (err) {
        var msg = String((err && err.message) || '');
        if (/password/i.test(msg)) {
          s.tries++;
          input.classList.add('bad');
          var extra = s.tries >= 3 ? '\n여러 번 틀렸다면 다른 비밀번호일 수 있습니다. PDF를 만든 곳에 확인해 보세요.' : '';
          setMsg('unlock', 'err', '비밀번호가 맞지 않습니다. 대소문자와 띄어쓰기를 확인해 주세요.' + extra);
          try { input.select(); } catch (e) {}
          return;
        }
        throw err;
      }

      var pages = doc.getPageCount();
      setProg('unlock', 62, pages + '페이지 문서를 다시 쓰는 중');
      await sleep(40);

      var out = await doc.save();
      setProg('unlock', 92, '마지막 확인 중');
      await sleep(40);

      var blob = new Blob([out], { type: 'application/pdf' });
      var name = safeName(baseName(s.file.name) + '_비밀번호해제') + '.pdf';
      setProg('unlock', 100, '완료');
      await sleep(120);
      setProg('unlock', null);

      showResult('unlock', '비밀번호를 해제했습니다',
        '이제 비밀번호 없이 열리는 사본입니다. 페이지 ' + pages + '장 · 텍스트와 그림 그대로 · ' + fmtSize(blob.size),
        name, blob);
    } catch (e) {
      setProg('unlock', null);
      var m = String((e && e.message) || '');
      if (m === 'LIB_LOAD' || (e && e.message === 'LIB_LOAD')) {
        setMsg('unlock', 'err', '도구를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침해 주세요.');
      } else if (/password/i.test(m)) {
        setMsg('unlock', 'err', '비밀번호가 맞지 않습니다. 대소문자와 띄어쓰기를 확인해 주세요.');
      } else {
        setMsg('unlock', 'err', '이 PDF의 비밀번호를 풀지 못했습니다. 파일이 손상되었거나 지원하지 않는 암호 방식일 수 있습니다.');
      }
    } finally {
      setBusy('unlock', false);
    }
  }

  /* ──────────────────────── 실행: 잠금 ──────────────────────── */

  async function runLock() {
    var s = st.lock;
    if (st.busy || !s.file) return;
    var p1 = P('lock', '[data-pw="lock"]');
    var p2 = P('lock', '[data-pw="lock2"]');
    var a = p1.value, b = p2.value;
    p1.classList.remove('bad');
    p2.classList.remove('bad');

    if (!a) {
      p1.classList.add('bad');
      setMsg('lock', 'err', '열기 비밀번호를 입력해 주세요.');
      try { p1.focus(); } catch (e) {}
      return;
    }
    if (a !== b) {
      p2.classList.add('bad');
      setMsg('lock', 'err', '비밀번호 확인이 일치하지 않습니다. 두 칸에 같은 비밀번호를 입력해 주세요.');
      try { p2.focus(); } catch (e) {}
      return;
    }

    st.tab = 'lock';
    setMsg('lock', '', '');
    clearResult('lock');
    setBusy('lock', true, '처리 중…');
    setProg('lock', 6, 'PDF를 읽는 중');

    try {
      var PDFLib = await loadLib();
      setProg('lock', 20, 'PDF 구조를 확인하는 중');
      await sleep(30);

      var doc;
      try {
        doc = await PDFLib.PDFDocument.load(s.bytes, { updateMetadata: false });
      } catch (err) {
        if (/encrypted/i.test(String(err && err.message))) {
          setMsg('lock', 'err', '이 PDF에는 이미 비밀번호가 걸려 있습니다. [비밀번호 해제] 탭에서 먼저 풀어 주세요.');
          setProg('lock', null);
          return;
        }
        throw err;
      }

      var allowPrint = P('lock', '[data-perm="print"]').checked;
      var allowCopy = P('lock', '[data-perm="copy"]').checked;
      var allowEdit = P('lock', '[data-perm="edit"]').checked;

      setProg('lock', 50, 'AES-256 암호를 설정하는 중');
      await sleep(40);
      doc.encrypt({
        userPassword: a,
        ownerPassword: a,
        algorithm: 'AES-256',
        permissions: {
          printing: allowPrint ? 'highResolution' : false,
          copying: allowCopy,
          modifying: allowEdit,
          annotating: allowEdit,
          fillingForms: true,
          contentAccessibility: true,
          documentAssembly: allowEdit
        }
      });

      setProg('lock', 74, doc.getPageCount() + '페이지 문서를 다시 쓰는 중');
      await sleep(40);

      var out = await doc.save();
      setProg('lock', 93, '마지막 확인 중');
      await sleep(40);

      var blob = new Blob([out], { type: 'application/pdf' });
      var name = safeName(baseName(s.file.name) + '_잠금') + '.pdf';
      setProg('lock', 100, '완료');
      await sleep(120);
      setProg('lock', null);

      var blocked = [];
      if (!allowPrint) blocked.push('인쇄');
      if (!allowCopy) blocked.push('복사');
      if (!allowEdit) blocked.push('편집');
      var desc = '이 파일은 열 때 비밀번호를 물어봅니다. AES-256 암호화 · 페이지 ' +
        doc.getPageCount() + '장 · ' + fmtSize(blob.size) +
        (blocked.length ? ' · 제한: ' + blocked.join('·') : ' · 모든 기능 허용');
      showResult('lock', '비밀번호를 걸어 저장할 준비가 됐습니다', desc, name, blob);
    } catch (e) {
      setProg('lock', null);
      if (e && e.message === 'LIB_LOAD') {
        setMsg('lock', 'err', '도구를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 새로고침해 주세요.');
      } else {
        setMsg('lock', 'err', 'PDF에 비밀번호를 걸지 못했습니다. 파일이 손상되었거나 지원하지 않는 형식일 수 있습니다.');
      }
    } finally {
      setBusy('lock', false);
    }
  }

  /* ──────────────────────── 이벤트 연결 ──────────────────────── */

  function switchTab(tab) {
    st.tab = tab;
    $$('.pw-tab', root).forEach(function (b) {
      var on = b.dataset.tab === tab;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $$('.pw-panel', root).forEach(function (p) {
      p.hidden = p.dataset.panel !== tab;
    });
  }

  function bindDrop(tab) {
    var drop = P(tab, '[data-drop="{t}"]');
    var input = P(tab, '[data-input="{t}"]');

    drop.addEventListener('click', function () { input.click(); });
    drop.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    input.addEventListener('change', function () {
      if (input.files && input.files[0]) acceptFile(tab, input.files[0]);
      input.value = '';
    });

    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) {
        e.preventDefault();
        e.stopPropagation();
        drop.classList.add('over');
      });
    });
    ['dragleave', 'dragend'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) {
        e.preventDefault();
        drop.classList.remove('over');
      });
    });
    drop.addEventListener('drop', function (e) {
      e.preventDefault();
      e.stopPropagation();
      drop.classList.remove('over');
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) acceptFile(tab, f);
    });

  }

  function bindTab(tab) {
    P(tab, '[data-reset="{t}"]').addEventListener('click', function () { resetFile(tab); });
    P(tab, '[data-go="{t}"]').addEventListener('click', function () {
      if (tab === 'unlock') runUnlock(); else runLock();
    });
    P(tab, '[data-dl="{t}"]').addEventListener('click', function () {
      var s = st[tab];
      if (s.out) download(s.out, s.outName);
    });
    P(tab, '[data-again="{t}"]').addEventListener('click', function () { resetFile(tab); });

    var eyes = $$('[data-eye="' + tab + '"], [data-eye="' + tab + '2"]', root);
    eyes.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var which = btn.dataset.eye;
        var inp = P(tab, '[data-pw="' + which + '"]');
        var show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        btn.textContent = show ? '🙈' : '👁';
        btn.setAttribute('aria-label', show ? '비밀번호 숨기기' : '비밀번호 보기');
      });
    });

    var primary = P(tab, '[data-pw="' + tab + '"]');
    if (primary) {
      primary.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); if (tab === 'unlock') runUnlock(); }
      });
      primary.addEventListener('input', function () {
        primary.classList.remove('bad');
        if (tab === 'unlock') setMsg('unlock', '', '');
      });
    }
    var confirmInput = P(tab, '[data-pw="' + tab + '2"]');
    if (confirmInput) {
      confirmInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); runLock(); }
      });
      confirmInput.addEventListener('input', function () {
        confirmInput.classList.remove('bad');
        setMsg('lock', '', '');
      });
    }
  }

  function mount() {
    var el = document.getElementById(ROOT_ID);
    if (!el || el.dataset.pwReady === '1') return;
    el.dataset.pwReady = '1';
    el.innerHTML = '';
    var style = document.createElement('style');
    style.textContent = CSS.replace(/#R/g, '#' + ROOT_ID);
    el.appendChild(style);

    var wrap = document.createElement('div');
    wrap.innerHTML = markup();
    root = wrap.firstChild;
    el.appendChild(root);

    $$('.pw-tab', root).forEach(function (b) {
      b.addEventListener('click', function () { switchTab(b.dataset.tab); });
      b.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchTab(b.dataset.tab); }
      });
    });

    bindDrop('unlock');
    bindDrop('lock');
    bindTab('unlock');
    bindTab('lock');

    // 도구 영역에 파일을 놓았을 때 브라우저가 파일을 새 창으로 여는 것 방지
    ['dragover', 'drop'].forEach(function (ev) {
      document.addEventListener(ev, function (e) {
        if (e.target && e.target.closest && e.target.closest('#' + ROOT_ID)) e.preventDefault();
      }, false);
    });

    // 미리 라이브러리를 조용히 준비 (실패해도 첫 파일 선택 때 다시 시도)
    if ('requestIdleCallback' in window) {
      requestIdleCallback(function () { loadLib().catch(function () {}); }, { timeout: 4000 });
    } else {
      setTimeout(function () { loadLib().catch(function () {}); }, 1800);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
