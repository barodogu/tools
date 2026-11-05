/*!
 * 모듈명   : Barodo.HeicToJpg — 아이폰 HEIC 사진 JPG로 바꾸기
 * 용도     : 아이폰 HEIC/HEIF 사진을 JPG(또는 PNG)로 변환
 *            여러 장 한 번에 · 화질/크기/용량 제한 · 촬영 날짜 유지(위치정보 삭제)
 *            한 장씩 저장 · ZIP으로 한 번에 · 공유(사진 앱에 저장) · 크게 보기
 * 기준     : 사파리처럼 HEIC를 직접 여는 브라우저는 내장 디코더 우선 사용,
 *            그 외(크롬·삼성 인터넷·엣지)는 heic2any(libheif)를 cdnjs에서 필요할 때만 불러옴
 *            iOS Safari 캔버스 픽셀 상한(약 1,670만 화소) 자동 보정
 *            EXIF: ISO/IEC 23008-12(HEIF) iinf/iloc의 Exif 항목, JPEG APP1 → 날짜·기종만 다시 기록, GPS 제외
 * 버전     : 1.1.0
 * 최종수정 : 2026-11-05
 * 비고     : 모든 변환은 사용자 기기에서만 실행되며, 사진은 외부 서버로 전송되지 않습니다.
 *            (외부 요청은 변환 프로그램 파일(heic2any, JSZip)을 내려받는 것뿐입니다)
 * 사용법   : 블로그 글에 <div id="bd-heic"></div> 를 두고 이 스크립트를 불러오면 됩니다.
 */
