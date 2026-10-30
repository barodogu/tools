/*!
 * ============================================================
 * 모듈명   : barodogu.kakaoChatAnalyzer
 * 관리 ID  : BD101
 * 파일     : text/kakao-chat-analyzer.js
 * 저장소   : https://github.com/barodogu/tools
 * CDN      : https://cdn.jsdelivr.net/gh/barodogu/tools@main/text/kakao-chat-analyzer.js
 * 사용 블로그: https://barodogu.blogspot.com/
 * 용도     : 카카오톡 대화 분석기
 *            - 카카오톡 '대화 내보내기' 파일(TXT·CSV·ZIP)을 읽어 통계로 정리
 *            - 안드로이드·아이폰·PC(TXT/CSV) 형식 자동 인식
 *            - 참여자 순위, 시간대·요일·월별 분포, 요일×시간 히트맵,
 *              많이 쓴 단어, 사람별 말버릇, 사진·이모티콘·링크 수, 대화 시작 횟수
 *            - 기간 선택, 이름 가리기(참여자 A·B…), 요약 이미지(PNG) 저장
 *            ※ 대화 내용은 서버로 전송하지 않고 사용자 브라우저 안에서만 처리
 *            ※ ZIP 파일은 JSZip 3.10.1(MIT)을 ZIP을 열 때만 jsDelivr에서 불러옴
 * 사용법   : 글에 <div id="barodogu-kakao-chat-analyzer"></div> 를 넣고
 *            이 파일을 <script src="…" defer></script> 로 불러오면 화면을 그립니다.
 * 버전     : 1.0.0
 * 최종수정 : 2026-10-30
 * ============================================================
 */
