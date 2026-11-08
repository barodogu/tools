/*!
 * 착착도구 · 넷플릭스 시청기록 결산 (analyzer/netflix-history.js) v1.0
 * https://barodogu.blogspot.com
 * - 모든 분석은 브라우저 안에서만 이루어지며, 파일을 어디에도 전송하지 않습니다.
 * - 사용법: 글에 <div id="bd-nfx"></div> 를 두고 이 스크립트를 불러오세요.
 */
(function () {
  'use strict';
  var ROOT_ID = 'bd-nfx';
  var MB = 1024 * 1024;
  var MAX_FILE = 300 * MB;
  var VIEW_URL = 'https://www.netflix.com/viewingactivity';
  var JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  var WD = ['일', '월', '화', '수', '목', '금', '토'];
  var EP_RE = /(시즌|파트|에피소드|리미티드\s*시리즈|미니\s*시리즈|챕터|\d+\s*화|제\s*\d+\s*화|season|part|volume|vol\.|chapter|book|episode|limited series|series|collection)/i;
  var MIN_SEC = 60; // 1분 미만은 미리보기·실수로 보고 뺌

  /* ---------------- 스타일 ---------------- */
  var CSS = '' +
    '#bd-nfx{--r:#e50914;--rd:#b20710;--k:#141414;--t:#1f2937;--m:#6b7280;--line:#e5e7eb;--b:#2563eb;--bl:#eff6ff;' +
    'font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;color:var(--t);' +
    'max-width:640px;margin:16px auto;box-sizing:border-box;line-height:1.55;-webkit-text-size-adjust:100%;text-align:left}' +
    '#bd-nfx *{box-sizing:border-box}' +
    '#bd-nfx .nx-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:18px;box-shadow:0 2px 10px rgba(0,0,0,.05)}' +
    '#bd-nfx .nx-title{font-size:20px;font-weight:800;margin:0 0 4px}' +
    '#bd-nfx .nx-sub{font-size:14px;color:var(--m);margin:0 0 14px}' +
    '#bd-nfx .nx-drop{border:2px dashed #fca5a5;background:#fef2f2;border-radius:14px;padding:18px 14px;text-align:center}' +
    '#bd-nfx .nx-drop.on{background:#fee2e2;border-color:var(--r)}' +
    '#bd-nfx .nx-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:50px;padding:10px 14px;border-radius:12px;' +
    'border:0;font-size:16px;font-weight:700;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;text-decoration:none;font-family:inherit;line-height:1.3}' +
    '#bd-nfx .nx-btn:disabled{opacity:.5;cursor:default}' +
    '#bd-nfx .nx-main{background:var(--r);color:#fff;width:100%}' +
    '#bd-nfx .nx-main:active{background:var(--rd)}' +
    '#bd-nfx .nx-ghost{background:#fff;color:var(--b);border:1.5px solid #bfdbfe}' +
    '#bd-nfx .nx-dark{background:var(--k);color:#fff}' +
    '#bd-nfx .nx-sm{min-height:42px;font-size:14px;padding:8px 10px}' +
    '#bd-nfx .nx-row{display:flex;flex-wrap:wrap;gap:8px}' +
    '#bd-nfx .nx-row>.nx-btn{flex:1 1 130px}' +
    '#bd-nfx .nx-hint{font-size:13px;color:var(--m);margin:10px 0 0}' +
    '#bd-nfx details.nx-how{margin-top:12px;border:1px solid var(--line);border-radius:12px;padding:0 12px}' +
    '#bd-nfx details.nx-how summary{min-height:46px;display:flex;align-items:center;font-weight:700;font-size:15px;cursor:pointer;list-style:none}' +
    '#bd-nfx details.nx-how summary::-webkit-details-marker{display:none}' +
    '#bd-nfx details.nx-how summary:after{content:"▾";margin-left:auto;color:var(--m)}' +
    '#bd-nfx details.nx-how[open] summary:after{content:"▴"}' +
    '#bd-nfx .nx-how ol{margin:0 0 10px;padding-left:20px;font-size:14px}' +
    '#bd-nfx .nx-how li{margin:4px 0}' +
    '#bd-nfx .nx-how p{font-size:14px;margin:4px 0 8px}' +
    '#bd-nfx .nx-file{display:flex;align-items:center;gap:10px;background:#f9fafb;border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin-top:14px;word-break:break-all}' +
    '#bd-nfx .nx-file b{display:block;font-size:15px}' +
    '#bd-nfx .nx-file small{color:var(--m);font-size:13px;word-break:keep-all}' +
    '#bd-nfx .nx-file .nx-btn{margin-left:auto;flex:0 0 auto}' +
    '#bd-nfx .nx-lab{font-size:13px;font-weight:700;color:var(--m);margin:12px 0 0}' +
    '#bd-nfx .nx-chips{display:flex;gap:8px;overflow-x:auto;padding:4px 0 6px;-webkit-overflow-scrolling:touch}' +
    '#bd-nfx .nx-chip{flex:0 0 auto;min-height:44px;min-width:64px;border:1.5px solid var(--line);background:#fff;border-radius:99px;font-size:15px;font-weight:700;cursor:pointer;color:var(--t);padding:6px 14px;font-family:inherit}' +
    '#bd-nfx .nx-chip.sel{border-color:var(--r);background:var(--r);color:#fff}' +
    '#bd-nfx .nx-hero{margin-top:10px;border-radius:16px;padding:20px 18px;color:#fff;background:linear-gradient(150deg,#1f1f1f 0%,#141414 55%,#3a0a0d 100%)}' +
    '#bd-nfx .nx-hero h3{margin:0 0 2px;font-size:15px;font-weight:700;color:#fca5a5}' +
    '#bd-nfx .nx-big{font-size:34px;font-weight:900;line-height:1.2;margin:2px 0 4px}' +
    '#bd-nfx .nx-big em{font-style:normal;color:#ff4d57}' +
    '#bd-nfx .nx-delta{display:inline-block;margin-top:8px;font-size:13px;font-weight:700;padding:4px 10px;border-radius:99px;background:rgba(255,255,255,.12)}' +
    '#bd-nfx .nx-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px}' +
    '#bd-nfx .nx-stat{background:rgba(255,255,255,.08);border-radius:12px;padding:10px 4px;text-align:center;min-width:0}' +
    '#bd-nfx .nx-stat b{display:block;font-size:21px;font-weight:900}' +
    '#bd-nfx .nx-stat small{font-size:12px;color:#d1d5db}' +
    '#bd-nfx .nx-badges{display:flex;flex-wrap:wrap;gap:6px;margin-top:14px}' +
    '#bd-nfx .nx-badge{background:var(--r);color:#fff;font-size:13px;font-weight:800;padding:4px 10px;border-radius:99px}' +
    '#bd-nfx .nx-sec{margin-top:14px;border:1px solid var(--line);border-radius:14px;padding:14px}' +
    '#bd-nfx .nx-sec h4{margin:0 0 10px;font-size:16px;font-weight:800}' +
    '#bd-nfx .nx-rank{display:flex;flex-direction:column;gap:8px}' +
    '#bd-nfx .nx-ri{display:grid;grid-template-columns:26px 1fr auto;gap:8px;align-items:center}' +
    '#bd-nfx .nx-ri .n{font-weight:900;color:var(--r);font-size:18px;text-align:center}' +
    '#bd-nfx .nx-ri .t{min-width:0}' +
    '#bd-nfx .nx-ri .t b{display:block;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#bd-nfx .nx-ri .bar{height:8px;border-radius:99px;background:#fee2e2;margin-top:4px;overflow:hidden}' +
    '#bd-nfx .nx-ri .bar i{display:block;height:100%;background:var(--r);border-radius:99px}' +
    '#bd-nfx .nx-ri .c{font-size:14px;font-weight:800;white-space:nowrap;text-align:right}' +
    '#bd-nfx .nx-ri .c small{display:block;font-weight:500;color:var(--m);font-size:12px}' +
    '#bd-nfx .nx-cols{display:flex;align-items:flex-end;gap:4px;height:130px;padding-top:18px}' +
    '#bd-nfx .nx-cols.tight{gap:2px}' +
    '#bd-nfx .nx-col{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;min-width:0}' +
    '#bd-nfx .nx-col i{display:block;width:100%;max-width:28px;background:#fca5a5;border-radius:6px 6px 2px 2px;min-height:2px;position:relative}' +
    '#bd-nfx .nx-col i.top{background:var(--r)}' +
    '#bd-nfx .nx-col i span{position:absolute;top:-17px;left:50%;transform:translateX(-50%);font-size:11px;font-weight:700;color:var(--t);font-style:normal;white-space:nowrap}' +
    '#bd-nfx .nx-col small{font-size:11px;color:var(--m);margin-top:4px;height:15px}' +
    '#bd-nfx .nx-recs{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
    '#bd-nfx .nx-rec{background:#f9fafb;border-radius:12px;padding:10px 12px;min-width:0}' +
    '#bd-nfx .nx-rec small{display:block;font-size:12px;color:var(--m)}' +
    '#bd-nfx .nx-rec b{display:block;font-size:18px;font-weight:900;color:var(--k)}' +
    '#bd-nfx .nx-rec span{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#bd-nfx .nx-list input{width:100%;min-height:46px;border:1.5px solid var(--line);border-radius:10px;padding:8px 12px;font-size:16px;font-family:inherit;margin-bottom:8px}' +
    '#bd-nfx .nx-tbl{max-height:360px;overflow:auto;border:1px solid var(--line);border-radius:10px;-webkit-overflow-scrolling:touch}' +
    '#bd-nfx .nx-tbl table{width:100%;border-collapse:collapse;font-size:14px}' +
    '#bd-nfx .nx-tbl th{position:sticky;top:0;background:#f3f4f6;text-align:left;padding:8px;font-size:13px}' +
    '#bd-nfx .nx-tbl td{padding:8px;border-top:1px solid #f3f4f6;vertical-align:top}' +
    '#bd-nfx .nx-tbl td:first-child{word-break:break-all}' +
    '#bd-nfx .nx-tbl td.num{text-align:right;white-space:nowrap}' +
    '#bd-nfx .nx-note{margin-top:12px;font-size:13px;color:var(--m);background:#f9fafb;border-radius:10px;padding:10px 12px}' +
    '#bd-nfx .nx-err{margin-top:14px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:12px;padding:12px 14px;font-size:14px}' +
    '#bd-nfx .nx-err b{display:block;font-size:15px;margin-bottom:2px}' +
    '#bd-nfx .nx-act{margin-top:14px;padding:14px;border-radius:14px;background:var(--bl);border:1px solid #bfdbfe}' +
    '#bd-nfx .nx-act .nx-chip{min-height:40px;font-size:14px}' +
    '#bd-nfx .nx-act .nx-chip.sel{background:var(--b);border-color:var(--b)}' +
    '#bd-nfx .nx-toast{margin:8px 0 0;font-size:13px;color:#166534;text-align:center;min-height:18px}' +
    '#bd-nfx .nx-busy{margin-top:14px;text-align:center;font-size:14px;color:var(--m)}' +
    '#bd-nfx .nx-lock{margin:12px 0 0;font-size:13px;color:#166534;text-align:center}' +
    '#bd-nfx [hidden]{display:none!important}';

  /* ---------------- 유틸 ---------------- */
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function n(x) { return Number(x).toLocaleString('ko-KR'); }
  function pad(x) { return (x < 10 ? '0' : '') + x; }
  function dkey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function md(d) { return (d.getMonth() + 1) + '월 ' + d.getDate() + '일'; }
  function hm(sec) {
    var m = Math.round(sec / 60), h = Math.floor(m / 60);
    return h ? h + '시간' + (m % 60 ? ' ' + (m % 60) + '분' : '') : m + '분';
  }
  function hrs(sec) { var h = sec / 3600; return (h >= 100 ? Math.round(h) : Math.round(h * 10) / 10).toLocaleString('ko-KR'); }
  function readBuf(f) {
    if (f.arrayBuffer) return f.arrayBuffer();
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsArrayBuffer(f); });
  }
  // UTF-8로 읽고, 깨지면(엑셀에서 다시 저장한 파일) EUC-KR로 다시 읽기
  function decode(buf) {
    var t = new TextDecoder('utf-8').decode(buf);
    var bad = (t.match(/�/g) || []).length;
    if (bad > 3) { try { var k = new TextDecoder('euc-kr').decode(buf); if ((k.match(/�/g) || []).length < bad) t = k; } catch (e) { } }
    return t.replace(/^﻿/, '');
  }
  var loading = {};
  function loadScript(src) {
    if (loading[src]) return loading[src];
    loading[src] = new Promise(function (res, rej) {
      var s = document.createElement('script'), t = setTimeout(function () { delete loading[src]; rej(new Error('LIB_FAIL')); }, 25000);
      s.src = src; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = function () { clearTimeout(t); res(); };
      s.onerror = function () { clearTimeout(t); delete loading[src]; rej(new Error('LIB_FAIL')); };
      document.head.appendChild(s);
    });
    return loading[src];
  }
  // 따옴표·줄바꿈을 지키는 CSV 파서
  function parseCSV(text) {
    var rows = [], row = [], f = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(f); f = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = [];
      } else f += c;
    }
    row.push(f); if (row.length > 1 || row[0] !== '') rows.push(row);
    return rows;
  }

  /* ---------------- 날짜 형식 자동 인식 (빠른 CSV) ---------------- */
  // 한국 "26. 11. 3." · 미국 "11/3/26" · 유럽 "03/11/2026" · ISO "2026-11-03" 모두 처리
  function guessDates(raw) {
    var nums = raw.map(function (s) { var m = String(s).match(/\d+/g); return m && m.length >= 3 ? m.slice(0, 3).map(Number) : null; });
    var best = null;
    ['YMD', 'MDY', 'DMY'].forEach(function (o) {
      var valid = 0, sorted = 0, prev = null, dates = nums.map(function (a) {
        if (!a) return null;
        var y = a[o.indexOf('Y')], mo = a[o.indexOf('M')], d = a[o.indexOf('D')];
        if (o === 'YMD' && a[0] < 100 && a[2] > 31) return null;
        if (y < 100) y += 2000;
        if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2006 || y > 2100) return null;
        var dt = new Date(y, mo - 1, d);
        return dt.getMonth() === mo - 1 ? dt : null;
      });
      dates.forEach(function (dt) { if (dt) { valid++; if (prev && dt <= prev) sorted++; prev = dt; } });
      var score = valid * 10 + sorted;
      if (!best || score > best.score) best = { score: score, dates: dates, valid: valid };
    });
    return best;
  }

  /* ---------------- 제목 → 시리즈/영화 ---------------- */
  function splitTitle(t) {
    var seg = t.split(/:\s+/);
    if (seg.length >= 3) return { show: seg[0].trim(), ep: seg.slice(1).join(': '), series: true };
    if (seg.length === 2 && EP_RE.test(seg[1])) return { show: seg[0].trim(), ep: seg[1], series: true };
    return { show: t.trim(), ep: '', series: false, two: seg.length === 2 ? seg[0].trim() : '' };
  }
  function classify(items) {
    // 같은 영화를 여러 번 본 것과 구분하려고, 뒷부분이 서로 다른 경우만 셈
    var parts = items.map(function (it) { return splitTitle(it.title); }), cnt = {}, seen = {};
    parts.forEach(function (p, i) {
      if (p.series) { cnt[p.show] = 99; return; }
      if (!p.two || seen[items[i].title]) return;
      seen[items[i].title] = 1; cnt[p.two] = (cnt[p.two] || 0) + 1;
    });
    parts.forEach(function (p, i) {
      if (!p.series && p.two && cnt[p.two] >= 3) { p.series = true; p.ep = items[i].title.slice(p.two.length).replace(/^:\s*/, ''); p.show = p.two; }
      items[i].show = p.show; items[i].ep = p.ep; items[i].series = p.series;
    });
    return items;
  }
  function device(s) {
    s = s || '';
    if (/iPad|Tablet|Galaxy Tab|Kindle/i.test(s)) return '태블릿';
    if (/iPhone|Phone|Mobile/i.test(s)) return '휴대폰';
    if (/PlayStation|PS[345]|Xbox|Nintendo|Switch/i.test(s)) return '게임기';
    if (/TV|Chromecast|Roku|Fire Stick|Set.?top|Apple TV|Tizen|webOS|Streaming Stick|Projector/i.test(s)) return 'TV';
    if (/PC|Mac|Chrome|Edge|Firefox|Safari|Windows|Opera|Browser|Cadmium/i.test(s)) return 'PC';
    return '기타';
  }

  /* ---------------- 파일 읽기 ---------------- */
  // 결과: { kind:'quick'|'full', profiles:{이름:[항목]}, skipped }
  function load(text) {
    var rows = parseCSV(text);
    if (rows.length < 2) throw new Error('EMPTY');
    var head = rows[0].map(function (h) { return h.trim().toLowerCase(); });
    var col = function (k) { return head.indexOf(k); };
    if (col('start time') >= 0 && col('title') >= 0) return loadFull(rows.slice(1), col);
    var ti = col('title') >= 0 ? col('title') : col('제목'), di = col('date') >= 0 ? col('date') : col('날짜');
    if (ti < 0 || di < 0) throw new Error('NO_COLUMNS');
    var body = rows.slice(1).filter(function (r) { return r[ti] && r[di]; });
    if (!body.length) throw new Error('EMPTY');
    var g = guessDates(body.map(function (r) { return r[di]; }));
    if (!g || g.valid < body.length * 0.8) throw new Error('BAD_DATES');
    var items = [];
    body.forEach(function (r, i) { var d = g.dates[i]; if (d) items.push({ title: r[ti].trim(), date: d }); });
    return { kind: 'quick', profiles: { '내 프로필': classify(items) }, skipped: 0 };
  }
  function loadFull(body, col) {
    var pi = col('profile name'), si = col('start time'), du = col('duration'), ti = col('title'), sv = col('supplemental video type'), dv = col('device type');
    var prof = {}, skipped = 0;
    body.forEach(function (r) {
      if (!r[ti] || !r[si]) return;
      if (sv >= 0 && (r[sv] || '').trim()) { skipped++; return; } // 예고편·미리보기
      var dm = /(\d+):(\d+):(\d+)/.exec(r[du] || ''), sec = dm ? +dm[1] * 3600 + +dm[2] * 60 + +dm[3] : 0;
      if (du >= 0 && sec < MIN_SEC) { skipped++; return; }
      var tm = /(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2}):(\d{1,2})/.exec(r[si]);
      if (!tm) { skipped++; return; }
      var d = new Date(Date.UTC(+tm[1], tm[2] - 1, +tm[3], +tm[4], +tm[5], +tm[6])); // UTC → 이 기기 시간대
      var name = pi >= 0 && r[pi] ? r[pi].trim() : '내 프로필';
      (prof[name] || (prof[name] = [])).push({ title: r[ti].trim(), date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), at: d, sec: sec, dev: device(dv >= 0 ? r[dv] : '') });
    });
    var names = Object.keys(prof);
    if (!names.length) throw new Error('EMPTY');
    names.forEach(function (k) {
      // 한 회차를 여러 번 나눠 보면 시간은 합치고 편 수는 하루 1번만 셈
      var seen = {};
      prof[k].forEach(function (it) { var key = it.title + '|' + dkey(it.date); it.dup = !!seen[key]; seen[key] = 1; });
      classify(prof[k]);
    });
    return { kind: 'full', profiles: prof, skipped: skipped };
  }
  async function readZip(buf) {
    try { await loadScript(JSZIP); } catch (e) { throw new Error('ZIP_LIB'); }
    if (!window.JSZip) throw new Error('ZIP_LIB');
    var zip;
    try { zip = await window.JSZip.loadAsync(buf); } catch (e) { throw new Error('ZIP_BAD'); }
    var f = zip.file(/(^|\/)ViewingActivity\.csv$/i)[0];
    if (!f) throw new Error('ZIP_NO_VIEW');
    return { name: f.name.split('/').pop(), text: decode(await f.async('arraybuffer')) };
  }

  /* ---------------- 분석 ---------------- */
  function analyze(items, year) {
    var list = year === 'all' ? items : items.filter(function (it) { return it.date.getFullYear() === year; });
    var timed = list.length > 0 && list[0].sec != null;
    var r = { year: year, timed: timed, views: 0, eps: 0, movies: 0, sec: 0, shows: {}, movieMap: {}, days: {}, months: new Array(12).fill(0), mSec: new Array(12).fill(0), wd: new Array(7).fill(0), hours: new Array(24).fill(0), devs: {} };
    if (!list.length) return r;
    list.forEach(function (it) {
      var k = dkey(it.date), s = it.sec || 0, cnt = it.dup ? 0 : 1;
      var day = r.days[k] || (r.days[k] = { n: 0, sec: 0, shows: {} });
      day.n += cnt; day.sec += s; day.shows[it.show] = (day.shows[it.show] || 0) + cnt + s / 1e6;
      r.views += cnt; r.sec += s;
      r.months[it.date.getMonth()] += cnt; r.mSec[it.date.getMonth()] += s; r.wd[it.date.getDay()] += cnt;
      if (it.at) { r.hours[it.at.getHours()] += s; r.devs[it.dev] = (r.devs[it.dev] || 0) + s; }
      var map = it.series ? r.shows : r.movieMap;
      var o = map[it.show] || (map[it.show] = { name: it.show, series: it.series, n: 0, sec: 0, first: it.date, last: it.date });
      o.n += cnt; o.sec += s;
      if (it.date < o.first) o.first = it.date; if (it.date > o.last) o.last = it.date;
      if (it.series) r.eps += cnt; else r.movies += cnt;
    });
    var byKey = timed ? function (a, b) { return b.sec - a.sec || b.n - a.n; } : function (a, b) { return b.n - a.n || a.first - b.first; };
    r.showRank = Object.keys(r.shows).map(function (k) { return r.shows[k]; }).sort(byKey);
    r.movieRank = Object.keys(r.movieMap).map(function (k) { return r.movieMap[k]; }).sort(byKey);
    r.titles = r.showRank.length + r.movieRank.length;
    var dayKeys = Object.keys(r.days).sort();
    r.dayCount = dayKeys.length;
    var bd = dayKeys[0];
    dayKeys.forEach(function (k) { var a = r.days[k], b = r.days[bd]; if ((timed ? a.sec - b.sec : a.n - b.n) > 0) bd = k; });
    var bs = r.days[bd].shows;
    r.binge = { date: new Date(bd + 'T00:00:00'), n: r.days[bd].n, sec: r.days[bd].sec, show: Object.keys(bs).sort(function (a, b) { return bs[b] - bs[a]; })[0] };
    var best = 1, cur = 1, bestEnd = dayKeys[0];
    for (var i = 1; i < dayKeys.length; i++) {
      var gap = Math.round((new Date(dayKeys[i] + 'T00:00:00') - new Date(dayKeys[i - 1] + 'T00:00:00')) / 864e5);
      cur = gap === 1 ? cur + 1 : 1;
      if (cur > best) { best = cur; bestEnd = dayKeys[i]; }
    }
    r.streak = { n: best, end: new Date(bestEnd + 'T00:00:00') };
    var sp = null;
    r.showRank.forEach(function (s) {
      if (s.n < 5) return;
      var span = Math.round((s.last - s.first) / 864e5) + 1, rate = s.n / span;
      if (!sp || rate > sp.rate) sp = { name: s.name, n: s.n, span: span, rate: rate };
    });
    r.speed = sp;
    var sorted = list.slice().sort(function (a, b) { return (a.at || a.date) - (b.at || b.date); });
    r.first = sorted[0]; r.last = sorted[sorted.length - 1];
    var mArr = timed ? r.mSec : r.months;
    r.topMonth = mArr.indexOf(Math.max.apply(null, mArr));
    r.topWd = r.wd.indexOf(Math.max.apply(null, r.wd));
    r.weekendShare = (r.wd[0] + r.wd[6]) / Math.max(1, r.views);
    if (timed) {
      r.topHour = r.hours.indexOf(Math.max.apply(null, r.hours));
      var night = 0; for (var h = 0; h < 5; h++) night += r.hours[h];
      r.nightShare = night / Math.max(1, r.sec);
      r.devRank = Object.keys(r.devs).map(function (k) { return { name: k, sec: r.devs[k] }; }).sort(function (a, b) { return b.sec - a.sec; });
    }
    r.badges = badges(r);
    return r;
  }
  function badges(r) {
    var b = [];
    if (r.timed ? r.binge.sec >= 5 * 3600 : r.binge.n >= 6) b.push('🔥 정주행 끝판왕');
    if (r.timed && r.nightShare >= 0.25) b.push('🦉 새벽 정주행러');
    if (r.movies / Math.max(1, r.views) >= 0.5 && r.movies >= 5) b.push('🎞 영화 덕후');
    if (r.showRank.length >= 15 && r.eps / r.showRank.length < 3) b.push('🍿 찍먹 탐험가');
    if (r.showRank[0] && r.showRank[0].n >= r.eps * 0.3 && r.showRank[0].n >= 10) b.push('💘 한 작품만 판다');
    if (r.weekendShare >= 0.45) b.push('🛋 주말 몰아보기파');
    else if (r.weekendShare <= 0.2 && r.views >= 20) b.push('🌙 평일 저녁 힐링파');
    if (r.streak.n >= 7) b.push('📅 ' + r.streak.n + '일 연속 출석');
    if (!b.length) b.push('🙂 여유로운 감상러');
    return b.slice(0, 3);
  }
  function compare(cur, prev) {
    if (!prev || prev.views < 20) return null; // 작년 기록이 너무 적으면 비교가 과장돼서 숨김
    var base = cur.timed ? prev.sec : prev.views, now = cur.timed ? cur.sec : cur.views;
    if (!base) return null;
    return { pct: Math.round((now - base) / base * 100), txt: cur.timed ? hrs(prev.sec) + '시간' : n(prev.views) + '편' };
  }

  /* ---------------- 예시 데이터 (가상의 작품 · 개인정보 다운로드 형식) ---------------- */
  function sampleCSV() {
    var A = ['별빛', '한밤의', '우리 동네', '바다 건너', '서울', '고양이', '마지막', '비밀의', '푸른', '작은'];
    var B = ['수사대', '셰프', '도서관', '편지', '좀비 2050', '탐정 사무소', '정류장', '정원', '학교', '호텔'];
    var movies = ['마지막 여름 기차', '달빛 레이스', '작은 우주선', '안녕, 로봇', '비 오는 날의 재즈', '산으로 간 선장', '여섯 번째 계절', '종이비행기 클럽'];
    var devs = ['Samsung 2022 UHD TV Smart TV', 'Apple iPhone 15 Pro', 'Chrome PC (Cadmium)', 'Apple iPad Air'];
    var seed = 11, used = {}, queue = [], out = [];
    function rnd(k) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >>> 16) % k; } // 아래 비트는 주기가 짧아 위 비트 사용
    function refill() {
      var name; do { name = A[rnd(A.length)] + ' ' + B[rnd(B.length)]; } while (used[name]);
      used[name] = 1;
      var seasons = 1 + rnd(2), eps = 6 + rnd(11);
      for (var se = 1; se <= seasons; se++) for (var e = 1; e <= eps; e++) queue.push(name + ': 시즌 ' + se + ': ' + e + '화');
    }
    function stamp(d, h, m) { var u = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, rnd(60)); return u.getUTCFullYear() + '-' + pad(u.getUTCMonth() + 1) + '-' + pad(u.getUTCDate()) + ' ' + u.getUTCHours() + ':' + pad(u.getUTCMinutes()) + ':' + pad(u.getUTCSeconds()); }
    function dur(s) { return Math.floor(s / 3600) + ':' + pad(Math.floor(s / 60) % 60) + ':' + pad(s % 60); }
    for (var day = new Date(2025, 0, 1); day <= new Date(2026, 10, 7); day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) {
      var k = rnd(10), cnt = k < 5 ? 0 : k < 8 ? 1 + rnd(2) : 3 + rnd(5), wk = day.getDay() === 0 || day.getDay() === 6;
      if (wk) cnt += rnd(3);
      var h = wk ? 13 + rnd(8) : 19 + rnd(4), m = rnd(50), dv = devs[rnd(10) < 6 ? 0 : 1 + rnd(3)];
      if (rnd(12) === 0) out.push(['나', stamp(day, h, m), dur(25 + rnd(30)), '', '예고편', 'TRAILER', dv]); // 예고편은 빠져야 함
      for (var j = 0; j < cnt; j++) {
        var title, s;
        if (rnd(8) === 0) { title = movies[rnd(movies.length)]; s = 5400 + rnd(2400); }
        else { if (!queue.length) refill(); title = queue.shift(); s = 2400 + rnd(1500); }
        out.push(['나', stamp(day, h, m), dur(s), '', title, '', dv]);
        m += Math.round(s / 60) + 2; if (m >= 60) { h += Math.floor(m / 60); m %= 60; } if (h > 23) h = 23;
      }
      if (rnd(9) === 0) out.push(['가족', stamp(day, 20, rnd(50)), dur(1800 + rnd(2000)), '', '푸른 정원: 시즌 1: ' + (1 + rnd(10)) + '화', '', devs[0]]);
    }
    out.reverse(); // 최신순
    var lines = ['Profile Name,Start Time,Duration,Attributes,Title,Supplemental Video Type,Device Type,Bookmark,Latest Bookmark,Country'];
    out.forEach(function (o) { lines.push(o.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(',') + ',"","","KR (South Korea)"'); });
    return lines.join('\n');
  }

  /* ---------------- 결산 이미지 ---------------- */
  var THEMES = {
    dark: { bg: ['#1f1f1f', '#141414', '#4a0b10'], main: '#ffffff', sub: '#d1d5db', acc: '#e50914', soft: '#fca5a5', card: 'rgba(255,255,255,.09)', track: 'rgba(255,255,255,.12)', foot: '#9ca3af' },
    light: { bg: ['#fff7ed', '#fffbf5', '#fde2e4'], main: '#1f1f1f', sub: '#4b5563', acc: '#e50914', soft: '#b20710', card: 'rgba(0,0,0,.05)', track: 'rgba(0,0,0,.08)', foot: '#6b7280' }
  };
  function drawImage(r, opt) {
    var story = opt.size === 'story', T = THEMES[opt.theme] || THEMES.dark;
    var W = 1080, H = story ? 1920 : 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var c = cv.getContext('2d'), F = '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
    var g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, T.bg[0]); g.addColorStop(0.55, T.bg[1]); g.addColorStop(1, T.bg[2]);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    function txt(s, x, y, size, color, weight, align) { c.font = (weight || 700) + ' ' + size + 'px ' + F; c.fillStyle = color; c.textAlign = align || 'left'; c.fillText(s, x, y); }
    function fit(s, max, size, weight) { c.font = (weight || 700) + ' ' + size + 'px ' + F; while (c.measureText(s).width > max && s.length > 2) s = s.slice(0, -2) + '…'; return s; }
    var y = story ? 220 : 140, yl = r.year === 'all' ? '전체 기간' : r.year + '년';
    txt('나의 ' + yl + ' 넷플릭스 결산', 80, y, 44, T.soft, 700);
    var big = r.timed ? hrs(r.sec) + '시간' : n(r.views) + '편';
    y += 120; txt(big, 80, y, 120, T.main, 900);
    c.font = '900 120px ' + F; var bw = c.measureText(big).width;
    txt('을 봤어요', 80 + bw + 4, y, 52, T.main, 700);
    if (opt.cmp) { y += 60; txt('작년보다 ' + Math.abs(opt.cmp.pct) + '% ' + (opt.cmp.pct >= 0 ? '더' : '덜') + ' 봤어요', 80, y, 34, T.sub, 600); }
    y += 50;
    var st = r.timed ? [['본 편 수', n(r.views)], ['작품', n(r.titles)], ['본 날', n(r.dayCount) + '일']] : [['시리즈 회차', n(r.eps)], ['영화', n(r.movies)], ['본 날', n(r.dayCount) + '일']];
    st.forEach(function (s, i) {
      var x = 80 + i * 315; c.fillStyle = T.card; roundRect(c, x, y, 290, 150, 24); c.fill();
      txt(s[1], x + 145, y + 85, 60, T.main, 900, 'center'); txt(s[0], x + 145, y + 128, 28, T.sub, 500, 'center');
    });
    y += 235;
    txt('가장 많이 본 시리즈', 80, y, 34, T.soft, 700);
    var top = r.showRank.slice(0, story ? 7 : 5), max = top.length ? (r.timed ? top[0].sec : top[0].n) : 1;
    y += 55;
    top.forEach(function (s, i) {
      txt(String(i + 1), 80, y + 34, 44, T.acc, 900);
      txt(fit(s.name, 620, 36), 140, y + 22, 36, T.main, 700);
      c.fillStyle = T.track; roundRect(c, 140, y + 40, 700, 14, 7); c.fill();
      c.fillStyle = T.acc; roundRect(c, 140, y + 40, Math.max(14, 700 * (r.timed ? s.sec : s.n) / max), 14, 7); c.fill();
      txt(r.timed ? hrs(s.sec) + '시간' : s.n + '화', 1000, y + 50, 32, T.main, 800, 'right');
      y += story ? 92 : 82; // 피드는 줄 간격을 좁혀 아래 글과 겹치지 않게
    });
    if (!top.length) { txt('시리즈 기록이 없어요', 80, y + 30, 34, T.sub, 500); y += 92; }
    y = Math.max(y + 30, story ? 1390 : 1080);
    txt('🔥 하루 최다  ' + md(r.binge.date) + ' · ' + (r.timed ? hm(r.binge.sec) : r.binge.n + '편'), 80, y, 34, T.main, 700);
    y += 56; txt('📅 최장 연속  ' + r.streak.n + '일', 80, y, 34, T.main, 700);
    if (story && r.timed) { y += 56; txt('⏰ 주로 ' + r.topHour + '시대 · ' + (r.devRank[0] ? r.devRank[0].name : '') + '로 봤어요', 80, y, 34, T.main, 700); }
    if (story) { y += 56; txt('📊 ' + (r.topMonth + 1) + '월에 가장 많이, ' + WD[r.topWd] + '요일이 최고', 80, y, 34, T.main, 700); }
    y += 64; txt(fit(r.badges.join('  '), 920, 34), 80, y, 34, T.soft, 800);
    txt('착착도구 · barodogu.blogspot.com', W - 80, H - 50, 26, T.foot, 500, 'right');
    return cv;
  }
  function roundRect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function summaryText(r, cmp) {
    var yl = r.year === 'all' ? '전체 기간' : r.year + '년';
    var s = '🎬 나의 ' + yl + ' 넷플릭스 결산\n' +
      (r.timed ? '· 총 ' + hrs(r.sec) + '시간 (' + n(r.views) + '편)\n' : '· 총 ' + n(r.views) + '편 (시리즈 ' + n(r.eps) + '화 · 영화 ' + n(r.movies) + '편)\n') +
      (cmp ? '· 작년보다 ' + Math.abs(cmp.pct) + '% ' + (cmp.pct >= 0 ? '더' : '덜') + ' 봤어요\n' : '') +
      '· 본 날 ' + n(r.dayCount) + '일 · 최장 연속 ' + r.streak.n + '일\n' +
      '· 하루 최다 ' + md(r.binge.date) + ' ' + (r.timed ? hm(r.binge.sec) : r.binge.n + '편') + '\n';
    if (r.showRank.length) s += '· 가장 많이 본 시리즈: ' + r.showRank.slice(0, 3).map(function (x, i) { return (i + 1) + '위 ' + x.name + '(' + (r.timed ? hrs(x.sec) + '시간' : x.n + '화') + ')'; }).join(', ') + '\n';
    s += '· 나의 유형: ' + r.badges.join(' ') + '\n\n착착도구 넷플릭스 결산 · https://barodogu.blogspot.com';
    return s;
  }
  function listCSV(r) {
    var rows = [['작품', '구분', '편 수'].concat(r.timed ? ['시청 시간(분)'] : []).concat(['처음 본 날', '마지막 본 날'])];
    r.showRank.concat(r.movieRank).forEach(function (o) {
      rows.push([o.name, o.series ? '시리즈' : '영화', o.n].concat(r.timed ? [Math.round(o.sec / 60)] : []).concat([dkey(o.first), dkey(o.last)]));
    });
    return '﻿' + rows.map(function (a) { return a.map(function (v) { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\r\n');
  }

  /* ---------------- 오류 문구 ---------------- */
  function errInfo(e) {
    var s = (e && e.message) || '';
    if (/NOT_CSV/.test(s)) return ['넷플릭스 시청 기록 파일이 아니에요', '시청 기록 화면의 「모두 다운로드」로 받은 CSV 파일, 또는 「개인정보 다운로드」로 받은 ZIP 파일을 넣어 주세요.'];
    if (/ZIP_LIB/.test(s)) return ['ZIP 파일을 여는 도구를 불러오지 못했어요', '인터넷 연결을 확인하고 다시 해 주세요. 계속 안 되면 ZIP 압축을 풀어서 안에 있는 ViewingActivity.csv 파일만 넣어도 돼요.'];
    if (/ZIP_BAD/.test(s)) return ['ZIP 파일이 손상됐어요', '내려받다 끊겼을 수 있어요. 넷플릭스 메일의 링크에서 다시 내려받아 주세요.'];
    if (/ZIP_NO_VIEW/.test(s)) return ['ZIP 안에 시청 기록이 없어요', '넷플릭스 「개인정보 다운로드」 ZIP이 맞는지 확인해 주세요. 그 안의 Content Interaction 폴더에 ViewingActivity.csv가 있어야 해요.'];
    if (/TOO_BIG/.test(s)) return ['파일이 너무 커요', '시청 기록 파일은 보통 수 MB 안이에요. 다른 파일을 고르지 않았는지 확인해 주세요.'];
    if (/NO_COLUMNS/.test(s)) return ['넷플릭스 시청 기록 파일이 아닌 것 같아요', '첫 줄에 Title, Date 칸이 있어야 해요. 넷플릭스에서 받은 파일을 그대로 넣어 주세요. 엑셀에서 고쳐 저장했다면 원래 파일을 다시 받아 주세요.'];
    if (/BAD_DATES/.test(s)) return ['날짜를 읽을 수 없어요', '엑셀에서 열었다가 저장하면 날짜 모양이 바뀔 수 있어요. 넷플릭스에서 파일을 다시 받아 그대로 넣어 주세요.'];
    if (/EMPTY/.test(s)) return ['시청 기록이 비어 있어요', '이 프로필에서 본 작품이 없거나 빈 파일이에요. 시청 기록이 있는 프로필을 골라 다시 받아 주세요.'];
    return ['파일을 읽는 중에 문제가 생겼어요', '새로고침한 뒤 다시 해 주세요. 계속 안 되면 넷플릭스에서 파일을 다시 받아 주세요.'];
  }

  /* ============ 화면 ============ */
  function mount(root) {
    if (root.getAttribute('data-ready')) return;
    root.setAttribute('data-ready', '1');
    if (!document.getElementById('bd-nfx-style')) {
      var st = document.createElement('style'); st.id = 'bd-nfx-style'; st.textContent = CSS; document.head.appendChild(st);
    }
    var S = { data: null, profile: null, year: null, res: null, cmp: null, img: { size: 'feed', theme: 'dark' }, q: '' };

    root.innerHTML =
      '<div class="nx-card">' +
      '<p class="nx-title">🎬 넷플릭스 시청기록 결산</p>' +
      '<p class="nx-sub">시청 기록 파일을 넣으면 올해 몇 편·몇 시간 봤는지, 뭘 제일 많이 봤는지 정리해 드려요.</p>' +
      '<div class="nx-drop" data-r="drop">' +
      '<div class="nx-row"><button type="button" class="nx-btn nx-main" data-r="pick">📂 시청 기록 파일 선택 (CSV·ZIP)</button></div>' +
      '<div class="nx-row" style="margin-top:8px"><button type="button" class="nx-btn nx-ghost" data-r="sample">🧪 예시 데이터로 체험하기</button></div>' +
      '<p class="nx-hint">PC에서는 파일을 이 상자로 끌어다 놓아도 돼요.</p>' +
      '<input type="file" accept=".csv,.zip,text/csv,application/zip,application/x-zip-compressed" data-r="input" hidden>' +
      '</div>' +
      '<details class="nx-how" data-r="how"><summary>📥 시청 기록 파일 받는 법</summary>' +
      '<p><b>① 바로 받기 (편 수 결산)</b></p><ol>' +
      '<li>폰이나 PC의 <b>웹 브라우저</b>로 넷플릭스에 로그인해요. (앱에서는 안 돼요)</li>' +
      '<li>아래 버튼으로 <b>시청 기록</b> 화면을 열고, 내 프로필을 골라요.</li>' +
      '<li>맨 아래 <b>「모두 다운로드」</b>를 누르면 CSV 파일이 바로 받아져요.</li></ol>' +
      '<div class="nx-row" style="margin-bottom:10px"><a class="nx-btn nx-dark" href="' + VIEW_URL + '" target="_blank" rel="noopener">넷플릭스 시청 기록 열기 ↗</a></div>' +
      '<p><b>② 시청 시간까지 보기</b> — 계정 → <b>「개인정보 다운로드」</b>를 신청하면 메일로 ZIP 파일이 와요. 준비에 며칠 걸릴 수 있어요. 받은 ZIP을 그대로 넣으면 실제 시청 시간·기기·시간대까지 나와요.</p>' +
      '</details>' +
      '<div class="nx-file" data-r="file" hidden><span style="font-size:26px">🎞</span><div><b data-r="fname"></b><small data-r="fmeta"></small></div>' +
      '<button type="button" class="nx-btn nx-ghost nx-sm" data-r="clear">다른 파일</button></div>' +
      '<p class="nx-busy" data-r="busy" hidden>파일을 읽는 중…</p>' +
      '<div data-r="err" hidden></div>' +
      '<div data-r="pbox" hidden><p class="nx-lab">프로필</p><div class="nx-chips" data-r="profiles"></div></div>' +
      '<div data-r="ybox" hidden><p class="nx-lab">기간</p><div class="nx-chips" data-r="years"></div></div>' +
      '<div data-r="res" hidden></div>' +
      '<p class="nx-lock">🔒 파일은 서버로 전송되지 않고 이 기기 안에서만 분석돼요.</p>' +
      '</div>';

    function $(r) { return root.querySelector('[data-r="' + r + '"]'); }
    var input = $('input');

    function showErr(e) {
      var info = errInfo(e), box = $('err');
      box.innerHTML = '<div class="nx-err"><b>⚠️ ' + esc(info[0]) + '</b>' + esc(info[1]) + '</div>';
      box.hidden = false;
    }
    function reset() {
      S.data = null; S.res = null;
      ['err', 'res', 'ybox', 'pbox', 'file', 'busy'].forEach(function (k) { $(k).hidden = true; });
      $('drop').hidden = false; $('how').hidden = false;
    }

    function useText(name, text) {
      reset();
      try { S.data = load(text); } catch (e) { showErr(e); return; }
      var names = Object.keys(S.data.profiles).sort(function (a, b) { return S.data.profiles[b].length - S.data.profiles[a].length; });
      var total = 0, mn = null, mx = null;
      names.forEach(function (k) { S.data.profiles[k].forEach(function (it) { total++; if (!mn || it.date < mn) mn = it.date; if (!mx || it.date > mx) mx = it.date; }); });
      $('fname').textContent = name;
      $('fmeta').textContent = n(total) + '개 기록 · ' + mn.getFullYear() + '.' + (mn.getMonth() + 1) + ' ~ ' + mx.getFullYear() + '.' + (mx.getMonth() + 1) +
        (S.data.kind === 'full' ? ' · 시청 시간 포함' : '') + (S.data.skipped ? ' · 예고편 등 ' + n(S.data.skipped) + '개 제외' : '');
      $('file').hidden = false; $('drop').hidden = true; $('how').hidden = true;
      $('profiles').innerHTML = names.map(function (k) { return '<button type="button" class="nx-chip" data-p="' + esc(k) + '">' + esc(k) + '</button>'; }).join('');
      $('pbox').hidden = names.length < 2;
      selProfile(names[0]);
    }
    function selProfile(p) {
      S.profile = p;
      root.querySelectorAll('[data-p]').forEach(function (c) { c.classList.toggle('sel', c.getAttribute('data-p') === p); });
      var ys = {};
      S.data.profiles[p].forEach(function (it) { ys[it.date.getFullYear()] = 1; });
      var years = Object.keys(ys).map(Number).sort(function (a, b) { return b - a; });
      $('years').innerHTML = years.map(function (y) { return '<button type="button" class="nx-chip" data-y="' + y + '">' + y + '년</button>'; }).join('') +
        (years.length > 1 ? '<button type="button" class="nx-chip" data-y="all">전체</button>' : '');
      $('ybox').hidden = false;
      selYear(years.indexOf(S.year) >= 0 ? S.year : years[0]);
    }
    function selYear(y) {
      S.year = y; S.q = '';
      root.querySelectorAll('[data-y]').forEach(function (c) { c.classList.toggle('sel', String(y) === c.getAttribute('data-y')); });
      var items = S.data.profiles[S.profile];
      S.res = analyze(items, y);
      S.cmp = y === 'all' ? null : compare(S.res, analyze(items, y - 1));
      render(S.res, S.cmp);
    }

    function bars(vals, labels, top, tight, fmtv) {
      var max = Math.max.apply(null, vals) || 1;
      return '<div class="nx-cols' + (tight ? ' tight' : '') + '">' + vals.map(function (v, i) {
        return '<div class="nx-col"><i class="' + (i === top && v ? 'top' : '') + '" style="height:' + Math.max(2, v / max * 100) + '%">' + (v && fmtv ? '<span>' + fmtv(v) + '</span>' : '') + '</i><small>' + labels[i] + '</small></div>';
      }).join('') + '</div>';
    }
    function render(r, cmp) {
      var box = $('res'), yl = r.year === 'all' ? '전체 기간' : r.year + '년';
      if (!r.views) { box.innerHTML = '<div class="nx-note">' + yl + '에는 시청 기록이 없어요.</div>'; box.hidden = false; return; }
      var html = '<div class="nx-hero"><h3>나의 ' + esc(yl) + ' 넷플릭스</h3>' +
        (r.timed ? '<div class="nx-big"><em>' + hrs(r.sec) + '</em>시간을 봤어요</div>' : '<div class="nx-big"><em>' + n(r.views) + '</em>편을 봤어요</div>') +
        '<div style="font-size:14px;color:#d1d5db">' + md(r.first.date) + '부터 ' + md(r.last.date) + '까지' + (r.timed ? ' · 본 날 하루 평균 ' + hm(r.sec / r.dayCount) : ' 기록이에요') + '</div>' +
        (cmp ? '<span class="nx-delta">' + (cmp.pct >= 0 ? '📈 작년(' + cmp.txt + ')보다 ' + cmp.pct + '% 더 봤어요' : '📉 작년(' + cmp.txt + ')보다 ' + (-cmp.pct) + '% 덜 봤어요') + '</span>' : '') +
        '<div class="nx-stats">' +
        (r.timed ? stat(n(r.views), '본 편 수') + stat(n(r.titles), '본 작품') : stat(n(r.eps), '시리즈 회차') + stat(n(r.movies), '영화')) +
        stat(n(r.dayCount) + '<span style="font-size:14px">일</span>', '넷플릭스 본 날') + '</div>' +
        '<div class="nx-badges">' + r.badges.map(function (b) { return '<span class="nx-badge">' + esc(b) + '</span>'; }).join('') + '</div></div>';
      if (r.showRank.length) {
        var max = r.timed ? r.showRank[0].sec : r.showRank[0].n;
        html += '<div class="nx-sec"><h4>🏆 가장 많이 본 시리즈</h4><div class="nx-rank">' +
          r.showRank.slice(0, 5).map(function (s, i) {
            var v = r.timed ? s.sec : s.n;
            return '<div class="nx-ri"><span class="n">' + (i + 1) + '</span><div class="t"><b>' + esc(s.name) + '</b><div class="bar"><i style="width:' + Math.max(4, v / max * 100) + '%"></i></div></div>' +
              '<span class="c">' + (r.timed ? hrs(s.sec) + '시간<small>' + s.n + '화</small>' : s.n + '화') + '</span></div>';
          }).join('') + '</div>' +
          (r.showRank.length > 5 ? '<p class="nx-hint" style="margin-top:8px">그 밖에 시리즈 ' + (r.showRank.length - 5) + '개를 더 봤어요.</p>' : '') + '</div>';
      }
      if (r.movieRank.length) {
        html += '<div class="nx-sec"><h4>🎞 본 영화 ' + r.movieRank.length + '편</h4><p class="nx-hint" style="margin:0">' +
          r.movieRank.slice(0, 6).map(function (m) { return esc(m.name) + (m.n > 1 ? ' (' + m.n + '번)' : ''); }).join(' · ') + (r.movieRank.length > 6 ? ' 외' : '') + '</p></div>';
      }
      html += '<div class="nx-sec"><h4>🏅 나의 기록</h4><div class="nx-recs">' +
        rec('하루 최다 시청', r.timed ? hm(r.binge.sec) : r.binge.n + '편', md(r.binge.date) + ' · ' + r.binge.show) +
        rec('최장 연속 시청', r.streak.n + '일', md(r.streak.end) + '까지') +
        (r.speed ? rec('가장 빠른 정주행', r.speed.n + '화 / ' + r.speed.span + '일', r.speed.name) : rec('시리즈 수', r.showRank.length + '개', '영화 ' + r.movieRank.length + '편')) +
        rec(r.year === 'all' ? '처음 본 작품' : '올해 첫 작품', md(r.first.date), r.first.show) +
        '</div></div>';
      var mv = r.timed ? r.mSec : r.months;
      html += '<div class="nx-sec"><h4>📊 월별 시청 (' + (r.topMonth + 1) + '월에 가장 많이 봤어요)</h4>' +
        bars(mv, mv.map(function (v, i) { return i + 1; }), r.topMonth, false, r.timed ? function (v) { return Math.round(v / 3600); } : String) +
        (r.timed ? '<p class="nx-hint" style="margin-top:4px">막대 위 숫자는 시간이에요.</p>' : '') + '</div>';
      html += '<div class="nx-sec"><h4>📆 요일별 시청 (' + WD[r.topWd] + '요일이 최고)</h4>' + bars(r.wd, WD, r.topWd, false, String) + '</div>';
      if (r.timed) {
        html += '<div class="nx-sec"><h4>⏰ 시간대별 시청 (' + r.topHour + '시대에 가장 많이)</h4>' +
          bars(r.hours, r.hours.map(function (v, i) { return i % 3 === 0 ? i : ''; }), r.topHour, true, null) +
          '<p class="nx-hint" style="margin-top:4px">새벽(0~5시)에 본 비율 ' + Math.round(r.nightShare * 100) + '%</p></div>';
        var dmax = r.devRank[0] ? r.devRank[0].sec : 1;
        html += '<div class="nx-sec"><h4>📺 어디서 봤을까</h4><div class="nx-rank">' + r.devRank.map(function (d) {
          return '<div class="nx-ri"><span class="n">' + ({ TV: '📺', '휴대폰': '📱', '태블릿': '📲', PC: '💻', '게임기': '🎮' }[d.name] || '🔌') + '</span><div class="t"><b>' + esc(d.name) + '</b><div class="bar"><i style="width:' + Math.max(4, d.sec / dmax * 100) + '%"></i></div></div><span class="c">' + Math.round(d.sec / r.sec * 100) + '%</span></div>';
        }).join('') + '</div></div>';
      }
      html += '<details class="nx-sec nx-list" data-r="list"><summary style="font-weight:800;font-size:16px;cursor:pointer;min-height:30px">📋 전체 목록 보기 (' + n(r.titles) + '개 작품)</summary><div style="margin-top:10px">' +
        '<input type="search" data-r="q" placeholder="작품 이름으로 찾기" autocomplete="off"><div class="nx-tbl" data-r="tbl"></div>' +
        '<div class="nx-row" style="margin-top:8px"><button type="button" class="nx-btn nx-ghost nx-sm" data-a="csv">📥 목록 엑셀(CSV)로 저장</button></div></div></details>';
      html += r.timed ? '<div class="nx-note">💡 예고편·미리보기와 1분 미만으로 본 기록은 뺐어요. 한 회차를 여러 번 나눠 보면 시간은 합치고 편 수는 1편으로 세요. 시간대는 이 기기의 시간대 기준이에요.</div>'
        : '<div class="nx-note">💡 「모두 다운로드」 파일에는 날짜만 있고 시청 시간은 없어서 편 수로 정리했어요. 실제 시청 시간이 궁금하면 「개인정보 다운로드」 ZIP을 넣어 보세요.</div>';
      html += '<div class="nx-act"><p class="nx-lab" style="margin:0">결산 이미지</p><div class="nx-chips">' +
        chip('size', 'feed', '피드 4:5') + chip('size', 'story', '스토리 9:16') + chip('theme', 'dark', '🌙 어둡게') + chip('theme', 'light', '☀️ 밝게') + '</div>' +
        '<div class="nx-row" style="margin-top:6px"><button type="button" class="nx-btn nx-main" data-a="img">🖼 결산 이미지 저장</button></div>' +
        '<div class="nx-row" style="margin-top:8px"><button type="button" class="nx-btn nx-ghost" data-a="copy">📋 결과 글로 복사</button>' +
        (navigator.share ? '<button type="button" class="nx-btn nx-ghost" data-a="share">📤 공유하기</button>' : '') + '</div>' +
        '<p class="nx-toast" data-r="toast"></p></div>';
      box.innerHTML = html; box.hidden = false;
      $('q').addEventListener('input', function () { S.q = this.value; drawList(); });
      drawList();
    }
    function stat(big, lab) { return '<div class="nx-stat"><b>' + big + '</b><small>' + lab + '</small></div>'; }
    function rec(label, big, sub) { return '<div class="nx-rec"><small>' + esc(label) + '</small><b>' + esc(big) + '</b><span>' + esc(sub) + '</span></div>'; }
    function chip(k, v, lab) { return '<button type="button" class="nx-chip' + (S.img[k] === v ? ' sel' : '') + '" data-i="' + k + ':' + v + '">' + lab + '</button>'; }
    function drawList() {
      var r = S.res, q = S.q.trim().toLowerCase();
      var all = r.showRank.concat(r.movieRank).filter(function (o) { return !q || o.name.toLowerCase().indexOf(q) >= 0; });
      var shown = all.slice(0, 300);
      $('tbl').innerHTML = all.length ? '<table><tr><th>작품</th><th>편</th>' + (r.timed ? '<th>시간</th>' : '') + '<th>마지막</th></tr>' +
        shown.map(function (o) {
          return '<tr><td>' + (o.series ? '' : '🎞 ') + esc(o.name) + '</td><td class="num">' + o.n + '</td>' + (r.timed ? '<td class="num">' + hm(o.sec) + '</td>' : '') +
            '<td class="num">' + (o.last.getMonth() + 1) + '/' + o.last.getDate() + '</td></tr>';
        }).join('') + '</table>' + (all.length > shown.length ? '<p class="nx-hint" style="margin:8px">앞에서 300개만 보여요. 찾기로 좁혀 보세요.</p>' : '')
        : '<p class="nx-hint" style="margin:10px">찾는 작품이 없어요.</p>';
    }
    function toast(t) { var e = $('toast'); if (e) { e.textContent = t; setTimeout(function () { if (e.textContent === t) e.textContent = ''; }, 3000); } }

    function imageBlob() {
      return new Promise(function (res, rej) {
        var cv = drawImage(S.res, { size: S.img.size, theme: S.img.theme, cmp: S.cmp });
        cv.toBlob(function (b) { cv.width = cv.height = 0; b ? res(b) : rej(new Error('IMG')); }, 'image/png');
      });
    }
    function baseName() { return '넷플릭스결산_' + (S.res.year === 'all' ? '전체' : S.res.year); }
    function download(blob, name) {
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }
    async function saveImage() {
      try {
        var b = await imageBlob(), name = baseName() + (S.img.size === 'story' ? '_스토리' : '') + '.png';
        var f = window.File ? new File([b], name, { type: 'image/png' }) : null;
        // 아이폰은 공유 창에서 「이미지 저장」을 눌러야 사진 앱에 들어감
        if (/iPhone|iPad|iPod/.test(navigator.userAgent) && f && navigator.canShare && navigator.canShare({ files: [f] })) {
          await navigator.share({ files: [f] }).catch(function () { }); return;
        }
        download(b, name); toast('이미지를 저장했어요.');
      } catch (e) { toast('이미지를 만들지 못했어요. 화면을 캡처해 주세요.'); }
    }
    function copyText() {
      var t = summaryText(S.res, S.cmp), done = function () { toast('복사했어요. 카톡·인스타에 붙여 넣으세요.'); };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(done, fallback); else fallback();
      function fallback() {
        var ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('복사가 안 돼요. 길게 눌러 직접 복사해 주세요.'); } ta.remove();
      }
    }
    async function share() {
      try {
        var b = await imageBlob(), f = new File([b], baseName() + '.png', { type: 'image/png' });
        await navigator.share(navigator.canShare && navigator.canShare({ files: [f] }) ? { files: [f], text: summaryText(S.res, S.cmp) } : { text: summaryText(S.res, S.cmp) });
      } catch (e) { }
    }

    async function handleFile(f) {
      if (!f) return;
      reset();
      if (f.size > MAX_FILE) { showErr(new Error('TOO_BIG')); return; }
      $('busy').hidden = false;
      try {
        var buf = await readBuf(f), head = new Uint8Array(buf.slice(0, 4));
        if (head[0] === 0x50 && head[1] === 0x4B) {
          var z = await readZip(buf);
          useText(f.name + ' → ' + z.name, z.text);
        } else if (!/\.(csv|txt)$/i.test(f.name) && f.type && !/csv|text|excel/.test(f.type)) {
          throw new Error('NOT_CSV');
        } else useText(f.name, decode(buf));
      } catch (e) { reset(); showErr(e); }
      $('busy').hidden = true;
    }

    $('pick').onclick = function () { input.value = ''; input.click(); };
    input.onchange = function () { var f = input.files && input.files[0]; input.value = ''; handleFile(f); };
    $('sample').onclick = function () { useText('예시_ViewingActivity.csv (가상의 작품)', sampleCSV()); };
    $('clear').onclick = reset;
    root.addEventListener('click', function (ev) {
      var t = ev.target.closest('button'); if (!t) return;
      if (t.hasAttribute('data-p')) selProfile(t.getAttribute('data-p'));
      else if (t.hasAttribute('data-y')) { var y = t.getAttribute('data-y'); selYear(y === 'all' ? 'all' : +y); }
      else if (t.hasAttribute('data-i')) {
        var kv = t.getAttribute('data-i').split(':'); S.img[kv[0]] = kv[1];
        root.querySelectorAll('[data-i^="' + kv[0] + ':"]').forEach(function (c) { c.classList.toggle('sel', c === t); });
      }
      var a = t.getAttribute('data-a');
      if (a === 'img') saveImage(); else if (a === 'copy') copyText(); else if (a === 'share') share();
      else if (a === 'csv') { download(new Blob([listCSV(S.res)], { type: 'text/csv;charset=utf-8' }), baseName() + '_목록.csv'); toast('목록을 저장했어요. 엑셀에서 열 수 있어요.'); }
    });
    var drop = $('drop');
    ['dragenter', 'dragover'].forEach(function (k) { drop.addEventListener(k, function (e) { e.preventDefault(); drop.classList.add('on'); }); });
    ['dragleave', 'drop'].forEach(function (k) { drop.addEventListener(k, function (e) { e.preventDefault(); drop.classList.remove('on'); }); });
    drop.addEventListener('drop', function (e) { handleFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]); });
  }

  function init() { var root = document.getElementById(ROOT_ID); if (root) mount(root); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
