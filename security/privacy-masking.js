/*!
 * ============================================================
 * 모듈명   : barodogu.privacyMasking
 * 관리 ID  : BD082
 * 파일     : security/privacy-masking.js
 * 저장소   : https://github.com/barodogu/tools
 * CDN      : https://cdn.jsdelivr.net/gh/barodogu/tools@main/security/privacy-masking.js
 * 사용 블로그: https://barodogu.blogspot.com/
 * 용도     : 개인정보 마스킹 — 붙여 넣은 텍스트에서 개인정보를 찾아 일부를 가림
 *            - 자동 감지: 주민·외국인등록번호, 카드번호, 휴대전화, 일반전화, 이메일,
 *              IP 주소, 계좌번호, 생년월일(선택), '이름:' '주소:' 표시 뒤 값, 아파트 동·호수
 *            - 직접 지정: 이름·회사명 등 가릴 단어 목록
 *            - 옵션: 가림 문자(* ● X ■), 글자 수 유지/고정 3자, 기본/강하게
 *            - 파일: TXT·CSV·TSV·LOG·JSON·MD는 같은 형식(UTF-8)으로, XLSX는 서식을 유지한 채 저장
 *            - 표 머리글 인식: '이름·주소·생년월일' 열은 열 전체를 가림(CSV·TSV·XLSX·엑셀 붙여넣기)
 *            - 머리글 없는 명단: 성씨로 시작하는 한글 2~4자 + 같은 행에 전화·이메일 등이 있는 열을 이름 열로 추정
 *            - XLSX 처리에는 JSZip 3.10.1(MIT)을 엑셀 파일을 열 때만 jsDelivr에서 불러옴
 *            ※ 입력 내용은 서버로 전송하지 않고 사용자 브라우저 안에서만 처리
 * 기준     : 항목별 가림 위치는 ISMS-P 인증기준 해설의 표시제한 예시와
 *            카드업계 보안표준(PCI DSS, 앞 6·뒤 4자리) 관행을 참고한 기본값
 * 사용법   : 글에 <div id="barodogu-privacy-masking"></div> 를 넣고
 *            이 파일을 <script src="…" defer></script> 로 불러오면 화면을 그립니다.
 * 버전     : 1.2.0
 * 최종수정 : 2026-10-22
 * ============================================================
 */
