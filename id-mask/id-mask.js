/*! 바로도구 신분증 가림 도구 v0.1 (1단계 MVP)
 *  모든 처리는 브라우저 안에서만 이루어지며, 사진은 어디에도 전송·저장되지 않습니다.
 *  https://github.com/barodogu/tools
 */
(function () {
  'use strict';

  var MAX_SIDE = 2400; // 처리 해상도 상한(긴 변, px)
  var HANDLE = 22;     // 크기 조절 손잡이 크기(화면 기준 px)
  var MIN_BOX = 10;    // 최소 상자 크기(화면 기준 px)

  var root = document.getElementById('idmask-app');
  if (!root) return;

  root.innerHTML =
    '<div class="idm">' +
      '<div class="idm-drop" data-ref="drop">' +
        '<p class="idm-drop-title">신분증 사진을 선택하세요</p>' +
        '<p class="idm-drop-sub">사진은 이 기기 밖으로 전송되지 않습니다</p>' +
        '<label class="idm-btn idm-btn-primary">사진 선택' +
          '<input type="file" accept="image/*" class="idm-hidden" data-ref="file">' +
        '</label>' +
      '</div>' +
      '<div class="idm-work" data-ref="work" hidden>' +
        '<p class="idm-help">가릴 부분을 끌어서 상자를 그리세요. 상자를 누르면 선택되고, 끌면 이동, 빨간 모서리를 끌면 크기가 바뀝니다.</p>' +
        '<div class="idm-canvas-wrap"><canvas class="idm-canvas" data-ref="canvas"></canvas></div>' +
        '<div class="idm-row">' +
          '<button type="button" class="idm-btn" data-act="del" disabled>선택 상자 삭제</button>' +
          '<button type="button" class="idm-btn" data-act="clear">상자 모두 지우기</button>' +
        '</div>' +
        '<div class="idm-row">' +
          '<select class="idm-select" data-ref="fmt">' +
            '<option value="image/jpeg">JPG로 저장</option>' +
            '<option value="image/png">PNG로 저장</option>' +
          '</select>' +
          '<button type="button" class="idm-btn idm-btn-primary" data-act="save">가림 이미지 저장</button>' +
        '</div>' +
        '<div class="idm-row">' +
          '<button type="button" class="idm-btn idm-btn-ghost" data-act="reset">처음부터 (사진 지우기)</button>' +
        '</div>' +
        '<p class="idm-status" data-ref="status" role="status" aria-live="polite"></p>' +
      '</div>' +
    '</div>';

  function $(name) { return root.querySelector('[data-ref="' + name + '"]'); }
  function act(name) { return root.querySelector('[data-act="' + name + '"]'); }

  var drop = $('drop'), work = $('work'), fileInput = $('file');
  var canvas = $('canvas'), ctx = canvas.getContext('2d');
  var fmtSel = $('fmt'), statusEl = $('status'), delBtn = act('del');

  var base = null;   // 축소·평면화된 원본 (캔버스)
  var boxes = [];    // {x, y, w, h} — 이미지 픽셀 좌표
  var sel = -1;      // 선택된 상자 번호
  var drag = null;   // 진행 중인 끌기 동작

  function status(msg) { statusEl.textContent = msg || ''; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function copy(b) { return { x: b.x, y: b.y, w: b.w, h: b.h }; }

  // 화면 1px이 이미지 몇 px인지
  function scale() {
    var w = canvas.getBoundingClientRect().width;
    return w > 0 ? canvas.width / w : 1;
  }

  function toImg(e) {
    var r = canvas.getBoundingClientRect();
    var k = canvas.width / r.width;
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k, k: k };
  }

  // ---------- 불러오기 ----------
  function loadFile(file) {
    if (!file) return;
    if (file.type && !/^image\//.test(file.type)) {
      status('이미지 파일만 사용할 수 있습니다.');
      return;
    }
    var url = URL.createObjectURL(file);
    var im = new Image();
    im.onload = function () {
      var s = Math.min(1, MAX_SIDE / Math.max(im.naturalWidth, im.naturalHeight));
      var c = document.createElement('canvas');
      c.width = Math.round(im.naturalWidth * s);
      c.height = Math.round(im.naturalHeight * s);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      im.src = '';

      base = c;
      boxes = [];
      sel = -1;
      canvas.width = c.width;
      canvas.height = c.height;
      drop.hidden = true;
      work.hidden = false;
      status('');
      update();
    };
    im.onerror = function () {
      URL.revokeObjectURL(url);
      status('이 사진 형식은 열 수 없습니다. HEIC 사진이라면 JPG로 바꿔서 올려주세요.');
    };
    im.src = url;
  }

  fileInput.addEventListener('change', function () {
    loadFile(fileInput.files && fileInput.files[0]);
  });

  drop.addEventListener('dragover', function (e) {
    e.preventDefault();
    drop.classList.add('idm-drop-on');
  });
  drop.addEventListener('dragleave', function () { drop.classList.remove('idm-drop-on'); });
  drop.addEventListener('drop', function (e) {
    e.preventDefault();
    drop.classList.remove('idm-drop-on');
    loadFile(e.dataTransfer.files && e.dataTransfer.files[0]);
  });

  // ---------- 그리기 ----------
  function render() {
    if (!base) return;
    var k = scale();
    ctx.drawImage(base, 0, 0);
    ctx.fillStyle = '#000';
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }
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

  function update() {
    delBtn.disabled = sel < 0;
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

  // ---------- 끌기 (마우스·터치 공통) ----------
  canvas.addEventListener('pointerdown', function (e) {
    if (!base) return;
    e.preventDefault();
    var p = toImg(e);
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }

    if (onHandle(p)) {
      drag = { mode: 'resize', sx: p.x, sy: p.y, o: copy(boxes[sel]) };
    } else {
      var hit = hitTest(p.x, p.y);
      if (hit >= 0) {
        sel = hit;
        drag = { mode: 'move', sx: p.x, sy: p.y, o: copy(boxes[hit]) };
      } else {
        boxes.push({ x: p.x, y: p.y, w: 0, h: 0 });
        sel = boxes.length - 1;
        drag = { mode: 'draw', sx: p.x, sy: p.y };
      }
    }
    update();
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!drag) return;
    e.preventDefault();
    var p = toImg(e), W = canvas.width, H = canvas.height;
    var b = boxes[sel], dx = p.x - drag.sx, dy = p.y - drag.sy;
    var x = clamp(p.x, 0, W), y = clamp(p.y, 0, H);

    if (drag.mode === 'draw') {
      b.x = Math.min(drag.sx, x);
      b.y = Math.min(drag.sy, y);
      b.w = Math.abs(x - drag.sx);
      b.h = Math.abs(y - drag.sy);
    } else if (drag.mode === 'move') {
      b.x = clamp(drag.o.x + dx, 0, W - b.w);
      b.y = clamp(drag.o.y + dy, 0, H - b.h);
    } else if (drag.mode === 'resize') {
      var m = MIN_BOX * p.k;
      b.w = clamp(drag.o.w + dx, m, W - b.x);
      b.h = clamp(drag.o.h + dy, m, H - b.y);
    }
    render();
  });

  function endDrag() {
    if (!drag) return;
    if (drag.mode === 'draw') {
      var b = boxes[sel], m = MIN_BOX * scale();
      if (b.w < m || b.h < m) { // 너무 작으면 그냥 '탭'으로 보고 선택 해제
        boxes.splice(sel, 1);
        sel = -1;
      }
    }
    drag = null;
    update();
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  window.addEventListener('resize', render);

  document.addEventListener('keydown', function (e) {
    if (!base || sel < 0 || work.hidden) return;
    var tag = (e.target && e.target.tagName) || '';
    if (/INPUT|SELECT|TEXTAREA/.test(tag)) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeSelected();
    }
  });

  // ---------- 버튼 ----------
  function removeSelected() {
    if (sel < 0) return;
    boxes.splice(sel, 1);
    sel = -1;
    update();
  }
  delBtn.addEventListener('click', removeSelected);

  act('clear').addEventListener('click', function () {
    boxes = [];
    sel = -1;
    update();
  });

  act('save').addEventListener('click', function () {
    if (!base) return;
    if (!boxes.length && !window.confirm('가림 상자가 없습니다. 그대로 저장할까요?')) return;

    var fmt = fmtSel.value;
    var out = document.createElement('canvas');
    out.width = base.width;
    out.height = base.height;
    var c = out.getContext('2d');
    if (fmt === 'image/jpeg') { // JPG는 투명 영역이 없으므로 흰 바탕
      c.fillStyle = '#fff';
      c.fillRect(0, 0, out.width, out.height);
    }
    c.drawImage(base, 0, 0);
    c.fillStyle = '#000';
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      var x0 = Math.floor(b.x), y0 = Math.floor(b.y);
      c.fillRect(x0, y0, Math.ceil(b.x + b.w) - x0, Math.ceil(b.y + b.h) - y0);
    }

    out.toBlob(function (blob) {
      out.width = out.height = 0;
      if (!blob) { status('저장에 실패했습니다. 다른 형식으로 다시 시도해 주세요.'); return; }
      var u = URL.createObjectURL(blob);
      var a = document.createElement('a');
      var d = new Date();
      var stamp = d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) +
        '_' + ('0' + d.getHours()).slice(-2) + ('0' + d.getMinutes()).slice(-2);
      a.href = u;
      a.download = '신분증_가림_' + stamp + (fmt === 'image/png' ? '.png' : '.jpg');
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(u); }, 1500);
      status('저장했습니다. 저장된 파일에는 촬영 위치 등 사진 정보(EXIF)가 들어 있지 않습니다.');
    }, fmt, 0.92);
  });

  act('reset').addEventListener('click', function () {
    if (base) { base.width = base.height = 0; }
    base = null;
    boxes = [];
    sel = -1;
    drag = null;
    canvas.width = canvas.height = 0;
    fileInput.value = '';
    work.hidden = true;
    drop.hidden = false;
    status('');
  });
})();