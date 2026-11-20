/*!
 * ============================================================
 * 모듈명   : barodogu.kakaoCoupleAnalyzer
 * 관리 ID  : BD102
 * 파일     : text/kakao-couple-analyzer.js
 * 저장소   : https://github.com/barodogu/tools
 * CDN      : https://cdn.jsdelivr.net/gh/barodogu/tools@main/text/kakao-couple-analyzer.js
 * 사용 블로그: https://barodogu.blogspot.com/
 * 용도     : 1:1 카톡 썸·커플 대화 분석기
 *            - 카카오톡 '대화 내보내기' 파일(TXT·CSV·ZIP)을 읽어 두 사람의 대화를 정리
 *            - 안드로이드·아이폰·PC 형식 자동 인식, 3인 이상 단톡방 파일은 안내 후 두 사람만 분석
 *            - 선톡 비율(4시간 이상 공백 뒤 먼저 말 건 사람), 답장 속도(중간값·평균),
 *              웃음·애정·물음표·사진·이모티콘 빈도, 시간대 분포, 최근 30일 대화 온도 변화
 *            - 요약 카드 이미지(PNG) 저장
 *            ※ 대화 내용은 서버로 전송하지 않고 사용자 브라우저 안에서만 처리
 *            ※ ZIP 파일은 JSZip 3.10.1(MIT)을 ZIP을 열 때만 jsDelivr에서 불러옴
 * 사용법   : 글에 <div id="barodogu-kakao-couple-analyzer"></div> 를 넣고
 *            이 파일을 <script src="…" defer></script> 로 불러오면 화면을 그립니다.
 * 버전     : 1.0.0
 * 최종수정 : 2026-11-20
 * ============================================================
 */
