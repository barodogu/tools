/*!
 * ============================================================
 * 모듈명   : barodogu.instagramFollowChecker
 * 관리 ID  : BD104
 * 파일     : analyzer/instagram-follow-checker.js
 * 저장소   : https://github.com/barodogu/tools
 * CDN      : https://cdn.jsdelivr.net/gh/barodogu/tools@main/analyzer/instagram-follow-checker.js
 * 사용 블로그: https://barodogu.blogspot.com/
 * 용도     : 인스타그램 맞팔·언팔 확인기
 *            - 인스타그램 '내 정보 다운로드' 파일(ZIP·JSON·HTML)로 팔로워·팔로잉 비교
 *            - 나만 팔로우(맞팔 안 한 계정)·나를 팔로우(팬)·맞팔 목록, 검색·정렬, 프로필 바로가기
 *            - 지난번 확인과 비교해 나를 언팔한 계정·새 팔로워 찾기
 *              (이 기기에 저장한 목록 또는 예전에 받은 파일과 비교)
 *            - 보낸 팔로우 요청·최근 내가 언팔한 계정 표시, 목록 복사·CSV 저장
 *            ※ 로그인·비밀번호 불필요. 파일은 서버로 전송하지 않고 브라우저 안에서만 처리
 *            ※ ZIP 파일은 JSZip 3.10.1(MIT)을 ZIP을 열 때만 jsDelivr에서 불러옴
 * 사용법   : 글에 <div id="barodogu-instagram-follow"></div> 를 넣고
 *            이 파일을 <script src="…" defer></script> 로 불러오면 화면을 그립니다.
 * 버전     : 1.0.0
 * 최종수정 : 2026-11-05
 * ============================================================
 */