(function (global) {
  'use strict';

  var VERSION = '1.1.0';

  /* ------------------------------------------------------------------
   * CONFIG — 기준값은 모두 여기서만 수정합니다.
   * ------------------------------------------------------------------ */
  var CONFIG = {
    ROOT_ID: 'bd-heic',
    MAX_FILES: 50,                      // 한 번에 처리할 최대 장수
    MAX_FILE_BYTES: 60 * 1024 * 1024,   // 파일 1장 최대 용량(60MB)
    MAX_CANVAS_PIXELS: 16700000,        // iOS 사파리 캔버스 상한(약 1,670만 화소)
    META_HEAD_BYTES: 1024 * 1024,       // HEIC 정보(meta) 상자를 찾을 앞부분 크기
    NATIVE_TIMEOUT_MS: 6000,            // 내장 디코더 시도 제한 시간
    LIB_TIMEOUT_MS: 25000,              // 변환 프로그램 내려받기 제한 시간
    DOWNLOAD_GAP_MS: 500,               // 모두 저장 시 파일 간 간격
    QUALITIES: [
      { key: 'high', label: '고화질', q: 0.92, desc: '보관·인화용' },
      { key: 'normal', label: '보통', q: 0.85, desc: '대부분 추천' },
      { key: 'small', label: '용량 작게', q: 0.72, desc: '업로드용' }
    ],
    SIZES: [
      { key: 'orig', label: '원본 크기', side: 0 },
      { key: '2560', label: '긴 변 2560', side: 2560 },
      { key: '1920', label: '긴 변 1920', side: 1920 },
      { key: '1280', label: '긴 변 1280', side: 1280 }
    ],
    LIMITS: [
      { key: 'none', label: '제한 없음', bytes: 0 },
      { key: '2mb', label: '2MB 이하', bytes: 2 * 1024 * 1024 },
      { key: '1mb', label: '1MB 이하', bytes: 1024 * 1024 },
      { key: '500k', label: '500KB 이하', bytes: 500 * 1024 }
    ],
    LIMIT_SAFETY: 1024,                 // EXIF 등 여유분(바이트)
    SEARCH_Q: [0.4, 0.92],              // 용량 맞춤 품질 탐색 범위
    SEARCH_STEPS: 6,
    SCALE_LADDER: [1, 0.85, 0.7, 0.55, 0.42, 0.3],
    DEFAULTS: { quality: 'normal', size: 'orig', format: 'jpeg', limit: 'none', keepDate: true },
    // cdnjs 버전 고정. 앞의 주소가 실패하면 다음 주소를 시도합니다.
    LIB_URLS: {
      heic2any: [
        'https://cdnjs.cloudflare.com/ajax/libs/heic2any/0.0.4/heic2any.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/heic2any/0.0.3/heic2any.min.js'
      ],
      jszip: ['https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js']
    },
    LIB_GLOBAL: { heic2any: 'heic2any', jszip: 'JSZip' },
    SAMPLE_NAME: 'IMG_0001_sample.HEIC',
    SAMPLE_B64: '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'
  };

  var Barodo = global.Barodo = global.Barodo || {};

  /* ------------------------------------------------------------------
   * 1. 순수 함수 — DOM에 의존하지 않으며 단독 테스트가 가능합니다.
   * ------------------------------------------------------------------ */

  var HEIC_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1', 'mif2'];

  function ascii(bytes, start, len) {
    var s = '';
    for (var i = start; i < start + len && i < bytes.length; i++) { s += String.fromCharCode(bytes[i]); }
    return s;
  }
  function be16(b, o) { return (b[o] << 8) | b[o + 1]; }
  function be32(b, o) { return ((b[o] << 24) >>> 0) + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]); }
  function beN(b, o, n) {
    if (n === 0) { return 0; }
    if (n === 2) { return be16(b, o); }
    if (n === 4) { return be32(b, o); }
    if (n === 8) { return be32(b, o) * 4294967296 + be32(b, o + 4); }
    return NaN;
  }

  /** 파일 앞부분 바이트로 실제 형식을 판별합니다. (확장자는 믿지 않음) */
  function sniff(bytes) {
    if (!bytes || bytes.length < 12) { return 'unknown'; }
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) { return 'jpeg'; }
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) { return 'png'; }
    if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') { return 'webp'; }
    if (ascii(bytes, 0, 3) === 'GIF') { return 'gif'; }
    if (bytes[0] === 0x42 && bytes[1] === 0x4D) { return 'bmp'; }
    if (ascii(bytes, 4, 4) === 'ftyp') {
      var end = Math.min(be32(bytes, 0) || 32, bytes.length);
      var brands = [ascii(bytes, 8, 4)];
      for (var p = 16; p + 4 <= end; p += 4) { brands.push(ascii(bytes, p, 4)); }
      if (brands.indexOf('avif') !== -1 || brands.indexOf('avis') !== -1) { return 'avif'; }
      for (var b = 0; b < brands.length; b++) {
        if (HEIC_BRANDS.indexOf(brands[b]) !== -1) { return 'heic'; }
      }
      if (brands[0] === 'qt  ' || brands[0].indexOf('mp4') === 0 || brands[0] === 'isom' || brands[0] === 'M4V ') { return 'video'; }
    }
    return 'unknown';
  }

  function hasHeicName(name) { return /\.(heic|heif)$/i.test(name || ''); }

  /** IMG_1234.HEIC → IMG_1234.jpg (중복 이름은 (2), (3)… 붙임) */
  function outName(name, used, ext) {
    ext = ext || 'jpg';
    var base = String(name || 'photo').replace(/\.[^.\/\\]+$/, '') || 'photo';
    base = base.replace(/[\\\/:*?"<>|]+/g, '_');
    var candidate = base + '.' + ext;
    var n = 2;
    while (used && used[candidate.toLowerCase()]) { candidate = base + ' (' + n + ').' + ext; n++; }
    if (used) { used[candidate.toLowerCase()] = true; }
    return candidate;
  }

  function formatBytes(n) {
    if (!isFinite(n) || n < 0) { return '-'; }
    if (n < 1024) { return n + 'B'; }
    if (n < 1024 * 1024) { return (n / 1024).toFixed(n < 10240 ? 1 : 0) + 'KB'; }
    return (n / 1024 / 1024).toFixed(1) + 'MB';
  }

  /** 긴 변 제한 + 캔버스 상한을 함께 반영한 크기 */
  function targetSize(w, h, maxSide, maxPixels) {
    var r = 1, reason = '';
    if (maxSide && Math.max(w, h) > maxSide) { r = maxSide / Math.max(w, h); reason = 'side'; }
    if (w * r * h * r > maxPixels) { r = Math.sqrt(maxPixels / (w * h)); reason = 'canvas'; }
    if (r >= 1) { return { width: w, height: h, scaled: false, reason: '' }; }
    return { width: Math.max(1, Math.floor(w * r)), height: Math.max(1, Math.floor(h * r)), scaled: true, reason: reason };
  }
  function fitPixels(w, h, maxPixels) { return targetSize(w, h, 0, maxPixels); }

  function detectEnv(ua) {
    ua = ua || '';
    var inApp = null;
    if (/KAKAOTALK/i.test(ua)) { inApp = '카카오톡'; }
    else if (/Instagram/i.test(ua)) { inApp = '인스타그램'; }
    else if (/FBAN|FBAV/i.test(ua)) { inApp = '페이스북'; }
    else if (/NAVER/i.test(ua) && /inapp/i.test(ua)) { inApp = '네이버 앱'; }
    else if (/Line\//i.test(ua)) { inApp = '라인'; }
    else if (/DaumApps/i.test(ua)) { inApp = '다음 앱'; }
    var ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua));
    var mobile = ios || /Android|Mobile/i.test(ua);
    return { inApp: inApp, ios: ios, mobile: mobile };
  }

  /* ---------- EXIF 읽기 ---------- */

  /** TIFF(EXIF 본문)에서 날짜·기종·방향·GPS 유무를 읽습니다. */
  function parseTiff(b, start) {
    if (start + 8 > b.length) { return null; }
    var bo = ascii(b, start, 2);
    if (bo !== 'II' && bo !== 'MM') { return null; }
    var le = bo === 'II';
    function u16(o) { return le ? (b[o] | (b[o + 1] << 8)) : be16(b, o); }
    function u32(o) { return le ? ((b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + (b[o + 3] << 24 >>> 0)) : be32(b, o); }
    if (u16(start + 2) !== 42) { return null; }
    function readIfd(off) {
      var out = {};
      var p = start + off;
      if (!off || p + 2 > b.length) { return out; }
      var n = u16(p);
      if (n > 500) { return out; }
      for (var i = 0; i < n; i++) {
        var e = p + 2 + i * 12;
        if (e + 12 > b.length) { break; }
        var tagId = u16(e), type = u16(e + 2), count = u32(e + 4);
        var val = null;
        if (type === 2) { // ASCII
          var vo = count <= 4 ? e + 8 : start + u32(e + 8);
          if (vo + count <= b.length) { val = ascii(b, vo, count).replace(/\0[\s\S]*$/, '').trim(); }
        } else if (type === 3) { val = u16(e + 8); }
        else if (type === 4) { val = u32(e + 8); }
        out[tagId] = val;
      }
      return out;
    }
    var ifd0 = readIfd(u32(start + 4));
    var exif = ifd0[0x8769] ? readIfd(ifd0[0x8769]) : {};
    var gps = ifd0[0x8825] ? readIfd(ifd0[0x8825]) : {};
    var info = {
      make: ifd0[0x010F] || '', model: ifd0[0x0110] || '', orientation: ifd0[0x0112] || 1,
      dateTime: ifd0[0x0132] || '', dateOriginal: exif[0x9003] || '', dateDigitized: exif[0x9004] || '',
      offsetOriginal: exif[0x9011] || '', hadGps: Object.keys(gps).length > 0
    };
    if (!(info.orientation >= 1 && info.orientation <= 8)) { info.orientation = 1; }
    return info;
  }

  /** HEIC meta 상자에서 Exif 항목 위치(파일 기준 offset/length)를 찾습니다. */
  function findHeicExif(b) {
    function children(s, e) {
      var list = [];
      var p = s;
      while (p + 8 <= e) {
        var size = be32(b, p), type = ascii(b, p + 4, 4), hdr = 8;
        if (size === 1) { size = beN(b, p + 8, 8); hdr = 16; }
        else if (size === 0) { size = e - p; }
        if (size < hdr) { break; }
        list.push({ type: type, start: p, body: p + hdr, end: Math.min(p + size, e), full: p + size });
        p += size;
      }
      return list;
    }
    var top = children(0, b.length);
    var meta = null;
    for (var i = 0; i < top.length; i++) { if (top[i].type === 'meta') { meta = top[i]; break; } }
    if (!meta || meta.full > b.length) { return null; }
    var inner = children(meta.body + 4, meta.end);
    var exifId = null, iloc = null;
    inner.forEach(function (bx) {
      if (bx.type === 'iinf') {
        var v = b[bx.body];
        var p = bx.body + 4 + (v === 0 ? 2 : 4);
        children(p, bx.end).forEach(function (inf) {
          if (inf.type !== 'infe') { return; }
          var iv = b[inf.body];
          if (iv < 2) { return; }
          var q = inf.body + 4;
          var id = iv === 2 ? be16(b, q) : be32(b, q);
          q += (iv === 2 ? 2 : 4) + 2;
          if (ascii(b, q, 4) === 'Exif') { exifId = id; }
        });
      } else if (bx.type === 'iloc') { iloc = bx; }
    });
    if (exifId === null || !iloc) { return null; }
    var v = b[iloc.body];
    var p = iloc.body + 4;
    var offSize = b[p] >> 4, lenSize = b[p] & 15, baseSize = b[p + 1] >> 4;
    var idxSize = (v === 1 || v === 2) ? (b[p + 1] & 15) : 0;
    p += 2;
    var count = v < 2 ? be16(b, p) : be32(b, p);
    p += v < 2 ? 2 : 4;
    for (var k = 0; k < count && p < iloc.end; k++) {
      var id = v < 2 ? be16(b, p) : be32(b, p);
      p += v < 2 ? 2 : 4;
      var cm = 0;
      if (v === 1 || v === 2) { cm = be16(b, p) & 15; p += 2; }
      p += 2; // data_reference_index
      var base = beN(b, p, baseSize); p += baseSize;
      var ext = be16(b, p); p += 2;
      var first = null;
      for (var x = 0; x < ext; x++) {
        p += idxSize;
        var off = beN(b, p, offSize); p += offSize;
        var len = beN(b, p, lenSize); p += lenSize;
        if (!first) { first = { offset: base + off, length: len }; }
      }
      if (id === exifId) { return cm === 0 && first && first.length ? first : null; }
    }
    return null;
  }

  /** Exif 항목 데이터(앞 4바이트 = TIFF 헤더 위치) → 정보 */
  function parseHeicExifItem(b) {
    if (!b || b.length < 12) { return null; }
    var skip = be32(b, 0);
    var start = 4 + skip;
    if (start < b.length && /^(II|MM)$/.test(ascii(b, start, 2))) { return parseTiff(b, start); }
    for (var i = 0; i < Math.min(64, b.length - 8); i++) { // 일부 기기용 예비 탐색
      if (ascii(b, i, 6) === 'Exif\0\0') { return parseTiff(b, i + 6); }
    }
    return null;
  }

  /** JPEG 세그먼트 목록 */
  function jpegSegments(b) {
    var segs = [];
    var p = 2;
    while (p + 4 <= b.length && b[p] === 0xFF) {
      var m = b[p + 1];
      if (m === 0xFF) { p++; continue; }
      if (m === 0xDA || m === 0xD9) { break; }
      if (m >= 0xD0 && m <= 0xD7) { p += 2; continue; }
      var len = be16(b, p + 2);
      segs.push({ marker: m, start: p, end: p + 2 + len });
      p += 2 + len;
    }
    return { segs: segs, dataStart: p };
  }

  function parseJpegExif(b) {
    var s = jpegSegments(b).segs;
    for (var i = 0; i < s.length; i++) {
      if (s[i].marker === 0xE1 && ascii(b, s[i].start + 4, 6) === 'Exif\0\0') { return parseTiff(b, s[i].start + 10); }
    }
    return null;
  }

  /* ---------- EXIF 쓰기 (날짜·기종·방향만, GPS 없음) ---------- */

  function buildExifApp1(info, orientation, orientOnly) {
    if (orientOnly) { info = {}; }
    if (!info) { return null; }
    var ifd0 = [], exif = [];
    function asc(list, tagId, s) { if (s) { list.push({ tag: tagId, type: 2, str: s }); } }
    asc(ifd0, 0x010F, info.make);
    asc(ifd0, 0x0110, info.model);
    ifd0.push({ tag: 0x0112, type: 3, num: orientation || 1 });
    asc(ifd0, 0x0132, info.dateTime || info.dateOriginal);
    exif.push({ tag: 0x9000, type: 7, raw: [0x30, 0x32, 0x33, 0x32] }); // ExifVersion 0232
    asc(exif, 0x9003, info.dateOriginal);
    asc(exif, 0x9004, info.dateDigitized);
    asc(exif, 0x9011, info.offsetOriginal);
    var hasExif = exif.length > 1;
    if (!orientOnly && !info.make && !info.model && !info.dateTime && !info.dateOriginal) { return null; }
    if (orientOnly) { exif.length = 0; }
    if (hasExif) { ifd0.push({ tag: 0x8769, type: 4, num: 0 }); }
    var ifd0Off = 8;
    var exifOff = ifd0Off + 2 + ifd0.length * 12 + 4;
    var dataOff = hasExif ? exifOff + 2 + exif.length * 12 + 4 : exifOff;
    var data = [];
    function strBytes(s) { var a = []; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); a.push(c < 128 ? c : 63); } a.push(0); return a; }
    var out = [0x4D, 0x4D, 0, 42, 0, 0, 0, 8];
    function w16(v) { out.push((v >> 8) & 255, v & 255); }
    function w32(v) { out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); }
    function writeIfd(list) {
      w16(list.length);
      list.forEach(function (e) {
        w16(e.tag); w16(e.type);
        if (e.type === 2) {
          var bytes = strBytes(e.str);
          w32(bytes.length);
          if (bytes.length <= 4) { while (bytes.length < 4) { bytes.push(0); } out.push.apply(out, bytes); }
          else { w32(dataOff + data.length); data.push.apply(data, bytes); if (data.length % 2) { data.push(0); } }
        } else if (e.type === 3) { w32(1); w16(e.num); w16(0); }
        else if (e.type === 4) { w32(1); w32(e.tag === 0x8769 ? exifOff : e.num); }
        else if (e.type === 7) { w32(e.raw.length); out.push.apply(out, e.raw); }
      });
      w32(0);
    }
    writeIfd(ifd0);
    if (hasExif) { writeIfd(exif); }
    var tiff = out.concat(data);
    var len = 2 + 6 + tiff.length;
    return new Uint8Array([0xFF, 0xE1, (len >> 8) & 255, len & 255, 0x45, 0x78, 0x69, 0x66, 0, 0].concat(tiff));
  }

  /** JPEG에서 APP1(EXIF·XMP)·APP13(IPTC)을 빼고 새 EXIF를 넣습니다. 화질 손실 없음. */
  function rewriteJpeg(b, app1) {
    var r = jpegSegments(b);
    var parts = [b.subarray(0, 2)];
    var inserted = false;
    r.segs.forEach(function (s) {
      if (s.marker === 0xE1 || s.marker === 0xED) { return; }
      if (!inserted && s.marker !== 0xE0) { if (app1) { parts.push(app1); } inserted = true; }
      parts.push(b.subarray(s.start, s.end));
    });
    if (!inserted && app1) { parts.push(app1); }
    parts.push(b.subarray(r.dataStart));
    return new Blob(parts, { type: 'image/jpeg' });
  }

  /** 오류를 "왜 + 어떻게" 한국어 안내로 바꿉니다. */
  function friendlyError(kind, detail) {
    var M = {
      notImage: ['사진 파일이 아니에요.', 'HEIC·JPG·PNG 같은 사진 파일을 골라 주세요. 동영상(MOV)은 바꿀 수 없어요.'],
      video: ['동영상(라이브 포토의 움직이는 부분) 파일이에요.', '사진(.HEIC) 파일만 골라 주세요. 라이브 포토도 사진 부분은 HEIC로 따로 저장돼 있어요.'],
      tooBig: ['파일이 너무 커요(' + (detail || '') + ').', '한 장에 60MB 이하 사진만 바꿀 수 있어요.'],
      tooMany: ['한 번에 너무 많이 골랐어요.', '한 번에 ' + CONFIG.MAX_FILES + '장까지만 바꿀 수 있어요. 나눠서 진행해 주세요.'],
      libLoad: ['HEIC 변환 프로그램을 불러오지 못했어요.', '인터넷 연결을 확인하고 새로고침해 보세요. 광고 차단·데이터 절약 기능을 잠시 끄면 되는 경우가 많아요.'],
      zipLoad: ['ZIP 만들기 프로그램을 불러오지 못했어요.', '인터넷 연결을 확인하거나, 사진마다 「저장」 버튼으로 한 장씩 받아 주세요.'],
      decode: ['이 HEIC 사진은 이 브라우저에서 열 수 없는 형식이에요.', '아이폰 사파리에서 이 도구를 열어 바꾸거나, 아이폰 사진 앱 → 공유 → 「옵션」에서 「가장 호환성 높은」을 골라 보내 보세요.'],
      memory: ['기기 메모리가 부족해 변환을 끝내지 못했어요.', '다른 앱·탭을 닫고, 「세부 설정」에서 크기를 「긴 변 2560」 이하로 고른 뒤 5장 이하씩 나눠서 바꿔 보세요.'],
      read: ['파일을 읽지 못했어요.', '아이클라우드·구글 드라이브에만 있는 사진이면 먼저 기기에 내려받은 뒤 다시 골라 주세요.'],
      limit: ['목표 용량까지 줄이지 못했어요.', '가장 작게 줄인 결과를 저장했어요. 더 작게 하려면 크기를 「긴 변 1280」으로 골라 보세요.'],
      share: ['이 브라우저는 공유 기능을 지원하지 않아요.', '「저장」이나 「ZIP으로 한 번에 받기」를 이용해 주세요.'],
      unknown: ['알 수 없는 이유로 변환하지 못했어요.', '새로고침한 뒤 다시 시도해 보세요. 계속되면 다른 브라우저(크롬·사파리)로 열어 보세요.']
    };
    var m = M[kind] || M.unknown;
    return { kind: kind, why: m[0], how: m[1] };
  }

  /* ------------------------------------------------------------------
   * 2. 브라우저 처리 — 디코딩·변환·저장
   * ------------------------------------------------------------------ */

  function tag(kind, detail) { var e = new Error(kind); var f = friendlyError(kind, detail); e.kind = f.kind; e.why = f.why; e.how = f.how; return e; }

  function readBytes(blob, start, end) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(new Uint8Array(fr.result)); };
      fr.onerror = function () { reject(fr.error || new Error('read')); };
      fr.readAsArrayBuffer(blob.slice(start || 0, end === undefined ? blob.size : end));
    });
  }

  /** 원본의 촬영 정보(EXIF)를 읽습니다. 실패해도 변환은 계속합니다. */
  function readMeta(file, type) {
    if (type === 'jpeg') {
      return readBytes(file, 0, Math.min(file.size, 256 * 1024)).then(parseJpegExif).catch(function () { return null; });
    }
    if (type !== 'heic') { return Promise.resolve(null); }
    return readBytes(file, 0, Math.min(file.size, CONFIG.META_HEAD_BYTES)).then(function (head) {
      var loc = findHeicExif(head);
      if (!loc || loc.offset + loc.length > file.size || loc.length > 1024 * 1024) { return null; }
      return readBytes(file, loc.offset, loc.offset + loc.length).then(parseHeicExifItem);
    }).catch(function () { return null; });
  }

  function loadImageFromBlob(blob, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var url = global.URL.createObjectURL(blob);
      var img = new Image();
      var done = false;
      var timer = setTimeout(function () { finish(new Error('timeout')); }, timeoutMs || 15000);
      function finish(err) {
        if (done) { return; }
        done = true;
        clearTimeout(timer);
        if (err) { global.URL.revokeObjectURL(url); reject(err); return; }
        resolve({ img: img, url: url, width: img.naturalWidth, height: img.naturalHeight,
          release: function () { global.URL.revokeObjectURL(url); img.src = ''; } });
      }
      img.onload = function () {
        if (!img.naturalWidth || !img.naturalHeight) { finish(new Error('size')); return; }
        finish(null);
      };
      img.onerror = function () { finish(new Error('decode')); };
      img.src = url;
    });
  }

  function toBlobP(canvas, mime, q) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) { if (b) { resolve(b); } else { reject(tag('memory')); } }, mime, q);
    });
  }

  function makeCanvas(source, w, h, whiteBg) {
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    if (!ctx) { throw tag('memory'); }
    if (whiteBg) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) { ctx.imageSmoothingQuality = 'high'; }
    ctx.drawImage(source, 0, 0, w, h);
    return canvas;
  }
  function freeCanvas(c) { if (c) { c.width = 1; c.height = 1; } } // iOS 메모리 즉시 반환

  /** 목표 용량 이하가 되는 가장 높은 품질(필요하면 크기도)로 JPEG 만들기 */
  function encodeToLimit(source, w, h, limit, maxQ) {
    var ladder = CONFIG.SCALE_LADDER.slice();
    var best = null;
    function tryScale() {
      if (!ladder.length) { return Promise.resolve({ blob: best.blob, width: best.w, height: best.h, missed: true }); }
      var s = ladder.shift();
      var cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
      var canvas;
      try { canvas = makeCanvas(source, cw, ch, true); } catch (e) { return Promise.reject(e); }
      var lo = CONFIG.SEARCH_Q[0], hi = Math.min(maxQ || CONFIG.SEARCH_Q[1], CONFIG.SEARCH_Q[1]), step = 0, fit = null;
      function probe(q) {
        return toBlobP(canvas, 'image/jpeg', q).then(function (b) {
          if (!best || b.size < best.blob.size) { best = { blob: b, w: cw, h: ch }; }
          return b;
        });
      }
      return probe(hi).then(function (b) {
        if (b.size <= limit) { fit = b; return null; }
        return probe(lo).then(function (b2) {
          if (b2.size > limit) { return null; }
          fit = b2;
          return (function loop() {
            if (step++ >= CONFIG.SEARCH_STEPS) { return null; }
            var mid = (lo + hi) / 2;
            return probe(mid).then(function (bm) {
              if (bm.size <= limit) { fit = bm; lo = mid; } else { hi = mid; }
              return loop();
            });
          })();
        });
      }).then(function () {
        freeCanvas(canvas);
        if (fit) { return { blob: fit, width: cw, height: ch, missed: false }; }
        return tryScale();
      }, function (e) { freeCanvas(canvas); throw e; });
    }
    return tryScale();
  }

  /** 디코딩된 이미지 → 설정대로 인코딩 */
  function encodeImage(src, opts) {
    var t = targetSize(src.width, src.height, opts.maxSide, CONFIG.MAX_CANVAS_PIXELS);
    var notes = [];
    if (t.reason === 'canvas') { notes.push('기기 메모리 한계 때문에 ' + src.width + '×' + src.height + ' → ' + t.width + '×' + t.height + '로 줄였어요.'); }
    var p;
    if (opts.format === 'png') {
      p = Promise.resolve().then(function () {
        var c = makeCanvas(src.img, t.width, t.height, false);
        return toBlobP(c, 'image/png').then(function (b) { freeCanvas(c); return { blob: b, width: t.width, height: t.height }; });
      });
    } else if (opts.limitBytes) {
      p = encodeToLimit(src.img, t.width, t.height, opts.limitBytes - CONFIG.LIMIT_SAFETY, opts.q).then(function (r) {
        if (r.missed) { notes.push('목표 용량까지 못 줄여서 가장 작게 만든 결과예요.'); }
        else if (r.width !== t.width) { notes.push('용량을 맞추려고 ' + r.width + '×' + r.height + '로 줄였어요.'); }
        return r;
      });
    } else {
      p = Promise.resolve().then(function () {
        var c = makeCanvas(src.img, t.width, t.height, true);
        return toBlobP(c, 'image/jpeg', opts.q).then(function (b) { freeCanvas(c); return { blob: b, width: t.width, height: t.height }; });
      });
    }
    return p.then(function (r) { src.release(); r.notes = notes; return r; },
      function (e) { src.release(); throw (e && e.kind) ? e : tag('memory'); });
  }

  /* 외부 라이브러리 지연 로드 — 필요할 때만 cdnjs에서 받습니다. */
  var libPromises = {};
  function loadScript(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      var timer = setTimeout(function () { s.onload = s.onerror = null; reject(new Error('timeout')); }, timeoutMs);
      s.src = url;
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.onload = function () { clearTimeout(timer); resolve(); };
      s.onerror = function () { clearTimeout(timer); if (s.parentNode) { s.parentNode.removeChild(s); } reject(new Error('load')); };
      document.head.appendChild(s);
    });
  }
  function loadLib(name) {
    var g = CONFIG.LIB_GLOBAL[name];
    if (global[g]) { return Promise.resolve(global[g]); }
    if (libPromises[name]) { return libPromises[name]; }
    var urls = CONFIG.LIB_URLS[name].slice();
    var pr = (function tryNext() {
      if (!urls.length) { return Promise.reject(new Error('libLoad')); }
      return loadScript(urls.shift(), CONFIG.LIB_TIMEOUT_MS).then(function () {
        if (!global[g]) { throw new Error('libLoad'); }
        return global[g];
      }, tryNext);
    })();
    libPromises[name] = pr;
    pr.catch(function () { libPromises[name] = null; }); // 다음 시도 때 다시 받기
    return pr;
  }

  var nativeHeic = null; // null=모름, true/false=확인됨
  function heic2anyErr(e) {
    if (e && e.kind) { return e; }
    var msg = String((e && e.message) || e || '');
    if (/memory|allocation|RangeError/i.test(msg)) { return tag('memory'); }
    if ((e && e.code === 3) || /CANVAS/i.test(msg)) { return tag('memory'); }
    return tag('decode');
  }

  /**
   * 파일 한 장을 변환합니다.
   * opts: { q, maxSide, format:'jpeg'|'png', limitBytes, keepDate }
   * 결과: { blob, ext, width, height, method, notes:[], meta, gpsRemoved }
   */
  function convertFile(file, opts, hooks) {
    hooks = hooks || {};
    opts = opts || { q: 0.85, format: 'jpeg', keepDate: true };
    var isJpegOut = opts.format !== 'png';
    var simple = isJpegOut && !opts.maxSide && !opts.limitBytes;
    var type;
    return readBytes(file, 0, 64).catch(function () { throw tag('read'); }).then(function (head) {
      type = sniff(head);
      if (type === 'video') { throw tag('video'); }
      var supported = type === 'heic' || type === 'jpeg' || type === 'png' || type === 'webp' || type === 'gif' || type === 'bmp' || type === 'avif' ||
        (type === 'unknown' && /^image\//.test(file.type || '') && !hasHeicName(file.name));
      if (!supported) { throw tag('notImage'); }
      return readMeta(file, type);
    }).then(function (meta) {
      var main;
      if (type === 'jpeg' && simple) {
        // 원래 JPG(확장자만 HEIC 포함) — 다시 압축하지 않고 정보만 정리
        main = readBytes(file).then(function (all) {
          var o = meta ? meta.orientation : 1;
          // 날짜를 지워도 회전 정보는 남겨야 사진이 눕지 않습니다.
          var app1 = opts.keepDate ? buildExifApp1(meta, o) : (o !== 1 ? buildExifApp1(null, o, true) : null);
          return { blob: rewriteJpeg(all, app1), method: 'rename', notes: [hasHeicName(file.name) ?
            '이름만 HEIC였던 JPG예요. 다시 압축하지 않고 이름만 바꿨어요(화질 그대로).' : '이미 JPG예요. 화질 그대로 저장할 수 있어요.'], exifDone: true };
        });
      } else if (type === 'heic') {
        main = decodeHeic(file, opts, simple, hooks);
      } else {
        main = loadImageFromBlob(file, 15000).catch(function () { throw tag('notImage'); }).then(function (src) {
          return encodeImage(src, opts).then(function (r) { r.method = 'canvas'; return r; });
        });
      }
      return main.then(function (r) {
        r.meta = meta;
        r.ext = isJpegOut ? 'jpg' : 'png';
        r.gpsRemoved = !!(meta && meta.hadGps);
        if (isJpegOut && !r.exifDone) {
          var app1 = opts.keepDate ? buildExifApp1(meta, 1) : null;
          if (app1) {
            return readBytes(r.blob).then(function (bytes) { r.blob = rewriteJpeg(bytes, app1); return r; });
          }
        }
        return r;
      });
    });
  }

  function decodeHeic(file, opts, simple, hooks) {
    var tryNative = nativeHeic === false ? Promise.reject(new Error('skip')) :
      loadImageFromBlob(file.slice(0, file.size, 'image/heic'), CONFIG.NATIVE_TIMEOUT_MS);
    return tryNative.then(function (src) {
      nativeHeic = true;
      return encodeImage(src, opts).then(function (r) { r.method = 'native'; return r; });
    }, function (err) {
      if (err && err.kind) { throw err; }
      if (nativeHeic === null) { nativeHeic = false; }
      if (hooks.onLib) { hooks.onLib(); }
      return loadLib('heic2any').catch(function () { throw tag('libLoad'); }).then(function (heic2any) {
        return heic2any({ blob: file, toType: 'image/jpeg', quality: simple ? opts.q : 0.95, multiple: false });
      }).then(function (out) {
        var blob = Array.isArray(out) ? out[0] : out;
        if (!blob || !blob.size) { throw tag('decode'); }
        blob = blob.type === 'image/jpeg' ? blob : blob.slice(0, blob.size, 'image/jpeg');
        if (simple) { return { blob: blob, method: 'heic2any', notes: [] }; }
        return loadImageFromBlob(blob, 15000).catch(function () { throw tag('memory'); }).then(function (src) {
          return encodeImage(src, opts).then(function (r) { r.method = 'heic2any'; return r; });
        });
      }, function (e) { throw heic2anyErr(e); });
    });
  }

  function base64ToBlob(b64, type) {
    var bin = global.atob(b64);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) { arr[i] = bin.charCodeAt(i); }
    return new Blob([arr], { type: type });
  }

  function triggerDownload(blob, name) {
    var url = global.URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { if (a.parentNode) { document.body.removeChild(a); } global.URL.revokeObjectURL(url); }, 40000);
  }

  function makeZip(items) {
    return loadLib('jszip').catch(function () { throw tag('zipLoad'); }).then(function (JSZip) {
      var zip = new JSZip();
      items.forEach(function (it) { zip.file(it.outName, it.result.blob, { binary: true }); });
      return zip.generateAsync({ type: 'blob', compression: 'STORE', mimeType: 'application/zip' });
    });
  }

  function today() {
    var d = new Date();
    function z(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate());
  }

  /* ------------------------------------------------------------------
   * 3. 화면(UI)
   * ------------------------------------------------------------------ */

  var CSS = [
    '.bdh{--b:#2563eb;--bd:#1e40af;--bl:#eff6ff;--g:#16a34a;--gl:#f0fdf4;--r:#dc2626;--rl:#fef2f2;--t:#1f2937;--m:#6b7280;--line:#e5e7eb;',
    'font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;color:var(--t);max-width:720px;margin:16px auto;box-sizing:border-box;line-height:1.5;word-break:keep-all;overflow-wrap:anywhere;text-align:left}',
    '.bdh *{box-sizing:border-box}',
    '.bdh-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:18px;box-shadow:0 2px 10px rgba(15,23,42,.06)}',
    '.bdh-title{margin:0 0 4px;font-size:20px;font-weight:800;border:0;padding:0;background:none;color:var(--t)}',
    '.bdh-sub{margin:0 0 12px;color:var(--m);font-size:14px}',
    '.bdh-safe{display:flex;gap:8px;align-items:flex-start;background:var(--gl);color:#166534;border-radius:10px;padding:10px 12px;font-size:13.5px;margin-bottom:14px}',
    '.bdh-drop{border:2px dashed #93c5fd;background:var(--bl);border-radius:14px;padding:20px 14px;text-align:center;transition:background .15s,border-color .15s}',
    '.bdh-drop.on{background:#dbeafe;border-color:var(--b)}',
    '.bdh-drop p{margin:8px 0 0;color:var(--m);font-size:13px}',
    '.bdh-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:52px;padding:12px 18px;border-radius:12px;border:0;font-size:16px;font-weight:700;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;font-family:inherit;text-decoration:none;line-height:1.25}',
    '.bdh-btn:disabled{opacity:.5;cursor:default}',
    '.bdh-pri{background:var(--b);color:#fff;width:100%}',
    '.bdh-pri:active{background:var(--bd)}',
    '.bdh-sec{background:#fff;color:var(--b);border:1.5px solid #bfdbfe}',
    '.bdh-sec:active{background:var(--bl)}',
    '.bdh-grn{background:var(--g);color:#fff}',
    '.bdh-ghost{background:transparent;color:var(--m);min-height:44px;font-size:14px;font-weight:600}',
    '.bdh-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}',
    '.bdh-row>.bdh-btn{flex:1 1 140px}',
    '.bdh-lbl{font-size:14px;font-weight:700;margin:16px 0 8px}',
    '.bdh-seg{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}',
    '.bdh-seg.c4{grid-template-columns:repeat(4,1fr)}',
    '.bdh-seg.c2{grid-template-columns:repeat(2,1fr)}',
    '.bdh-seg button{min-height:52px;border:1.5px solid var(--line);background:#fff;border-radius:12px;font-family:inherit;font-size:14.5px;font-weight:700;color:var(--t);cursor:pointer;padding:6px 4px;line-height:1.25;touch-action:manipulation}',
    '.bdh-seg button small{display:block;font-size:11.5px;font-weight:500;color:var(--m)}',
    '.bdh-seg button[aria-pressed="true"]{border-color:var(--b);background:var(--bl);color:var(--bd)}',
    '@media (max-width:420px){.bdh-seg.c4{grid-template-columns:repeat(2,1fr)}}',
    '.bdh-adv{margin-top:14px;border:1px solid var(--line);border-radius:12px;padding:0 12px}',
    '.bdh-adv summary{min-height:48px;display:flex;align-items:center;font-weight:700;font-size:15px;cursor:pointer;list-style:none}',
    '.bdh-adv summary::-webkit-details-marker{display:none}',
    '.bdh-adv summary:after{content:"▾";margin-left:auto;color:var(--m)}',
    '.bdh-adv[open] summary:after{content:"▴"}',
    '.bdh-adv[open]{padding-bottom:12px}',
    '.bdh-adv .bdh-lbl{margin-top:10px}',
    '.bdh-chk{display:flex;gap:10px;align-items:flex-start;margin-top:14px;font-size:14px;cursor:pointer}',
    '.bdh-chk input{width:22px;height:22px;flex:0 0 22px;margin:0;accent-color:var(--b)}',
    '.bdh-chk small{display:block;color:var(--m);font-size:12.5px}',
    '.bdh-hint{font-size:12.5px;color:var(--m);margin-top:6px}',
    '.bdh-msg{border-radius:10px;padding:10px 12px;font-size:14px;margin-top:12px}',
    '.bdh-msg b{display:block}',
    '.bdh-err{background:var(--rl);color:#991b1b;border-left:4px solid var(--r)}',
    '.bdh-warn{background:#fffbeb;color:#92400e;border-left:4px solid #f59e0b;margin:0 0 14px}',
    '.bdh-info{background:var(--bl);color:var(--bd)}',
    '.bdh-prog{height:8px;background:#e5e7eb;border-radius:99px;overflow:hidden;margin-top:14px}',
    '.bdh-prog i{display:block;height:100%;width:0;background:var(--b);transition:width .2s}',
    '.bdh-stat{font-size:13.5px;color:var(--m);margin-top:6px;text-align:center}',
    '.bdh-list{list-style:none;margin:14px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}',
    '.bdh-item{display:flex;gap:10px;align-items:center;border:1px solid var(--line);border-radius:12px;padding:8px;background:#fff;margin:0}',
    '.bdh-th{flex:0 0 64px;width:64px;height:64px;border-radius:8px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:22px;overflow:hidden;border:0;padding:0;cursor:pointer}',
    '.bdh-th img{width:100%;height:100%;object-fit:cover;display:block;margin:0}',
    '.bdh-meta{flex:1 1 auto;min-width:0;font-size:13px}',
    '.bdh-name{font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.bdh-size{color:var(--m)}',
    '.bdh-tags{display:flex;flex-wrap:wrap;gap:4px;margin-top:3px}',
    '.bdh-tag{font-size:11.5px;padding:1px 7px;border-radius:99px;background:#f3f4f6;color:#374151}',
    '.bdh-tag.g{background:var(--gl);color:#166534}',
    '.bdh-note{color:#92400e;font-size:12.5px}',
    '.bdh-ierr{color:var(--r);font-size:12.5px;font-weight:700}',
    '.bdh-item .bdh-btn{flex:0 0 auto;min-height:44px;padding:8px 14px;font-size:14px}',
    '.bdh-ok{color:var(--g);font-weight:700}',
    '.bdh-done{background:var(--gl);border-radius:12px;padding:12px;margin-top:14px;font-size:14px;color:#166534;text-align:center;font-weight:700}',
    '.bdh-acts{display:flex;flex-direction:column;gap:8px;margin-top:10px}',
    '.bdh-acts .bdh-btn{width:100%}',
    '.bdh-ov,.bdh-ov *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif}',
    '.bdh-ov{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.88);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px}',
    '.bdh-ov img{max-width:100%;max-height:78vh;object-fit:contain;border-radius:6px;background:#fff}',
    '.bdh-ov p{color:#e5e7eb;font-size:13px;margin:10px 0;text-align:center}',
    '.bdh-ov .bdh-btn{min-width:160px}',
    '@media (max-width:420px){.bdh-card{padding:14px;border-radius:14px}.bdh-title{font-size:18px}.bdh-th{flex-basis:56px;width:56px;height:56px}}'
  ].join('');

  function injectStyle() {
    if (document.getElementById('bdh-style')) { return; }
    var st = document.createElement('style');
    st.id = 'bdh-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function el(tagName, attrs, children) {
    var n = document.createElement(tagName);
    if (attrs) {
      for (var k in attrs) {
        if (!attrs.hasOwnProperty(k)) { continue; }
        if (k === 'text') { n.textContent = attrs[k]; }
        else if (k === 'class') { n.className = attrs[k]; }
        else if (k.indexOf('on') === 0) { n.addEventListener(k.slice(2), attrs[k]); }
        else { n.setAttribute(k, attrs[k]); }
      }
    }
    (children || []).forEach(function (c) { if (c) { n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); } });
    return n;
  }

  function msgBox(cls, why, how) {
    return el('div', { class: 'bdh-msg ' + cls, role: cls === 'bdh-err' ? 'alert' : 'status' }, [el('b', { text: why }), how ? document.createTextNode(how) : null]);
  }

  function segGroup(list, key, cls, getLabel, onPick) {
    var btns = list.map(function (o) {
      var b = el('button', { type: 'button', 'aria-pressed': String(o.key === key), 'data-v': o.key }, getLabel(o));
      b.addEventListener('click', function () {
        if (onPick(o) === false) { return; }
        btns.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      });
      return b;
    });
    return { node: el('div', { class: 'bdh-seg ' + (cls || ''), role: 'group' }, btns), btns: btns };
  }

  function mount(root) {
    if (typeof root === 'string') { root = document.getElementById(root); }
    if (!root || root.getAttribute('data-bdh')) { return null; }
    root.setAttribute('data-bdh', VERSION);
    injectStyle();

    var nav = global.navigator || {};
    var env = detectEnv(nav.userAgent);
    var D = CONFIG.DEFAULTS;
    var state = { quality: D.quality, size: D.size, format: D.format, limit: D.limit, keepDate: D.keepDate, items: [], busy: false, used: {} };
    function find(list, key) { return list.filter(function (x) { return x.key === key; })[0]; }
    function currentOpts() {
      return { q: find(CONFIG.QUALITIES, state.quality).q, maxSide: find(CONFIG.SIZES, state.size).side, format: state.format,
        limitBytes: state.format === 'jpeg' ? find(CONFIG.LIMITS, state.limit).bytes : 0, keepDate: state.keepDate };
    }
    function guard() { if (state.busy) { return false; } markDirty(); return true; }

    var input = el('input', { type: 'file', multiple: 'multiple', accept: '.heic,.heif,.HEIC,.HEIF,image/heic,image/heif,image/*', style: 'display:none' });
    var pickBtn = el('button', { type: 'button', class: 'bdh-btn bdh-pri', text: '📂 HEIC 사진 선택하기' });
    var sampleBtn = el('button', { type: 'button', class: 'bdh-btn bdh-sec', text: '🧪 예시 사진으로 체험하기' });
    var drop = el('div', { class: 'bdh-drop' }, [pickBtn, el('p', { text: '여러 장을 한 번에 고를 수 있어요 · PC는 여기로 끌어다 놓아도 돼요' })]);

    var qSeg = segGroup(CONFIG.QUALITIES, state.quality, '', function (q) { return [q.label, el('small', { text: q.desc })]; },
      function (q) { if (!guard()) { return false; } state.quality = q.key; });
    var sSeg = segGroup(CONFIG.SIZES, state.size, 'c4', function (s) { return [s.label]; },
      function (s) { if (!guard()) { return false; } state.size = s.key; });
    var lSeg = segGroup(CONFIG.LIMITS, state.limit, 'c4', function (l) { return [l.label]; },
      function (l) { if (!guard()) { return false; } state.limit = l.key; });
    var fSeg = segGroup([{ key: 'jpeg', label: 'JPG', desc: '어디든 올라가요' }, { key: 'png', label: 'PNG', desc: '무손실·용량 큼' }], state.format, 'c2',
      function (f) { return [f.label, el('small', { text: f.desc })]; },
      function (f) { if (!guard()) { return false; } state.format = f.key; syncFormat(); });
    var keepChk = el('input', { type: 'checkbox' });
    keepChk.checked = state.keepDate;
    keepChk.addEventListener('change', function () { if (state.busy) { keepChk.checked = state.keepDate; return; } state.keepDate = keepChk.checked; markDirty(); });
    var limitWrap = el('div', null, [el('div', { class: 'bdh-lbl', text: '용량 제한 (JPG)' }), lSeg.node,
      el('div', { class: 'bdh-hint', text: '사이트에 「○MB 이하」라고 써 있으면 골라 주세요. 화질을 자동으로 맞춰요.' })]);
    var keepWrap = el('label', { class: 'bdh-chk' }, [keepChk, el('span', null, [
      document.createTextNode('촬영 날짜·기종은 남기고 위치정보(GPS)는 지우기'),
      el('small', { text: '끄면 날짜까지 모든 정보를 지워요. 사진 앱에서 날짜순 정리가 필요하면 켜 두세요.' })])]);
    function syncFormat() {
      var jpg = state.format === 'jpeg';
      limitWrap.style.display = jpg ? '' : 'none';
      keepWrap.style.display = jpg ? '' : 'none';
      qSeg.node.style.opacity = jpg ? '' : '.45';
    }
    var adv = el('details', { class: 'bdh-adv' }, [
      el('summary', { text: '⚙️ 세부 설정 (크기·용량·형식·위치정보)' }),
      el('div', { class: 'bdh-lbl', text: '사진 크기' }), sSeg.node,
      el('div', { class: 'bdh-hint', text: '원본 크기가 너무 커서 안 올라가면 「긴 변 1920」을 추천해요.' }),
      limitWrap,
      el('div', { class: 'bdh-lbl', text: '저장 형식' }), fSeg.node,
      keepWrap
    ]);

    var notice = el('div');
    var errBox = el('div');
    var prog = el('div', { class: 'bdh-prog', style: 'display:none' }, [el('i')]);
    var stat = el('div', { class: 'bdh-stat', 'aria-live': 'polite' });
    var list = el('ul', { class: 'bdh-list' });
    var doneBox = el('div');
    var shareBtn = el('button', { type: 'button', class: 'bdh-btn bdh-grn', text: '📤 공유 · 사진 앱에 저장' });
    var zipBtn = el('button', { type: 'button', class: 'bdh-btn bdh-pri', text: '🗜️ ZIP으로 한 번에 받기' });
    var saveAllBtn = el('button', { type: 'button', class: 'bdh-btn bdh-sec', text: '⬇️ 한 장씩 모두 저장' });
    var redoBtn = el('button', { type: 'button', class: 'bdh-btn bdh-sec', text: '🔄 바뀐 설정으로 다시 변환', style: 'display:none' });
    var clearBtn = el('button', { type: 'button', class: 'bdh-btn bdh-ghost', text: '처음부터 다시' });
    var actions = el('div', { class: 'bdh-acts', style: 'display:none' }, [redoBtn, shareBtn, zipBtn, saveAllBtn, clearBtn]);
    var actErr = el('div');

    var card = el('div', { class: 'bdh-card' }, [
      el('div', { class: 'bdh-title', role: 'heading', 'aria-level': '3', text: '📷 아이폰 HEIC 사진 → JPG 바꾸기' }),
      el('p', { class: 'bdh-sub', text: 'HEIC 사진이 안 열리거나 업로드가 안 될 때, JPG로 바꿔서 저장하세요.' }),
      el('div', { class: 'bdh-safe' }, [el('span', { text: '🔒' }), el('span', { text: '사진은 서버로 전송되지 않아요. 이 기기 브라우저 안에서만 바뀌어요.' })]),
      notice, drop,
      el('div', { class: 'bdh-row' }, [sampleBtn]),
      el('div', { class: 'bdh-lbl', text: '화질 선택' }), qSeg.node,
      adv,
      errBox, prog, stat, list, doneBox, actions, actErr, input
    ]);
    root.innerHTML = '';
    root.appendChild(el('div', { class: 'bdh' }, [card]));
    syncFormat();

    if (env.inApp) {
      notice.appendChild(msgBox('bdh-warn', env.inApp + ' 안에서 열면 저장이 안 될 수 있어요.',
        '화면 오른쪽 위·아래의 「⋯」 메뉴 → 「다른 브라우저로 열기」(사파리·크롬·삼성 인터넷)로 열어 주세요.'));
    }

    function canShareFiles(files) {
      try { return !!(nav.share && nav.canShare && nav.canShare({ files: files })); } catch (e) { return false; }
    }

    function showError(box, e) {
      box.innerHTML = '';
      if (e) { box.appendChild(msgBox('bdh-err', e.why, e.how)); }
    }
    function setProgress(done, total, text) {
      prog.style.display = total ? '' : 'none';
      prog.firstChild.style.width = total ? Math.round(done / total * 100) + '%' : '0';
      stat.textContent = text || '';
    }
    function setBusy(b) {
      state.busy = b;
      [pickBtn, sampleBtn, saveAllBtn, zipBtn, shareBtn, redoBtn].forEach(function (x) { x.disabled = b; });
    }
    function okItems() { return state.items.filter(function (x) { return x.status === 'done'; }); }
    function markDirty() { if (okItems().length || state.items.some(function (x) { return x.status === 'error'; })) { redoBtn.style.display = ''; } }

    function openViewer(item) {
      var ov = el('div', { class: 'bdh-ov', role: 'dialog', 'aria-label': '크게 보기' });
      var close = function () { if (ov.parentNode) { ov.parentNode.removeChild(ov); } document.removeEventListener('keydown', onKey); };
      function onKey(e) { if (e.key === 'Escape') { close(); } }
      ov.appendChild(el('img', { src: item.url, alt: item.outName }));
      ov.appendChild(el('p', { text: item.outName + ' · ' + (item.result.width ? item.result.width + '×' + item.result.height + ' · ' : '') + formatBytes(item.result.blob.size) +
        (env.mobile ? ' · 사진을 길게 누르면 바로 저장할 수도 있어요' : '') }));
      ov.appendChild(el('button', { type: 'button', class: 'bdh-btn bdh-sec', text: '닫기', onclick: close }));
      ov.addEventListener('click', function (e) { if (e.target === ov) { close(); } });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(ov);
    }

    function renderItem(item) {
      var th = el('button', { type: 'button', class: 'bdh-th', 'aria-label': '크게 보기', text: '⏳' });
      th.addEventListener('click', function () { if (item.status === 'done') { openViewer(item); } });
      var meta = el('div', { class: 'bdh-meta' });
      var li = el('li', { class: 'bdh-item' }, [th, meta]);
      item.ui = { li: li, th: th, meta: meta };
      list.appendChild(li);
      updateItem(item);
    }
    function updateItem(item) {
      var u = item.ui;
      u.meta.innerHTML = '';
      if (u.save) { u.li.removeChild(u.save); u.save = null; }
      u.meta.appendChild(el('div', { class: 'bdh-name', text: item.status === 'done' ? item.outName : item.file.name }));
      if (item.status === 'wait' || item.status === 'working') {
        u.th.textContent = '⏳';
        u.meta.appendChild(el('div', { class: 'bdh-size', text: formatBytes(item.file.size) + (item.status === 'working' ? ' · 바꾸는 중…' : ' · 기다리는 중') }));
      } else if (item.status === 'done') {
        var r = item.result;
        u.th.textContent = '';
        var thumb = el('img', { src: item.url, alt: '' });
        u.th.appendChild(thumb);
        u.meta.appendChild(el('div', { class: 'bdh-size' }, [formatBytes(item.file.size) + ' → ', el('span', { class: 'bdh-ok', text: formatBytes(r.blob.size) + ' ' + r.ext.toUpperCase() })]));
        var tags = el('div', { class: 'bdh-tags' });
        if (r.width) { tags.appendChild(el('span', { class: 'bdh-tag', text: r.width + '×' + r.height })); }
        if (r.ext === 'jpg' && state.keepDateUsed && r.meta && (r.meta.dateOriginal || r.meta.dateTime)) { tags.appendChild(el('span', { class: 'bdh-tag g', text: '📅 날짜 유지' })); }
        if (r.gpsRemoved) { tags.appendChild(el('span', { class: 'bdh-tag g', text: '📍 위치정보 삭제' })); }
        u.meta.appendChild(tags);
        if (!r.width) {
          thumb.addEventListener('load', function () {
            if (r.width) { return; }
            r.width = thumb.naturalWidth; r.height = thumb.naturalHeight;
            tags.insertBefore(el('span', { class: 'bdh-tag', text: r.width + '×' + r.height }), tags.firstChild);
          });
        }
        (r.notes || []).forEach(function (n) { u.meta.appendChild(el('div', { class: 'bdh-note', text: n })); });
        u.save = el('button', { type: 'button', class: 'bdh-btn bdh-sec', text: '저장' });
        u.save.addEventListener('click', function () { triggerDownload(r.blob, item.outName); });
        u.li.appendChild(u.save);
      } else if (item.status === 'error') {
        u.th.textContent = '⚠️';
        u.meta.appendChild(el('div', { class: 'bdh-ierr', text: item.error.why }));
        u.meta.appendChild(el('div', { class: 'bdh-size', text: item.error.how }));
      }
    }

    function addFiles(files) {
      if (state.busy) { return; }
      showError(errBox, null);
      files = Array.prototype.slice.call(files || []);
      if (!files.length) { return; }
      if (files.length + state.items.length > CONFIG.MAX_FILES) { showError(errBox, tag('tooMany')); return; }
      var newItems = files.map(function (f) { return { file: f, status: 'wait' }; });
      newItems.forEach(function (it) {
        if (it.file.size > CONFIG.MAX_FILE_BYTES) { it.status = 'error'; it.error = tag('tooBig', formatBytes(it.file.size)); }
        state.items.push(it); renderItem(it);
      });
      run(newItems.filter(function (it) { return it.status === 'wait'; }));
    }

    function run(queue) {
      if (!queue.length) { return; }
      setBusy(true);
      doneBox.innerHTML = '';
      showError(actErr, null);
      redoBtn.style.display = 'none';
      var opts = currentOpts();
      state.keepDateUsed = opts.keepDate;
      var i = 0;
      var t0 = Date.now();
      queue.forEach(function (it) { it.status = 'wait'; updateItem(it); });
      (function next() {
        if (i >= queue.length) { finish(); return; }
        var item = queue[i];
        item.status = 'working'; updateItem(item);
        setProgress(i, queue.length, (i + 1) + ' / ' + queue.length + '장 바꾸는 중…');
        convertFile(item.file, opts, { onLib: function () { stat.textContent = '처음 한 번만 변환 프로그램을 내려받는 중이에요(약 1.3MB)…'; } })
          .then(function (res) {
            if (item.url) { global.URL.revokeObjectURL(item.url); }
            item.result = res;
            item.outName = outName(item.file.name, state.used, res.ext);
            item.url = global.URL.createObjectURL(res.blob);
            item.status = 'done';
          }, function (e) {
            item.status = 'error';
            item.error = e && e.kind ? e : tag('unknown');
            if (item.error.kind === 'libLoad') { showError(errBox, item.error); }
          })
          .then(function () { updateItem(item); i++; setTimeout(next, 30); });
      })();
      function finish() {
        setBusy(false);
        var ok = okItems();
        var bad = state.items.filter(function (x) { return x.status === 'error'; });
        setProgress(0, 0, '');
        root.setAttribute('data-bdh-ms', String(Date.now() - t0));
        actions.style.display = state.items.length ? '' : 'none';
        var files = ok.map(toFile);
        shareBtn.style.display = ok.length && canShareFiles(files) ? '' : 'none';
        zipBtn.style.display = ok.length > 1 ? '' : 'none';
        saveAllBtn.style.display = ok.length > 1 ? '' : 'none';
        doneBox.innerHTML = '';
        if (ok.length) {
          var total = ok.reduce(function (s, x) { return s + x.result.blob.size; }, 0);
          doneBox.appendChild(el('div', { class: 'bdh-done', text: '✅ ' + ok.length + '장 변환 완료 (' + formatBytes(total) + ')' + (bad.length ? ' · ' + bad.length + '장 실패' : '') }));
          if (env.ios) {
            doneBox.appendChild(msgBox('bdh-info', '아이폰은 「공유 · 사진 앱에 저장」 → 「이미지 저장」을 누르면 사진 앱에 바로 들어가요.',
              '「저장」 버튼으로 받으면 「파일」 앱의 다운로드 폴더에 저장돼요.'));
          }
        }
      }
    }

    function toFile(it) {
      if (it._file && it._fileBlob === it.result.blob) { return it._file; }
      var f;
      try { f = new File([it.result.blob], it.outName, { type: it.result.blob.type || 'image/jpeg' }); } catch (e) { f = it.result.blob; }
      it._file = f; it._fileBlob = it.result.blob;
      return f;
    }

    pickBtn.addEventListener('click', function () { input.value = ''; input.click(); });
    input.addEventListener('change', function () { addFiles(input.files); });
    sampleBtn.addEventListener('click', function () {
      var blob = base64ToBlob(CONFIG.SAMPLE_B64, 'image/heic');
      var file;
      try { file = new File([blob], CONFIG.SAMPLE_NAME, { type: 'image/heic' }); }
      catch (e) { file = blob; file.name = CONFIG.SAMPLE_NAME; }
      addFiles([file]);
    });
    saveAllBtn.addEventListener('click', function () {
      okItems().forEach(function (it, k) { setTimeout(function () { triggerDownload(it.result.blob, it.outName); }, k * CONFIG.DOWNLOAD_GAP_MS); });
    });
    zipBtn.addEventListener('click', function () {
      var ok = okItems();
      if (!ok.length || state.busy) { return; }
      setBusy(true);
      showError(actErr, null);
      stat.textContent = 'ZIP 파일을 만드는 중이에요…';
      makeZip(ok).then(function (zip) {
        triggerDownload(zip, 'heic-to-jpg_' + today() + '.zip');
        stat.textContent = '✅ ZIP 저장을 시작했어요 (' + formatBytes(zip.size) + ')';
      }, function (e) { stat.textContent = ''; showError(actErr, e && e.kind ? e : tag('zipLoad')); })
        .then(function () { setBusy(false); });
    });
    shareBtn.addEventListener('click', function () {
      var files = okItems().map(toFile);
      if (!canShareFiles(files)) { showError(actErr, tag('share')); return; }
      nav.share({ files: files }).catch(function (e) {
        if (e && e.name === 'AbortError') { return; } // 사용자가 닫음
        showError(actErr, tag('share'));
      });
    });
    redoBtn.addEventListener('click', function () {
      if (state.busy) { return; }
      state.used = {};
      run(state.items.filter(function (x) { return x.status === 'done' || (x.status === 'error' && x.error.kind !== 'tooBig'); }));
    });
    clearBtn.addEventListener('click', function () {
      if (state.busy) { return; }
      state.items.forEach(function (it) { if (it.url) { global.URL.revokeObjectURL(it.url); } });
      state.items = []; state.used = {};
      list.innerHTML = ''; doneBox.innerHTML = ''; actions.style.display = 'none'; redoBtn.style.display = 'none';
      showError(errBox, null); showError(actErr, null); setProgress(0, 0, '');
    });

    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('on'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('on'); });
    });
    drop.addEventListener('drop', function (e) { if (e.dataTransfer) { addFiles(e.dataTransfer.files); } });

    return { root: root, addFiles: addFiles, state: state };
  }

  Barodo.HeicToJpg = {
    VERSION: VERSION, CONFIG: CONFIG,
    sniff: sniff, outName: outName, fitPixels: fitPixels, targetSize: targetSize, formatBytes: formatBytes,
    detectEnv: detectEnv, friendlyError: friendlyError,
    parseTiff: parseTiff, findHeicExif: findHeicExif, parseHeicExifItem: parseHeicExifItem, parseJpegExif: parseJpegExif,
    buildExifApp1: buildExifApp1, rewriteJpeg: rewriteJpeg, readMeta: readMeta,
    convertFile: convertFile, mount: mount
  };

  function autoMount() { var r = document.getElementById(CONFIG.ROOT_ID); if (r) { mount(r); } }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', autoMount); }
  else { autoMount(); }
})(typeof window !== 'undefined' ? window : this);