(function (window, document) {
  'use strict';

  var barodogu = window.barodogu = window.barodogu || {};

  /* ---------- 기준값: 이 객체만 수정하면 됩니다 ---------- */
  var CONFIG = {
    VERSION: '1.0.0',
    UPDATED: '2026-11-20',
    ROOT_ID: 'barodogu-kakao-couple-analyzer',
    MAX_FILE_MB: 300,        // 불러올 파일 최대 용량
    START_GAP_MIN: 240,      // 이 시간(분) 이상 조용하다가 처음 말한 사람 = '선톡' (4시간)
    REPLY_MAX_MIN: 720,      // 이 시간(분)을 넘긴 답장은 밤사이·연락 두절로 보고 제외 (12시간)
    TREND_DAYS: 30,          // 최근 N일 vs 그 이전 비교
    JSZIP_URL: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
    ACCEPT: '.txt,.csv,.zip,text/plain,text/csv,application/zip'
  };

  /* 하트·애정 표현 낱말(긴 것부터 세어 '좋아해'와 '좋아'를 겹쳐 세지 않음) */
  var AFFECTION = ['보고싶', '좋아해', '사랑해', '귀여', '예뻐', '이뻐', '고마워', '잘자', '뭐해',
    '심쿵', '설레', '두근', '안아', '뽀뽀', '자기야', '오빠', '데이트', '너무좋아', '사랑', '좋아'];
  AFFECTION.sort(function (a, b) { return b.length - a.length; });
  var AFF_RE = new RegExp(AFFECTION.join('|'), 'g');
  var HEART_RE = /[♥♡❤💕💖💗💓💘💙💚💛🧡💜🖤🤍🤎💝💞💟😍🥰😘😻🤗]/g;

  var DOW = ['일', '월', '화', '수', '목', '금', '토'];
  var EN_MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  var SLOTS = [
    { key: 'dawn', label: '새벽', range: '0~6시', from: 0, to: 5 },
    { key: 'morning', label: '오전', range: '6~12시', from: 6, to: 11 },
    { key: 'afternoon', label: '오후', range: '12~18시', from: 12, to: 17 },
    { key: 'night', label: '밤', range: '18~24시', from: 18, to: 23 }
  ];

  /* ====================== 파싱 ====================== */
  function to24(h, ampm) {
    h = +h;
    if (!ampm) return h;
    var pm = ampm === '오후' || /^pm$/i.test(ampm);
    if (pm && h < 12) return h + 12;
    if (!pm && h === 12) return 0;
    return h;
  }

  // 모바일(안드로이드·아이폰) 한국어: 2026년 11월 20일 오후 9:41, 이름 : 내용 / 2026. 11. 20. 오후 9:41, 이름 : 내용
  var RE_MOBILE = /^(\d{4})(?:년|\.)\s*(\d{1,2})(?:월|\.)\s*(\d{1,2})(?:일|\.)?\s*(오전|오후|AM|PM)?\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*(오전|오후|AM|PM)?,\s?(.*)$/i;
  // 모바일 영어: Nov 20, 2026, 9:41 PM, Name : msg
  var RE_MOBILE_EN = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),\s*(\d{4})(?:,|\s+at)\s+(\d{1,2}):(\d{2})\s*(AM|PM)?,?\s?(.*)$/i;
  // PC: [이름] [오후 9:41] 내용 / [Name] [9:41 PM] msg
  var RE_PC_MSG = /^\[(.+?)\]\s\[(?:(오전|오후)\s*)?(\d{1,2}):(\d{2})\s*(AM|PM)?\]\s?(.*)$/i;
  // PC 날짜 구분선: --------------- 2026년 11월 20일 금요일 ---------------
  var RE_PC_DATE = /^-{3,}\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일.*?-{3,}\s*$/;
  var RE_PC_DATE_EN = /^-{3,}\s*(?:[A-Za-z]+,\s*)?([A-Za-z]{3,9})\s+(\d{1,2}),\s*(\d{4})\s*-{3,}\s*$/;
  // 모바일 날짜 구분 줄(시간 없음): 2026년 11월 20일 금요일
  var RE_DAY_LINE = /^(\d{4})(?:년|\.)\s*(\d{1,2})(?:월|\.)\s*(\d{1,2})(?:일|\.)?\s*([월화수목금토일]요일)?\s*$/;
  var RE_SYS_LINE = /^.+님(이|을) .*(들어왔습니다|나갔습니다|초대했습니다|초대하였습니다|내보냈습니다)\.?$|^.+ (joined|left) this chatroom\.?$|^.+ invited .+\.$/;
  var RE_HEADER = /^(저장한 날짜|Date Saved|Saved on)\s*:|님과 카카오톡 대화$|Talk with .* in KakaoTalk$/i;
  var RE_ROOM_NAME = /^(.+?)\s*님과\s*카카오톡\s*대화\s*$/;

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
   * 결과: { messages:[{t:Date, name, text}], system:n, format:'android'|'ios'|'pc'|'pc-csv'|'en'|null, roomName }
   */
  function parse(text) {
    text = String(text || '').replace(/^\uFEFF/, '');
    var msgs = [], system = 0, format = null, roomName = '';

    // PC CSV
    var firstLine = text.slice(0, 200).split(/\r?\n/)[0];
    if (/^"?Date"?,"?User"?,"?Message"?/i.test(firstLine)) {
      var rows = csvRows(text);
      for (var r = 1; r < rows.length; r++) {
        var rw = rows[r];
        if (rw.length < 3) continue;
        var cm = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})/.exec(rw[0]);
        if (!cm) continue;
        msgs.push({ t: new Date(+cm[1], cm[2] - 1, +cm[3], +cm[4], +cm[5]), name: rw[1], text: rw.slice(2).join(',') });
      }
      return { messages: msgs, system: 0, format: 'pc-csv', roomName: '' };
    }

    var lines = text.split(/\r?\n/), last = null, day = null, i, ln, m2, sp, rn;
    for (i = 0; i < lines.length; i++) {
      ln = lines[i];
      if (!roomName && (rn = RE_ROOM_NAME.exec(ln))) roomName = rn[1].trim();
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
    return { messages: msgs, system: system, format: format, roomName: roomName };
  }

  /* ====================== 메시지 분류 ====================== */
  function kindOf(text) {
    var s = String(text).trim();
    if (/^사진( \d+장)?$|^Photo(s)?$|^\d+ photos?$/i.test(s)) return 'photo';
    if (/^동영상$|^Video$/i.test(s)) return 'video';
    if (/^이모티콘$|^Emoticons?$|^\(이모티콘\)$/i.test(s)) return 'emoticon';
    if (/^파일[:：]|^File[:：]/i.test(s)) return 'file';
    if (/^음성메시지$|^Voice message$/i.test(s)) return 'voice';
    if (/^삭제된 메시지입니다\.?$|^This message was deleted\.?$|^메시지가 삭제되었습니다\.?$/i.test(s)) return 'deleted';
    if (/^(보이스톡|페이스톡)/.test(s)) return 'call';
    return 'text';
  }

  /* ====================== 메시지 → 계산용 레코드 ====================== */
  function enrich(messages) {
    var recs = [], prev = null, i, m, r, gapMin;
    var sorted = messages.slice().sort(function (a, b) { return +a.t - +b.t; });
    for (i = 0; i < sorted.length; i++) {
      m = sorted[i];
      r = {
        t: +m.t, name: m.name, kind: kindOf(m.text), chars: 0,
        laugh: 0, heart: 0, aff: 0, q: 0, start: false, delay: null
      };
      if (prev) {
        gapMin = (r.t - prev.t) / 60000;
        if (gapMin >= CONFIG.START_GAP_MIN) r.start = true;
        if (prev.name !== r.name && gapMin >= 0 && gapMin <= CONFIG.REPLY_MAX_MIN) r.delay = gapMin;
      }
      if (r.kind === 'text') {
        var s = m.text;
        r.chars = s.replace(/\s/g, '').length;
        var lg = s.match(/[ㅋ]{2,}|[ㅎ]{2,}/g); if (lg) r.laugh = lg.length;
        var hp = s.match(HEART_RE); if (hp) r.heart = hp.length;
        var af = s.match(AFF_RE); if (af) r.aff = af.length;
        var qm = s.match(/\?/g); if (qm) r.q = qm.length;
      }
      recs.push(r);
      prev = r;
    }
    return recs;
  }

  function median(arr) {
    if (!arr || !arr.length) return null;
    var a = arr.slice().sort(function (x, y) { return x - y; });
    var mid = Math.floor(a.length / 2);
    return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
  }
  function avg(arr) {
    if (!arr || !arr.length) return null;
    var s = 0; for (var i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }
  function dayKey(d) { var x = new Date(d); return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  /* 한 구간의 지표 묶음 */
  function windowStats(recs, me, other) {
    var o = {
      total: 0, me: 0, other: 0, hours: new Array(24).fill(0),
      slots: { dawn: 0, morning: 0, afternoon: 0, night: 0 },
      startMe: 0, startOther: 0,
      delayMe: [], delayOther: [],
      laugh: 0, heart: 0, aff: 0, q: 0, photo: 0, video: 0, emoticon: 0, first: null, last: null
    };
    var i, r, label, d;
    for (i = 0; i < recs.length; i++) {
      r = recs[i];
      o.total++;
      if (r.name === me) o.me++; else if (r.name === other) o.other++; else continue;
      if (o.first === null || r.t < o.first) o.first = r.t;
      if (o.last === null || r.t > o.last) o.last = r.t;
      d = new Date(r.t);
      o.hours[d.getHours()]++;
      o.slots[slotKey(d.getHours())]++;
      if (r.start) { if (r.name === me) o.startMe++; else o.startOther++; }
      if (r.delay !== null) { if (r.name === me) o.delayMe.push(r.delay); else o.delayOther.push(r.delay); }
      o.laugh += r.laugh; o.heart += r.heart; o.aff += r.aff; o.q += r.q;
      if (r.kind === 'photo') o.photo++;
      else if (r.kind === 'video') o.video++;
      else if (r.kind === 'emoticon') o.emoticon++;
    }
    return o;
  }
  function slotKey(h) {
    if (h <= 5) return 'dawn';
    if (h <= 11) return 'morning';
    if (h <= 17) return 'afternoon';
    return 'night';
  }

  function startShare(o) {
    var s = o.startMe + o.startOther;
    return s ? o.startMe / s : 0.5;
  }
  function replyMid(o) {
    var a = median(o.delayMe), b = median(o.delayOther);
    if (a === null && b === null) return null;
    if (a === null) return b;
    if (b === null) return a;
    return (a + b) / 2;
  }
  /* 재미로 보는 대화 온도(0~100) — 답장 속도·선톡 균형·웃음·애정 표현·하루 대화량을 섞은 값 */
  function tempIndex(o, days) {
    var perDay = o.total / Math.max(1, days);
    var mid = replyMid(o);
    var reply = mid === null ? 0.45 : 1 - Math.min(mid, 180) / 180;
    var balance = 1 - Math.abs(startShare(o) - 0.5) * 2;
    var laugh = Math.min((o.laugh / Math.max(1, o.total)) / 0.6, 1);
    var aff = Math.min(((o.heart + o.aff) / Math.max(1, o.total) * 100) / 4, 1);
    var vol = Math.min(perDay / 35, 1);
    var v = 100 * (0.28 * reply + 0.18 * balance + 0.22 * laugh + 0.16 * aff + 0.16 * vol);
    return Math.max(0, Math.min(100, Math.round(v)));
  }

  /**
   * 분석
   * opt.me : '나'로 볼 이름(없으면 자동 추정)
   * opt.roomName : 내보내기 파일의 대화방 이름(1:1이면 상대 이름)
   */
  function analyze(messages, opt) {
    opt = opt || {};
    var recs = enrich(messages);
    if (!recs.length) return null;

    /* 이름별 메시지 수 */
    var byName = {}, order = [];
    recs.forEach(function (r) {
      if (!byName[r.name]) { byName[r.name] = 0; order.push(r.name); }
      byName[r.name]++;
    });
    var names = order.slice().sort(function (a, b) { return byName[b] - byName[a] || (a < b ? -1 : 1); });

    /* '나' 정하기: 지정 → 대화방 이름의 반대편 → 가장 많이 말한 사람 */
    var me = opt.me && byName[opt.me] ? opt.me : null;
    if (!me && opt.roomName && byName[opt.roomName] && names.length > 1) {
      me = names.filter(function (n) { return n !== opt.roomName; })[0] || names[0];
    }
    if (!me) me = names[0];
    var other = names.filter(function (n) { return n !== me; })[0] || null;

    /* 두 사람만 남기기 */
    var pair = recs.filter(function (r) { return r.name === me || r.name === other; });
    var excluded = recs.length - pair.length;

    var all = windowStats(pair, me, other);
    var days = all.first ? Math.floor((new Date(all.last).setHours(0, 0, 0, 0) - new Date(all.first).setHours(0, 0, 0, 0)) / 864e5) + 1 : 1;

    /* 대화한 날 */
    var dayMap = {};
    pair.forEach(function (r) { dayMap[dayKey(r.t)] = 1; });
    var activeDays = Object.keys(dayMap).length;

    /* 최근 30일 vs 이전 */
    var cut = new Date(all.last);
    cut.setHours(0, 0, 0, 0);
    cut.setDate(cut.getDate() - (CONFIG.TREND_DAYS - 1));
    var cutT = +cut;
    var recentRecs = pair.filter(function (r) { return r.t >= cutT; });
    var prevRecs = pair.filter(function (r) { return r.t < cutT; });
    var recentDays = Math.min(CONFIG.TREND_DAYS, days);
    var prevDays = Math.max(0, days - recentDays);
    var recent = windowStats(recentRecs, me, other);
    var prev = windowStats(prevRecs, me, other);

    /* 사람별 세부 */
    function person(name) {
      var mine = pair.filter(function (r) { return r.name === name; });
      var textRecs = mine.filter(function (r) { return r.kind === 'text'; });
      var chars = 0; textRecs.forEach(function (r) { chars += r.chars; });
      var p = {
        name: name, count: mine.length,
        share: all.total ? mine.length / all.total : 0,
        chars: chars, textCount: textRecs.length,
        avgChars: textRecs.length ? chars / textRecs.length : 0,
        photo: 0, video: 0, emoticon: 0, laugh: 0, heart: 0, aff: 0, q: 0,
        starts: name === me ? all.startMe : all.startOther,
        delays: name === me ? all.delayMe : all.delayOther
      };
      mine.forEach(function (r) {
        if (r.kind === 'photo') p.photo++;
        else if (r.kind === 'video') p.video++;
        else if (r.kind === 'emoticon') p.emoticon++;
        p.laugh += r.laugh; p.heart += r.heart; p.aff += r.aff; p.q += r.q;
      });
      p.replyMedian = median(p.delays);
      p.replyMean = avg(p.delays);
      p.replyFastest = p.delays.length ? Math.min.apply(null, p.delays) : null;
      p.replyCount = p.delays.length;
      return p;
    }
    var personMe = person(me);
    var personOther = other ? person(other) : null;

    return {
      me: me, other: other, names: names, counts: byName,
      total: all.total, excluded: excluded, activeDays: activeDays, dayCount: days,
      first: all.first ? new Date(all.first) : null,
      last: all.last ? new Date(all.last) : null,
      hours: all.hours, slots: all.slots,
      kinds: { photo: all.photo, video: all.video, emoticon: all.emoticon },
      laugh: all.laugh, heart: all.heart, aff: all.aff, q: all.q,
      startMe: all.startMe, startOther: all.startOther,
      personMe: personMe, personOther: personOther,
      temp: tempIndex(all, days),
      trend: {
        days: recentDays,
        prevDays: prevDays,
        has: recent.total > 0 && prev.total > 0,
        recent: { total: recent.total, perDay: recent.total / Math.max(1, recentDays), startShare: startShare(recent), replyMid: replyMid(recent), laugh: recent.laugh, heart: recent.heart + recent.aff, temp: tempIndex(recent, recentDays) },
        prev: { total: prev.total, perDay: prev.total / Math.max(1, prevDays), startShare: startShare(prev), replyMid: replyMid(prev), laugh: prev.laugh, heart: prev.heart + prev.aff, temp: tempIndex(prev, prevDays) }
      }
    };
  }

  /* ====================== 화면 ====================== */
  var CSS = [
    '#R{box-sizing:border-box;max-width:900px;margin:24px auto;color:#2a1b23;font:16px/1.65 system-ui,-apple-system,"Malgun Gothic",sans-serif;overflow-wrap:anywhere;text-align:left;}',
    '#R *{box-sizing:border-box;}',
    '#R .bdcc-card{border:1px solid #f0dde4;border-radius:18px;background:#fff;padding:clamp(14px,3vw,28px);}',
    '#R .bdcc-kicker{margin:0;color:#c2496f;font-size:13px;font-weight:800;letter-spacing:.06em;}',
    '#R .bdcc-title{margin:6px 0 10px;color:#2a1b23;font-size:clamp(22px,4vw,30px);line-height:1.3;border:0;padding:0;}',
    '#R .bdcc-lead{margin:0 0 18px;}',
    '#R .bdcc-drop{border:2px dashed #e3a9bd;border-radius:14px;background:#fdf5f8;padding:22px 14px;text-align:center;transition:background .15s;}',
    '#R .bdcc-drop.is-over{background:#fbe7ee;}',
    '#R .bdcc-drop strong{display:block;font-size:18px;}',
    '#R .bdcc-filebtn{display:inline-flex;align-items:center;justify-content:center;margin-top:12px;min-height:44px;padding:9px 18px;border-radius:10px;background:#c2496f;color:#fff;font-weight:700;cursor:pointer;}',
    '#R .bdcc-filebtn:focus-within{outline:3px solid #f2b705;outline-offset:2px;}',
    '#R .bdcc-file{position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;}',
    '#R .bdcc-small{font-size:13px;color:#7a6670;margin:8px 0 0;}',
    '#R .bdcc-link{background:none;border:0;padding:0;color:#b13a60;text-decoration:underline;font:inherit;cursor:pointer;}',
    '#R .bdcc-btn{font:inherit;min-height:44px;border:1px solid #e0c8d1;border-radius:10px;padding:8px 14px;background:#fff;color:#2a1b23;cursor:pointer;}',
    '#R .bdcc-btn:hover{background:#fdf5f8;}',
    '#R .bdcc-btn:focus-visible,#R .bdcc-link:focus-visible{outline:3px solid #f2b705;outline-offset:2px;}',
    '#R .bdcc-btn.is-primary{background:#c2496f;border-color:#c2496f;color:#fff;font-weight:700;}',
    '#R .bdcc-paste{display:none;margin-top:12px;}',
    '#R .bdcc-paste textarea{width:100%;min-height:140px;font:14px/1.5 ui-monospace,Consolas,monospace;border:1px solid #e0c8d1;border-radius:10px;padding:10px;}',
    '#R .bdcc-work{display:none;margin-top:18px;}',
    '#R .bdcc-bar{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;margin-bottom:6px;font-size:14px;}',
    '#R .bdcc-bar select{font:inherit;min-height:40px;border:1px solid #e0c8d1;border-radius:9px;padding:6px 10px;background:#fff;color:#2a1b23;max-width:220px;}',
    '#R .bdcc-bar label{display:inline-flex;gap:6px;align-items:center;}',
    '#R .bdcc-sum{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin:14px 0 4px;}',
    '#R .bdcc-stat{border:1px solid #f0dde4;border-radius:12px;background:#fdf9fa;padding:10px 12px;}',
    '#R .bdcc-stat b{display:block;font-size:22px;line-height:1.3;color:#2a1b23;}',
    '#R .bdcc-stat span{font-size:13px;color:#7a6670;}',
    '#R .bdcc-sec{margin-top:26px;}',
    '#R .bdcc-h3{margin:0 0 4px;font-size:18px;color:#2a1b23;border:0;padding:0;}',
    '#R .bdcc-note{margin:0 0 10px;font-size:13px;color:#7a6670;}',
    '#R .bdcc-tblwrap{overflow-x:auto;}',
    '#R .bdcc-tbl{width:100%;border-collapse:collapse;font-size:14px;}',
    '#R .bdcc-tbl th,#R .bdcc-tbl td{border:1px solid #f0dde4;padding:8px;text-align:left;vertical-align:top;}',
    '#R .bdcc-tbl th{background:#fdf5f8;font-weight:700;}',
    '#R .bdcc-tbl td.num{text-align:right;white-space:nowrap;}',
    '#R .bdcc-tbl tr.is-me td:first-child{color:#2a1b23;}',
    '#R .bdcc-duo{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:8px 0 0;}',
    '@media (max-width:480px){#R .bdcc-duo{grid-template-columns:1fr;}}',
    '#R .bdcc-box{border:none;border-radius:12px;padding:12px 14px;}',
    '#R .bdcc-box.is-me{background:#fdf1f5;}',
    '#R .bdcc-box.is-other{background:#f2f7fb;}',
    '#R .bdcc-box h4{margin:0 0 6px;font-size:15px;color:#2a1b23;}',
    '#R .bdcc-box p{margin:0;font-size:14px;color:#5b4a52;}',
    '#R .bdcc-box b{font-size:19px;color:#2a1b23;}',
    '#R .bdcc-splithead{display:flex;justify-content:space-between;gap:10px;font-size:13.5px;color:#5b4a52;margin:2px 0 0;}',
    '#R .bdcc-splithead span:last-child{text-align:right;}',
    '#R .bdcc-split{display:flex;height:26px;border-radius:8px;overflow:hidden;border:1px solid #f0dde4;margin:4px 0 4px;}',
    '#R .bdcc-split i{display:block;height:100%;}',
    '#R .bdcc-split i.is-me{background:#c2496f;}',
    '#R .bdcc-split i.is-other{background:#4b86ad;}',
    '#R .bdcc-legend{display:flex;gap:14px;font-size:13px;color:#5b4a52;flex-wrap:wrap;}',
    '#R .bdcc-legend em{font-style:normal;display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;}',
    '#R .bdcc-bars{margin:6px 0 0;}',
    '#R .bdcc-row{margin:0 0 9px;}',
    '#R .bdcc-rowh{display:flex;justify-content:space-between;gap:8px;font-size:14px;}',
    '#R .bdcc-rowh span{color:#5b4a52;}',
    '#R .bdcc-track{height:12px;border-radius:6px;background:#f6eef1;overflow:hidden;margin:3px 0 0;}',
    '#R .bdcc-track + .bdcc-track{margin-top:4px;}',
    '#R .bdcc-fill{height:100%;border-radius:6px;background:#c2496f;}',
    '#R .bdcc-fill.is-other{background:#4b86ad;}',
    '#R .bdcc-cols{display:flex;align-items:flex-end;gap:2px;height:120px;padding:0 2px;border-bottom:1px solid #e0c8d1;}',
    '#R .bdcc-col{flex:1;min-width:0;background:#e0a4b9;border-radius:3px 3px 0 0;position:relative;}',
    '#R .bdcc-col.is-max{background:#c2496f;}',
    '#R .bdcc-axis{display:flex;gap:2px;padding:0 2px;font-size:11px;color:#7a6670;}',
    '#R .bdcc-axis span{flex:1;min-width:0;text-align:center;}',
    '#R .bdcc-slots{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0 0;}',
    '#R .bdcc-slot{border:1px solid #f0dde4;border-radius:10px;padding:8px 10px;background:#fdf9fa;}',
    '#R .bdcc-slot b{display:block;font-size:18px;}',
    '#R .bdcc-slot span{font-size:12.5px;color:#7a6670;}',
    '#R .bdcc-temp{display:flex;align-items:center;gap:14px;flex-wrap:wrap;border:1px solid #f0dde4;border-radius:14px;background:#fdf5f8;padding:14px 16px;}',
    '#R .bdcc-temp b{font-size:34px;line-height:1;color:#c2496f;}',
    '#R .bdcc-temp em{font-style:normal;font-size:14px;color:#5b4a52;}',
    '#R .bdcc-move{font-size:14px;}',
    '#R .bdcc-up{color:#c2496f;font-weight:700;}',
    '#R .bdcc-down{color:#4b86ad;font-weight:700;}',
    '#R .bdcc-flat{color:#7a6670;}',
    '#R .bdcc-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px;}',
    '#R .bdcc-msg{min-height:1.6em;margin:14px 0 0;padding:10px 12px;border-radius:10px;background:#f8f4f6;font-size:14px;white-space:pre-line;}',
    '#R .bdcc-msg:empty{display:none;}',
    '#R .bdcc-msg.is-error{background:#fff3df;}',
    '#R .bdcc-msg.is-ok{background:#edf8f1;}',
    '#R .bdcc-foot{margin:16px 0 0;font-size:12px;color:#8b7982;}'
  ].join('\n');

  function h(tag, attrs, html) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) el.setAttribute(k, attrs[k]);
    if (html !== undefined) el.innerHTML = html;
    return el;
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n) { return Number(n).toLocaleString('ko-KR'); }
  function pct(a, b) { return b ? Math.round(a / b * 1000) / 10 : 0; }
  function fmtDate(t) { var d = new Date(t); return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()); }
  function fmtMin(v) {
    if (v === null || v === undefined || isNaN(v)) return '-';
    if (v < 1) return '1분 이내';
    if (v < 60) return Math.round(v) + '분';
    var hh = Math.floor(v / 60), mm = Math.round(v % 60);
    return hh + '시간' + (mm ? ' ' + mm + '분' : '');
  }
  function arrow(delta, unit) {
    if (delta === null || delta === undefined || isNaN(delta)) return '<span class="bdcc-flat">-</span>';
    if (Math.abs(delta) < 0.05) return '<span class="bdcc-flat">변화 없음</span>';
    return delta > 0 ? '<span class="bdcc-up">▲ ' + delta.toFixed(1) + unit + '</span>'
      : '<span class="bdcc-down">▼ ' + Math.abs(delta).toFixed(1) + unit + '</span>';
  }

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
    style.id = 'bdcc-style';
    style.textContent = CSS.replace(/#R/g, '#' + CONFIG.ROOT_ID);
    document.head.appendChild(style);

    root.innerHTML = '';
    var card = h('div', { 'class': 'bdcc-card' });
    card.innerHTML =
      '<p class="bdcc-kicker">착착도구 · 1:1 카톡 썸·커플 대화 분석기</p>' +
      '<h2 class="bdcc-title">1:1 카톡 썸·커플 대화 분석기</h2>' +
      '<p class="bdcc-lead">카카오톡 대화를 내보내서 올리면 <b>누가 먼저 말을 거는지(선톡)</b>, <b>답장은 얼마나 빨리 오는지</b>, <b>요즘 대화 온도가 오르는지</b>를 숫자로 정리해 드립니다. <b>대화 내용은 서버로 전송되지 않고 이 브라우저 안에서만 분석합니다.</b></p>' +
      '<div class="bdcc-drop" data-el="drop"><strong>대화 파일을 여기에 끌어다 놓으세요</strong>' +
      '<span>카카오톡에서 내보낸 TXT · CSV · ZIP (안드로이드·아이폰·PC)</span><br>' +
      '<label class="bdcc-filebtn">파일 선택<input class="bdcc-file" type="file" data-el="file" accept="' + CONFIG.ACCEPT + '"></label>' +
      '<p class="bdcc-small">파일이 없나요? <button type="button" class="bdcc-link" data-el="pastebtn">대화 내용 직접 붙여 넣기</button> · <button type="button" class="bdcc-link" data-el="sample">썸 샘플 데이터로 체험하기</button></p></div>' +
      '<div class="bdcc-paste" data-el="paste"><textarea data-el="pastearea" aria-label="대화 내용 붙여 넣기" placeholder="내보낸 대화 내용을 그대로 붙여 넣으세요"></textarea>' +
      '<div class="bdcc-actions" style="margin-top:8px"><button type="button" class="bdcc-btn is-primary" data-el="pasterun">분석하기</button></div></div>' +
      '<div class="bdcc-msg" data-el="msg" role="status" aria-live="polite"></div>' +
      '<div class="bdcc-work" data-el="work">' +
      '<div class="bdcc-bar"><label>내 이름 <select data-el="me" aria-label="나로 볼 이름"></select></label>' +
      '<label><input type="checkbox" data-el="anon"> 이름 가리기</label></div>' +
      '<div data-el="out"></div>' +
      '<div class="bdcc-actions"><button type="button" class="bdcc-btn is-primary" data-el="png">요약 카드 이미지 저장</button>' +
      '<button type="button" class="bdcc-btn" data-el="reset">다른 대화 분석</button></div></div>' +
      '<p class="bdcc-foot">착착도구 1:1 카톡 썸·커플 대화 분석기 v' + CONFIG.VERSION + ' · 재미로 보는 지표입니다 · 분석 결과는 새로고침하면 사라집니다.</p>';
    root.appendChild(card);

    var el = {};
    Array.prototype.forEach.call(card.querySelectorAll('[data-el]'), function (n) { el[n.getAttribute('data-el')] = n; });

    var parsed = null, stats = null, fileLabel = '', api = null;

    function msg(t, type) { el.msg.textContent = t || ''; el.msg.className = 'bdcc-msg' + (type ? ' is-' + type : ''); }

    function meLabel() { return el.anon.checked ? '나' : stats.me; }
    function otherLabel() { return el.anon.checked ? '상대' : (stats.other || '상대'); }

    function stat(v, l) { return '<div class="bdcc-stat"><b>' + v + '</b><span>' + l + '</span></div>'; }

    function colChart(values, labels, labelEvery) {
      var max = Math.max.apply(null, values) || 1;
      var html = '<div class="bdcc-cols" role="img" aria-label="' + esc(labels.map(function (l, i) { return l + ' ' + values[i] + '건'; }).join(', ')) + '">';
      values.forEach(function (v, i) {
        html += '<div class="bdcc-col' + (v === max && v > 0 ? ' is-max' : '') + '" style="height:' + (v / max * 100).toFixed(1) + '%" title="' + esc(labels[i] + ': ' + num(v) + '건') + '"></div>';
      });
      html += '</div><div class="bdcc-axis">';
      labels.forEach(function (l, i) { html += '<span>' + (i % (labelEvery || 1) === 0 ? esc(l) : '') + '</span>'; });
      return html + '</div>';
    }

    function barRow(label, mine, theirs, fmt) {
      var max = Math.max(mine, theirs, 1), f = fmt || function (v) { return num(v); };
      return '<div class="bdcc-row"><div class="bdcc-rowh"><b>' + esc(label) + '</b><span>' + esc(meLabel()) + ' ' + f(mine) + ' · ' + esc(otherLabel()) + ' ' + f(theirs) + '</span></div>' +
        '<div class="bdcc-track"><div class="bdcc-fill" style="width:' + (mine / max * 100).toFixed(1) + '%"></div></div>' +
        '<div class="bdcc-track"><div class="bdcc-fill is-other" style="width:' + (theirs / max * 100).toFixed(1) + '%"></div></div></div>';
    }

    /* ---------- 결과 그리기 ---------- */
    function render() {
      stats = analyze(parsed.messages, { me: el.me.value, roomName: parsed.roomName });
      if (!stats) { el.out.innerHTML = '<p class="bdcc-note">분석할 메시지가 없습니다.</p>'; return; }
      var s = stats, pm = s.personMe, po = s.personOther, out = '';
      if (!po) {
        el.out.innerHTML = '<p class="bdcc-note">한 사람의 메시지만 보여 1:1 분석을 할 수 없습니다. 두 사람이 대화한 파일을 올려 주세요.</p>';
        return;
      }

      /* 요약 */
      var peak = peakOf(s.hours);
      out += '<div class="bdcc-sum">' +
        stat(num(s.total), '총 메시지(두 사람)') +
        stat(num(s.dayCount) + '일', fmtDate(s.first) + ' ~ ' + fmtDate(s.last)) +
        stat(num(Math.round(s.total / Math.max(1, s.activeDays))), '대화한 날 평균 메시지') +
        stat(peak + '시', '가장 활발한 시간') +
        stat(s.temp + '°', '재미로 보는 대화 온도') +
        '</div>' +
        '<p class="bdcc-note">' + esc(fileLabel) + (s.excluded ? ' · 두 사람 외 ' + num(s.excluded) + '건 제외' : '') + ' · 대화한 날 ' + num(s.activeDays) + '일</p>';

      /* 누가 먼저? */
      var st = s.startMe + s.startOther;
      out += '<section class="bdcc-sec"><h3 class="bdcc-h3">💌 선톡 비율 — 누가 먼저 말을 거나</h3>' +
        '<p class="bdcc-note">' + (CONFIG.START_GAP_MIN / 60) + '시간 이상 대화가 끊긴 뒤 처음 말을 건 횟수입니다. 하루의 첫 메시지도 선톡으로 셉니다.</p>' +
        '<div class="bdcc-splithead"><span>' + esc(meLabel()) + ' ' + pct(s.startMe, st) + '%</span><span>' + esc(otherLabel()) + ' ' + pct(s.startOther, st) + '%</span></div>' +
        '<div class="bdcc-split" role="img" aria-label="선톡 ' + meLabel() + ' ' + pct(s.startMe, st) + '퍼센트, ' + otherLabel() + ' ' + pct(s.startOther, st) + '퍼센트">' +
        '<i class="is-me" style="width:' + pct(s.startMe, st) + '%"></i>' +
        '<i class="is-other" style="width:' + pct(s.startOther, st) + '%"></i></div>' +
        '<div class="bdcc-legend"><span><em style="background:#c2496f"></em>' + esc(meLabel()) + ' ' + num(s.startMe) + '번</span>' +
        '<span><em style="background:#4b86ad"></em>' + esc(otherLabel()) + ' ' + num(s.startOther) + '번</span></div>' +
        '<p class="bdcc-note" style="margin-top:8px">' + startComment(s) + '</p></section>';

      /* 답장 속도 */
      out += '<section class="bdcc-sec"><h3 class="bdcc-h3">⏱️ 답장 속도</h3>' +
        '<p class="bdcc-note">상대 메시지 뒤에 보낸 첫 답장까지 걸린 시간입니다. ' + (CONFIG.REPLY_MAX_MIN / 60) + '시간을 넘긴 답장(밤사이·연락 두절)은 빼고 계산했습니다.</p>' +
        '<div class="bdcc-duo">' +
        '<div class="bdcc-box is-me"><h4>' + esc(meLabel()) + ' 답장</h4><p><b>' + fmtMin(pm.replyMedian) + '</b> (중간값)<br>평균 ' + fmtMin(pm.replyMean) + ' · 가장 빠른 답장 ' + fmtMin(pm.replyFastest) + '<br><span style="color:#7a6670">답장 ' + num(pm.replyCount) + '번 기준</span></p></div>' +
        '<div class="bdcc-box is-other"><h4>' + esc(otherLabel()) + ' 답장</h4><p><b>' + fmtMin(po.replyMedian) + '</b> (중간값)<br>평균 ' + fmtMin(po.replyMean) + ' · 가장 빠른 답장 ' + fmtMin(po.replyFastest) + '<br><span style="color:#7a6670">답장 ' + num(po.replyCount) + '번 기준</span></p></div>' +
        '</div></section>';

      /* 말 버릇·표현 */
      out += '<section class="bdcc-sec"><h3 class="bdcc-h3">😊 표현 빈도 비교</h3>' +
        '<p class="bdcc-note">웃음은 ㅋㅋ·ㅎㅎ가 두 글자 이상 이어진 횟수, 애정 표현은 하트·이모지와 ‘사랑해·보고싶·고마워’ 같은 낱말을 합해 셉니다. 막대는 위가 ' + esc(meLabel()) + ', 아래가 ' + esc(otherLabel()) + '입니다.</p>' +
        '<div class="bdcc-bars">' +
        barRow('웃음 ㅋㅋ·ㅎㅎ', pm.laugh, po.laugh) +
        barRow('하트·애정 표현', pm.heart + pm.aff, po.heart + po.aff) +
        barRow('물음표 ?', pm.q, po.q) +
        barRow('이모티콘', pm.emoticon, po.emoticon) +
        barRow('사진·동영상', pm.photo + pm.video, po.photo + po.video) +
        '</div>' +
        '<p class="bdcc-note">메시지 100개당으로 보면 — ' + esc(meLabel()) + ' 웃음 ' + per100(pm.laugh, pm.count) + '회 · ' + esc(otherLabel()) + ' 웃음 ' + per100(po.laugh, po.count) + '회</p></section>';

      /* 기본 비교표 */
      out += '<section class="bdcc-sec"><h3 class="bdcc-h3">📊 두 사람 비교</h3><div class="bdcc-tblwrap"><table class="bdcc-tbl"><thead><tr><th scope="col">항목</th><th scope="col">' + esc(meLabel()) + '</th><th scope="col">' + esc(otherLabel()) + '</th></tr></thead><tbody>' +
        '<tr><td>메시지 수</td><td class="num">' + num(pm.count) + '건 (' + pct(pm.count, s.total) + '%)</td><td class="num">' + num(po.count) + '건 (' + pct(po.count, s.total) + '%)</td></tr>' +
        '<tr><td>평균 글자 수</td><td class="num">' + (Math.round(pm.avgChars * 10) / 10) + '자</td><td class="num">' + (Math.round(po.avgChars * 10) / 10) + '자</td></tr>' +
        '<tr><td>선톡 횟수</td><td class="num">' + num(s.startMe) + '번 (' + pct(s.startMe, st) + '%)</td><td class="num">' + num(s.startOther) + '번 (' + pct(s.startOther, st) + '%)</td></tr>' +
        '<tr><td>답장 중간값</td><td class="num">' + fmtMin(pm.replyMedian) + '</td><td class="num">' + fmtMin(po.replyMedian) + '</td></tr>' +
        '<tr><td>하루 평균</td><td class="num">' + (pm.count / Math.max(1, s.activeDays)).toFixed(1) + '건</td><td class="num">' + (po.count / Math.max(1, s.activeDays)).toFixed(1) + '건</td></tr>' +
        '</tbody></table></div></section>';

      /* 시간대 */
      var hl = []; for (var i = 0; i < 24; i++) hl.push(String(i));
      out += '<section class="bdcc-sec"><h3 class="bdcc-h3">🕰️ 시간대별 대화</h3><p class="bdcc-note">두 사람 메시지를 시간대별로 나눈 비율입니다.</p>' +
        '<div class="bdcc-slots">' + SLOTS.map(function (x) {
          return '<div class="bdcc-slot"><b>' + x.label + ' ' + pct(s.slots[x.key], s.total) + '%</b><span>' + x.range + ' · ' + num(s.slots[x.key]) + '건</span></div>';
        }).join('') + '</div>' +
        '<div style="margin-top:14px">' + colChart(s.hours, hl, 3) + '</div></section>';

      /* 최근 30일 vs 이전 */
      if (s.trend.has) {
        var r = s.trend.recent, p0 = s.trend.prev;
        out += '<section class="bdcc-sec"><h3 class="bdcc-h3">🌡️ 최근 30일 vs 그 이전</h3>' +
          '<p class="bdcc-note">마지막 대화일부터 30일을 ‘최근’, 그 앞을 ‘이전’으로 나눠 비교했습니다. (이전 ' + num(s.trend.prevDays) + '일 기준)</p>' +
          '<div class="bdcc-temp"><b>' + r.temp + '°</b><em>최근 30일 대화 온도<br>' + (r.temp === p0.temp ? '이전과 같아요' : (r.temp > p0.temp ? '이전보다 올랐어요' : '이전보다 조금 내려갔어요')) + '</em></div>' +
          '<div class="bdcc-tblwrap" style="margin-top:12px"><table class="bdcc-tbl"><thead><tr><th scope="col">지표</th><th scope="col">이전 → 최근 30일</th><th scope="col">변화</th></tr></thead><tbody>' +
          '<tr><td>하루 평균</td><td class="num">' + p0.perDay.toFixed(1) + ' → ' + r.perDay.toFixed(1) + '건</td><td>' + arrow(r.perDay - p0.perDay, '건') + '</td></tr>' +
          '<tr><td>답장 중간값</td><td class="num">' + fmtMin(p0.replyMid) + ' → ' + fmtMin(r.replyMid) + '</td><td>' + (p0.replyMid === null || r.replyMid === null ? '<span class="bdcc-flat">-</span>' : (r.replyMid < p0.replyMid ? '<span class="bdcc-up">▲ ' + Math.abs(Math.round(p0.replyMid - r.replyMid)) + '분↑</span>' : (r.replyMid > p0.replyMid ? '<span class="bdcc-down">▼ ' + Math.abs(Math.round(r.replyMid - p0.replyMid)) + '분↓</span>' : '<span class="bdcc-flat">변화 없음</span>'))) + '</td></tr>' +
          '<tr><td>선톡 비율(나)</td><td class="num">' + Math.round(p0.startShare * 100) + '% → ' + Math.round(r.startShare * 100) + '%</td><td>' + arrow((r.startShare - p0.startShare) * 100, '%p') + '</td></tr>' +
          '<tr><td>웃음</td><td class="num">' + num(p0.laugh) + ' → ' + num(r.laugh) + '회</td><td>' + arrow((r.laugh / Math.max(1, r.total) - p0.laugh / Math.max(1, p0.total)) * 100, '회/100') + '</td></tr>' +
          '<tr><td>하트·애정</td><td class="num">' + num(p0.heart) + ' → ' + num(r.heart) + '회</td><td>' + arrow((r.heart / Math.max(1, r.total) - p0.heart / Math.max(1, p0.total)) * 100, '회/100') + '</td></tr>' +
          '</tbody></table></div>' +
          '<p class="bdcc-note" style="margin-top:8px">대화 온도 = 답장 속도·선톡 균형·웃음·애정 표현·하루 대화량을 0~100으로 섞은 재미용 지표입니다. 사람 사이를 판정하는 값이 아니에요.</p></section>';
      } else {
        out += '<section class="bdcc-sec"><h3 class="bdcc-h3">🌡️ 대화 온도</h3><div class="bdcc-temp"><b>' + s.temp + '°</b><em>재미로 보는 대화 온도<br>최근 30일과 비교하려면 30일이 넘는 대화가 필요해요</em></div></section>';
      }

      /* 짧은 해석 */
      out += '<section class="bdcc-sec"><h3 class="bdcc-h3">📝 한 줄 요약</h3><ul style="margin:0;padding-left:20px"><li>' + startComment(s) + '</li><li>' + replyComment(s) + '</li>' + (s.trend.has ? '<li>' + trendComment(s) + '</li>' : '') + '<li>' + timeComment(s) + '</li></ul>' +
        '<p class="bdcc-note" style="margin-top:10px">숫자는 대화 습관을 보여 줄 뿐, 마음을 대신하지는 않습니다. 재미로만 봐 주세요.</p></section>';

      el.out.innerHTML = out;
    }

    function peakOf(hours) {
      var max = 0, idx = 0;
      for (var i = 0; i < 24; i++) if (hours[i] > max) { max = hours[i]; idx = i; }
      return idx;
    }
    function per100(v, n) { return n ? (v / n * 100).toFixed(1) : '0.0'; }
    function startComment(s) {
      var st = s.startMe + s.startOther;
      if (!st) return '선톡을 셀 만큼 대화가 길지 않습니다.';
      var a = pct(s.startMe, st), b = pct(s.startOther, st);
      if (Math.abs(a - b) < 8) return '선톡이 ' + a + '% : ' + b + '%로 거의 반반입니다. 서로 비슷하게 먼저 말을 거는 사이예요.';
      return s.startMe > s.startOther
        ? '선톡은 ' + esc(meLabel()) + ' ' + a + '% · ' + esc(otherLabel()) + ' ' + b + '%로, 내가 먼저 말을 거는 쪽이 조금 더 많습니다.'
        : '선톡은 ' + esc(otherLabel()) + ' ' + b + '% · ' + esc(meLabel()) + ' ' + a + '%로, 상대가 먼저 말을 거는 쪽이 조금 더 많습니다.';
    }
    function replyComment(s) {
      var a = s.personMe.replyMedian, b = s.personOther.replyMedian;
      if (a === null || b === null) return '답장 속도를 잴 만큼 주고받은 메시지가 많지 않습니다.';
      if (Math.abs(a - b) < 1.5) return '답장 중간값이 ' + fmtMin(a) + ' · ' + fmtMin(b) + '로 둘 다 비슷한 속도로 답합니다.';
      return a < b
        ? '답장 중간값은 나 ' + fmtMin(a) + ', 상대 ' + fmtMin(b) + '로 내가 ' + Math.round(b - a) + '분 더 빠릅니다.'
        : '답장 중간값은 상대 ' + fmtMin(b) + ', 나 ' + fmtMin(a) + '로 상대가 ' + Math.round(a - b) + '분 더 빠릅니다.';
    }
    function trendComment(s) {
      var d = s.trend.recent.temp - s.trend.prev.temp;
      if (d >= 5) return '최근 30일 대화 온도가 이전보다 ' + d + '° 올랐습니다. 요즘 대화가 더 잦고 가벼워졌어요.';
      if (d <= -5) return '최근 30일 대화 온도가 이전보다 ' + Math.abs(d) + '° 내려갔습니다. 연락이 뜸해졌는지 한번 살펴보세요.';
      return '최근 30일 대화 온도는 이전과 비슷합니다. 꾸준한 흐름이에요.';
    }
    function timeComment(s) {
      var top = SLOTS.slice().sort(function (a, b) { return s.slots[b.key] - s.slots[a.key]; })[0];
      var peak = peakOf(s.hours);
      return '대화는 주로 ' + top.label + '(' + top.range + ')에 많고, 가장 활발한 시간은 ' + peak + '시입니다.';
    }

    /* ---------- 파일·샘플 불러오기 ---------- */
    function apply(loaded) {
      parsed = loaded;
      var names = []; var seen = {};
      parsed.messages.forEach(function (m) { if (!seen[m.name]) { seen[m.name] = 0; names.push(m.name); } seen[m.name]++; });
      names.sort(function (a, b) { return seen[b] - seen[a]; });

      el.me.innerHTML = names.map(function (n) {
        return '<option value="' + esc(n) + '">' + esc(n) + ' (' + num(seen[n]) + '건)</option>';
      }).join('');
      var guess = names[0];
      if (parsed.roomName && seen[parsed.roomName] && names.length > 1) {
        guess = names.filter(function (n) { return n !== parsed.roomName; })[0] || names[0];
      }
      el.me.value = guess;

      var fmt = { android: '안드로이드', ios: '아이폰', pc: 'PC', 'pc-csv': 'PC(CSV)', en: '영문' }[parsed.format] || '';
      var line = (fmt ? fmt + ' 형식 · ' : '') + '메시지 ' + num(parsed.messages.length) + '건 · ' + names.length + '명을 읽었습니다.';
      if (names.length > 2) {
        var top2 = names.slice(0, 2);
        line += '\n3명 이상이 참여한 대화라 가장 많이 말한 두 사람(' + top2.join(', ') + ')만 1:1로 분석합니다. 아래에서 내 이름을 바꾸면 그 사람 기준으로 다시 계산합니다.';
        msg(line, 'error');
      } else {
        if (names.length === 1) line += '\n한 사람만 보여 1:1 분석이 어렵습니다. 상대와 주고받은 대화 파일을 올려 주세요.';
        msg(line, names.length === 1 ? 'error' : 'ok');
      }
      el.work.style.display = 'block';
      render();
    }

    function load(text, label) {
      var res = parse(text);
      if (!res.messages.length) {
        msg('대화 형식을 알아보지 못했습니다. 카카오톡 ‘대화 내보내기’로 받은 파일이 맞는지 확인해 주세요. (안드로이드·아이폰·PC 기본 형식 지원)', 'error');
        return false;
      }
      fileLabel = label || '붙여 넣은 대화';
      apply(res);
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
    el.sample.addEventListener('click', function () { load(sampleChat(), '썸 샘플 데이터'); });
    el.me.addEventListener('change', render);
    el.anon.addEventListener('change', render);
    el.reset.addEventListener('click', function () {
      parsed = null; stats = null; el.out.innerHTML = ''; el.work.style.display = 'none'; el.pastearea.value = '';
      el.me.innerHTML = ''; msg('');
      el.file.click();
    });
    el.png.addEventListener('click', function () {
      if (!stats) return;
      summaryCard(stats, { anon: el.anon.checked }).toBlob(function (blob) {
        if (!blob) { msg('이미지를 만들지 못했습니다.', 'error'); return; }
        download(blob, '썸커플_대화분석.png');
        msg('요약 카드를 저장했습니다. 공유할 때는 ‘이름 가리기’를 켜 두면 이름 대신 나·상대로 표시됩니다.', 'ok');
      }, 'image/png');
    });

    api = { load: load, getStats: function () { return stats; }, render: render };
    root.barodoguApi = api;
    return api;
  }

  function download(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  /* ====================== 요약 카드(1080×1350) ====================== */
  function summaryCard(s, opt) {
    opt = opt || {};
    var anon = !!opt.anon;
    var W = 1080, H = 1350, c = document.createElement('canvas');
    c.width = W; c.height = H;
    var g = c.getContext('2d'), F = 'system-ui,-apple-system,"Malgun Gothic","Apple SD Gothic Neo",sans-serif';
    var meN = anon ? '나' : s.me, otN = anon ? '상대' : (s.other || '상대');

    g.fillStyle = '#fdf1f5'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffffff'; roundRect(g, 40, 40, W - 80, H - 80, 40); g.fill();
    g.fillStyle = '#c2496f'; roundRect(g, 40, 40, W - 80, 14, 7); g.fill();

    g.fillStyle = '#b8567a'; g.font = '700 26px ' + F;
    g.fillText('착착도구 · 1:1 카톡 썸·커플 대화 분석기', 90, 128);

    /* 이름 */
    g.fillStyle = '#2a1b23'; g.font = '800 58px ' + F;
    var n1 = clip(g, meN, 380);
    g.fillText(n1, 90, 206);
    var hx = 90 + g.measureText(n1).width + 34;
    drawHeart(g, hx, 186, 24, '#c2496f');
    g.fillStyle = '#2a1b23'; g.font = '800 58px ' + F;
    g.fillText(clip(g, otN, W - 180 - (hx - 90) - 44), hx + 30, 206);
    g.fillStyle = '#7a6670'; g.font = '400 27px ' + F;
    g.fillText(fmtDate(s.first) + ' ~ ' + fmtDate(s.last) + ' · ' + s.dayCount + '일 · ' + num(s.total) + '개 메시지', 90, 252);

    g.strokeStyle = '#f2dde5'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(90, 292); g.lineTo(W - 90, 292); g.stroke();

    /* 세 가지 큰 지표 */
    var st = s.startMe + s.startOther;
    var cells = [
      { label: '선톡 비율', value: Math.round(pct(s.startMe, st)) + '% : ' + Math.round(pct(s.startOther, st)) + '%', sub: meN + ' : ' + otN },
      { label: '답장 중간값', value: fmtMin(s.personMe.replyMedian) + ' / ' + fmtMin(s.personOther.replyMedian), sub: meN + ' / ' + otN },
      { label: '웃음 ㅋㅋ·ㅎㅎ', value: num(s.laugh) + '회', sub: '메시지 100개당 ' + (s.total ? (s.laugh / s.total * 100).toFixed(0) : 0) + '회' }
    ];
    cells.forEach(function (cell, i) {
      var x = 90 + i * 305, y = 340;
      g.fillStyle = '#fdf7f9'; roundRect(g, x, y, 285, 150, 18); g.fill();
      g.fillStyle = '#b8567a'; g.font = '700 22px ' + F;
      g.fillText(cell.label, x + 24, y + 44);
      g.fillStyle = '#2a1b23'; g.font = '800 38px ' + F;
      g.fillText(clip(g, cell.value, 240), x + 24, y + 96);
      g.fillStyle = '#7a6670'; g.font = '400 20px ' + F;
      g.fillText(clip(g, cell.sub, 240), x + 24, y + 128);
    });

    /* 온도 */
    var ty = 530;
    g.fillStyle = '#2a1b23'; g.font = '800 32px ' + F;
    g.fillText('대화 온도', 90, ty + 26);
    g.fillStyle = '#c2496f'; g.font = '800 120px ' + F;
    g.fillText(String(s.temp), 90, ty + 150);
    var tw = g.measureText(String(s.temp)).width;
    g.font = '800 54px ' + F; g.fillText('°', 96 + tw, ty + 108);

    /* 눈금 막대 */
    var bx = 330, bw = W - 90 - bx, by = ty + 108;
    g.fillStyle = '#f4e7ec'; roundRect(g, bx, by, bw, 24, 12); g.fill();
    var grad = g.createLinearGradient(bx, 0, bx + bw, 0);
    grad.addColorStop(0, '#9cc0d6'); grad.addColorStop(0.5, '#e8a9bd'); grad.addColorStop(1, '#c2496f');
    g.fillStyle = grad; roundRect(g, bx, by, Math.max(24, bw * s.temp / 100), 24, 12); g.fill();
    g.fillStyle = '#7a6670'; g.font = '400 21px ' + F;
    g.fillText('0°', bx, by + 54); g.fillText('50°', bx + bw / 2 - 14, by + 54); g.textAlign = 'right'; g.fillText('100°', bx + bw, by + 54); g.textAlign = 'left';

    var trendTxt;
    if (s.trend.has) {
      var d = s.trend.recent.temp - s.trend.prev.temp;
      trendTxt = '최근 30일 ' + s.trend.recent.temp + '°' + (d > 0 ? '  ▲ ' + d + '°' : (d < 0 ? '  ▼ ' + Math.abs(d) + '°' : '  변화 없음'));
    } else {
      trendTxt = '최근 30일과 비교할 만큼 길지 않은 대화';
    }
    g.fillStyle = '#5b4a52'; g.font = '600 25px ' + F;
    g.fillText(trendTxt, bx, by + 96);

    /* 비교 막대 4개 */
    var rows = [
      { label: '메시지', a: s.personMe.count, b: s.personOther.count },
      { label: '웃음', a: s.personMe.laugh, b: s.personOther.laugh },
      { label: '하트·애정', a: s.personMe.heart + s.personMe.aff, b: s.personOther.heart + s.personOther.aff },
      { label: '선톡', a: s.startMe, b: s.startOther }
    ];
    var ry = 790;
    g.fillStyle = '#2a1b23'; g.font = '800 28px ' + F;
    g.fillText('누가 더?', 90, ry - 20);
    rows.forEach(function (row, i) {
      var y = ry + 22 + i * 56, max = Math.max(row.a, row.b, 1), fullW = 520;
      g.fillStyle = '#5b4a52'; g.font = '600 23px ' + F;
      g.fillText(row.label, 90, y + 18);
      g.fillStyle = '#f5eaee'; roundRect(g, 260, y, fullW, 16, 8); g.fill();
      g.fillStyle = '#c2496f'; roundRect(g, 260, y, Math.max(6, fullW * row.a / max), 16, 8); g.fill();
      g.fillStyle = '#f0f4f7'; roundRect(g, 260, y + 22, fullW, 16, 8); g.fill();
      g.fillStyle = '#4b86ad'; roundRect(g, 260, y + 22, Math.max(6, fullW * row.b / max), 16, 8); g.fill();
      g.fillStyle = '#7a6670'; g.font = '400 20px ' + F;
      g.textAlign = 'right';
      g.fillText(meN + ' ' + num(row.a), 930, y + 17);
      g.fillText(otN + ' ' + num(row.b), 930, y + 39);
      g.textAlign = 'left';
    });

    /* 시간대 */
    var sy = 1076;
    g.strokeStyle = '#f2dde5'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(90, sy - 44); g.lineTo(W - 90, sy - 44); g.stroke();
    g.fillStyle = '#2a1b23'; g.font = '800 26px ' + F;
    g.fillText('주로 말하는 시간', 90, sy);
    var sw = (W - 180 - 36) / 4;
    SLOTS.forEach(function (slot, i) {
      var x = 90 + i * (sw + 12), v = s.slots[slot.key], p = s.total ? v / s.total : 0;
      g.fillStyle = '#f7eef2'; roundRect(g, x, sy + 14, sw, 86, 14); g.fill();
      g.fillStyle = '#e0a4b9'; roundRect(g, x, sy + 14 + 86 * (1 - p), sw, 86 * p, 14); g.fill();
      g.fillStyle = '#2a1b23'; g.font = '800 22px ' + F;
      g.fillText(slot.label, x + 14, sy + 52);
      g.fillStyle = '#5b4a52'; g.font = '600 20px ' + F;
      g.fillText(Math.round(p * 100) + '%', x + 14, sy + 80);
      g.fillStyle = '#9b8791'; g.font = '400 17px ' + F;
      g.fillText(slot.range, x + 14, sy + 118);
    });

    g.fillStyle = '#b9a3ac'; g.font = '400 19px ' + F; g.textAlign = 'center';
    g.fillText('착착도구 · barodogu.blogspot.com', W / 2, H - 62);
    g.textAlign = 'left';
    return c;
  }
  function clip(g, text, maxW) {
    if (g.measureText(text).width <= maxW) return text;
    var t = text;
    while (t.length > 1 && g.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  }
  function drawHeart(g, cx, cy, size, color) {
    g.save();
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(cx, cy + size * 0.62);
    g.bezierCurveTo(cx - size * 1.15, cy - size * 0.18, cx - size * 0.52, cy - size * 1.05, cx, cy - size * 0.36);
    g.bezierCurveTo(cx + size * 0.52, cy - size * 1.05, cx + size * 1.15, cy - size * 0.18, cx, cy + size * 0.62);
    g.closePath();
    g.fill();
    g.restore();
  }
  function roundRect(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  /* ====================== 썸 샘플 데이터(안드로이드 형식) ====================== */
  function sampleChat() {
    var me = '하늘', you = '지훈';
    var lines = [you + ' 님과 카카오톡 대화', '저장한 날짜 : 2026년 11월 20일 오후 9:40', ''];
    var seed = 21;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    function pick(a) { return a[Math.floor(rnd() * a.length)]; }
    var early = ['오늘 뭐 했어?', '밥은 먹었어?', 'ㅋㅋㅋㅋ 진짜?', '나 지금 퇴근길', '주말에 뭐 해?', '그 영화 봤어?', '좀 피곤하네', '응 고마워',
      '내일도 바쁘겠다', '날씨 진짜 좋더라', '커피 마시고 싶다', 'ㅋㅋㅋㅋㅋ 아 웃겨'];
    var warm = ['보고 싶다', '오늘 하루 어땠어?', '너 생각났어', 'ㅋㅋㅋㅋ 너 진짜 웃기다', '같이 먹고 싶다', '이거 너 좋아할 것 같아', '사진',
      '잘 자 🌙', '일 끝나고 연락해', '내일도 연락해', '심쿵했잖아 ㅋㅋ', '너랑 얘기하면 재밌어', '주말에 보자', '고마워 ♥', '이모티콘',
      '뭐 해? 보고 싶어서', '오늘도 수고했어', '너 진짜 귀여워', '내일 봐', 'ㅎㅎㅎ'];
    var him = ['응 나도', 'ㅋㅋㅋㅋ 그랬어?', '나 지금 일하는 중', '오늘 좀 늦었지', '좋아', '그래', '내일 얘기하자', '너는 뭐 해?',
      '나도 보고 싶었어', '고마워', '사랑해', '이모티콘', '사진', '오늘 너무 힘들었어', '너 덕분에 웃었다'];
    var start = new Date(2026, 6, 14);
    var end = new Date(2026, 10, 19);
    for (var d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      var dayIdx = Math.round((d - start) / 864e5);
      var hot = dayIdx > 95;                 // 마지막 한 달은 더 뜨거운 시기
      var n = hot ? 16 + Math.floor(rnd() * 26) : 5 + Math.floor(rnd() * 12);
      if (d.getDay() === 1 && rnd() < 0.25) n = Math.floor(n * 0.3); // 가끔 조용한 날
      var baseH = pick(hot ? [21, 22, 20, 15, 12, 23, 0, 21] : [21, 20, 22, 15, 23, 9, 13, 1, 21]);
      var times = [];
      var t0 = baseH * 60 + Math.floor(rnd() * 40);
      times.push(t0);
      for (var k = 1; k < n; k++) {
        var g2 = hot ? 1 + Math.floor(rnd() * rnd() * 40) : 2 + Math.floor(rnd() * rnd() * 70);
        var nx = times[times.length - 1] + g2;
        if (nx > 23 * 60 + 55) break;
        times.push(nx);
      }
      var lastWho = rnd() < 0.5 ? me : you, lastMin = -9999;
      times.forEach(function (min) {
        // 선톡: 4시간 이상 공백이면 새로 시작
        var who = lastWho;
        var gap = min - lastMin;
        if (gap >= 240 || lastMin < 0) {
          // 최근 시기에는 상대가 먼저 거는 비율이 조금 더 높게
          who = rnd() < (hot ? 0.47 : 0.55) ? me : you;
        } else if (rnd() < 0.82) {
          who = (lastWho === me) ? you : me; // 대부분 주고받기
        }
        var hr2 = Math.floor(min / 60), h12 = hr2 % 12 === 0 ? 12 : hr2 % 12;
        var ap = hr2 < 12 ? '오전' : '오후';
        var pool = who === me ? (hot ? warm : early) : him;
        var txt = pick(pool);
        lines.push(d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + ap + ' ' + h12 + ':' + pad(min % 60) + ', ' + who + ' : ' + txt);
        lastWho = who; lastMin = min;
      });
    }
    return lines.join('\n');
  }

  barodogu.kakaoCoupleAnalyzer = {
    version: CONFIG.VERSION,
    CONFIG: CONFIG,
    init: init,
    parse: parse,
    analyze: analyze,
    enrich: enrich,
    kindOf: kindOf,
    sampleChat: sampleChat,
    summaryCard: summaryCard
  };

  function auto() { if (document.getElementById(CONFIG.ROOT_ID)) init(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto, { once: true });
  else auto();
})(window, document);