(function (window, document) {
  'use strict';

  var barodogu = window.barodogu = window.barodogu || {};

  /* ---------- 기준값: 이 객체만 수정하면 됩니다 ---------- */
  var CONFIG = {
    VERSION: '1.0.0',
    UPDATED: '2026-11-05',
    ROOT_ID: 'barodogu-instagram-follow',
    MAX_FILE_MB: 2048,           // 불러올 파일 최대 용량
    PAGE: 100,                   // 목록 한 번에 표시 개수
    STORE_KEY: 'barodogu-igfollow-snapshot', // 지난번 목록 저장 키(이 기기 브라우저에만 저장)
    DYI_URL: 'https://accountscenter.instagram.com/info_and_permissions/dyi/',
    PROFILE_URL: 'https://www.instagram.com/',
    JSZIP_URL: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
    ACCEPT: '.zip,.json,.html,.htm,application/zip,application/json,text/html'
  };

  var EN_MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  var CATS = ['followers', 'following', 'pending', 'unfollowedByMe', 'blocked', 'closeFriends'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* ====================== 파싱 (순수 함수) ====================== */

  /** 파일 경로·최상위 키 → 분류 */
  function catOf(path, key) {
    var s = (String(path || '').split('/').pop() + ' ' + (key || '')).toLowerCase();
    if (/pending_follow_requests|follow_requests_sent/.test(s)) return 'pending';
    if (/recently_unfollowed|unfollowed_users/.test(s)) return 'unfollowedByMe';
    if (/blocked/.test(s)) return 'blocked';
    if (/close_friends/.test(s)) return 'closeFriends';
    if (/(^|[^_])followers(_\d+)?\.(json|html?)|relationships_followers/.test(s)) return 'followers';
    if (/(^|[^_a-z])following\.(json|html?)|relationships_following(\s|$)/.test(s)) return 'following';
    return null;
  }

  function userFromHref(href) {
    var m = /instagram\.com\/(?:_u\/)?([A-Za-z0-9._]{1,30})\/?(?:[?#]|$)/.exec(String(href || ''));
    return m ? m[1] : '';
  }
  function cleanUser(u) {
    u = String(u || '').trim().replace(/^@/, '');
    return /^[A-Za-z0-9._]{1,30}$/.test(u) ? u : '';
  }

  /** JSON 텍스트 → { cat: [{u, ts}] } */
  function parseJSONText(text, path) {
    var data;
    try { data = JSON.parse(text); } catch (e) { return {}; }
    var out = {};
    function add(cat, entry) {
      if (!cat) return;
      var s = entry.string_list_data && entry.string_list_data[0] || {};
      var u = cleanUser(s.value) || cleanUser(entry.title) || userFromHref(s.href);
      if (!u) return;
      (out[cat] = out[cat] || []).push({ u: u, ts: s.timestamp ? s.timestamp * 1000 : 0 });
    }
    function walk(node, cat) {
      if (Array.isArray(node)) { node.forEach(function (x) { walk(x, cat); }); return; }
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node.string_list_data)) { add(cat, node); return; }
      Object.keys(node).forEach(function (k) { walk(node[k], catOf(path, k) || cat); });
    }
    walk(data, catOf(path, ''));
    return out;
  }

  function parseDateText(s) {
    s = String(s || '').replace(/[  ]/g, ' ').trim();
    var m;
    if ((m = /([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s)) && EN_MON[m[1].slice(0, 3).toLowerCase()]) return new Date(+m[3], EN_MON[m[1].slice(0, 3).toLowerCase()] - 1, +m[2]).getTime();
    if ((m = /(\d{4})(?:년|\.|-)\s*(\d{1,2})(?:월|\.|-)\s*(\d{1,2})/.exec(s))) return new Date(+m[1], m[2] - 1, +m[3]).getTime();
    return 0;
  }

  /** HTML 텍스트 → { cat: [{u, ts}] } (분류는 파일 이름으로) */
  function parseHTMLText(text, path) {
    var cat = catOf(path, '');
    if (!cat) return {};
    var list = [], seen = {}, re = /<a [^>]*href="([^"]*instagram\.com[^"]*)"[^>]*>([\s\S]*?)<\/a>([\s\S]{0,400}?)(?=<a |$)/g, m;
    while ((m = re.exec(text))) {
      var txt = m[2].replace(/<[^>]*>/g, '').trim();
      var u = cleanUser(txt) || userFromHref(m[1]);
      if (!u || seen[u.toLowerCase()]) continue;
      seen[u.toLowerCase()] = 1;
      var after = m[3].replace(/<[^>]*>/g, ' ');
      list.push({ u: u, ts: parseDateText(after) });
    }
    var o = {}; o[cat] = list;
    return o;
  }

  /** 여러 파일 결과 합치기 → { followers:[], following:[], … } (아이디 기준 중복 제거) */
  function merge(parts) {
    var res = {}, seen = {};
    CATS.forEach(function (c) { res[c] = []; seen[c] = {}; });
    parts.forEach(function (p) {
      Object.keys(p).forEach(function (c) {
        if (!res[c]) return;
        p[c].forEach(function (x) {
          var k = x.u.toLowerCase();
          if (seen[c][k]) return;
          seen[c][k] = 1; res[c].push(x);
        });
      });
    });
    return res;
  }

  function parseFileText(text, path) {
    text = String(text || '').replace(/^﻿/, '');
    var t = text.slice(0, 50).trim();
    return (t[0] === '[' || t[0] === '{') ? parseJSONText(text, path) : parseHTMLText(text, path);
  }

  /** 비교 계산 */
  function compare(d) {
    var fol = {}, fing = {};
    d.followers.forEach(function (x) { fol[x.u.toLowerCase()] = x; });
    d.following.forEach(function (x) { fing[x.u.toLowerCase()] = x; });
    var mutual = [], notBack = [], fans = [];
    d.following.forEach(function (x) {
      var f = fol[x.u.toLowerCase()];
      if (f) mutual.push({ u: x.u, ts: x.ts, ts2: f.ts }); else notBack.push(x);
    });
    d.followers.forEach(function (x) { if (!fing[x.u.toLowerCase()]) fans.push(x); });
    return { mutual: mutual, notBack: notBack, fans: fans };
  }

  /** 지난 목록과 비교: 나를 언팔한 계정 / 새 팔로워 */
  function diff(prevFollowers, curFollowers) {
    var p = {}, c = {}, lost = [], gained = [];
    prevFollowers.forEach(function (u) { p[u.toLowerCase()] = u; });
    curFollowers.forEach(function (x) { c[x.u.toLowerCase()] = 1; if (!p[x.u.toLowerCase()]) gained.push(x); });
    Object.keys(p).forEach(function (k) { if (!c[k]) lost.push({ u: p[k], ts: 0 }); });
    return { lost: lost, gained: gained };
  }

  /* ====================== 파일 읽기 ====================== */
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

  function readBuf(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(new Error('파일을 읽지 못했습니다.')); };
      fr.readAsArrayBuffer(file);
    });
  }

  /** 파일 목록(ZIP·JSON·HTML 섞여도 됨) → 합친 데이터 */
  function readFiles(files) {
    var parts = [];
    return files.reduce(function (pr, file) {
      return pr.then(function () {
        if (file.size > CONFIG.MAX_FILE_MB * 1048576) throw new Error('파일이 너무 큽니다. 다운로드할 때 \'팔로워 및 팔로잉\'만 선택해 주세요.');
        return readBuf(file).then(function (buf) {
          var u8 = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
          if (!(u8[0] === 0x50 && u8[1] === 0x4B)) { parts.push(parseFileText(new TextDecoder('utf-8').decode(buf), file.name)); return; }
          return loadJSZip().then(function (JSZip) { return JSZip.loadAsync(buf); }).then(function (zip) {
            var jobs = [];
            zip.forEach(function (path, entry) {
              if (entry.dir || /__MACOSX/.test(path) || !/\.(json|html?)$/i.test(path)) return;
              if (!catOf(path, '') && !/followers_and_following|connections/i.test(path)) return;
              jobs.push(entry.async('string').then(function (t) { parts.push(parseFileText(t, path)); }));
            });
            return Promise.all(jobs);
          });
        });
      });
    }, Promise.resolve()).then(function () { return merge(parts); });
  }

  /* ====================== 저장(이 기기) ====================== */
  function loadSnap() {
    try { var s = JSON.parse(window.localStorage.getItem(CONFIG.STORE_KEY) || 'null'); return s && Array.isArray(s.followers) ? s : null; }
    catch (e) { return null; }
  }
  function saveSnap(followers) {
    try {
      window.localStorage.setItem(CONFIG.STORE_KEY, JSON.stringify({ savedAt: Date.now(), followers: followers.map(function (x) { return x.u; }) }));
      return true;
    } catch (e) { return false; }
  }
  function clearSnap() { try { window.localStorage.removeItem(CONFIG.STORE_KEY); } catch (e) { /* 무시 */ } }

  /* ====================== 화면 ====================== */
  var CSS = [
    '#R{box-sizing:border-box;max-width:900px;margin:24px auto;color:#1f2430;font:16px/1.65 system-ui,-apple-system,"Malgun Gothic",sans-serif;overflow-wrap:anywhere;}',
    '#R *{box-sizing:border-box;}',
    '#R .bdig-card{border:1px solid #ebe2ea;border-radius:18px;background:#fff;padding:clamp(14px,3vw,28px);}',
    '#R .bdig-kicker{margin:0;color:#b02a74;font-size:13px;font-weight:800;letter-spacing:.08em;}',
    '#R .bdig-title{margin:6px 0 10px;color:#1f2430;font-size:clamp(23px,4vw,32px);line-height:1.3;border:0;padding:0;}',
    '#R .bdig-lead{margin:0 0 18px;}',
    '#R .bdig-drop{border:2px dashed #dca6c6;border-radius:14px;background:#fcf4f9;padding:22px 14px;text-align:center;transition:background .15s;}',
    '#R .bdig-drop.is-over{background:#f7e0ee;}',
    '#R .bdig-drop strong{display:block;font-size:18px;}',
    '#R .bdig-filebtn{display:inline-flex;align-items:center;justify-content:center;margin-top:12px;min-height:44px;padding:9px 18px;border-radius:10px;background:#b02a74;color:#fff;font-weight:700;cursor:pointer;text-decoration:none;}',
    '#R .bdig-filebtn:focus-within,#R a.bdig-filebtn:focus-visible{outline:3px solid #f2b705;outline-offset:2px;}',
    '#R .bdig-file{position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;}',
    '#R .bdig-small{font-size:13px;color:#5f6673;margin:8px 0 0;}',
    '#R .bdig-link{background:none;border:0;padding:0;color:#b02a74;text-decoration:underline;font:inherit;cursor:pointer;}',
    '#R .bdig-btn{font:inherit;min-height:44px;border:1px solid #d9cdd6;border-radius:10px;padding:8px 14px;background:#fff;color:#1f2430;cursor:pointer;}',
    '#R .bdig-btn:hover{background:#faf4f8;}',
    '#R .bdig-btn:focus-visible,#R .bdig-link:focus-visible,#R .bdig-tab:focus-visible{outline:3px solid #f2b705;outline-offset:2px;}',
    '#R .bdig-btn.is-primary{background:#b02a74;border-color:#b02a74;color:#fff;font-weight:700;}',
    '#R .bdig-help{margin:12px 0 0;border:1px solid #efe6ed;border-radius:12px;background:#fcfafb;padding:2px 14px;font-size:14px;}',
    '#R .bdig-help summary{cursor:pointer;font-weight:700;padding:10px 0;}',
    '#R .bdig-help ol{margin:0 0 10px;padding-left:20px;}',
    '#R .bdig-help li{margin:4px 0;}',
    '#R .bdig-work{display:none;margin-top:18px;}',
    '#R .bdig-sum{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin:4px 0 10px;}',
    '#R .bdig-stat{border:1px solid #efe6ed;border-radius:12px;background:#fcfafb;padding:10px 12px;}',
    '#R .bdig-stat b{display:block;font-size:24px;line-height:1.3;}',
    '#R .bdig-stat span{font-size:13px;color:#5f6673;}',
    '#R .bdig-stat.is-hot{border-color:#e7a9cb;background:#fdf0f7;}',
    '#R .bdig-stat.is-hot b{color:#b02a74;}',
    '#R .bdig-diff{margin:14px 0;border:1px solid #efe6ed;border-radius:14px;padding:12px 14px;background:#fffdf5;}',
    '#R .bdig-diff h3{margin:0 0 4px;font-size:17px;border:0;padding:0;}',
    '#R .bdig-diff p{margin:0 0 8px;font-size:14px;color:#5f6673;}',
    '#R .bdig-diff .bdig-actions{margin-top:8px;}',
    '#R .bdig-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:18px 0 10px;}',
    '#R .bdig-tab{font:inherit;font-size:14px;min-height:40px;border:1px solid #d9cdd6;border-radius:999px;padding:6px 14px;background:#fff;color:#1f2430;cursor:pointer;}',
    '#R .bdig-tab.on{background:#b02a74;border-color:#b02a74;color:#fff;font-weight:700;}',
    '#R .bdig-desc{margin:0 0 10px;font-size:14px;color:#5f6673;}',
    '#R .bdig-tools{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;}',
    '#R .bdig-tools input,#R .bdig-tools select{font:inherit;min-height:42px;border:1px solid #d9cdd6;border-radius:9px;padding:6px 10px;background:#fff;color:#1f2430;}',
    '#R .bdig-tools input{flex:1;min-width:160px;}',
    '#R .bdig-list{list-style:none;margin:0;padding:0;border-top:1px solid #efe6ed;}',
    '#R .bdig-list li{display:flex;align-items:center;gap:10px;margin:0;padding:9px 2px;border-bottom:1px solid #efe6ed;}',
    '#R .bdig-list li.is-done{opacity:.45;}',
    '#R .bdig-list li.is-done a{text-decoration:line-through;}',
    '#R .bdig-av{flex:0 0 34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#f9a03f,#d62976 55%,#7a2fbf);color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:15px;}',
    '#R .bdig-who{flex:1;min-width:0;}',
    '#R .bdig-who a{color:#1f2430;font-weight:700;text-decoration:none;}',
    '#R .bdig-who a:hover{text-decoration:underline;}',
    '#R .bdig-who small{display:block;color:#5f6673;font-size:12.5px;}',
    '#R .bdig-chk{flex:0 0 auto;font-size:13px;color:#5f6673;display:inline-flex;align-items:center;gap:4px;cursor:pointer;}',
    '#R .bdig-chk input{width:18px;height:18px;}',
    '#R .bdig-empty{padding:16px 0;color:#5f6673;font-size:14px;}',
    '#R .bdig-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;}',
    '#R .bdig-msg{min-height:1.6em;margin:14px 0 0;padding:10px 12px;border-radius:10px;background:#f6f4f5;font-size:14px;}',
    '#R .bdig-msg:empty{display:none;}',
    '#R .bdig-msg.is-error{background:#fff3df;}',
    '#R .bdig-msg.is-ok{background:#edf8f1;}',
    '#R .bdig-foot{margin:16px 0 0;font-size:12px;color:#7a808b;}'
  ].join('\n');

  function h(tag, attrs, html) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) el.setAttribute(k, attrs[k]);
    if (html !== undefined) el.innerHTML = html;
    return el;
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n) { return Number(n).toLocaleString('ko-KR'); }
  function fmtDate(ms) { if (!ms) return ''; var d = new Date(ms); return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()); }

  var TABS = {
    notBack: { label: '나만 팔로우', desc: '내가 팔로우하지만 나를 팔로우하지 않는 계정입니다. 맞팔을 정리할 때 여기서 확인하세요. 유명인·브랜드 계정도 포함됩니다.', when: '내가 팔로우한 날' },
    fans: { label: '나를 팔로우(팬)', desc: '나를 팔로우하지만 내가 팔로우하지 않은 계정입니다. 맞팔해 줄 사람을 찾을 때 보세요.', when: '나를 팔로우한 날' },
    mutual: { label: '맞팔', desc: '서로 팔로우하고 있는 계정입니다.', when: '내가 팔로우한 날' },
    lost: { label: '나를 언팔', desc: '지난번 확인 때는 팔로워였는데 지금은 팔로워 목록에 없는 계정입니다. 계정을 삭제·비활성화했거나 나를 차단한 경우도 포함됩니다.', when: '' },
    gained: { label: '새 팔로워', desc: '지난번 확인 이후 새로 나를 팔로우한 계정입니다.', when: '나를 팔로우한 날' },
    pending: { label: '보낸 요청', desc: '내가 팔로우 요청을 보냈지만 아직 수락되지 않은 비공개 계정입니다.', when: '요청한 날' },
    unfollowedByMe: { label: '최근 내가 언팔', desc: '최근에 내가 팔로우를 취소한 계정입니다.', when: '취소한 날' }
  };

  function init() {
    var root = document.getElementById(CONFIG.ROOT_ID);
    if (!root || root.barodoguApi) return root && root.barodoguApi;
    var style = document.createElement('style');
    style.textContent = CSS.replace(/#R/g, '#' + CONFIG.ROOT_ID);
    document.head.appendChild(style);

    root.innerHTML = '';
    var card = h('div', { 'class': 'bdig-card' });
    card.innerHTML =
      '<p class="bdig-kicker">바로도구 · 인스타 맞팔 확인</p>' +
      '<h2 class="bdig-title">인스타그램 맞팔·언팔 확인기</h2>' +
      '<p class="bdig-lead">인스타그램에서 받은 내 정보 파일을 올리면 맞팔 안 한 계정, 나만 팔로우하는 계정, 지난번 이후 나를 언팔한 계정을 찾아 드립니다. <b>로그인·비밀번호가 필요 없고, 파일은 서버로 전송되지 않습니다.</b></p>' +
      '<div class="bdig-drop" data-el="drop"><strong>인스타그램 파일을 여기에 끌어다 놓으세요</strong>' +
      '<span>내 정보 다운로드로 받은 ZIP 파일 그대로 (JSON·HTML 모두 가능)</span><br>' +
      '<label class="bdig-filebtn">파일 선택<input class="bdig-file" type="file" multiple data-el="file" accept="' + CONFIG.ACCEPT + '"></label>' +
      '<p class="bdig-small">파일이 아직 없나요? <button type="button" class="bdig-link" data-el="sample">예시 데이터로 체험하기</button></p></div>' +
      '<details class="bdig-help" open><summary>📥 팔로워 파일 받는 방법</summary><ol>' +
      '<li>아래 버튼을 눌러 인스타그램 <b>계정 센터 → 내 정보 다운로드</b>를 엽니다. (인스타그램에 로그인된 상태)<br>' +
      '<a class="bdig-filebtn" style="margin:6px 0" href="' + CONFIG.DYI_URL + '" target="_blank" rel="noopener">내 정보 다운로드 바로 열기 ↗</a></li>' +
      '<li><b>정보 다운로드 또는 전송</b> → 내 인스타그램 계정 선택 → <b>일부 정보</b>를 고릅니다.</li>' +
      '<li>목록에서 <b>팔로워 및 팔로잉</b>만 체크하고 <b>다음</b> → <b>기기에 다운로드</b>를 고릅니다.</li>' +
      '<li>기간은 <b>전체 기간</b>, 형식은 <b>JSON</b>(HTML도 가능)으로 정하고 <b>파일 만들기</b>를 누릅니다.</li>' +
      '<li>준비되면 알림·메일이 옵니다. 같은 화면의 <b>사용 가능한 다운로드</b>에서 ZIP을 받아 압축을 풀지 말고 위에 올리세요.</li></ol>' +
      '<p class="bdig-small" style="margin:0 0 12px">💡 보통 몇 분이면 준비되지만, 길게는 하루까지 걸릴 수 있어요. 메뉴 이름은 앱 버전에 따라 조금 다를 수 있습니다.</p></details>' +
      '<div class="bdig-msg" data-el="msg" role="status" aria-live="polite"></div>' +
      '<div class="bdig-work" data-el="work">' +
      '<div class="bdig-sum" data-el="sum"></div>' +
      '<div class="bdig-diff" data-el="diff"></div>' +
      '<div class="bdig-tabs" data-el="tabs" role="tablist"></div>' +
      '<p class="bdig-desc" data-el="desc"></p>' +
      '<div class="bdig-tools"><input type="search" data-el="q" placeholder="아이디 검색" aria-label="아이디 검색">' +
      '<select data-el="sort" aria-label="정렬"><option value="old">오래된 순</option><option value="new">최근 순</option><option value="name">아이디 순</option></select></div>' +
      '<ul class="bdig-list" data-el="list"></ul>' +
      '<div data-el="morebox"></div>' +
      '<div class="bdig-actions"><button type="button" class="bdig-btn" data-el="copy">이 목록 아이디 복사</button>' +
      '<button type="button" class="bdig-btn" data-el="csv">전체 CSV 저장</button>' +
      '<button type="button" class="bdig-btn" data-el="reset">다른 파일 확인</button></div></div>' +
      '<p class="bdig-foot">바로도구 인스타그램 맞팔·언팔 확인기 v' + CONFIG.VERSION + ' · Instagram은 Meta의 상표이며 이 도구는 Meta와 관련이 없습니다.</p>';
    root.appendChild(card);

    var el = {};
    Array.prototype.forEach.call(card.querySelectorAll('[data-el]'), function (n) { el[n.getAttribute('data-el')] = n; });

    var data = null, cmp = null, df = null, base = null, tab = 'notBack', shown = CONFIG.PAGE, done = {}, label = '', isSample = false;

    function msg(t, type) { el.msg.textContent = t || ''; el.msg.className = 'bdig-msg' + (type ? ' is-' + type : ''); }

    function lists() {
      var L = { notBack: cmp.notBack, fans: cmp.fans, mutual: cmp.mutual };
      if (df) { L.lost = df.lost; L.gained = df.gained; }
      if (data.pending.length) L.pending = data.pending;
      if (data.unfollowedByMe.length) L.unfollowedByMe = data.unfollowedByMe;
      return L;
    }

    function stat(v, l, hot) { return '<div class="bdig-stat' + (hot ? ' is-hot' : '') + '"><b>' + v + '</b><span>' + l + '</span></div>'; }

    function renderSummary() {
      el.sum.innerHTML = stat(num(data.followers.length), '팔로워') + stat(num(data.following.length), '팔로잉') +
        stat(num(cmp.mutual.length), '맞팔') + stat(num(cmp.notBack.length), '나만 팔로우', true) + stat(num(cmp.fans.length), '나를 팔로우(팬)') +
        (df ? stat(num(df.lost.length), '지난번 이후 나를 언팔', true) : '');
    }

    function renderDiff() {
      var snap = loadSnap(), html = '';
      if (df) {
        html = '<h3>🔍 ' + esc(base.label) + '과(와) 비교했어요</h3><p>그 사이 <b>' + num(df.lost.length) + '명</b>이 나를 언팔했고, <b>' + num(df.gained.length) + '명</b>이 새로 팔로우했어요. 아래 「나를 언팔」 탭에서 확인하세요.</p>';
      } else {
        html = '<h3>🔍 누가 나를 언팔했는지 알고 싶다면</h3><p>인스타그램 파일에는 "나를 언팔한 사람" 기록이 없어요. 대신 <b>이번 팔로워 목록을 기억해 두고, 다음에 새 파일을 올리면</b> 그 사이 사라진 팔로워를 찾아 드립니다.</p>';
      }
      html += '<div class="bdig-actions">' +
        '<button type="button" class="bdig-btn is-primary" data-act="save">이번 팔로워 목록 이 기기에 기억하기</button>' +
        '<label class="bdig-btn" style="display:inline-flex;align-items:center;cursor:pointer">예전에 받은 파일과 비교<input class="bdig-file" type="file" multiple data-act="oldfile" accept="' + CONFIG.ACCEPT + '"></label>' +
        (snap ? '<button type="button" class="bdig-btn" data-act="forget">기억한 목록 지우기</button>' : '') + '</div>' +
        '<p class="bdig-small">' + (snap ? '이 기기에 ' + fmtDate(snap.savedAt) + '에 기억한 팔로워 ' + num(snap.followers.length) + '명 목록이 있어요. ' : '') +
        '목록은 아이디만 이 브라우저에 저장되며 어디에도 전송되지 않아요.</p>';
      el.diff.innerHTML = html;
    }

    function renderTabs() {
      var L = lists();
      if (!L[tab]) tab = 'notBack';
      el.tabs.innerHTML = Object.keys(TABS).filter(function (k) { return L[k]; }).map(function (k) {
        return '<button type="button" class="bdig-tab' + (k === tab ? ' on' : '') + '" role="tab" aria-selected="' + (k === tab) + '" data-tab="' + k + '">' + TABS[k].label + ' ' + num(L[k].length) + '</button>';
      }).join('');
    }

    function currentRows() {
      var rows = lists()[tab] || [], q = el.q.value.trim().toLowerCase().replace(/^@/, ''), s = el.sort.value;
      if (q) rows = rows.filter(function (x) { return x.u.toLowerCase().indexOf(q) >= 0; });
      rows = rows.slice();
      if (s === 'name') rows.sort(function (a, b) { return a.u.localeCompare(b.u); });
      else rows.sort(function (a, b) { return s === 'new' ? (b.ts || 0) - (a.ts || 0) : (a.ts || Infinity) - (b.ts || Infinity); });
      return rows;
    }

    function renderList() {
      var rows = currentRows(), info = TABS[tab];
      el.desc.textContent = info.desc;
      if (!rows.length) {
        el.list.innerHTML = '<li class="bdig-empty">' + (el.q.value ? '검색 결과가 없어요.' : '해당하는 계정이 없어요. 🎉') + '</li>';
        el.morebox.innerHTML = '';
        return;
      }
      var html = '';
      rows.slice(0, shown).forEach(function (x) {
        var k = x.u.toLowerCase(), isDone = done[k];
        html += '<li' + (isDone ? ' class="is-done"' : '') + '><span class="bdig-av" aria-hidden="true">' + esc(x.u.replace(/[._]/g, '').charAt(0).toUpperCase() || '@') + '</span>' +
          '<span class="bdig-who"><a href="' + CONFIG.PROFILE_URL + encodeURIComponent(x.u) + '/" target="_blank" rel="noopener">@' + esc(x.u) + '</a>' +
          (info.when && x.ts ? '<small>' + info.when + ' ' + fmtDate(x.ts) + '</small>' : '') + '</span>' +
          '<label class="bdig-chk"><input type="checkbox" data-done="' + esc(k) + '"' + (isDone ? ' checked' : '') + '> 확인</label></li>';
      });
      el.list.innerHTML = html;
      el.morebox.innerHTML = rows.length > shown ? '<button type="button" class="bdig-btn" data-act="more" style="margin-top:10px">' + num(Math.min(CONFIG.PAGE, rows.length - shown)) + '명 더 보기 (' + num(shown) + ' / ' + num(rows.length) + ')</button>' : '';
    }

    function renderAll() { renderSummary(); renderDiff(); renderTabs(); renderList(); }

    function setBase(followers, lbl) {
      base = { label: lbl };
      df = diff(followers, data.followers);
      if (df.lost.length) tab = 'lost';
    }

    function load(d, lbl) {
      if (!d.followers.length && !d.following.length) {
        msg('팔로워·팔로잉 목록을 찾지 못했습니다. 인스타그램 \'내 정보 다운로드\'에서 \'팔로워 및 팔로잉\'을 선택해 받은 파일이 맞는지 확인해 주세요.', 'error');
        return false;
      }
      isSample = lbl === '예시 데이터';
      data = d; cmp = compare(d); df = null; base = null; tab = 'notBack'; shown = CONFIG.PAGE; done = {}; label = lbl;
      var snap = loadSnap();
      if (snap && !isSample) setBase(snap.followers, fmtDate(snap.savedAt) + '에 기억한 목록');
      var warn = !d.followers.length ? ' 팔로워 파일이 없어 비교가 정확하지 않을 수 있어요.' : (!d.following.length ? ' 팔로잉 파일이 없어 비교가 정확하지 않을 수 있어요.' : '');
      msg('팔로워 ' + num(d.followers.length) + '명, 팔로잉 ' + num(d.following.length) + '명을 읽었습니다.' + warn, warn ? 'error' : 'ok');
      el.work.style.display = 'block';
      el.q.value = '';
      renderAll();
      return true;
    }

    function handleFiles(files) {
      files = Array.prototype.slice.call(files || []);
      if (!files.length) return;
      msg('파일을 읽는 중입니다…');
      readFiles(files).then(function (d) { load(d, files.length === 1 ? files[0].name : files.length + '개 파일'); })
        .catch(function (e) { msg(e.message || '파일을 읽지 못했습니다.', 'error'); });
    }

    el.file.addEventListener('change', function () { handleFiles(el.file.files); el.file.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) { el.drop.addEventListener(ev, function (e) { e.preventDefault(); el.drop.classList.add('is-over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { el.drop.addEventListener(ev, function (e) { e.preventDefault(); el.drop.classList.remove('is-over'); }); });
    el.drop.addEventListener('drop', function (e) { handleFiles(e.dataTransfer && e.dataTransfer.files); });
    el.sample.addEventListener('click', function () {
      var s = sampleData();
      load(s.now, '예시 데이터');
      setBase(s.before, '한 달 전 예시 목록');
      renderAll();
    });
    el.tabs.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-tab]');
      if (!b) return;
      tab = b.getAttribute('data-tab'); shown = CONFIG.PAGE; renderTabs(); renderList();
    });
    el.q.addEventListener('input', function () { shown = CONFIG.PAGE; renderList(); });
    el.sort.addEventListener('change', renderList);
    el.list.addEventListener('change', function (e) {
      var k = e.target.getAttribute && e.target.getAttribute('data-done');
      if (!k) return;
      done[k] = e.target.checked;
      e.target.closest('li').className = e.target.checked ? 'is-done' : '';
    });
    el.morebox.addEventListener('click', function (e) {
      if (e.target.getAttribute('data-act') === 'more') { shown += CONFIG.PAGE; renderList(); }
    });
    el.diff.addEventListener('click', function (e) {
      var act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'save') {
        if (isSample) { msg('예시 데이터는 기억하지 않아요. 내 파일을 올린 뒤 눌러 주세요.', 'error'); return; }
        if (!data.followers.length) { msg('팔로워 목록이 없어 기억할 수 없습니다.', 'error'); return; }
        if (saveSnap(data.followers)) msg('팔로워 ' + num(data.followers.length) + '명 목록을 이 기기에 기억했어요. 다음에 새 파일을 올리면 그 사이 언팔한 계정을 알려 드립니다.', 'ok');
        else msg('이 브라우저에서는 목록을 저장할 수 없어요(사생활 보호 모드 등). 대신 이번에 받은 파일을 보관해 두었다가 「예전에 받은 파일과 비교」를 써 주세요.', 'error');
        renderDiff();
      } else if (act === 'forget') {
        clearSnap(); msg('기억한 목록을 지웠습니다.', 'ok'); renderDiff();
      }
    });
    el.diff.addEventListener('change', function (e) {
      if (e.target.getAttribute('data-act') !== 'oldfile') return;
      var files = Array.prototype.slice.call(e.target.files || []);
      if (!files.length) return;
      msg('예전 파일을 읽는 중입니다…');
      readFiles(files).then(function (old) {
        if (!old.followers.length) { msg('예전 파일에서 팔로워 목록을 찾지 못했습니다.', 'error'); return; }
        setBase(old.followers.map(function (x) { return x.u; }), '예전 파일(' + (files.length === 1 ? files[0].name : files.length + '개 파일') + ')');
        msg('예전 파일과 비교했어요. 나를 언팔한 계정 ' + num(df.lost.length) + '명, 새 팔로워 ' + num(df.gained.length) + '명입니다.', 'ok');
        shown = CONFIG.PAGE; renderAll();
      }).catch(function (err) { msg(err.message || '파일을 읽지 못했습니다.', 'error'); });
    });
    el.copy.addEventListener('click', function () {
      var txt = currentRows().map(function (x) { return '@' + x.u; }).join('\n');
      if (!txt) return;
      var ok = function () { msg(TABS[tab].label + ' 목록 ' + num(currentRows().length) + '개 아이디를 복사했어요.', 'ok'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, fallback); else fallback();
      function fallback() {
        var ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); ok(); } catch (er) { msg('복사하지 못했습니다. CSV 저장을 이용해 주세요.', 'error'); }
        ta.remove();
      }
    });
    el.csv.addEventListener('click', function () {
      var L = lists(), lines = [['구분', '아이디', '날짜', '프로필 주소']];
      Object.keys(TABS).forEach(function (k) {
        (L[k] || []).forEach(function (x) { lines.push([TABS[k].label, x.u, fmtDate(x.ts), CONFIG.PROFILE_URL + x.u + '/']); });
      });
      var csv = '﻿' + lines.map(function (r) { return r.map(function (c) { c = String(c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\r\n');
      download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), '인스타_맞팔확인.csv');
      msg('전체 목록을 CSV로 저장했어요.', 'ok');
    });
    el.reset.addEventListener('click', function () {
      data = null; el.work.style.display = 'none'; el.list.innerHTML = ''; msg('');
      el.file.click();
    });

    var api = { load: load, getData: function () { return { data: data, compare: cmp, diff: df }; } };
    root.barodoguApi = api;
    return api;
  }

  function download(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  /* 예시 데이터 — 실제 계정과 무관한 가상의 아이디 */
  function sampleData() {
    var words = ['daily', 'cafe', 'travel', 'camping', 'books', 'cat', 'dog', 'run', 'cook', 'photo', 'jeju', 'seoul', 'film', 'plant', 'bread', 'study'];
    var seed = 5;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    var users = [];
    for (var i = 0; i < 180; i++) users.push('ex_' + words[Math.floor(rnd() * words.length)] + '.' + words[Math.floor(rnd() * words.length)] + (i + 10));
    var now = Date.now(), day = 86400000;
    function pick(arr) { return arr.map(function (u) { return { u: u, ts: now - Math.floor(rnd() * 900) * day }; }); }
    var followers = users.filter(function (u, k) { return k % 5 !== 0 && k < 160; });
    var following = users.filter(function (u, k) { return k % 3 !== 0 || k >= 150; });
    var before = followers.concat(['ex_old.friend1', 'ex_bye.cafe2', 'ex_gone.travel3', 'ex_past.photo4']).filter(function (u, k) { return k % 17 !== 3; });
    return {
      now: {
        followers: pick(followers), following: pick(following),
        pending: pick(['ex_private.books7', 'ex_secret.cat8']), unfollowedByMe: [], blocked: [], closeFriends: []
      },
      before: before
    };
  }

  barodogu.instagramFollowChecker = {
    version: CONFIG.VERSION,
    CONFIG: CONFIG,
    init: init,
    parseFileText: parseFileText,
    merge: merge,
    compare: compare,
    diff: diff,
    catOf: catOf,
    sampleData: sampleData
  };

  function auto() { if (document.getElementById(CONFIG.ROOT_ID)) init(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto, { once: true });
  else auto();
})(window, document);
