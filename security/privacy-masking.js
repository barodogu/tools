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
 *            ※ 입력 내용은 서버로 전송하지 않고 사용자 브라우저 안에서만 처리
 * 기준     : 항목별 가림 위치는 ISMS-P 인증기준 해설의 표시제한 예시와
 *            카드업계 보안표준(PCI DSS, 앞 6·뒤 4자리) 관행을 참고한 기본값
 * 사용법   : 글에 <div id="barodogu-privacy-masking"></div> 를 넣고
 *            이 파일을 <script src="…" defer></script> 로 불러오면 화면을 그립니다.
 * 버전     : 1.0.0
 * 최종수정 : 2026-10-22
 * ============================================================
 */
(function (window, document) {
  'use strict';

  var barodogu = window.barodogu = window.barodogu || {};

  /* ---------- 기준값: 이 객체만 수정하면 됩니다 ---------- */
  var CONFIG = {
    VERSION: '1.0.0',
    UPDATED: '2026-10-22',
    ROOT_ID: 'barodogu-privacy-masking',
    MAX_CHARS: 200000,        // 입력 최대 글자 수
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
      { id: 'name',    label: "'이름:' 뒤 이름", on: true },
      { id: 'addr',    label: "'주소:' 뒤 상세주소", on: true },
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

  /** 텍스트 전체 마스킹 → { text, items:[{type, from, to, start, end}] } */
  function maskText(text, opt) {
    opt = opt || {};
    var o = { ch: opt.ch || '*', fixed: !!opt.fixed, strong: !!opt.strong };
    var hits = detect(text, opt), out = '', pos = 0, items = [];
    hits.forEach(function (h) {
      var rep = maskValue(h.type, h.text, o);
      out += text.slice(pos, h.start);
      items.push({ type: h.type, from: h.text, to: rep, start: out.length, end: out.length + rep.length });
      out += rep; pos = h.end;
    });
    out += text.slice(pos);
    return { text: out, items: items };
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
    '#R .bdpm-types{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:2px 10px;}',
    '#R .bdpm-types label{display:flex;gap:8px;align-items:center;min-height:36px;font-size:15px;cursor:pointer;}',
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
    '#R .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;}'
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

    root.innerHTML =
      '<div class="bdpm-card">' +
      '<p class="bdpm-kicker">바로도구 / BD082</p>' +
      '<p class="bdpm-title" role="heading" aria-level="2">개인정보 마스킹</p>' +
      '<p class="bdpm-lead">텍스트를 붙여 넣으면 이름·전화번호·이메일 등 개인정보를 찾아 일부를 가려 드립니다. 공유하기 전에 한 번 거쳐 가세요.</p>' +
      '<label class="bdpm-label" for="' + uid + '-in">① 원문 붙여넣기 <small data-el="count">0자</small></label>' +
      '<textarea id="' + uid + '-in" data-el="input" spellcheck="false" placeholder="예) 성함: 홍길동 / 연락처 010-1234-5678"></textarea>' +
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
      '<div class="bdpm-preview" data-el="preview" aria-labelledby="' + uid + '-out-h" tabindex="0"><span class="bdpm-empty">원문을 붙여 넣으면 여기에 결과가 바로 표시됩니다.</span></div>' +
      '<ul class="bdpm-stats" data-el="stats" aria-label="찾은 항목 수"></ul>' +
      '<div class="bdpm-btns"><button type="button" class="bdpm-btn is-primary" data-el="copy">결과 복사</button>' +
      '<button type="button" class="bdpm-btn" data-el="save">TXT로 저장</button></div>' +
      '<p class="bdpm-warn">⚠️ 자동 감지는 정해진 형식만 찾습니다. 문장 속 이름·주소, 띄어쓰기가 특이한 번호는 놓칠 수 있으니 결과를 꼭 눈으로 확인하고, 놓친 이름은 ②에 적어 주세요.</p>' +
      '<div class="bdpm-msg" data-el="msg" role="status" aria-live="polite"></div>' +
      '<p class="bdpm-foot">바로도구 · BD082 · v' + CONFIG.VERSION + ' · 입력 내용은 서버로 전송되지 않고 이 브라우저에서만 처리</p>' +
      '</div>';

    var el = {}, nodes = root.querySelectorAll('[data-el]');
    for (var i = 0; i < nodes.length; i++) el[nodes[i].getAttribute('data-el')] = nodes[i];
    var last = { text: '', items: [] }, timer = null;

    function msg(t, type) { el.msg.textContent = t || ''; el.msg.className = 'bdpm-msg' + (type ? ' is-' + type : ''); }

    function options() {
      var types = {}, boxes = el.types.querySelectorAll('input[data-type]');
      for (var j = 0; j < boxes.length; j++) types[boxes[j].getAttribute('data-type')] = boxes[j].checked;
      var words = el.words.value.split(/[,，\n]/).map(function (w) { return w.trim(); }).filter(function (w) { return w.length > 0; });
      return { types: types, words: words, ch: el.ch.value, fixed: el.fixed.value === '1', strong: el.strong.value === '1' };
    }

    function render() {
      var text = el.input.value;
      el.count.textContent = text.length.toLocaleString() + '자';
      if (text.length > CONFIG.MAX_CHARS) {
        msg('입력이 ' + CONFIG.MAX_CHARS.toLocaleString() + '자를 넘습니다. 나눠서 처리해 주세요.', 'error');
        return;
      }
      if (!text) {
        last = { text: '', items: [] };
        el.preview.innerHTML = '<span class="bdpm-empty">원문을 붙여 넣으면 여기에 결과가 바로 표시됩니다.</span>';
        el.stats.innerHTML = '';
        return;
      }
      last = maskText(text, options());
      var html = '', pos = 0;
      last.items.forEach(function (it) {
        html += esc(last.text.slice(pos, it.start)) + '<mark title="' + esc(LABEL[it.type] || '') + '">' + esc(last.text.slice(it.start, it.end)) + '</mark>';
        pos = it.end;
      });
      html += esc(last.text.slice(pos));
      el.preview.innerHTML = html;

      var cnt = {};
      last.items.forEach(function (it) { cnt[it.type] = (cnt[it.type] || 0) + 1; });
      var chips = CONFIG.TYPES.filter(function (t) { return cnt[t.id]; }).map(function (t) { return '<li>' + esc(t.label) + ' ' + cnt[t.id] + '</li>'; });
      el.stats.innerHTML = chips.length ? '<li>총 ' + last.items.length + '곳</li>' + chips.join('') : '<li class="is-none">찾은 개인정보가 없습니다 — 형식이 다르면 ②에 직접 적어 주세요</li>';
    }
    function schedule() { clearTimeout(timer); timer = setTimeout(render, CONFIG.DEBOUNCE_MS); }

    el.input.addEventListener('input', function () { msg(''); schedule(); });
    el.words.addEventListener('input', schedule);
    root.addEventListener('change', function (e) { if (e.target.closest && e.target.closest('fieldset')) render(); });
    el.sample.addEventListener('click', function () { el.input.value = EXAMPLE; render(); msg('예시 문장을 넣었습니다. 옵션을 바꿔 결과를 비교해 보세요.', 'ok'); });
    el.clear.addEventListener('click', function () { el.input.value = ''; el.words.value = ''; render(); msg('입력 내용을 지웠습니다.'); el.input.focus(); });
    el.copy.addEventListener('click', function () {
      if (!last.text) { msg('먼저 원문을 붙여 넣어 주세요.', 'error'); return; }
      copyText(last.text).then(function (ok) {
        msg(ok ? '마스킹 결과를 복사했습니다. 붙여 넣기 전에 한 번 더 확인해 주세요.' : '복사하지 못했습니다. 결과 칸을 길게 눌러 직접 복사해 주세요.', ok ? 'ok' : 'error');
      });
    });
    el.save.addEventListener('click', function () {
      if (!last.text) { msg('먼저 원문을 붙여 넣어 주세요.', 'error'); return; }
      var blob = new Blob(['﻿' + last.text], { type: 'text/plain;charset=utf-8' });
      var a = document.createElement('a'), url = URL.createObjectURL(blob);
      a.href = url; a.download = 'masked-' + new Date().toISOString().slice(0, 10) + '.txt';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      msg('TXT 파일로 저장했습니다.', 'ok');
    });

    var api = { render: render, getResult: function () { return last; } };
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
    luhn: luhn
  };

  function auto() { if (document.getElementById(CONFIG.ROOT_ID)) init(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto, { once: true });
  else auto();
})(window, document);