(function (window, document) {
  'use strict';

  var barodogu = window.barodogu = window.barodogu || {};

  /* ---------- 기준값: 이 객체만 수정하면 됩니다 ---------- */
  var CONFIG = {
    VERSION: '1.2.0',
    UPDATED: '2026-10-22',
    ROOT_ID: 'barodogu-privacy-masking',
    MAX_CHARS: 1000000,       // 입력 최대 글자 수
    PREVIEW_CHARS: 60000,     // 텍스트 미리보기 최대 글자 수(저장·복사는 전체)
    MAX_FILE_MB: 10,          // 업로드 파일 최대 용량
    TEXT_EXT: ['txt', 'csv', 'tsv', 'log', 'json', 'md'],
    BOM_EXT: ['txt', 'csv', 'tsv', 'log'],   // 엑셀·메모장 한글 깨짐 방지용 BOM을 붙일 형식
    JSZIP_URL: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
    XLSX_PREVIEW_ROWS: 60,
    XLSX_PREVIEW_COLS: 12,
    /* 머리글(열 이름)로 열 전체를 가릴 항목 — 공백·괄호 등을 뺀 뒤 비교 */
    HEADER_NAME: /^(이름|성명|성함|한글이름|한글성명|(고객|회원|직원|학생|환자|신청자|사용자|가입자|계약자|피보험자|보험자|수익자|주문자|구매자)(명|이름|성명)?|예금주(명)?|수령인|수령자|수취인|받는(분|사람)|보내는(분|사람)|보호자(명)?|신청인|대표자(명)?|담당자(명)?|name|fullname|username|customername)$/i,
    HEADER_ADDR: /(주소|배송지|거주지|소재지|address|addr)/i,
    HEADER_ADDR_EXCLUDE: /(ip|이메일|메일|email|mail|url|웹|홈페이지|mac)/i,
    /* 머리글이 없을 때 이름 열 추정: 흔한 성씨로 시작하는 한글 2~4자 */
    SURNAMES: '김이박최정강조윤장임한오서신권황안송류유전홍고문양손배백허남심노하곽성차주우구민진지엄채원천방공현함변염여추도소석선설마길연위표명기반라왕금옥육인맹제모탁국어은편용예봉경사부가복태목형피두감음빈동온호범좌갈',
    NAME_GUESS_EXCLUDE: /(팀|부|과|실|국|청|센터|본부|지점|지사|회사|학교|대학|병원|은행|님|씨|장|원장|대리|사원|주임|이사|대표|고객|회원|남자|여자|남성|여성|서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|완료|대기|진행|취소|확인|정상|해지|신규|기존)$/,
    NAME_GUESS_RATIO: 0.8,    // 열의 값 중 이름 모양 비율
    NAME_GUESS_PII: 0.5,      // 이름 모양 값이 있는 행 중 다른 개인정보(전화·이메일 등)가 함께 있는 비율
    HEADER_BIRTH: /^(생년월일|생일|출생일|생년|birth|birthday|birthdate|dateofbirth|dob)$/i,
    FIXED_LEN: 3,             // '고정 3자' 옵션의 가림 문자 수
    MASK_CHARS: ['*', '●', 'X', '■'],
    DEBOUNCE_MS: 250,
    TYPES: [
      { id: 'custom',  label: '직접 지정 단어', on: true },
      { id: 'rrn',     label: '주민·외국인등록번호', on: true },
      { id: 'card',    label: '카드번호', on: true },
      { id: 'mobile',  label: '휴대전화', on: true },
      { id: 'tel',     label: '일반전화', on: true },
      { id: 'email',   label: '이메일', on: true },
      { id: 'ip',      label: 'IP 주소', on: true },
      { id: 'account', label: '계좌번호', on: true },
      { id: 'birth',   label: '생년월일·날짜', on: false },
      { id: 'name',    label: "이름 ('이름:'·이름 열)", on: true },
      { id: 'addr',    label: "주소 ('주소:'·주소 열)", on: true },
      { id: 'apt',     label: '아파트 동·호수', on: true }
    ],
    NAME_LABELS: '이름|성명|성함|고객명|예금주|수령인|받는\\s?분|받는\\s?사람|보내는\\s?분|보호자|신청인|대표자|담당자',
    ADDR_LABELS: '주소|배송지|거주지|도로명주소|지번주소|주소지'
  };

  var EXAMPLE = [
    '[주문 확인] 성함: 홍길동 / 연락처 010-1234-5678',
    '배송지: 서울특별시 종로구 세종대로 175 101동 1203호',
    '이메일 hong.gildong@example.com, 사무실 02-345-6789',
    '환불 계좌 신한 110-123-456789 (예금주: 홍길동)',
    '결제 카드 4558-1234-5678-9013 / 주민등록번호 900101-1234567',
    '접속 IP 203.0.113.45, 담당자: 김철수'
  ].join('\n');

  /* ====================== 마스킹 규칙 (순수 함수) ====================== */
  function isDigit(c) { return c >= '0' && c <= '9'; }
  function repeat(ch, n) { var s = ''; for (var i = 0; i < n; i++) s += ch; return s; }

  /** 숫자만 골라 index 기준으로 가리기. keep(i, total) 이 true면 남김. 구분자는 유지 */
  function maskDigits(str, ch, keep) {
    var total = 0, i, out = '', k = 0;
    for (i = 0; i < str.length; i++) if (isDigit(str[i])) total++;
    for (i = 0; i < str.length; i++) {
      if (isDigit(str[i])) { out += keep(k, total) ? str[i] : ch; k++; }
      else out += str[i];
    }
    return out;
  }
  /** 숫자 묶음 단위로 가리기: maskIdx 에 든 순번(0부터)의 숫자 묶음을 가림 */
  function maskGroups(str, ch, maskIdx) {
    var k = -1;
    return str.replace(/\d+/g, function (d) { k++; return maskIdx.indexOf(k) >= 0 ? repeat(ch, d.length) : d; });
  }
  function groupCount(str) { return (str.match(/\d+/g) || []).length; }
  function firstGroupLen(str) { var m = str.match(/\d+/); return m ? m[0].length : 0; }

  function run(len, o) { return o.fixed ? repeat(o.ch, CONFIG.FIXED_LEN) : repeat(o.ch, len); }

  var RULES = {
    name: function (s, o) {
      var a = Array.from(s), n = a.length;
      if (n <= 1) return o.ch;
      if (o.strong) return a[0] + run(n - 1, o);
      if (n === 2) return a[0] + run(1, o);
      return a[0] + run(n - 2, o) + a[n - 1];
    },
    custom: function (s, o) {
      if (/^[가-힣]{2,5}$/.test(s)) return RULES.name(s, o);
      var a = Array.from(s);
      return a.length <= 2 ? run(a.length, o) : a[0] + run(a.length - 1, o);
    },
    mobile: function (s, o) {
      if (groupCount(s) >= 3) return maskGroups(s, o.ch, o.strong ? [1, 2] : [1]);
      return maskDigits(s, o.ch, function (i, t) { return i < 3 || (!o.strong && i >= t - 4); });
    },
    tel: function (s, o) {
      if (groupCount(s) >= 3) return maskGroups(s, o.ch, o.strong ? [1, 2] : [1]);
      return maskDigits(s, o.ch, function (i, t) { return i < 2 || (!o.strong && i >= t - 4); });
    },
    rrn: function (s, o) {
      return maskDigits(s, o.ch, function (i) { return i < 6 || (!o.strong && i === 6); });
    },
    card: function (s, o) {
      return maskDigits(s, o.ch, function (i, t) { return (!o.strong && i < 6) || i >= t - 4; });
    },
    account: function (s, o) {
      var keepTail = o.strong ? 2 : 4;
      var firstLen = firstGroupLen(s);
      return maskDigits(s, o.ch, function (i, t) { return (!o.strong && i < firstLen && firstLen <= 4) || i >= t - keepTail; });
    },
    email: function (s, o) {
      var at = s.lastIndexOf('@'), id = s.slice(0, at), dom = s.slice(at);
      var keep = o.strong ? 1 : (id.length <= 3 ? 1 : 2);
      var masked = id.slice(0, keep) + run(Math.max(1, id.length - keep), o);
      if (o.strong) {
        var dot = dom.lastIndexOf('.');
        dom = '@' + run(Math.max(1, dot - 1), o) + dom.slice(dot);
      }
      return masked + dom;
    },
    ip: function (s, o) {
      var p = s.split('.');
      p[2] = repeat(o.ch, p[2].length);
      if (o.strong) p[3] = repeat(o.ch, p[3].length);
      return p.join('.');
    },
    birth: function (s, o) {
      return maskDigits(s, o.ch, function (i) { return !o.strong && i < 4; });
    },
    addr: function (s, o) {
      /* 시·도 / 시·군·구까지만 남기고 나머지 가림 */
      var parts = s.split(/(\s+)/), keepUntil = -1, words = 0;
      for (var i = 0; i < parts.length; i++) {
        if (/^\s+$/.test(parts[i]) || !parts[i]) continue;
        words++;
        if (words > 3) break;
        if (/(특별시|광역시|특별자치시|특별자치도|[도시군구])$/.test(parts[i])) keepUntil = i;
      }
      if (o.strong) {
        for (var j = 0; j <= keepUntil; j++) {
          if (/^\s+$/.test(parts[j]) || !parts[j]) continue;
          if (/(특별시|광역시|특별자치시|특별자치도|도)$/.test(parts[j])) continue;
          keepUntil = j - 1; break;
        }
      }
      var head = parts.slice(0, keepUntil + 1).join('');
      var tail = parts.slice(keepUntil + 1).join('');
      if (!tail.trim()) return head;
      var lead = (tail.match(/^\s*/) || [''])[0];
      /* 주소 꼬리는 길이가 드러나지 않도록 항상 고정 길이 */
      return head + lead + repeat(o.ch, CONFIG.FIXED_LEN);
    },
    apt: function (s, o) {
      return s.replace(/\d+/g, function (d) { return repeat(o.ch, o.fixed ? CONFIG.FIXED_LEN : d.length); });
    }
  };

  /* ====================== 감지 ====================== */
  function luhn(d) {
    var sum = 0, alt = false;
    for (var i = d.length - 1; i >= 0; i--) {
      var n = +d[i];
      if (alt) { n *= 2; if (n > 9) n -= 9; }
      sum += n; alt = !alt;
    }
    return sum % 10 === 0;
  }
  function digitsOf(s) { return s.replace(/\D/g, ''); }
  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /* 숫자 경계: 앞뒤 글자가 숫자(또는 지정 문자)면 다른 번호의 일부로 보고 제외 */
  function bounded(text, start, end, extra) {
    var b = text[start - 1], a = text[end];
    var bad = function (c) { return c !== undefined && (isDigit(c) || (extra && extra.indexOf(c) >= 0)); };
    return !bad(b) && !bad(a);
  }

  var DETECTORS = {
    rrn: { re: /\d{6}\s?-\s?\d{7}|\d{13}/g, ok: function (m, t, s, e) {
      if (!bounded(t, s, e, '-')) return false;
      var d = digitsOf(m), mm = +d.slice(2, 4), dd = +d.slice(4, 6), g = +d[6];
      return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && g >= 1 && g <= 8;
    } },
    card: { re: /\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{4}|\d{4}[- ]\d{6}[- ]\d{5}|\d{15,16}/g, ok: function (m, t, s, e) {
      if (!bounded(t, s, e, '-')) return false;
      return /\D/.test(m) ? true : luhn(m);   /* 붙여 쓴 숫자열만 검증번호로 확인 */
    } },
    mobile: { re: /01[016789][-. ]?\d{3,4}[-. ]?\d{4}/g, ok: function (m, t, s, e) { return bounded(t, s, e, '-'); } },
    tel: { re: /\(?0(?:2|[3-6][1-5]|70)\)?[-. )]\s?\d{3,4}[-. ]\d{4}/g, ok: function (m, t, s, e) { return bounded(t, s, e, '-'); } },
    email: { re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g },
    ip: { re: /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, ok: function (m, t, s, e) {
      if (!bounded(t, s, e, '.')) return false;
      return m.split('.').every(function (x) { return +x <= 255 && !(x.length > 1 && x[0] === '0'); });
    } },
    account: { re: /\d{2,6}-\d{2,6}-\d{1,7}(?:-\d{1,3})?/g, ok: function (m, t, s, e) {
      var n = digitsOf(m).length;
      if (/^\d{3}-\d{2}-\d{5}$/.test(m)) return false;   /* 사업자등록번호 형식 제외 */
      return n >= 10 && n <= 16 && bounded(t, s, e, '-');
    } },
    birth: { re: /(?:19|20)\d{2}\s?(?:[-./]|년)\s?(?:1[0-2]|0?[1-9])\s?(?:[-./]|월)\s?(?:3[01]|[12]\d|0?[1-9])일?/g, ok: function (m, t, s, e) { return bounded(t, s, e); } },
    apt: { re: /\d{1,4}\s?동\s?\d{1,5}\s?호/g, ok: function (m, t, s, e) { return bounded(t, s, e); } }
  };

  /** 라벨 뒤 값 찾기: 이름·주소 */
  function labelMatches(text, type) {
    var out = [], re, m;
    if (type === 'name') {
      re = new RegExp('(?:' + CONFIG.NAME_LABELS + ')\\s*[:：]\\s*([가-힣]{2,5})(?![가-힣])', 'g');
    } else {
      re = new RegExp('(?:' + CONFIG.ADDR_LABELS + ')\\s*[:：]\\s*([^\\n\\t,;/|]+)', 'g');
    }
    while ((m = re.exec(text))) {
      var val = m[1].replace(/\s+$/, '');
      if (!val) continue;
      var start = m.index + m[0].lastIndexOf(m[1]);
      out.push({ start: start, end: start + val.length, type: type });
    }
    return out;
  }

  /**
   * 텍스트에서 개인정보 위치를 찾습니다. 먼저 찾은 항목이 우선이며 겹치는 후보는 버립니다.
   * opt.types: { id: true/false }, opt.words: ['홍길동', …]
   */
  function detect(text, opt) {
    opt = opt || {};
    var on = opt.types || {};
    var taken = [], found = [];
    function free(s, e) {
      for (var i = 0; i < taken.length; i++) if (s < taken[i][1] && e > taken[i][0]) return false;
      return true;
    }
    function add(s, e, type) {
      if (e <= s || !free(s, e)) return;
      taken.push([s, e]); found.push({ start: s, end: e, type: type, text: text.slice(s, e) });
    }
    (opt.forced || []).forEach(function (h) { add(h.start, h.end, h.type); });
    var order = ['custom', 'rrn', 'card', 'mobile', 'tel', 'email', 'ip', 'account', 'birth', 'addr', 'name', 'apt'];
    order.forEach(function (type) {
      if (on[type] === false) return;
      if (type === 'custom') {
        var words = (opt.words || []).filter(Boolean).sort(function (a, b) { return b.length - a.length; });
        words.forEach(function (w) {
          var re = new RegExp(escapeRe(w), 'g'), m;
          while ((m = re.exec(text))) add(m.index, m.index + m[0].length, 'custom');
        });
        return;
      }
      if (type === 'name' || type === 'addr') {
        labelMatches(text, type).forEach(function (x) { add(x.start, x.end, type); });
        return;
      }
      var d = DETECTORS[type], m2;
      d.re.lastIndex = 0;
      while ((m2 = d.re.exec(text))) {
        var s = m2.index, e = s + m2[0].length;
        if (!d.ok || d.ok(m2[0], text, s, e)) add(s, e, type);
      }
    });
    found.sort(function (a, b) { return a.start - b.start; });
    return found;
  }

  function maskValue(type, value, o) { return (RULES[type] || RULES.custom)(value, o); }

  /* ====================== 표(CSV·TSV) 머리글 인식 ====================== */
  function headerType(label) {
    var n = String(label || '').replace(/[\s_()\[\]{}·.\-:：*]/g, '');
    if (!n) return null;
    if (CONFIG.HEADER_NAME.test(n)) return 'name';
    if (CONFIG.HEADER_BIRTH.test(n)) return 'birth';
    if (CONFIG.HEADER_ADDR.test(n) && !CONFIG.HEADER_ADDR_EXCLUDE.test(n)) return 'addr';
    return null;
  }
  /* 표 머리글 열은 체크 상태를 따르되, '생년월일' 열은 날짜 항목이 꺼져 있어도 가림 */
  function columnOn(type, on) { return type === 'birth' ? true : on[type] !== false; }

  var NO_LABEL = { name: false, addr: false, custom: false, apt: false, birth: false };
  function hasPII(v) { return !!v && detect(v, { types: NO_LABEL }).length > 0; }
  function nameLike(v) {
    if (!/^[가-힣]{2,4}$/.test(v)) return false;
    if (CONFIG.SURNAMES.indexOf(v[0]) < 0 && !/^(남궁|황보|제갈|선우|독고|사공|서문)/.test(v)) return false;
    return !CONFIG.NAME_GUESS_EXCLUDE.test(v);
  }
  /**
   * 머리글 없이 이름 열 추정. grid: 행 배열(각 행은 칸 문자열 배열), skip: 이미 종류가 정해진 열 번호
   * 조건: 값의 80% 이상이 '성씨로 시작하는 한글 2~4자'이고, 그 행의 절반 이상에 전화·이메일 등 다른 개인정보가 있음
   */
  function guessNameColumns(grid, skip) {
    var width = 0, out = [], rows = grid.slice(0, 300);
    rows.forEach(function (r) { width = Math.max(width, r.length); });
    for (var c = 0; c < width; c++) {
      if (skip && skip[c]) continue;
      var filled = 0, like = 0, withPii = 0, uniq = {};
      rows.forEach(function (r) {
        var v = (r[c] || '').trim();
        if (!v) return;
        filled++; uniq[v] = 1;
        if (!nameLike(v)) return;
        like++;
        if (r.some(function (x, i) { return i !== c && hasPII(x); })) withPii++;
      });
      if (!like || like / filled < CONFIG.NAME_GUESS_RATIO || withPii / like < CONFIG.NAME_GUESS_PII) continue;
      if (filled >= 5 && Object.keys(uniq).length / filled < 0.5) continue;   /* 같은 값이 반복되는 열(부서·지역 등) 제외 */
      out.push(c);
    }
    return out;
  }
  function colLetter(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }

  /** 구분자 텍스트를 칸 단위로 나눔. 각 칸은 원문에서의 위치 {s, e}(앞뒤 공백·따옴표 제외) */
  function parseTable(text, d) {
    var rows = [], row = [], i = 0, n = text.length;
    while (i <= n) {
      var s = i, e;
      if (text[i] === '"') {
        i++; s = i;
        while (i < n) { if (text[i] === '"') { if (text[i + 1] === '"') { i += 2; continue; } break; } i++; }
        e = i; i++;
        while (i < n && text[i] !== d && text[i] !== '\n' && text[i] !== '\r') i++;
      } else {
        while (i < n && text[i] !== d && text[i] !== '\n' && text[i] !== '\r') i++;
        e = i;
      }
      var ts = s, te = Math.min(e, n);
      while (ts < te && /\s/.test(text[ts])) ts++;
      while (te > ts && /\s/.test(text[te - 1])) te--;
      row.push({ s: ts, e: te });
      if (i >= n) { rows.push(row); break; }
      if (text[i] === d) { i++; continue; }
      i += (text[i] === '\r' && text[i + 1] === '\n') ? 2 : 1;
      rows.push(row); row = [];
    }
    return rows;
  }
  function guessDelimiter(text) {
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); }).slice(0, 30);
    if (lines.length < 2) return null;
    var tabbed = lines.filter(function (l) { return l.indexOf('\t') >= 0; }).length;
    return tabbed / lines.length >= 0.8 ? '\t' : null;
  }
  /** 머리글 행을 찾아 이름·주소·생년월일 열의 칸을 강제 감지 목록으로 (머리글이 없으면 이름 열 추정) */
  function columnHits(text, d, on) {
    var rows = parseTable(text, d), hits = [], cols = [], h = -1;
    var grid = rows.map(function (r) { return r.map(function (c) { return text.slice(c.s, c.e); }); });
    for (var r = 0; r < rows.length && r < 20; r++) {
      var filled = grid[r].filter(function (v) { return v; }).length;
      if (filled >= 2) { h = r; break; }
    }
    if (h < 0) return { hits: hits, columns: cols };
    /* 첫 행에 전화·이메일 등 개인정보가 있으면 머리글이 아니라 데이터 */
    var isHeader = !grid[h].some(hasPII);
    var types = isHeader ? grid[h].map(headerType) : [];
    types.forEach(function (t, ci) { if (t) cols.push({ index: ci, header: grid[h][ci], col: colLetter(ci), type: t, on: columnOn(t, on) }); });
    var start = isHeader ? h + 1 : h;
    if (on.name !== false && types.indexOf('name') < 0) {
      var skip = {}; types.forEach(function (t, ci) { if (t) skip[ci] = 1; });
      guessNameColumns(grid.slice(start), skip).forEach(function (ci) {
        types[ci] = 'name';
        cols.push({ index: ci, header: isHeader && grid[h][ci] ? grid[h][ci] : '이름 추정', col: colLetter(ci), type: 'name', on: true, guessed: true });
      });
    }
    for (r = start; r < rows.length; r++) {
      rows[r].forEach(function (c, ci) {
        var t = types[ci];
        if (t && c.e > c.s && columnOn(t, on)) hits.push({ start: c.s, end: c.e, type: t });
      });
    }
    return { hits: hits, columns: cols };
  }

  /** 텍스트 전체 마스킹 → { text, items:[{type, from, to, start, end}], columns, delimiter }
   *  opt.delimiter: ',' '\t' 등 → 머리글 열 인식, 'auto' → 탭 구분 표면 인식 */
  function maskText(text, opt) {
    opt = opt || {};
    var o = { ch: opt.ch || '*', fixed: !!opt.fixed, strong: !!opt.strong };
    var d = opt.delimiter === 'auto' ? guessDelimiter(text) : (opt.delimiter || null);
    var colInfo = d ? columnHits(text, d, opt.types || {}) : { hits: [], columns: [] };
    var hits = detect(text, { types: opt.types, words: opt.words, forced: colInfo.hits }), out = '', pos = 0, items = [];
    hits.forEach(function (h) {
      var rep = maskValue(h.type, h.text, o);
      out += text.slice(pos, h.start);
      items.push({ type: h.type, from: h.text, to: rep, start: out.length, end: out.length + rep.length });
      out += rep; pos = h.end;
    });
    out += text.slice(pos);
    return { text: out, items: items, columns: colInfo.columns, delimiter: d };
  }

  /* ====================== XLSX ====================== */
  var NS_XML = 'http://www.w3.org/XML/1998/namespace';
  function loadJSZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (loadJSZip.p) return loadJSZip.p;
    loadJSZip.p = new Promise(function (resolve, reject) {
      var sc = document.createElement('script');
      sc.src = CONFIG.JSZIP_URL; sc.async = true;
      sc.onload = function () { window.JSZip ? resolve(window.JSZip) : reject(new Error('엑셀 처리 모듈을 불러오지 못했습니다.')); };
      sc.onerror = function () { loadJSZip.p = null; reject(new Error('엑셀 처리 모듈을 불러오지 못했습니다. 인터넷 연결이나 스크립트 차단 설정을 확인해 주세요.')); };
      (document.head || document.documentElement).appendChild(sc);
    });
    return loadJSZip.p;
  }
  function xmlDoc(str) {
    var doc = new DOMParser().parseFromString(str, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('엑셀 파일 구조를 읽을 수 없습니다.');
    return doc;
  }
  function kids(el, name) {
    var out = [];
    for (var c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 1 && (c.localName || c.nodeName) === name) out.push(c);
    return out;
  }
  /* 문자열 항목(si·is)의 글자: 발음 표기(rPh) 제외 */
  function richText(el) {
    var t = '', ts = el.getElementsByTagName('t');
    for (var i = 0; i < ts.length; i++) {
      var par = ts[i].parentNode;
      if (par && (par.localName || par.nodeName) === 'rPh') continue;
      t += ts[i].textContent;
    }
    return t;
  }
  function setRichText(el, text) {
    while (el.firstChild) el.removeChild(el.firstChild);
    var t = el.ownerDocument.createElementNS(el.namespaceURI, 't');
    t.setAttributeNS(NS_XML, 'xml:space', 'preserve');
    t.textContent = text;
    el.appendChild(t);
  }
  function setInline(cell, text) {
    var ns = cell.namespaceURI, doc = cell.ownerDocument;
    kids(cell, 'v').concat(kids(cell, 'is')).forEach(function (n) { cell.removeChild(n); });
    cell.setAttribute('t', 'inlineStr');
    var is = doc.createElementNS(ns, 'is');
    setRichText(is, text);
    var ext = kids(cell, 'extLst')[0];
    if (ext) cell.insertBefore(is, ext); else cell.appendChild(is);
  }
  function colOf(ref) { return String(ref || '').replace(/\d+/g, ''); }
  function colIndex(letters) { var n = 0; for (var i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64); return n - 1; }

  /**
   * XLSX 마스킹 → Promise<{ blob, counts, total, sheets:[{name, rows:[[{v, changed}]], columns}] }>
   * 공유 문자열·인라인 문자열·숫자 셀을 검사하고, 수식 셀은 건드리지 않습니다.
   */
  function maskXlsx(buffer, opt) {
    opt = opt || {};
    var o = { ch: opt.ch || '*', fixed: !!opt.fixed, strong: !!opt.strong };
    var on = opt.types || {}, textOpt = { types: opt.types, words: opt.words, ch: o.ch, fixed: o.fixed, strong: o.strong };
    var counts = {}, total = 0;
    function count(items) { items.forEach(function (it) { counts[it.type] = (counts[it.type] || 0) + 1; total++; }); }
    return loadJSZip().then(function (JSZip) { return JSZip.loadAsync(buffer); }).then(function (zip) {
      var ssFile = zip.file('xl/sharedStrings.xml'), wbFile = zip.file('xl/workbook.xml'), relFile = zip.file('xl/_rels/workbook.xml.rels');
      if (!wbFile) throw new Error('엑셀(XLSX) 파일이 아니거나 손상된 파일입니다.');
      return Promise.all([ssFile ? ssFile.async('string') : '', wbFile.async('string'), relFile ? relFile.async('string') : '']).then(function (r) {
        var ssDoc = r[0] ? xmlDoc(r[0]) : null, wb = xmlDoc(r[1]), rels = r[2] ? xmlDoc(r[2]) : null;
        var si = ssDoc ? kids(ssDoc.documentElement, 'si') : [];
        var ssOrig = si.map(richText), ssRes = ssOrig.map(function (t) { return maskText(t, textOpt); }), ssUsed = false;

        var relMap = {};
        if (rels) { var rl = rels.getElementsByTagName('Relationship'); for (var i = 0; i < rl.length; i++) relMap[rl[i].getAttribute('Id')] = rl[i].getAttribute('Target'); }
        var sheets = [], sh = wb.getElementsByTagName('sheet');
        for (var k = 0; k < sh.length; k++) {
          var rid = sh[k].getAttribute('r:id') || sh[k].getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
          var target = relMap[rid] || ('worksheets/sheet' + (k + 1) + '.xml');
          var path = target.charAt(0) === '/' ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
          if (zip.file(path)) sheets.push({ name: sh[k].getAttribute('name') || ('시트' + (k + 1)), path: path });
        }
        if (!sheets.length) throw new Error('시트를 찾지 못했습니다.');

        return Promise.all(sheets.map(function (s) { return zip.file(s.path).async('string'); })).then(function (xmls) {
          var outSheets = [];
          xmls.forEach(function (xml, si2) {
            var doc = xmlDoc(xml), rowsEl = doc.getElementsByTagName('row'), changedSheet = false;
            var preview = [], headerRow = -1, colTypes = {}, columns = [];
            function cellValue(c) {
              var t = c.getAttribute('t');
              if (t === 's') { var v = kids(c, 'v')[0]; return v ? (ssOrig[+v.textContent] || '') : ''; }
              if (t === 'inlineStr') { var is = kids(c, 'is')[0]; return is ? richText(is) : ''; }
              var vv = kids(c, 'v')[0]; return vv ? vv.textContent : '';
            }
            /* 행별 칸 값(열 번호 기준) — 머리글 판단과 이름 열 추정에 사용 */
            var grid = [];
            for (var gr = 0; gr < rowsEl.length && gr < 300; gr++) {
              var line = [];
              kids(rowsEl[gr], 'c').forEach(function (c, ci) {
                if (kids(c, 'f').length) return;
                var ref = c.getAttribute('r'), idx2 = ref ? colIndex(colOf(ref)) : ci;
                line[idx2] = cellValue(c);
              });
              grid.push(line);
            }
            /* 머리글 행: 값이 2칸 이상인 첫 행. 단, 전화·이메일 등 개인정보가 있으면 데이터로 봄 */
            var firstRow = -1;
            for (var r = 0; r < grid.length && r < 20; r++) {
              if (grid[r].filter(function (v) { return v && String(v).trim(); }).length >= 2) { firstRow = r; break; }
            }
            if (firstRow >= 0 && !grid[firstRow].some(hasPII)) {
              headerRow = firstRow;
              grid[firstRow].forEach(function (v, ci) {
                var ht = headerType(v);
                if (ht) { colTypes[colLetter(ci)] = ht; columns.push({ header: v, col: colLetter(ci), type: ht, on: columnOn(ht, on) }); }
              });
            }
            var dataFrom = headerRow >= 0 ? headerRow + 1 : 0;
            if (on.name !== false && !columns.some(function (c) { return c.type === 'name'; })) {
              var skipCols = {};
              Object.keys(colTypes).forEach(function (L) { skipCols[colIndex(L)] = 1; });
              guessNameColumns(grid.slice(dataFrom), skipCols).forEach(function (ci) {
                var L = colLetter(ci);
                colTypes[L] = 'name';
                columns.push({ header: headerRow >= 0 && grid[headerRow][ci] ? grid[headerRow][ci] : '이름 추정', col: L, type: 'name', on: true, guessed: true });
              });
            }
            for (r = 0; r < rowsEl.length; r++) {
              var cells = kids(rowsEl[r], 'c'), pRow = r < CONFIG.XLSX_PREVIEW_ROWS ? [] : null;
              cells.forEach(function (c, ci) {
                var ref = c.getAttribute('r'), col = ref ? colOf(ref) : null, t = c.getAttribute('t');
                var hasF = kids(c, 'f').length > 0, orig = cellValue(c), shown = orig, changed = false;
                var ct = col && r >= dataFrom ? colTypes[col] : null;
                if (!hasF && orig.trim() && t !== 'str' && t !== 'b' && t !== 'e') {
                  if (ct && columnOn(ct, on)) {
                    shown = maskValue(ct, orig.trim(), o); setInline(c, shown); changed = true; count([{ type: ct }]);
                  } else if (t === 's') {
                    var idx = +kids(c, 'v')[0].textContent, res = ssRes[idx];
                    if (res && res.items.length) { shown = res.text; changed = true; ssUsed = true; count(res.items); }
                  } else {
                    var res2 = maskText(orig, textOpt);
                    if (res2.items.length) { shown = res2.text; setInline(c, shown); changed = true; count(res2.items); }
                  }
                }
                if (changed) changedSheet = true;
                if (pRow) {
                  var pi = col ? colIndex(col) : ci;
                  if (pi < CONFIG.XLSX_PREVIEW_COLS) { while (pRow.length < pi) pRow.push({ v: '', changed: false }); pRow[pi] = { v: hasF ? '(수식) ' + orig : shown, changed: changed }; }
                }
              });
              if (pRow) preview.push(pRow);
            }
            if (changedSheet) zip.file(sheets[si2].path, new XMLSerializer().serializeToString(doc));
            outSheets.push({ name: sheets[si2].name, rows: preview, columns: columns, rowCount: rowsEl.length });
          });
          if (ssDoc && ssUsed) {
            si.forEach(function (node, i) { if (ssRes[i].items.length) setRichText(node, ssRes[i].text); });
            zip.file('xl/sharedStrings.xml', new XMLSerializer().serializeToString(ssDoc));
          }
          return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }).then(function (blob) {
            return { blob: blob, counts: counts, total: total, sheets: outSheets };
          });
        });
      });
    });
  }

  /* ====================== 파일 읽기 ====================== */
  function extOf(name) { var m = /\.([^.]+)$/.exec(name || ''); return m ? m[1].toLowerCase() : ''; }
  function decodeText(buf) {
    var b = new Uint8Array(buf);
    if (b[0] === 0xFF && b[1] === 0xFE) return { text: new TextDecoder('utf-16le').decode(buf.slice(2)), enc: 'UTF-16' };
    if (b[0] === 0xFE && b[1] === 0xFF) return { text: new TextDecoder('utf-16be').decode(buf.slice(2)), enc: 'UTF-16' };
    try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^\ufeff/, ''), enc: 'UTF-8' }; }
    catch (e) { return { text: new TextDecoder('euc-kr').decode(buf), enc: 'EUC-KR(CP949)' }; }
  }

  /* ====================== 화면 ====================== */
  var CSS = [
    '#R{box-sizing:border-box;max-width:900px;margin:24px auto;color:#17283e;font:16px/1.65 system-ui,-apple-system,"Malgun Gothic",sans-serif;overflow-wrap:anywhere;}',
    '#R *{box-sizing:border-box;}',
    '#R .bdpm-card{border:1px solid #dbe3ee;border-radius:18px;background:#fff;padding:clamp(14px,3vw,28px);}',
    '#R .bdpm-kicker{margin:0;color:#1a6491;font-size:13px;font-weight:800;letter-spacing:.08em;}',
    '#R .bdpm-title{margin:6px 0 10px;color:#17283e;font-size:clamp(23px,4vw,32px);line-height:1.3;}',
    '#R .bdpm-lead{margin:0 0 16px;}',
    '#R .bdpm-label{display:flex;justify-content:space-between;gap:8px;align-items:baseline;font-weight:700;margin:14px 0 6px;}',
    '#R .bdpm-label small{font-weight:400;color:#53697b;font-size:13px;}',
    '#R textarea,#R input[type=text]{font:15px/1.6 ui-monospace,Consolas,"Malgun Gothic",monospace;width:100%;border:1px solid #bac9de;border-radius:10px;padding:10px 12px;background:#fff;color:#17283e;}',
    '#R textarea{min-height:170px;resize:vertical;}',
    '#R textarea:focus,#R input[type=text]:focus,#R select:focus{outline:3px solid #f2b705;outline-offset:1px;}',
    '#R .bdpm-btns{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 0;}',
    '#R .bdpm-btn{font:inherit;font-size:15px;min-height:44px;border:1px solid #bac9de;border-radius:10px;padding:8px 14px;background:#fff;color:#17283e;cursor:pointer;}',
    '#R .bdpm-btn:hover{background:#f2f6fb;}',
    '#R .bdpm-btn:focus-visible{outline:3px solid #f2b705;outline-offset:2px;}',
    '#R .bdpm-btn.is-primary{background:#1a6491;border-color:#1a6491;color:#fff;font-weight:700;}',
    '#R .bdpm-btn.is-primary:hover{background:#155277;}',
    '#R .bdpm-box{margin-top:16px;padding:14px;border:1px solid #dbe3ee;border-radius:14px;background:#f8fafc;}',
    '#R .bdpm-box legend{font-weight:700;padding:0 6px;}',
    '#R fieldset.bdpm-box{margin:16px 0 0;}',
    '#R .bdpm-types{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:2px 10px;}',
    '#R .bdpm-types label{display:flex;gap:7px;align-items:center;min-height:36px;font-size:14.5px;line-height:1.35;cursor:pointer;}',
    '#R .bdpm-types input{width:18px;height:18px;flex:0 0 18px;accent-color:#1a6491;}',
    '#R .bdpm-opts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr));gap:10px 14px;margin-top:12px;}',
    '#R .bdpm-opts label{display:block;font-size:14px;color:#53697b;}',
    '#R .bdpm-opts select{display:block;width:100%;margin-top:4px;font:inherit;font-size:15px;min-height:42px;border:1px solid #bac9de;border-radius:9px;padding:6px 10px;background:#fff;color:#17283e;}',
    '#R .bdpm-preview{white-space:pre-wrap;word-break:break-all;font:15px/1.75 ui-monospace,Consolas,"Malgun Gothic",monospace;background:#fff;border:1px solid #bac9de;border-radius:10px;padding:10px 12px;min-height:120px;max-height:420px;overflow:auto;}',
    '#R .bdpm-preview mark{background:#fff1b8;color:#17283e;border-radius:3px;padding:0 1px;box-shadow:inset 0 -2px 0 #f2b705;}',
    '#R .bdpm-empty{color:#8a9aa8;}',
    '#R .bdpm-stats{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 0;padding:0;list-style:none;}',
    '#R .bdpm-stats li{margin:0;padding:3px 10px;border-radius:999px;background:#e7f1f8;color:#17425f;font-size:13px;font-weight:700;}',
    '#R .bdpm-stats li.is-none{background:#f1f3f5;color:#6b7f90;font-weight:400;}',
    '#R .bdpm-msg{min-height:1.6em;margin:12px 0 0;padding:10px 12px;border-radius:10px;background:#f4f7fb;font-size:14px;}',
    '#R .bdpm-msg:empty{display:none;}',
    '#R .bdpm-msg.is-error{background:#fff3df;}',
    '#R .bdpm-msg.is-ok{background:#edf8f1;}',
    '#R .bdpm-warn{margin:12px 0 0;font-size:13px;color:#7a4b00;background:#fff8e6;border-radius:10px;padding:10px 12px;}',
    '#R .bdpm-foot{margin:14px 0 0;font-size:12px;color:#6b7f90;}',
    '#R .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;}',
    '#R .bdpm-drop{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;border:2px dashed #96b9ce;border-radius:14px;background:#f2f9fc;padding:12px 14px;transition:background .15s;}',
    '#R .bdpm-drop.is-over{background:#dceff9;}',
    '#R .bdpm-filebtn{position:relative;display:inline-flex;align-items:center;min-height:44px;padding:8px 16px;border-radius:10px;background:#1a6491;color:#fff;font-weight:700;cursor:pointer;}',
    '#R .bdpm-filebtn:focus-within{outline:3px solid #f2b705;outline-offset:2px;}',
    '#R .bdpm-file{position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;}',
    '#R .bdpm-small{font-size:13px;color:#53697b;}',
    '#R p.bdpm-small{margin:8px 0 0;}',
    '#R .bdpm-fileinfo{margin:10px 0 0;padding:8px 12px;border-radius:10px;background:#eef6fb;font-size:14px;}',
    '#R textarea.is-locked{background:#f4f6f8;color:#6b7f90;}',
    '#R .bdpm-btn[disabled]{opacity:.45;cursor:not-allowed;}',
    '#R .bdpm-btn[hidden]{display:none;}',
    '#R .bdpm-stats li.is-col{background:#e9f7ee;color:#1d6b3a;}',
    '#R .bdpm-sheet{margin:4px 0 6px;font-weight:700;font-family:system-ui,sans-serif;}',
    '#R .bdpm-sheet small{font-weight:400;color:#53697b;}',
    '#R .bdpm-tablewrap{overflow:auto;margin-bottom:12px;}',
    '#R .bdpm-table{border-collapse:collapse;font-size:13px;line-height:1.5;white-space:nowrap;}',
    '#R .bdpm-table td{border:1px solid #dbe3ee;padding:4px 8px;}',
    '#R .bdpm-table tr:first-child td{background:#eaf2f8;font-weight:700;}',
    '#R .bdpm-table td.is-masked{background:#fff1b8;box-shadow:inset 0 -2px 0 #f2b705;}'
  ].join('\n');

  var LABEL = {};
  CONFIG.TYPES.forEach(function (t) { LABEL[t.id] = t.label; });

  function esc(s) { return s.replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  function init(target) {
    var root = typeof target === 'string' ? document.querySelector(target) : (target || document.getElementById(CONFIG.ROOT_ID));
    if (!root || root.getAttribute('data-bd-ready')) return root && root.barodoguApi;
    root.setAttribute('data-bd-ready', CONFIG.VERSION);
    if (!root.id) root.id = CONFIG.ROOT_ID;
    var uid = root.id;

    if (!document.getElementById('bdpm-style-' + uid)) {
      var st = document.createElement('style');
      st.id = 'bdpm-style-' + uid;
      st.textContent = CSS.replace(/#R/g, '#' + uid);
      (document.head || document.documentElement).appendChild(st);
    }

    var typeBoxes = CONFIG.TYPES.map(function (t) {
      return '<label><input type="checkbox" data-type="' + t.id + '"' + (t.on ? ' checked' : '') + '>' + esc(t.label) + '</label>';
    }).join('');
    var chOpts = CONFIG.MASK_CHARS.map(function (c, i) { return '<option value="' + c + '"' + (i === 0 ? ' selected' : '') + '>' + c + '</option>'; }).join('');
    var accept = CONFIG.TEXT_EXT.map(function (e) { return '.' + e; }).concat(['.xlsx']).join(',');

    root.innerHTML =
      '<div class="bdpm-card">' +
      '<p class="bdpm-kicker">바로도구 / BD082</p>' +
      '<p class="bdpm-title" role="heading" aria-level="2">개인정보 마스킹</p>' +
      '<p class="bdpm-lead">텍스트를 붙여 넣거나 파일을 올리면 이름·전화번호·이메일 등 개인정보를 찾아 일부를 가려 드립니다. 공유하기 전에 한 번 거쳐 가세요.</p>' +
      '<div class="bdpm-drop" data-el="drop">' +
      '<label class="bdpm-filebtn">📄 파일 열기<input class="bdpm-file" data-el="file" type="file" accept="' + accept + '"></label>' +
      '<span class="bdpm-small">TXT · CSV · TSV · LOG · JSON · MD · 엑셀(XLSX) / 최대 ' + CONFIG.MAX_FILE_MB + 'MB · PC는 여기로 끌어다 놓기</span>' +
      '</div>' +
      '<p class="bdpm-fileinfo" data-el="fileinfo" hidden></p>' +
      '<label class="bdpm-label" for="' + uid + '-in">① 원문 붙여넣기 <small data-el="count">0자</small></label>' +
      '<textarea id="' + uid + '-in" data-el="input" spellcheck="false" placeholder="예) 성함: 홍길동 / 연락처 010-1234-5678&#10;엑셀 표를 복사해 붙여 넣으면 \'이름\'·\'주소\' 열도 알아서 가립니다."></textarea>' +
      '<div class="bdpm-btns"><button type="button" class="bdpm-btn" data-el="sample">예시 넣기</button>' +
      '<button type="button" class="bdpm-btn" data-el="clear">모두 지우기</button></div>' +
      '<label class="bdpm-label" for="' + uid + '-words">② 직접 가릴 단어 <small>쉼표(,)로 구분</small></label>' +
      '<input type="text" id="' + uid + '-words" data-el="words" placeholder="예) 홍길동, 김철수, ○○상사" autocomplete="off">' +
      '<fieldset class="bdpm-box"><legend>③ 찾을 항목</legend><div class="bdpm-types" data-el="types">' + typeBoxes + '</div>' +
      '<div class="bdpm-opts">' +
      '<label>가림 문자<select data-el="ch">' + chOpts + '</select></label>' +
      '<label>가림 길이<select data-el="fixed"><option value="0" selected>원래 글자 수만큼</option><option value="1">항상 ' + CONFIG.FIXED_LEN + '자 (길이 숨김)</option></select></label>' +
      '<label>가림 강도<select data-el="strong"><option value="0" selected>기본 (표준 예시 기준)</option><option value="1">강하게 (더 많이 가림)</option></select></label>' +
      '</div></fieldset>' +
      '<p class="bdpm-label" id="' + uid + '-out-h">④ 마스킹 결과 <small>노란색이 가린 부분</small></p>' +
      '<div class="bdpm-preview" data-el="preview" aria-labelledby="' + uid + '-out-h" tabindex="0"><span class="bdpm-empty">원문을 붙여 넣거나 파일을 열면 여기에 결과가 바로 표시됩니다.</span></div>' +
      '<p class="bdpm-small" data-el="pnote" hidden></p>' +
      '<ul class="bdpm-stats" data-el="stats" aria-label="찾은 항목 수"></ul>' +
      '<div class="bdpm-btns"><button type="button" class="bdpm-btn is-primary" data-el="copy">결과 복사</button>' +
      '<button type="button" class="bdpm-btn" data-el="save">TXT로 저장</button></div>' +
      '<p class="bdpm-warn">⚠️ 자동 감지는 정해진 형식만 찾습니다. 문장 속 이름·주소, 띄어쓰기가 특이한 번호는 놓칠 수 있으니 결과를 꼭 눈으로 확인하고, 놓친 이름은 ②에 적어 주세요.</p>' +
      '<div class="bdpm-msg" data-el="msg" role="status" aria-live="polite"></div>' +
      '<p class="bdpm-foot">바로도구 · BD082 · v' + CONFIG.VERSION + ' · 입력 내용과 파일은 서버로 전송되지 않고 이 브라우저에서만 처리 · 엑셀 처리: JSZip (MIT)</p>' +
      '</div>';

    var el = {}, nodes = root.querySelectorAll('[data-el]');
    for (var i = 0; i < nodes.length; i++) el[nodes[i].getAttribute('data-el')] = nodes[i];
    var last = { text: '', items: [] }, timer = null;
    var file = null;     // { name, ext, kind:'text'|'xlsx', buf, enc }
    var xlsxOut = null, xlsxSeq = 0;

    function msg(t, type) { el.msg.textContent = t || ''; el.msg.className = 'bdpm-msg' + (type ? ' is-' + type : ''); }

    function options() {
      var types = {}, boxes = el.types.querySelectorAll('input[data-type]');
      for (var j = 0; j < boxes.length; j++) types[boxes[j].getAttribute('data-type')] = boxes[j].checked;
      var words = el.words.value.split(/[,，\n]/).map(function (w) { return w.trim(); }).filter(function (w) { return w.length > 0; });
      var delimiter = 'auto';
      if (file && file.kind === 'text') delimiter = file.ext === 'csv' ? ',' : file.ext === 'tsv' ? '\t' : 'auto';
      return { types: types, words: words, ch: el.ch.value, fixed: el.fixed.value === '1', strong: el.strong.value === '1', delimiter: delimiter };
    }

    function maskedName() {
      if (!file) return 'masked-' + new Date().toISOString().slice(0, 10) + '.txt';
      var base = file.name.replace(/\.[^.]+$/, '');
      return base + '-masked.' + (file.ext || 'txt');
    }
    function updateButtons() {
      el.save.textContent = file ? (file.kind === 'xlsx' ? '엑셀 파일로 저장' : file.ext.toUpperCase() + ' 파일로 저장') : 'TXT로 저장';
      el.copy.hidden = !!(file && file.kind === 'xlsx');
    }

    function columnChips(columns) {
      return (columns || []).filter(function (c) { return c.on; }).map(function (c) {
        return '<li class="is-col">' + (c.guessed ? '이름 열 추정: ' : '열 인식: ') + esc(c.guessed && c.header === '이름 추정' ? '' : c.header) + (c.col ? (c.guessed && c.header === '이름 추정' ? '' : ' ') + '(' + esc(c.col) + '열)' : '') + '</li>';
      }).join('');
    }
    function statChips(counts, total, columns) {
      var chips = CONFIG.TYPES.filter(function (t) { return counts[t.id]; }).map(function (t) { return '<li>' + esc(t.label.replace(/ \(.*\)$/, '')) + ' ' + counts[t.id] + '</li>'; });
      el.stats.innerHTML = total ? '<li>총 ' + total + '곳</li>' + chips.join('') + columnChips(columns)
        : '<li class="is-none">찾은 개인정보가 없습니다 — 형식이 다르면 ②에 직접 적어 주세요</li>' + columnChips(columns);
    }

    function renderText() {
      var text = el.input.value;
      el.count.textContent = text.length.toLocaleString() + '자';
      el.pnote.hidden = true;
      if (text.length > CONFIG.MAX_CHARS) {
        msg('입력이 ' + CONFIG.MAX_CHARS.toLocaleString() + '자를 넘습니다. 나눠서 처리해 주세요.', 'error');
        return;
      }
      if (!text) {
        last = { text: '', items: [] };
        el.preview.innerHTML = '<span class="bdpm-empty">원문을 붙여 넣거나 파일을 열면 여기에 결과가 바로 표시됩니다.</span>';
        el.stats.innerHTML = '';
        return;
      }
      last = maskText(text, options());
      var html = '', pos = 0, cap = CONFIG.PREVIEW_CHARS;
      for (var k = 0; k < last.items.length; k++) {
        var it = last.items[k];
        if (it.start >= cap) break;
        html += esc(last.text.slice(pos, it.start)) + '<mark title="' + esc(LABEL[it.type] || '') + '">' + esc(last.text.slice(it.start, it.end)) + '</mark>';
        pos = it.end;
      }
      html += esc(last.text.slice(pos, Math.max(pos, cap)));
      el.preview.innerHTML = html;
      if (last.text.length > cap) { el.pnote.hidden = false; el.pnote.textContent = '미리보기는 앞부분 ' + cap.toLocaleString() + '자까지만 표시합니다. 복사·저장에는 전체 결과가 들어갑니다.'; }
      var cnt = {};
      last.items.forEach(function (x) { cnt[x.type] = (cnt[x.type] || 0) + 1; });
      statChips(cnt, last.items.length, last.columns);
    }

    function renderXlsx() {
      var seq = ++xlsxSeq;
      el.preview.innerHTML = '<span class="bdpm-empty">엑셀 파일을 처리하는 중입니다…</span>';
      maskXlsx(file.buf.slice(0), options()).then(function (res) {
        if (seq !== xlsxSeq) return;
        xlsxOut = res;
        var html = '';
        res.sheets.forEach(function (sh) {
          html += '<p class="bdpm-sheet">📄 ' + esc(sh.name) + ' <small>(' + sh.rowCount.toLocaleString() + '행' + (sh.rowCount > CONFIG.XLSX_PREVIEW_ROWS ? ', 앞 ' + CONFIG.XLSX_PREVIEW_ROWS + '행 미리보기' : '') + ')</small></p>';
          if (!sh.rows.length) { html += '<p class="bdpm-empty">빈 시트</p>'; return; }
          html += '<div class="bdpm-tablewrap"><table class="bdpm-table"><tbody>';
          sh.rows.forEach(function (row) {
            html += '<tr>' + row.map(function (c) { return '<td' + (c.changed ? ' class="is-masked"' : '') + '>' + esc(c.v) + '</td>'; }).join('') + '</tr>';
          });
          html += '</tbody></table></div>';
        });
        el.preview.innerHTML = html;
        var cols = [];
        res.sheets.forEach(function (sh) { cols = cols.concat(sh.columns); });
        statChips(res.counts, res.total, cols);
      }).catch(function (err) {
        if (seq !== xlsxSeq) return;
        xlsxOut = null;
        el.preview.innerHTML = '<span class="bdpm-empty">엑셀 파일을 처리하지 못했습니다.</span>';
        msg((err && err.message) || '엑셀 파일을 처리하지 못했습니다.', 'error');
      });
    }

    function render() { if (file && file.kind === 'xlsx') renderXlsx(); else renderText(); }
    function schedule() { clearTimeout(timer); timer = setTimeout(render, file && file.kind === 'xlsx' ? 400 : CONFIG.DEBOUNCE_MS); }

    function setTextMode(on) {
      el.input.readOnly = !on;
      el.sample.disabled = !on;
      el.input.classList.toggle('is-locked', !on);
    }

    function resetFile() {
      file = null; xlsxOut = null; xlsxSeq++;
      el.fileinfo.hidden = true; el.fileinfo.textContent = '';
      setTextMode(true); updateButtons();
    }

    function openFile(f) {
      if (!f) return;
      var ext = extOf(f.name);
      if (ext === 'xls') { msg('예전 엑셀 형식(.xls)은 지원하지 않습니다. 엑셀에서 \'다른 이름으로 저장 → Excel 통합 문서(.xlsx)\'로 저장한 뒤 열어 주세요.', 'error'); return; }
      if (ext !== 'xlsx' && CONFIG.TEXT_EXT.indexOf(ext) < 0) { msg('지원하지 않는 파일 형식입니다. (TXT·CSV·TSV·LOG·JSON·MD·XLSX)', 'error'); return; }
      if (f.size > CONFIG.MAX_FILE_MB * 1048576) { msg('파일이 ' + CONFIG.MAX_FILE_MB + 'MB를 넘습니다. 나눠서 처리해 주세요.', 'error'); return; }
      msg('파일을 읽는 중입니다…');
      f.arrayBuffer().then(function (buf) {
        if (ext === 'xlsx') {
          file = { name: f.name, ext: ext, kind: 'xlsx', buf: buf };
          el.input.value = '';
          el.count.textContent = '엑셀 파일';
          setTextMode(false);
          el.input.placeholder = '엑셀 파일은 아래 ④ 결과에서 시트별로 확인하세요. 텍스트를 직접 넣으려면 \'모두 지우기\'를 누르세요.';
          el.fileinfo.hidden = false;
          el.fileinfo.textContent = '📎 ' + f.name + ' · ' + (f.size / 1024).toFixed(0) + 'KB · 엑셀(XLSX) — 서식은 그대로 두고 값만 가립니다';
          updateButtons(); render();
          msg('엑셀 파일을 열었습니다. 결과를 확인한 뒤 \'엑셀 파일로 저장\'을 누르세요.', 'ok');
          return;
        }
        var dec = decodeText(buf);
        if (dec.text.length > CONFIG.MAX_CHARS) { msg('파일 내용이 ' + CONFIG.MAX_CHARS.toLocaleString() + '자를 넘습니다. 나눠서 처리해 주세요.', 'error'); return; }
        file = { name: f.name, ext: ext, kind: 'text', enc: dec.enc };
        setTextMode(true);
        el.input.value = dec.text;
        el.fileinfo.hidden = false;
        el.fileinfo.textContent = '📎 ' + f.name + ' · ' + (f.size / 1024).toFixed(0) + 'KB · ' + dec.enc + (dec.enc !== 'UTF-8' ? ' → 저장은 UTF-8' : '') +
          (ext === 'csv' || ext === 'tsv' ? ' · 첫 줄 머리글로 이름·주소·생년월일 열 인식' : '');
        updateButtons(); render();
        msg('파일을 열었습니다. 원문 칸에서 내용을 고칠 수도 있습니다.', 'ok');
      }).catch(function () { msg('파일을 읽지 못했습니다.', 'error'); });
    }

    el.input.addEventListener('input', function () { msg(''); schedule(); });
    el.words.addEventListener('input', schedule);
    root.addEventListener('change', function (e) { if (e.target.closest && e.target.closest('fieldset')) render(); });
    el.file.addEventListener('change', function () { openFile(el.file.files && el.file.files[0]); el.file.value = ''; });
    function hasFiles(e) { var t = e.dataTransfer && e.dataTransfer.types; return t && Array.prototype.indexOf.call(t, 'Files') >= 0; }
    [el.drop, el.input].forEach(function (zone) {
      zone.addEventListener('dragover', function (e) { if (!hasFiles(e)) return; e.preventDefault(); el.drop.classList.add('is-over'); });
      zone.addEventListener('dragleave', function () { el.drop.classList.remove('is-over'); });
      zone.addEventListener('drop', function (e) {
        if (!hasFiles(e)) return;
        e.preventDefault(); el.drop.classList.remove('is-over');
        openFile(e.dataTransfer.files[0]);
      });
    });
    el.sample.addEventListener('click', function () { resetFile(); el.input.value = EXAMPLE; render(); msg('예시 문장을 넣었습니다. 옵션을 바꿔 결과를 비교해 보세요.', 'ok'); });
    el.clear.addEventListener('click', function () {
      resetFile();
      el.input.value = ''; el.words.value = '';
      el.input.placeholder = '예) 성함: 홍길동 / 연락처 010-1234-5678\n엑셀 표를 복사해 붙여 넣으면 \'이름\'·\'주소\' 열도 알아서 가립니다.';
      render(); msg('입력 내용을 지웠습니다.'); el.input.focus();
    });
    el.copy.addEventListener('click', function () {
      if (!last.text) { msg('먼저 원문을 붙여 넣어 주세요.', 'error'); return; }
      copyText(last.text).then(function (ok) {
        msg(ok ? '마스킹 결과를 복사했습니다. 붙여 넣기 전에 한 번 더 확인해 주세요.' : '복사하지 못했습니다. 결과 칸을 길게 눌러 직접 복사해 주세요.', ok ? 'ok' : 'error');
      });
    });
    function download(blob, name) {
      var a = document.createElement('a'), url = URL.createObjectURL(blob);
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    }
    el.save.addEventListener('click', function () {
      if (file && file.kind === 'xlsx') {
        if (!xlsxOut) { msg('엑셀 파일 처리가 끝난 뒤 다시 눌러 주세요.', 'error'); return; }
        download(xlsxOut.blob, maskedName());
        msg('마스킹한 엑셀 파일을 저장했습니다: ' + maskedName() + ' — 원본 파일은 그대로입니다.', 'ok');
        return;
      }
      if (!last.text) { msg('먼저 원문을 붙여 넣어 주세요.', 'error'); return; }
      var ext = file ? file.ext : 'txt', bom = CONFIG.BOM_EXT.indexOf(ext) >= 0 ? '﻿' : '';
      var mime = ext === 'json' ? 'application/json' : ext === 'csv' ? 'text/csv' : 'text/plain';
      download(new Blob([bom + last.text], { type: mime + ';charset=utf-8' }), maskedName());
      msg('저장했습니다: ' + maskedName() + (file && file.enc !== 'UTF-8' ? ' (UTF-8로 저장)' : ''), 'ok');
    });

    updateButtons();
    var api = { render: render, openFile: openFile, getResult: function () { return file && file.kind === 'xlsx' ? xlsxOut : last; } };
    root.barodoguApi = api;
    return api;
  }

  barodogu.privacyMasking = {
    version: CONFIG.VERSION,
    CONFIG: CONFIG,
    init: init,
    detect: detect,
    maskText: maskText,
    maskValue: maskValue,
    maskXlsx: maskXlsx,
    parseTable: parseTable,
    guessNameColumns: guessNameColumns,
    headerType: headerType,
    decodeText: decodeText,
    luhn: luhn
  };

  function auto() { if (document.getElementById(CONFIG.ROOT_ID)) init(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto, { once: true });
  else auto();
})(window, document);
