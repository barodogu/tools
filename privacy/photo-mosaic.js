/*!
 * ============================================================
 * 모듈명   : barodogu.photoMosaic
 * 관리 ID  : BD083
 * 파일     : privacy/photo-mosaic.js
 * 저장소   : https://github.com/barodogu/tools
 * CDN      : https://cdn.jsdelivr.net/gh/barodogu/tools@main/privacy/photo-mosaic.js
 * 사용 블로그: https://barodogu.blogspot.com/
 * 용도     : 사진 개인정보 가리기(모자이크·블러·단색) + 위치정보(EXIF GPS)·촬영기기 정보 삭제
 *            - 사각형 드래그(번호판·송장·계좌번호), 자유 브러시(얼굴·손글씨)
 *            - 픽셀 모자이크 / 가우시안 블러 / 단색 가림(검정·흰색), 되돌리기·다시 실행·전체 지우기
 *            - 확대·이동 미리보기(휠·핀치·버튼), 기기 픽셀비(DPR) 보정으로 손가락 좌표까지 정확히
 *            - JPG·PNG·WebP 저장(원본 해상도 유지), 저장 파일에서 메타데이터 0건 자동 확인
 *            ※ 사진은 서버로 전송하지 않고 브라우저(Canvas) 안에서만 처리. 오프라인에서도 동작
 * 기준     : EXIF 2.3(TIFF 6.0 §2), PNG eXIf 청크, WebP EXIF 청크 — 메타데이터 검사에만 사용
 *            Canvas 2D 재인코딩 시 브라우저가 EXIF/XMP 를 쓰지 않으므로 저장본에는 남지 않음
 * 사용법   : 글에 <div id="barodogu-photo-mosaic"></div> 를 넣고
 *            이 파일을 <script src="…" defer></script> 로 불러오면 화면을 그립니다.
 * 버전     : 1.0.0
 * 최종수정 : 2026-11-17
 * ============================================================
 */