(function (window, document) {
  'use strict';

  var barodogu = window.barodogu = window.barodogu || {};

  /* ---------- 기준값: 이 객체만 수정하면 됩니다 ---------- */
  var CONFIG = {
    VERSION: '1.0.0',
    UPDATED: '2026-10-30',
    ROOT_ID: 'barodogu-kakao-chat-analyzer',
    MAX_FILE_MB: 300,            // 불러올 파일 최대 용량
    START_GAP_MIN: 60,           // 이 시간(분) 이상 조용하다가 처음 말한 사람 = '대화 시작'
    TOP_WORDS: 30,               // 많이 쓴 단어 표시 개수
    PERSON_WORDS: 3,             // 사람별 말버릇 단어 개수
    RANK_SHOW: 10,               // 참여자 순위 처음 표시 인원
    MIN_WORD_LEN: 2,
    JSZIP_URL: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
    ACCEPT: '.txt,.csv,.zip,text/plain,text/csv,application/zip'
  };

  /* 단어 집계에서 뺄 말(조사·대명사·추임새 등) */
  var STOPWORDS = ('그리고 그래서 그런데 근데 그럼 그러면 그냥 진짜 정말 너무 아니 이제 지금 오늘 내일 어제 우리 저희 나는 너는 이거 그거 저거 이건 그건 ' +
    '여기 거기 저기 이렇게 그렇게 저렇게 아직 혹시 다시 많이 조금 좀더 하고 해서 하는 했어 했는데 있어 있는 없어 없는 같아 같은 ' +
    '그게 이게 뭐가 뭐야 어떻게 왜요 네네 넵넵 응응 ㅇㅇ 그래 그래요 맞아 맞아요 아니야 근데요 해요 했어요 있어요 없어요 할게요 ' +
    '사진 동영상 이모티콘 파일 삭제된 메시지입니다 the and you').split(' ');
  var STOP = {};
  STOPWORDS.forEach(function (w) { STOP[w] = 1; });

  /* 단어 끝 조사(긴 것부터) — 남는 글자가 2자 이상일 때만 떼어 냄 */
  var JOSA = ['에서는', '으로는', '한테서', '에게서', '이라고', '이랑', '에서', '에게', '한테', '으로', '까지', '부터', '처럼', '보다', '이나',
    '라고', '은', '는', '이', '가', '을', '를', '에', '의', '도', '로', '와', '과', '만', '랑'];

  var DOW = ['일', '월', '화', '수', '목', '금', '토'];
  var EN_MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

  /* ====================== 파싱 (순수 함수) ====================== */
  function to24(h, ampm) {
    h = +h;
    if (!ampm) return h;
    var pm = ampm === '오후' || /^pm$/i.test(ampm);
    if (pm && h < 12) return h + 12;
    if (!pm && h === 12) return 0;
    return h;
  }

  // 모바일(안드로이드·아이폰) 한국어: 2026년 10월 30일 오후 6:13, 이름 : 내용 / 2026. 10. 30. 오후 6:13, 이름 : 내용
  var RE_MOBILE = /^(\d{4})(?:년|\.)\s*(\d{1,2})(?:월|\.)\s*(\d{1,2})(?:일|\.)?\s*(오전|오후|AM|PM)?\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*(오전|오후|AM|PM)?,\s?(.*)$/i;
  // 모바일 영어: Oct 30, 2026, 6:13 PM, Name : msg / October 30, 2026 at 6:13 PM, Name : msg
  var RE_MOBILE_EN = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),\s*(\d{4})(?:,|\s+at)\s+(\d{1,2}):(\d{2})\s*(AM|PM),\s?(.*)$/i;
  // PC: [이름] [오후 6:13] 내용 / [Name] [6:13 PM] msg
  var RE_PC_MSG = /^\[(.+?)\]\s\[(?:(오전|오후)\s*)?(\d{1,2}):(\d{2})\s*(AM|PM)?\]\s?(.*)$/i;
  // PC 날짜 구분선: --------------- 2026년 10월 30일 금요일 ---------------
  var RE_PC_DATE = /^-{3,}\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일.*?-{3,}\s*$/;
  var RE_PC_DATE_EN = /^-{3,}\s*(?:[A-Za-z]+,\s*)?([A-Za-z]{3,9})\s+(\d{1,2}),\s*(\d{4})\s*-{3,}\s*$/;
  // 모바일 날짜 구분 줄(시간 없음): 2026년 10월 30일 금요일
  var RE_DAY_LINE = /^(\d{4})(?:년|\.)\s*(\d{1,2})(?:월|\.)\s*(\d{1,2})(?:일|\.)?\s*([월화수목금토일]요일)?\s*$/;
  // 입장·퇴장·초대 알림(PC 형식은 시간 없이 한 줄로 나옴)
  var RE_SYS_LINE = /^.+님(이|을) .*(들어왔습니다|나갔습니다|초대했습니다|초대하였습니다|내보냈습니다)\.?$|^.+ (joined|left) this chatroom\.?$|^.+ invited .+\.$/;
  var RE_HEADER = /^(저장한 날짜|Date Saved|Saved on)\s*:|님과 카카오톡 대화$|Talk with .* in KakaoTalk$/i;

  function splitSpeaker(rest) {
    var k = rest.indexOf(' : ');
    if (k > 0) return { name: rest.slice(0, k), text: rest.slice(k + 3) };
    return null; // 입장·퇴장 등 시스템 알림
  }

  function csvRows(text) {
    var rows = [], row = [], f = '', q = false, i, c, n = text.length;
    for (i = 0; i < n; i++) {
      c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
      else if (c !== '\r') f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows;
  }

  /**
   * 내보내기 텍스트 → 메시지 배열
   * 결과: { messages:[{t:Date, name, text}], system: n, format: 'android'|'ios'|'pc'|'pc-csv'|'en'|null }
   */
  function parse(text) {
    text = String(text || '').replace(/^﻿/, '');
    var msgs = [], system = 0, format = null;

    // PC CSV
    var firstLine = text.slice(0, 200).split(/\r?\n/)[0];
    if (/^"?Date"?,"?User"?,"?Message"?/i.test(firstLine)) {
      var rows = csvRows(text);
      for (var r = 1; r < rows.length; r++) {
        var rw = rows[r];
        if (rw.length < 3) continue;
        var m = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})/.exec(rw[0]);
        if (!m) continue;
        msgs.push({ t: new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]), name: rw[1], text: rw.slice(2).join(',') });
      }
      return { messages: msgs, system: 0, format: 'pc-csv' };
    }

    var lines = text.split(/\r?\n/), last = null, day = null, i, ln, m2, sp;
    for (i = 0; i < lines.length; i++) {
      ln = lines[i];
      if ((m2 = RE_MOBILE.exec(ln))) {
        if (!format) format = /년/.test(ln.slice(0, 8)) ? 'android' : 'ios';
        var t = new Date(+m2[1], m2[2] - 1, +m2[3], to24(m2[5], m2[4] || m2[7]), +m2[6]);
        sp = splitSpeaker(m2[8]);
        if (sp) { last = { t: t, name: sp.name, text: sp.text }; msgs.push(last); }
        else { system++; last = null; }
        continue;
      }
      if ((m2 = RE_MOBILE_EN.exec(ln)) && EN_MON[m2[1].slice(0, 3).toLowerCase()]) {
        if (!format) format = 'en';
        var te = new Date(+m2[3], EN_MON[m2[1].slice(0, 3).toLowerCase()] - 1, +m2[2], to24(m2[4], m2[6]), +m2[5]);
        sp = splitSpeaker(m2[7]);
        if (sp) { last = { t: te, name: sp.name, text: sp.text }; msgs.push(last); }
        else { system++; last = null; }
        continue;
      }
      if ((m2 = RE_PC_DATE.exec(ln))) { day = [+m2[1], m2[2] - 1, +m2[3]]; last = null; if (!format) format = 'pc'; continue; }
      if ((m2 = RE_PC_DATE_EN.exec(ln)) && EN_MON[m2[1].slice(0, 3).toLowerCase()]) {
        day = [+m2[3], EN_MON[m2[1].slice(0, 3).toLowerCase()] - 1, +m2[2]]; last = null; if (!format) format = 'pc'; continue;
      }
      if (day && (m2 = RE_PC_MSG.exec(ln))) {
        last = { t: new Date(day[0], day[1], day[2], to24(m2[3], m2[2] || m2[5]), +m2[4]), name: m2[1], text: m2[6] };
        msgs.push(last);
        continue;
      }
      if (RE_DAY_LINE.test(ln) || RE_HEADER.test(ln)) { last = null; continue; }
      if (day && RE_SYS_LINE.test(ln)) { system++; last = null; continue; }
      if (last) { last.text += '\n' + ln; continue; }
      if (day && ln.trim()) system++; // PC 형식의 입장·퇴장 알림
    }
    return { messages: msgs, system: system, format: format };
  }

  /* ====================== 메시지 분류·단어 ====================== */
  function kindOf(text) {
    var s = text.trim();
    if (/^사진( \d+장)?$|^Photo(s)?$|^\d+ photos?$/i.test(s)) return 'photo';
    if (/^동영상$|^Video$/i.test(s)) return 'video';
    if (/^이모티콘$|^Emoticons?$|^\(이모티콘\)$/i.test(s)) return 'emoticon';
    if (/^파일[:：]|^File[:：]/i.test(s)) return 'file';
    if (/^음성메시지$|^Voice message$/i.test(s)) return 'voice';
    if (/^삭제된 메시지입니다\.?$|^This message was deleted\.?$|^메시지가 삭제되었습니다\.?$/i.test(s)) return 'deleted';
    if (/^(보이스톡|페이스톡)/.test(s)) return 'call';
    return 'text';
  }

  function stripJosa(w) {
    if (!/^[가-힣]+$/.test(w)) return w;
    for (var i = 0; i < JOSA.length; i++) {
      var j = JOSA[i];
      if (w.length - j.length >= 2 && w.slice(-j.length) === j) return w.slice(0, -j.length);
    }
    return w;
  }

  function tokenize(text) {
    var out = [];
    var clean = text.replace(/https?:\/\/\S+/g, ' ').replace(/[ㅋㅎㅠㅜ]{2,}/g, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ');
    var parts = clean.split(/\s+/);
    for (var i = 0; i < parts.length; i++) {
      var w = parts[i];
      if (!w || /^\d+$/.test(w) || /^[ㄱ-ㅎㅏ-ㅣ]+$/.test(w)) continue;
      w = stripJosa(w.toLowerCase());
      if (w.length < CONFIG.MIN_WORD_LEN || STOP[w]) continue;
      out.push(w);
    }
    return out;
  }

  function topN(map, n) {
    var arr = [];
    for (var k in map) if (Object.prototype.hasOwnProperty.call(map, k)) arr.push([k, map[k]]);
    arr.sort(function (a, b) { return b[1] - a[1] || (a[0] < b[0] ? -1 : 1); });
    return arr.slice(0, n);
  }

  function dayKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function monthKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  /**
   * 통계 계산
   * opt.from / opt.to : Date (포함 범위), 없으면 전체
   */
  function analyze(messages, opt) {
    opt = opt || {};
    var from = opt.from ? +opt.from : -Infinity, to = opt.to ? +opt.to : Infinity;
    var people = {}, hours = new Array(24).fill(0), dows = new Array(7).fill(0);
    var heat = []; for (var d = 0; d < 7; d++) heat.push(new Array(24).fill(0));
    var days = {}, months = {}, words = {}, kinds = { photo: 0, video: 0, emoticon: 0, file: 0, voice: 0, deleted: 0, call: 0, link: 0, laugh: 0, cry: 0 };
    var total = 0, chars = 0, first = null, last = null, prevT = null, gapMs = CONFIG.START_GAP_MIN * 60000;

    for (var i = 0; i < messages.length; i++) {
      var m = messages[i], t = +m.t;
      if (t < from || t > to) continue;
      total++;
      if (!first || t < +first) first = m.t;
      if (!last || t > +last) last = m.t;
      var p = people[m.name] || (people[m.name] = { name: m.name, count: 0, chars: 0, photo: 0, emoticon: 0, link: 0, laugh: 0, starts: 0, words: {}, first: m.t, last: m.t });
      p.count++; p.last = m.t;
      var h = m.t.getHours(), w = m.t.getDay();
      hours[h]++; dows[w]++; heat[w][h]++;
      var dk = dayKey(m.t); days[dk] = (days[dk] || 0) + 1;
      var mk = monthKey(m.t); months[mk] = (months[mk] || 0) + 1;
      if (prevT === null || t - prevT >= gapMs) p.starts++;
      prevT = t;

      var kd = kindOf(m.text);
      if (kd !== 'text') { kinds[kd]++; if (kd === 'photo') p.photo++; if (kd === 'emoticon') p.emoticon++; continue; }
      var len = m.text.replace(/\s/g, '').length; p.chars += len; chars += len;
      var links = m.text.match(/https?:\/\/\S+/g); if (links) { kinds.link += links.length; p.link += links.length; }
      var lg = m.text.match(/[ㅋㅎ]{2,}/g); if (lg) { kinds.laugh += lg.length; p.laugh += lg.length; }
      var cr = m.text.match(/[ㅠㅜ]{2,}/g); if (cr) kinds.cry += cr.length;
      var tk = tokenize(m.text);
      for (var j = 0; j < tk.length; j++) { words[tk[j]] = (words[tk[j]] || 0) + 1; p.words[tk[j]] = (p.words[tk[j]] || 0) + 1; }
    }

    var list = [];
    for (var k in people) if (Object.prototype.hasOwnProperty.call(people, k)) list.push(people[k]);
    list.sort(function (a, b) { return b.count - a.count || (a.name < b.name ? -1 : 1); });

    // 사람별 말버릇: 그 사람이 쓴 횟수 × (그 사람 비중 / 전체 비중)이 큰 단어
    list.forEach(function (pp) {
      var cand = [];
      for (var wd in pp.words) {
        if (!Object.prototype.hasOwnProperty.call(pp.words, wd)) continue;
        var c = pp.words[wd]; if (c < 3) continue;
        cand.push([wd, c, c * (c / words[wd])]);
      }
      cand.sort(function (a, b) { return b[2] - a[2] || b[1] - a[1]; });
      pp.habit = cand.slice(0, CONFIG.PERSON_WORDS).map(function (x) { return x[0]; });
      delete pp.words;
    });

    var dayCount = first ? Math.floor((new Date(last.getFullYear(), last.getMonth(), last.getDate()) - new Date(first.getFullYear(), first.getMonth(), first.getDate())) / 864e5) + 1 : 0;
    var activeDays = Object.keys(days).length;
    return {
      total: total, chars: chars, first: first, last: last, dayCount: dayCount, activeDays: activeDays,
      people: list, hours: hours, dows: dows, heat: heat,
      topDays: topN(days, 5), months: Object.keys(months).sort().map(function (x) { return [x, months[x]]; }),
      words: topN(words, CONFIG.TOP_WORDS), kinds: kinds
    };
  }

  /* ====================== 화면 ====================== */
  var CSS = [
    '#R{box-sizing:border-box;max-width:900px;margin:24px auto;color:#17283e;font:16px/1.65 system-ui,-apple-system,"Malgun Gothic",sans-serif;overflow-wrap:anywhere;}',
    '#R *{box-sizing:border-box;}',
    '#R .bdka-card{border:1px solid #dbe3ee;border-radius:18px;background:#fff;padding:clamp(14px,3vw,28px);}',
    '#R .bdka-kicker{margin:0;color:#1a6491;font-size:13px;font-weight:800;letter-spacing:.08em;}',
    '#R .bdka-title{margin:6px 0 10px;color:#17283e;font-size:clamp(23px,4vw,32px);line-height:1.3;border:0;padding:0;}',
    '#R .bdka-lead{margin:0 0 18px;}',
    '#R .bdka-drop{border:2px dashed #96b9ce;border-radius:14px;background:#f2f9fc;padding:22px 14px;text-align:center;transition:background .15s;}',
    '#R .bdka-drop.is-over{background:#dceff9;}',
    '#R .bdka-drop strong{display:block;font-size:18px;}',
    '#R .bdka-filebtn{display:inline-flex;align-items:center;justify-content:center;margin-top:12px;min-height:44px;padding:9px 18px;border-radius:10px;background:#1a6491;color:#fff;font-weight:700;cursor:pointer;}',
    '#R .bdka-filebtn:focus-within{outline:3px solid #f2b705;outline-offset:2px;}',
    '#R .bdka-file{position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;}',
    '#R .bdka-small{font-size:13px;color:#53697b;margin:8px 0 0;}',
    '#R .bdka-link{background:none;border:0;padding:0;color:#1a6491;text-decoration:underline;font:inherit;cursor:pointer;}',
    '#R .bdka-btn{font:inherit;min-height:44px;border:1px solid #bac9de;border-radius:10px;padding:8px 14px;background:#fff;color:#17283e;cursor:pointer;}',
    '#R .bdka-btn:hover{background:#f2f6fb;}',
    '#R .bdka-btn:focus-visible,#R .bdka-link:focus-visible{outline:3px solid #f2b705;outline-offset:2px;}',
    '#R .bdka-btn.is-primary{background:#1a6491;border-color:#1a6491;color:#fff;font-weight:700;}',
    '#R .bdka-paste{display:none;margin-top:12px;}',
    '#R .bdka-paste textarea{width:100%;min-height:140px;font:14px/1.5 ui-monospace,Consolas,monospace;border:1px solid #bac9de;border-radius:10px;padding:10px;}',
    '#R .bdka-work{display:none;margin-top:18px;}',
    '#R .bdka-bar{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;margin-bottom:6px;font-size:14px;}',
    '#R .bdka-bar select{font:inherit;min-height:40px;border:1px solid #bac9de;border-radius:9px;padding:6px 10px;background:#fff;color:#17283e;}',
    '#R .bdka-bar label{display:inline-flex;gap:6px;align-items:center;}',
    '#R .bdka-bar input[type=date]{font:inherit;min-height:40px;border:1px solid #bac9de;border-radius:9px;padding:4px 8px;}',
    '#R .bdka-sum{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin:14px 0 4px;}',
    '#R .bdka-stat{border:1px solid #dbe3ee;border-radius:12px;background:#f8fafc;padding:10px 12px;}',
    '#R .bdka-stat b{display:block;font-size:22px;line-height:1.3;color:#17283e;}',
    '#R .bdka-stat span{font-size:13px;color:#53697b;}',
    '#R .bdka-sec{margin-top:24px;}',
    '#R .bdka-h3{margin:0 0 4px;font-size:18px;color:#17283e;border:0;padding:0;}',
    '#R .bdka-note{margin:0 0 10px;font-size:13px;color:#53697b;}',
    '#R .bdka-rank{list-style:none;margin:0;padding:0;}',
    '#R .bdka-rank li{margin:0 0 10px;padding:0;}',
    '#R .bdka-rhead{display:flex;justify-content:space-between;gap:8px;font-size:15px;}',
    '#R .bdka-rhead b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '#R .bdka-rhead span{flex:0 0 auto;color:#53697b;font-size:14px;}',
    '#R .bdka-track{height:12px;border-radius:6px;background:#eef3f8;overflow:hidden;margin:3px 0;}',
    '#R .bdka-fill{height:100%;background:#1a6491;border-radius:6px;}',
    '#R .bdka-rank li:first-child .bdka-fill{background:#f2a705;}',
    '#R .bdka-rsub{font-size:12.5px;color:#53697b;}',
    '#R .bdka-cols{display:flex;align-items:flex-end;gap:2px;height:140px;padding:0 2px;border-bottom:1px solid #bac9de;}',
    '#R .bdka-col{flex:1;min-width:0;background:#7fb3d3;border-radius:3px 3px 0 0;position:relative;}',
    '#R .bdka-col.is-max{background:#1a6491;}',
    '#R .bdka-axis{display:flex;gap:2px;padding:0 2px;font-size:11px;color:#53697b;}',
    '#R .bdka-axis span{flex:1;min-width:0;text-align:center;}',
    '#R .bdka-heat{display:grid;grid-template-columns:20px repeat(24,minmax(0,1fr));gap:2px;font-size:11px;color:#53697b;}',
    '@media (max-width:480px){#R .bdka-heat{gap:1px;font-size:10px;}}',
    '#R .bdka-heat i{display:block;aspect-ratio:1/1;border-radius:3px;background:#1a6491;}',
    '#R .bdka-heat em{font-style:normal;text-align:center;white-space:nowrap;overflow:visible;}',
    '#R .bdka-words{display:flex;flex-wrap:wrap;gap:6px 8px;margin:0;padding:0;list-style:none;}',
    '#R .bdka-words li{margin:0;padding:4px 10px;border-radius:999px;background:#eaf3f9;color:#17283e;line-height:1.4;}',
    '#R .bdka-words li small{color:#53697b;margin-left:4px;font-size:12px;}',
    '#R .bdka-tbl{width:100%;border-collapse:collapse;font-size:14px;}',
    '#R .bdka-tbl th,#R .bdka-tbl td{border:1px solid #dbe3ee;padding:7px 8px;text-align:left;vertical-align:top;}',
    '#R .bdka-tbl th{background:#f2f6fb;}',
    '#R .bdka-tblwrap{overflow-x:auto;}',
    '#R .bdka-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px;}',
    '#R .bdka-msg{min-height:1.6em;margin:14px 0 0;padding:10px 12px;border-radius:10px;background:#f4f7fb;font-size:14px;}',
    '#R .bdka-msg:empty{display:none;}',
    '#R .bdka-msg.is-error{background:#fff3df;}',
    '#R .bdka-msg.is-ok{background:#edf8f1;}',
    '#R .bdka-foot{margin:16px 0 0;font-size:12px;color:#6b7f90;}'
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
  function pct(a, b) { return b ? Math.round(a / b * 1000) / 10 : 0; }

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

  function decode(buf) {
    var u8 = new Uint8Array(buf);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(u8); }
    catch (e) {
      try { return new TextDecoder('euc-kr').decode(u8); } catch (e2) { return new TextDecoder('utf-8').decode(u8); }
    }
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(new Error('파일을 읽지 못했습니다.')); };
      fr.readAsArrayBuffer(file);
    }).then(function (buf) {
      var u8 = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
      var isZip = u8[0] === 0x50 && u8[1] === 0x4B;
      if (!isZip) return decode(buf);
      return loadJSZip().then(function (JSZip) { return JSZip.loadAsync(buf); }).then(function (zip) {
        var best = null;
        zip.forEach(function (path, entry) {
          if (entry.dir || !/\.(txt|csv)$/i.test(path) || /__MACOSX/.test(path)) return;
          var size = entry._data && entry._data.uncompressedSize || 0;
          if (!best || size > best.size) best = { entry: entry, size: size };
        });
        if (!best) throw new Error('ZIP 안에서 대화 파일(.txt·.csv)을 찾지 못했습니다.');
        return best.entry.async('arraybuffer').then(decode);
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
    var card = h('div', { 'class': 'bdka-card' });
    card.innerHTML =
      '<p class="bdka-kicker">바로도구 · 카톡 대화 분석기</p>' +
      '<h2 class="bdka-title">카카오톡 대화 분석기</h2>' +
      '<p class="bdka-lead">카카오톡에서 내보낸 대화 파일을 올리면 누가 가장 많이 말했는지, 언제 가장 활발한지, 어떤 말을 자주 쓰는지 바로 정리해 드립니다. <b>대화 내용은 서버로 전송되지 않고 이 기기 브라우저 안에서만 분석합니다.</b></p>' +
      '<div class="bdka-drop" data-el="drop"><strong>대화 파일을 여기에 끌어다 놓으세요</strong>' +
      '<span>안드로이드·아이폰·PC에서 내보낸 TXT, CSV, ZIP 파일</span><br>' +
      '<label class="bdka-filebtn">파일 선택<input class="bdka-file" type="file" data-el="file" accept="' + CONFIG.ACCEPT + '"></label>' +
      '<p class="bdka-small">파일이 없나요? <button type="button" class="bdka-link" data-el="pastebtn">대화 내용을 직접 붙여 넣기</button> · <button type="button" class="bdka-link" data-el="sample">예시 대화로 체험하기</button></p></div>' +
      '<div class="bdka-paste" data-el="paste"><textarea data-el="pastearea" placeholder="내보낸 대화 내용을 붙여 넣으세요"></textarea>' +
      '<div class="bdka-actions" style="margin-top:8px"><button type="button" class="bdka-btn is-primary" data-el="pasterun">분석하기</button></div></div>' +
      '<div class="bdka-msg" data-el="msg" role="status" aria-live="polite"></div>' +
      '<div class="bdka-work" data-el="work">' +
      '<div class="bdka-bar"><label>기간 <select data-el="range">' +
      '<option value="all">전체</option><option value="30">최근 30일</option><option value="90">최근 3개월</option><option value="365">최근 1년</option><option value="custom">직접 선택</option></select></label>' +
      '<span data-el="custom" style="display:none"><input type="date" data-el="from" aria-label="시작일"> ~ <input type="date" data-el="to" aria-label="종료일"></span>' +
      '<label><input type="checkbox" data-el="anon"> 이름 가리기</label></div>' +
      '<div data-el="out"></div>' +
      '<div class="bdka-actions"><button type="button" class="bdka-btn is-primary" data-el="png">요약 이미지 저장</button>' +
      '<button type="button" class="bdka-btn" data-el="csv">참여자 통계 CSV 저장</button>' +
      '<button type="button" class="bdka-btn" data-el="reset">다른 파일 분석</button></div></div>' +
      '<p class="bdka-foot">바로도구 카톡 대화 분석기 v' + CONFIG.VERSION + ' · 분석 결과는 새로고침하면 사라집니다.</p>';
    root.appendChild(card);

    var el = {};
    Array.prototype.forEach.call(card.querySelectorAll('[data-el]'), function (n) { el[n.getAttribute('data-el')] = n; });

    var parsed = null, stats = null, fileLabel = '';

    function msg(t, type) { el.msg.textContent = t || ''; el.msg.className = 'bdka-msg' + (type ? ' is-' + type : ''); }

    function alias(i) {
      var s = '', n = i;
      do { s = String.fromCharCode(65 + n % 26) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
      return '참여자 ' + s;
    }
    function nameOf(p, i) { return el.anon.checked ? alias(i) : p.name; }

    function currentRange() {
      var v = el.range.value, msgs = parsed.messages, last = msgs.reduce(function (a, m) { return +m.t > a ? +m.t : a; }, 0);
      if (v === 'all') return {};
      if (v === 'custom') {
        var f = el.from.value ? new Date(el.from.value + 'T00:00:00') : null;
        var t = el.to.value ? new Date(el.to.value + 'T23:59:59') : null;
        return { from: f, to: t };
      }
      var end = new Date(last); end.setHours(23, 59, 59, 999);
      var start = new Date(end); start.setDate(start.getDate() - (+v) + 1); start.setHours(0, 0, 0, 0);
      return { from: start, to: end };
    }

    function colChart(values, labels, labelEvery) {
      var max = Math.max.apply(null, values) || 1, html = '<div class="bdka-cols" role="img" aria-label="' + esc(labels.map(function (l, i) { return l + ' ' + values[i] + '건'; }).join(', ')) + '">';
      values.forEach(function (v, i) {
        html += '<div class="bdka-col' + (v === max && v > 0 ? ' is-max' : '') + '" style="height:' + (v / max * 100).toFixed(1) + '%" title="' + esc(labels[i] + ': ' + num(v) + '건') + '"></div>';
      });
      html += '</div><div class="bdka-axis">';
      labels.forEach(function (l, i) { html += '<span>' + (i % (labelEvery || 1) === 0 ? esc(l) : '') + '</span>'; });
      return html + '</div>';
    }

    function render() {
      stats = analyze(parsed.messages, currentRange());
      var s = stats, out = '';
      if (!s.total) { el.out.innerHTML = '<p class="bdka-note">선택한 기간에 메시지가 없습니다.</p>'; return; }
      var top = s.people[0], peakH = s.hours.indexOf(Math.max.apply(null, s.hours)), peakD = s.dows.indexOf(Math.max.apply(null, s.dows));

      out += '<div class="bdka-sum">' +
        stat(num(s.total), '전체 메시지') + stat(num(s.people.length) + '명', '말한 참여자') +
        stat(num(Math.round(s.total / Math.max(1, s.dayCount))), '하루 평균 메시지') +
        stat(peakH + '시', '가장 활발한 시간') + stat(DOW[peakD] + '요일', '가장 활발한 요일') +
        stat(num(s.activeDays) + '일', '대화한 날 / ' + num(s.dayCount) + '일') + '</div>' +
        '<p class="bdka-note">' + esc(fileLabel) + ' · ' + fmtDate(s.first) + ' ~ ' + fmtDate(s.last) + (parsed.system ? ' · 입장·퇴장 등 알림 ' + num(parsed.system) + '건 제외' : '') + '</p>';

      // 참여자 순위
      out += '<section class="bdka-sec"><h3 class="bdka-h3">💬 수다왕 순위</h3><p class="bdka-note">메시지 수 기준. 사진·이모티콘도 1건으로 셉니다.</p><ol class="bdka-rank" data-el="rank">';
      s.people.forEach(function (p, i) {
        out += '<li' + (i >= CONFIG.RANK_SHOW ? ' hidden' : '') + '><div class="bdka-rhead"><b>' + (i + 1) + '. ' + esc(nameOf(p, i)) + '</b><span>' + num(p.count) + '건 · ' + pct(p.count, s.total) + '%</span></div>' +
          '<div class="bdka-track"><div class="bdka-fill" style="width:' + (p.count / top.count * 100).toFixed(1) + '%"></div></div>' +
          '<div class="bdka-rsub">글자 ' + num(p.chars) + ' · 사진 ' + num(p.photo) + ' · 이모티콘 ' + num(p.emoticon) + ' · ㅋㅋ ' + num(p.laugh) + ' · 대화 시작 ' + num(p.starts) + '회' +
          (p.habit && p.habit.length ? ' · 말버릇 "' + esc(p.habit.join('", "')) + '"' : '') + '</div></li>';
      });
      out += '</ol>' + (s.people.length > CONFIG.RANK_SHOW ? '<button type="button" class="bdka-btn" data-act="more">전체 ' + s.people.length + '명 보기</button>' : '') + '</section>';

      // 시간대·요일
      var hl = []; for (var i = 0; i < 24; i++) hl.push(String(i));
      out += '<section class="bdka-sec"><h3 class="bdka-h3">⏰ 시간대별 대화량</h3><p class="bdka-note">' + peakH + '시에 가장 많이 이야기합니다.</p>' + colChart(s.hours, hl, 3) + '</section>';
      out += '<section class="bdka-sec"><h3 class="bdka-h3">📅 요일별 대화량</h3>' + colChart(s.dows, DOW, 1) + '</section>';

      // 히트맵
      var hmax = 0; s.heat.forEach(function (r) { r.forEach(function (v) { if (v > hmax) hmax = v; }); });
      out += '<section class="bdka-sec"><h3 class="bdka-h3">🔥 요일 × 시간 히트맵</h3><p class="bdka-note">진할수록 대화가 많은 시간입니다.</p><div class="bdka-heat"><em></em>';
      for (i = 0; i < 24; i++) out += '<em>' + (i % 6 === 0 ? i : '') + '</em>';
      for (var d = 0; d < 7; d++) {
        out += '<em>' + DOW[d] + '</em>';
        for (i = 0; i < 24; i++) {
          var v = s.heat[d][i];
          out += '<i style="opacity:' + (v ? (0.12 + 0.88 * v / hmax).toFixed(2) : 0.05) + '" title="' + DOW[d] + '요일 ' + i + '시: ' + num(v) + '건"></i>';
        }
      }
      out += '</div></section>';

      // 월별
      if (s.months.length > 1) {
        var mv = s.months.map(function (x) { return x[1]; }), ml = s.months.map(function (x) { return x[0].slice(2).replace('-', '.'); });
        out += '<section class="bdka-sec"><h3 class="bdka-h3">📈 월별 대화량</h3>' + colChart(mv, ml, Math.ceil(ml.length / 8)) + '</section>';
      }

      // 단어
      if (s.words.length) {
        out += '<section class="bdka-sec"><h3 class="bdka-h3">🗣️ 많이 쓴 단어</h3><p class="bdka-note">띄어쓰기 단위로 세고 흔한 조사·추임새는 뺐습니다.</p><ol class="bdka-words">';
        s.words.forEach(function (w) { out += '<li>' + esc(w[0]) + '<small>' + num(w[1]) + '</small></li>'; });
        out += '</ol></section>';
      }

      // 기타
      var k = s.kinds;
      out += '<section class="bdka-sec"><h3 class="bdka-h3">📦 이것저것</h3><div class="bdka-tblwrap"><table class="bdka-tbl"><tbody>' +
        row('사진', k.photo) + row('동영상', k.video) + row('이모티콘', k.emoticon) + row('링크', k.link) + row('파일', k.file) +
        row('ㅋㅋ·ㅎㅎ 웃음', k.laugh) + row('ㅠㅠ 눈물', k.cry) + row('삭제된 메시지', k.deleted) + row('보이스톡·페이스톡', k.call) + '</tbody></table></div>';
      if (s.topDays.length) {
        out += '<p class="bdka-note" style="margin-top:10px">가장 뜨거웠던 날: ' + s.topDays.map(function (x) { return x[0].replace(/-/g, '.') + ' (' + num(x[1]) + '건)'; }).join(', ') + '</p>';
      }
      out += '</section>';
      el.out.innerHTML = out;
    }
    function stat(v, l) { return '<div class="bdka-stat"><b>' + v + '</b><span>' + l + '</span></div>'; }
    function row(l, v) { return '<tr><th scope="row">' + l + '</th><td>' + num(v) + '</td></tr>'; }

    function load(text, label) {
      var res = parse(text);
      if (!res.messages.length) {
        msg('대화 형식을 알아보지 못했습니다. 카카오톡 \'대화 내보내기\'로 받은 파일이 맞는지 확인해 주세요. (안드로이드·아이폰·PC 기본 형식 지원)', 'error');
        return false;
      }
      parsed = res; fileLabel = label || '붙여 넣은 대화';
      el.range.value = 'all'; el.custom.style.display = 'none';
      var names = {}; res.messages.forEach(function (m) { names[m.name] = 1; });
      var fmt = { android: '안드로이드', ios: '아이폰', pc: 'PC', 'pc-csv': 'PC(CSV)', en: '영문' }[res.format] || '';
      msg((fmt ? fmt + ' 형식으로 ' : '') + '메시지 ' + num(res.messages.length) + '건, 참여자 ' + Object.keys(names).length + '명을 읽었습니다.', 'ok');
      el.work.style.display = 'block';
      render();
      return true;
    }

    function handleFile(file) {
      if (!file) return;
      if (file.size > CONFIG.MAX_FILE_MB * 1048576) { msg('파일이 너무 큽니다. ' + CONFIG.MAX_FILE_MB + 'MB 이하 파일을 올려 주세요.', 'error'); return; }
      msg('파일을 읽는 중입니다…');
      readFile(file).then(function (text) {
        setTimeout(function () { load(text, file.name); }, 0);
      }).catch(function (e) { msg(e.message || '파일을 읽지 못했습니다.', 'error'); });
    }

    el.file.addEventListener('change', function () { handleFile(el.file.files[0]); el.file.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) { el.drop.addEventListener(ev, function (e) { e.preventDefault(); el.drop.classList.add('is-over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { el.drop.addEventListener(ev, function (e) { e.preventDefault(); el.drop.classList.remove('is-over'); }); });
    el.drop.addEventListener('drop', function (e) { handleFile(e.dataTransfer && e.dataTransfer.files[0]); });
    el.pastebtn.addEventListener('click', function () { el.paste.style.display = 'block'; el.pastearea.focus(); });
    el.pasterun.addEventListener('click', function () {
      if (!el.pastearea.value.trim()) { msg('대화 내용을 붙여 넣어 주세요.', 'error'); return; }
      load(el.pastearea.value, '붙여 넣은 대화');
    });
    el.sample.addEventListener('click', function () { load(sampleChat(), '예시 대화'); });
    el.range.addEventListener('change', function () {
      el.custom.style.display = el.range.value === 'custom' ? 'inline' : 'none';
      if (el.range.value === 'custom' && stats && stats.first && !el.from.value) {
        el.from.value = stats.first.toISOString ? dayKey(stats.first) : ''; el.to.value = dayKey(stats.last);
      }
      render();
    });
    el.from.addEventListener('change', render); el.to.addEventListener('change', render);
    el.anon.addEventListener('change', render);
    el.out.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-act="more"]') : null;
      if (!b) return;
      Array.prototype.forEach.call(el.out.querySelectorAll('.bdka-rank li[hidden]'), function (li) { li.hidden = false; });
      b.remove();
    });
    el.reset.addEventListener('click', function () {
      parsed = null; stats = null; el.out.innerHTML = ''; el.work.style.display = 'none'; el.pastearea.value = ''; msg('');
      el.file.click();
    });
    el.csv.addEventListener('click', function () {
      if (!stats) return;
      var lines = [['순위', '이름', '메시지', '비율(%)', '글자 수', '사진', '이모티콘', '링크', 'ㅋㅋ', '대화 시작', '말버릇']];
      stats.people.forEach(function (p, i) {
        lines.push([i + 1, nameOf(p, i), p.count, pct(p.count, stats.total), p.chars, p.photo, p.emoticon, p.link, p.laugh, p.starts, (p.habit || []).join(' ')]);
      });
      var csv = '﻿' + lines.map(function (r) { return r.map(function (c) { c = String(c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\r\n');
      download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), '카톡분석_참여자통계.csv');
      msg('참여자 통계를 CSV로 저장했습니다.', 'ok');
    });
    el.png.addEventListener('click', function () {
      if (!stats) return;
      summaryImage(stats, nameOf).toBlob(function (blob) {
        if (!blob) { msg('이미지를 만들지 못했습니다.', 'error'); return; }
        download(blob, '카톡분석_요약.png');
        msg('요약 이미지를 저장했습니다.' + (el.anon.checked ? '' : ' 단톡방에 공유할 땐 \'이름 가리기\'를 켜는 것도 방법입니다.'), 'ok');
      }, 'image/png');
    });

    var api = { load: load, getStats: function () { return stats; } };
    root.barodoguApi = api;
    return api;
  }

  function download(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  /* 요약 이미지(1080×1350) — 순위 Top5 + 시간대 그래프 */
  function summaryImage(s, nameOf) {
    var W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d'), F = 'system-ui,-apple-system,"Malgun Gothic",sans-serif';
    g.fillStyle = '#f2f9fc'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff'; roundRect(g, 50, 50, W - 100, H - 100, 36); g.fill();
    g.fillStyle = '#1a6491'; g.font = '800 30px ' + F; g.fillText('카카오톡 대화 분석', 100, 130);
    g.fillStyle = '#17283e'; g.font = '800 58px ' + F; g.fillText(num(s.total) + '개의 메시지', 100, 210);
    g.fillStyle = '#53697b'; g.font = '400 30px ' + F;
    g.fillText(fmtDate(s.first) + ' ~ ' + fmtDate(s.last) + ' · ' + s.people.length + '명', 100, 260);

    g.fillStyle = '#17283e'; g.font = '800 36px ' + F; g.fillText('💬 수다왕 TOP 5', 100, 350);
    var top = s.people.slice(0, 5), max = top.length ? top[0].count : 1;
    top.forEach(function (p, i) {
      var y = 400 + i * 96;
      g.fillStyle = '#17283e'; g.font = '700 32px ' + F;
      var nm = (i + 1) + '. ' + nameOf(p, i); if (nm.length > 16) nm = nm.slice(0, 15) + '…';
      g.fillText(nm, 100, y + 30);
      g.fillStyle = '#53697b'; g.font = '400 28px ' + F; g.textAlign = 'right';
      g.fillText(num(p.count) + '건 · ' + pct(p.count, s.total) + '%', W - 100, y + 30); g.textAlign = 'left';
      g.fillStyle = '#eef3f8'; roundRect(g, 100, y + 46, W - 200, 22, 11); g.fill();
      g.fillStyle = i === 0 ? '#f2a705' : '#1a6491'; roundRect(g, 100, y + 46, Math.max(22, (W - 200) * p.count / max), 22, 11); g.fill();
    });

    var by = 950, bh = 200, hmax = Math.max.apply(null, s.hours) || 1, peak = s.hours.indexOf(hmax);
    g.fillStyle = '#17283e'; g.font = '800 36px ' + F; g.fillText('⏰ ' + peak + '시에 가장 활발해요', 100, by - 30);
    var bw = (W - 200) / 24;
    s.hours.forEach(function (v, i) {
      var hh = bh * v / hmax;
      g.fillStyle = i === peak ? '#1a6491' : '#7fb3d3';
      g.fillRect(100 + i * bw + 3, by + bh - hh, bw - 6, hh);
      if (i % 3 === 0) { g.fillStyle = '#53697b'; g.font = '400 22px ' + F; g.textAlign = 'center'; g.fillText(String(i), 100 + i * bw + bw / 2, by + bh + 32); g.textAlign = 'left'; }
    });
    g.fillStyle = '#6b7f90'; g.font = '400 24px ' + F; g.textAlign = 'center';
    g.fillText('바로도구 카톡 대화 분석기 · barodogu.blogspot.com', W / 2, H - 90);
    return c;
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  /* 예시 대화(안드로이드 형식) — 실제 인물과 무관한 가상의 대화 */
  function sampleChat() {
    var names = ['민지', '도윤', '서연', '하준', '지우'];
    var lines = ['바로도구 독서모임 님과 카카오톡 대화', '저장한 날짜 : 2026년 10월 30일 오후 6:00', ''];
    var talk = ['오늘 모임 몇 시였죠?', '7시요 ㅋㅋ 늦지 마세요', '이번 책 진짜 재밌었어요', '사진', '저 아직 절반밖에 못 읽었어요 ㅠㅠ', '이모티콘',
      '주말에 같이 카페에서 읽어요', '좋아요 저도 갈게요', '다음 책은 뭐로 할까요?', 'https://example.com/book 이거 어때요', 'ㅋㅋㅋㅋ 완전 좋아요', '오늘도 수고하셨어요',
      '모임 장소 바뀌었나요?', '아니요 그대로예요', '책 진짜 두껍네요 ㅋㅋ', '이번 달 회비 보냈어요'];
    var weight = [5, 4, 3, 2, 1], seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var day = 0; day < 120; day++) {
      var dt = new Date(2026, 6, 1 + day);
      lines.push(dt.getFullYear() + '년 ' + (dt.getMonth() + 1) + '월 ' + dt.getDate() + '일 ' + DOW[dt.getDay()] + '요일');
      var n = Math.floor(rnd() * (dt.getDay() === 0 || dt.getDay() === 6 ? 20 : 8));
      var hBase = rnd() < 0.7 ? 21 : 12, todays = [];
      for (var k = 0; k < n; k++) {
        var r = rnd() * 15, who = 0; while (r > weight[who] && who < 4) { r -= weight[who]; who++; }
        todays.push({ min: Math.min(23, hBase + Math.floor(rnd() * 3)) * 60 + Math.floor(rnd() * 60), who: who, txt: talk[Math.floor(rnd() * talk.length)] });
      }
      todays.sort(function (a, b) { return a.min - b.min; });
      todays.forEach(function (e) {
        var hr = Math.floor(e.min / 60), ap = hr < 12 ? '오전' : '오후', h12 = hr % 12 === 0 ? 12 : hr % 12;
        lines.push(dt.getFullYear() + '년 ' + (dt.getMonth() + 1) + '월 ' + dt.getDate() + '일 ' + ap + ' ' + h12 + ':' + pad(e.min % 60) + ', ' + names[e.who] + ' : ' + e.txt);
      });
    }
    return lines.join('\n');
  }

  barodogu.kakaoChatAnalyzer = {
    version: CONFIG.VERSION,
    CONFIG: CONFIG,
    init: init,
    parse: parse,
    analyze: analyze,
    tokenize: tokenize,
    kindOf: kindOf,
    sampleChat: sampleChat
  };

  function auto() { if (document.getElementById(CONFIG.ROOT_ID)) init(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto, { once: true });
  else auto();
})(window, document);
