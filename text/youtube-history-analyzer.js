/*!
 * ============================================================
 * 모듈명   : barodogu.youtubeHistoryAnalyzer
 * 관리 ID  : BD103
 * 파일     : text/youtube-history-analyzer.js
 * 저장소   : https://github.com/barodogu/tools
 * CDN      : https://cdn.jsdelivr.net/gh/barodogu/tools@main/text/youtube-history-analyzer.js
 * 사용 블로그: https://barodogu.blogspot.com/
 * 용도     : 유튜브 시청기록 분석기 (유튜브 연말결산)
 *            - 구글 테이크아웃 시청 기록(JSON·HTML·ZIP)을 읽어 연도별 결산으로 정리
 *            - 많이 본 채널·다시 본 영상 순위, 시간대·요일·월별 분포, 요일×시간 히트맵
 *            - 시청 유형, 최다 시청일, 연속 시청 기록, 올해 첫 영상, 새로 알게 된 채널 수
 *            - 광고 자동 제외, YouTube Music 포함/제외, 요약 이미지(PNG)·채널 통계(CSV) 저장
 *            ※ 시청 기록은 서버로 전송하지 않고 사용자 브라우저 안에서만 처리
 *            ※ ZIP 파일은 JSZip 3.10.1(MIT)을 ZIP을 열 때만 jsDelivr에서 불러옴
 * 사용법   : 글에 <div id="barodogu-youtube-history"></div> 를 넣고
 *            이 파일을 <script src="…" defer></script> 로 불러오면 화면을 그립니다.
 * 버전     : 1.0.0
 * 최종수정 : 2026-11-04
 * ============================================================
 */