(function (window, document) {
  'use strict';

  /* ---------- 기준값: 이 객체만 수정하면 됩니다 ---------- */
  var CONFIG = {
    VERSION: '1.0.0',
    UPDATED: '2026-11-17',
    ROOT_ID: 'barodogu-photo-mosaic',
    MAX_FILE_MB: 40,              // 원본 사진 최대 용량
    MAX_SOURCE_PIXELS: 80e6,      // 원본 화소 상한(8,000만)
    MAX_EXPORT_PIXELS: 100e6,     // 내보내기 화소 상한(1억) — 넘으면 안내 후 중단
    MAX_PARTS_DB: 200,            // 기억해 두는 최대 가린 곳 수
    MIN_RECT_IMG_PX: 3,           // 이보다 작은 사각형은 무시(사진 픽셀 기준)
    MIN_BRUSH_STEP: 0.6,          // 브러시 점 간격(사진 픽셀)
    MIN_ZOOM: 0.02,
    MAX_ZOOM: 16,
    DPR_MAX: 2,
    STAGE_MAX_H: 620,
    STAGE_MIN_H: 280,
    QUALITY_DEFAULT: 92,
    QUALITY_MIN: 40,
    ESTIMATE_DELAY: 450,
    ACCEPT: 'image/jpeg,image/png,image/webp,image/gif,image/bmp,.jpg,.jpeg,.png,.webp',
    FORMATS: [
      { mime: 'image/jpeg', label: 'JPG', ext: 'jpg' },
      { mime: 'image/png', label: 'PNG', ext: 'png' },
      { mime: 'image/webp', label: 'WebP', ext: 'webp' }
    ]
  };

  var CSS = "/* ============================================================================\n * 착착도구 — 사진 개인정보 가리기(모자이크·블러) · 위치정보(EXIF) 삭제\n * 파일: photo-mosaic.css\n * 설명: photo-mosaic.js 가 화면을 그릴 때 쓰는 스타일. 모든 선택자는\n *       #barodogu-photo-mosaic 아래로 한정되어 블로그의 다른 요소를 건드리지 않습니다.\n * ========================================================================== */\n\n#barodogu-photo-mosaic {\n  --bdpm-ink: #1d2733;\n  --bdpm-sub: #5b6b7d;\n  --bdpm-line: #e2e8f0;\n  --bdpm-line-soft: #eef2f7;\n  --bdpm-primary: #3358f4;\n  --bdpm-primary-dark: #2441c9;\n  --bdpm-soft: #f1f6ff;\n  --bdpm-warn: #b4322a;\n  --bdpm-warn-bg: #fff4f2;\n  --bdpm-ok: #1c7a4b;\n  --bdpm-ok-bg: #f1faf4;\n  --bdpm-radius: 12px;\n  display: block;\n  margin: 22px 0 8px;\n  color: var(--bdpm-ink);\n  font-family: Pretendard, -apple-system, BlinkMacSystemFont, \"Apple SD Gothic Neo\", \"Malgun Gothic\", \"맑은 고딕\", system-ui, sans-serif;\n  font-size: 15px;\n  line-height: 1.6;\n  letter-spacing: -0.01em;\n  text-align: left;\n  word-break: keep-all;\n}\n\n#barodogu-photo-mosaic *,\n#barodogu-photo-mosaic *::before,\n#barodogu-photo-mosaic *::after { box-sizing: border-box; }\n\n#barodogu-photo-mosaic .bdpm-card {\n  border: 1px solid var(--bdpm-line);\n  border-radius: var(--bdpm-radius);\n  background: #fff;\n  padding: 20px;\n  box-shadow: 0 1px 2px rgba(16, 30, 54, .04);\n}\n\n#barodogu-photo-mosaic .bdpm-kicker {\n  margin: 0 0 2px;\n  color: var(--bdpm-primary);\n  font-size: 12px;\n  font-weight: 800;\n  letter-spacing: .08em;\n}\n\n#barodogu-photo-mosaic .bdpm-title {\n  margin: 0 0 6px;\n  font-size: 21px;\n  line-height: 1.35;\n  font-weight: 800;\n  letter-spacing: -0.02em;\n}\n\n#barodogu-photo-mosaic .bdpm-lead {\n  margin: 0 0 16px;\n  color: var(--bdpm-sub);\n  font-size: 14px;\n}\n\n#barodogu-photo-mosaic .bdpm-small {\n  margin: 8px 0 0;\n  color: var(--bdpm-sub);\n  font-size: 12.5px;\n  line-height: 1.55;\n}\n\n/* ── 파일 선택 ───────────────────────────────────────────────────────── */\n#barodogu-photo-mosaic .bdpm-drop {\n  border: 1.5px dashed #c3d0e2;\n  border-radius: var(--bdpm-radius);\n  background: #fbfcfe;\n  padding: 22px 18px;\n  text-align: center;\n  transition: border-color .15s, background .15s;\n}\n#barodogu-photo-mosaic .bdpm-drop.is-over {\n  border-color: var(--bdpm-primary);\n  background: var(--bdpm-soft);\n}\n#barodogu-photo-mosaic .bdpm-drop strong {\n  display: block;\n  font-size: 15.5px;\n  margin-bottom: 10px;\n}\n#barodogu-photo-mosaic .bdpm-filebtn {\n  display: inline-block;\n  margin: 2px 0 0;\n  padding: 11px 20px;\n  border-radius: 10px;\n  background: var(--bdpm-primary);\n  color: #fff;\n  font-size: 15px;\n  font-weight: 700;\n  cursor: pointer;\n  transition: background .15s;\n}\n#barodogu-photo-mosaic .bdpm-filebtn:hover { background: var(--bdpm-primary-dark); }\n#barodogu-photo-mosaic .bdpm-filebtn:focus-within { outline: 3px solid #c9d6ff; outline-offset: 2px; }\n#barodogu-photo-mosaic .bdpm-file {\n  position: absolute;\n  width: 1px;\n  height: 1px;\n  padding: 0;\n  margin: -1px;\n  overflow: hidden;\n  clip: rect(0 0 0 0);\n  white-space: nowrap;\n  border: 0;\n}\n#barodogu-photo-mosaic .bdpm-privacy {\n  margin: 12px 0 0;\n  padding: 10px 12px;\n  border-radius: 10px;\n  background: var(--bdpm-soft);\n  color: #26406e;\n  font-size: 12.5px;\n  line-height: 1.55;\n}\n\n/* ── 파일 정보 · EXIF ───────────────────────────────────────────────── */\n#barodogu-photo-mosaic .bdpm-fileinfo {\n  margin: 0 0 14px;\n  padding: 13px 14px;\n  border: 1px solid var(--bdpm-line);\n  border-radius: var(--bdpm-radius);\n  background: #fbfcfe;\n}\n#barodogu-photo-mosaic .bdpm-fileinfo-head {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: baseline;\n  gap: 4px 10px;\n}\n#barodogu-photo-mosaic .bdpm-fname {\n  font-weight: 700;\n  font-size: 14.5px;\n  word-break: break-all;\n}\n#barodogu-photo-mosaic .bdpm-meta {\n  color: var(--bdpm-sub);\n  font-size: 12.5px;\n  font-weight: 500;\n}\n#barodogu-photo-mosaic .bdpm-exif {\n  margin: 9px 0 0;\n  word-break: keep-all;\n  overflow-wrap: anywhere;\n  padding: 10px 12px;\n  border-radius: 10px;\n  font-size: 13px;\n  line-height: 1.65;\n}\n#barodogu-photo-mosaic .bdpm-exif.is-warn {\n  border: 1px solid #f3cfc9;\n  background: var(--bdpm-warn-bg);\n  color: #7d2a22;\n}\n#barodogu-photo-mosaic .bdpm-exif.is-clean {\n  border: 1px solid #cfe8d8;\n  background: var(--bdpm-ok-bg);\n  color: #18613c;\n}\n#barodogu-photo-mosaic .bdpm-exif b { font-weight: 800; }\n#barodogu-photo-mosaic .bdpm-pill {\n  display: inline-block;\n  padding: 1px 8px;\n  border-radius: 999px;\n  font-size: 11.5px;\n  font-weight: 800;\n  letter-spacing: 0;\n  vertical-align: 1px;\n  white-space: nowrap;\n}\n#barodogu-photo-mosaic .bdpm-pill.is-warn { background: #fadcd7; color: #8c2b21; }\n#barodogu-photo-mosaic .bdpm-pill.is-ok { background: #d8f0e1; color: #145c39; }\n#barodogu-photo-mosaic .bdpm-msg .bdpm-pill { margin-right: 2px; }\n#barodogu-photo-mosaic .bdpm-exif code {\n  padding: 1px 5px;\n  border-radius: 5px;\n  background: rgba(0, 0, 0, .06);\n  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\n  font-size: 12.5px;\n  word-break: break-all;\n}\n#barodogu-photo-mosaic details.bdpm-more {\n  margin: 8px 0 0;\n  font-size: 12.5px;\n  color: var(--bdpm-sub);\n}\n#barodogu-photo-mosaic details.bdpm-more summary {\n  cursor: pointer;\n  font-weight: 600;\n  color: #3358f4;\n}\n#barodogu-photo-mosaic details.bdpm-more ul {\n  margin: 8px 0 0;\n  padding-left: 18px;\n}\n#barodogu-photo-mosaic details.bdpm-more li { margin: 2px 0; }\n\n/* ── 도구 모음 ──────────────────────────────────────────────────────── */\n#barodogu-photo-mosaic .bdpm-work { margin: 0; }\n#barodogu-photo-mosaic .bdpm-toolbar {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 8px 14px;\n  margin: 0 0 10px;\n}\n#barodogu-photo-mosaic .bdpm-group {\n  display: inline-flex;\n  gap: 4px;\n  padding: 3px;\n  border: 1px solid var(--bdpm-line);\n  border-radius: 11px;\n  background: #f7f9fc;\n}\n#barodogu-photo-mosaic .bdpm-seg {\n  appearance: none;\n  border: 0;\n  border-radius: 8px;\n  background: transparent;\n  color: var(--bdpm-ink);\n  font: inherit;\n  font-size: 13.5px;\n  font-weight: 600;\n  padding: 8px 12px;\n  cursor: pointer;\n  white-space: nowrap;\n  transition: background .12s, color .12s, box-shadow .12s;\n}\n#barodogu-photo-mosaic .bdpm-seg:hover { background: #e9eef7; }\n#barodogu-photo-mosaic .bdpm-seg.is-on {\n  background: #fff;\n  color: var(--bdpm-primary);\n  box-shadow: 0 1px 4px rgba(20, 40, 90, .14);\n}\n#barodogu-photo-mosaic .bdpm-seg:focus-visible { outline: 2px solid var(--bdpm-primary); outline-offset: 1px; }\n\n#barodogu-photo-mosaic .bdpm-sliders {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));\n  gap: 8px 16px;\n  margin: 0 0 10px;\n}\n#barodogu-photo-mosaic .bdpm-sliders label {\n  display: block;\n  max-width: 430px;\n  margin: 0;\n  color: var(--bdpm-sub);\n  font-size: 12.5px;\n  font-weight: 600;\n}\n#barodogu-photo-mosaic .bdpm-sliders label > b {\n  float: right;\n  color: var(--bdpm-ink);\n  font-size: 12.5px;\n  font-weight: 700;\n  font-variant-numeric: tabular-nums;\n}\n#barodogu-photo-mosaic .bdpm-sliders input[type=\"range\"] {\n  display: block;\n  width: 100%;\n  margin: 4px 0 0;\n  accent-color: var(--bdpm-primary);\n  cursor: pointer;\n}\n#barodogu-photo-mosaic .bdpm-sliders label.is-off { display: none; }\n#barodogu-photo-mosaic .bdpm-colors span {\n  display: flex;\n  gap: 8px;\n  margin-top: 6px;\n}\n#barodogu-photo-mosaic .bdpm-dot {\n  width: 30px;\n  height: 26px;\n  border-radius: 7px;\n  border: 2px solid var(--bdpm-line);\n  background: #111;\n  cursor: pointer;\n}\n#barodogu-photo-mosaic .bdpm-dot[data-solid=\"#ffffff\"] { background: #fff; }\n#barodogu-photo-mosaic .bdpm-dot[data-solid=\"#666666\"] { background: #666; }\n#barodogu-photo-mosaic .bdpm-dot.is-on {\n  border-color: var(--bdpm-primary);\n  box-shadow: 0 0 0 3px #dbe4ff;\n}\n\n#barodogu-photo-mosaic .bdpm-bar {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n  margin: 0 0 10px;\n}\n#barodogu-photo-mosaic .bdpm-actions { display: flex; flex-wrap: wrap; gap: 6px; }\n#barodogu-photo-mosaic .bdpm-btn {\n  appearance: none;\n  border: 1px solid var(--bdpm-line);\n  border-radius: 9px;\n  background: #fff;\n  color: var(--bdpm-ink);\n  font: inherit;\n  font-size: 13px;\n  font-weight: 600;\n  padding: 7px 11px;\n  cursor: pointer;\n  transition: background .12s, border-color .12s;\n}\n#barodogu-photo-mosaic .bdpm-btn:hover { background: #f4f7fc; border-color: #cbd7e8; }\n#barodogu-photo-mosaic .bdpm-btn:disabled { opacity: .45; cursor: default; background: #fff; }\n#barodogu-photo-mosaic .bdpm-btn[aria-pressed=\"true\"] { background: var(--bdpm-soft); border-color: #b9c9ff; color: var(--bdpm-primary-dark); }\n\n/* ── 캔버스 ─────────────────────────────────────────────────────────── */\n#barodogu-photo-mosaic .bdpm-stagewrap { margin: 0 0 8px; }\n#barodogu-photo-mosaic .bdpm-stage {\n  position: relative;\n  width: 100%;\n  height: 340px;\n  overflow: hidden;\n  border-radius: var(--bdpm-radius);\n  border: 1px solid #d9e1ec;\n  background: #f2f5f9 repeating-conic-gradient(#eceff4 0% 25%, #f6f8fb 0% 50%) 0 0 / 18px 18px;\n  touch-action: none;\n  -webkit-user-select: none;\n  user-select: none;\n  overscroll-behavior: contain;\n}\n#barodogu-photo-mosaic .bdpm-canvas {\n  display: block;\n  width: 100%;\n  height: 100%;\n  cursor: crosshair;\n  touch-action: none;\n}\n#barodogu-photo-mosaic .bdpm-stage.is-move .bdpm-canvas { cursor: grab; }\n#barodogu-photo-mosaic .bdpm-stage.is-panning .bdpm-canvas { cursor: grabbing; }\n#barodogu-photo-mosaic .bdpm-stage.is-brush .bdpm-canvas { cursor: none; }\n\n#barodogu-photo-mosaic .bdpm-count {\n  position: absolute;\n  left: 10px;\n  top: 10px;\n  padding: 3px 9px;\n  border-radius: 999px;\n  background: rgba(18, 28, 45, .72);\n  color: #fff;\n  font-size: 12px;\n  font-weight: 700;\n  letter-spacing: 0;\n  pointer-events: none;\n}\n#barodogu-photo-mosaic .bdpm-drag {\n  position: absolute;\n  left: 50%;\n  bottom: 12px;\n  transform: translateX(-50%);\n  margin: 0;\n  padding: 5px 12px;\n  border-radius: 999px;\n  background: rgba(18, 28, 45, .62);\n  color: #fff;\n  font-size: 12px;\n  white-space: nowrap;\n  pointer-events: none;\n  transition: opacity .3s;\n}\n#barodogu-photo-mosaic .bdpm-drag.is-off { opacity: 0; }\n\n#barodogu-photo-mosaic .bdpm-zoom {\n  position: absolute;\n  right: 10px;\n  bottom: 10px;\n  display: inline-flex;\n  align-items: stretch;\n  border-radius: 10px;\n  overflow: hidden;\n  background: rgba(255, 255, 255, .94);\n  box-shadow: 0 1px 6px rgba(15, 30, 60, .18);\n}\n#barodogu-photo-mosaic .bdpm-zoom button {\n  appearance: none;\n  border: 0;\n  background: transparent;\n  color: var(--bdpm-ink);\n  font: inherit;\n  font-size: 14px;\n  min-width: 38px;\n  padding: 7px 8px;\n  cursor: pointer;\n}\n#barodogu-photo-mosaic .bdpm-zoom button + button { border-left: 1px solid var(--bdpm-line); }\n#barodogu-photo-mosaic .bdpm-zoom button:hover { background: #eef3fb; }\n#barodogu-photo-mosaic .bdpm-zoom button span { font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }\n\n#barodogu-photo-mosaic .bdpm-hint {\n  margin: 0 0 12px;\n  color: var(--bdpm-sub);\n  font-size: 12.5px;\n  line-height: 1.6;\n}\n\n/* ── 저장 ───────────────────────────────────────────────────────────── */\n#barodogu-photo-mosaic .bdpm-save {\n  padding: 14px;\n  border: 1px solid var(--bdpm-line);\n  border-radius: var(--bdpm-radius);\n  background: #fbfcfe;\n}\n#barodogu-photo-mosaic .bdpm-savehead {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: baseline;\n  gap: 4px 10px;\n  margin-bottom: 10px;\n}\n#barodogu-photo-mosaic .bdpm-savehead b { font-size: 15px; }\n#barodogu-photo-mosaic .bdpm-saverow {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: flex-end;\n  gap: 10px 14px;\n}\n#barodogu-photo-mosaic .bdpm-saverow label {\n  display: block;\n  margin: 0;\n  color: var(--bdpm-sub);\n  font-size: 12.5px;\n  font-weight: 600;\n}\n#barodogu-photo-mosaic .bdpm-saverow select {\n  display: block;\n  margin: 4px 0 0;\n  padding: 7px 10px;\n  border: 1px solid var(--bdpm-line);\n  border-radius: 8px;\n  background: #fff;\n  color: var(--bdpm-ink);\n  font: inherit;\n  font-size: 13.5px;\n  cursor: pointer;\n}\n#barodogu-photo-mosaic .bdpm-saverow label.bdpm-q { min-width: 148px; }\n#barodogu-photo-mosaic .bdpm-saverow label.bdpm-q input { width: 100%; margin: 6px 0 0; accent-color: var(--bdpm-primary); }\n#barodogu-photo-mosaic .bdpm-est {\n  color: var(--bdpm-sub);\n  font-size: 12.5px;\n  font-weight: 600;\n  font-variant-numeric: tabular-nums;\n  padding-bottom: 9px;\n}\n#barodogu-photo-mosaic .bdpm-primary {\n  appearance: none;\n  margin-left: auto;\n  border: 0;\n  border-radius: 10px;\n  background: var(--bdpm-primary);\n  color: #fff;\n  font: inherit;\n  font-size: 15px;\n  font-weight: 800;\n  padding: 12px 22px;\n  cursor: pointer;\n  transition: background .15s, transform .05s;\n}\n#barodogu-photo-mosaic .bdpm-primary:hover { background: var(--bdpm-primary-dark); }\n#barodogu-photo-mosaic .bdpm-primary:active { transform: translateY(1px); }\n#barodogu-photo-mosaic .bdpm-primary:disabled { background: #a9b6cc; cursor: default; }\n\n#barodogu-photo-mosaic .bdpm-msg {\n  margin: 10px 0 0;\n  min-height: 0;\n  font-size: 13px;\n  font-weight: 600;\n  line-height: 1.55;\n}\n#barodogu-photo-mosaic .bdpm-msg.is-error { color: var(--bdpm-warn); }\n#barodogu-photo-mosaic .bdpm-msg.is-ok { color: var(--bdpm-ok); }\n#barodogu-photo-mosaic .bdpm-msg.is-info { color: var(--bdpm-sub); }\n\n#barodogu-photo-mosaic .bdpm-foot {\n  margin: 12px 0 0;\n  color: #8a97a8;\n  font-size: 11.5px;\n  text-align: center;\n}\n\n/* ── 좁은 화면(휴대전화) ────────────────────────────────────────────── */\n@media (max-width: 560px) {\n  #barodogu-photo-mosaic .bdpm-card { padding: 15px 13px; border-radius: 10px; }\n  #barodogu-photo-mosaic .bdpm-title { font-size: 18.5px; }\n  #barodogu-photo-mosaic .bdpm-stage { height: 300px; }\n  #barodogu-photo-mosaic .bdpm-seg { padding: 9px 10px; font-size: 13px; }\n  #barodogu-photo-mosaic .bdpm-toolbar { gap: 8px; }\n  #barodogu-photo-mosaic .bdpm-group { flex: 1 1 100%; justify-content: space-between; }\n  #barodogu-photo-mosaic .bdpm-group .bdpm-seg { flex: 1 1 0; text-align: center; padding-left: 6px; padding-right: 6px; }\n  #barodogu-photo-mosaic .bdpm-sliders { grid-template-columns: 1fr; }\n  #barodogu-photo-mosaic .bdpm-saverow { gap: 10px; }\n  #barodogu-photo-mosaic .bdpm-primary { width: 100%; margin-left: 0; }\n  #barodogu-photo-mosaic .bdpm-zoom button { min-width: 36px; }\n  #barodogu-photo-mosaic .bdpm-drag {\n    left: 10px;\n    bottom: 54px;\n    transform: none;\n    font-size: 11.5px;\n    max-width: calc(100% - 20px);\n    overflow: hidden;\n    text-overflow: ellipsis;\n  }\n}\n";

  /* ==================================================================
   * 1. 공통 유틸
   * ================================================================== */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function formatBytes(n) {
    if (!n && n !== 0) return '-';
    if (n < 1024) return n + 'B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + 'KB';
    return (n / 1048576).toFixed(n < 10 * 1048576 ? 1 : 0) + 'MB';
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function h(tag, attr, text) {
    var e = document.createElement(tag), k;
    if (attr) { for (k in attr) { if (attr.hasOwnProperty(k)) e.setAttribute(k, attr[k]); } }
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  function baseName(name) {
    return String(name || 'photo').replace(/\.[^.\\/]+$/, '') || 'photo';
  }

  /* ==================================================================
   * 2. EXIF / 메타데이터 읽기
   *    - 목적: (1) 올린 사진에 위치·촬영기기 정보가 있는지 사용자에게 알린다
   *            (2) 저장한 파일에서 그 정보가 정말 사라졌는지 확인한다
   *    - 서버·라이브러리 없이 JPEG(APP1) · PNG(eXIf) · WebP(EXIF) 를 직접 읽습니다.
   * ================================================================== */
  function ascii(b, start, len) {
    var s = '', i, end = Math.min(b.length, start + len);
    for (i = start; i < end; i++) {
      var c = b[i];
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  }

  function matches(b, start, str) {
    var i;
    if (start < 0 || start + str.length > b.length) return false;
    for (i = 0; i < str.length; i++) {
      if (b[start + i] !== str.charCodeAt(i)) return false;
    }
    return true;
  }

  function findAscii(b, start, end, str) {
    var i, last = Math.min(end, b.length) - str.length;
    for (i = start; i <= last; i++) {
      if (matches(b, i, str)) return i;
    }
    return -1;
  }

  function readU16(b, p, little) {
    if (p + 2 > b.length) return 0;
    return little ? (b[p] | (b[p + 1] << 8)) : ((b[p] << 8) | b[p + 1]);
  }

  function readU32(b, p, little) {
    if (p + 4 > b.length) return 0;
    return little
      ? (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0
      : ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
  }

  function typeSize(type) {
    return { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 }[type] || 0;
  }

  function readIfd(b, base, ifdOffset, little) {
    var out = [], count, i, p;
    if (ifdOffset <= 0 || base + ifdOffset + 2 > b.length) return out;
    count = readU16(b, base + ifdOffset, little);
    if (count > 400) count = 400;          // 손상된 파일 방어
    for (i = 0; i < count; i++) {
      p = base + ifdOffset + 2 + i * 12;
      if (p + 12 > b.length) break;
      out.push({
        tag: readU16(b, p, little),
        type: readU16(b, p + 2, little),
        count: readU32(b, p + 4, little),
        valuePos: p + 8
      });
    }
    return out;
  }

  function entryBytes(b, base, e, little) {
    var size = typeSize(e.type) * e.count;
    var start = size <= 4 ? e.valuePos : base + readU32(b, e.valuePos, little);
    var end = Math.min(b.length, start + size);
    return { start: start, end: end };
  }

  function entryAscii(b, base, e, little) {
    var r = entryBytes(b, base, e, little);
    if (r.start >= b.length) return '';
    return ascii(b, r.start, r.end - r.start).replace(/\s+$/, '');
  }

  function entryNumber(b, base, e, little) {
    var r = entryBytes(b, base, e, little), v = 0;
    if (e.type === 3) v = readU16(b, r.start, little);
    else if (e.type === 4 || e.type === 9) v = readU32(b, r.start, little);
    else if (e.type === 1 || e.type === 6 || e.type === 7) v = b[r.start];
    else if (e.type === 5 || e.type === 10) {
      var n = e.type === 5 ? readU32(b, r.start, little) : (readU32(b, r.start, little) | 0);
      var d = e.type === 5 ? readU32(b, r.start + 4, little) : (readU32(b, r.start + 4, little) | 0);
      v = d ? n / d : 0;
    }
    return v;
  }

  function entryRationals(b, base, e, little) {
    var r = entryBytes(b, base, e, little), out = [], i, n, d;
    for (i = 0; i < e.count; i++) {
      n = readU32(b, r.start + i * 8, little);
      d = readU32(b, r.start + i * 8 + 4, little);
      out.push(d ? n / d : 0);
    }
    return out;
  }

  /* EXIF 태그 이름 (사용자에게 보여 줄 항목만) */
  var TAG_NAMES = {
    0x010F: '제조사(Make)', 0x0110: '촬영기기(Model)', 0x0112: '회전(Orientation)',
    0x0131: '소프트웨어(Software)', 0x0132: '수정일(DateTime)',
    0x9003: '촬영일(DateTimeOriginal)', 0x9004: '촬영일(Digitized)',
    0x829A: '노출시간', 0x829D: '조리개', 0x8827: 'ISO', 0x920A: '초점거리',
    0xA434: '렌즈', 0xA430: '촬영자(CameraOwner)', 0x9286: '사용자 설명(UserComment)',
    0xA431: '바디 일련번호(BodySerialNumber)', 0xA433: '렌즈 제조사',
    0x000B: '처리 소프트웨어', 0x001D: '처리 일시'
  };

  /**
   * parseExif(buffer, mime) — 사진 파일에서 위치·촬영 정보를 읽습니다.
   * 반환: {format, hasExif, hasXmp, gps, lat, lon, alt, make, model, software,
   *        dateTime, dateTaken, orientation, tags:[{name, value}], serial}
   * 같은 파일이면 항상 같은 결과(순수 함수)입니다.
   */
  function parseExif(buffer, mime) {
    var b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    var info = {
      format: '', hasExif: false, hasXmp: false, gps: false,
      lat: null, lon: null, alt: null,
      make: '', model: '', software: '', dateTime: '', dateTaken: '',
      orientation: 0, serial: '', tags: [], gpsSource: '', thumbCount: 0
    };
    if (!b.length || b.length < 8) return info;
    var i, len = b.length, p, segLen, tag, sz, start, entries, e, j;

    function readTiff(base, end) {
      if (base + 8 > end) return;
      var little;
      if (b[base] === 0x49 && b[base + 1] === 0x49) little = true;
      else if (b[base] === 0x4D && b[base + 1] === 0x4D) little = false;
      else return;
      var ifd0Off = readU32(b, base + 4, little);
      if (!ifd0Off) return;
      var ifd0 = readIfd(b, base, ifd0Off, little);
      var exifOff = 0, gpsOff = 0, interopOff = 0;
      for (i = 0; i < ifd0.length; i++) {
        e = ifd0[i];
        switch (e.tag) {
          case 0x010F: info.make = entryAscii(b, base, e, little); break;
          case 0x0110: info.model = entryAscii(b, base, e, little); break;
          case 0x0131: info.software = entryAscii(b, base, e, little); break;
          case 0x0132:
            info.dateTime = entryAscii(b, base, e, little);
            info.tags.push({ name: TAG_NAMES[e.tag], value: info.dateTime });
            break;
          case 0x0112: info.orientation = entryNumber(b, base, e, little); break;
          case 0xA430: info.tags.push({ name: TAG_NAMES[e.tag], value: entryAscii(b, base, e, little) }); break;
          case 0x9286: info.tags.push({ name: TAG_NAMES[e.tag], value: '(내용 있음)' }); break;
          case 0x8769: exifOff = readU32(b, e.valuePos, little); break;
          case 0x8825: gpsOff = readU32(b, e.valuePos, little); break;
          case 0xA005: interopOff = readU32(b, e.valuePos, little); break;
        }
      }
      if (info.make) info.tags.push({ name: TAG_NAMES[0x010F], value: info.make });
      if (info.model) info.tags.push({ name: TAG_NAMES[0x0110], value: info.model });
      if (info.software) info.tags.push({ name: TAG_NAMES[0x0131], value: info.software });
      if (info.orientation && info.orientation !== 1) {
        info.tags.push({ name: TAG_NAMES[0x0112], value: String(info.orientation) });
      }

      if (exifOff) {
        entries = readIfd(b, base, exifOff, little);
        for (i = 0; i < entries.length; i++) {
          e = entries[i];
          if (e.tag === 0x9003) {
            info.dateTaken = entryAscii(b, base, e, little);
            if (info.dateTaken) info.tags.push({ name: TAG_NAMES[e.tag], value: info.dateTaken });
          } else if (e.tag === 0xA431) {
            info.serial = entryAscii(b, base, e, little);
            if (info.serial) info.tags.push({ name: TAG_NAMES[e.tag], value: info.serial });
          } else if (TAG_NAMES[e.tag] && e.tag !== 0x9004) {
            var val = e.type === 2 ? entryAscii(b, base, e, little) : String(Math.round(entryNumber(b, base, e, little) * 1000) / 1000);
            if (val && val !== '0') info.tags.push({ name: TAG_NAMES[e.tag], value: val });
          }
        }
      }

      if (gpsOff) {
        var gps = readIfd(b, base, gpsOff, little), latArr = null, lonArr = null, latSign = 1, lonSign = 1, altVal = null, altRef = 0, dateStamp = '', timeStamp = null;
        for (i = 0; i < gps.length; i++) {
          e = gps[i];
          if (e.tag === 1) latSign = /^S/i.test(entryAscii(b, base, e, little)) ? -1 : 1;
          else if (e.tag === 2) latArr = entryRationals(b, base, e, little);
          else if (e.tag === 3) lonSign = /^W/i.test(entryAscii(b, base, e, little)) ? -1 : 1;
          else if (e.tag === 4) lonArr = entryRationals(b, base, e, little);
          else if (e.tag === 5) altRef = entryNumber(b, base, e, little);
          else if (e.tag === 6) altVal = entryNumber(b, base, e, little);
          else if (e.tag === 7) timeStamp = entryRationals(b, base, e, little);
          else if (e.tag === 29) dateStamp = entryAscii(b, base, e, little);
          else if (e.tag === 0x001B) info.gpsSource = entryAscii(b, base, e, little);
        }
        if (latArr && latArr.length === 3 && lonArr && lonArr.length === 3) {
          info.gps = true;
          info.lat = latSign * (latArr[0] + latArr[1] / 60 + latArr[2] / 3600);
          info.lon = lonSign * (lonArr[0] + lonArr[1] / 60 + lonArr[2] / 3600);
          if (altVal !== null) info.alt = (altRef === 1 ? -altVal : altVal);
          info.dateTaken = info.dateTaken || (dateStamp && timeStamp && timeStamp.length === 3
            ? dateStamp + ' ' + pad2(Math.round(timeStamp[0])) + ':' + pad2(Math.round(timeStamp[1])) + ':' + pad2(Math.round(timeStamp[2]))
            : dateStamp);
          info.tags.push({ name: 'GPS 위도', value: info.lat.toFixed(6) });
          info.tags.push({ name: 'GPS 경도', value: info.lon.toFixed(6) });
          if (info.alt !== null) info.tags.push({ name: 'GPS 고도', value: info.alt.toFixed(1) + 'm' });
          if (info.gpsSource) info.tags.push({ name: '위치 기록 방식', value: info.gpsSource });
        }
      }
      if (interopOff) { /* 상호운용 IFD — 개인정보 없음 */ }
    }

    /* ---- JPEG ---- */
    if (b[0] === 0xFF && b[1] === 0xD8) {
      info.format = 'jpeg';
      p = 2;
      while (p + 4 <= len) {
        if (b[p] !== 0xFF) { p++; continue; }
        var marker = b[p + 1];
        if (marker === 0xFF) { p++; continue; }
        if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD9)) { p += 2; continue; }
        if (marker === 0xDA) break;                       // SOS 이후는 픽셀 데이터
        segLen = readU16(b, p + 2, false);
        if (segLen < 2) break;
        start = p + 4;
        var segEnd = p + 2 + segLen;
        if (marker === 0xE1 && segEnd <= len + 2) {
          if (matches(b, start, 'Exif')) {
            info.hasExif = true;
            info.thumbCount++;
            readTiff(start + 6, Math.min(segEnd, len));
          } else if (matches(b, start, 'http://ns.adobe.com/xap/1.0/')) {
            info.hasXmp = true;
            info.thumbCount++;
          }
        } else if (marker === 0xED && matches(b, start, 'Photoshop 3.0')) {
          info.thumbCount++;                              // IPTC(설명·저작권 등)
        }
        p = segEnd;
      }
    /* ---- PNG ---- */
    } else if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) {
      info.format = 'png';
      p = 8;
      while (p + 8 <= len) {
        var clen = ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
        tag = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
        if (tag === 'eXIf') {
          info.hasExif = true;
          info.thumbCount++;
          readTiff(p + 8, Math.min(p + 8 + clen, len));
        } else if (tag === 'tEXt' || tag === 'iTXt' || tag === 'zTXt') {
          if (findAscii(b, p + 8, Math.min(p + 8 + clen, len), 'xmp') >= 0) { info.hasXmp = true; info.thumbCount++; }
        }
        if (tag === 'IEND' || clen > len) break;
        p += 12 + clen;
      }
    /* ---- WebP ---- */
    } else if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
               b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
      info.format = 'webp';
      p = 12;
      while (p + 8 <= len) {
        sz = (b[p + 4] | (b[p + 5] << 8) | (b[p + 6] << 16) | (b[p + 7] << 24)) >>> 0;
        tag = String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]);
        if (tag === 'EXIF') {
          info.hasExif = true;
          info.thumbCount++;
          var s2 = p + 8;
          if (matches(b, s2, 'Exif')) s2 += 6;
          readTiff(s2, Math.min(p + 8 + sz, len));
        } else if (tag === 'XMP ') { info.hasXmp = true; info.thumbCount++; }
        p += 8 + sz + (sz % 2);
      }
    } else {
      info.format = mime && mime.indexOf('png') >= 0 ? 'png' : (mime || '');
    }

    /* 중복 태그 정리 */
    var seen = {}, clean = [];
    for (j = 0; j < info.tags.length; j++) {
      var key = info.tags[j].name;
      if (seen[key] || !info.tags[j].value) continue;
      seen[key] = true;
      clean.push(info.tags[j]);
    }
    info.tags = clean;
    return info;
  }

  /* ==================================================================
   * 3. 화면 그리기
   * ================================================================== */
  function template() {
    var segTool = [
      '<button type="button" class="bdpm-seg is-on" data-tool="rect" aria-pressed="true">▭ 사각형</button>',
      '<button type="button" class="bdpm-seg" data-tool="brush" aria-pressed="false">✎ 브러시</button>',
      '<button type="button" class="bdpm-seg" data-tool="move" aria-pressed="false">✥ 이동</button>'
    ].join('');
    var segEffect = [
      '<button type="button" class="bdpm-seg is-on" data-effect="mosaic" aria-pressed="true">모자이크</button>',
      '<button type="button" class="bdpm-seg" data-effect="blur" aria-pressed="false">블러</button>',
      '<button type="button" class="bdpm-seg" data-effect="solid" aria-pressed="false">단색 가림</button>'
    ].join('');
    var fmts = CONFIG.FORMATS.map(function (f, i) {
      return '<option value="' + f.mime + '"' + (i === 0 ? ' selected' : '') + '>' + f.label + '</option>';
    }).join('');

    return '' +
      '<div class="bdpm-card">' +
      '<p class="bdpm-kicker">착착도구 / BD083</p>' +
      '<p class="bdpm-title" role="heading" aria-level="3">사진 개인정보 가리기 · 위치정보 삭제</p>' +
      '<p class="bdpm-lead">번호판·송장·얼굴을 모자이크나 블러로 가리고, 사진에 숨어 있는 <b>촬영 위치(GPS)·촬영기기 정보</b>까지 한 번에 지워서 저장합니다.</p>' +

      '<div class="bdpm-drop" data-el="drop">' +
      '<strong>가릴 사진을 여기에 끌어다 놓으세요</strong>' +
      '<label class="bdpm-filebtn">사진 선택<input class="bdpm-file" data-el="file" type="file" accept="' + CONFIG.ACCEPT + '"></label>' +
      '<p class="bdpm-small">JPG · PNG · WebP / 최대 ' + CONFIG.MAX_FILE_MB + 'MB · PC는 Ctrl+V로 붙여넣기도 됩니다</p>' +
      '</div>' +

      '<div class="bdpm-fileinfo" data-el="fileinfo" hidden>' +
      '<div class="bdpm-fileinfo-head"><b class="bdpm-fname" data-el="fname"></b>' +
      '<span class="bdpm-meta" data-el="fmeta"></span>' +
      '<button type="button" class="bdpm-btn" data-el="newfile" style="margin-left:auto">다른 사진</button></div>' +
      '<div class="bdpm-exif" data-el="exif"></div>' +
      '<details class="bdpm-more"><summary>사진에 담긴 정보 자세히 보기</summary><ul data-el="exiflist"></ul></details>' +
      '</div>' +

      '<div class="bdpm-work" data-el="work" hidden>' +
      '<div class="bdpm-toolbar">' +
      '<div class="bdpm-group" role="group" aria-label="가리는 방법">' + segTool + '</div>' +
      '<div class="bdpm-group" role="group" aria-label="가리는 효과">' + segEffect + '</div>' +
      '</div>' +

      '<div class="bdpm-sliders">' +
      '<label data-el="rowMosaic">모자이크 칸 크기 <b data-el="vMosaic">-</b><input type="range" data-el="mosaic" min="2" max="60" step="1" value="20"></label>' +
      '<label data-el="rowBlur">블러 강도 <b data-el="vBlur">-</b><input type="range" data-el="blur" min="1" max="40" step="1" value="12"></label>' +
      '<label data-el="rowBrush" class="is-off">브러시 굵기 <b data-el="vBrush">-</b><input type="range" data-el="brush" min="4" max="120" step="1" value="30"></label>' +
      '<label data-el="rowSolid" class="is-off">가림 색 <span>' +
      '<button type="button" class="bdpm-dot is-on" data-solid="#111111" aria-label="검정으로 가리기" aria-pressed="true"></button>' +
      '<button type="button" class="bdpm-dot" data-solid="#ffffff" aria-label="흰색으로 가리기" aria-pressed="false"></button>' +
      '</span></label>' +
      '</div>' +

      '<div class="bdpm-bar"><span class="bdpm-meta" data-el="count">가린 곳 0곳</span>' +
      '<span class="bdpm-actions">' +
      '<button type="button" class="bdpm-btn" data-el="undo" disabled>되돌리기</button>' +
      '<button type="button" class="bdpm-btn" data-el="redo" disabled>다시 실행</button>' +
      '<button type="button" class="bdpm-btn" data-el="clear" disabled>전체 지우기</button>' +
      '</span></div>' +

      '<div class="bdpm-stagewrap"><div class="bdpm-stage" data-el="stage">' +
      '<canvas class="bdpm-canvas" data-el="canvas" tabindex="0" aria-label="사진 편집 화면. 사각형 도구는 끌어서 가릴 곳을 지정하고, 브러시 도구는 칠하듯 문질러 가립니다."></canvas>' +
      '<span class="bdpm-count" data-el="badge" hidden>0</span>' +
      '<p class="bdpm-drag" data-el="draghint">끌어서 가릴 곳을 지정하세요</p>' +
      '<div class="bdpm-zoom">' +
      '<button type="button" data-el="zoomout" aria-label="축소" title="축소">−</button>' +
      '<button type="button" data-el="zoomfit" title="화면에 맞추기"><span data-el="zoomval">100%</span></button>' +
      '<button type="button" data-el="zoomin" aria-label="확대" title="확대">＋</button>' +
      '</div></div></div>' +

      '<p class="bdpm-hint" data-el="hint">사각형은 번호판·송장·계좌번호처럼 네모난 곳에, 브러시는 얼굴·손글씨처럼 모양이 불규칙한 곳에 쓰면 좋아요. 잘못 가렸으면 <b>되돌리기</b>를 누르세요. (PC: 휠로 확대·이동 / 휴대전화: 두 손가락으로 확대·이동)</p>' +

      '<div class="bdpm-save">' +
      '<div class="bdpm-savehead"><b>가린 사진 저장</b><span class="bdpm-meta" data-el="outinfo"></span></div>' +
      '<div class="bdpm-saverow">' +
      '<label>형식 <select data-el="format">' + fmts + '</select></label>' +
      '<label class="bdpm-q" data-el="qrow">품질 <b data-el="qval">92%</b><input type="range" data-el="quality" min="' + CONFIG.QUALITY_MIN + '" max="100" step="1" value="' + CONFIG.QUALITY_DEFAULT + '"></label>' +
      '<span class="bdpm-est" data-el="estimate">용량 계산 중…</span>' +
      '<button type="button" class="bdpm-primary" data-el="save">저장하기</button>' +
      '</div>' +
      '<p class="bdpm-hint" style="margin:10px 0 0">저장하면 <b>원본 해상도 그대로</b>, 위치·촬영기기 정보가 없는 새 파일로 내려받습니다. 원본 파일은 손대지 않습니다.</p>' +
      '</div>' +

      '<div class="bdpm-msg" data-el="msg" role="status" aria-live="polite"></div>' +
      '</div>' +

      '<div class="bdpm-msg" data-el="msgTop" role="status" aria-live="polite"></div>' +
      '<p class="bdpm-foot">착착도구 · BD083 · v' + CONFIG.VERSION + ' · 사진은 서버로 전송되지 않고 이 브라우저에서만 처리됩니다</p>' +
      '</div>';
  }

  /* ==================================================================
   * 4. 컴포넌트 본체
   * ================================================================== */
  function init(target) {
    var root = typeof target === 'string' ? document.querySelector(target)
      : (target || document.getElementById(CONFIG.ROOT_ID));
    if (!root) return null;
    if (root.getAttribute('data-bdpm-ready') === CONFIG.VERSION) return root.barodoguPhotoMosaic;
    root.id = CONFIG.ROOT_ID;
    root.setAttribute('data-bdpm-ready', CONFIG.VERSION);

    if (!document.getElementById('bdpm-style')) {
      var st = h('style', { id: 'bdpm-style' });
      st.textContent = CSS;
      (document.head || document.documentElement).appendChild(st);
    }

    root.innerHTML = template();

    var el = {}, nodes = root.querySelectorAll('[data-el]');
    for (var ni = 0; ni < nodes.length; ni++) el[nodes[ni].getAttribute('data-el')] = nodes[ni];

    var ctx = el.canvas.getContext('2d');
    var cache = document.createElement('canvas');
    var tmp = { mask: null, fx: null, small: null };

    var WEBP_OK = (function () {
      try {
        var c = document.createElement('canvas');
        c.width = 1; c.height = 1;
        return c.toDataURL('image/webp').indexOf('data:image/webp') === 0;
      } catch (e) { return false; }
    }());
    if (!WEBP_OK) {
      var webpOpt = el.format.querySelector('option[value="image/webp"]');
      if (webpOpt) { webpOpt.disabled = true; webpOpt.textContent = 'WebP (이 브라우저 미지원)'; }
    }

    var S = {
      img: null, src: null, W: 0, H: 0,
      name: '', size: 0, mime: '', exif: null,
      dpr: Math.min(window.devicePixelRatio || 1, CONFIG.DPR_MAX),
      view: { scale: 1, x: 0, y: 0 },
      fitScale: 1, userZoomed: false,
      tool: 'rect', effect: 'mosaic',
      mosaicPx: 20, blurPx: 12, brushPx: 30, solid: '#111111',
      regions: [], past: [], future: [],
      live: null, drawing: null, pointer: null, hover: null,
      pointers: {}, mode: null, pan: null, pinch: null,
      format: 'image/jpeg', quality: CONFIG.QUALITY_DEFAULT / 100,
      dirty: true, busy: false, estimateTimer: null
    };

    var SUPPORT_FILTER = (function () {
      try { return typeof ctx.filter === 'string'; } catch (e) { return false; }
    }());

    /* ---------- 상태 메시지 ---------- */
    function msg(html, type) {
      var workShown = el.work && !el.work.hidden;
      var target = workShown ? el.msg : el.msgTop;
      var other = workShown ? el.msgTop : el.msg;
      target.innerHTML = html || '';
      target.className = 'bdpm-msg' + (type ? ' is-' + type : '');
      if (other) { other.innerHTML = ''; other.className = 'bdpm-msg'; }
    }

    /* ---------- 화면 크기 ---------- */
    function stageSize() {
      return { w: el.stage.clientWidth || 320, h: el.stage.clientHeight || 340 };
    }

    function syncCanvas() {
      var s = stageSize(), dpr = S.dpr;
      var w = Math.max(1, Math.round(s.w * dpr)), hh = Math.max(1, Math.round(s.h * dpr));
      if (el.canvas.width !== w || el.canvas.height !== hh) {
        el.canvas.width = w; el.canvas.height = hh;
        S.dirty = true;
      }
    }

    /* ---------- 보기(확대·이동) ---------- */
    function fit(force) {
      if (!S.src) return;
      var s = stageSize();
      var pad = 12;
      var sc = Math.min((s.w - pad * 2) / S.W, (s.h - pad * 2) / S.H);
      if (!isFinite(sc) || sc <= 0) sc = 1;
      S.view.scale = sc;
      S.view.x = (s.w - S.W * sc) / 2;
      S.view.y = (s.h - S.H * sc) / 2;
      S.fitScale = sc;
      if (force) S.userZoomed = false;
      S.dirty = true;
      updateZoomLabel();
      render();
    }

    function updateZoomLabel() {
      el.zoomval.textContent = Math.round(S.view.scale * 100) + '%';
    }

    function zoomAt(factor, px, py) {
      if (!S.src) return;
      var v = S.view;
      var minS = Math.min(S.fitScale, 1) * 0.4;
      var ns = clamp(v.scale * factor, Math.max(CONFIG.MIN_ZOOM, minS), CONFIG.MAX_ZOOM);
      if (Math.abs(ns - v.scale) < 1e-6) return;
      var f = ns / v.scale;
      v.x = px - (px - v.x) * f;
      v.y = py - (py - v.y) * f;
      v.scale = ns;
      S.userZoomed = true;
      S.dirty = true;
      updateZoomLabel();
      render();
    }

    function centerZoom(factor) {
      var s = stageSize();
      zoomAt(factor, s.w / 2, s.h / 2);
    }

    /* ---------- 좌표 변환 ---------- */
    function canvasPos(e) {
      var r = el.canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function toImage(p) {
      return { x: (p.x - S.view.x) / S.view.scale, y: (p.y - S.view.y) / S.view.scale };
    }

    /* ---------- 임시 캔버스 ---------- */
    function sizedCanvas(key, w, hh) {
      var c = tmp[key];
      if (!c) { c = document.createElement('canvas'); tmp[key] = c; }
      if (c.width !== w || c.height !== hh) { c.width = w; c.height = hh; }
      else {
        var cc = c.getContext('2d');
        cc.setTransform(1, 0, 0, 1, 0, 0);
        cc.globalCompositeOperation = 'source-over';
        cc.clearRect(0, 0, w, hh);
      }
      return c;
    }

    /* ---------- 가리기 효과 1건 그리기 ---------- */
    function drawShape(c, r, k, tx, ty) {
      var i, p;
      c.beginPath();
      if (r.shape === 'rect') {
        c.rect(tx + r.x * k, ty + r.y * k, Math.max(1, r.w * k), Math.max(1, r.h * k));
        return;
      }
      if (r.points.length === 1) {
        p = r.points[0];
        c.arc(tx + p.x * k, ty + p.y * k, Math.max(0.5, r.width * k / 2), 0, Math.PI * 2);
        return;
      }
      p = r.points[0];
      c.moveTo(tx + p.x * k, ty + p.y * k);
      for (i = 1; i < r.points.length; i++) {
        p = r.points[i];
        c.lineTo(tx + p.x * k, ty + p.y * k);
      }
    }

    function paintRegion(c, src, r, k, ox, oy, bw, bh) {
      var bb = { x: ox + r.x * k, y: oy + r.y * k, w: r.w * k, h: r.h * k };
      var pad = r.effect === 'blur' ? Math.ceil(r.strength * k * 3) + 2 : 2;
      var x0 = Math.max(0, Math.floor(bb.x - pad));
      var y0 = Math.max(0, Math.floor(bb.y - pad));
      var x1 = Math.min(bw, Math.ceil(bb.x + bb.w + pad));
      var y1 = Math.min(bh, Math.ceil(bb.y + bb.h + pad));
      var w = x1 - x0, hh = y1 - y0;
      if (w < 1 || hh < 1) return;

      var tx = ox - x0, ty = oy - y0;
      var mask = sizedCanvas('mask', w, hh), m = mask.getContext('2d');
      m.setTransform(1, 0, 0, 1, 0, 0);
      m.fillStyle = '#fff';
      m.strokeStyle = '#fff';
      m.lineJoin = 'round';
      m.lineCap = 'round';
      if (r.shape === 'brush') m.lineWidth = Math.max(1, r.width * k);
      drawShape(m, r, k, tx, ty);
      if (r.shape === 'brush') m.stroke(); else m.fill();

      var fx = sizedCanvas('fx', w, hh), f = fx.getContext('2d');
      f.setTransform(1, 0, 0, 1, 0, 0);
      var sx = (x0 - ox) / k, sy = (y0 - oy) / k, sw = w / k, sh = hh / k;

      if (r.effect === 'solid') {
        f.fillStyle = r.color;
        f.fillRect(0, 0, w, hh);
      } else if (r.effect === 'mosaic') {
        var cell = Math.max(1.5, r.strength * k);
        var cols = Math.max(1, Math.round(w / cell));
        var rows = Math.max(1, Math.round(hh / cell));
        var guard = 0;
        while (cols * rows > 2.5e6 && guard++ < 12) {
          cell *= 1.5;
          cols = Math.max(1, Math.round(w / cell));
          rows = Math.max(1, Math.round(hh / cell));
        }
        var small = sizedCanvas('small', cols, rows), sc = small.getContext('2d');
        sc.setTransform(1, 0, 0, 1, 0, 0);
        sc.imageSmoothingEnabled = true;
        sc.imageSmoothingQuality = 'medium';
        sc.drawImage(src, sx, sy, sw, sh, 0, 0, cols, rows);
        f.imageSmoothingEnabled = false;
        f.drawImage(small, 0, 0, cols, rows, 0, 0, cols * cell, rows * cell);
        f.imageSmoothingEnabled = true;
      } else {
        var rad = Math.max(0.4, r.strength * k);
        if (SUPPORT_FILTER) {
          f.filter = 'blur(' + rad.toFixed(2) + 'px)';
          f.drawImage(src, sx, sy, sw, sh, 0, 0, w, hh);
          f.filter = 'none';
        } else {
          /* filter 미지원 브라우저: 축소→확대 두 번으로 부드럽게 흐리기 */
          var f1 = Math.max(1, Math.round(rad * 1.4));
          var dw1 = Math.max(1, Math.round(w / f1)), dh1 = Math.max(1, Math.round(hh / f1));
          if (dw1 * dh1 <= 0.35 * 2.5e6) {
            var t1 = sizedCanvas('small', dw1, dh1), c1 = t1.getContext('2d');
            c1.setTransform(1, 0, 0, 1, 0, 0);
            c1.imageSmoothingEnabled = true;
            c1.drawImage(src, sx, sy, sw, sh, 0, 0, dw1, dh1);
            f.imageSmoothingEnabled = true;
            f.drawImage(t1, 0, 0, dw1, dh1, 0, 0, w, hh);
          } else {
            f.drawImage(src, sx, sy, sw, sh, 0, 0, w, hh);
          }
        }
      }

      f.globalCompositeOperation = 'destination-in';
      f.drawImage(mask, 0, 0);
      f.globalCompositeOperation = 'source-over';

      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalAlpha = 1;
      c.drawImage(fx, x0, y0);
      c.restore();
    }

    /* ---------- 미리보기 ---------- */
    function rebuild(w, hh) {
      if (cache.width !== w || cache.height !== hh) { cache.width = w; cache.height = hh; }
      var c = cache.getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, w, hh);
      if (!S.src) return;
      var k = S.view.scale * S.dpr;
      var ox = S.view.x * S.dpr, oy = S.view.y * S.dpr;
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
      c.drawImage(S.src, ox, oy, S.W * k, S.H * k);
      for (var i = 0; i < S.regions.length; i++) {
        paintRegion(c, S.src, S.regions[i], k, ox, oy, w, hh);
      }
      S.dirty = false;
    }

    function render() {
      var w = el.canvas.width, hh = el.canvas.height;
      if (!w || !hh) return;
      if (S.dirty) rebuild(w, hh);
      var c = ctx;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, w, hh);
      if (S.src) c.drawImage(cache, 0, 0);

      var k = S.view.scale * S.dpr, ox = S.view.x * S.dpr, oy = S.view.y * S.dpr;
      if (S.live) paintRegion(c, S.src, S.live, k, ox, oy, w, hh);
      if (S.live && S.live.shape === 'rect') {
        c.save();
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.strokeStyle = '#3358f4';
        c.lineWidth = Math.max(1, S.dpr);
        c.setLineDash([5 * S.dpr, 4 * S.dpr]);
        c.strokeRect(ox + S.live.x * k, oy + S.live.y * k, S.live.w * k, S.live.h * k);
        c.restore();
      }
      if (S.tool === 'brush' && S.hover && !S.live && S.src) {
        c.save();
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.beginPath();
        c.arc(S.hover.x * S.dpr, S.hover.y * S.dpr, Math.max(2, S.brushPx * k / 2), 0, Math.PI * 2);
        c.strokeStyle = 'rgba(255,255,255,.95)';
        c.lineWidth = 2 * S.dpr;
        c.stroke();
        c.strokeStyle = 'rgba(20,30,50,.55)';
        c.lineWidth = 1 * S.dpr;
        c.stroke();
        c.restore();
      }
    }

    /* ---------- 가린 곳 목록 / 기록 ---------- */
    function pushHistory() {
      S.past.push(S.regions.slice());
      if (S.past.length > CONFIG.MAX_PARTS_DB) S.past.shift();
      S.future.length = 0;
    }

    function updateCounters() {
      var n = S.regions.length;
      el.count.textContent = n ? '가린 곳 ' + n + '곳' : '가린 곳 0곳';
      el.badge.hidden = !n;
      el.badge.textContent = n + '곳';
      el.undo.disabled = !S.past.length;
      el.redo.disabled = !S.future.length;
      el.clear.disabled = !n;
      el.draghint.classList.toggle('is-off', n > 0);
      scheduleEstimate();
    }

    function commitRegion(r) {
      if (S.regions.length >= CONFIG.MAX_PARTS_DB) {
        msg('가린 곳이 너무 많습니다(최대 ' + CONFIG.MAX_PARTS_DB + '곳). 큰 사각형으로 묶어 주세요.', 'error');
        return;
      }
      pushHistory();
      S.regions.push(r);
      S.live = null;
      S.dirty = true;
      updateCounters();
      render();
      msg('');
    }

    function undo() {
      if (!S.past.length) return;
      S.future.push(S.regions.slice());
      S.regions = S.past.pop();
      S.live = null;
      S.dirty = true;
      updateCounters();
      render();
    }

    function redo() {
      if (!S.future.length) return;
      S.past.push(S.regions.slice());
      S.regions = S.future.pop();
      S.dirty = true;
      updateCounters();
      render();
    }

    function clearAll() {
      if (!S.regions.length) return;
      pushHistory();
      S.regions = [];
      S.dirty = true;
      updateCounters();
      render();
      msg('가린 곳을 모두 지웠습니다. 되돌리기로 되살릴 수 있어요.', 'info');
    }

    /* ---------- 효과 설정 ---------- */
    function currentEffect() { return S.effect; }
    function currentStrength() {
      return S.effect === 'mosaic' ? S.mosaicPx : (S.effect === 'blur' ? S.blurPx : 0);
    }

    function makeRectRegion(a, b) {
      var x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
      var w = Math.abs(b.x - a.x), hh = Math.abs(b.y - a.y);
      x = clamp(x, 0, S.W); y = clamp(y, 0, S.H);
      w = clamp(w, 0, S.W - x); hh = clamp(hh, 0, S.H - y);
      return {
        shape: 'rect', x: x, y: y, w: w, h: hh,
        effect: currentEffect(), strength: currentStrength(), color: S.solid
      };
    }

    function makeBrushRegion(points, width) {
      var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity, i, p;
      for (i = 0; i < points.length; i++) {
        p = points[i];
        if (p.x < minx) minx = p.x;
        if (p.y < miny) miny = p.y;
        if (p.x > maxx) maxx = p.x;
        if (p.y > maxy) maxy = p.y;
      }
      var half = width / 2 + 1;
      minx = clamp(minx - half, 0, S.W); miny = clamp(miny - half, 0, S.H);
      maxx = clamp(maxx + half, 0, S.W); maxy = clamp(maxy + half, 0, S.H);
      return {
        shape: 'brush', points: points, width: width,
        x: minx, y: miny, w: Math.max(1, maxx - minx), h: Math.max(1, maxy - miny),
        effect: currentEffect(), strength: currentStrength(), color: S.solid
      };
    }

    /* ---------- 포인터 처리 ---------- */
    function startPan(p) {
      S.mode = 'pan';
      S.pan = { x: p.x, y: p.y, vx: S.view.x, vy: S.view.y };
      el.stage.classList.add('is-panning');
    }

    function startRect(p) {
      var ip = toImage(p);
      S.mode = 'rect';
      S.drawing = { start: { x: clamp(ip.x, 0, S.W), y: clamp(ip.y, 0, S.H) } };
      S.live = makeRectRegion(S.drawing.start, S.drawing.start);
      render();
    }

    function startBrush(p) {
      var ip = toImage(p);
      if (ip.x < -2 || ip.y < -2 || ip.x > S.W + 2 || ip.y > S.H + 2) return;
      S.mode = 'brush';
      S.drawing = { points: [{ x: clamp(ip.x, 0, S.W), y: clamp(ip.y, 0, S.H) }] };
      S.live = makeBrushRegion(S.drawing.points, S.brushPx);
      render();
    }

    function cancelLive() {
      S.live = null;
      S.drawing = null;
      if (S.mode === 'rect' || S.mode === 'brush') S.mode = null;
      S.dirty = true;
      render();
    }

    function startPinch() {
      var ids = Object.keys(S.pointers);
      if (ids.length < 2) return;
      var a = S.pointers[ids[0]], b = S.pointers[ids[1]];
      S.mode = 'pinch';
      S.pinch = {
        dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2,
        scale: S.view.scale, x: S.view.x, y: S.view.y
      };
    }

    function updatePinch() {
      var ids = Object.keys(S.pointers);
      if (ids.length < 2 || !S.pinch) return;
      var a = S.pointers[ids[0]], b = S.pointers[ids[1]];
      var d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      var cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      var minS = Math.min(S.fitScale, 1) * 0.4;
      var ns = clamp(S.pinch.scale * (d / S.pinch.dist), Math.max(CONFIG.MIN_ZOOM, minS), CONFIG.MAX_ZOOM);
      var f = ns / S.pinch.scale;
      S.view.scale = ns;
      S.view.x = cx - (S.pinch.cx - S.pinch.x) * f;
      S.view.y = cy - (S.pinch.cy - S.pinch.y) * f;
      S.userZoomed = true;
      S.dirty = true;
      updateZoomLabel();
      render();
    }

    function onDown(e) {
      if (!S.src || S.busy) return;
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
      if (el.canvas.setPointerCapture) {
        try { el.canvas.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
      }
      var p = canvasPos(e);
      S.pointers[e.pointerId] = p;
      var ids = Object.keys(S.pointers);
      if (ids.length === 1) {
        if (S.tool === 'move' || e.button === 1 || e.altKey) startPan(p);
        else if (S.tool === 'rect') startRect(p);
        else startBrush(p);
      } else if (ids.length === 2) {
        cancelLive();
        startPinch();
      }
      if (e.cancelable) e.preventDefault();
    }

    function onMove(e) {
      if (!S.src) return;
      S.hover = canvasPos(e);
      if (!(e.pointerId in S.pointers)) {
        if (S.tool === 'brush') render();
        return;
      }
      S.pointers[e.pointerId] = S.hover;
      var p = S.hover;
      if (S.mode === 'pinch') {
        updatePinch();
      } else if (S.mode === 'pan' && S.pan) {
        S.view.x = S.pan.vx + (p.x - S.pan.x);
        S.view.y = S.pan.vy + (p.y - S.pan.y);
        S.dirty = true;
        render();
      } else if (S.mode === 'rect' && S.drawing) {
        var ip = toImage(p);
        S.live = makeRectRegion(S.drawing.start, { x: clamp(ip.x, 0, S.W), y: clamp(ip.y, 0, S.H) });
        render();
      } else if (S.mode === 'brush' && S.drawing) {
        var bp = toImage(p);
        var pts = S.drawing.points;
        var last = pts[pts.length - 1];
        var step = Math.max(CONFIG.MIN_BRUSH_STEP, 1.2 / S.view.scale);
        if (Math.hypot(bp.x - last.x, bp.y - last.y) >= step) {
          pts.push({ x: clamp(bp.x, 0, S.W), y: clamp(bp.y, 0, S.H) });
          S.live = makeBrushRegion(pts, S.brushPx);
          render();
        }
      }
      if (e.cancelable && S.mode) e.preventDefault();
    }

    function onUp(e) {
      if (e.pointerId in S.pointers) delete S.pointers[e.pointerId];
      if (el.canvas.releasePointerCapture && e.pointerId !== undefined) {
        try { el.canvas.releasePointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
      }
      if (S.mode === 'rect' && S.live) {
        var r = S.live;
        if (r.w >= CONFIG.MIN_RECT_IMG_PX && r.h >= CONFIG.MIN_RECT_IMG_PX) commitRegion(r);
        else { S.live = null; S.dirty = true; render(); }
        S.drawing = null; S.mode = null;
      } else if (S.mode === 'brush' && S.live) {
        commitRegion(S.live);
        S.drawing = null; S.mode = null;
      } else if (S.mode === 'pan' || S.mode === 'pinch') {
        if (!Object.keys(S.pointers).length) { S.mode = null; S.pan = null; S.pinch = null; }
        el.stage.classList.remove('is-panning');
      }
    }

    /* ---------- 파일 읽기 ---------- */
    /* JPEG 헤더의 저장 크기(회전 전 픽셀 수) — 브라우저가 EXIF 회전을 적용했는지 판별용 */
    function jpegDims(b) {
      if (!b || b.length < 6 || b[0] !== 0xFF || b[1] !== 0xD8) return null;
      var p = 2, len;
      while (p + 9 < b.length) {
        if (b[p] !== 0xFF) { p++; continue; }
        var m = b[p + 1];
        if (m === 0xFF) { p++; continue; }
        if (m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { p += 2; continue; }
        if (m === 0xD9 || m === 0xDA) break;
        len = (b[p + 2] << 8) | b[p + 3];
        if (len < 2) break;
        if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
          return { h: (b[p + 5] << 8) | b[p + 6], w: (b[p + 7] << 8) | b[p + 8] };
        }
        p += 2 + len;
      }
      return null;
    }

    /* EXIF 회전값(1~8)을 캔버스 변환으로 적용 — 브라우저가 회전을 적용하지 않은 경우의 보정
       'W'/'H' 는 화면에 세운 뒤의 가로·세로 길이입니다. (dw, dh) */
    var ORIENT_M = [
      [1, 0, 0, 1, 0, 0],
      [-1, 0, 0, 1, 'W', 0],
      [-1, 0, 0, -1, 'W', 'H'],
      [1, 0, 0, -1, 0, 'H'],
      [0, 1, 1, 0, 0, 0],
      [0, 1, -1, 0, 'W', 0],
      [0, -1, -1, 0, 'W', 'H'],
      [0, -1, 1, 0, 0, 'H']
    ];

    function drawOriented(c, img, sw, sh, dw, dh, orientation) {
      var m = ORIENT_M[clamp(orientation, 1, 8) - 1];
      var e = m[4] === 'W' ? dw : (m[4] === 'H' ? dh : 0);
      var f = m[5] === 'W' ? dw : (m[5] === 'H' ? dh : 0);
      c.save();
      c.setTransform(m[0], m[1], m[2], m[3], e, f);
      c.drawImage(img, 0, 0, sw, sh);
      c.restore();
    }

    function decode(file) {
      if (window.createImageBitmap) {
        return createImageBitmap(file, { imageOrientation: 'from-image' })
          .catch(function () { return decodeImg(file); });
      }
      return decodeImg(file);
    }

    function decodeImg(file) {
      return new Promise(function (resolve, reject) {
        var url = URL.createObjectURL(file), img = new Image();
        img.onload = function () {
          setTimeout(function () { URL.revokeObjectURL(url); }, 0);
          resolve(img);
        };
        img.onerror = function () {
          URL.revokeObjectURL(url);
          reject(new Error('이미지를 읽을 수 없습니다.'));
        };
        img.src = url;
      });
    }

    function readBuffer(file, limit) {
      var part = limit ? file.slice(0, limit) : file;
      if (part.arrayBuffer) return part.arrayBuffer();
      return new Promise(function (resolve, reject) {
        var fr = new FileReader();
        fr.onload = function () { resolve(fr.result); };
        fr.onerror = function () { reject(fr.error || new Error('파일을 읽지 못했습니다.')); };
        fr.readAsArrayBuffer(part);
      });
    }

    function reset() {
      S.img = null; S.src = null; S.W = 0; S.H = 0;
      S.regions = []; S.past = []; S.future = [];
      S.live = null; S.drawing = null; S.pointers = {}; S.mode = null;
      S.exif = null; S.name = ''; S.size = 0;
      S.dirty = true;
      el.fileinfo.hidden = true;
      el.work.hidden = true;
      el.drop.hidden = false;
      el.file.value = '';
      msg('');
      updateCounters();
    }

    function load(file) {
      if (!file) return;
      var name = file.name || 'photo';
      if (/heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(name)) {
        msg('아이폰 HEIC 사진은 브라우저에 따라 열리지 않습니다. 사진 앱에서 JPG로 저장한 뒤 다시 시도해 주세요.', 'error');
        return;
      }
      if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|gif|bmp)$/i.test(name)) {
        msg('사진 파일(JPG·PNG·WebP)만 열 수 있습니다.', 'error');
        return;
      }
      if (file.size > CONFIG.MAX_FILE_MB * 1048576) {
        msg('사진 용량이 ' + CONFIG.MAX_FILE_MB + 'MB를 넘습니다. 조금 줄인 뒤 다시 시도해 주세요.', 'error');
        return;
      }
      msg('사진을 읽는 중입니다…', 'info');
      S.busy = true;
      el.save.disabled = true;

      var exifInfo = null, headBuf = null;
      readBuffer(file, 2 * 1048576).then(function (buf) {
        headBuf = buf;
        try { exifInfo = parseExif(buf, file.type); } catch (e) { exifInfo = null; }
        return decode(file);
      }).then(function (img) {
        var w = img.width || img.naturalWidth, hh = img.height || img.naturalHeight;
        if (!w || !hh) throw new Error('사진 크기를 확인할 수 없습니다.');
        if (w * hh > CONFIG.MAX_SOURCE_PIXELS) {
          throw new Error('사진 해상도가 너무 큽니다(최대 8,000만 화소). 조금 줄인 뒤 다시 시도해 주세요.');
        }
        /* EXIF 회전: 브라우저가 이미 돌려 놓았으면 그대로, 아니면(사파리 등) 여기서 바로 세웁니다 */
        var orient = exifInfo && exifInfo.orientation ? exifInfo.orientation : 1;
        var dims = (exifInfo && exifInfo.format === 'jpeg') ? jpegDims(headBuf) : null;
        var needRotate = false;
        if (dims && dims.w && dims.h && dims.w !== dims.h && orient >= 5 && orient <= 8) {
          /* 90도 회전(5~8): 브라우저가 이미 돌렸다면 가로·세로가 뒤바뀐 채로 온다 */
          var alreadySwapped = (w === dims.h && hh === dims.w);
          needRotate = !alreadySwapped;
        }
        var outW = needRotate ? hh : w, outH = needRotate ? w : hh;
        var src = document.createElement('canvas');
        src.width = outW; src.height = outH;
        var sc = src.getContext('2d');
        sc.imageSmoothingEnabled = true;
        if (needRotate) {
          drawOriented(sc, img, w, hh, outW, outH, orient);
        } else {
          sc.drawImage(img, 0, 0, w, hh);
        }
        if (img.close) { try { img.close(); } catch (e) { /* 무시 */ } }

        S.img = img; S.src = src; S.W = outW; S.H = outH;
        S.name = name; S.size = file.size; S.mime = file.type;
        S.exif = exifInfo;
        S.regions = []; S.past = []; S.future = [];
        S.live = null; S.drawing = null; S.pointers = {}; S.mode = null;
        S.userZoomed = false;
        S.dirty = true;

        el.drop.hidden = true;
        el.fileinfo.hidden = false;
        el.work.hidden = false;
        el.fname.textContent = name;
        el.fmeta.textContent = outW.toLocaleString() + ' × ' + outH.toLocaleString() + 'px · ' + formatBytes(file.size);
        renderExif(exifInfo, file);
        configureRanges();
        layoutStage();
        updateCounters();
        el.save.disabled = false;
        S.busy = false;
        msg('사진을 불러왔습니다. 가릴 곳을 지정한 뒤 아래에서 저장하세요.', 'info');
        el.canvas.focus({ preventScroll: true });
        setTimeout(function () { fit(true); scheduleEstimate(); }, 30);
      }).catch(function (err) {
        S.busy = false;
        el.save.disabled = !S.src;
        msg(err && err.message ? err.message : '사진을 열지 못했습니다. 다른 사진으로 시도해 주세요.', 'error');
      });
    }

    /* ---------- EXIF 표시 ---------- */
    function renderExif(info, file) {
      var box = el.exif, list = el.exiflist, rows = [], i;
      list.innerHTML = '';
      if (!info) {
        box.className = 'bdpm-exif is-clean';
        box.innerHTML = '<span class="bdpm-pill is-ok">확인</span> 사진 정보를 확인하지 못했습니다. 그래도 저장할 때 메타데이터는 모두 지워집니다.';
        return;
      }
      var camera = [info.make, info.model].filter(Boolean).join(' ');
      var cameraText = camera || '';
      var dateText = prettyDate(info.dateTaken || info.dateTime);

      if (info.gps) {
        box.className = 'bdpm-exif is-warn';
        rows.push('<span class="bdpm-pill is-warn">주의</span> <b>이 사진에는 촬영 위치(GPS)가 저장되어 있습니다</b>');
        rows.push('위도 <code>' + info.lat.toFixed(5) + '</code> · 경도 <code>' + info.lon.toFixed(5) + '</code>' +
          (info.alt !== null ? ' · 고도 ' + Math.round(info.alt) + 'm' : ''));
        var extra = [];
        if (cameraText) extra.push('촬영기기 <b>' + cameraText + '</b>');
        if (dateText) extra.push('촬영일 ' + dateText);
        if (extra.length) rows.push(extra.join(' · '));
        rows.push('아래 <b>저장하기</b>를 누르면 위치·촬영기기 정보가 모두 사라진 새 파일이 만들어집니다.');
      } else if (info.hasExif || info.hasXmp) {
        box.className = 'bdpm-exif is-warn';
        rows.push('<span class="bdpm-pill is-warn">주의</span> <b>촬영 정보(메타데이터)가 저장되어 있습니다</b>');
        var e2 = [];
        if (cameraText) e2.push('촬영기기 <b>' + cameraText + '</b>');
        if (dateText) e2.push('촬영일 ' + dateText);
        if (info.software) e2.push('편집 프로그램 ' + info.software);
        if (e2.length) rows.push(e2.join(' · '));
        rows.push('위치 정보(GPS)는 없지만, 촬영기기·시각 같은 정보가 남아 있습니다. 저장하면 함께 지워집니다.');
      } else {
        box.className = 'bdpm-exif is-clean';
        rows.push('<span class="bdpm-pill is-ok">확인</span> <b>위치·촬영기기 정보가 들어 있지 않은 사진입니다</b>');
        rows.push('그래도 저장할 때 메타데이터를 한 번 더 지우고 새로 인코딩합니다.');
      }
      box.innerHTML = rows.join('<br>');

      for (i = 0; i < info.tags.length; i++) {
        var li = h('li', null, info.tags[i].name + ' : ' + info.tags[i].value);
        list.appendChild(li);
      }
      if (!info.tags.length) {
        list.appendChild(h('li', null, '표시할 세부 항목이 없습니다.'));
      }
      if (info.hasXmp) list.appendChild(h('li', null, 'XMP 메타데이터 : 있음 (편집 이력·위치 포함 가능)'));
      if (!info.tags.length && !info.hasXmp) {
        list.appendChild(h('li', null, '이 사진에는 EXIF·XMP 정보가 없습니다.'));
      }
    }

    function prettyDate(s) {
      if (!s) return '';
      var m = /^(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2})/.exec(s);
      if (!m) return s;
      return m[1] + '.' + m[2] + '.' + m[3] + ' ' + m[4] + ':' + m[5];
    }

    /* ---------- 슬라이더 범위 ---------- */
    function configureRanges() {
      var minDim = Math.min(S.W, S.H);
      var mosMax = clamp(Math.round(minDim / 10), 10, 400);
      var blurMax = clamp(Math.round(minDim / 20), 6, 200);
      var brMin = clamp(Math.round(minDim / 90), 3, 60);
      var brMax = clamp(Math.round(minDim / 6), brMin + 6, 600);

      el.mosaic.min = 2; el.mosaic.max = mosMax;
      S.mosaicPx = clamp(Math.round(minDim * 0.03), 8, mosMax);
      el.mosaic.value = S.mosaicPx;

      el.blur.min = 1; el.blur.max = blurMax;
      S.blurPx = clamp(Math.round(minDim * 0.018), 4, blurMax);
      el.blur.value = S.blurPx;

      el.brush.min = brMin; el.brush.max = brMax;
      S.brushPx = clamp(Math.round(minDim * 0.04), brMin, brMax);
      el.brush.value = S.brushPx;

      syncLabels();
    }

    function syncLabels() {
      el.vMosaic.textContent = S.mosaicPx + 'px';
      el.vBlur.textContent = S.blurPx + 'px';
      el.vBrush.textContent = S.brushPx + 'px';
      el.rowMosaic.classList.toggle('is-off', S.effect !== 'mosaic');
      el.rowBlur.classList.toggle('is-off', S.effect !== 'blur');
      el.rowSolid.classList.toggle('is-off', S.effect !== 'solid');
      el.rowBrush.classList.toggle('is-off', S.tool !== 'brush');
      el.qrow.classList.toggle('is-off', S.format === 'image/png');
      el.qval.textContent = Math.round(S.quality * 100) + '%';
      el.qrow.style.display = S.format === 'image/png' ? 'none' : '';
    }

    function layoutStage() {
      if (!S.W) return;
      var w = el.stage.clientWidth || 320;
      var hh = clamp(Math.round(w * S.H / S.W), CONFIG.STAGE_MIN_H, Math.min(CONFIG.STAGE_MAX_H, Math.round((window.innerHeight || 700) * 0.72)));
      el.stage.style.height = hh + 'px';
      syncCanvas();
    }

    /* ---------- 내보내기 ---------- */
    function exportCanvas() {
      var c = document.createElement('canvas');
      c.width = S.W; c.height = S.H;
      var cc = c.getContext('2d');
      cc.imageSmoothingEnabled = true;
      cc.imageSmoothingQuality = 'high';
      cc.drawImage(S.src, 0, 0);
      for (var i = 0; i < S.regions.length; i++) {
        paintRegion(cc, S.src, S.regions[i], 1, 0, 0, S.W, S.H);
      }
      return c;
    }

    function extOf(mime) {
      for (var i = 0; i < CONFIG.FORMATS.length; i++) {
        if (CONFIG.FORMATS[i].mime === mime) return CONFIG.FORMATS[i].ext;
      }
      return 'jpg';
    }

    function scheduleEstimate() {
      if (!S.src) return;
      if (S.estimateTimer) clearTimeout(S.estimateTimer);
      el.estimate.textContent = '용량 계산 중…';
      S.estimateTimer = setTimeout(updateEstimate, CONFIG.ESTIMATE_DELAY);
    }

    function updateEstimate() {
      S.estimateTimer = null;
      if (!S.src) return;
      if (S.W * S.H > 40e6) { el.estimate.textContent = '원본 ' + formatBytes(S.size); return; }
      try {
        var c = exportCanvas();
        c.toBlob(function (blob) {
          if (blob) el.estimate.textContent = '예상 ' + formatBytes(blob.size);
        }, S.format, S.quality);
      } catch (e) {
        el.estimate.textContent = '';
      }
    }

    function verifyBlob(blob) {
      return readBuffer(blob, 1024 * 1024).then(function (buf) {
        var info = parseExif(buf, blob.type);
        return {
          clean: !info.hasExif && !info.hasXmp && !info.gps && !info.tags.length,
          info: info
        };
      });
    }

    function save() {
      if (!S.src || S.busy) return;
      if (S.W * S.H > CONFIG.MAX_EXPORT_PIXELS) {
        msg('사진이 너무 커서 이 기기에서 저장하지 못할 수 있습니다(1억 화소 초과). 조금 줄인 뒤 다시 시도해 주세요.', 'error');
        return;
      }
      S.busy = true;
      el.save.disabled = true;
      msg('저장할 파일을 만드는 중입니다…', 'info');
      var c, mime = S.format, q = S.quality;
      try { c = exportCanvas(); }
      catch (err) {
        S.busy = false; el.save.disabled = false;
        msg('사진이 너무 커서 처리하지 못했습니다. 조금 줄인 뒤 다시 시도해 주세요.', 'error');
        return;
      }
      var done = function (blob) {
        S.busy = false;
        el.save.disabled = false;
        if (!blob) { msg('저장 파일을 만들지 못했습니다. 다른 형식으로 시도해 주세요.', 'error'); return; }
        var fname = baseName(S.name) + '_가림.' + extOf(mime);
        var url = URL.createObjectURL(blob);
        var a = h('a', { href: url, download: fname });
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
          URL.revokeObjectURL(url);
          if (a.parentNode) a.parentNode.removeChild(a);
        }, 8000);
        el.estimate.textContent = '저장 ' + formatBytes(blob.size);
        verifyBlob(blob).then(function (res) {
          var parts = [];
          parts.push('<span class="bdpm-pill is-ok">저장 완료</span> <b>' + fname + '</b> · ' + formatBytes(blob.size) + ' · ' + S.W.toLocaleString() + '×' + S.H.toLocaleString() + 'px');
          if (res.clean) {
            parts.push('위치(GPS)·촬영기기·EXIF 정보 <b>0건</b>을 확인했습니다.');
            msg(parts.join('<br>'), 'ok');
          } else {
            parts.push('저장 파일에서 메타데이터가 확인되었습니다. 다시 저장해 주세요.');
            msg(parts.join('<br>'), 'error');
          }
        }).catch(function () {
          msg('저장 완료 · ' + fname + ' (' + formatBytes(blob.size) + ')', 'ok');
        });
      };
      c.toBlob(done, mime, mime === 'image/png' ? undefined : q);
    }

    /* ---------- 이벤트 연결 ---------- */
    el.file.addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) load(f);
    });
    el.newfile.addEventListener('click', function () { el.file.click(); });

    var drop = el.drop;
    ['dragenter', 'dragover'].forEach(function (t) {
      root.addEventListener(t, function (e) {
        if (!e.dataTransfer) return;
        e.preventDefault();
        drop.classList.add('is-over');
      });
    });
    ['dragleave', 'drop'].forEach(function (t) {
      root.addEventListener(t, function (e) {
        if (!e.dataTransfer) return;
        e.preventDefault();
        drop.classList.remove('is-over');
        if (t === 'drop') {
          var f = e.dataTransfer.files && e.dataTransfer.files[0];
          if (f) load(f);
        }
      });
    });
    document.addEventListener('paste', function (e) {
      if (!e.clipboardData) return;
      var items = e.clipboardData.items || [], i;
      for (i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf('image/') === 0) {
          var f = items[i].getAsFile();
          if (f) { load(f); e.preventDefault(); }
          return;
        }
      }
    });

    var toolButtons = root.querySelectorAll('[data-tool]');
    for (var ti = 0; ti < toolButtons.length; ti++) {
      toolButtons[ti].addEventListener('click', function () {
        S.tool = this.getAttribute('data-tool');
        for (var k = 0; k < toolButtons.length; k++) {
          var on = toolButtons[k] === this;
          toolButtons[k].classList.toggle('is-on', on);
          toolButtons[k].setAttribute('aria-pressed', on ? 'true' : 'false');
        }
        el.stage.classList.toggle('is-move', S.tool === 'move');
        el.stage.classList.toggle('is-brush', S.tool === 'brush');
        el.draghint.textContent = S.tool === 'rect' ? '끌어서 가릴 곳을 지정하세요'
          : (S.tool === 'brush' ? '문질러서 가릴 곳을 칠하세요' : '사진을 끌어서 옮기고, 휠·핀치로 확대하세요');
        if (S.tool !== 'brush') { S.hover = null; render(); }
        syncLabels();
        el.canvas.focus({ preventScroll: true });
      });
    }

    var effectButtons = root.querySelectorAll('[data-effect]');
    for (var ei = 0; ei < effectButtons.length; ei++) {
      effectButtons[ei].addEventListener('click', function () {
        S.effect = this.getAttribute('data-effect');
        for (var k = 0; k < effectButtons.length; k++) {
          var on = effectButtons[k] === this;
          effectButtons[k].classList.toggle('is-on', on);
          effectButtons[k].setAttribute('aria-pressed', on ? 'true' : 'false');
        }
        syncLabels();
      });
    }

    el.mosaic.addEventListener('input', function () { S.mosaicPx = +this.value; syncLabels(); });
    el.blur.addEventListener('input', function () { S.blurPx = +this.value; syncLabels(); });
    el.brush.addEventListener('input', function () { S.brushPx = +this.value; syncLabels(); render(); });

    var dots = root.querySelectorAll('[data-solid]');
    for (var di = 0; di < dots.length; di++) {
      dots[di].addEventListener('click', function () {
        S.solid = this.getAttribute('data-solid');
        for (var k = 0; k < dots.length; k++) {
          var on = dots[k] === this;
          dots[k].classList.toggle('is-on', on);
          dots[k].setAttribute('aria-pressed', on ? 'true' : 'false');
        }
      });
    }

    el.undo.addEventListener('click', undo);
    el.redo.addEventListener('click', redo);
    el.clear.addEventListener('click', clearAll);
    el.zoomout.addEventListener('click', function () { centerZoom(1 / 1.3); });
    el.zoomin.addEventListener('click', function () { centerZoom(1.3); });
    el.zoomfit.addEventListener('click', function () { fit(true); });
    el.format.addEventListener('change', function () {
      S.format = this.value;
      syncLabels();
      scheduleEstimate();
    });
    el.quality.addEventListener('input', function () {
      S.quality = (+this.value) / 100;
      syncLabels();
      scheduleEstimate();
    });
    el.save.addEventListener('click', save);

    el.canvas.addEventListener('pointerdown', onDown);
    el.canvas.addEventListener('pointermove', onMove);
    el.canvas.addEventListener('pointerup', onUp);
    el.canvas.addEventListener('pointercancel', onUp);
    el.canvas.addEventListener('pointerleave', function (e) {
      if (!(e.pointerId in S.pointers)) { S.hover = null; if (S.tool === 'brush') render(); }
    });
    el.canvas.addEventListener('wheel', function (e) {
      if (!S.src) return;
      e.preventDefault();
      var p = canvasPos(e);
      var f = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016));
      zoomAt(f, p.x, p.y);
    }, { passive: false });

    el.canvas.addEventListener('contextmenu', function (e) { if (S.src) e.preventDefault(); });

    el.canvas.addEventListener('keydown', function (e) {
      if (!S.src) return;
      var step = e.shiftKey ? 60 : 20;
      if (e.key === 'ArrowLeft') { S.view.x += step; S.dirty = true; render(); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { S.view.x -= step; S.dirty = true; render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { S.view.y += step; S.dirty = true; render(); e.preventDefault(); }
      else if (e.key === 'ArrowDown') { S.view.y -= step; S.dirty = true; render(); e.preventDefault(); }
      else if (e.key === '+' || e.key === '=') { centerZoom(1.25); e.preventDefault(); }
      else if (e.key === '-' || e.key === '_') { centerZoom(1 / 1.25); e.preventDefault(); }
      else if (e.key === '0') { fit(true); e.preventDefault(); }
      else if (e.key === 'Escape') { cancelLive(); e.preventDefault(); }
    });

    root.addEventListener('keydown', function (e) {
      var meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      var k = (e.key || '').toLowerCase();
      if (k === 'z' && !e.shiftKey) { undo(); e.preventDefault(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { redo(); e.preventDefault(); }
    });

    var ro = null;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(function () {
        if (!S.src) return;
        syncCanvas();
        if (!S.userZoomed) fit();
        else { S.dirty = true; render(); }
      });
      ro.observe(el.stage);
    } else {
      window.addEventListener('resize', function () {
        if (!S.src) return;
        syncCanvas();
        if (!S.userZoomed) fit();
        else { S.dirty = true; render(); }
      });
    }

    S.dpr = Math.min(window.devicePixelRatio || 1, CONFIG.DPR_MAX);
    syncCanvas();
    updateCounters();

    /* 바깥에서 확인·시험할 수 있는 작은 창구 */
    var api = {
      version: CONFIG.VERSION,
      state: function () {
        return {
          width: S.W, height: S.H,
          regions: S.regions.map(function (r) {
            return { shape: r.shape, x: r.x, y: r.y, w: r.w, h: r.h, effect: r.effect, strength: r.strength, color: r.color, points: r.points ? r.points.length : 0 };
          }),
          view: { scale: S.view.scale, x: S.view.x, y: S.view.y },
          dpr: S.dpr,
          tool: S.tool, effect: S.effect,
          format: S.format, quality: S.quality,
          exif: S.exif,
          canvas: { width: el.canvas.width, height: el.canvas.height },
          stage: { width: el.stage.clientWidth, height: el.stage.clientHeight }
        };
      },
      exportCanvas: exportCanvas,
      parseExif: parseExif,
      fit: fit,
      load: load
    };
    root.barodoguPhotoMosaic = api;

    if (window.location && /[?&]bdpm-debug/.test(window.location.search)) {
      window.__bdpm = api;
      window.__bdpmInternals = { drawOriented: drawOriented, jpegDims: jpegDims, paintRegion: paintRegion, exportCanvas: exportCanvas };
    }
    return api;
  }

  /* ==================================================================
   * 5. 자동 실행
   * ================================================================== */
  function boot() {
    var el = document.getElementById(CONFIG.ROOT_ID);
    if (el && !el.getAttribute('data-bdpm-ready')) init(el);
  }

  var publicApi = window.barodoguPhotoMosaic = window.barodoguPhotoMosaic || {};
  publicApi.init = init;
  publicApi.parseExif = parseExif;
  publicApi.version = CONFIG.VERSION;
  window.BarodoPhotoMosaic = publicApi;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window, document);
