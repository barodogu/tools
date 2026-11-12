/* ============================================================================
 * 착착도구 — 투명 전자서명 만들기 · PDF 서명 넣기
 * ----------------------------------------------------------------------------
 * · 서명 만들기 : (A) 종이 서명·도장 사진의 흰 배경을 투명하게 지우기
 *                 (B) 화면에 마우스/손가락으로 서명 그리기
 * · PDF 서명    : pdf.js로 PDF를 화면에 렌더링 → 서명 드래그·리사이즈 배치
 *                 → pdf-lib로 원본 PDF에 정확한 좌표로 합성해 다운로드
 * · 모든 처리는 브라우저 안에서만 이루어집니다. (서버 전송 없음)
 * ========================================================================== */
(function () {
  'use strict';

  /* ──────────────────────────── 0. 공통 유틸 ──────────────────────────── */

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  const state = {
    tab: 'make',
    mode: 'photo',

    // 서명 결과
    sigCanvas: null,        // 여백을 잘라낸 최종 서명 캔버스
    sigDataUrl: null,       // 위 캔버스의 PNG dataURL
    sigAspect: 1,

    // 사진 모드
    photoBase: null,        // 업로드 사진(축소본) 캔버스
    photoOut: null,         // 투명화 처리 결과 캔버스
    threshold: 205,
    softness: 45,
    strength: 100,
    inkMode: 'keep',

    // 그리기 모드
    strokes: [],
    liveStroke: null,
    color: '#141414',
    penWidth: 6,

    // PDF
    pdfBytes: null,         // pdf-lib에 넘길 원본 바이트
    pdfDoc: null,           // pdf.js 문서
    pdfName: '계약서',
    pageNum: 1,
    pageCount: 0,
    vpCache: new Map(),     // pageNum → scale:1 viewport
    placements: [],
    selectedId: null,
    renderTask: null,
    fitScale: 1
  };

  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-on'), 2600);
  }

  function setBusy(on) {
    const el = $('#busy');
    if (el) el.classList.toggle('is-on', !!on);
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function dataUrlToBytes(dataUrl) {
    const base64 = dataUrl.split(',')[1];
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  /* 이미지 파일 → 캔버스 (EXIF 회전 반영, 최대 변 1400px로 축소) */
  async function fileToCanvas(file, maxSide) {
    const limit = maxSide || 1400;
    let bmp = null;
    try {
      if ('createImageBitmap' in window) {
        try {
          bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
        } catch (_) {
          bmp = await createImageBitmap(file);
        }
      }
    } catch (_) { bmp = null; }

    if (!bmp) {
      bmp = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('image decode failed'));
        img.src = URL.createObjectURL(file);
      });
    }

    const w = bmp.width, h = bmp.height;
    const k = Math.min(1, limit / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * k));
    canvas.height = Math.max(1, Math.round(h * k));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    if (bmp.close) bmp.close();
    return canvas;
  }

  /* 알파값을 보고 여백을 잘라낸 캔버스를 돌려준다 */
  function trimCanvas(canvas, padRatio) {
    const w = canvas.width, h = canvas.height;
    const data = canvas.getContext('2d', { willReadFrequently: true })
      .getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      const row = y * w * 4;
      for (let x = 0; x < w; x++) {
        if (data[row + x * 4 + 3] > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;                       // 완전히 비어 있음
    const pad = Math.round(Math.max(w, h) * (padRatio == null ? 0.015 : padRatio));
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
    const out = document.createElement('canvas');
    out.width = maxX - minX + 1;
    out.height = maxY - minY + 1;
    out.getContext('2d').drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  }

  /* ──────────────────────────── 1. 탭 / 모드 전환 ──────────────────────────── */

  function switchTab(name) {
    state.tab = name;
    $$('.tab').forEach(btn => {
      const on = btn.dataset.tab === name;
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $('#panel-make').classList.toggle('is-active', name === 'make');
    $('#panel-sign').classList.toggle('is-active', name === 'sign');
    if (name === 'sign' && state.pdfDoc) {
      // PDF가 이미 열려 있으면 현재 페이지 기준으로 다시 그려 준다
      renderPlacements();
    }
  }

  function switchMode(mode) {
    state.mode = mode;
    $$('.seg button').forEach(b => b.setAttribute('aria-selected', b.dataset.mode === mode ? 'true' : 'false'));
    $('#pane-photo').classList.toggle('is-active', mode === 'photo');
    $('#pane-draw').classList.toggle('is-active', mode === 'draw');
    if (mode === 'photo' && state.photoOut) buildSignature();
    else if (mode === 'draw' && state.strokes.length) buildSignature();
  }

  /* ──────────────────────────── 2. 사진 모드 ──────────────────────────── */

  const photo = {
    canvas: null,
    ctx: null,
    raw: null,     // 원본 ImageData (한 번만 읽는다)
    out: null,     // 결과 ImageData
    raf: 0
  };

  function photoInit(canvasEl) {
    photo.canvas = canvasEl;
    photo.ctx = canvasEl.getContext('2d', { willReadFrequently: true });
  }

  async function photoLoad(file) {
    let canvas;
    try {
      canvas = await fileToCanvas(file, 1400);
    } catch (e) {
      toast('사진을 열 수 없어요. JPG·PNG 사진으로 다시 시도해 주세요.');
      return;
    }
    // 원본 픽셀 보관
    const base = document.createElement('canvas');
    base.width = canvas.width;
    base.height = canvas.height;
    base.getContext('2d').drawImage(canvas, 0, 0);
    state.photoBase = base;

    photo.canvas.width = canvas.width;
    photo.canvas.height = canvas.height;
    photo.raw = base.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, base.width, base.height);
    photo.out = photo.ctx.createImageData(base.width, base.height);

    $('#photoEditor').hidden = false;
    $('#photoDrop').hidden = true;
    applyAutoThreshold(true);         // 첫 로드 때 자동으로 한 번 맞춰 준다
    photoProcess();
    toast('사진을 불러왔어요. 슬라이더로 배경을 다듬어 보세요.');
  }

  const INK_COLORS = { black: [20, 20, 20], blue: [27, 69, 215], red: [217, 43, 43] };

  /* 임계값(th)은 "밝기 기준선". th보다 밝은 픽셀은 투명해진다. */
  function levelToThreshold(level) { return 250 - (level / 100) * 130; }
  function thresholdToLevel(th) { return Math.round(((250 - th) / 130) * 100); }

  function photoProcess() {
    if (!photo.raw) return;
    const src = photo.raw.data;
    const out = photo.out;
    const dst = out.data;
    const T = state.threshold;
    const S = Math.max(2, state.softness);
    const K = state.strength / 100;
    const invK = 1 / K;
    const tint = state.inkMode === 'keep' ? null : INK_COLORS[state.inkMode];

    for (let i = 0; i < src.length; i += 4) {
      const r = src[i], g = src[i + 1], b = src[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      let a = (T - lum) / S;
      a = a <= 0 ? 0 : (a >= 1 ? 1 : a);
      if (a > 0 && K !== 1) a = Math.pow(a, invK);      // 잉크 진하기
      a = a * (src[i + 3] / 255);

      if (tint) {
        dst[i] = tint[0]; dst[i + 1] = tint[1]; dst[i + 2] = tint[2];
      } else {
        dst[i] = r; dst[i + 1] = g; dst[i + 2] = b;
      }
      dst[i + 3] = Math.round(a * 255);
    }
    photo.ctx.putImageData(out, 0, 0);

    // 결과 캔버스 (여백 제외 전) 보관
    if (!state.photoOut) {
      state.photoOut = document.createElement('canvas');
      state.photoOutCtx = state.photoOut.getContext('2d', { willReadFrequently: true });
    }
    state.photoOut.width = photo.canvas.width;
    state.photoOut.height = photo.canvas.height;
    state.photoOutCtx.drawImage(photo.canvas, 0, 0);

    scheduleResult();
  }

  function photoSchedule() {
    if (photo.raf) return;
    photo.raf = requestAnimationFrame(() => {
      photo.raf = 0;
      photoProcess();
    });
  }

  /* Otsu 방법으로 잉크/종이 경계를 자동 추정 */
  function applyAutoThreshold(silent) {
    if (!photo.raw) return;
    const data = photo.raw.data;
    const hist = new Array(256).fill(0);
    let total = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 20) continue;
      const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      hist[lum]++; total++;
    }
    if (!total) return;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, best = 0, bestVar = -1;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (!wB) continue;
      const wF = total - wB;
      if (!wF) break;
      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const v = wB * wF * (mB - mF) * (mB - mF);
      if (v > bestVar) { bestVar = v; best = t; }
    }
    // 종이(밝은 쪽)와 잉크 경계의 살짝 위쪽을 기준선으로
    const th = clamp(best + 18, 150, 238);
    state.threshold = Math.round(th);
    state.softness = clamp(Math.round(th * 0.22), 8, 72);
    syncPhotoControls();
    if (!silent) toast('사진에 맞춰 자동으로 맞췄어요. 마음에 안 들면 슬라이더로 조정하세요.');
  }

  function syncPhotoControls() {
    $('#tThreshold').value = thresholdToLevel(state.threshold);
    $('#vThreshold').textContent = $('#tThreshold').value + '%';
    $('#tSoftness').value = state.softness;
    $('#vSoftness').textContent = state.softness;
    $('#tStrength').value = state.strength;
    $('#vStrength').textContent = state.strength + '%';
    $('#inkMode').value = state.inkMode;
  }

  function resetPhotoControls() {
    state.threshold = 205;
    state.softness = 45;
    state.strength = 100;
    state.inkMode = 'keep';
    syncPhotoControls();
    photoProcess();
  }

  /* ──────────────────────────── 3. 그리기 모드 ──────────────────────────── */

  const draw = {
    canvas: null,
    ctx: null,
    dprScale: 1,      // 캔버스 내부 좌표 / CSS 픽셀
    raf: 0,
    active: false
  };

  function drawInit(canvasEl) {
    draw.canvas = canvasEl;
    draw.ctx = canvasEl.getContext('2d', { willReadFrequently: true });
    drawRender();

    const toCanvasPoint = ev => {
      const rect = draw.canvas.getBoundingClientRect();
      return {
        x: (ev.clientX - rect.left) * (draw.canvas.width / rect.width),
        y: (ev.clientY - rect.top) * (draw.canvas.height / rect.height)
      };
    };

    draw.canvas.addEventListener('pointerdown', ev => {
      if (ev.button !== undefined && ev.button > 0) return;
      ev.preventDefault();
      draw.canvas.setPointerCapture(ev.pointerId);
      const p = toCanvasPoint(ev);
      draw.active = true;
      state.liveStroke = { color: state.color, width: state.penWidth, points: [p] };
      drawSchedule();
    });

    draw.canvas.addEventListener('pointermove', ev => {
      if (!draw.active || !state.liveStroke) return;
      ev.preventDefault();
      const p = toCanvasPoint(ev);
      const pts = state.liveStroke.points;
      const last = pts[pts.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) < 1.2) return;
      pts.push(p);
      drawSchedule();
    });

    const end = ev => {
      if (!draw.active) return;
      draw.active = false;
      if (state.liveStroke) {
        state.strokes.push(normalizeStroke(state.liveStroke));
        state.liveStroke = null;
      }
      try { draw.canvas.releasePointerCapture(ev.pointerId); } catch (_) {}
      drawSchedule();
      updateDrawState();
      scheduleResult();
    };
    draw.canvas.addEventListener('pointerup', end);
    draw.canvas.addEventListener('pointercancel', end);
    draw.canvas.addEventListener('pointerleave', ev => { if (ev.buttons === 0) end(ev); });
  }

  // 펜 굵기는 캔버스 폭 1400 기준으로 저장 → 화면 크기와 무관하게 동일한 결과
  function normalizeStroke(stroke) {
    return { color: stroke.color, width: stroke.width, points: stroke.points.map(p => ({ x: p.x, y: p.y })) };
  }

  function drawSchedule() {
    if (draw.raf) return;
    draw.raf = requestAnimationFrame(() => { draw.raf = 0; drawRender(); });
  }

  function strokePath(ctx, stroke) {
    const pts = stroke.points;
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, stroke.width / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }

  function drawRender() {
    const ctx = draw.ctx;
    ctx.clearRect(0, 0, draw.canvas.width, draw.canvas.height);
    for (const s of state.strokes) strokePath(ctx, s);
    if (state.liveStroke) strokePath(ctx, state.liveStroke);
  }

  function updateDrawState() {
    const n = state.strokes.length;
    $('#drawState').textContent = n ? '획 ' + n + '개' : '아직 그린 게 없어요';
    $('#btnUndo').disabled = n === 0;
    $('#btnClear').disabled = n === 0;
  }

  /* ──────────────────────────── 4. 서명 결과물 만들기 ──────────────────────────── */

  let resultTimer = null;
  function scheduleResult() {
    clearTimeout(resultTimer);
    resultTimer = setTimeout(buildSignature, 200);
  }

  function buildSignature() {
    let source = null;
    if (state.mode === 'photo') {
      if (!state.photoOut) return;
      source = state.photoOut;
    } else {
      if (!state.strokes.length) { clearSignature(); return; }
      source = draw.canvas;
    }

    const trimmed = trimCanvas(source, 0.015);
    if (!trimmed) { clearSignature(); return; }

    const prevSrc = state.sigDataUrl;
    state.sigCanvas = trimmed;
    state.sigAspect = trimmed.width / trimmed.height;
    state.sigDataUrl = trimmed.toDataURL('image/png');

    const img = $('#sigPreviewImg');
    img.src = state.sigDataUrl;
    $('#sigPreviewBox').classList.add('has');
    $('#sigMeta').textContent = trimmed.width + ' × ' + trimmed.height + 'px · 투명 PNG';
    $('#btnDownloadPng').disabled = false;
    $('#btnUseInPdf').disabled = false;
    $('#btnAddSig').disabled = false;
    $('#btnCopyAll').disabled = state.placements.length === 0;

    // 새 서명을 만들면 이미 놓인 서명들도 같은 모양으로 바꿔 준다 (방금 만든 서명을 이어서 쓰는 흐름)
    if (prevSrc && prevSrc !== state.sigDataUrl && state.placements.length) {
      state.placements = state.placements.map(p => ({ ...p, src: state.sigDataUrl, aspect: state.sigAspect }));
      if (state.pdfDoc) renderPlacements();
    }
  }

  function clearSignature() {
    state.sigCanvas = null;
    state.sigDataUrl = null;
    $('#sigPreviewBox').classList.remove('has');
    $('#sigPreviewImg').removeAttribute('src');
    $('#sigMeta').textContent = '아직 서명이 없어요';
    $('#btnDownloadPng').disabled = true;
    $('#btnUseInPdf').disabled = true;
    $('#btnAddSig').disabled = true;
    $('#btnCopyAll').disabled = state.placements.length === 0;
  }

  async function downloadPng() {
    if (!state.sigCanvas) return toast('먼저 서명을 만들어 주세요.');
    const blob = await new Promise(res => state.sigCanvas.toBlob(res, 'image/png'));
    if (!blob) return toast('이미지를 저장하지 못했어요. 다시 시도해 주세요.');
    download(blob, '전자서명_투명배경.png');
    toast('투명 PNG로 저장했어요. 한글·워드에도 붙여넣을 수 있어요.');
  }

  /* ──────────────────────────── 5. PDF 불러오기 · 페이지 렌더링 ──────────────────────────── */

  async function loadPdf(file) {
    if (!window.pdfjsLib) { toast('PDF 도구를 불러오지 못했어요. 새로고침해 주세요.'); return; }
    setBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      state.pdfBytes = new Uint8Array(buffer.slice(0));      // pdf-lib용 사본
      const task = window.pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
      const doc = await task.promise;

      if (state.pdfDoc) { try { state.pdfDoc.destroy(); } catch (_) {} }
      state.pdfDoc = doc;
      state.pageCount = doc.numPages;
      state.pageNum = 1;
      state.placements = [];
      state.selectedId = null;
      state.vpCache.clear();
      state.pdfName = (file.name || '계약서').replace(/\.pdf$/i, '') || '계약서';

      $('#pdfDrop').hidden = true;
      $('#pdfEmpty').hidden = true;
      $('#pdfViewer').hidden = false;
      $('#pageTotal').textContent = doc.numPages;
      $('#pdfMeta').textContent = state.pdfName + ' · ' + doc.numPages + '쪽 · ' + (file.size / 1024 / 1024).toFixed(1) + 'MB';

      await renderPage();
      updateToolbar();

      // 이미 만들어 둔 서명이 있으면 첫 페이지에 바로 얹어 준다
      if (state.sigDataUrl) {
        addPlacement();
        toast('서명을 PDF 위에 올렸어요. 끌어서 위치를 맞춰 보세요.');
      } else {
        toast('PDF를 열었어요. 1번 단계에서 서명을 먼저 만들어 주세요.');
      }
    } catch (e) {
      console.error(e);
      if (e && (e.name === 'PasswordException' || /password/i.test(e.message || ''))) {
        toast('비밀번호가 걸린 PDF예요. 암호를 푼 뒤 다시 시도해 주세요.');
      } else {
        toast('PDF를 여는 데 실패했어요. 다른 PDF로 시도해 보세요.');
      }
      setBusy(false);
      return;
    }
    setBusy(false);
  }

  async function getVp1(pageNo) {
    if (!state.vpCache.has(pageNo)) {
      const page = await state.pdfDoc.getPage(pageNo);
      state.vpCache.set(pageNo, page.getViewport({ scale: 1 }));
    }
    return state.vpCache.get(pageNo);
  }

  async function renderPage() {
    if (!state.pdfDoc) return;
    const page = await state.pdfDoc.getPage(state.pageNum);
    const vp1 = page.getViewport({ scale: 1 });
    state.vpCache.set(state.pageNum, vp1);

    const wrapEl = $('#stageWrap');
    const cs = getComputedStyle(wrapEl);
    const availW = Math.max(220, wrapEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
    const availH = Math.min(window.innerHeight * 0.68, 1180);
    const fit = clamp(Math.min(availW / vp1.width, availH / vp1.height), 0.15, 2);
    state.fitScale = fit;

    const vp = page.getViewport({ scale: fit });
    const canvas = $('#pdfCanvas');
    canvas.width = Math.round(vp.width * DPR);
    canvas.height = Math.round(vp.height * DPR);
    canvas.style.width = Math.round(vp.width) + 'px';
    canvas.style.height = Math.round(vp.height) + 'px';

    const stage = $('#stage');
    stage.style.width = Math.round(vp.width) + 'px';
    stage.style.height = Math.round(vp.height) + 'px';

    if (state.renderTask) { try { state.renderTask.cancel(); } catch (_) {} }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const task = page.render({
      canvasContext: ctx,
      viewport: vp,
      transform: [DPR, 0, 0, DPR, 0, 0]
    });
    state.renderTask = task;
    try {
      await task.promise;
    } catch (e) {
      if (e && e.name === 'RenderingCancelledException') return;
      throw e;
    }
    state.renderTask = null;
    renderPlacements();
  }

  async function gotoPage(n) {
    if (!state.pdfDoc) return;
    const target = clamp(n, 1, state.pageCount);
    if (target === state.pageNum) return;
    state.pageNum = target;
    state.selectedId = null;
    $('#pageNow').textContent = target;
    updateToolbar();
    setBusy(true);
    try { await renderPage(); } catch (e) { console.error(e); }
    setBusy(false);
  }

  function updateToolbar() {
    $('#btnPrev').disabled = state.pageNum <= 1;
    $('#btnNext').disabled = state.pageNum >= state.pageCount;
    $('#btnAddSig').disabled = !state.sigDataUrl;
    $('#btnCopyAll').disabled = state.placements.length === 0;
    $('#btnClearPlacements').disabled = state.placements.length === 0;
    $('#btnDownloadPdf').disabled = state.placements.length === 0;
  }

  /* ──────────────────────────── 6. 서명 배치 (드래그 · 크기 조절) ──────────────────────────── */

  function addPlacement(opts) {
    if (!state.sigDataUrl) { toast('먼저 1번 단계에서 서명을 만들어 주세요.'); return; }
    const stage = $('#stage');
    const W = stage.clientWidth || 1;
    const H = stage.clientHeight || 1;
    const aspect = state.sigAspect || 1;

    const wantW = (opts && opts.w) || 0.26;               // 페이지 폭의 26%
    let w = wantW;
    let h = (w * W / aspect) / H;                          // 페이지 비율을 반영한 높이(정규화)
    if (h > 0.4) { h = 0.4; w = h * H * aspect / W; }

    const u = opts && opts.u != null ? opts.u : 1 - w - 0.07;
    const v = opts && opts.v != null ? opts.v : 1 - h - 0.12;

    const pl = {
      id: 'p' + Date.now() + Math.round(Math.random() * 999),
      page: state.pageNum,
      u: clamp(u, 0, Math.max(0, 1 - w)),
      v: clamp(v, 0, Math.max(0, 1 - h)),
      w, h, aspect,
      src: state.sigDataUrl
    };
    state.placements.push(pl);
    state.selectedId = pl.id;
    renderPlacements();
    updateToolbar();
  }

  function selectedPlacement() {
    return state.placements.find(p => p.id === state.selectedId) || null;
  }

  function renderPlacements() {
    const overlay = $('#overlay');
    const stage = $('#stage');
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    overlay.innerHTML = '';

    for (const pl of state.placements) {
      if (pl.page !== state.pageNum) continue;
      const box = document.createElement('div');
      box.className = 'sig-box' + (pl.id === state.selectedId ? ' is-selected' : '');
      box.dataset.id = pl.id;
      box.style.left = (pl.u * 100) + '%';
      box.style.top = (pl.v * 100) + '%';
      box.style.width = (pl.w * 100) + '%';
      box.style.height = (pl.h * 100) + '%';

      const img = document.createElement('img');
      img.src = pl.src;
      img.alt = '서명';
      img.draggable = false;
      box.appendChild(img);

      const handle = document.createElement('div');
      handle.className = 'handle';
      handle.title = '끌어서 크기 조절';
      box.appendChild(handle);

      const del = document.createElement('button');
      del.className = 'del';
      del.type = 'button';
      del.textContent = '×';
      del.title = '이 서명 지우기';
      del.addEventListener('pointerdown', e => e.stopPropagation());
      del.addEventListener('click', e => {
        e.stopPropagation();
        state.placements = state.placements.filter(x => x.id !== pl.id);
        state.selectedId = null;
        renderPlacements();
        updateToolbar();
      });
      box.appendChild(del);

      const startDrag = e => {
        if (e.button !== undefined && e.button > 0) return;
        e.preventDefault();
        e.stopPropagation();
        if (state.selectedId !== pl.id) { state.selectedId = pl.id; renderPlacements(); }
        const isResize = e.target === handle;
        const rectW = stage.clientWidth, rectH = stage.clientHeight;
        const start = { x: e.clientX, y: e.clientY, u: pl.u, v: pl.v, w: pl.w, h: pl.h };
        const move = ev => {
          const dx = (ev.clientX - start.x) / rectW;
          const dy = (ev.clientY - start.y) / rectH;
          if (!isResize) {
            pl.u = clamp(start.u + dx, 0, 1 - pl.w);
            pl.v = clamp(start.v + dy, 0, 1 - pl.h);
          } else {
            let w = clamp(start.w + dx, 0.06, 1 - start.u);
            let hn = (w * rectW / pl.aspect) / rectH;
            if (start.v + hn > 1) {
              hn = 1 - start.v;
              w = (hn * rectH * pl.aspect) / rectW;
            }
            pl.w = w; pl.h = hn;
          }
          const el = overlay.querySelector('[data-id="' + pl.id + '"]');
          if (el) {
            el.style.left = (pl.u * 100) + '%';
            el.style.top = (pl.v * 100) + '%';
            el.style.width = (pl.w * 100) + '%';
            el.style.height = (pl.h * 100) + '%';
          }
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      };

      box.addEventListener('pointerdown', startDrag);
      overlay.appendChild(box);
    }

    $('#btnDownloadPdf').disabled = state.placements.length === 0;
    $('#btnClearPlacements').disabled = state.placements.length === 0;
    $('#btnCopyAll').disabled = state.placements.length === 0;
  }

  function copyToAllPages() {
    const pl = selectedPlacement() || state.placements[state.placements.length - 1];
    if (!pl) return toast('먼저 서명을 PDF 위에 넣어 주세요.');
    let added = 0;
    for (let p = 1; p <= state.pageCount; p++) {
      if (p === pl.page) continue;
      const exists = state.placements.some(x => x.page === p && Math.abs(x.u - pl.u) < 0.02 && Math.abs(x.v - pl.v) < 0.02);
      if (exists) continue;
      state.placements.push({ ...pl, id: 'p' + Date.now() + p + Math.round(Math.random() * 999), page: p });
      added++;
    }
    renderPlacements();
    updateToolbar();
    toast(added ? added + '개 페이지에 같은 위치로 넣었어요.' : '이미 모든 페이지에 들어가 있어요.');
  }

  function clearPlacements() {
    if (!state.placements.length) return;
    state.placements = [];
    state.selectedId = null;
    renderPlacements();
    updateToolbar();
    toast('PDF에 넣은 서명을 모두 지웠어요.');
  }

  /* ──────────────────────────── 7. PDF 저장 (pdf-lib 합성) ──────────────────────────── */

  async function saveSignedPdf() {
    if (!state.placements.length) return toast('PDF 위에 서명을 먼저 넣어 주세요.');
    if (!window.PDFLib) return toast('PDF 저장 도구를 불러오지 못했어요. 새로고침해 주세요.');

    setBusy(true);
    try {
      const { PDFDocument, pushGraphicsState, popGraphicsState, concatTransformationMatrix } = window.PDFLib;
      const doc = await PDFDocument.load(state.pdfBytes);
      const pages = doc.getPages();
      const imgCache = new Map();

      for (const pl of state.placements) {
        const page = pages[pl.page - 1];
        if (!page) continue;
        let img = imgCache.get(pl.src);
        if (!img) {
          img = await doc.embedPng(dataUrlToBytes(pl.src));
          imgCache.set(pl.src, img);
        }
        const vp1 = await getVp1(pl.page);
        const W = vp1.width, H = vp1.height;

        // 화면(회전 반영) 좌표 → PDF 좌표. 회전된 스캔본도 그대로 맞는다.
        const TL = vp1.convertToPdfPoint(pl.u * W, pl.v * H);
        const TR = vp1.convertToPdfPoint((pl.u + pl.w) * W, pl.v * H);
        const BL = vp1.convertToPdfPoint(pl.u * W, (pl.v + pl.h) * H);

        const a = TR[0] - TL[0], b = TR[1] - TL[1];
        const c = TL[0] - BL[0], d = TL[1] - BL[1];

        page.pushOperators(pushGraphicsState(), concatTransformationMatrix(a, b, c, d, BL[0], BL[1]));
        await page.drawImage(img, { x: 0, y: 0, width: 1, height: 1 });
        page.pushOperators(popGraphicsState());
      }

      const bytes = await doc.save();
      download(new Blob([bytes], { type: 'application/pdf' }), state.pdfName + '_서명완료.pdf');
      toast('서명을 넣은 PDF를 저장했어요.');
    } catch (e) {
      console.error(e);
      toast('PDF 저장에 실패했어요. 잠긴 PDF라면 암호를 푼 뒤 다시 시도해 주세요.');
    }
    setBusy(false);
  }

  /* ──────────────────────────── 8. 이벤트 연결 ──────────────────────────── */

  function bindDrop(labelEl, inputEl, handler, accept) {
    const takeFiles = files => {
      const file = files && files[0];
      if (!file) return;
      if (accept === 'pdf' && !/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
        toast('PDF 파일만 올릴 수 있어요.');
        return;
      }
      handler(file);
    };
    labelEl.addEventListener('click', e => {
      if (e.target === inputEl) return;      // 파일 선택창 기본 동작 유지
    });
    inputEl.addEventListener('change', () => {
      takeFiles(inputEl.files);
      inputEl.value = '';
    });
    ['dragenter', 'dragover'].forEach(ev => {
      labelEl.addEventListener(ev, e => { e.preventDefault(); labelEl.classList.add('is-over'); });
    });
    ['dragleave', 'dragend'].forEach(ev => {
      labelEl.addEventListener(ev, () => labelEl.classList.remove('is-over'));
    });
    labelEl.addEventListener('drop', e => {
      e.preventDefault();
      labelEl.classList.remove('is-over');
      takeFiles(e.dataTransfer && e.dataTransfer.files);
    });
    labelEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputEl.click(); }
    });
  }

  function bindAll() {
    // 탭
    $$('.tab').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
    $$('.seg button').forEach(btn => btn.addEventListener('click', () => switchMode(btn.dataset.mode)));

    // 사진
    photoInit($('#photoCanvas'));
    bindDrop($('#photoDrop'), $('#photoInput'), file => photoLoad(file), 'image');
    $('#tThreshold').addEventListener('input', e => {
      state.threshold = levelToThreshold(Number(e.target.value));
      $('#vThreshold').textContent = e.target.value + '%';
      photoSchedule();
    });
    $('#tSoftness').addEventListener('input', e => {
      state.softness = Number(e.target.value);
      $('#vSoftness').textContent = state.softness;
      photoSchedule();
    });
    $('#tStrength').addEventListener('input', e => {
      state.strength = Number(e.target.value);
      $('#vStrength').textContent = state.strength + '%';
      photoSchedule();
    });
    $('#inkMode').addEventListener('change', e => { state.inkMode = e.target.value; photoProcess(); });
    $('#btnAuto').addEventListener('click', () => { applyAutoThreshold(false); photoProcess(); });
    $('#btnReset').addEventListener('click', resetPhotoControls);
    $('#btnPhotoAgain').addEventListener('click', () => {
      $('#photoInput').click();
    });

    // 그리기
    drawInit($('#drawCanvas'));
    $$('.swatch').forEach(btn => {
      btn.addEventListener('click', () => {
        state.color = btn.dataset.color;
        $$('.swatch').forEach(b => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));
        const dot = $('#penDot');
        dot.style.background = state.color;
      });
    });
    $('#penWidth').addEventListener('input', e => {
      state.penWidth = Number(e.target.value);
      const dot = $('#penDot');
      dot.style.width = Math.max(4, state.penWidth) + 'px';
      dot.style.height = Math.max(4, state.penWidth) + 'px';
    });
    $('#btnUndo').addEventListener('click', () => {
      if (!state.strokes.length) return;
      state.strokes.pop();
      drawRender(); updateDrawState(); scheduleResult();
    });
    $('#btnClear').addEventListener('click', () => {
      if (!state.strokes.length) return;
      state.strokes = [];
      drawRender(); updateDrawState(); scheduleResult();
    });

    // 결과
    $('#btnDownloadPng').addEventListener('click', downloadPng);
    $('#btnUseInPdf').addEventListener('click', () => {
      if (!state.sigDataUrl) return toast('먼저 서명을 만들어 주세요.');
      switchTab('sign');
      if (!state.pdfDoc) {
        toast('PDF를 올리면 방금 만든 서명이 바로 들어가요.');
        return;
      }
      addPlacement();
    });

    // PDF
    bindDrop($('#pdfDrop'), $('#pdfInput'), file => loadPdf(file), 'pdf');
    $('#btnPrev').addEventListener('click', () => gotoPage(state.pageNum - 1));
    $('#btnNext').addEventListener('click', () => gotoPage(state.pageNum + 1));
    $('#btnAddSig').addEventListener('click', () => addPlacement());
    $('#btnCopyAll').addEventListener('click', copyToAllPages);
    $('#btnClearPlacements').addEventListener('click', clearPlacements);
    $('#btnDownloadPdf').addEventListener('click', saveSignedPdf);
    $('#btnPdfAgain').addEventListener('click', () => {
      $('#pdfInput').click();
    });

    // 반응형: 창 크기가 바뀌면 PDF 페이지를 다시 그린다
    let rt = null;
    window.addEventListener('resize', () => {
      if (!state.pdfDoc) return;
      clearTimeout(rt);
      rt = setTimeout(() => { renderPage().catch(() => {}); }, 220);
    });

    // 키보드 페이지 이동
    document.addEventListener('keydown', e => {
      if (state.tab !== 'sign' || !state.pdfDoc) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); gotoPage(state.pageNum - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); gotoPage(state.pageNum + 1); }
    });

    updateDrawState();
    syncPhotoControls();
    updateToolbar();
  }

  /* 라이브러리 로딩 확인 */
  function checkLibs() {
    const missing = [];
    if (!window.pdfjsLib) missing.push('pdf.js');
    if (!window.PDFLib) missing.push('pdf-lib');
    const el = $('#libError');
    if (!missing.length) return;
    el.innerHTML = '⚠️ PDF 기능에 필요한 라이브러리(' + missing.join(', ') + ')를 불러오지 못했어요. '
      + '인터넷 연결을 확인한 뒤 새로고침해 주세요. (서명 만들기 기능은 그대로 쓸 수 있어요.)';
    el.classList.add('is-on');
  }

  function init() {
    if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    try {
      bindAll();
    } catch (e) {
      console.error(e);
    }
    checkLibs();
    // 화면 크기가 바뀌면 그리기 캔버스도 다시 그린다
    let dt = null;
    window.addEventListener('resize', () => {
      clearTimeout(dt);
      dt = setTimeout(() => { if (state.mode === 'draw') drawRender(); }, 160);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