(function (window, document) {
  'use strict';

  var barodogu = window.barodogu = window.barodogu || {};

  /* ---------- 기준값: 이 객체만 수정하면 됩니다 ---------- */
  var CONFIG = {
    VERSION: '1.0.0',
    UPDATED: '2026-11-04',
    ROOT_ID: 'barodogu-youtube-history',
    MAX_FILE_MB: 1024,           // 불러올 파일 최대 용량
    RANK_SHOW: 10,               // 채널 순위 처음 표시 개수
    RANK_MAX: 50,                // 채널 순위 최대 표시 개수
    REWATCH_SHOW: 10,            // 다시 본 영상 표시 개수
    JSZIP_URL: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
    ACCEPT: '.json,.html,.htm,.zip,application/json,text/html,application/zip'
  };

  var DOW = ['일', '월', '화', '수', '목', '금', '토'];
  var EN_MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dayKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  /* ====================== 파싱 (순수 함수) ====================== */

  // "Watched 제목" / "제목 을(를) 시청했습니다." 등 언어별 문구 제거
  var RE_TITLE_PRE = /^(Watched|Visto|Vu|Angesehen|Guardato|Assistiu a|Assistido|Просмотрено|視聴しました:?|观看了|觀看了)\s*:?\s*/i;
  var RE_TITLE_SUF = /\s*(을\(를\)|를|을)?\s*(시청했습니다|시청함|시청)\.?\s*$|\s*を視聴しました\s*$/;
  var RE_NOT_WATCH = /^(Searched for|Visited|Viewed|Liked|Subscribed|검색함|검색했습니다|방문함|방문했습니다|조회함|좋아요)/i;
  var RE_ADS = /google\s*ads|google\s*광고|광고에서|from ads/i;

  function cleanTitle(t) {
    t = String(t || '').replace(/[  ]/g, ' ').trim();
    t = t.replace(RE_TITLE_PRE, '').replace(RE_TITLE_SUF, '').trim();
    return t;
  }
  function videoId(url) {
    var m = /[?&]v=([\w-]{6,})/.exec(url || '') || /youtu\.be\/([\w-]{6,})/.exec(url || '') || /\/shorts\/([\w-]{6,})/.exec(url || '');
    return m ? m[1] : '';
  }
  function isRemovedTitle(title, url) {
    return !title || /^https?:\/\//.test(title) || (url && title === url) ||
      /a video that has been removed|삭제된 동영상|비공개 동영상|private video/i.test(title);
  }

  /** 테이크아웃 JSON 배열 → 기록 배열 */
  function parseJSON(text) {
    var arr;
    try { arr = JSON.parse(text); } catch (e) { return null; }
    if (!Array.isArray(arr)) return null;
    var out = [], ads = 0, i, e;
    for (i = 0; i < arr.length; i++) {
      e = arr[i];
      if (!e || !e.time) continue;
      var rawTitle = e.title || '';
      if (RE_NOT_WATCH.test(rawTitle)) continue;
      var url = e.titleUrl || '';
      if (url && !/youtube\.com|youtu\.be/.test(url)) continue;
      var det = (e.details || []).map(function (d) { return d && d.name || ''; }).join(' ');
      if (RE_ADS.test(det)) { ads++; continue; }
      var t = new Date(e.time);
      if (isNaN(+t)) continue;
      var sub = e.subtitles && e.subtitles[0] || {};
      var title = cleanTitle(rawTitle);
      out.push({
        t: t,
        title: title,
        id: videoId(url),
        ch: sub.name || '',
        music: /music/i.test(e.header || '') || /music\.youtube/.test(url),
        removed: isRemovedTitle(title, url) || !sub.name
      });
    }
    return { items: out, ads: ads, format: 'json' };
  }

  function decodeEntities(s) {
    return String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|#39);/gi, function (m, k) {
      k = k.toLowerCase();
      if (k[0] === '#') return String.fromCharCode(k[1] === 'x' ? parseInt(k.slice(2), 16) : +k.slice(1));
      return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[k];
    });
  }
  function stripTags(s) { return decodeEntities(String(s).replace(/<[^>]*>/g, '')).replace(/[  ]/g, ' ').trim(); }

  function to24(h, ampm) {
    h = +h;
    if (!ampm) return h;
    var pm = ampm === '오후' || /^p\.?m\.?$/i.test(ampm);
    if (pm && h < 12) return h + 12;
    if (!pm && h === 12) return 0;
    return h;
  }

  /** HTML 기록의 날짜 줄 → Date (표시된 시각을 그대로 현지 시각으로 사용) */
  function parseDateText(s) {
    s = String(s || '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
    var m;
    // 2024. 3. 3. 오후 10:15:22 KST / 2024. 3. 3. 오후 10시 15분 22초
    if ((m = /(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?\s*(오전|오후)?\s*(\d{1,2})(?::|시\s*)(\d{1,2})(?::|분\s*)?(\d{1,2})?/.exec(s))) {
      return new Date(+m[1], m[2] - 1, +m[3], to24(m[5], m[4]), +m[6], +(m[7] || 0));
    }
    // 2024년 3월 3일 오후 10:15:22
    if ((m = /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(오전|오후)?\s*(\d{1,2})(?::|시\s*)(\d{1,2})(?::|분\s*)?(\d{1,2})?/.exec(s))) {
      return new Date(+m[1], m[2] - 1, +m[3], to24(m[5], m[4]), +m[6], +(m[7] || 0));
    }
    // Mar 3, 2024, 10:15:22 PM KST
    if ((m = /([A-Za-z]{3,9})\.?\s+(\d{1,2}),\s*(\d{4}),?\s+(?:at\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp]\.?[Mm]\.?)?/.exec(s)) && EN_MON[m[1].slice(0, 3).toLowerCase()]) {
      return new Date(+m[3], EN_MON[m[1].slice(0, 3).toLowerCase()] - 1, +m[2], to24(m[4], m[7]), +m[5], +(m[6] || 0));
    }
    // 3 Mar 2024, 22:15:22 GMT
    if ((m = /(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp]\.?[Mm]\.?)?/.exec(s)) && EN_MON[m[2].slice(0, 3).toLowerCase()]) {
      return new Date(+m[3], EN_MON[m[2].slice(0, 3).toLowerCase()] - 1, +m[1], to24(m[4], m[7]), +m[5], +(m[6] || 0));
    }
    // 2024-03-03 22:15:22 / 2024/03/03 22:15
    if ((m = /(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s))) {
      return new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    }
    return null;
  }

  /** 테이크아웃 HTML(시청 기록.html / watch-history.html) → 기록 배열 */
  function parseHTML(text) {
    var blocks = text.split(/<div class="outer-cell/), out = [], ads = 0, i;
    var RE_CELL = /<div class="content-cell[^"]*mdl-typography--body-1"[^>]*>([\s\S]*?)<\/div>/;
    var RE_HEAD = /<div class="header-cell[^"]*"[^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>/;
    for (i = 1; i < blocks.length; i++) {
      var b = blocks[i], cm = RE_CELL.exec(b);
      if (!cm) continue;
      var cell = cm[1];
      var hm = RE_HEAD.exec(b), header = hm ? stripTags(hm[1]) : '';
      var rest = b.slice(cm.index + cm[0].length);
      if (RE_ADS.test(stripTags(rest))) { ads++; continue; }
      var links = [], am, RE_A = /<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
      while ((am = RE_A.exec(cell))) links.push({ url: decodeEntities(am[1]), text: stripTags(am[2]) });
      var lines = cell.split(/<br\s*\/?>/i).map(stripTags).filter(Boolean);
      if (!lines.length) continue;
      var first = lines[0];
      if (RE_NOT_WATCH.test(first)) continue;
      var t = null;
      for (var k = lines.length - 1; k >= 0 && !t; k--) t = parseDateText(lines[k]);
      if (!t || isNaN(+t)) continue;
      var vid = links[0] && /youtube\.com\/watch|youtu\.be|\/shorts\//.test(links[0].url) ? links[0] : null;
      if (!vid && links.length) continue; // 시청이 아닌 다른 활동
      var chLink = links.filter(function (l) { return /youtube\.com\/(channel|@|c\/|user)/.test(l.url); })[0];
      var title = vid ? cleanTitle(vid.text) : '';
      out.push({
        t: t,
        title: title,
        id: vid ? videoId(vid.url) : '',
        ch: chLink ? chLink.text : '',
        music: /music/i.test(header) || (vid && /music\.youtube/.test(vid.url)),
        removed: !vid || isRemovedTitle(title, vid.url) || !chLink
      });
    }
    return { items: out, ads: ads, format: 'html' };
  }

  /** 텍스트 → { items, ads, format } (JSON·HTML 자동 판별) */
  function parse(text) {
    text = String(text || '').replace(/^﻿/, '');
    var head = text.slice(0, 200).trim();
    var res = null;
    if (head[0] === '[' || head[0] === '{') res = parseJSON(text);
    if (!res && /<html|<div|<!doctype/i.test(head + text.slice(0, 3000))) res = parseHTML(text);
    if (!res) res = { items: [], ads: 0, format: null };
    res.items.sort(function (a, b) { return a.t - b.t; });
    return res;
  }

  /** 연도 목록(기록이 있는 연도, 내림차순) */
  function years(items) {
    var y = {};
    items.forEach(function (it) { y[it.t.getFullYear()] = (y[it.t.getFullYear()] || 0) + 1; });
    return Object.keys(y).map(Number).sort(function (a, b) { return b - a; });
  }

  /**
   * 통계 계산
   * opt: { year: 2026 | 'all', music: true|false }
   */
  function analyze(items, opt) {
    opt = opt || {};
    var year = opt.year === undefined ? 'all' : opt.year, useMusic = opt.music !== false;
    var hours = [], dows = [0, 0, 0, 0, 0, 0, 0], heat = [], months = {}, days = {}, chs = {}, vids = {};
    var i, d;
    for (i = 0; i < 24; i++) hours.push(0);
    for (d = 0; d < 7; d++) { heat.push([]); for (i = 0; i < 24; i++) heat[d].push(0); }

    // 이 연도 이전에 본 적 있는 채널(새로 알게 된 채널 계산용)
    var before = {};
    var list = [], removed = 0, music = 0;
    items.forEach(function (it) {
      if (!useMusic && it.music) return;
      var y = it.t.getFullYear();
      if (year !== 'all' && y < year) { if (it.ch) before[it.ch] = 1; return; }
      if (year !== 'all' && y !== year) return;
      list.push(it);
    });

    list.forEach(function (it) {
      var t = it.t, h = t.getHours(), w = t.getDay();
      hours[h]++; dows[w]++; heat[w][h]++;
      var mk = t.getFullYear() + '-' + pad(t.getMonth() + 1);
      months[mk] = (months[mk] || 0) + 1;
      var dk = dayKey(t);
      days[dk] = (days[dk] || 0) + 1;
      if (it.music) music++;
      if (it.removed) { removed++; return; }
      if (it.ch) {
        var c = chs[it.ch] || (chs[it.ch] = { name: it.ch, count: 0, first: t, last: t, vids: {} });
        c.count++; c.last = t; c.vids[it.id || it.title] = 1;
      }
      var key = it.id || it.title;
      if (key) {
        var v = vids[key] || (vids[key] = { title: it.title, ch: it.ch, count: 0, last: t });
        v.count++; v.last = t;
      }
    });

    var total = list.length;
    var first = total ? list[0].t : null, last = total ? list[total - 1].t : null;
    var channels = Object.keys(chs).map(function (k) {
      var c = chs[k]; c.unique = Object.keys(c.vids).length; delete c.vids; return c;
    }).sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name); });
    var rewatch = Object.keys(vids).map(function (k) { return vids[k]; })
      .filter(function (v) { return v.count > 1; })
      .sort(function (a, b) { return b.count - a.count || b.last - a.last; });

    // 기간 일수: 연도 지정 시 1/1 ~ (올해면 마지막 기록일, 아니면 12/31)
    var dayCount = 0;
    if (total) {
      var s0, e0;
      if (year === 'all') { s0 = new Date(first.getFullYear(), first.getMonth(), first.getDate()); e0 = new Date(last.getFullYear(), last.getMonth(), last.getDate()); }
      else {
        s0 = new Date(year, 0, 1);
        var now = new Date();
        e0 = year === now.getFullYear() ? new Date(last.getFullYear(), last.getMonth(), last.getDate()) : new Date(year, 11, 31);
      }
      dayCount = Math.round((e0 - s0) / 86400000) + 1;
    }

    // 연속 시청 기록(날짜 기준)
    var dk = Object.keys(days).sort(), best = 0, bestEnd = null, run = 0, prev = null;
    dk.forEach(function (k) {
      var cur = new Date(k + 'T00:00:00');
      run = prev && Math.round((cur - prev) / 86400000) === 1 ? run + 1 : 1;
      if (run > best) { best = run; bestEnd = k; }
      prev = cur;
    });
    var topDays = dk.map(function (k) { return [k, days[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 3);

    var newCh = 0;
    if (year !== 'all') channels.forEach(function (c) { if (!before[c.name]) newCh++; });

    var night = 0; for (i = 0; i <= 4; i++) night += hours[i];
    var weekend = dows[0] + dows[6];

    var firstVideo = null;
    for (i = 0; i < list.length; i++) if (!list[i].removed) { firstVideo = list[i]; break; }

    return {
      year: year, total: total, removed: removed, music: music,
      first: first, last: last, dayCount: dayCount, activeDays: dk.length,
      hours: hours, dows: dows, heat: heat,
      months: Object.keys(months).sort().map(function (k) { return [k, months[k]]; }),
      channels: channels, rewatch: rewatch, uniqueVideos: Object.keys(vids).length,
      topDays: topDays, streak: best, streakEnd: bestEnd,
      newChannels: newCh, hasBefore: Object.keys(before).length > 0,
      nightRatio: total ? night / total : 0, weekendRatio: total ? weekend / total : 0,
      firstVideo: firstVideo,
      type: viewerType(hours, dows, total, channels)
    };
  }

  /** 시청 유형(재미 요소) */
  function viewerType(hours, dows, total, channels) {
    if (!total) return null;
    var sum = function (a, b) { var s = 0; for (var i = a; i <= b; i++) s += hours[i]; return s / total; };
    var dawn = sum(0, 4), morning = sum(5, 10), day = sum(11, 17), evening = sum(18, 23);
    var topShare = channels.length ? channels[0].count / total : 0;
    var weekend = (dows[0] + dows[6]) / total;
    var t;
    if (dawn >= 0.2) t = { emoji: '🦉', name: '새벽 올빼미형', desc: '모두가 잠든 새벽에 유튜브를 가장 많이 봤어요.' };
    else if (morning >= 0.3) t = { emoji: '🌅', name: '아침 루틴형', desc: '하루를 유튜브와 함께 시작하는 편이에요.' };
    else if (day >= 0.45) t = { emoji: '☀️', name: '낮 시간 틈새형', desc: '점심·쉬는 시간마다 틈틈이 챙겨 봤어요.' };
    else if (evening >= 0.5) t = { emoji: '🌙', name: '퇴근 후 몰아보기형', desc: '저녁 시간에 하루 시청의 절반 이상이 몰려 있어요.' };
    else t = { emoji: '🎯', name: '하루 종일 골고루형', desc: '특정 시간 없이 하루 종일 고르게 봤어요.' };
    t.extra = [];
    if (topShare >= 0.15) t.extra.push('최애 채널 몰입형');
    if (weekend >= 0.4) t.extra.push('주말 몰아보기');
    return t;
  }

  /* ====================== 화면 ====================== */
  var CSS = [
    '#R{box-sizing:border-box;max-width:900px;margin:24px auto;color:#1f2430;font:16px/1.65 system-ui,-apple-system,"Malgun Gothic",sans-serif;overflow-wrap:anywhere;}',
    '#R *{box-sizing:border-box;}',
    '#R .bdyt-card{border:1px solid #e6e1e1;border-radius:18px;background:#fff;padding:clamp(14px,3vw,28px);}',
    '#R .bdyt-kicker{margin:0;color:#c4302b;font-size:13px;font-weight:800;letter-spacing:.08em;}',
    '#R .bdyt-title{margin:6px 0 10px;color:#1f2430;font-size:clamp(23px,4vw,32px);line-height:1.3;border:0;padding:0;}',
    '#R .bdyt-lead{margin:0 0 18px;}',
    '#R .bdyt-drop{border:2px dashed #e5a6a3;border-radius:14px;background:#fdf5f4;padding:22px 14px;text-align:center;transition:background .15s;}',
    '#R .bdyt-drop.is-over{background:#fbe2e0;}',
    '#R .bdyt-drop strong{display:block;font-size:18px;}',
    '#R .bdyt-filebtn{display:inline-flex;align-items:center;justify-content:center;margin-top:12px;min-height:44px;padding:9px 18px;border-radius:10px;background:#c4302b;color:#fff;font-weight:700;cursor:pointer;}',
    '#R .bdyt-filebtn:focus-within{outline:3px solid #f2b705;outline-offset:2px;}',
    '#R .bdyt-file{position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;}',
    '#R .bdyt-small{font-size:13px;color:#5f6673;margin:8px 0 0;}',
    '#R .bdyt-link{background:none;border:0;padding:0;color:#c4302b;text-decoration:underline;font:inherit;cursor:pointer;}',
    '#R .bdyt-btn{font:inherit;min-height:44px;border:1px solid #d6cfcf;border-radius:10px;padding:8px 14px;background:#fff;color:#1f2430;cursor:pointer;}',
    '#R .bdyt-btn:hover{background:#faf5f5;}',
    '#R .bdyt-btn:focus-visible,#R .bdyt-link:focus-visible{outline:3px solid #f2b705;outline-offset:2px;}',
    '#R .bdyt-btn.is-primary{background:#c4302b;border-color:#c4302b;color:#fff;font-weight:700;}',
    '#R .bdyt-help{margin:12px 0 0;border:1px solid #eee5e5;border-radius:12px;background:#fcfafa;padding:2px 14px;font-size:14px;}',
    '#R .bdyt-help summary{cursor:pointer;font-weight:700;padding:10px 0;}',
    '#R .bdyt-help ol{margin:0 0 12px;padding-left:20px;}',
    '#R .bdyt-help li{margin:3px 0;}',
    '#R .bdyt-work{display:none;margin-top:18px;}',
    '#R .bdyt-bar{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;margin-bottom:6px;font-size:14px;}',
    '#R .bdyt-bar select{font:inherit;min-height:40px;border:1px solid #d6cfcf;border-radius:9px;padding:6px 10px;background:#fff;color:#1f2430;}',
    '#R .bdyt-bar label{display:inline-flex;gap:6px;align-items:center;}',
    '#R .bdyt-hero{margin:14px 0 4px;border-radius:16px;background:linear-gradient(135deg,#c4302b,#8e1f1b);color:#fff;padding:18px 20px;}',
    '#R .bdyt-hero p{margin:0;font-size:14px;opacity:.9;}',
    '#R .bdyt-hero b{display:block;font-size:clamp(26px,5vw,36px);line-height:1.25;margin:4px 0;}',
    '#R .bdyt-hero .bdyt-type{margin-top:10px;font-size:16px;opacity:1;}',
    '#R .bdyt-tag{display:inline-block;margin:6px 6px 0 0;padding:2px 10px;border-radius:999px;background:rgba(255,255,255,.18);font-size:13px;}',
    '#R .bdyt-sum{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin:14px 0 4px;}',
    '#R .bdyt-stat{border:1px solid #eee5e5;border-radius:12px;background:#fcfafa;padding:10px 12px;}',
    '#R .bdyt-stat b{display:block;font-size:22px;line-height:1.3;color:#1f2430;}',
    '#R .bdyt-stat span{font-size:13px;color:#5f6673;}',
    '#R .bdyt-sec{margin-top:24px;}',
    '#R .bdyt-h3{margin:0 0 4px;font-size:18px;color:#1f2430;border:0;padding:0;}',
    '#R .bdyt-note{margin:0 0 10px;font-size:13px;color:#5f6673;}',
    '#R .bdyt-rank{list-style:none;margin:0;padding:0;}',
    '#R .bdyt-rank li{margin:0 0 10px;padding:0;}',
    '#R .bdyt-rhead{display:flex;justify-content:space-between;gap:8px;font-size:15px;}',
    '#R .bdyt-rhead b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '#R .bdyt-rhead span{flex:0 0 auto;color:#5f6673;font-size:14px;}',
    '#R .bdyt-track{height:12px;border-radius:6px;background:#f5eded;overflow:hidden;margin:3px 0;}',
    '#R .bdyt-fill{height:100%;background:#c4302b;border-radius:6px;}',
    '#R .bdyt-rank li:first-child .bdyt-fill{background:#f2a705;}',
    '#R .bdyt-rsub{font-size:12.5px;color:#5f6673;}',
    '#R .bdyt-cols{display:flex;align-items:flex-end;gap:2px;height:140px;padding:0 2px;border-bottom:1px solid #d6cfcf;}',
    '#R .bdyt-col{flex:1;min-width:0;background:#eba5a2;border-radius:3px 3px 0 0;}',
    '#R .bdyt-col.is-max{background:#c4302b;}',
    '#R .bdyt-axis{display:flex;gap:2px;padding:0 2px;font-size:11px;color:#5f6673;}',
    '#R .bdyt-axis span{flex:1;min-width:0;text-align:center;}',
    '#R .bdyt-heat{display:grid;grid-template-columns:20px repeat(24,minmax(0,1fr));gap:2px;font-size:11px;color:#5f6673;}',
    '@media (max-width:480px){#R .bdyt-heat{gap:1px;font-size:10px;}}',
    '#R .bdyt-heat i{display:block;aspect-ratio:1/1;border-radius:3px;background:#c4302b;}',
    '#R .bdyt-heat em{font-style:normal;text-align:center;white-space:nowrap;overflow:visible;}',
    '#R .bdyt-tbl{width:100%;border-collapse:collapse;font-size:14px;}',
    '#R .bdyt-tbl th,#R .bdyt-tbl td{border:1px solid #eee5e5;padding:7px 8px;text-align:left;vertical-align:top;}',
    '#R .bdyt-tbl th{background:#faf3f3;width:38%;}',
    '#R .bdyt-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px;}',
    '#R .bdyt-msg{min-height:1.6em;margin:14px 0 0;padding:10px 12px;border-radius:10px;background:#f6f4f4;font-size:14px;}',
    '#R .bdyt-msg:empty{display:none;}',
    '#R .bdyt-msg.is-error{background:#fff3df;}',
    '#R .bdyt-msg.is-ok{background:#edf8f1;}',
    '#R .bdyt-foot{margin:16px 0 0;font-size:12px;color:#7a808b;}'
  ].join('\n');

  function h(tag, attrs, html) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) el.setAttribute(k, attrs[k]);
    if (html !== undefined) el.innerHTML = html;
    return el;
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n) { return Number(n).toLocaleString('ko-KR'); }
  function fmtDate(d) { return d ? d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()) : '-'; }
  function fmtKey(k) { var p = k.split('-'); return +p[1] + '월 ' + (+p[2]) + '일'; }
  function pct(a, b) { return b ? Math.round(a / b * 1000) / 10 : 0; }
  function cut(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  function loadJSZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (loadJSZip.p) return loadJSZip.p;
    loadJSZip.p = new Promise(function (resolve, reject) {
      var sc = document.createElement('script');
      sc.src = CONFIG.JSZIP_URL; sc.async = true;
      sc.onload = function () { window.JSZip ? resolve(window.JSZip) : reject(new Error('ZIP 처리 모듈을 불러오지 못했습니다.')); };
      sc.onerror = function () { loadJSZip.p = null; reject(new Error('ZIP 처리 모듈을 불러오지 못했습니다. 인터넷 연결이나 스크립트 차단 설정을 확인해 주세요.')); };
      document.head.appendChild(sc);
    });
    return loadJSZip.p;
  }

  /** 파일 → 파싱 결과 (ZIP이면 안에서 시청 기록 파일을 찾아 읽음) */
  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(new Error('파일을 읽지 못했습니다.')); };
      fr.readAsArrayBuffer(file);
    }).then(function (buf) {
      var u8 = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
      if (!(u8[0] === 0x50 && u8[1] === 0x4B)) return parse(new TextDecoder('utf-8').decode(buf));
      return loadJSZip().then(function (JSZip) { return JSZip.loadAsync(buf); }).then(function (zip) {
        var cands = [];
        zip.forEach(function (path, entry) {
          if (entry.dir || /__MACOSX/.test(path) || !/\.(json|html?)$/i.test(path)) return;
          if (/search|검색|comment|댓글|subscri|구독|playlist|재생목록|archive_browser/i.test(path)) return;
          var score = /watch-history|시청\s*기록|watch_history/i.test(path) ? 2 : (/youtube/i.test(path) ? 1 : 0);
          if (score) cands.push({ entry: entry, score: score, json: /\.json$/i.test(path) });
        });
        if (!cands.length) throw new Error('ZIP 안에서 유튜브 시청 기록 파일을 찾지 못했습니다. 테이크아웃에서 \'YouTube 및 YouTube Music\'의 \'기록\'을 선택했는지 확인해 주세요.');
        cands.sort(function (a, b) { return b.score - a.score || (b.json - a.json); });
        var top = cands.filter(function (c) { return c.score === cands[0].score; });
        // 점수가 같은 후보를 차례로 읽어 기록이 가장 많은 것을 사용
        var best = null, idx = 0;
        function next() {
          if (idx >= top.length || idx >= 6) return best || parse('');
          var c = top[idx++];
          return c.entry.async('string').then(function (txt) {
            var r = parse(txt);
            if (!best || r.items.length > best.items.length) best = r;
            return next();
          });
        }
        return next();
      });
    });
  }

  function init() {
    var root = document.getElementById(CONFIG.ROOT_ID);
    if (!root || root.barodoguApi) return root && root.barodoguApi;
    var style = document.createElement('style');
    style.textContent = CSS.replace(/#R/g, '#' + CONFIG.ROOT_ID);
    document.head.appendChild(style);

    root.innerHTML = '';
    var card = h('div', { 'class': 'bdyt-card' });
    card.innerHTML =
      '<p class="bdyt-kicker">바로도구 · 유튜브 연말결산</p>' +
      '<h2 class="bdyt-title">유튜브 시청기록 분석기</h2>' +
      '<p class="bdyt-lead">구글 테이크아웃에서 받은 유튜브 시청 기록을 올리면 올해 가장 많이 본 채널, 다시 본 영상, 주로 보는 시간대를 한눈에 정리해 드립니다. <b>시청 기록은 서버로 전송되지 않고 이 기기 브라우저 안에서만 분석합니다.</b></p>' +
      '<div class="bdyt-drop" data-el="drop"><strong>시청 기록 파일을 여기에 끌어다 놓으세요</strong>' +
      '<span>테이크아웃 ZIP 파일 그대로, 또는 안의 시청 기록 파일(JSON·HTML)</span><br>' +
      '<label class="bdyt-filebtn">파일 선택<input class="bdyt-file" type="file" data-el="file" accept="' + CONFIG.ACCEPT + '"></label>' +
      '<p class="bdyt-small">파일이 아직 없나요? <button type="button" class="bdyt-link" data-el="sample">예시 데이터로 체험하기</button></p></div>' +
      '<details class="bdyt-help"><summary>📥 시청 기록 파일 받는 방법 (구글 테이크아웃)</summary><ol>' +
      '<li><b>takeout.google.com</b>에 접속해 유튜브를 쓰는 구글 계정으로 로그인합니다.</li>' +
      '<li>목록 위의 <b>모두 선택 해제</b>를 누르고, 아래쪽 <b>YouTube 및 YouTube Music</b>만 체크합니다.</li>' +
      '<li><b>모든 YouTube 데이터 포함됨</b> 버튼 → <b>모두 선택 해제</b> → <b>기록</b>만 체크하고 확인을 누릅니다.</li>' +
      '<li>(선택) <b>여러 형식</b> 버튼에서 기록 형식을 <b>JSON</b>으로 바꾸면 더 정확합니다. HTML 그대로도 됩니다.</li>' +
      '<li><b>다음 단계</b> → <b>내보내기 생성</b>을 누르면, 몇 분 뒤 메일로 ZIP 다운로드 링크가 옵니다.</li>' +
      '<li>받은 ZIP 파일을 압축 풀지 말고 그대로 위에 올리면 됩니다.</li></ol></details>' +
      '<div class="bdyt-msg" data-el="msg" role="status" aria-live="polite"></div>' +
      '<div class="bdyt-work" data-el="work">' +
      '<div class="bdyt-bar"><label>기간 <select data-el="year"></select></label>' +
      '<label><input type="checkbox" data-el="music" checked> YouTube Music 포함</label></div>' +
      '<div data-el="out"></div>' +
      '<div class="bdyt-actions"><button type="button" class="bdyt-btn is-primary" data-el="png">결산 이미지 저장</button>' +
      '<button type="button" class="bdyt-btn" data-el="csv">채널 통계 CSV 저장</button>' +
      '<button type="button" class="bdyt-btn" data-el="reset">다른 파일 분석</button></div></div>' +
      '<p class="bdyt-foot">바로도구 유튜브 시청기록 분석기 v' + CONFIG.VERSION + ' · 분석 결과는 새로고침하면 사라집니다. YouTube는 Google LLC의 상표이며 이 도구는 Google과 관련이 없습니다.</p>';
    root.appendChild(card);

    var el = {};
    Array.prototype.forEach.call(card.querySelectorAll('[data-el]'), function (n) { el[n.getAttribute('data-el')] = n; });

    var parsed = null, stats = null, fileLabel = '';

    function msg(t, type) { el.msg.textContent = t || ''; el.msg.className = 'bdyt-msg' + (type ? ' is-' + type : ''); }

    function colChart(values, labels, labelEvery, unit) {
      var max = Math.max.apply(null, values) || 1, html = '<div class="bdyt-cols" role="img" aria-label="' + esc(labels.map(function (l, i) { return l + ' ' + values[i] + unit; }).join(', ')) + '">';
      values.forEach(function (v, i) {
        html += '<div class="bdyt-col' + (v === max && v > 0 ? ' is-max' : '') + '" style="height:' + (v / max * 100).toFixed(1) + '%" title="' + esc(labels[i] + ': ' + num(v) + unit) + '"></div>';
      });
      html += '</div><div class="bdyt-axis">';
      labels.forEach(function (l, i) { html += '<span>' + (i % (labelEvery || 1) === 0 ? esc(l) : '') + '</span>'; });
      return html + '</div>';
    }
    function stat(v, l) { return '<div class="bdyt-stat"><b>' + v + '</b><span>' + l + '</span></div>'; }
    function row(l, v) { return '<tr><th scope="row">' + l + '</th><td>' + v + '</td></tr>'; }

    function render() {
      var yv = el.year.value;
      stats = analyze(parsed.items, { year: yv === 'all' ? 'all' : +yv, music: el.music.checked });
      var s = stats, out = '';
      if (!s.total) { el.out.innerHTML = '<p class="bdyt-note">선택한 기간에 시청 기록이 없습니다.</p>'; return; }
      var label = s.year === 'all' ? '전체 기간' : s.year + '년';
      var peakH = s.hours.indexOf(Math.max.apply(null, s.hours)), peakD = s.dows.indexOf(Math.max.apply(null, s.dows));
      var top = s.channels[0];

      out += '<div class="bdyt-hero"><p>' + esc(label) + ' 나의 유튜브</p><b>' + num(s.total) + '편 시청</b>' +
        '<p>' + fmtDate(s.first) + ' ~ ' + fmtDate(s.last) + (top ? ' · 최애 채널 「' + esc(cut(top.name, 24)) + '」' : '') + '</p>' +
        (s.type ? '<p class="bdyt-type">' + s.type.emoji + ' <b style="display:inline;font-size:inherit">' + esc(s.type.name) + '</b> — ' + esc(s.type.desc) + '</p>' +
          s.type.extra.map(function (x) { return '<span class="bdyt-tag">#' + esc(x) + '</span>'; }).join('') : '') + '</div>';

      out += '<div class="bdyt-sum">' +
        stat(num(Math.round(s.total / Math.max(1, s.dayCount) * 10) / 10) + '편', '하루 평균 시청') +
        stat(num(s.channels.length) + '개', '본 채널 수') +
        stat(num(s.activeDays) + '일', '시청한 날 / ' + num(s.dayCount) + '일') +
        stat(peakH + '시', '가장 많이 본 시간') +
        stat(DOW[peakD] + '요일', '가장 많이 본 요일') +
        stat(num(s.streak) + '일', '최장 연속 시청') +
        (s.year !== 'all' && s.hasBefore ? stat(num(s.newChannels) + '개', '올해 새로 본 채널') : '') +
        stat(pct(Math.round(s.nightRatio * s.total), s.total) + '%', '새벽(0~4시) 시청 비율') + '</div>';
      var notes = [esc(fileLabel)];
      if (parsed.ads) notes.push('광고 ' + num(parsed.ads) + '건 제외');
      if (s.removed) notes.push('삭제·비공개 영상 ' + num(s.removed) + '건 포함');
      out += '<p class="bdyt-note">' + notes.join(' · ') + '</p>';

      // 채널 순위
      if (s.channels.length) {
        var show = Math.min(s.channels.length, CONFIG.RANK_MAX);
        out += '<section class="bdyt-sec"><h3 class="bdyt-h3">🏆 가장 많이 본 채널</h3><p class="bdyt-note">시청 횟수 기준. 같은 영상을 다시 본 것도 따로 셉니다.</p><ol class="bdyt-rank">';
        for (var i = 0; i < show; i++) {
          var c = s.channels[i];
          out += '<li' + (i >= CONFIG.RANK_SHOW ? ' hidden' : '') + '><div class="bdyt-rhead"><b>' + (i + 1) + '. ' + esc(c.name) + '</b><span>' + num(c.count) + '회 · ' + pct(c.count, s.total) + '%</span></div>' +
            '<div class="bdyt-track"><div class="bdyt-fill" style="width:' + (c.count / top.count * 100).toFixed(1) + '%"></div></div>' +
            '<div class="bdyt-rsub">영상 ' + num(c.unique) + '편 · 처음 ' + fmtDate(c.first) + ' · 마지막 ' + fmtDate(c.last) + '</div></li>';
        }
        out += '</ol>' + (show > CONFIG.RANK_SHOW ? '<button type="button" class="bdyt-btn" data-act="more">TOP ' + show + ' 모두 보기</button>' : '') + '</section>';
      }

      // 다시 본 영상
      if (s.rewatch.length) {
        out += '<section class="bdyt-sec"><h3 class="bdyt-h3">🔁 여러 번 다시 본 영상</h3><p class="bdyt-note">같은 영상을 2번 이상 본 기록입니다. 음악·자장가처럼 반복 재생한 영상이 많이 올라옵니다.</p><ol class="bdyt-rank">';
        var rmax = s.rewatch[0].count;
        s.rewatch.slice(0, CONFIG.REWATCH_SHOW).forEach(function (v, i) {
          out += '<li><div class="bdyt-rhead"><b>' + (i + 1) + '. ' + esc(v.title) + '</b><span>' + num(v.count) + '회</span></div>' +
            '<div class="bdyt-track"><div class="bdyt-fill" style="width:' + (v.count / rmax * 100).toFixed(1) + '%"></div></div>' +
            (v.ch ? '<div class="bdyt-rsub">' + esc(v.ch) + '</div>' : '') + '</li>';
        });
        out += '</ol></section>';
      }

      // 시간대·요일
      var hl = []; for (i = 0; i < 24; i++) hl.push(String(i));
      out += '<section class="bdyt-sec"><h3 class="bdyt-h3">⏰ 시간대별 시청</h3><p class="bdyt-note">' + peakH + '시에 가장 많이 봤습니다.</p>' + colChart(s.hours, hl, 3, '편') + '</section>';
      out += '<section class="bdyt-sec"><h3 class="bdyt-h3">📅 요일별 시청</h3><p class="bdyt-note">주말(토·일) 시청 비율 ' + pct(Math.round(s.weekendRatio * s.total), s.total) + '%</p>' + colChart(s.dows, DOW, 1, '편') + '</section>';

      // 히트맵
      var hmax = 0; s.heat.forEach(function (r) { r.forEach(function (v) { if (v > hmax) hmax = v; }); });
      out += '<section class="bdyt-sec"><h3 class="bdyt-h3">🔥 요일 × 시간 히트맵</h3><p class="bdyt-note">진할수록 많이 본 시간입니다.</p><div class="bdyt-heat"><em></em>';
      for (i = 0; i < 24; i++) out += '<em>' + (i % 6 === 0 ? i : '') + '</em>';
      for (var d = 0; d < 7; d++) {
        out += '<em>' + DOW[d] + '</em>';
        for (i = 0; i < 24; i++) {
          var hv = s.heat[d][i];
          out += '<i style="opacity:' + (hv ? (0.12 + 0.88 * hv / hmax).toFixed(2) : 0.05) + '" title="' + DOW[d] + '요일 ' + i + '시: ' + num(hv) + '편"></i>';
        }
      }
      out += '</div></section>';

      // 월별
      if (s.months.length > 1) {
        var mv = s.months.map(function (x) { return x[1]; });
        var ml = s.months.map(function (x) { return s.year === 'all' ? x[0].slice(2).replace('-', '.') : (+x[0].slice(5)) + '월'; });
        out += '<section class="bdyt-sec"><h3 class="bdyt-h3">📈 월별 시청</h3>' + colChart(mv, ml, Math.ceil(ml.length / 12), '편') + '</section>';
      }

      // 기록들
      out += '<section class="bdyt-sec"><h3 class="bdyt-h3">📌 ' + esc(label) + ' 기록</h3><table class="bdyt-tbl"><tbody>';
      if (s.firstVideo) out += row(s.year === 'all' ? '처음 본 영상' : '올해 첫 영상', esc(s.firstVideo.title) + '<br><small>' + esc(s.firstVideo.ch) + ' · ' + fmtDate(s.firstVideo.t) + ' ' + pad(s.firstVideo.t.getHours()) + ':' + pad(s.firstVideo.t.getMinutes()) + '</small>');
      if (s.topDays.length) out += row('가장 많이 본 날', s.topDays.map(function (x) { return (s.year === 'all' ? x[0].replace(/-/g, '.') : fmtKey(x[0])) + ' (' + num(x[1]) + '편)'; }).join('<br>'));
      if (s.streak > 1) {
        var se = new Date(s.streakEnd + 'T00:00:00'), ss = new Date(se); ss.setDate(ss.getDate() - s.streak + 1);
        out += row('최장 연속 시청', num(s.streak) + '일 (' + fmtDate(ss) + ' ~ ' + fmtDate(se) + ')');
      }
      out += row('본 영상 수(중복 제외)', num(s.uniqueVideos) + '편');
      if (s.music) out += row('YouTube Music', num(s.music) + '곡·편');
      out += '</tbody></table></section>';

      el.out.innerHTML = out;
    }

    function fillYears() {
      var ys = years(parsed.items), cur = new Date().getFullYear();
      el.year.innerHTML = ys.map(function (y) { return '<option value="' + y + '">' + y + '년 결산</option>'; }).join('') + '<option value="all">전체 기간</option>';
      el.year.value = ys.indexOf(cur) >= 0 ? String(cur) : (ys.length ? String(ys[0]) : 'all');
    }

    function load(res, label) {
      if (!res || !res.items.length) {
        msg('시청 기록을 찾지 못했습니다. 구글 테이크아웃에서 받은 \'시청 기록\' 파일(JSON·HTML) 또는 ZIP 파일이 맞는지 확인해 주세요. 유튜브 시청 기록 저장이 꺼져 있었다면 기록이 비어 있을 수 있습니다.', 'error');
        return false;
      }
      parsed = res; fileLabel = label;
      fillYears();
      var fmt = { json: 'JSON', html: 'HTML' }[res.format] || '';
      var ys = years(res.items);
      msg((fmt ? fmt + ' 형식으로 ' : '') + '시청 기록 ' + num(res.items.length) + '건(' + ys[ys.length - 1] + '~' + ys[0] + '년)을 읽었습니다.', 'ok');
      el.work.style.display = 'block';
      render();
      return true;
    }

    function handleFile(file) {
      if (!file) return;
      if (file.size > CONFIG.MAX_FILE_MB * 1048576) { msg('파일이 너무 큽니다. 테이크아웃에서 \'기록\'만 선택해 다시 내보내 주세요.', 'error'); return; }
      msg('파일을 읽는 중입니다… 기록이 많으면 몇 초 걸릴 수 있어요.');
      readFile(file).then(function (res) {
        setTimeout(function () { load(res, file.name); }, 0);
      }).catch(function (e) { msg(e.message || '파일을 읽지 못했습니다.', 'error'); });
    }

    el.file.addEventListener('change', function () { handleFile(el.file.files[0]); el.file.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) { el.drop.addEventListener(ev, function (e) { e.preventDefault(); el.drop.classList.add('is-over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { el.drop.addEventListener(ev, function (e) { e.preventDefault(); el.drop.classList.remove('is-over'); }); });
    el.drop.addEventListener('drop', function (e) { handleFile(e.dataTransfer && e.dataTransfer.files[0]); });
    el.sample.addEventListener('click', function () { load(parse(sampleData()), '예시 데이터'); });
    el.year.addEventListener('change', render);
    el.music.addEventListener('change', render);
    el.out.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-act="more"]') : null;
      if (!b) return;
      Array.prototype.forEach.call(el.out.querySelectorAll('.bdyt-rank li[hidden]'), function (li) { li.hidden = false; });
      b.remove();
    });
    el.reset.addEventListener('click', function () {
      parsed = null; stats = null; el.out.innerHTML = ''; el.work.style.display = 'none'; msg('');
      el.file.click();
    });
    el.csv.addEventListener('click', function () {
      if (!stats) return;
      var lines = [['순위', '채널', '시청 횟수', '비율(%)', '본 영상 수', '처음 본 날', '마지막 본 날']];
      stats.channels.forEach(function (c, i) {
        lines.push([i + 1, c.name, c.count, pct(c.count, stats.total), c.unique, fmtDate(c.first), fmtDate(c.last)]);
      });
      var csv = '﻿' + lines.map(function (r) { return r.map(function (c) { c = String(c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\r\n');
      download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), '유튜브결산_' + stats.year + '_채널통계.csv');
      msg('채널 통계를 CSV로 저장했습니다.', 'ok');
    });
    el.png.addEventListener('click', function () {
      if (!stats || !stats.total) return;
      summaryImage(stats).toBlob(function (blob) {
        if (!blob) { msg('이미지를 만들지 못했습니다.', 'error'); return; }
        download(blob, '유튜브결산_' + stats.year + '.png');
        msg('결산 이미지를 저장했습니다. 인스타 스토리나 카톡으로 공유해 보세요!', 'ok');
      }, 'image/png');
    });

    var api = { load: function (text, label) { return load(parse(text), label || '불러온 기록'); }, getStats: function () { return stats; } };
    root.barodoguApi = api;
    return api;
  }

  function download(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  /* 결산 이미지(1080×1350) — 총 시청 + 채널 TOP5 + 시간대 그래프 + 시청 유형 */
  function summaryImage(s) {
    var W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d'), F = 'system-ui,-apple-system,"Malgun Gothic",sans-serif';
    var grd = g.createLinearGradient(0, 0, W, H); grd.addColorStop(0, '#c4302b'); grd.addColorStop(1, '#7a1a17');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff'; roundRect(g, 50, 330, W - 100, H - 400, 36); g.fill();

    var label = s.year === 'all' ? '나의 유튜브 전체 기록' : s.year + ' 나의 유튜브 결산';
    g.fillStyle = 'rgba(255,255,255,.85)'; g.font = '700 32px ' + F; g.fillText(label, 90, 120);
    g.fillStyle = '#fff'; g.font = '800 76px ' + F; g.fillText(num(s.total) + '편 시청', 90, 210);
    g.font = '500 32px ' + F; g.fillStyle = 'rgba(255,255,255,.9)';
    if (s.type) g.fillText(s.type.emoji + ' ' + s.type.name + ' · 하루 평균 ' + num(Math.round(s.total / Math.max(1, s.dayCount) * 10) / 10) + '편', 90, 270);

    g.fillStyle = '#1f2430'; g.font = '800 36px ' + F; g.fillText('🏆 가장 많이 본 채널 TOP 5', 100, 410);
    var top = s.channels.slice(0, 5), max = top.length ? top[0].count : 1;
    top.forEach(function (ch, i) {
      var y = 450 + i * 92;
      g.fillStyle = '#1f2430'; g.font = '700 32px ' + F; g.textAlign = 'left';
      g.fillText(cut((i + 1) + '. ' + ch.name, 22), 100, y + 30);
      g.fillStyle = '#5f6673'; g.font = '400 28px ' + F; g.textAlign = 'right';
      g.fillText(num(ch.count) + '회', W - 100, y + 30); g.textAlign = 'left';
      g.fillStyle = '#f5eded'; roundRect(g, 100, y + 46, W - 200, 22, 11); g.fill();
      g.fillStyle = i === 0 ? '#f2a705' : '#c4302b'; roundRect(g, 100, y + 46, Math.max(22, (W - 200) * ch.count / max), 22, 11); g.fill();
    });

    var by = 1000, bh = 150, hmax = Math.max.apply(null, s.hours) || 1, peak = s.hours.indexOf(hmax);
    g.fillStyle = '#1f2430'; g.font = '800 34px ' + F; g.fillText('⏰ ' + peak + '시에 가장 많이 봤어요', 100, by - 28);
    var bw = (W - 200) / 24;
    s.hours.forEach(function (v, i) {
      var hh = bh * v / hmax;
      g.fillStyle = i === peak ? '#c4302b' : '#eba5a2';
      g.fillRect(100 + i * bw + 3, by + bh - hh, bw - 6, hh);
      if (i % 3 === 0) { g.fillStyle = '#5f6673'; g.font = '400 22px ' + F; g.textAlign = 'center'; g.fillText(String(i), 100 + i * bw + bw / 2, by + bh + 30); g.textAlign = 'left'; }
    });
    g.fillStyle = '#7a808b'; g.font = '400 24px ' + F; g.textAlign = 'center';
    g.fillText('바로도구 유튜브 시청기록 분석기 · barodogu.blogspot.com', W / 2, H - 100);
    g.textAlign = 'left';
    return c;
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  /* 예시 데이터(테이크아웃 JSON 형식) — 실제 채널·영상과 무관한 가상의 기록 */
  function sampleData() {
    var chs = [
      ['오늘의 요리 한 끼', ['10분 김치볶음밥', '자취생 계란 요리 5가지', '에어프라이어 통삼겹']],
      ['동네 산책 브이로그', ['비 오는 날 한강 산책', '가을 단풍길 걷기']],
      ['쉽게 배우는 엑셀', ['VLOOKUP 5분 정리', '피벗 테이블 기초', '조건부 서식 꿀팁']],
      ['로파이 공부 음악', ['3시간 집중 공부 음악', '비 소리와 피아노']],
      ['하루 10분 홈트', ['아침 스트레칭 10분', '전신 유산소 15분']],
      ['역사 이야기 채널', ['조선의 하루 이야기', '고려 상인들의 무역']],
      ['캠핑하는 가족', ['첫 겨울 캠핑 준비물', '차박 세팅 꿀팁']],
      ['경제 뉴스 정리', ['이번 주 경제 뉴스 한눈에', '금리가 뭐길래']],
      ['게임 하는 형', ['보스 공략 노데스', '신작 첫인상 리뷰']],
      ['고양이 일기', ['고양이가 박스를 만났을 때', '집사 깨우는 법']]
    ];
    var wt = [9, 6, 5, 8, 4, 3, 2, 4, 5, 3], wsum = wt.reduce(function (a, b) { return a + b; }, 0);
    var seed = 11, out = [];
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    var now = new Date(), y = now.getFullYear();
    var start = new Date(y - 1, 0, 1), end = new Date(y, now.getMonth(), now.getDate());
    for (var t = new Date(start); t <= end; t.setDate(t.getDate() + 1)) {
      var we = t.getDay() === 0 || t.getDay() === 6, n = Math.floor(rnd() * (we ? 14 : 7));
      if (rnd() < 0.08) n = 0;
      for (var k = 0; k < n; k++) {
        var r = rnd() * wsum, ci = 0; while (r > wt[ci] && ci < chs.length - 1) { r -= wt[ci]; ci++; }
        var ch = chs[ci], vi = Math.floor(rnd() * ch[1].length);
        var hr = rnd() < 0.6 ? 20 + Math.floor(rnd() * 4) : (rnd() < 0.5 ? 12 + Math.floor(rnd() * 2) : Math.floor(rnd() * 24));
        var d = new Date(t.getFullYear(), t.getMonth(), t.getDate(), hr, Math.floor(rnd() * 60));
        out.push({
          header: ci === 3 && rnd() < 0.5 ? 'YouTube Music' : 'YouTube',
          title: ch[1][vi] + '을(를) 시청했습니다.',
          titleUrl: 'https://www.youtube.com/watch?v=sample' + ci + '_' + vi,
          subtitles: [{ name: ch[0], url: 'https://www.youtube.com/channel/sample' + ci }],
          time: d.toISOString(), products: ['YouTube']
        });
      }
      if (rnd() < 0.3) out.push({ header: 'YouTube', title: '광고 영상을 시청했습니다.', titleUrl: 'https://www.youtube.com/watch?v=ad', time: new Date(t.getFullYear(), t.getMonth(), t.getDate(), 21).toISOString(), details: [{ name: 'From Google Ads' }] });
    }
    out.reverse(); // 테이크아웃처럼 최신순
    return JSON.stringify(out);
  }

  barodogu.youtubeHistoryAnalyzer = {
    version: CONFIG.VERSION,
    CONFIG: CONFIG,
    init: init,
    parse: parse,
    parseDateText: parseDateText,
    analyze: analyze,
    years: years,
    sampleData: sampleData
  };

  function auto() { if (document.getElementById(CONFIG.ROOT_ID)) init(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto, { once: true });
  else auto();
})(window, document);
