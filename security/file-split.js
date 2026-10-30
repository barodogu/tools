/*!
 * ============================================================
 * 모듈명   : barodogu.fileSplit
 * 관리 ID  : BD102
 * 파일     : security/file-split.js
 * 저장소   : https://github.com/barodogu/tools
 * CDN      : https://cdn.jsdelivr.net/gh/barodogu/tools@main/security/file-split.js
 * 사용 블로그: https://barodogu.blogspot.com/
 * 용도     : 대용량 파일 나누기·합치기
 *            - 카카오톡(290MB)·메일(20MB)·100MB·직접 입력 크기로 파일을 .001, .002… 조각으로 분할
 *            - 조각 파일을 번호순으로 합쳐 원본 복원, 빠진 조각·중복·섞인 조각 검사
 *            ※ 파일은 서버로 전송하지 않고 사용자 브라우저 안에서만 처리
 * 사용법   : 글에 <div id="barodogu-file-split"></div> 를 넣고
 *            이 파일을 <script src="…" defer></script> 로 불러오면 화면을 그립니다.
 * 버전     : 1.0.0
 * 최종수정 : 2026-10-30
 * ============================================================
 */
(function () {
  'use strict';

  var ROOT_ID = 'barodogu-file-split';
  var MB = 1024 * 1024;
  var PRESETS = [
    { label: '카카오톡', sub: '290MB', mb: 290 },
    { label: '메일 첨부', sub: '20MB', mb: 20 },
    { label: '100MB', sub: '조각당', mb: 100 },
    { label: '직접 입력', sub: 'MB 단위', mb: 0 }
  ];

  var CSS = [
    '#barodogu-file-split{--bd-ac:#2563eb;--bd-bg:#fff;--bd-fg:#1f2937;--bd-mu:#6b7280;--bd-bd:#e5e7eb;--bd-soft:#f3f4f6;color:var(--bd-fg);max-width:640px;margin:0 auto;line-height:1.5}',
    '#barodogu-file-split *{box-sizing:border-box}',
    '#barodogu-file-split .bd-tabs{display:flex;gap:6px;margin-bottom:12px}',
    '#barodogu-file-split .bd-tab{flex:1;padding:10px;border:1px solid var(--bd-bd);background:var(--bd-soft);border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;color:var(--bd-fg)}',
    '#barodogu-file-split .bd-tab.on{background:var(--bd-ac);border-color:var(--bd-ac);color:#fff}',
    '#barodogu-file-split .bd-card{border:1px solid var(--bd-bd);border-radius:12px;padding:16px;background:var(--bd-bg)}',
    '#barodogu-file-split .bd-drop{display:block;border:2px dashed var(--bd-bd);border-radius:10px;padding:22px 12px;text-align:center;cursor:pointer;color:var(--bd-mu)}',
    '#barodogu-file-split .bd-drop b{color:var(--bd-fg)}',
    '#barodogu-file-split .bd-drop.over{border-color:var(--bd-ac);background:#eff6ff}',
    '#barodogu-file-split .bd-drop input{display:none}',
    '#barodogu-file-split .bd-info{margin:10px 0;font-size:14px;word-break:break-all}',
    '#barodogu-file-split .bd-presets{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:12px 0}',
    '#barodogu-file-split .bd-pre{padding:8px 4px;border:1px solid var(--bd-bd);border-radius:8px;background:var(--bd-bg);cursor:pointer;font-size:13px;color:var(--bd-fg)}',
    '#barodogu-file-split .bd-pre small{display:block;color:var(--bd-mu)}',
    '#barodogu-file-split .bd-pre.on{border-color:var(--bd-ac);box-shadow:0 0 0 1px var(--bd-ac)}',
    '#barodogu-file-split .bd-custom{display:none;margin-bottom:12px;font-size:14px}',
    '#barodogu-file-split .bd-custom input{width:110px;padding:6px 8px;border:1px solid var(--bd-bd);border-radius:6px;font-size:15px}',
    '#barodogu-file-split .bd-btn{width:100%;padding:12px;border:0;border-radius:10px;background:var(--bd-ac);color:#fff;font-size:16px;font-weight:700;cursor:pointer}',
    '#barodogu-file-split .bd-btn:disabled{opacity:.4;cursor:default}',
    '#barodogu-file-split .bd-btn.sub{background:var(--bd-fg);margin-top:10px}',
    '#barodogu-file-split .bd-msg{margin-top:10px;font-size:14px}',
    '#barodogu-file-split .bd-msg.err{color:#dc2626}',
    '#barodogu-file-split .bd-msg.warn{color:#b45309}',
    '#barodogu-file-split .bd-msg.ok{color:#16a34a}',
    '#barodogu-file-split .bd-list{list-style:none;padding:0;margin:12px 0 0}',
    '#barodogu-file-split .bd-list li{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-top:1px solid var(--bd-bd);font-size:14px;margin:0}',
    '#barodogu-file-split .bd-list a{flex-shrink:0;padding:4px 10px;border-radius:6px;background:var(--bd-soft);color:var(--bd-ac);text-decoration:none;font-weight:600}',
    '#barodogu-file-split .bd-list .nm{word-break:break-all}',
    '#barodogu-file-split .bd-list small{color:var(--bd-mu)}',
    '#barodogu-file-split .bd-note{margin:12px 0 0;font-size:13px;color:var(--bd-mu)}'
  ].join('');

  var HTML =
    '<div class="bd-tabs">' +
      '<button type="button" class="bd-tab on" data-tab="split">✂️ 파일 나누기</button>' +
      '<button type="button" class="bd-tab" data-tab="merge">🧩 파일 합치기</button>' +
    '</div>' +
    '<div class="bd-card" data-panel="split">' +
      '<label class="bd-drop" data-drop="split"><input type="file" data-in="split">' +
        '<b>나눌 파일을 선택하거나 끌어다 놓으세요</b><br><small>파일은 서버로 전송되지 않고 내 기기에서만 처리돼요</small></label>' +
      '<div class="bd-info" data-info="split"></div>' +
      '<div class="bd-presets"></div>' +
      '<div class="bd-custom">조각 크기 <input type="number" min="1" step="1" value="50" data-custom> MB</div>' +
      '<button type="button" class="bd-btn" data-go="split" disabled>나누기</button>' +
      '<div class="bd-msg" data-msg="split"></div>' +
      '<ul class="bd-list" data-list="split"></ul>' +
      '<button type="button" class="bd-btn sub" data-all style="display:none">조각 전체 다운로드</button>' +
      '<p class="bd-note">조각을 모두 보낸 뒤, 받는 사람에게 이 페이지의 「파일 합치기」를 쓰라고 알려주세요. PC에서는 7-Zip의 「파일 합치기」로도 복원돼요.</p>' +
    '</div>' +
    '<div class="bd-card" data-panel="merge" style="display:none">' +
      '<label class="bd-drop" data-drop="merge"><input type="file" multiple data-in="merge">' +
        '<b>받은 조각 파일(.001, .002 …)을 모두 선택하세요</b><br><small>여러 개를 한 번에 선택하거나 끌어다 놓으면 돼요</small></label>' +
      '<div class="bd-info" data-info="merge"></div>' +
      '<button type="button" class="bd-btn" data-go="merge" disabled>합치기</button>' +
      '<div class="bd-msg" data-msg="merge"></div>' +
      '<ul class="bd-list" data-list="merge"></ul>' +
    '</div>';

  function fmt(b) {
    if (b < 1024) return b + ' B';
    if (b < MB) return (b / 1024).toFixed(1) + ' KB';
    if (b < 1024 * MB) return (b / MB).toFixed(1) + ' MB';
    return (b / (1024 * MB)).toFixed(2) + ' GB';
  }
  function pad(n) { var s = String(n); while (s.length < 3) s = '0' + s; return s; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }

  function init(root) {
    if (root.getAttribute('data-ready')) return;
    root.setAttribute('data-ready', '1');
    if (!document.getElementById('barodogu-file-split-css')) {
      var st = document.createElement('style');
      st.id = 'barodogu-file-split-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    root.innerHTML = HTML;

    function $(sel) { return root.querySelector(sel); }
    var urls = { split: [], merge: [] };
    function revoke(k) { urls[k].forEach(function (u) { URL.revokeObjectURL(u); }); urls[k] = []; }
    function msg(k, text, type) {
      var el = $('[data-msg="' + k + '"]');
      el.innerHTML = text || '';
      el.className = 'bd-msg' + (type ? ' ' + type : '');
    }
    function addRow(list, name, bytes, url) {
      var li = document.createElement('li');
      li.innerHTML = '<span class="nm">' + esc(name) + ' <small>(' + fmt(bytes) + ')</small></span>';
      var a = document.createElement('a');
      a.href = url; a.download = name; a.textContent = '다운로드';
      li.appendChild(a);
      list.appendChild(li);
      return a;
    }

    /* ---------- 나누기 ---------- */
    var splitFile = null, splitLinks = [];
    var preset = PRESETS[0];
    var presetBox = $('.bd-presets');
    PRESETS.forEach(function (p, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'bd-pre' + (i === 0 ? ' on' : '');
      b.innerHTML = esc(p.label) + '<small>' + esc(p.sub) + '</small>';
      b.addEventListener('click', function () {
        preset = p;
        each(presetBox.children, function (x) { x.classList.toggle('on', x === b); });
        $('.bd-custom').style.display = p.mb ? 'none' : 'block';
      });
      presetBox.appendChild(b);
    });
    function partBytes() {
      var mb = preset.mb || parseFloat($('[data-custom]').value);
      return mb > 0 ? Math.floor(mb * MB) : 0;
    }
    function clearSplit() {
      revoke('split');
      splitLinks = [];
      $('[data-list="split"]').innerHTML = '';
      $('[data-all]').style.display = 'none';
      msg('split', '');
    }

    /* ---------- 합치기 ---------- */
    var mergeFiles = null, mergeName = '';
    function clearMerge() {
      revoke('merge');
      mergeFiles = null;
      $('[data-list="merge"]').innerHTML = '';
      $('[data-go="merge"]').disabled = true;
      msg('merge', '');
    }

    var handlers = {
      split: function (fs) {
        splitFile = fs[0];
        $('[data-info="split"]').innerHTML = '📄 <b>' + esc(splitFile.name) + '</b> (' + fmt(splitFile.size) + ')';
        $('[data-go="split"]').disabled = false;
        clearSplit();
      },
      merge: function (fs) {
        clearMerge();
        var re = /^(.*)\.(\d{3,})$/;
        var parts = [], ignored = [];
        fs.forEach(function (f) {
          var m = re.exec(f.name);
          if (m) parts.push({ f: f, base: m[1], n: parseInt(m[2], 10) });
          else ignored.push(f.name);
        });
        var info = $('[data-info="merge"]');
        if (!parts.length) {
          info.innerHTML = '';
          msg('merge', '.001, .002처럼 번호가 붙은 조각 파일을 선택해 주세요.', 'err');
          return;
        }
        parts.sort(function (a, b) { return a.n - b.n; });

        var errs = [], warns = [];
        var have = {}, dup = false, total = 0, bases = {};
        parts.forEach(function (p) {
          if (have[p.n]) dup = true;
          have[p.n] = 1;
          total += p.f.size;
          bases[p.base] = 1;
        });
        var missing = [];
        for (var n = 1; n <= parts[parts.length - 1].n; n++) if (!have[n]) missing.push(pad(n));
        if (dup) errs.push('같은 번호의 조각이 두 번 선택됐어요.');
        if (missing.length) errs.push('빠진 조각이 있어요: ' + missing.join(', '));
        var first = parts[0].f.size;
        for (var i = 1; i < parts.length - 1; i++) {
          if (parts[i].f.size !== first) { errs.push('조각 크기가 서로 달라요. 다른 파일의 조각이 섞였을 수 있어요.'); break; }
        }
        if (parts.length > 1 && parts[parts.length - 1].f.size > first) errs.push('마지막 조각이 앞 조각보다 커요. 다른 파일의 조각이 섞였을 수 있어요.');
        if (Object.keys(bases).length > 1) warns.push('파일 이름이 서로 다른 조각이 있어요. 같은 파일의 조각인지 확인해 주세요.');
        if (ignored.length) warns.push('번호가 없는 파일은 제외했어요: ' + ignored.map(esc).join(', '));
        if (!errs.length && parts.length > 1 && parts[parts.length - 1].f.size === first) {
          warns.push('모든 조각 크기가 같아요. 마지막 조각을 빠뜨리지 않았는지 확인해 주세요.');
        }

        mergeName = parts[0].base;
        info.innerHTML = '🧩 복원될 파일: <b>' + esc(mergeName) + '</b><br>조각 ' + parts.length + '개 · 합계 ' + fmt(total);
        if (errs.length) {
          msg('merge', errs.concat(warns).join('<br>'), 'err');
          return;
        }
        if (warns.length) msg('merge', warns.join('<br>'), 'warn');
        mergeFiles = parts.map(function (p) { return p.f; });
        $('[data-go="merge"]').disabled = false;
      }
    };

    /* ---------- 탭 ---------- */
    each(root.querySelectorAll('.bd-tab'), function (t) {
      t.addEventListener('click', function () {
        each(root.querySelectorAll('.bd-tab'), function (x) { x.classList.toggle('on', x === t); });
        var tab = t.getAttribute('data-tab');
        $('[data-panel="split"]').style.display = tab === 'split' ? '' : 'none';
        $('[data-panel="merge"]').style.display = tab === 'merge' ? '' : 'none';
      });
    });

    /* ---------- 파일 선택·드래그 ---------- */
    ['split', 'merge'].forEach(function (k) {
      var drop = $('[data-drop="' + k + '"]'), input = $('[data-in="' + k + '"]');
      drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
      drop.addEventListener('drop', function (e) {
        e.preventDefault();
        drop.classList.remove('over');
        var fs = Array.prototype.slice.call(e.dataTransfer.files);
        if (fs.length) handlers[k](fs);
      });
      input.addEventListener('change', function () {
        var fs = Array.prototype.slice.call(input.files);
        if (fs.length) handlers[k](fs);
        input.value = '';
      });
    });

    /* ---------- 나누기 실행 ---------- */
    $('[data-go="split"]').addEventListener('click', function () {
      if (!splitFile) return;
      var size = partBytes();
      if (!size) { msg('split', '조각 크기를 올바르게 입력해 주세요.', 'err'); return; }
      clearSplit();
      if (splitFile.size <= size) {
        msg('split', '파일이 이미 ' + fmt(size) + ' 이하라서 나눌 필요가 없어요. 그대로 보내면 됩니다.', 'ok');
        return;
      }
      var count = Math.ceil(splitFile.size / size);
      if (count > 999) { msg('split', '조각이 ' + count + '개로 너무 많아요. 조각 크기를 키워 주세요.', 'err'); return; }
      var list = $('[data-list="split"]');
      for (var i = 0; i < count; i++) {
        var start = i * size, end = Math.min(start + size, splitFile.size);
        var blob = splitFile.slice(start, end); // 메모리에 복사하지 않는 참조
        var url = URL.createObjectURL(blob);
        urls.split.push(url);
        splitLinks.push(addRow(list, splitFile.name + '.' + pad(i + 1), end - start, url));
      }
      msg('split', count + '개 조각으로 나눴어요. 하나씩 다운로드하거나 전체 다운로드를 눌러 주세요.', 'ok');
      $('[data-all]').style.display = 'block';
    });

    $('[data-all]').addEventListener('click', function () {
      var btn = this;
      btn.disabled = true;
      splitLinks.forEach(function (a, i) {
        setTimeout(function () {
          a.click();
          if (i === splitLinks.length - 1) btn.disabled = false;
        }, i * 1200);
      });
    });

    /* ---------- 합치기 실행 ---------- */
    $('[data-go="merge"]').addEventListener('click', function () {
      if (!mergeFiles) return;
      revoke('merge');
      var blob = new Blob(mergeFiles, { type: 'application/octet-stream' });
      var url = URL.createObjectURL(blob);
      urls.merge.push(url);
      var list = $('[data-list="merge"]');
      list.innerHTML = '';
      addRow(list, mergeName, blob.size, url).click();
      msg('merge', '합치기 완료! 다운로드가 시작되지 않으면 아래 버튼을 눌러 주세요.', 'ok');
    });
  }

  function boot() {
    var el = document.getElementById(ROOT_ID);
    if (el) init(el);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
