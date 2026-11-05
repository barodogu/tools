/*!
 * 모듈명   : Barodo.HwpViewer — HWP·HWPX 파일 바로 보기
 * 용도     : 한글(.hwp, .hwpx) 문서를 설치 없이 브라우저에서 열어 보기
 *            글자·문단 모양 · 표(셀 합치기·테두리·배경) · 그림 · 머리말/꼬리말 · 각주·메모
 *            찾기 · 글자 크기 · 글자 복사 · 표 복사(엑셀 붙여넣기) · TXT/HTML 저장 · PDF 저장(인쇄) · 공유
 *            배포용 문서 열기(보기 전용: 작성자 뜻에 따라 복사·저장·인쇄는 막음)
 * 기준     : HWP 5.0 = OLE 복합 파일 + raw deflate 레코드 (한컴 공개 문서 형식 5.0 기준)
 *            HWPX    = ZIP + XML (KS X 6101 / OWPML)
 *            압축 해제는 브라우저 내장 DecompressionStream 우선, 없으면 자체 inflate 사용
 *            배포용 문서는 공개된 방식(MSVC rand 시드 → SHA1 앞 16바이트 → AES-128 ECB)으로 풉니다
 *            → 외부 라이브러리·외부 요청 없음
 * 버전     : 1.0.1
 * 최종수정 : 2026-11-06
 * 비고     : 문서는 사용자 기기 안에서만 읽으며, 어떤 서버로도 전송하지 않습니다.
 * 사용법   : 블로그 글에 <div id="bd-hwp"></div> 를 두고 이 스크립트를 불러오면 됩니다.
 */
