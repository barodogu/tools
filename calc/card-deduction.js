/*!
 * 착착도구 · 신용카드 소득공제 "연말까지 얼마 더 써야 하나" 계산기
 * https://barodogu.blogspot.com  ·  GitHub: barodogu/tools  calc/card-deduction.js
 * v1.0 (2026-11-20) · 2026년 사용분(2027년 1월 연말정산) 기준
 *
 * 사용법: 블로그 글에 <div id="bd-carddeduct"></div> 를 넣고 이 스크립트를 불러오면 됩니다.
 * 입력한 금액은 브라우저 안에서만 계산되며, 어디에도 전송·저장되지 않습니다.
 *
 * ★ 매년 바뀌는 숫자는 아래 RULES 한 곳에만 모아 두었습니다. 해가 바뀌면 여기만 고치세요.
 */
(function () {
  'use strict';

  var RULES = {
    year: 2026,                 // 사용 연도 (연말정산은 다음 해 1월)
    thresholdRate: 0.25,        // 총급여의 25%를 넘게 써야 공제 시작
    rate: { credit: 0.15, debit: 0.30, culture: 0.30, market: 0.40, transit: 0.40 },
    incomeSplit: 70000000,      // 총급여 7천만원 기준
    baseLimit: { low: 3000000, high: 2500000 },   // 기본 공제한도
    childAdd: { low: 500000, high: 250000 },      // 자녀 1명당 기본한도 상향 (최대 2명분)
    childMax: 2,
    extraLimit: { low: 3000000, high: 2000000 },  // 전통시장·대중교통(·문화비) 추가한도
    // 연말정산 세율(지방소득세 10% 별도) — 과세표준 구간
    taxBrackets: [
      [14000000, 0.06, 0], [50000000, 0.15, 1260000], [88000000, 0.24, 5760000],
      [150000000, 0.35, 15440000], [300000000, 0.38, 19940000], [500000000, 0.40, 25940000],
      [1000000000, 0.42, 35940000], [Infinity, 0.45, 65940000]
    ],
    insuranceRate: 0.097        // 4대보험 근로자 부담 대략치(과세표준 추정용)
  };

  var ROOT_ID = 'bd-carddeduct';
  var P = 'bdcd';

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  /* ───────────── 계산 로직 ───────────── */

  function baseLimitOf(gross, kids) {
    var low = gross <= RULES.incomeSplit;
    var k = Math.min(Math.max(kids | 0, 0), RULES.childMax);
    return (low ? RULES.baseLimit.low : RULES.baseLimit.high) + k * (low ? RULES.childAdd.low : RULES.childAdd.high);
  }

  // u: {credit, debit, culture, market, transit} (원)
  function compute(gross, kids, u) {
    var low = gross <= RULES.incomeSplit;
    var culture = low ? u.culture : 0;
    var debit = low ? u.debit : u.debit + u.culture; // 7천 초과면 문화비는 일반 사용분으로
    var total = u.credit + debit + culture + u.market + u.transit;
    var threshold = Math.round(gross * RULES.thresholdRate);

    // 문턱(최저사용금액)은 공제율이 낮은 것부터 뺀다: 신용 → 체크·현금 → 문화비 → 전통시장 → 대중교통
    var rem = threshold;
    function take(v) { var t = Math.min(v, rem); rem -= t; return v - t; }
    var c = take(u.credit), d = take(debit), k = take(culture), m = take(u.market), t = take(u.transit);

    var r = RULES.rate;
    var possible = c * r.credit + d * r.debit + k * r.culture + m * r.market + t * r.transit;
    var special = k * r.culture + m * r.market + t * r.transit;
    var limit = baseLimitOf(gross, kids);
    var general = Math.min(possible, limit);
    var over = Math.max(0, possible - limit);
    var extraLimit = low ? RULES.extraLimit.low : RULES.extraLimit.high;
    var extra = Math.min(over, special, extraLimit);
    var deduction = Math.floor(general + extra);

    return {
      low: low, total: total, threshold: threshold, overThreshold: Math.max(0, total - threshold),
      toThreshold: Math.max(0, threshold - total), possible: Math.floor(possible),
      limit: limit, general: Math.floor(general), extraLimit: extraLimit,
      extra: Math.floor(extra), extraRoom: Math.max(0, Math.floor(extraLimit - extra)),
      deduction: deduction, baseFull: possible >= limit
    };
  }

  function addTo(u, key, amt) {
    var n = { credit: u.credit, debit: u.debit, culture: u.culture, market: u.market, transit: u.transit };
    n[key] += amt; return n;
  }

  // 기본한도를 꽉 채우려면 key(결제수단)로 얼마 더 써야 하나 (만원 단위 올림)
  function needToFill(gross, kids, u, key) {
    var now = compute(gross, kids, u);
    if (now.baseFull) return 0;
    var lo = 0, hi = 2e10;
    for (var i = 0; i < 60 && hi - lo > 1000; i++) {
      var mid = (lo + hi) / 2;
      if (compute(gross, kids, addTo(u, key, mid)).baseFull) hi = mid; else lo = mid;
    }
    // 만원 단위로 올리되, 이분탐색 오차 때문에 1만원 더 붙지 않도록 실제로 채워지는 최소값을 확인
    var m = Math.floor(lo / 10000) * 10000;
    while (!compute(gross, kids, addTo(u, key, m)).baseFull) m += 10000;
    return m;
  }

  function earnedIncomeDeduction(g) {
    var d;
    if (g <= 5000000) d = g * 0.7;
    else if (g <= 15000000) d = 3500000 + (g - 5000000) * 0.4;
    else if (g <= 45000000) d = 7500000 + (g - 15000000) * 0.15;
    else if (g <= 100000000) d = 12000000 + (g - 45000000) * 0.05;
    else d = 14750000 + (g - 100000000) * 0.02;
    return Math.min(d, 20000000);
  }

  function estTaxBase(gross) {
    return Math.max(0, gross - earnedIncomeDeduction(gross) - 1500000 - gross * RULES.insuranceRate);
  }

  function taxOn(base) {
    if (base <= 0) return 0;
    var prev = 0, b = RULES.taxBrackets;
    for (var i = 0; i < b.length; i++) {
      if (base <= b[i][0]) return b[i][2] + (base - prev) * b[i][1];
      prev = b[i][0];
    }
    return 0;
  }

  function rateOfBase(base) {
    var b = RULES.taxBrackets;
    for (var i = 0; i < b.length; i++) if (base <= b[i][0]) return b[i][1];
    return 0.45;
  }

  // 공제액 → 아끼는 세금(지방소득세 포함). fixedRate가 있으면 그 세율로 단순 계산
  function saving(gross, deduction, fixedRate) {
    if (deduction <= 0) return 0;
    if (fixedRate) return Math.round(deduction * fixedRate * 1.1);
    var base = estTaxBase(gross);
    return Math.round((taxOn(base) - taxOn(Math.max(0, base - deduction))) * 1.1);
  }

  /* ───────────── 표시 도우미 ───────────── */

  function won(n) { return Math.round(n).toLocaleString('ko-KR') + '원'; }
  function man(n) {
    n = Math.round(n);
    if (n === 0) return '0원';
    var m = Math.floor(n / 10000), r = n % 10000;
    if (m === 0) return n.toLocaleString('ko-KR') + '원';
    if (r === 0) return m.toLocaleString('ko-KR') + '만원';
    return m.toLocaleString('ko-KR') + '만 ' + r.toLocaleString('ko-KR') + '원';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function daysLeft() {
    var now = new Date();
    var end = new Date(RULES.year, 11, 31, 23, 59, 59);
    return Math.ceil((end - now) / 86400000);
  }

  /* ───────────── 스타일 ───────────── */

  function injectStyle() {
    if (document.getElementById(P + '-style')) return;
    var css = [
      '.' + P + '{font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;color:#1f2937;line-height:1.55;max-width:640px;margin:16px auto;box-sizing:border-box;-webkit-text-size-adjust:100%}',
      '.' + P + ' *{box-sizing:border-box}',
      '.' + P + '-card{background:#fff;border:1px solid #dbe4f0;border-radius:16px;padding:16px;margin-bottom:12px;box-shadow:0 1px 3px rgba(15,23,42,.05)}',
      '.' + P + '-head{background:linear-gradient(135deg,#1d4ed8,#3b82f6);color:#fff;border:0}',
      '.' + P + '-head h3{margin:0 0 4px;font-size:19px;color:#fff;border:0;padding:0}',
      '.' + P + '-head p{margin:0;font-size:13.5px;opacity:.95}',
      '.' + P + '-badge{display:inline-block;background:rgba(255,255,255,.2);border-radius:999px;padding:2px 10px;font-size:12px;margin-top:8px}',
      '.' + P + '-t{font-size:15.5px;font-weight:700;margin:0 0 10px;color:#1e3a8a}',
      '.' + P + '-row{display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap}',
      '.' + P + '-row label{flex:1 1 150px;font-size:14.5px;min-width:0}',
      '.' + P + '-row label small{display:block;color:#6b7280;font-size:12px;font-weight:400}',
      '.' + P + '-in{flex:0 0 150px;display:flex;align-items:center;border:1.5px solid #cbd5e1;border-radius:10px;background:#f8fafc;overflow:hidden;max-width:100%}',
      '.' + P + '-in:focus-within{border-color:#2563eb;background:#fff}',
      '.' + P + '-in input,.' + P + '-in select{width:100%;border:0;background:transparent;font-size:16px;padding:10px;text-align:right;outline:none;color:#111827;min-width:0;-webkit-appearance:none;appearance:none}',
      '.' + P + '-in select{text-align:left;text-align-last:left;cursor:pointer}',
      '.' + P + '-in span{padding-right:10px;color:#64748b;font-size:14px;white-space:nowrap}',
      '.' + P + '-dis{opacity:.45}',
      '.' + P + '-note{font-size:12.5px;color:#64748b;margin:2px 0 8px}',
      '.' + P + '-help{font-size:13px;color:#1d4ed8;background:none;border:0;padding:4px 0;cursor:pointer;text-decoration:underline;min-height:32px}',
      '.' + P + '-helpbox{display:none;background:#eff6ff;border-radius:10px;padding:10px 12px;font-size:13px;margin-bottom:10px}',
      '.' + P + '-helpbox ol{margin:4px 0 0 18px;padding:0}',
      '.' + P + '-btns{display:flex;gap:8px;flex-wrap:wrap}',
      '.' + P + '-btn{flex:1 1 140px;min-height:48px;border-radius:12px;border:0;font-size:15.5px;font-weight:700;cursor:pointer;padding:10px 12px;touch-action:manipulation}',
      '.' + P + '-pri{background:#2563eb;color:#fff}',
      '.' + P + '-sec{background:#e0e7ff;color:#1e3a8a}',
      '.' + P + '-ghost{background:#f1f5f9;color:#334155}',
      '.' + P + '-btn:active{transform:scale(.98)}',
      '.' + P + '-err{display:none;background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;border-radius:10px;padding:10px 12px;font-size:14px;margin-bottom:12px}',
      '.' + P + '-res{display:none}',
      '.' + P + '-big{border-radius:14px;padding:14px;margin-bottom:12px;font-size:15.5px}',
      '.' + P + '-big b{font-size:20px}',
      '.' + P + '-st0{background:#fff7ed;border:1.5px solid #fdba74}',
      '.' + P + '-st1{background:#eff6ff;border:1.5px solid #93c5fd}',
      '.' + P + '-st2{background:#ecfdf5;border:1.5px solid #6ee7b7}',
      '.' + P + '-big .' + P + '-em{color:#1d4ed8}',
      '.' + P + '-big p{margin:6px 0 0}',
      '.' + P + '-bar{position:relative;height:22px;background:#e5e7eb;border-radius:999px;margin:28px 4px 30px;overflow:visible}',
      '.' + P + '-fill{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,#60a5fa,#2563eb);border-radius:999px}',
      '.' + P + '-mk{position:absolute;top:-6px;bottom:-6px;width:3px;background:#111827;border-radius:2px}',
      '.' + P + '-mk span{position:absolute;left:50%;transform:translateX(-50%);font-size:11.5px;white-space:nowrap;color:#111827;font-weight:600}',
      '.' + P + '-mk.top span{bottom:100%;margin-bottom:2px}',
      '.' + P + '-mk.bot span{top:100%;margin-top:2px}',
      '.' + P + '-mk.l span{left:0;transform:none}',
      '.' + P + '-mk.r span{left:auto;right:0;transform:none}',
      '.' + P + '-tbl{width:100%;border-collapse:collapse;font-size:14px}',
      '.' + P + '-tbl td{padding:8px 6px;border-bottom:1px solid #eef2f7;vertical-align:top}',
      '.' + P + '-tbl td:last-child{text-align:right;font-weight:600;white-space:nowrap}',
      '.' + P + '-tbl tr.sum td{background:#eff6ff;font-weight:800;color:#1e3a8a;border-bottom:0}',
      '.' + P + '-tbl tr.save td{background:#ecfdf5;font-weight:800;color:#047857}',
      '.' + P + '-cmp{display:flex;gap:8px;flex-wrap:wrap}',
      '.' + P + '-cmp>div{flex:1 1 150px;border-radius:12px;padding:12px;background:#f8fafc;border:1.5px solid #e2e8f0;min-width:0}',
      '.' + P + '-cmp>div.win{border-color:#10b981;background:#ecfdf5}',
      '.' + P + '-cmp h4{margin:0 0 6px;font-size:14.5px;color:#334155}',
      '.' + P + '-cmp .v{font-size:17px;font-weight:800;color:#0f172a}',
      '.' + P + '-cmp .s{font-size:13px;color:#475569}',
      '.' + P + '-tip{background:#fefce8;border:1px solid #fde68a;border-radius:10px;padding:10px 12px;font-size:13.5px;margin-top:10px}',
      '.' + P + '-fill-list{margin:0;padding:0;list-style:none}',
      '.' + P + '-fill-list li{display:flex;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px dashed #e2e8f0;font-size:14.5px}',
      '.' + P + '-fill-list li b{white-space:nowrap}',
      '.' + P + '-foot{font-size:12px;color:#64748b;margin-top:8px}',
      '.' + P + '-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#111827;color:#fff;padding:10px 16px;border-radius:999px;font-size:14px;z-index:99999;opacity:0;transition:opacity .2s;pointer-events:none;max-width:90vw;text-align:center}',
      '.' + P + '-ov{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:99998;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px}',
      '.' + P + '-ov img{max-width:100%;max-height:75vh;border-radius:8px;background:#fff}',
      '.' + P + '-ov p{color:#fff;font-size:15px;margin:12px 0;text-align:center}',
      '.' + P + '-ov button{min-height:44px;padding:8px 20px;border-radius:10px;border:0;font-size:15px;font-weight:700}'
    ].join('\n');
    var st = document.createElement('style');
    st.id = P + '-style';
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }

  /* ───────────── 화면 ───────────── */

  var FIELDS = [
    { k: 'credit', label: '신용카드', sub: '공제율 15%' },
    { k: 'debit', label: '체크카드·현금영수증', sub: '공제율 30% (선불카드·제로페이 포함)' },
    { k: 'culture', label: '도서·공연·영화·헬스장·수영장', sub: '공제율 30% · 총급여 7천만원 이하만' },
    { k: 'market', label: '전통시장', sub: '공제율 40%' },
    { k: 'transit', label: '대중교통', sub: '공제율 40% (버스·지하철·기차)' }
  ];

  function numInput(id, ph, unit) {
    return '<div class="' + P + '-in"><input id="' + id + '" type="text" inputmode="numeric" autocomplete="off" placeholder="' + ph + '"><span>' + unit + '</span></div>';
  }

  function build(root) {
    var dl = daysLeft();
    var dayTxt = dl > 0 ? ('올해 결제 마감까지 <b>' + dl + '일</b> 남았어요') : (RULES.year + '년 사용분 기준 계산기예요');
    var h = '';
    h += '<div class="' + P + '-card ' + P + '-head"><h3>💳 신용카드 소득공제 계산기</h3>' +
      '<p>' + RULES.year + '년에 쓴 카드값 기준 · 다음 해 1월 연말정산</p>' +
      '<span class="' + P + '-badge">🔒 입력한 금액은 이 화면에서만 계산돼요 · ' + dayTxt + '</span></div>';

    h += '<div class="' + P + '-err" role="alert"></div>';

    h += '<div class="' + P + '-card"><p class="' + P + '-t">① 내 정보</p>' +
      '<div class="' + P + '-row"><label for="' + P + '-gross">총급여 (연봉)<small>비과세 수당(식대 등) 뺀 금액</small></label>' + numInput(P + '-gross', '예: 4500', '만원') + '</div>' +
      '<div class="' + P + '-row"><label for="' + P + '-kids">기본공제 받는 자녀 수<small>자녀 있으면 한도가 늘어나요</small></label>' +
      '<div class="' + P + '-in"><select id="' + P + '-kids"><option value="0">없음</option><option value="1">1명</option><option value="2">2명 이상</option></select></div></div>' +
      '<div class="' + P + '-row"><label for="' + P + '-rate">내 세율 구간<small>모르면 ‘자동’ 그대로</small></label>' +
      '<div class="' + P + '-in"><select id="' + P + '-rate"><option value="">자동 추정</option><option value="0.06">6%</option><option value="0.15">15%</option><option value="0.24">24%</option><option value="0.35">35%</option><option value="0.38">38%</option></select></div></div>' +
      '</div>';

    h += '<div class="' + P + '-card"><p class="' + P + '-t">② 지금까지 쓴 금액 (올해 1월~오늘)</p>' +
      '<button type="button" class="' + P + '-help" data-act="help">어디서 확인하나요? ▾</button>' +
      '<div class="' + P + '-helpbox">' +
      '<ol><li><b>카드사 앱</b> → ‘연말정산’ 또는 ‘소득공제 예상’ 메뉴 (가장 빠름)</li>' +
      '<li><b>홈택스·손택스</b> → 장려금·연말정산 → ‘연말정산 미리보기’ (1~9월 사용액)</li>' +
      '<li>체크카드·현금영수증·전통시장·대중교통도 카드사 앱에 나눠서 나와요</li></ol></div>';
    for (var i = 0; i < FIELDS.length; i++) {
      var f = FIELDS[i];
      h += '<div class="' + P + '-row" data-row="' + f.k + '"><label for="' + P + '-' + f.k + '">' + f.label + '<small>' + f.sub + '</small></label>' + numInput(P + '-' + f.k, '0', '만원') + '</div>';
    }
    h += '<p class="' + P + '-note" data-note="culture" style="display:none">총급여 7천만원 초과면 문화비 공제가 없어요. 문화비로 쓴 돈은 결제한 카드 칸에 더해서 넣어 주세요.</p>';
    h += '</div>';

    h += '<div class="' + P + '-card"><p class="' + P + '-t">③ 12월 31일까지 더 쓸 예정 금액</p>' +
      '<div class="' + P + '-row"><label for="' + P + '-plan">남은 기간 예상 지출<small>신용카드로 쓸 때와 체크카드로 쓸 때를 비교해 드려요</small></label>' + numInput(P + '-plan', '예: 200', '만원') + '</div>' +
      '<div class="' + P + '-btns">' +
      '<button type="button" class="' + P + '-btn ' + P + '-pri" data-act="calc">계산하기</button>' +
      '<button type="button" class="' + P + '-btn ' + P + '-sec" data-act="sample">예시로 채워보기</button>' +
      '<button type="button" class="' + P + '-btn ' + P + '-ghost" data-act="reset">처음부터</button>' +
      '</div></div>';

    h += '<div class="' + P + '-res" aria-live="polite"></div>';
    root.innerHTML = '<div class="' + P + '">' + h + '</div>';
  }

  function toast(msg) {
    var t = document.querySelector('.' + P + '-toast');
    if (!t) { t = document.createElement('div'); t.className = P + '-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.style.opacity = '1';
    clearTimeout(t._h); t._h = setTimeout(function () { t.style.opacity = '0'; }, 2200);
  }

  function init(root) {
    injectStyle();
    build(root);
    var box = root.querySelector('.' + P);
    var $ = function (id) { return box.querySelector('#' + P + '-' + id); };
    var errBox = box.querySelector('.' + P + '-err');
    var resBox = box.querySelector('.' + P + '-res');
    var last = null;

    // 숫자 입력: 쉼표 자동, 숫자 외 문자 제거
    var inputs = box.querySelectorAll('input');
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].addEventListener('input', function (e) {
        var el = e.target;
        var raw = el.value.replace(/[^0-9.]/g, '');
        var parts = raw.split('.');
        var intPart = parts[0].replace(/^0+(?=\d)/, '');
        var out = intPart ? Number(intPart).toLocaleString('ko-KR') : '';
        if (parts.length > 1) out += '.' + parts[1].slice(0, 1);
        el.value = out;
        if (last) calc(true);
      });
    }
    $('kids').addEventListener('change', function () { if (last) calc(true); });
    $('rate').addEventListener('change', function () { if (last) calc(true); });
    $('gross').addEventListener('input', syncCulture);

    function val(id) {
      var v = parseFloat(($(id).value || '').replace(/,/g, ''));
      return isFinite(v) && v > 0 ? Math.round(v * 10000) : 0; // 만원 → 원
    }

    function syncCulture() {
      var g = val('gross');
      var high = g > RULES.incomeSplit;
      var row = box.querySelector('[data-row="culture"]');
      row.classList.toggle(P + '-dis', high);
      $('culture').disabled = high;
      box.querySelector('[data-note="culture"]').style.display = high ? 'block' : 'none';
    }

    function showErr(msg) {
      errBox.innerHTML = msg; errBox.style.display = msg ? 'block' : 'none';
      if (msg) errBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function calc(silent) {
      var gross = val('gross');
      if (!gross) {
        if (!silent) showErr('<b>총급여를 넣어 주세요.</b><br>연봉에서 식대 같은 비과세 수당을 뺀 금액이에요. 정확히 모르면 연봉을 그대로 넣어도 대략 맞아요.');
        return;
      }
      if (gross < 1000000 || gross > 5000000000) {
        if (!silent) showErr('<b>총급여가 너무 작거나 커요.</b><br>‘만원’ 단위예요. 예를 들어 연봉 4,500만원이면 <b>4500</b>만 넣어 주세요.');
        return;
      }
      showErr('');
      var kids = parseInt($('kids').value, 10) || 0;
      var fixed = parseFloat($('rate').value) || 0;
      var u = { credit: val('credit'), debit: val('debit'), culture: gross > RULES.incomeSplit ? 0 : val('culture'), market: val('market'), transit: val('transit') };
      var plan = val('plan');
      var r = compute(gross, kids, u);
      var sv = saving(gross, r.deduction, fixed);
      var fillDebit = needToFill(gross, kids, u, 'debit');
      var fillCredit = needToFill(gross, kids, u, 'credit');
      var res = { gross: gross, kids: kids, fixed: fixed, u: u, plan: plan, r: r, sv: sv, fillDebit: fillDebit, fillCredit: fillCredit };
      if (plan > 0) {
        res.pc = compute(gross, kids, addTo(u, 'credit', plan));
        res.pd = compute(gross, kids, addTo(u, 'debit', plan));
        res.pcS = saving(gross, res.pc.deduction, fixed);
        res.pdS = saving(gross, res.pd.deduction, fixed);
      }
      last = res;
      render(res);
      if (!silent) resBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function render(x) {
      var r = x.r, h = '';
      var rateTxt = x.fixed ? ('세율 ' + Math.round(x.fixed * 100) + '% 기준') : ('추정 세율 ' + Math.round(rateOfBase(estTaxBase(x.gross)) * 100) + '% 기준');

      // ── 한 줄 결론
      if (r.toThreshold > 0) {
        h += '<div class="' + P + '-big ' + P + '-st0">⏳ 아직 공제가 <b>0원</b>이에요.<p>앞으로 <b class="' + P + '-em">' + man(r.toThreshold) + '</b>을 더 써야 공제가 시작돼요. (문턱 = 총급여의 25% = ' + man(r.threshold) + ')</p>' +
          '<p>그다음 <b>체크카드로 ' + man(x.fillDebit - r.toThreshold) + '</b> 더 쓰면 기본 한도 ' + man(r.limit) + '을 꽉 채워요.</p></div>';
      } else if (!r.baseFull) {
        h += '<div class="' + P + '-big ' + P + '-st1">✅ 문턱은 넘었어요! 지금 공제액 <b>' + man(r.deduction) + '</b><p>한도 ' + man(r.limit) + '까지 <b class="' + P + '-em">체크카드로 ' + man(x.fillDebit) + '</b> 더 쓰면 꽉 차요. (신용카드로는 ' + man(x.fillCredit) + ')</p></div>';
      } else {
        h += '<div class="' + P + '-big ' + P + '-st2">🎉 기본 한도 ' + man(r.limit) + '을 다 채웠어요!<p>이제부터는 <b class="' + P + '-em">전통시장·대중교통' + (r.low ? '·문화비' : '') + '</b>만 추가로 공제돼요. 남은 추가 한도: <b>' + man(r.extraRoom) + '</b></p>' +
          '<p>그 밖의 지출은 공제가 더 늘지 않으니, 혜택(할인·적립)이 큰 카드로 쓰셔도 돼요.</p></div>';
      }

      // ── 막대 그래프
      var fillPoint = r.total + x.fillDebit;
      var maxV = Math.max(r.total, r.threshold, fillPoint) * 1.08 || 1;
      var pct = function (v) { return Math.min(100, Math.max(0, v / maxV * 100)); };
      var mk = function (v, label, pos) {
        var p = pct(v); var al = p < 18 ? ' l' : (p > 82 ? ' r' : '');
        return '<div class="' + P + '-mk ' + pos + al + '" style="left:calc(' + p + '% - 1px)"><span>' + label + '</span></div>';
      };
      h += '<div class="' + P + '-card"><p class="' + P + '-t">📊 한눈에 보기</p>' +
        '<div class="' + P + '-bar"><div class="' + P + '-fill" style="width:' + pct(r.total) + '%"></div>' +
        mk(r.threshold, '문턱 ' + man(r.threshold), 'top') +
        (r.baseFull ? '' : mk(fillPoint, '한도 꽉(체크) ' + man(fillPoint), 'bot')) +
        '</div>' +
        '<p class="' + P + '-note">파란 막대 = 지금까지 쓴 돈 ' + man(r.total) + '</p></div>';

      // ── 상세 표
      h += '<div class="' + P + '-card"><p class="' + P + '-t">🧾 계산 내역</p><table class="' + P + '-tbl"><tbody>' +
        '<tr><td>지금까지 쓴 금액 합계</td><td>' + won(r.total) + '</td></tr>' +
        '<tr><td>문턱 (총급여 × 25%)</td><td>' + won(r.threshold) + '</td></tr>' +
        '<tr><td>문턱 넘은 금액</td><td>' + won(r.overThreshold) + '</td></tr>' +
        '<tr><td>공제율 적용 금액</td><td>' + won(r.possible) + '</td></tr>' +
        '<tr><td>기본 공제 (한도 ' + man(r.limit) + ')</td><td>' + won(r.general) + '</td></tr>' +
        '<tr><td>추가 공제 (전통시장·대중교통' + (r.low ? '·문화비' : '') + ', 한도 ' + man(r.extraLimit) + ')</td><td>' + won(r.extra) + '</td></tr>' +
        '<tr class="sum"><td>소득공제 합계</td><td>' + won(r.deduction) + '</td></tr>' +
        '<tr class="save"><td>아끼는 세금 (대략, ' + rateTxt + ', 지방세 포함)</td><td>' + won(x.sv) + '</td></tr>' +
        '</tbody></table></div>';

      // ── 한도 채우기 (역계산)
      if (!r.baseFull) {
        h += '<div class="' + P + '-card"><p class="' + P + '-t">🎯 기본 한도 꽉 채우려면 얼마 더?</p><ul class="' + P + '-fill-list">' +
          '<li><span>체크카드·현금영수증으로만</span><b>' + man(x.fillDebit) + '</b></li>' +
          '<li><span>신용카드로만</span><b>' + man(x.fillCredit) + '</b></li>' +
          '</ul><div class="' + P + '-tip">💡 <b>문턱 전까지는 신용카드</b>(혜택·적립이 큼), <b>문턱을 넘은 뒤에는 체크카드</b>(공제율 2배)로 바꾸는 게 기본 전략이에요.</div></div>';
      }

      // ── 남은 기간 비교
      if (x.plan > 0) {
        var gain = x.pdS - x.pcS;
        var dWin = gain > 0;
        h += '<div class="' + P + '-card"><p class="' + P + '-t">🔀 남은 ' + man(x.plan) + ', 어떤 걸로 쓸까?</p><div class="' + P + '-cmp">' +
          '<div class="' + (dWin ? '' : 'win') + '"><h4>💳 신용카드로 쓰면</h4><div class="v">공제 ' + man(x.pc.deduction) + '</div><div class="s">세금 약 ' + man(x.pcS) + ' 아낌</div></div>' +
          '<div class="' + (dWin ? 'win' : '') + '"><h4>🏧 체크카드로 쓰면</h4><div class="v">공제 ' + man(x.pd.deduction) + '</div><div class="s">세금 약 ' + man(x.pdS) + ' 아낌</div></div>' +
          '</div>';
        if (gain > 0) h += '<div class="' + P + '-tip">💡 체크카드로 쓰면 세금을 <b>약 ' + man(gain) + '</b> 더 아껴요. 다만 신용카드 할인·적립이 이보다 크면 신용카드가 나을 수 있어요.</div>';
        else if (x.pc.toThreshold > 0) h += '<div class="' + P + '-tip">💡 남은 금액을 다 써도 문턱(' + man(x.pc.threshold) + ')을 못 넘어요. 공제 차이가 없으니 <b>혜택 좋은 신용카드</b>로 쓰세요.</div>';
        else h += '<div class="' + P + '-tip">💡 어떤 카드로 써도 공제 차이가 없어요. <b>할인·적립이 큰 카드</b>로 쓰세요.</div>';
        h += '</div>';
      }

      // ── 저장·공유
      h += '<div class="' + P + '-card"><p class="' + P + '-t">💾 결과 저장·공유</p><div class="' + P + '-btns">' +
        '<button type="button" class="' + P + '-btn ' + P + '-pri" data-act="img">이미지로 저장</button>' +
        '<button type="button" class="' + P + '-btn ' + P + '-sec" data-act="copy">결과 복사</button>' +
        (navigator.share ? '<button type="button" class="' + P + '-btn ' + P + '-ghost" data-act="share">공유하기</button>' : '') +
        '</div><p class="' + P + '-foot">※ ' + RULES.year + '년 사용분 기준의 대략 계산이에요. 실제 공제액은 회사 연말정산 결과(다른 공제·결정세액)에 따라 달라질 수 있어요. 제외 항목(보험료·세금·상품권 등)은 넣지 마세요.</p></div>';

      resBox.innerHTML = h;
      resBox.style.display = 'block';
    }

    function summaryText(x) {
      var r = x.r, L = [];
      L.push('[신용카드 소득공제 계산 결과 · ' + RULES.year + '년 사용분]');
      L.push('총급여 ' + man(x.gross) + ' / 지금까지 사용 ' + man(r.total));
      L.push('문턱(25%) ' + man(r.threshold) + (r.toThreshold > 0 ? ' → 아직 ' + man(r.toThreshold) + ' 더 써야 공제 시작' : ' → 통과'));
      L.push('현재 소득공제 ' + man(r.deduction) + ' (한도 ' + man(r.limit) + ')');
      if (!r.baseFull) L.push('한도 꽉 채우려면: 체크카드 ' + man(x.fillDebit) + ' / 신용카드 ' + man(x.fillCredit));
      L.push('아끼는 세금(대략) ' + man(x.sv));
      if (x.plan > 0) L.push('남은 ' + man(x.plan) + ': 신용 → ' + man(x.pcS) + ' / 체크 → ' + man(x.pdS) + ' 절세');
      L.push('착착도구 https://barodogu.blogspot.com');
      return L.join('\n');
    }

    function copyText(txt) {
      if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(txt).then(function () { toast('결과를 복사했어요. 카톡·메모에 붙여 넣으세요.'); }, function () { fallbackCopy(txt); });
      }
      fallbackCopy(txt);
    }
    function fallbackCopy(txt) {
      var ta = document.createElement('textarea');
      ta.value = txt; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.top = '-1000px';
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, txt.length);
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) { }
      document.body.removeChild(ta);
      toast(ok ? '결과를 복사했어요.' : '복사가 막혀 있어요. 화면을 길게 눌러 직접 복사해 주세요.');
    }

    function drawImage(x) {
      var r = x.r, W = 720, lines = [];
      lines.push(['title', '💳 신용카드 소득공제 계산 결과']);
      lines.push(['sub', RULES.year + '년 사용분 · 총급여 ' + man(x.gross) + (x.kids ? ' · 자녀 ' + (x.kids >= 2 ? '2명 이상' : '1명') : '')]);
      lines.push(['gap']);
      lines.push(['row', '지금까지 쓴 금액', won(r.total)]);
      lines.push(['row', '문턱 (총급여 25%)', won(r.threshold)]);
      lines.push(['row', '문턱까지 남은 금액', r.toThreshold > 0 ? won(r.toThreshold) : '통과 ✅']);
      lines.push(['row', '기본 공제 (한도 ' + man(r.limit) + ')', won(r.general)]);
      lines.push(['row', '추가 공제', won(r.extra)]);
      lines.push(['sum', '소득공제 합계', won(r.deduction)]);
      lines.push(['save', '아끼는 세금 (대략)', won(x.sv)]);
      if (!r.baseFull) {
        lines.push(['gap']);
        lines.push(['row', '한도 채우기: 체크카드로', man(x.fillDebit) + ' 더']);
        lines.push(['row', '한도 채우기: 신용카드로', man(x.fillCredit) + ' 더']);
      }
      if (x.plan > 0) {
        lines.push(['gap']);
        lines.push(['row', '남은 ' + man(x.plan) + ' 신용카드로', '절세 ' + man(x.pcS)]);
        lines.push(['row', '남은 ' + man(x.plan) + ' 체크카드로', '절세 ' + man(x.pdS)]);
      }
      lines.push(['gap']);
      lines.push(['foot', '대략 계산이에요 · 착착도구 barodogu.blogspot.com']);
      var H = 40;
      lines.forEach(function (l) { H += l[0] === 'title' ? 52 : l[0] === 'gap' ? 14 : l[0] === 'sub' ? 34 : 50; });
      H += 24;
      var dpr = 2, cv = document.createElement('canvas');
      cv.width = W * dpr; cv.height = H * dpr;
      var g = cv.getContext('2d'); g.scale(dpr, dpr);
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#2563eb'; g.fillRect(0, 0, W, 8);
      var font = '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
      var y = 40;
      lines.forEach(function (l) {
        var t = l[0];
        if (t === 'title') { g.fillStyle = '#1e3a8a'; g.font = 'bold 30px ' + font; g.fillText(l[1], 32, y + 30); y += 52; }
        else if (t === 'sub') { g.fillStyle = '#64748b'; g.font = '18px ' + font; g.fillText(l[1], 32, y + 20); y += 34; }
        else if (t === 'gap') { y += 14; }
        else if (t === 'foot') { g.fillStyle = '#94a3b8'; g.font = '16px ' + font; g.fillText(l[1], 32, y + 24); y += 50; }
        else {
          if (t === 'sum' || t === 'save') { g.fillStyle = t === 'sum' ? '#eff6ff' : '#ecfdf5'; g.fillRect(20, y + 2, W - 40, 44); }
          g.fillStyle = t === 'save' ? '#047857' : (t === 'sum' ? '#1e3a8a' : '#334155');
          g.font = (t === 'row' ? '' : 'bold ') + '21px ' + font;
          g.textAlign = 'left'; g.fillText(l[1], 32, y + 32);
          g.font = 'bold 22px ' + font; g.textAlign = 'right'; g.fillText(l[2], W - 32, y + 32); g.textAlign = 'left';
          g.fillStyle = '#eef2f7'; g.fillRect(20, y + 48, W - 40, 1);
          y += 50;
        }
      });
      return cv;
    }

    function saveImage(x) {
      var cv;
      try { cv = drawImage(x); } catch (e) { toast('이미지를 만들지 못했어요. ‘결과 복사’를 이용해 주세요.'); return; }
      var name = 'card-deduction-result.png';
      cv.toBlob(function (blob) {
        if (!blob) { toast('이미지를 만들지 못했어요. ‘결과 복사’를 이용해 주세요.'); return; }
        var isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        try {
          var file = new File([blob], name, { type: 'image/png' });
          if (isIOS && navigator.canShare && navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file], title: '신용카드 소득공제 계산 결과' }).catch(function () { showOverlay(blob); });
            return;
          }
        } catch (e) { }
        if (isIOS) { showOverlay(blob); return; }
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a'); a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        toast('이미지를 저장했어요. 다운로드 폴더를 확인하세요.');
      }, 'image/png');
    }

    function showOverlay(blob) {
      var url = URL.createObjectURL(blob);
      var ov = document.createElement('div'); ov.className = P + '-ov';
      ov.innerHTML = '<img alt="계산 결과 이미지"><p>이미지를 <b>길게 눌러</b> ‘사진에 저장’을 누르세요.</p><button type="button">닫기</button>';
      ov.querySelector('img').src = url;
      ov.querySelector('button').onclick = function () { document.body.removeChild(ov); URL.revokeObjectURL(url); };
      document.body.appendChild(ov);
    }

    function fillSample() {
      $('gross').value = '4,500'; $('kids').value = '1'; $('rate').value = '';
      $('credit').value = '1,100'; $('debit').value = '150'; $('culture').value = '30';
      $('market').value = '20'; $('transit').value = '60'; $('plan').value = '300';
      syncCulture(); calc(false);
      toast('예시: 연봉 4,500만원 · 자녀 1명 · 지금까지 1,360만원 사용');
    }

    function reset() {
      for (var i = 0; i < inputs.length; i++) inputs[i].value = '';
      $('kids').value = '0'; $('rate').value = '';
      syncCulture(); showErr(''); last = null;
      resBox.style.display = 'none'; resBox.innerHTML = '';
    }

    box.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!b) return;
      var a = b.getAttribute('data-act');
      if (a === 'calc') calc(false);
      else if (a === 'sample') fillSample();
      else if (a === 'reset') reset();
      else if (a === 'help') {
        var hb = box.querySelector('.' + P + '-helpbox');
        var open = hb.style.display === 'block';
        hb.style.display = open ? 'none' : 'block';
        b.textContent = open ? '어디서 확인하나요? ▾' : '어디서 확인하나요? ▴';
      }
      else if (a === 'img' && last) saveImage(last);
      else if (a === 'copy' && last) copyText(summaryText(last));
      else if (a === 'share' && last) {
        navigator.share({ title: '신용카드 소득공제 계산 결과', text: summaryText(last) }).catch(function () { });
      }
    });

    // 엔터로 계산
    box.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); calc(false); } });
  }

  // 테스트용으로 계산 함수 노출 (화면 동작에는 영향 없음)
  window.bdCardDeduction = { compute: compute, needToFill: needToFill, saving: saving, estTaxBase: estTaxBase, RULES: RULES };

  onReady(function () {
    var root = document.getElementById(ROOT_ID);
    if (!root) return;
    try { init(root); }
    catch (e) {
      root.innerHTML = '<div style="padding:14px;border:1px solid #fecaca;background:#fef2f2;border-radius:12px;color:#b91c1c;font-size:14px">계산기를 불러오지 못했어요. 페이지를 새로고침하거나, 크롬·사파리 최신 버전에서 다시 열어 주세요.</div>';
    }
  });
})();