(function (global) {
  'use strict';

  var VERSION = '1.0.1';

  /* ------------------------------------------------------------------
   * CONFIG — 기준값은 여기서만 수정합니다.
   * ------------------------------------------------------------------ */
  var CONFIG = {
    ROOT_ID: 'bd-hwp',
    MAX_BYTES: 200 * 1024 * 1024,       // PC·안드로이드 최대 파일 크기
    MAX_BYTES_IOS: 100 * 1024 * 1024,   // 아이폰·아이패드 최대 파일 크기 (메모리 한계)
    DEFAULT_TEXT_WIDTH: 42520,          // A4 본문 폭(HWPUNIT, 210mm - 좌우 여백 30mm)
    BASE_FONT_PX: 15,                   // 10pt 글자를 화면에 그릴 크기
    ZOOMS: [0.7, 0.8, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2],
    CHUNK_BLOCKS: 300,                  // 큰 문서는 이만큼씩 나눠서 화면에 붙임
    MAX_HITS: 3000                      // 찾기 결과 최대 표시 개수
  };

  var UA = navigator.userAgent || '';
  var IS_IOS = /iP(hone|ad|od)/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
  var IS_MOBILE = IS_IOS || /Android|Mobile/i.test(UA);

  /* ------------------------------------------------------------------
   * 공통 유틸
   * ------------------------------------------------------------------ */
  function UErr(title, how, code) {
    var e = new Error(title);
    e.title = title; e.how = how; e.code = code || 'user'; e.user = true;
    return e;
  }
  function errCorrupt() {
    return UErr('파일이 손상됐거나 끝까지 받아지지 않았어요.',
      '메일·카톡에서 파일을 다시 내려받은 뒤 열어 보세요. 내려받는 중에 끊기면 이렇게 될 수 있어요.', 'corrupt');
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtBytes(n) {
    if (n < 1024) return n + 'B';
    if (n < 1048576) return (n / 1024).toFixed(1) + 'KB';
    return (n / 1048576).toFixed(1) + 'MB';
  }
  function u16(d, o) { return d[o] | (d[o + 1] << 8); }
  function u32(d, o) { return (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0; }
  function i32(d, o) { return d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24); }
  function utf16(d, o, len) {
    var s = '';
    for (var i = 0; i + 1 < len && o + i + 1 < d.length; i += 2) s += String.fromCharCode(u16(d, o + i));
    return s;
  }
  function utf8(d) {
    try { return new TextDecoder('utf-8').decode(d); } catch (e) {
      var s = ''; for (var i = 0; i < d.length; i++) s += String.fromCharCode(d[i]);
      try { return decodeURIComponent(escape(s)); } catch (e2) { return s; }
    }
  }
  function colorRef(c) { // COLORREF 0x00BBGGRR → #rrggbb
    if (c == null || c === 0xFFFFFFFF) return null;
    var r = c & 255, g = (c >>> 8) & 255, b = (c >>> 16) & 255;
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  function safeColor(s) {
    if (!s) return null;
    s = String(s).trim();
    if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
    return null;
  }
  function concat(parts, total) {
    if (total == null) { total = 0; for (var i = 0; i < parts.length; i++) total += parts[i].length; }
    var out = new Uint8Array(total), o = 0;
    for (var j = 0; j < parts.length && o < total; j++) {
      var p = parts[j];
      if (o + p.length > total) p = p.subarray(0, total - o);
      out.set(p, o); o += p.length;
    }
    return out;
  }
  function now() { return (global.performance && performance.now) ? performance.now() : Date.now(); }

  /* ------------------------------------------------------------------
   * raw deflate 해제 — 내장 DecompressionStream 우선, 실패 시 자체 구현
   * ------------------------------------------------------------------ */
  var LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  var LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  var DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  var DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  var CLORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
  var FIXED = null;

  function huff(lengths, off, n) {
    var c = new Uint16Array(16), offs = new Uint16Array(16), s = new Uint16Array(n), i;
    for (i = 0; i < n; i++) c[lengths[off + i]]++;
    c[0] = 0;
    for (i = 1; i < 16; i++) offs[i] = offs[i - 1] + c[i - 1];
    for (i = 0; i < n; i++) { var L = lengths[off + i]; if (L) s[offs[L]++] = i; }
    return { c: c, s: s };
  }

  function inflateRawJS(src) {
    var pos = 0, bitbuf = 0, bitcnt = 0, slen = src.length;
    var out = new Uint8Array(Math.max(4096, slen * 4)), olen = 0;
    function need(n) {
      if (olen + n <= out.length) return;
      var nl = out.length * 2; while (nl < olen + n) nl *= 2;
      var o = new Uint8Array(nl); o.set(out.subarray(0, olen)); out = o;
    }
    function bits(n) {
      while (bitcnt < n) {
        if (pos >= slen) throw new Error('EOF');
        bitbuf |= src[pos++] << bitcnt; bitcnt += 8;
      }
      var v = bitbuf & ((1 << n) - 1);
      bitbuf >>>= n; bitcnt -= n;
      return v;
    }
    function decode(h) {
      var code = 0, first = 0, index = 0;
      for (var len = 1; len < 16; len++) {
        code |= bits(1);
        var count = h.c[len];
        if (code - count < first) return h.s[index + (code - first)];
        index += count; first += count; first <<= 1; code <<= 1;
      }
      throw new Error('bad code');
    }
    function codes(lc, dc) {
      for (;;) {
        var sym = decode(lc);
        if (sym < 256) { if (olen >= out.length) need(1); out[olen++] = sym; }
        else if (sym === 256) return;
        else {
          sym -= 257; if (sym >= 29) throw new Error('bad length');
          var len = LBASE[sym] + bits(LEXT[sym]);
          var ds = decode(dc); if (ds >= 30) throw new Error('bad dist');
          var dist = DBASE[ds] + bits(DEXT[ds]);
          if (dist > olen) throw new Error('dist too far');
          need(len);
          for (var k = 0; k < len; k++) { out[olen] = out[olen - dist]; olen++; }
        }
      }
    }
    try {
      var last;
      do {
        last = bits(1);
        var type = bits(2);
        if (type === 0) {
          bitbuf = 0; bitcnt = 0;
          if (pos + 4 > slen) throw new Error('EOF');
          var ln = src[pos] | (src[pos + 1] << 8); pos += 4;
          if (pos + ln > slen) ln = slen - pos;
          need(ln); out.set(src.subarray(pos, pos + ln), olen); olen += ln; pos += ln;
        } else if (type === 1) {
          if (!FIXED) {
            var l = new Uint8Array(288 + 30), i;
            for (i = 0; i < 144; i++) l[i] = 8;
            for (; i < 256; i++) l[i] = 9;
            for (; i < 280; i++) l[i] = 7;
            for (; i < 288; i++) l[i] = 8;
            for (i = 288; i < 318; i++) l[i] = 5;
            FIXED = [huff(l, 0, 288), huff(l, 288, 30)];
          }
          codes(FIXED[0], FIXED[1]);
        } else if (type === 2) {
          var nlen = bits(5) + 257, ndist = bits(5) + 1, ncode = bits(4) + 4;
          var cl = new Uint8Array(19);
          for (var a = 0; a < ncode; a++) cl[CLORDER[a]] = bits(3);
          var lc = huff(cl, 0, 19);
          var lens = new Uint8Array(nlen + ndist), idx = 0;
          while (idx < nlen + ndist) {
            var sy = decode(lc);
            if (sy < 16) lens[idx++] = sy;
            else {
              var rep, val = 0;
              if (sy === 16) { if (idx === 0) throw new Error('bad repeat'); val = lens[idx - 1]; rep = 3 + bits(2); }
              else if (sy === 17) rep = 3 + bits(3);
              else rep = 11 + bits(7);
              if (idx + rep > nlen + ndist) throw new Error('bad lengths');
              while (rep--) lens[idx++] = val;
            }
          }
          codes(huff(lens, 0, nlen), huff(lens, nlen, ndist));
        } else throw new Error('bad block');
      } while (!last);
    } catch (e) {
      if (olen === 0) throw e; // 뒷부분이 잘린 파일은 읽은 데까지 사용
    }
    return out.slice(0, olen);
  }

  var nativeInflateOK = typeof global.DecompressionStream === 'function';
  function inflate(u8) {
    if (nativeInflateOK) {
      var ds;
      try { ds = new global.DecompressionStream('deflate-raw'); } catch (e) { nativeInflateOK = false; }
      if (ds) {
        return new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer()
          .then(function (b) { return new Uint8Array(b); })
          .catch(function () { return inflateRawJS(u8); });
      }
    }
    return Promise.resolve().then(function () { return inflateRawJS(u8); });
  }

  /* ------------------------------------------------------------------
   * OLE 복합 파일(CFB) 읽기
   * ------------------------------------------------------------------ */
  var END = 0xFFFFFFFA; // 이 값 이상은 특수 섹터 표시
  function parseCFB(u8) {
    if (u8.length < 512) throw errCorrupt();
    var ss = 1 << u16(u8, 30), mss = 1 << u16(u8, 32);
    if ((ss !== 512 && ss !== 4096) || mss > ss) throw errCorrupt();
    var dirStart = u32(u8, 48), miniCut = u32(u8, 56) || 4096;
    var mfStart = u32(u8, 60), dfStart = u32(u8, 68), nDf = u32(u8, 72);
    function sec(n) {
      var o = (n + 1) * ss;
      if (o >= u8.length) throw errCorrupt();
      if (o + ss > u8.length) { var p = new Uint8Array(ss); p.set(u8.subarray(o)); return p; }
      return u8.subarray(o, o + ss);
    }
    var difat = [], i, v;
    for (i = 0; i < 109; i++) { v = u32(u8, 76 + i * 4); if (v < END) difat.push(v); }
    var d = dfStart, guard = 0;
    while (d < END && guard++ <= nDf + 2) {
      var s = sec(d);
      for (i = 0; i < ss / 4 - 1; i++) { v = u32(s, i * 4); if (v < END) difat.push(v); }
      d = u32(s, ss - 4);
    }
    var per = ss / 4, fat = new Uint32Array(difat.length * per);
    for (i = 0; i < difat.length; i++) {
      var fs = sec(difat[i]);
      for (var k = 0; k < per; k++) fat[i * per + k] = u32(fs, k * 4);
    }
    function chain(start, table, getSec, size) {
      var parts = [], n = start, g = 0, lim = table.length + 1;
      while (n < END) {
        if (n >= table.length || g++ > lim) throw errCorrupt();
        parts.push(getSec(n)); n = table[n];
      }
      return concat(parts, size);
    }
    var dir = chain(dirStart, fat, sec);
    var ents = [];
    for (var o = 0; o + 128 <= dir.length; o += 128) {
      var nl = u16(dir, o + 64);
      ents.push({
        name: utf16(dir, o, Math.max(0, Math.min(64, nl) - 2)),
        type: dir[o + 66], left: u32(dir, o + 68), right: u32(dir, o + 72), child: u32(dir, o + 76),
        start: u32(dir, o + 116), size: u32(dir, o + 120)
      });
    }
    if (!ents.length) throw errCorrupt();
    var root = ents[0], mini = null, miniFat = null;
    function ensureMini() {
      if (mini) return;
      mini = root.start < END ? chain(root.start, fat, sec, root.size) : new Uint8Array(0);
      var mfb = mfStart < END ? chain(mfStart, fat, sec) : new Uint8Array(0);
      miniFat = new Uint32Array(mfb.length >> 2);
      for (var q = 0; q < miniFat.length; q++) miniFat[q] = u32(mfb, q * 4);
    }
    function miniSec(n) {
      var off = n * mss;
      if (off >= mini.length) throw errCorrupt();
      return mini.subarray(off, Math.min(off + mss, mini.length));
    }
    var map = {}, seen = {};
    function walk(idx, prefix, depth) {
      if (idx >= ents.length || idx >= END || seen[idx] || depth > 64) return;
      seen[idx] = 1;
      var e = ents[idx];
      walk(e.left, prefix, depth + 1);
      var p = prefix + e.name;
      map[p] = e;
      if (e.type === 1) walk(e.child, p + '/', depth + 1);
      walk(e.right, prefix, depth + 1);
    }
    walk(root.child, '', 0);
    return {
      list: function () { return Object.keys(map); },
      read: function (path) {
        var e = map[path];
        if (!e || e.type !== 2) return null;
        if (e.size === 0) return new Uint8Array(0);
        if (e.size < miniCut) { ensureMini(); return chain(e.start, miniFat, miniSec, e.size); }
        return chain(e.start, fat, sec, e.size);
      }
    };
  }

  /* ------------------------------------------------------------------
   * AES-128 복호화 (배포용 문서 전용, ECB) — FIPS-197
   * ------------------------------------------------------------------ */
  var AES_SBOX = null, AES_INV = null, AES_M = null;
  function aesInit() {
    if (AES_SBOX) return;
    AES_SBOX = new Uint8Array(256); AES_INV = new Uint8Array(256);
    var p = 1, q = 1;
    function rotl(x, s) { return ((x << s) | (x >>> (8 - s))) & 0xFF; }
    do {
      p = (p ^ (p << 1) ^ (p & 0x80 ? 0x1B : 0)) & 0xFF;
      q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 0xFF; if (q & 0x80) q ^= 0x09;
      var x = q ^ rotl(q, 1) ^ rotl(q, 2) ^ rotl(q, 3) ^ rotl(q, 4);
      AES_SBOX[p] = (x ^ 0x63) & 0xFF;
    } while (p !== 1);
    AES_SBOX[0] = 0x63;
    for (var i = 0; i < 256; i++) AES_INV[AES_SBOX[i]] = i;
    function mul(a, b) { var r = 0; while (b) { if (b & 1) r ^= a; a = (a << 1) ^ (a & 0x80 ? 0x11B : 0); b >>= 1; } return r & 0xFF; }
    AES_M = [9, 11, 13, 14].map(function (k) { var t = new Uint8Array(256); for (var j = 0; j < 256; j++) t[j] = mul(j, k); return t; });
  }
  function aesKeys(key) {
    var w = new Uint8Array(176), rc = 1, i;
    w.set(key.subarray(0, 16));
    for (i = 16; i < 176; i += 4) {
      var t0 = w[i - 4], t1 = w[i - 3], t2 = w[i - 2], t3 = w[i - 1];
      if (i % 16 === 0) {
        var tmp = t0;
        t0 = AES_SBOX[t1] ^ rc; t1 = AES_SBOX[t2]; t2 = AES_SBOX[t3]; t3 = AES_SBOX[tmp];
        rc = (rc << 1) ^ (rc & 0x80 ? 0x11B : 0);
      }
      w[i] = w[i - 16] ^ t0; w[i + 1] = w[i - 15] ^ t1; w[i + 2] = w[i - 14] ^ t2; w[i + 3] = w[i - 13] ^ t3;
    }
    return w;
  }
  function aesDecryptECB(key, data) {
    aesInit();
    var w = aesKeys(key), n = data.length - (data.length % 16), out = new Uint8Array(n), s = new Uint8Array(16), t = new Uint8Array(16);
    var M9 = AES_M[0], M11 = AES_M[1], M13 = AES_M[2], M14 = AES_M[3], INV = AES_INV;
    for (var o = 0; o < n; o += 16) {
      var i, r, c;
      for (i = 0; i < 16; i++) s[i] = data[o + i] ^ w[160 + i];
      for (r = 9; r >= 0; r--) {
        // InvShiftRows + InvSubBytes
        for (c = 0; c < 4; c++) for (i = 0; i < 4; i++) t[i + 4 * c] = INV[s[i + 4 * ((c - i + 4) & 3)]];
        for (i = 0; i < 16; i++) t[i] ^= w[r * 16 + i];
        if (r === 0) { s.set(t); break; }
        for (c = 0; c < 16; c += 4) {
          var a0 = t[c], a1 = t[c + 1], a2 = t[c + 2], a3 = t[c + 3];
          s[c] = M14[a0] ^ M11[a1] ^ M13[a2] ^ M9[a3];
          s[c + 1] = M9[a0] ^ M14[a1] ^ M11[a2] ^ M13[a3];
          s[c + 2] = M13[a0] ^ M9[a1] ^ M14[a2] ^ M11[a3];
          s[c + 3] = M11[a0] ^ M13[a1] ^ M9[a2] ^ M14[a3];
        }
      }
      out.set(s, o);
    }
    return out;
  }
  // 배포용 문서: 첫 레코드(256바이트)에서 열쇠를 꺼내 나머지를 풉니다.
  function decryptDistStream(raw) {
    if (raw.length < 260) throw errCorrupt();
    var h = u32(raw, 0), size = (h >>> 20) & 0xFFF;
    if ((h & 0x3FF) !== 28 || size !== 256) throw errCorrupt();
    var d = raw.slice(4, 260), seed = u32(d, 0) >>> 0, n = 0, key = 0;
    for (var i = 0; i < 256; i++) {
      if (n === 0) {
        seed = (Math.imul(seed, 214013) + 2531011) >>> 0; key = (seed >>> 16) & 0x7FFF & 0xFF;
        seed = (Math.imul(seed, 214013) + 2531011) >>> 0; n = ((seed >>> 16) & 0x7FFF & 0xF) + 1;
      }
      if (i >= 4) d[i] ^= key;
      n--;
    }
    var off = 4 + (u32(raw, 4) & 0xF);
    return aesDecryptECB(d.subarray(off, off + 16), raw.subarray(260));
  }

  /* ------------------------------------------------------------------
   * HWP 5.0 레코드
   * ------------------------------------------------------------------ */
  var T = {
    ID_MAPPINGS: 17, BIN_DATA: 18, FACE_NAME: 19, BORDER_FILL: 20, CHAR_SHAPE: 21, PARA_SHAPE: 25,
    PARA_HEADER: 66, PARA_TEXT: 67, PARA_CHAR_SHAPE: 68, CTRL_HEADER: 71, LIST_HEADER: 72,
    PAGE_DEF: 73, TABLE: 77, PICTURE: 85, EQEDIT: 88
  };
  // 확장 컨트롤(8칸, CTRL_HEADER와 1:1 대응)과 인라인 컨트롤(8칸)
  var EXT_CTRL = {}; [1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23].forEach(function (c) { EXT_CTRL[c] = 1; });
  var INL_CTRL = {}; [4, 5, 6, 7, 8, 9, 19, 20].forEach(function (c) { INL_CTRL[c] = 1; });

  function parseRecords(u8) {
    var recs = [], p = 0, n = u8.length;
    while (p + 4 <= n) {
      var h = u32(u8, p); p += 4;
      var size = (h >>> 20) & 0xFFF;
      if (size === 0xFFF) { if (p + 4 > n) break; size = u32(u8, p); p += 4; }
      if (p + size > n) size = n - p;
      recs.push({ tag: h & 0x3FF, level: (h >>> 10) & 0x3FF, data: u8.subarray(p, p + size), children: [] });
      p += size;
    }
    return recs;
  }
  function buildTree(recs) {
    var top = [], stack = [];
    for (var i = 0; i < recs.length; i++) {
      var r = recs[i];
      while (stack.length && stack[stack.length - 1].level >= r.level) stack.pop();
      if (stack.length) stack[stack.length - 1].children.push(r); else top.push(r);
      stack.push(r);
    }
    return top;
  }
  function ctrlId(d) {
    if (d.length < 4) return '';
    return String.fromCharCode(d[3], d[2], d[1], d[0]);
  }

  var BORDER_MM = [0.1, 0.12, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0];
  var HWP_LINE = ['none', 'solid', 'dashed', 'dotted', 'dashed', 'dashed', 'dashed', 'dotted', 'double', 'double', 'double', 'double', 'double', 'solid', 'double', 'solid', 'solid'];

  function parseDocInfo(recs) {
    var idmap = null, faces = [], chars = {}, paras = {}, fills = {}, bins = [];
    var nc = 0, np = 0, nf = 0;
    recs.forEach(function (r) {
      var d = r.data;
      switch (r.tag) {
        case T.ID_MAPPINGS:
          idmap = []; for (var o = 0; o + 4 <= d.length; o += 4) idmap.push(i32(d, o));
          break;
        case T.BIN_DATA: {
          var attr = u16(d, 0), type = attr & 0xF, b = { type: type, comp: (attr >> 4) & 3 };
          if ((type === 1 || type === 2) && d.length >= 6) {
            b.id = u16(d, 2);
            b.ext = utf16(d, 6, u16(d, 4) * 2).toLowerCase();
          }
          bins.push(b);
          break;
        }
        case T.FACE_NAME:
          faces.push(utf16(d, 3, u16(d, 1) * 2));
          break;
        case T.BORDER_FILL: {
          var f = { b: [] };
          for (var s = 0; s < 4; s++) {
            var bo = 2 + s * 6;
            if (bo + 6 > d.length) break;
            var t = d[bo];
            f.b.push({ style: HWP_LINE[t] || 'solid', mm: BORDER_MM[d[bo + 1]] || 0.12, color: colorRef(u32(d, bo + 2)) || '#000000' });
          }
          if (d.length >= 40) {
            var ff = u32(d, 32);
            if (ff & 1) f.bg = colorRef(u32(d, 36));
          }
          fills[++nf] = f; // 테두리/배경 ID는 1부터
          break;
        }
        case T.CHAR_SHAPE: {
          var a = d.length >= 50 ? u32(d, 46) : 0;
          chars[nc++] = {
            face: u16(d, 0), size: d.length >= 46 ? i32(d, 42) / 100 : 10,
            italic: !!(a & 1), bold: !!(a & 2), ul: ((a >>> 2) & 3) === 1 || ((a >>> 2) & 3) === 3,
            strike: ((a >>> 18) & 7) !== 0, sup: !!(a & (1 << 15)), sub: !!(a & (1 << 16)),
            color: d.length >= 56 ? colorRef(u32(d, 52)) : null,
            shade: d.length >= 64 ? colorRef(u32(d, 60)) : null
          };
          break;
        }
        case T.PARA_SHAPE: {
          var a1 = u32(d, 0), ls = 160, lsType = 0;
          if (d.length >= 54) { lsType = u32(d, 46) & 0x1F; ls = u32(d, 50); }
          else if (d.length >= 28) { lsType = a1 & 3; ls = i32(d, 24); }
          paras[np++] = {
            align: ['justify', 'left', 'right', 'center', 'justify', 'justify'][(a1 >>> 2) & 7] || 'justify',
            ml: i32(d, 4) / 200, ind: i32(d, 12) / 200, // 단위: pt (HWP는 2배로 저장)
            mt: i32(d, 16) / 200, mb: i32(d, 20) / 200,
            ls: lsType === 0 && ls >= 50 && ls <= 500 ? ls : 160
          };
          break;
        }
      }
    });
    var hangul = idmap && idmap.length > 1 ? faces.slice(0, idmap[1]) : faces;
    Object.keys(chars).forEach(function (k) { chars[k].font = hangul[chars[k].face] || ''; });
    return { chars: chars, paras: paras, fills: fills, bins: bins };
  }

  function parseHwpBody(top, ctx, sec) {
    var blocks = [];
    for (var i = 0; i < top.length; i++) {
      if (top[i].tag === T.PARA_HEADER) Array.prototype.push.apply(blocks, parseHwpPara(top[i], ctx, sec));
    }
    return blocks;
  }

  function parseHwpParaList(nodes, ctx, sec) {
    var out = [];
    nodes.forEach(function (n) { if (n.tag === T.PARA_HEADER) Array.prototype.push.apply(out, parseHwpPara(n, ctx, sec)); });
    return out;
  }

  function parseHwpPara(node, ctx, sec) {
    var d = node.data;
    var ps = d.length >= 10 ? u16(d, 8) : 0;
    var brk = d.length >= 12 ? d[11] : 0;
    var textRec = null, csRec = null, ctrls = [];
    node.children.forEach(function (c) {
      if (c.tag === T.PARA_TEXT) textRec = c;
      else if (c.tag === T.PARA_CHAR_SHAPE) csRec = c;
      else if (c.tag === T.CTRL_HEADER) ctrls.push(c);
    });
    var shapes = [];
    if (csRec) for (var o = 0; o + 8 <= csRec.data.length; o += 8) shapes.push([u32(csRec.data, o), u32(csRec.data, o + 4)]);
    if (!shapes.length) shapes.push([0, 0]);
    var si = 0;
    function shapeAt(pos) {
      while (si + 1 < shapes.length && shapes[si + 1][0] <= pos) si++;
      return shapes[si][1];
    }
    var out = [], cur = { t: 'p', ps: ps, runs: [] };
    ctx.stats.p++;
    function add(s, pos) {
      var c = shapeAt(pos), last = cur.runs[cur.runs.length - 1];
      if (last && last.c === c && last.x != null) last.x += s; else cur.runs.push({ c: c, x: s });
    }
    function flush() {
      if (cur.runs.length) out.push(cur);
      cur = { t: 'p', ps: ps, runs: [] };
    }
    var ci = 0;
    function ctrl(c, pos) {
      if (!c) return;
      var id = ctrlId(c.data);
      if (id === 'tbl ') { flush(); out.push(parseHwpTable(c, ctx, sec)); }
      else if (id === 'gso ') { flush(); Array.prototype.push.apply(out, parseHwpGso(c, ctx, sec)); }
      else if (id === 'eqed') {
        var eq = c.children.filter(function (k) { return k.tag === T.EQEDIT; })[0];
        if (eq && eq.data.length >= 6) cur.runs.push({ c: shapeAt(pos), eq: utf16(eq.data, 6, u16(eq.data, 4) * 2) });
      } else if (id === 'fn  ' || id === 'en  ') {
        var n = ++ctx.noteNo;
        ctx.notes.push({ n: n, blocks: parseHwpParaList(c.children, ctx, sec) });
        cur.runs.push({ c: shapeAt(pos), fn: n });
      } else if (id === 'head' || id === 'foot') {
        var key = id === 'head' ? 'header' : 'footer';
        if (!sec[key]) sec[key] = parseHwpParaList(c.children, ctx, sec);
      } else if (id === 'secd') {
        c.children.forEach(function (k) {
          if (k.tag === T.PAGE_DEF && k.data.length >= 40) {
            var w = u32(k.data, 0), h = u32(k.data, 4), land = u32(k.data, 36) & 1;
            var pw = land ? h : w, tw = pw - u32(k.data, 8) - u32(k.data, 12) - u32(k.data, 32);
            if (tw > 5000) sec.textWidth = tw;
          }
        });
      }
    }
    if (textRec) {
      var td = textRec.data, n = td.length >> 1, i = 0;
      while (i < n) {
        var ch = u16(td, i * 2);
        if (ch >= 32) { add(String.fromCharCode(ch), i); i++; continue; }
        if (ch === 9) { add('\t', i); i += 8; }
        else if (EXT_CTRL[ch]) { ctrl(ctrls[ci++], i); i += 8; }
        else if (INL_CTRL[ch]) { i += 8; }
        else {
          if (ch === 10) add('\n', i);
          else if (ch === 24) add('-', i);
          else if (ch === 30 || ch === 31) add('\u00a0', i);
          i++;
        }
      }
    }
    while (ci < ctrls.length) ctrl(ctrls[ci++], 0);
    if (cur.runs.length || !out.length) out.push(cur);
    if (brk & 0x4) out[0].pb = true; // 쪽 나누기
    return out;
  }

  function parseHwpTable(c, ctx, sec) {
    var kids = c.children, t = { t: 'tbl', w: c.data.length >= 20 ? u32(c.data, 16) : 0, rows: 0, cols: 0, cells: [], cap: null };
    var seenTable = false, i = 0;
    ctx.stats.t++;
    while (i < kids.length) {
      var k = kids[i];
      if (k.tag === T.TABLE) { t.rows = u16(k.data, 4); t.cols = u16(k.data, 6); seenTable = true; i++; }
      else if (k.tag === T.LIST_HEADER) {
        var cnt = u16(k.data, 0), paras = [];
        i++;
        while (i < kids.length && kids[i].tag === T.PARA_HEADER && paras.length < Math.max(cnt, 1)) { paras.push(kids[i]); i++; }
        var bl = parseHwpParaList(paras, ctx, sec);
        if (seenTable && k.data.length >= 34) {
          t.cells.push({
            c: u16(k.data, 8), r: u16(k.data, 10), cs: u16(k.data, 12) || 1, rs: u16(k.data, 14) || 1,
            w: u32(k.data, 16), h: u32(k.data, 20), bf: u16(k.data, 32), blocks: bl
          });
        } else t.cap = bl;
      } else i++;
    }
    return t;
  }

  function parseHwpGso(c, ctx, sec) {
    var w = c.data.length >= 24 ? u32(c.data, 16) : 0, h = c.data.length >= 24 ? u32(c.data, 20) : 0;
    var res = [];
    function walk(nodes) {
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        if (n.tag === T.PICTURE && n.data.length >= 73) {
          res.push({ t: 'img', key: 'b' + u16(n.data, 71), w: w, h: h }); ctx.stats.i++;
        } else if (n.tag === T.LIST_HEADER) {
          var cnt = u16(n.data, 0), paras = [], j = i + 1;
          while (j < nodes.length && nodes[j].tag === T.PARA_HEADER && paras.length < Math.max(cnt, 1)) { paras.push(nodes[j]); j++; }
          var bl = parseHwpParaList(paras, ctx, sec);
          if (hasContent(bl)) res.push({ t: 'box', blocks: bl });
          i = j - 1;
        } else if (n.children.length) walk(n.children);
      }
    }
    walk(c.children);
    var imgs = res.filter(function (b) { return b.t === 'img'; });
    if (imgs.length > 1) imgs.forEach(function (b) { b.w = 0; });
    return res;
  }

  function hasContent(blocks) {
    return blocks.some(function (b) {
      if (b.t !== 'p') return true;
      return b.runs.some(function (r) { return r.fn || r.eq || (r.x && r.x.replace(/\s/g, '')); });
    });
  }

  function newDoc(format) {
    return {
      format: format, chars: {}, paras: {}, fills: {}, sections: [], notes: [], noteNo: 0,
      stats: { p: 0, t: 0, i: 0 }, warnings: [], images: {}
    };
  }

  async function parseHWP(u8) {
    var cfb = parseCFB(u8);
    var fh = cfb.read('FileHeader');
    if (!fh || fh.length < 40) throw errCorrupt();
    var sig = ''; for (var i = 0; i < 17; i++) sig += String.fromCharCode(fh[i]);
    if (sig !== 'HWP Document File') throw errCorrupt();
    var props = u32(fh, 36), compressed = !!(props & 1);
    var ver = fh[35] + '.' + fh[34] + '.' + fh[33] + '.' + fh[32];
    if (props & 2) {
      throw UErr('암호가 걸린 문서라 열 수 없어요.',
        '문서를 만든 분께 암호를 푼 파일을 다시 받아 주세요. 한글에서 [보안] → [문서 암호 해제] 후 저장하면 돼요.', 'password');
    }
    var distrib = !!(props & 4);
    var doc = newDoc('HWP ' + ver + (distrib ? ' · 배포용' : ''));
    doc.restricted = distrib;
    async function stream(name) {
      var raw = cfb.read(name);
      if (!raw) return null;
      if (!compressed) return raw;
      return inflate(raw);
    }
    var diBytes = await stream('DocInfo');
    if (!diBytes) throw errCorrupt();
    var info = parseDocInfo(parseRecords(diBytes));
    doc.chars = info.chars; doc.paras = info.paras; doc.fills = info.fills;
    var bodyRe = distrib ? /^ViewText\/Section\d+$/ : /^BodyText\/Section\d+$/;
    var names = cfb.list().filter(function (p) { return bodyRe.test(p); })
      .sort(function (a, b) { return +a.replace(/\D/g, '') - +b.replace(/\D/g, ''); });
    if (!names.length) throw errCorrupt();
    var ctx = { stats: doc.stats, notes: doc.notes, noteNo: 0, memoNo: 0 };
    for (var s = 0; s < names.length; s++) {
      var bytes;
      if (distrib) {
        var enc = cfb.read(names[s]);
        try { bytes = decryptDistStream(enc); } catch (e) {
          throw UErr('배포용 문서의 잠금을 풀지 못했어요.', '문서가 손상됐거나 새로운 잠금 방식일 수 있어요. 한컴오피스 뷰어 앱으로 열어 주세요.', 'distribution');
        }
        if (compressed) {
          try { bytes = await inflate(bytes); } catch (e) {
            throw UErr('배포용 문서의 잠금을 풀지 못했어요.', '문서가 손상됐거나 새로운 잠금 방식일 수 있어요. 한컴오피스 뷰어 앱으로 열어 주세요.', 'distribution');
          }
        }
      } else bytes = await stream(names[s]);
      var sec = { blocks: [], textWidth: CONFIG.DEFAULT_TEXT_WIDTH };
      sec.blocks = parseHwpBody(buildTree(parseRecords(bytes)), ctx, sec);
      doc.sections.push(sec);
    }
    // 그림 데이터는 화면에 그릴 때 꺼냅니다.
    info.bins.forEach(function (b, idx) {
      if (b.id == null) return;
      var hex = ('000' + b.id.toString(16).toUpperCase()).slice(-4);
      doc.images['b' + (idx + 1)] = {
        ext: b.ext,
        load: function () {
          var raw = cfb.read('BinData/BIN' + hex + '.' + b.ext);
          if (!raw) return Promise.resolve(null);
          var comp = b.comp === 1 || (b.comp === 0 && compressed);
          if (!comp) return Promise.resolve(raw);
          return inflate(raw).catch(function () { return raw; });
        }
      };
    });
    return doc;
  }

  /* ------------------------------------------------------------------
   * ZIP 읽기 (HWPX)
   * ------------------------------------------------------------------ */
  function readZip(u8) {
    var i, n = u8.length, eocd = -1;
    for (i = n - 22; i >= Math.max(0, n - 65557); i--) {
      if (u8[i] === 0x50 && u8[i + 1] === 0x4b && u8[i + 2] === 5 && u8[i + 3] === 6) { eocd = i; break; }
    }
    if (eocd < 0) throw errCorrupt();
    var cnt = u16(u8, eocd + 10), p = u32(u8, eocd + 16), ents = {};
    for (var k = 0; k < cnt; k++) {
      if (p + 46 > n || u32(u8, p) !== 0x02014b50) break;
      var nl = u16(u8, p + 28), el = u16(u8, p + 30), cl = u16(u8, p + 32);
      var name = utf8(u8.subarray(p + 46, p + 46 + nl));
      ents[name] = { flags: u16(u8, p + 8), method: u16(u8, p + 10), csize: u32(u8, p + 20), usize: u32(u8, p + 24), lho: u32(u8, p + 42) };
      p += 46 + nl + el + cl;
    }
    return {
      names: Object.keys(ents),
      has: function (nm) { return !!ents[nm]; },
      get: function (nm) {
        var e = ents[nm];
        if (!e) return Promise.resolve(null);
        var lh = e.lho;
        if (lh + 30 > n || u32(u8, lh) !== 0x04034b50) return Promise.reject(errCorrupt());
        var start = lh + 30 + u16(u8, lh + 26) + u16(u8, lh + 28);
        var data = u8.subarray(start, Math.min(n, start + e.csize));
        if (e.flags & 1) return Promise.reject(UErr('암호가 걸린 문서라 열 수 없어요.', '문서를 만든 분께 암호를 푼 파일을 다시 받아 주세요.', 'password'));
        if (e.method === 0) return Promise.resolve(data);
        if (e.method === 8) return inflate(data);
        return Promise.reject(errCorrupt());
      }
    };
  }

  /* ------------------------------------------------------------------
   * HWPX(XML) 읽기
   * ------------------------------------------------------------------ */
  function kids(el, name) {
    var r = [];
    for (var c = el.firstElementChild; c; c = c.nextElementSibling) if (!name || c.localName === name) r.push(c);
    return r;
  }
  function kid(el, name) { for (var c = el.firstElementChild; c; c = c.nextElementSibling) if (c.localName === name) return c; return null; }
  function desc(el, name) { var a = el.getElementsByTagNameNS('*', name); return a.length ? a[0] : null; }
  function num(v, def) { var x = parseFloat(v); return isNaN(x) ? def : x; }
  function parseXml(text) {
    var x = new DOMParser().parseFromString(text, 'application/xml');
    if (x.getElementsByTagName('parsererror').length) throw errCorrupt();
    return x;
  }
  var HX_LINE = { NONE: 'none', SOLID: 'solid', DASH: 'dashed', DOT: 'dotted', DASH_DOT: 'dashed', DASH_DOT_DOT: 'dashed', LONG_DASH: 'dashed', CIRCLE: 'dotted', DOUBLE_SLIM: 'double', SLIM_THICK: 'double', THICK_SLIM: 'double', SLIM_THICK_SLIM: 'double' };

  function parseHxHeader(x, doc) {
    var fonts = {};
    kidsDeep(x, 'fontface').forEach(function (ff) {
      if ((ff.getAttribute('lang') || '').toUpperCase() !== 'HANGUL') return;
      kids(ff, 'font').forEach(function (f) { fonts[f.getAttribute('id')] = f.getAttribute('face') || ''; });
    });
    kidsDeep(x, 'charPr').forEach(function (c) {
      var fr = kid(c, 'fontRef'), ul = kid(c, 'underline'), st = kid(c, 'strikeout');
      doc.chars[c.getAttribute('id')] = {
        size: num(c.getAttribute('height'), 1000) / 100,
        bold: !!kid(c, 'bold'), italic: !!kid(c, 'italic'),
        ul: !!(ul && (ul.getAttribute('type') || 'NONE').toUpperCase() !== 'NONE'),
        // 한컴이 HWP→HWPX로 바꿀 때 '취소선 없음'을 shape="3D"로 적는 경우가 많아서 NONE·3D는 취소선 없음으로 봅니다.
        strike: !!(st && !/^(NONE|3D)$/i.test(st.getAttribute('shape') || 'NONE')),
        sup: !!kid(c, 'supscript'), sub: !!kid(c, 'subscript'),
        color: safeColor(c.getAttribute('textColor')),
        shade: (function (s) { s = safeColor(s); return s && s !== '#ffffff' ? s : null; })(c.getAttribute('shadeColor')),
        font: fr ? (fonts[fr.getAttribute('hangul')] || '') : ''
      };
    });
    kidsDeep(x, 'paraPr').forEach(function (p) {
      var al = kid(p, 'align'), left = desc(p, 'left'), ind = desc(p, 'intent'), prev = desc(p, 'prev'), next = desc(p, 'next'), ls = desc(p, 'lineSpacing');
      var h = al ? (al.getAttribute('horizontal') || 'JUSTIFY').toUpperCase() : 'JUSTIFY';
      var lsv = ls && (ls.getAttribute('type') || 'PERCENT').toUpperCase() === 'PERCENT' ? num(ls.getAttribute('value'), 160) : 160;
      doc.paras[p.getAttribute('id')] = {
        align: { LEFT: 'left', RIGHT: 'right', CENTER: 'center' }[h] || 'justify',
        ml: left ? num(left.getAttribute('value'), 0) / 200 : 0,
        ind: ind ? num(ind.getAttribute('value'), 0) / 200 : 0,
        mt: prev ? num(prev.getAttribute('value'), 0) / 200 : 0,
        mb: next ? num(next.getAttribute('value'), 0) / 200 : 0,
        ls: lsv >= 50 && lsv <= 500 ? lsv : 160
      };
    });
    kidsDeep(x, 'borderFill').forEach(function (b) {
      var f = { b: [] };
      ['leftBorder', 'rightBorder', 'topBorder', 'bottomBorder'].forEach(function (nm) {
        var e = kid(b, nm);
        if (!e) { f.b.push({ style: 'none', mm: 0.1, color: '#000000' }); return; }
        f.b.push({
          style: HX_LINE[(e.getAttribute('type') || 'NONE').toUpperCase()] || 'solid',
          mm: num(e.getAttribute('width'), 0.12), color: safeColor(e.getAttribute('color')) || '#000000'
        });
      });
      var wb = desc(b, 'winBrush');
      if (wb) f.bg = safeColor(wb.getAttribute('faceColor'));
      doc.fills[b.getAttribute('id')] = f;
    });
  }
  function kidsDeep(x, name) { return Array.prototype.slice.call(x.getElementsByTagNameNS('*', name)); }

  function hxParas(container, ctx, sec) {
    var out = [];
    if (!container) return out;
    kids(container, 'p').forEach(function (p) { Array.prototype.push.apply(out, hxPara(p, ctx, sec)); });
    return out;
  }
  function hxPara(p, ctx, sec) {
    var ps = p.getAttribute('paraPrIDRef') || '0', out = [], cur = { t: 'p', ps: ps, runs: [] };
    ctx.stats.p++;
    function add(s, c) {
      var last = cur.runs[cur.runs.length - 1];
      if (last && last.c === c && last.x != null) last.x += s; else cur.runs.push({ c: c, x: s });
    }
    function flush() { if (cur.runs.length) out.push(cur); cur = { t: 'p', ps: ps, runs: [] }; }
    kids(p, 'run').forEach(function (run) {
      var c = run.getAttribute('charPrIDRef') || '0';
      kids(run).forEach(function (el) {
        var ln = el.localName;
        if (ln === 't') {
          for (var nd = el.firstChild; nd; nd = nd.nextSibling) {
            if (nd.nodeType === 3) add(nd.nodeValue, c);
            else if (nd.nodeType === 1) {
              var l2 = nd.localName;
              if (l2 === 'tab') add('\t', c);
              else if (l2 === 'lineBreak') add('\n', c);
              else if (l2 === 'nbSpace' || l2 === 'fwSpace') add('\u00a0', c);
              else if (l2 === 'hyphen') add('-', c);
              else if (nd.textContent) add(nd.textContent, c);
            }
          }
        } else if (ln === 'tbl') { flush(); out.push(hxTable(el, ctx, sec)); }
        else if (ln === 'pic') { flush(); Array.prototype.push.apply(out, hxPicWithCap(el, ctx, sec)); }
        else if (ln === 'equation') {
          var sc = kid(el, 'script');
          if (sc) cur.runs.push({ c: c, eq: sc.textContent });
        } else if (ln === 'ctrl') {
          kids(el).forEach(function (k) {
            var kl = k.localName;
            if (kl === 'header' || kl === 'footer') {
              if (!sec[kl]) sec[kl] = hxParas(kid(k, 'subList'), ctx, sec);
            } else if (kl === 'fieldBegin' && (k.getAttribute('type') || '').toUpperCase() === 'MEMO') {
              var mb = hxParas(kid(k, 'subList'), ctx, sec);
              if (hasContent(mb)) { var mn = ++ctx.memoNo; ctx.notes.push({ memo: mn, blocks: mb }); cur.runs.push({ c: c, memo: mn }); }
            } else if (kl === 'footNote' || kl === 'endNote') {
              var n = ++ctx.noteNo;
              ctx.notes.push({ n: n, blocks: hxParas(kid(k, 'subList'), ctx, sec) });
              cur.runs.push({ c: c, fn: n });
            }
          });
        } else if (ln === 'secPr') {
          var pp = kid(el, 'pagePr');
          if (pp) {
            var w = num(pp.getAttribute('width'), 0), h = num(pp.getAttribute('height'), 0);
            var land = (pp.getAttribute('landscape') || '').toUpperCase() === 'NARROWLY';
            var mg = kid(pp, 'margin');
            var pw = land && h > w ? h : w;
            if (mg && pw) {
              var tw = pw - num(mg.getAttribute('left'), 0) - num(mg.getAttribute('right'), 0) - num(mg.getAttribute('gutter'), 0);
              if (tw > 5000) sec.textWidth = tw;
            }
          }
        } else if (/^(rect|ellipse|polygon|arc|curve|container|connectLine|textart)$/.test(ln)) {
          flush(); Array.prototype.push.apply(out, hxShape(el, ctx, sec));
        }
      });
    });
    if (cur.runs.length || !out.length) out.push(cur);
    if (p.getAttribute('pageBreak') === '1') out[0].pb = true;
    return out;
  }
  function hxSize(el) {
    var s = kid(el, 'curSz') || kid(el, 'sz');
    var w = s ? num(s.getAttribute('width'), 0) : 0, h = s ? num(s.getAttribute('height'), 0) : 0;
    if (!w) { var s2 = kid(el, 'sz'); if (s2) { w = num(s2.getAttribute('width'), 0); h = num(s2.getAttribute('height'), 0); } }
    return [w, h];
  }
  function hxPic(el, ctx) {
    var img = desc(el, 'img'), sz = hxSize(el);
    ctx.stats.i++;
    return { t: 'img', key: 'x' + (img ? img.getAttribute('binaryItemIDRef') : ''), w: sz[0], h: sz[1] };
  }
  function hxPicWithCap(el, ctx, sec) {
    var res = [hxPic(el, ctx)], cap = kid(el, 'caption');
    if (cap) { var cb = hxParas(kid(cap, 'subList'), ctx, sec); if (hasContent(cb)) res.push({ t: 'box', cap: 1, blocks: cb }); }
    return res;
  }
  function hxShape(el, ctx, sec) {
    var res = [];
    (function walk(node) {
      kids(node).forEach(function (k) {
        if (k.localName === 'pic') Array.prototype.push.apply(res, hxPicWithCap(k, ctx, sec));
        else if (k.localName === 'drawText') {
          var bl = hxParas(kid(k, 'subList'), ctx, sec);
          if (hasContent(bl)) res.push({ t: 'box', blocks: bl });
        } else if (k.localName === 'caption') {
          var cb = hxParas(kid(k, 'subList'), ctx, sec);
          if (hasContent(cb)) res.push({ t: 'box', cap: 1, blocks: cb });
        } else if (/^(rect|ellipse|polygon|arc|curve|container|connectLine|textart)$/.test(k.localName)) walk(k);
      });
    })(el);
    if (el.localName === 'pic') res.push(hxPic(el, ctx));
    return res;
  }
  function hxTable(el, ctx, sec) {
    var sz = kid(el, 'sz');
    var t = {
      t: 'tbl', w: sz ? num(sz.getAttribute('width'), 0) : 0,
      rows: num(el.getAttribute('rowCnt'), 0), cols: num(el.getAttribute('colCnt'), 0), cells: [], cap: null
    };
    ctx.stats.t++;
    var cap = kid(el, 'caption');
    if (cap) t.cap = hxParas(kid(cap, 'subList'), ctx, sec);
    kids(el, 'tr').forEach(function (tr, ri) {
      kids(tr, 'tc').forEach(function (tc, ci) {
        var a = kid(tc, 'cellAddr'), sp = kid(tc, 'cellSpan'), cz = kid(tc, 'cellSz');
        t.cells.push({
          c: a ? num(a.getAttribute('colAddr'), ci) : ci, r: a ? num(a.getAttribute('rowAddr'), ri) : ri,
          cs: sp ? num(sp.getAttribute('colSpan'), 1) || 1 : 1, rs: sp ? num(sp.getAttribute('rowSpan'), 1) || 1 : 1,
          w: cz ? num(cz.getAttribute('width'), 0) : 0, h: cz ? num(cz.getAttribute('height'), 0) : 0,
          bf: tc.getAttribute('borderFillIDRef') || '', blocks: hxParas(kid(tc, 'subList'), ctx, sec)
        });
      });
    });
    return t;
  }

  async function parseHWPX(u8) {
    var z = readZip(u8);
    async function text(nm) { var b = await z.get(nm); return b ? utf8(b) : null; }
    if (!z.has('Contents/header.xml') && !z.names.some(function (n) { return /^Contents\/section\d+\.xml$/i.test(n); })) {
      if (z.has('word/document.xml')) throw UErr('한글 파일이 아니라 워드(.docx) 파일이에요.', '워드 파일은 휴대폰 기본 파일 앱이나 구글 문서, MS 워드 앱에서 열 수 있어요.', 'docx');
      if (z.has('xl/workbook.xml')) throw UErr('한글 파일이 아니라 엑셀(.xlsx) 파일이에요.', '엑셀 파일은 구글 스프레드시트나 MS 엑셀 앱에서 열 수 있어요.', 'xlsx');
      if (z.has('ppt/presentation.xml')) throw UErr('한글 파일이 아니라 파워포인트(.pptx) 파일이에요.', '파워포인트 파일은 구글 프레젠테이션이나 MS 파워포인트 앱에서 열 수 있어요.', 'pptx');
      throw UErr('압축(ZIP) 파일이에요. 한글 문서가 아니에요.', '압축을 먼저 풀고, 안에 있는 .hwp 또는 .hwpx 파일을 열어 주세요.', 'zip');
    }
    var mf = await text('META-INF/manifest.xml');
    if (mf && /encryption-data/i.test(mf)) throw UErr('암호가 걸린 문서라 열 수 없어요.', '문서를 만든 분께 암호를 푼 파일을 다시 받아 주세요.', 'password');
    var doc = newDoc('HWPX');
    var items = {}, spine = [];
    var hpfName = z.names.filter(function (n) { return /content\.hpf$/i.test(n); })[0];
    if (hpfName) {
      try {
        var hpf = parseXml(await text(hpfName));
        kidsDeep(hpf, 'item').forEach(function (it) { items[it.getAttribute('id')] = { href: it.getAttribute('href') || '', type: it.getAttribute('media-type') || '' }; });
        kidsDeep(hpf, 'itemref').forEach(function (r) { var it = items[r.getAttribute('idref')]; if (it) spine.push(it.href); });
      } catch (e) { /* 목록이 깨져도 이름으로 찾습니다 */ }
    }
    var headerXml = await text('Contents/header.xml');
    if (headerXml) parseHxHeader(parseXml(headerXml), doc);
    var secNames = spine.filter(function (h) { return /section\d*\.xml$/i.test(h); }).map(function (h) { return z.has(h) ? h : 'Contents/' + h.replace(/^.*\//, ''); });
    if (!secNames.length) {
      secNames = z.names.filter(function (n) { return /^Contents\/section\d+\.xml$/i.test(n); })
        .sort(function (a, b) { return +a.replace(/\D/g, '') - +b.replace(/\D/g, ''); });
    }
    if (!secNames.length) throw errCorrupt();
    var ctx = { stats: doc.stats, notes: doc.notes, noteNo: 0, memoNo: 0 };
    for (var s = 0; s < secNames.length; s++) {
      var xml = await text(secNames[s]);
      if (!xml) continue;
      var root = parseXml(xml).documentElement;
      var sec = { blocks: [], textWidth: CONFIG.DEFAULT_TEXT_WIDTH };
      sec.blocks = hxParas(root, ctx, sec);
      doc.sections.push(sec);
    }
    Object.keys(items).forEach(function (id) {
      var it = items[id];
      if (!/^BinData\//i.test(it.href) && !/^image\//.test(it.type)) return;
      var nm = z.has(it.href) ? it.href : (z.has('BinData/' + it.href.replace(/^.*\//, '')) ? 'BinData/' + it.href.replace(/^.*\//, '') : it.href);
      doc.images['x' + id] = { ext: (nm.split('.').pop() || '').toLowerCase(), load: function () { return z.get(nm).catch(function () { return null; }); } };
    });
    return doc;
  }

  /* ------------------------------------------------------------------
   * 파일 종류 판별 → 해당 해석기
   * ------------------------------------------------------------------ */
  async function openBytes(u8, name) {
    if (!u8.length) throw UErr('빈 파일이에요(0바이트).', '파일이 제대로 받아지지 않았어요. 다시 내려받아 주세요.', 'empty');
    var head = ''; for (var i = 0; i < Math.min(32, u8.length); i++) head += String.fromCharCode(u8[i]);
    if (u8[0] === 0xD0 && u8[1] === 0xCF && u8[2] === 0x11 && u8[3] === 0xE0) {
      return parseHWP(u8).catch(function (e) {
        if (e.user) throw e;
        // 한글이 아닌 옛 오피스 문서(.doc/.xls/.ppt)인지 확인
        throw errCorrupt();
      });
    }
    if (u8[0] === 0x50 && u8[1] === 0x4B) return parseHWPX(u8);
    if (head.indexOf('HWP Document File V3') === 0) {
      throw UErr('한글 97 이전(HWP 3.0) 형식의 아주 오래된 문서예요.', '이 형식은 아직 지원하지 않아요. PC 한글이나 한컴오피스 뷰어로 연 뒤 [다른 이름으로 저장] → HWP 또는 PDF로 저장하면 볼 수 있어요.', 'hwp3');
    }
    if (head.indexOf('%PDF') === 0) throw UErr('한글 파일이 아니라 PDF 파일이에요.', 'PDF는 휴대폰 기본 파일 앱이나 크롬에서 바로 열 수 있어요. 이름 끝만 .hwp로 바뀐 것 같아요.', 'pdf');
    if (/^\s*<\?xml/.test(head) || /^\uFEFF?\s*</.test(head)) throw UErr('HWPML(.hml) 같은 XML 문서는 아직 지원하지 않아요.', 'PC 한글에서 열어 HWP나 HWPX로 다시 저장해 주세요.', 'hml');
    if (u8[0] === 0xFF && u8[1] === 0xD8) throw UErr('한글 파일이 아니라 사진(JPG)이에요.', '사진은 갤러리나 사진 앱에서 열어 보세요.', 'jpg');
    if (u8[0] === 0x89 && head.slice(1, 4) === 'PNG') throw UErr('한글 파일이 아니라 사진(PNG)이에요.', '사진은 갤러리나 사진 앱에서 열어 보세요.', 'png');
    throw UErr('한글(.hwp/.hwpx) 파일이 아니거나 손상된 파일이에요.', '파일 이름이 「' + (name || '') + '」가 맞는지 확인하고, 다시 내려받아 열어 보세요.', 'unknown');
  }

  /* ------------------------------------------------------------------
   * 화면 그리기 (문서 모델 → HTML)
   * ------------------------------------------------------------------ */
  function fontStack(name) {
    var n = String(name || '').replace(/['"\\<>;{}]/g, '').trim();
    var serif = /바탕|명조|궁서|batang|myeong|serif|times|신명/i.test(n);
    var base = serif ? "'Batang','AppleMyungjo','Noto Serif KR',serif" : "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif";
    return n ? "'" + n + "'," + base : base;
  }
  function borderPx(mm) { return mm <= 0.3 ? 1 : (mm <= 0.7 ? 2 : 3); }
  function docCSS(doc, scope) {
    var css = [];
    Object.keys(doc.chars).forEach(function (id) {
      var c = doc.chars[id], r = [];
      if (c.size && Math.abs(c.size - 10) > 0.01 && c.size > 1 && c.size < 400) r.push('font-size:' + (c.size / 10).toFixed(3) + 'em');
      if (c.bold) r.push('font-weight:700');
      if (c.italic) r.push('font-style:italic');
      var deco = []; if (c.ul) deco.push('underline'); if (c.strike) deco.push('line-through');
      if (deco.length) r.push('text-decoration:' + deco.join(' '));
      if (c.color && c.color !== '#000000') r.push('color:' + c.color);
      if (c.shade && c.shade !== '#ffffff') r.push('background:' + c.shade);
      if (c.font) r.push('font-family:' + fontStack(c.font));
      if (c.sup) r.push('vertical-align:super;font-size:.7em');
      else if (c.sub) r.push('vertical-align:sub;font-size:.7em');
      if (r.length) css.push(scope + ' .c' + cssId(id) + '{' + r.join(';') + '}');
    });
    Object.keys(doc.paras).forEach(function (id) {
      var p = doc.paras[id], r = ['text-align:' + p.align];
      var ml = Math.max(0, Math.min(p.ml || 0, 200)), ind = Math.max(-200, Math.min(p.ind || 0, 200));
      if (ind < 0) { r.push('padding-left:' + (-ind / 10).toFixed(2) + 'em'); r.push('text-indent:' + (ind / 10).toFixed(2) + 'em'); }
      else if (ind > 0) r.push('text-indent:' + (ind / 10).toFixed(2) + 'em');
      if (ml) r.push('margin-left:' + (ml / 10).toFixed(2) + 'em');
      if (p.mt > 0 && p.mt < 100) r.push('margin-top:' + (p.mt / 10).toFixed(2) + 'em');
      if (p.mb > 0 && p.mb < 100) r.push('margin-bottom:' + (p.mb / 10).toFixed(2) + 'em');
      if (p.ls && p.ls !== 160) r.push('line-height:' + Math.max(1, Math.min(3, p.ls / 100)).toFixed(2));
      css.push(scope + ' .p' + cssId(id) + '{' + r.join(';') + '}');
    });
    Object.keys(doc.fills).forEach(function (id) {
      var f = doc.fills[id], r = [];
      ['left', 'right', 'top', 'bottom'].forEach(function (side, i) {
        var b = f.b[i];
        if (!b) return;
        if (b.style === 'none') r.push('border-' + side + ':0');
        else r.push('border-' + side + ':' + (b.style === 'double' ? 3 : borderPx(b.mm)) + 'px ' + b.style + ' ' + b.color);
      });
      if (f.bg && f.bg !== '#ffffff') r.push('background:' + f.bg);
      if (r.length) css.push(scope + ' table.bdh-t td.b' + cssId(id) + '{' + r.join(';') + '}');
    });
    return css.join('\n');
  }
  function cssId(id) { return String(id).replace(/[^0-9A-Za-z_-]/g, '_'); }

  function runsHTML(runs) {
    var h = '';
    runs.forEach(function (r) {
      var cls = 'c' + cssId(r.c);
      if (r.fn != null) h += '<sup class="bdh-fnref">' + r.fn + ')</sup>';
      else if (r.memo != null) h += '<sup class="bdh-memo">메모' + r.memo + '</sup>';
      else if (r.eq != null) h += '<span class="bdh-eq" title="수식">' + esc(r.eq) + '</span>';
      else if (r.x) h += '<span class="' + cls + '">' + esc(r.x).replace(/\n/g, '<br>') + '</span>';
    });
    return h;
  }
  function blocksHTML(blocks, rc) {
    var h = '';
    blocks.forEach(function (b) {
      var pb = b.pb ? ' bdh-pb' : '';
      if (b.t === 'p') {
        var inner = runsHTML(b.runs);
        h += '<p class="p' + cssId(b.ps) + pb + '">' + (inner || '<br>') + '</p>';
      } else if (b.t === 'tbl') h += tableHTML(b, rc, pb);
      else if (b.t === 'img') {
        var iw = b.w > 0 ? Math.max(8, Math.min(100, b.w / rc.textWidth * 100)) : 0;
        h += '<div class="bdh-fig' + pb + '"><img class="bdh-img" alt="문서 속 그림" data-k="' + esc(b.key) + '"' +
          (iw ? ' style="width:' + iw.toFixed(1) + '%"' : '') + (b.w > 0 && b.h > 0 ? ' width="' + Math.round(b.w / 75) + '" height="' + Math.round(b.h / 75) + '"' : '') + '></div>';
      } else if (b.t === 'box') h += '<div class="bdh-box' + (b.cap ? ' bdh-cap' : '') + pb + '">' + blocksHTML(b.blocks, rc) + '</div>';
    });
    return h;
  }
  function tableHTML(t, rc, pb) {
    var tw = t.w > 0 ? Math.max(20, Math.min(100, t.w / rc.textWidth * 100)) : 100;
    var byRow = [], maxR = -1;
    t.cells.forEach(function (c) { (byRow[c.r] = byRow[c.r] || []).push(c); if (c.r + c.rs - 1 > maxR) maxR = c.r + c.rs - 1; });
    var tno = rc.tables ? rc.tables.push(t) - 1 : -1;
    var h = (tno >= 0 && !rc.noCopy ? '<div class="bdh-tbar"><button type="button" class="bdh-tcopy" data-t="' + tno + '">📋 표 복사 (엑셀용)</button></div>' : '') +
      '<div class="bdh-tw' + (pb || '') + '"><table class="bdh-t" style="width:' + tw.toFixed(1) + '%">';
    if (t.cap && hasContent(t.cap)) h += '<caption>' + blocksHTML(t.cap, rc) + '</caption>';
    for (var r = 0; r <= maxR; r++) {
      h += '<tr>';
      (byRow[r] || []).sort(function (a, b) { return a.c - b.c; }).forEach(function (c) {
        var st = t.w > 0 && c.w > 0 ? ' style="width:' + Math.min(100, c.w / t.w * 100).toFixed(1) + '%"' : '';
        h += '<td' + (c.cs > 1 ? ' colspan="' + c.cs + '"' : '') + (c.rs > 1 ? ' rowspan="' + c.rs + '"' : '') +
          ' class="b' + cssId(c.bf) + '"' + st + '>' + blocksHTML(c.blocks, rc) + '</td>';
      });
      h += '</tr>';
    }
    return h + '</table></div>';
  }
  function docParts(doc) {
    var parts = [], tables = doc._tables = [], rc0 = { textWidth: CONFIG.DEFAULT_TEXT_WIDTH, tables: tables, noCopy: doc.restricted };
    doc.sections.forEach(function (sec, i) {
      var rc = { textWidth: sec.textWidth || CONFIG.DEFAULT_TEXT_WIDTH, tables: tables, noCopy: doc.restricted };
      if (i > 0) parts.push('<div class="bdh-secbr" aria-hidden="true"></div>');
      if (sec.header && hasContent(sec.header)) parts.push('<div class="bdh-hf"><span class="bdh-hf-t">머리말</span>' + blocksHTML(sec.header, rc) + '</div>');
      sec.blocks.forEach(function (b) { parts.push(blocksHTML([b], rc)); });
      if (sec.footer && hasContent(sec.footer)) parts.push('<div class="bdh-hf"><span class="bdh-hf-t">꼬리말</span>' + blocksHTML(sec.footer, rc) + '</div>');
    });
    if (doc.notes.length) {
      var h = '<div class="bdh-notes"><div class="bdh-notes-t">각주·미주·메모</div>';
      doc.notes.forEach(function (n) {
        h += '<div class="bdh-note"><span class="bdh-note-n">' + (n.memo ? '메모' + n.memo : n.n + ')') + '</span><div>' + blocksHTML(n.blocks, rc0) + '</div></div>';
      });
      parts.push(h + '</div>');
    }
    return parts;
  }
  function docHTML(doc) { return docParts(doc).join(''); }

  /* ------------------------------------------------------------------
   * 텍스트로 꺼내기 (복사·TXT 저장)
   * ------------------------------------------------------------------ */
  function runsText(runs) {
    return runs.map(function (r) {
      if (r.fn != null) return '[' + r.fn + ']';
      if (r.memo != null) return '';
      if (r.eq != null) return r.eq;
      return (r.x || '').replace(/\u00a0/g, ' ');
    }).join('');
  }
  function blocksText(blocks, out) {
    blocks.forEach(function (b) {
      if (b.t === 'p') out.push(runsText(b.runs));
      else if (b.t === 'tbl') { if (b.cap) blocksText(b.cap, out); out.push(tableText(b)); }
      else if (b.t === 'img') out.push('[그림]');
      else if (b.t === 'box') blocksText(b.blocks, out);
    });
    return out;
  }
  function tableText(t) {
    var rows = [];
    t.cells.forEach(function (c) {
      var txt = blocksText(c.blocks, []).join(' ').replace(/[\t\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
      (rows[c.r] = rows[c.r] || [])[c.c] = txt;
    });
    var lines = [];
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r] || [], cells = [];
      for (var c = 0; c < row.length; c++) cells.push(row[c] == null ? '' : row[c]);
      lines.push(cells.join('\t'));
    }
    return lines.join('\n');
  }
  function docText(doc) {
    var out = [];
    doc.sections.forEach(function (s) {
      if (s.header && hasContent(s.header)) out.push('[머리말] ' + blocksText(s.header, []).join(' '));
      blocksText(s.blocks, out);
      if (s.footer && hasContent(s.footer)) out.push('[꼬리말] ' + blocksText(s.footer, []).join(' '));
    });
    if (doc.notes.length) {
      out.push('', '[각주·미주]');
      doc.notes.forEach(function (n) { out.push('[' + (n.memo ? '메모' + n.memo : n.n) + '] ' + blocksText(n.blocks, []).join(' ')); });
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  /* ------------------------------------------------------------------
   * 예시 문서 (HWPX를 즉석에서 만들어 같은 해석기로 엽니다)
   * ------------------------------------------------------------------ */
  var CRC_T = null;
  function crc32(u8) {
    if (!CRC_T) { CRC_T = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c >>> 0; } }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < u8.length; i++) crc = CRC_T[(crc ^ u8[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function zipStore(files) {
    var enc = new TextEncoder(), parts = [], cd = [], off = 0;
    function le(n, b) { var a = []; for (var i = 0; i < b; i++) a.push((n >>> (8 * i)) & 255); return a; }
    files.forEach(function (f) {
      var nm = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
      var lh = [].concat(le(0x04034b50, 4), le(20, 2), le(0x800, 2), le(0, 2), le(0, 4), le(crc, 4), le(data.length, 4), le(data.length, 4), le(nm.length, 2), le(0, 2));
      parts.push(new Uint8Array(lh), nm, data);
      cd.push(new Uint8Array([].concat(le(0x02014b50, 4), le(20, 2), le(20, 2), le(0x800, 2), le(0, 2), le(0, 4), le(crc, 4), le(data.length, 4), le(data.length, 4), le(nm.length, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 4), le(off, 4))), nm);
      off += lh.length + nm.length + data.length;
    });
    var cdLen = cd.reduce(function (a, b) { return a + b.length; }, 0);
    var eocd = new Uint8Array([].concat(le(0x06054b50, 4), le(0, 2), le(0, 2), le(files.length, 2), le(files.length, 2), le(cdLen, 4), le(off, 4), le(0, 2)));
    return concat(parts.concat(cd, [eocd]));
  }
  function sampleHwpx() {
    var NS = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"';
    function cp(id, h, extra, color) { return '<hh:charPr id="' + id + '" height="' + h + '" textColor="' + (color || '#000000') + '" shadeColor="none"><hh:fontRef hangul="0"/>' + (extra || '') + '</hh:charPr>'; }
    function bf(id, line, bg) {
      var s = ['left', 'right', 'top', 'bottom'].map(function (d) { return '<hh:' + d + 'Border type="' + line + '" width="0.12 mm" color="#000000"/>'; }).join('');
      return '<hh:borderFill id="' + id + '">' + s + (bg ? '<hc:fillBrush><hc:winBrush faceColor="' + bg + '" hatchColor="#000000" alpha="0"/></hc:fillBrush>' : '') + '</hh:borderFill>';
    }
    var header = '<?xml version="1.0" encoding="UTF-8"?><hh:head ' + NS + '><hh:refList>' +
      '<hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="함초롬바탕"/><hh:font id="1" face="함초롬돋움"/></hh:fontface></hh:fontfaces>' +
      '<hh:borderFills>' + bf(1, 'NONE') + bf(2, 'SOLID') + bf(3, 'SOLID', '#DCE8FB') + bf(4, 'SOLID', '#FFF4D6') + '</hh:borderFills>' +
      '<hh:charProperties>' + cp(0, 1100) + cp(1, 1800, '<hh:bold/>', '#1F3A8A') + cp(2, 1100, '<hh:bold/>') + cp(3, 1100, '<hh:bold/><hh:underline type="BOTTOM" shape="SOLID" color="#C00000"/>', '#C00000') + cp(4, 950, '', '#555555') + '</hh:charProperties>' +
      '<hh:paraProperties>' +
      '<hh:paraPr id="0"><hh:align horizontal="JUSTIFY"/><hh:margin><hc:intent value="0"/><hc:left value="0"/><hc:prev value="0"/><hc:next value="600"/></hh:margin><hh:lineSpacing type="PERCENT" value="160"/></hh:paraPr>' +
      '<hh:paraPr id="1"><hh:align horizontal="CENTER"/><hh:margin><hc:intent value="0"/><hc:left value="0"/><hc:prev value="0"/><hc:next value="1200"/></hh:margin><hh:lineSpacing type="PERCENT" value="160"/></hh:paraPr>' +
      '<hh:paraPr id="2"><hh:align horizontal="CENTER"/><hh:margin><hc:intent value="0"/><hc:left value="0"/><hc:prev value="0"/><hc:next value="0"/></hh:margin><hh:lineSpacing type="PERCENT" value="130"/></hh:paraPr>' +
      '<hh:paraPr id="3"><hh:align horizontal="LEFT"/><hh:margin><hc:intent value="-2000"/><hc:left value="2000"/><hc:prev value="0"/><hc:next value="300"/></hh:margin><hh:lineSpacing type="PERCENT" value="160"/></hh:paraPr>' +
      '</hh:paraProperties></hh:refList></hh:head>';
    function run(c, t) { return '<hp:run charPrIDRef="' + c + '"><hp:t>' + t + '</hp:t></hp:run>'; }
    function para(ps, runs) { return '<hp:p paraPrIDRef="' + ps + '" styleIDRef="0">' + runs + '</hp:p>'; }
    function cell(r, c, text, bfId, cs, rs, w, charId) {
      return '<hp:tc borderFillIDRef="' + bfId + '"><hp:subList>' + para(2, run(charId || 0, text)) + '</hp:subList>' +
        '<hp:cellAddr colAddr="' + c + '" rowAddr="' + r + '"/><hp:cellSpan colSpan="' + (cs || 1) + '" rowSpan="' + (rs || 1) + '"/><hp:cellSz width="' + w + '" height="1800"/></hp:tc>';
    }
    var W = [9000, 17000, 16520];
    var rows = [
      ['구분', '신청 기간', '신청 방법', 3, 2],
      ['난방비 지원', '11월 10일 ~ 12월 5일', '주민센터 방문 또는 정부24', 2, 0],
      ['김장 나눔 행사', '11월 20일(목) 오전 10시', '현장 접수 (선착순 80명)', 2, 0],
      ['문의', '착착동 주민센터 복지팀 ☎ 000-1234-5678', null, 4, 0]
    ];
    var trs = rows.map(function (rw, r) {
      if (rw[2] === null) return '<hp:tr>' + cell(r, 0, rw[0], 3, 1, 1, W[0], 2) + cell(r, 1, rw[1], 4, 2, 1, W[1] + W[2]) + '</hp:tr>';
      return '<hp:tr>' + [0, 1, 2].map(function (c) { return cell(r, c, rw[c], r === 0 ? rw[3] : (c === 0 ? 3 : rw[3]), 1, 1, W[c], r === 0 || c === 0 ? 2 : 0); }).join('') + '</hp:tr>';
    }).join('');
    var tbl = '<hp:run charPrIDRef="0"><hp:tbl rowCnt="4" colCnt="3" borderFillIDRef="2"><hp:sz width="42520" height="7200"/>' + trs + '</hp:tbl><hp:t/></hp:run>';
    var sec = '<?xml version="1.0" encoding="UTF-8"?><hs:sec ' + NS + '>' +
      para(1, run(1, '착착동 주민 안내문')) +
      para(0, run(0, '주민 여러분 안녕하세요. 겨울철을 맞아 ') + run(3, '난방비 지원 신청') + run(0, '과 김장 나눔 행사를 안내해 드립니다.<hp:lineBreak/>아래 표를 보시고 기간 안에 꼭 신청해 주세요.')) +
      '<hp:p paraPrIDRef="0" styleIDRef="0">' + tbl + '</hp:p>' +
      para(3, run(2, '1. ') + run(0, '신청할 때는 신분증과 통장 사본을 준비해 주세요. 대리 신청은 위임장이 필요해요.')) +
      para(3, run(2, '2. ') + run(0, '이 문서는 착착도구 「HWP 파일 바로 보기」 체험용 예시예요. 실제 기관·연락처가 아니에요.')) +
      para(0, run(4, '※ 이 화면처럼 표·굵은 글씨·색 글씨가 그대로 보이고, 위쪽 버튼으로 글자만 복사하거나 TXT로 저장할 수 있어요.')) +
      '</hs:sec>';
    var hpf = '<?xml version="1.0" encoding="UTF-8"?><opf:package xmlns:opf="http://www.idpf.org/2007/opf/"><opf:manifest>' +
      '<opf:item id="header" href="Contents/header.xml" media-type="application/xml"/><opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>' +
      '</opf:manifest><opf:spine><opf:itemref idref="header"/><opf:itemref idref="section0"/></opf:spine></opf:package>';
    return zipStore([
      { name: 'mimetype', data: 'application/hwp+zip' },
      { name: 'Contents/content.hpf', data: hpf },
      { name: 'Contents/header.xml', data: header },
      { name: 'Contents/section0.xml', data: sec }
    ]);
  }

  /* ------------------------------------------------------------------
   * 저장·복사
   * ------------------------------------------------------------------ */
  function saveBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 4000);
  }
  function copyText(text) {
    if (navigator.clipboard && global.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px';
    document.body.appendChild(ta);
    ta.select(); ta.setSelectionRange(0, text.length);
    var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }
  function baseName(n) { return String(n || '문서').replace(/\.(hwpx?|HWPX?)$/, '').replace(/[\\/:*?"<>|]/g, '_'); }

  /* ------------------------------------------------------------------
   * 스타일 (도구 화면)
   * ------------------------------------------------------------------ */
  var R = '#' + CONFIG.ROOT_ID;
  var TOOL_CSS = [
    R + '{max-width:100%;margin:0 auto}',
    R + ' .bdh{font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;color:#1f2937;line-height:1.5;font-size:16px;text-align:left;max-width:100%}',
    R + ' .bdh *{box-sizing:border-box}',
    R + ' .bdh-head{display:flex;align-items:center;gap:10px;margin:0 0 12px}',
    R + ' .bdh-logo{flex:0 0 auto;width:42px;height:42px;border-radius:12px;background:#2563eb;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px}',
    R + ' .bdh-title{font-size:19px;font-weight:800;margin:0;line-height:1.3}',
    R + ' .bdh-sub{font-size:13.5px;color:#047857;margin:2px 0 0}',
    R + ' .bdh-drop{border:2px dashed #93c5fd;background:#eff6ff;border-radius:16px;padding:20px 14px;text-align:center;transition:background .15s}',
    R + ' .bdh-drop.on{background:#dbeafe;border-color:#2563eb}',
    R + ' .bdh-drop p{margin:10px 0 0;font-size:14px;color:#475569}',
    R + ' .bdh-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:48px;padding:10px 14px;border-radius:12px;border:1px solid #cbd5e1;background:#fff;color:#1f2937;font-size:15.5px;font-weight:700;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;font-family:inherit;line-height:1.2;text-decoration:none;margin:0}',
    R + ' .bdh-btn:hover{border-color:#2563eb}',
    R + ' .bdh-btn:active{transform:scale(.98)}',
    R + ' .bdh-btn[disabled]{opacity:.45;cursor:default}',
    R + ' .bdh-btn.pri{background:#2563eb;border-color:#2563eb;color:#fff}',
    R + ' .bdh-btn.big{width:100%;min-height:58px;font-size:18px}',
    R + ' .bdh-btn.sub{width:100%;margin-top:10px;background:#fff;color:#1d4ed8;border-color:#bfdbfe}',
    R + ' .bdh-msg{margin:12px 0 0;padding:12px 14px;border-radius:12px;font-size:15px;line-height:1.6}',
    R + ' .bdh-msg.err{background:#fef2f2;border:1px solid #fecaca;color:#991b1b}',
    R + ' .bdh-msg.ok{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46}',
    R + ' .bdh-msg.info{background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a}',
    R + ' .bdh-msg b{display:block;margin-bottom:2px}',
    R + ' .bdh-res{margin-top:14px}',
    R + ' .bdh-file{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0 0 10px;font-size:14px;color:#334155}',
    R + ' .bdh-fname{font-weight:800;color:#0f172a;word-break:break-all;flex:1 1 100%}',
    R + ' .bdh-chip{display:inline-block;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:999px;padding:2px 10px;font-size:13px;color:#334155}',
    R + ' .bdh-bar{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:8px;margin:0 0 12px}',
    R + ' .bdh-bar .bdh-btn{width:100%;font-size:15px;padding:8px 6px}',
    R + ' .bdh-paper{background:#fff;color:#000;border:1px solid #d1d5db;border-radius:8px;box-shadow:0 2px 12px rgba(15,23,42,.07);padding:26px 24px;max-width:860px;margin:0 auto;overflow:hidden}',
    '@media (max-width:520px){' + R + ' .bdh-paper{padding:16px 12px}}',
    R + ' .bdh-doc{font-size:' + CONFIG.BASE_FONT_PX + 'px;line-height:1.6;color:#000;font-family:"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif;word-break:keep-all;overflow-wrap:anywhere;text-align:justify;tab-size:4;-moz-tab-size:4}',
    R + ' .bdh-doc p{margin:0;padding:0;white-space:pre-wrap;min-height:1em;border:0;background:none}',
    R + ' .bdh-doc .bdh-tw{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:.35em 0;max-width:100%}',
    R + ' .bdh-doc table.bdh-t{border-collapse:collapse;margin:0 auto;table-layout:auto;border:0;background:transparent;font-size:1em;width:auto}',
    R + ' .bdh-doc table.bdh-t td{border:1px solid #444;padding:.2em .35em;vertical-align:middle;background:transparent;font-size:1em;line-height:inherit;text-align:inherit}',
    R + ' .bdh-doc table.bdh-t caption{caption-side:top;padding:.2em 0}',
    R + ' .bdh-doc .bdh-box{border:1px solid #cbd5e1;border-radius:4px;padding:.4em .6em;margin:.4em 0}',
    R + ' .bdh-doc .bdh-fig{margin:.4em 0;text-align:center;line-height:0}',
    R + ' .bdh-doc img.bdh-img{max-width:100%;height:auto;display:inline-block;background:#f1f5f9;border:0;margin:0;padding:0;box-shadow:none;border-radius:0}',
    R + ' .bdh-doc img.bdh-img[data-loaded]{background:none}',
    R + ' .bdh-doc .bdh-nopic{display:inline-block;line-height:1.4;padding:1em;border:1px dashed #94a3b8;color:#64748b;font-size:.85em;background:#f8fafc;border-radius:4px}',
    R + ' .bdh-doc .bdh-cap{border:0;padding:0 0 .2em;text-align:center;font-size:.92em}',
    R + ' .bdh-doc .bdh-hf{border:1px dashed #cbd5e1;border-radius:4px;padding:.3em .6em;margin:.3em 0 .8em;color:#475569;font-size:.85em;background:#f8fafc}',
    R + ' .bdh-doc .bdh-hf-t{display:block;font-size:.8em;color:#94a3b8;margin-bottom:.1em}',
    R + ' .bdh-doc .bdh-memo{font-size:.65em;color:#b45309;background:#fef3c7;border-radius:3px;padding:0 .2em;vertical-align:super}',
    R + ' .bdh-doc mark.bdh-hit{background:#fde047;color:inherit;padding:0;border-radius:2px}',
    R + ' .bdh-doc mark.bdh-hit.cur{background:#f97316;color:#fff}',
    R + ' .bdh-find{display:flex;gap:6px;align-items:center;margin:0 0 10px;flex-wrap:wrap}',
    R + ' .bdh-find input{flex:1 1 150px;min-width:0;min-height:46px;border:1px solid #cbd5e1;border-radius:12px;padding:8px 12px;font-size:16px;font-family:inherit;background:#fff;color:#111}',
    R + ' .bdh-find .bdh-btn{min-width:46px;padding:8px 10px}',
    R + ' .bdh-cnt{font-size:14px;color:#334155;min-width:54px;text-align:center}',
    R + ' .bdh-zoom{display:flex;gap:6px;align-items:center}',
    R + ' .bdh-zoom span{min-width:48px;text-align:center;font-size:14px;color:#334155}',
    R + ' .bdh-doc .bdh-tbar{text-align:right;margin:.5em 0 -.2em;line-height:1}',
    R + ' .bdh-doc .bdh-tcopy{font:600 12.5px/1.2 -apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:#1d4ed8;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:6px 10px;cursor:pointer;min-height:32px;margin:0}',
    R + ' .bdh-doc.bdh-lock{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}',
    R + ' .bdh-more{margin:8px 0 0;text-align:center;font-size:14px;color:#1d4ed8}',
    R + ' .bdh-doc .bdh-imgph{display:block;margin:.4em auto;padding:1.2em;border:1px dashed #94a3b8;color:#64748b;text-align:center;font-size:.9em;background:#f8fafc}',
    R + ' .bdh-doc .bdh-eq{font-family:Consolas,Menlo,monospace;background:#f1f5f9;border-radius:3px;padding:0 .25em;font-size:.92em}',
    R + ' .bdh-doc .bdh-fnref{font-size:.7em;color:#1d4ed8;vertical-align:super}',
    R + ' .bdh-doc .bdh-notes{margin-top:1.5em;padding-top:.6em;border-top:1px solid #cbd5e1;font-size:.9em}',
    R + ' .bdh-doc .bdh-notes-t{font-weight:700;margin-bottom:.3em;color:#334155}',
    R + ' .bdh-doc .bdh-note{display:flex;gap:.4em}',
    R + ' .bdh-doc .bdh-note-n{color:#1d4ed8;flex:0 0 auto}',
    R + ' .bdh-doc .bdh-pb{position:relative;margin-top:1.6em}',
    R + ' .bdh-doc .bdh-pb::before{content:"쪽 나눔";position:absolute;left:0;right:0;top:-1.3em;font-size:.7em;color:#94a3b8;border-top:1px dashed #cbd5e1;text-align:center;line-height:1;padding-top:.2em;text-indent:0}',
    R + ' .bdh-doc .bdh-secbr{border-top:2px dashed #cbd5e1;margin:1.2em 0}',
    R + ' .bdh-foot{margin-top:10px;font-size:12.5px;color:#64748b;text-align:center}',
    R + ' .bdh-hide{display:none!important}',
    '@media print{' + R + ' .bdh-pb::before{display:none}' + R + ' .bdh-doc .bdh-pb{break-before:page;page-break-before:always;margin-top:0}' +
      R + ' .bdh-paper{border:0;box-shadow:none;padding:0;max-width:none;border-radius:0}' + R + ' .bdh-doc{font-size:10.5pt!important}' +
      R + ' .bdh-doc .bdh-tw{overflow:visible}' + R + ' .bdh-doc tr,' + R + ' .bdh-doc img{break-inside:avoid;page-break-inside:avoid}' + R + ' .bdh-tbar{display:none}}',
    R + ' .bdh-spin{display:inline-block;width:18px;height:18px;border:3px solid #bfdbfe;border-top-color:#2563eb;border-radius:50%;animation:bdhspin .8s linear infinite;vertical-align:-3px;margin-right:6px}',
    '@keyframes bdhspin{to{transform:rotate(360deg)}}'
  ].join('\n');

  /* ------------------------------------------------------------------
   * 화면(UI)
   * ------------------------------------------------------------------ */
  function mount(root) {
    if (root.getAttribute('data-bdh')) return;
    root.setAttribute('data-bdh', VERSION);
    if (!document.getElementById('bdh-style')) {
      var st = document.createElement('style'); st.id = 'bdh-style'; st.textContent = TOOL_CSS;
      document.head.appendChild(st);
    }
    var acc = IS_MOBILE ? '' : ' accept=".hwp,.hwpx,application/x-hwp,application/haansofthwp,application/vnd.hancom.hwp,application/hwp+zip,application/vnd.hancom.hwpx"';
    root.innerHTML =
      '<div class="bdh">' +
      '<div class="bdh-head"><div class="bdh-logo">한글</div><div><p class="bdh-title">HWP·HWPX 파일 바로 보기</p>' +
      '<p class="bdh-sub">🔒 파일은 서버로 전송되지 않아요 · 설치·로그인 없음</p></div></div>' +
      '<div class="bdh-drop" data-r="drop">' +
      '<button type="button" class="bdh-btn pri big" data-r="pick">📂 한글 파일 열기</button>' +
      '<input type="file" data-r="file" class="bdh-hide"' + acc + '>' +
      '<p>' + (IS_MOBILE ? '카톡·메일에서 받은 .hwp / .hwpx 파일을 골라 주세요' : '또는 .hwp / .hwpx 파일을 여기로 끌어다 놓으세요') + '</p>' +
      '<button type="button" class="bdh-btn sub" data-r="demo">🧪 예시 문서로 먼저 체험하기</button>' +
      '</div>' +
      '<div class="bdh-msg bdh-hide" data-r="msg" role="status" aria-live="polite"></div>' +
      '<div class="bdh-res bdh-hide" data-r="res">' +
      '<div class="bdh-file"><span class="bdh-fname" data-r="fname"></span><span data-r="chips"></span></div>' +
      '<div class="bdh-bar">' +
      '<button type="button" class="bdh-btn" data-r="copy">📋 전체 복사</button>' +
      '<button type="button" class="bdh-btn" data-r="txt">💾 TXT로 저장</button>' +
      '<button type="button" class="bdh-btn" data-r="pdf">🖨 PDF·인쇄</button>' +
      '<button type="button" class="bdh-btn" data-r="html">🌐 HTML 저장</button>' +
      '<button type="button" class="bdh-btn" data-r="share">📤 공유하기</button>' +
      '<button type="button" class="bdh-btn" data-r="again">📂 다른 파일</button>' +
      '</div>' +
      '<div class="bdh-msg info bdh-hide" data-r="lock">🔒 <b style="display:inline">배포용 문서예요.</b> 만든 분이 복사·인쇄를 막아 둔 문서라 <b style="display:inline">보기만</b> 할 수 있어요. 복사·저장이 꼭 필요하면 문서를 보낸 곳에 일반 문서(HWP·PDF)를 요청해 주세요.</div>' +
      '<div class="bdh-find">' +
      '<input type="search" data-r="q" placeholder="🔍 문서에서 찾기 (예: 마감일)" enterkeyhint="search" aria-label="문서에서 찾기">' +
      '<button type="button" class="bdh-btn" data-r="prev" aria-label="이전 결과">▲</button>' +
      '<button type="button" class="bdh-btn" data-r="next" aria-label="다음 결과">▼</button>' +
      '<span class="bdh-cnt" data-r="cnt"></span>' +
      '<span class="bdh-zoom"><button type="button" class="bdh-btn" data-r="zout" aria-label="글자 작게">가−</button><span data-r="zl">100%</span><button type="button" class="bdh-btn" data-r="zin" aria-label="글자 크게">가+</button></span>' +
      '</div>' +
      '<div class="bdh-paper"><div class="bdh-doc" data-r="doc"></div><div class="bdh-more bdh-hide" data-r="more"></div></div>' +
      '<p class="bdh-foot">보이는 모양은 원본 한글과 줄바꿈·쪽 위치가 조금 다를 수 있어요. 내용 확인·복사용으로 써 주세요.</p>' +
      '</div>' +
      '</div>';
    var q = function (r) { return root.querySelector('[data-r="' + r + '"]'); };
    var el = {
      drop: q('drop'), pick: q('pick'), file: q('file'), demo: q('demo'), msg: q('msg'), res: q('res'),
      fname: q('fname'), chips: q('chips'), doc: q('doc'), copy: q('copy'), txt: q('txt'), again: q('again'),
      pdf: q('pdf'), html: q('html'), share: q('share'), lock: q('lock'),
      q: q('q'), prev: q('prev'), next: q('next'), cnt: q('cnt'), zin: q('zin'), zout: q('zout'), zl: q('zl'), more: q('more')
    };
    var state = { doc: null, name: '', text: '', busy: false, urls: [], token: 0, rendering: false, zoom: 3, hits: [], hi: -1, imgs: {} };
    var styleEl = document.createElement('style');
    root.appendChild(styleEl);

    function msg(kind, title, how) {
      el.msg.className = 'bdh-msg ' + kind;
      el.msg.innerHTML = title ? '<b>' + esc(title) + '</b>' + (how ? esc(how) : '') : esc(how || '');
    }
    function busy(on, text) {
      state.busy = on;
      el.pick.disabled = on; el.demo.disabled = on;
      if (on) { el.msg.className = 'bdh-msg info'; el.msg.innerHTML = '<span class="bdh-spin"></span>' + esc(text || '문서를 여는 중이에요…'); }
    }

    async function openFile(file) {
      if (!file || state.busy) return;
      var max = IS_IOS ? CONFIG.MAX_BYTES_IOS : CONFIG.MAX_BYTES;
      if (file.size > max) {
        msg('err', '파일이 너무 커요 (' + fmtBytes(file.size) + ').', (IS_IOS ? '아이폰에서는 ' : '') + fmtBytes(max) + '까지 열 수 있어요. PC에서 열거나, 문서를 나눠 저장해 주세요.');
        return;
      }
      busy(true, '「' + file.name + '」 여는 중이에요…');
      try {
        var buf = await file.arrayBuffer();
        await show(new Uint8Array(buf), file.name, file.size);
      } catch (e) { fail(e); }
      finally { busy(false); }
    }
    async function openDemo() {
      if (state.busy) return;
      busy(true, '예시 문서를 여는 중이에요…');
      try {
        var u8 = sampleHwpx();
        await show(u8, '예시_착착동_주민안내문.hwpx', u8.length);
      } catch (e) { fail(e); }
      finally { busy(false); }
    }
    function fail(e) {
      if (!e || !e.user) {
        if (global.console) console.error('[HwpViewer]', e);
        e = errCorrupt();
      }
      msg('err', '😥 ' + e.title, e.how);
      el.res.classList.add('bdh-hide');
    }
    function cleanup() {
      state.token++;
      state.urls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) { /* 무시 */ } });
      state.urls = []; state.imgs = {}; state.hits = []; state.hi = -1;
      el.cnt.textContent = ''; el.q.value = '';
    }
    async function show(u8, name, size) {
      var t0 = now();
      var doc = await openBytes(u8, name);
      var t1 = now();
      cleanup();
      var token = state.token;
      state.doc = doc; state.name = name; state.text = docText(doc);
      styleEl.textContent = docCSS(doc, R + ' .bdh-doc');
      var parts = docParts(doc), first = Math.min(parts.length, CONFIG.CHUNK_BLOCKS);
      el.doc.innerHTML = parts.slice(0, first).join('');
      var t2 = now();
      el.fname.textContent = '📄 ' + name;
      el.chips.innerHTML = [doc.format, fmtBytes(size), '문단 ' + doc.stats.p.toLocaleString(), '표 ' + doc.stats.t.toLocaleString(), '그림 ' + doc.stats.i.toLocaleString()]
        .map(function (s) { return '<span class="bdh-chip">' + esc(s) + '</span>'; }).join(' ');
      el.res.classList.remove('bdh-hide');
      var lock = !!doc.restricted;
      [el.copy, el.txt, el.pdf, el.html, el.share].forEach(function (b) { b.disabled = lock; });
      el.lock.classList.toggle('bdh-hide', !lock);
      el.doc.classList.toggle('bdh-lock', lock);
      var ms = t2 - t0;
      msg('ok', '✅ 문서를 열었어요 (' + (ms < 10 ? '0.01초 미만' : (ms / 1000).toFixed(2) + '초') + ')',
        '아래에서 내용을 확인하세요. 찾기·글자 크기 조절·복사·TXT 저장을 쓸 수 있어요.' + (doc.warnings.length ? ' ' + doc.warnings.join(' ') : ''));
      root.setAttribute('data-parse-ms', Math.round(t1 - t0));
      root.setAttribute('data-render-ms', Math.round(t2 - t1));
      loadImages(el.doc, token);
      if (el.res.scrollIntoView) el.res.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // 남은 부분은 화면이 멈추지 않게 조금씩 붙입니다.
      if (first < parts.length) {
        state.rendering = true; el.more.classList.remove('bdh-hide');
        var i = first, chunk = CONFIG.CHUNK_BLOCKS;
        await new Promise(function (resolve) {
          (function step() {
            if (token !== state.token) return resolve();
            chunk *= 2; // 붙일 때마다 화면 배치를 다시 계산하므로 덩어리를 점점 키웁니다.
            var end = Math.min(parts.length, i + chunk);
            var holder = document.createElement('div');
            holder.innerHTML = parts.slice(i, end).join('');
            var frag = document.createDocumentFragment();
            while (holder.firstChild) frag.appendChild(holder.firstChild);
            el.doc.appendChild(frag);
            i = end;
            el.more.textContent = '나머지 내용을 불러오는 중… ' + Math.round(i / parts.length * 100) + '%';
            if (i < parts.length) setTimeout(step, 0); else resolve();
          })();
        });
        if (token === state.token) { state.rendering = false; el.more.classList.add('bdh-hide'); loadImages(el.doc, token); }
      }
      root.setAttribute('data-total-ms', Math.round(now() - t0));
    }

    // 문서 속 그림: 필요한 것만 꺼내서 기기 안에서 바로 보여줍니다 (blob 주소, 외부 전송 없음).
    var MIME_NOTE = { wmf: 'WMF', emf: 'EMF', tif: 'TIFF', tiff: 'TIFF', ole: 'OLE' };
    function sniff(b) {
      if (!b || b.length < 4) return null;
      if (b[0] === 0xFF && b[1] === 0xD8) return 'image/jpeg';
      if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png';
      if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
      if (b[0] === 0x42 && b[1] === 0x4D) return 'image/bmp';
      if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) return 'image/webp';
      if (IS_IOS && ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2A) || (b[0] === 0x4D && b[1] === 0x4D && b[3] === 0x2A))) return 'image/tiff';
      return null;
    }
    function getImageURL(key) {
      if (state.imgs[key]) return state.imgs[key];
      var src = state.doc && state.doc.images[key];
      state.imgs[key] = !src ? Promise.resolve({ err: '그림 파일이 문서 안에 없어요' }) : src.load().then(function (bytes) {
        var mime = sniff(bytes);
        if (!mime) return { err: (MIME_NOTE[src.ext] || (src.ext || '').toUpperCase() || '알 수 없는') + ' 형식 그림이라 브라우저에서 미리 볼 수 없어요' };
        var url = URL.createObjectURL(new Blob([bytes], { type: mime }));
        state.urls.push(url);
        return { url: url, mime: mime, bytes: bytes };
      }).catch(function () { return { err: '그림을 읽지 못했어요' }; });
      return state.imgs[key];
    }
    function loadImages(container, token) {
      var list = container.querySelectorAll('img.bdh-img:not([data-q])');
      Array.prototype.forEach.call(list, function (img) {
        img.setAttribute('data-q', '1');
        getImageURL(img.getAttribute('data-k')).then(function (r) {
          if (token !== state.token) return;
          if (r.url) { img.src = r.url; img.setAttribute('data-loaded', '1'); }
          else {
            var sp = document.createElement('span');
            sp.className = 'bdh-nopic'; sp.textContent = '🖼 ' + r.err;
            if (img.parentNode) img.parentNode.replaceChild(sp, img);
          }
        });
      });
    }

    // 찾기
    function clearHits() {
      Array.prototype.forEach.call(el.doc.querySelectorAll('mark.bdh-hit'), function (m) {
        var p = m.parentNode; if (!p) return;
        p.replaceChild(document.createTextNode(m.textContent), m); p.normalize();
      });
      state.hits = []; state.hi = -1;
    }
    function find(word) {
      clearHits();
      word = (word || '').replace(/ /g, ' ').trim();
      if (!word) { el.cnt.textContent = ''; return; }
      var lw = word.toLowerCase(), nodes = [];
      var tw = document.createTreeWalker(el.doc, NodeFilter.SHOW_TEXT, null);
      for (var n = tw.nextNode(); n; n = tw.nextNode()) nodes.push(n);
      var hits = [];
      for (var k = 0; k < nodes.length && hits.length < CONFIG.MAX_HITS; k++) {
        var node = nodes[k], text = node.nodeValue.replace(/ /g, ' ').toLowerCase(), idx = text.indexOf(lw);
        if (idx < 0) continue;
        var frag = document.createDocumentFragment(), last = 0, raw = node.nodeValue;
        while (idx >= 0 && hits.length < CONFIG.MAX_HITS) {
          if (idx > last) frag.appendChild(document.createTextNode(raw.slice(last, idx)));
          var m = document.createElement('mark'); m.className = 'bdh-hit';
          m.textContent = raw.slice(idx, idx + word.length);
          frag.appendChild(m); hits.push(m);
          last = idx + word.length; idx = text.indexOf(lw, last);
        }
        if (last < raw.length) frag.appendChild(document.createTextNode(raw.slice(last)));
        node.parentNode.replaceChild(frag, node);
      }
      state.hits = hits;
      if (!hits.length) { el.cnt.textContent = '0개'; return; }
      go(0);
    }
    function go(i) {
      var h = state.hits;
      if (!h.length) return;
      if (state.hi >= 0 && h[state.hi]) h[state.hi].classList.remove('cur');
      state.hi = (i + h.length) % h.length;
      var m = h[state.hi]; m.classList.add('cur');
      el.cnt.textContent = (state.hi + 1) + '/' + h.length + (h.length >= CONFIG.MAX_HITS ? '+' : '');
      if (m.scrollIntoView) m.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    var findTimer = null;
    el.q.addEventListener('input', function () {
      clearTimeout(findTimer);
      findTimer = setTimeout(function () { if (!state.rendering) find(el.q.value); }, 350);
    });
    el.q.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); if (state.hits.length && el.q.value.trim()) go(state.hi + (e.shiftKey ? -1 : 1)); else find(el.q.value); el.q.blur && IS_MOBILE && el.q.blur(); }
    });
    el.next.addEventListener('click', function () { if (state.hits.length) go(state.hi + 1); else find(el.q.value); });
    el.prev.addEventListener('click', function () { if (state.hits.length) go(state.hi - 1); else find(el.q.value); });

    // 글자 크기
    function setZoom(i) {
      state.zoom = Math.max(0, Math.min(CONFIG.ZOOMS.length - 1, i));
      var z = CONFIG.ZOOMS[state.zoom];
      el.doc.style.fontSize = (CONFIG.BASE_FONT_PX * z).toFixed(1) + 'px';
      el.zl.textContent = Math.round(z * 100) + '%';
      el.zout.disabled = state.zoom === 0; el.zin.disabled = state.zoom === CONFIG.ZOOMS.length - 1;
    }
    el.zin.addEventListener('click', function () { setZoom(state.zoom + 1); });
    el.zout.addEventListener('click', function () { setZoom(state.zoom - 1); });
    setZoom(CONFIG.ZOOMS.indexOf(1));

    el.pick.addEventListener('click', function () { el.file.value = ''; el.file.click(); });
    el.again.addEventListener('click', function () { el.file.value = ''; el.file.click(); });
    el.file.addEventListener('change', function () { if (el.file.files && el.file.files[0]) openFile(el.file.files[0]); });
    el.demo.addEventListener('click', openDemo);
    ['dragenter', 'dragover'].forEach(function (ev) {
      el.drop.addEventListener(ev, function (e) { e.preventDefault(); el.drop.classList.add('on'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      el.drop.addEventListener(ev, function (e) { e.preventDefault(); el.drop.classList.remove('on'); });
    });
    el.drop.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) openFile(f);
    });
    el.copy.addEventListener('click', function () {
      if (!state.doc) return;
      copyText(state.text).then(function (ok) {
        if (ok) msg('ok', '📋 글자 ' + state.text.length.toLocaleString() + '자를 복사했어요.', '메모·카톡·메일에 붙여 넣으면 돼요. 표는 칸 사이가 탭으로 들어가서 엑셀에 붙이면 칸이 나뉘어요.');
        else msg('err', '복사가 막혔어요.', '브라우저가 복사를 허용하지 않았어요. 「TXT로 저장」을 눌러 파일로 받아 주세요.');
      });
    });
    el.txt.addEventListener('click', function () {
      if (!state.doc) return;
      saveBlob(new Blob(['\uFEFF' + state.text], { type: 'text/plain;charset=utf-8' }), baseName(state.name) + '.txt');
      msg('ok', '💾 TXT 파일을 저장했어요.', IS_IOS ? '아이폰은 [파일] 앱 → 다운로드 폴더에서 찾을 수 있어요.' : '다운로드 폴더를 확인해 주세요.');
    });

    // 표 복사 (탭으로 칸을 나눠서 엑셀·구글 시트에 그대로 붙음)
    el.doc.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('.bdh-tcopy') : null;
      if (!b || !state.doc || state.doc.restricted) return;
      var t = state.doc._tables[+b.getAttribute('data-t')];
      if (!t) return;
      var txt = tableText(t);
      copyText(txt).then(function (ok) {
        b.textContent = ok ? '✅ 복사됨 · 엑셀에 붙여 넣으세요' : '❌ 복사 실패';
        setTimeout(function () { b.textContent = '📋 표 복사 (엑셀용)'; }, 2200);
      });
    });

    // 혼자 열리는 HTML 문서 만들기 (그림은 data 주소로 넣어서 파일 하나로 완성)
    async function standaloneHTML(embed) {
      var html = docHTML(state.doc).replace(/<div class="bdh-tbar">[\s\S]*?<\/div>/g, '');
      var keys = {}, re = /data-k="([^"]*)"/g, m, total = 0;
      while ((m = re.exec(html))) keys[m[1]] = 1;
      var map = {};
      for (var k in keys) {
        var r = await getImageURL(k.replace(/&amp;/g, '&').replace(/&quot;/g, '"'));
        if (!r.url) continue;
        if (embed) {
          total += r.bytes.length;
          if (total > 40 * 1024 * 1024) break; // 너무 크면 나머지 그림은 빼고 저장
          map[k] = 'data:' + r.mime + ';base64,' + b64(r.bytes);
        } else map[k] = r.url;
      }
      html = html.replace(/<img class="bdh-img"([^>]*?) data-k="([^"]*)"/g, function (all, pre, k) {
        return map[k] ? '<img class="bdh-img"' + pre + ' data-loaded="1" src="' + map[k] + '"' : '<img class="bdh-img"' + pre + ' alt="그림(저장 안 됨)"';
      });
      var title = esc(baseName(state.name));
      return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>' + title + '</title><style>body{margin:0;background:#f1f5f9}#bd-hwp{padding:16px}@media print{body{background:#fff}#bd-hwp{padding:0}}\n' + TOOL_CSS + '\n' + styleEl.textContent + '</style></head>' +
        '<body><div id="bd-hwp"><div class="bdh"><div class="bdh-paper"><div class="bdh-doc">' + html + '</div></div>' +
        '<p class="bdh-foot" style="margin-top:12px">착착도구 「HWP 파일 바로 보기」로 기기 안에서 변환한 문서예요.</p></div></div></body></html>';
    }
    function b64(u8) {
      var s = '', CH = 0x8000;
      for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
      return btoa(s);
    }
    el.html.addEventListener('click', async function () {
      if (!state.doc || state.doc.restricted || state.rendering) return;
      el.html.disabled = true;
      try {
        var h = await standaloneHTML(true);
        saveBlob(new Blob([h], { type: 'text/html;charset=utf-8' }), baseName(state.name) + '.html');
        msg('ok', '🌐 HTML 파일을 저장했어요.', '한글 프로그램이 없는 PC·폰에서도 브라우저로 바로 열려요. 메일·카톡으로 보내기 좋아요.');
      } catch (e) { msg('err', 'HTML로 저장하지 못했어요.', '문서가 너무 크면 메모리가 부족할 수 있어요. TXT로 저장하거나 PC에서 다시 해 보세요.'); }
      finally { el.html.disabled = false; }
    });

    // PDF 저장·인쇄: 문서만 담은 새 화면을 만들어 인쇄 창을 엽니다. (인쇄 창에서 「PDF로 저장」 선택)
    el.pdf.addEventListener('click', async function () {
      if (!state.doc || state.doc.restricted || state.rendering) return;
      var w = null;
      if (IS_IOS) { try { w = global.open('', '_blank'); } catch (e) { w = null; } }
      var h = await standaloneHTML(false);
      var tip = IS_IOS ? '인쇄 화면에서 미리보기를 두 손가락으로 벌리면 PDF로 공유·저장할 수 있어요.' : '인쇄 창의 「대상(프린터)」에서 「PDF로 저장」을 고르면 PDF 파일이 만들어져요.';
      if (w) {
        w.document.open(); w.document.write(h); w.document.close();
        setTimeout(function () { try { w.focus(); w.print(); } catch (e) { /* 무시 */ } }, 600);
        msg('info', '🖨 새 탭에서 인쇄 창을 열었어요.', tip);
        return;
      }
      var fr = document.createElement('iframe');
      fr.setAttribute('aria-hidden', 'true');
      fr.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
      document.body.appendChild(fr);
      var fd = fr.contentWindow.document;
      fd.open(); fd.write(h); fd.close();
      var imgs = fd.images, waitImgs = Array.prototype.map.call(imgs, function (im) {
        return im.complete ? 0 : new Promise(function (r) { im.onload = im.onerror = r; setTimeout(r, 3000); });
      });
      await Promise.all(waitImgs);
      try { fr.contentWindow.focus(); fr.contentWindow.print(); msg('info', '🖨 인쇄 창을 열었어요.', tip); }
      catch (e) { msg('err', '인쇄 창을 열지 못했어요.', '「HTML 저장」으로 받은 파일을 열어서 인쇄해 주세요.'); }
      setTimeout(function () { fr.remove(); }, 60000);
    });

    // 공유: 지원하는 폰은 TXT 파일로, 아니면 글자를 복사
    el.share.addEventListener('click', async function () {
      if (!state.doc || state.doc.restricted) return;
      var name = baseName(state.name) + '.txt';
      try {
        var file = new File([state.text], name, { type: 'text/plain' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: baseName(state.name) });
          return;
        }
        if (navigator.share) { await navigator.share({ title: baseName(state.name), text: state.text.slice(0, 20000) }); return; }
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
      var ok = await copyText(state.text);
      msg(ok ? 'ok' : 'err', ok ? '이 브라우저는 바로 공유가 안 돼서 글자를 복사해 뒀어요.' : '공유가 지원되지 않는 브라우저예요.', ok ? '카톡·메일 입력창에 붙여 넣으세요.' : '「TXT로 저장」 후 파일을 보내 주세요.');
    });

    // 테스트·디버그용 (외부 전송 없음)
    root.__bdh = { openBytes: function (u8, name) { return show(u8, name, u8.length); }, state: state, find: find, setZoom: setZoom, standaloneHTML: standaloneHTML };
  }

  function boot() {
    var root = document.getElementById(CONFIG.ROOT_ID);
    if (root) mount(root);
  }
  global.BarodoHwpViewer = { version: VERSION, boot: boot, _internal: { openBytes: openBytes, docText: docText, inflateRawJS: inflateRawJS, parseCFB: parseCFB } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window);
