/*! 착착도구 · 술자리·모임 N빵 정산 v1.0.0
 * 파일: calc/group-split.js | 저장소: https://github.com/barodogu/tools
 * 사용 블로그: https://barodogu.blogspot.com
 * 사용법: <div id="bd-npay"></div> 뒤에 이 스크립트를 불러오세요.
 * 배포: 업로드된 파일을 확인한 뒤 jsDelivr URL에 커밋 SHA를 고정하세요.
 * 용도: 차수별 음식·기타 비용과 술값을 선택한 사람끼리 원 단위로 나누기
 * 개인정보: 네트워크 요청·외부 라이브러리·쿠키·기기 저장소 사용 없음.
 * 최종수정: 2026-11-05 | 1단계 MVP
 */
(function () {
  'use strict';
  function boot() {
    var root = document.getElementById('bd-npay');
    if (!root || root.dataset.ready) return;
    root.dataset.ready = '1';
    var seq = 0, revision = 0, resultRevision = -1, resultText = '';
    var people = [], rounds = [];
    var MAX_PEOPLE = 20, MAX_ROUNDS = 30, MAX_AMOUNT = 100000000;
    function id() { return 'n' + (++seq); }
    function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
    function money(n) { return n.toLocaleString('ko-KR') + '원'; }
    function person(pid) { return people.find(function (p) { return p.id === pid; }); }
    function name(pid) { var p = person(pid); return p ? p.name.trim() || '이름 미입력' : '결제자 선택'; }
    function personIds() { return people.map(function (p) { return p.id; }); }
    function newRound() { return {id:id(), title:(rounds.length + 1) + '차', common:'', alcohol:'', payer:people[0].id, drinkPayer:people[0].id, attendees:personIds(), drinkers:[]}; }
    function button(action, label, more) { return '<button type="button" data-action="' + action + '" ' + (more || '') + '>' + label + '</button>'; }
    var style = document.createElement('style');
    style.textContent = `
      #bd-npay{--np-ink:#172c35;--np-green:#096b54;--np-line:#d9e5de;color:var(--np-ink);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","Malgun Gothic",sans-serif;text-align:left;max-width:850px;margin:24px auto;color-scheme:light}
      #bd-npay *{box-sizing:border-box}#bd-npay [hidden]{display:none!important}
      #bd-npay .np-shell{border:1px solid var(--np-line);border-radius:22px;overflow:hidden;background:#f5f7f3}
      #bd-npay .np-hero{background:#163d36;color:#fff;padding:26px 24px}#bd-npay .np-kicker{font-size:12px;letter-spacing:2px;color:#bde9d4;font-weight:700}
      #bd-npay h2{font-size:27px;line-height:1.3;margin:9px 0;color:inherit;border:0;padding:0}#bd-npay h3{font-size:20px;margin:0 0 10px;color:inherit}#bd-npay h4{font-size:17px;margin:0 0 8px}
      #bd-npay p{margin:8px 0}#bd-npay .np-hero p{color:#e0eee5;font-size:14px}#bd-npay .np-body{padding:20px}#bd-npay .np-section{margin-bottom:22px}
      #bd-npay .np-note{font-size:13px;color:#52645c}#bd-npay .np-card{background:#fff;border:1px solid var(--np-line);border-radius:14px;padding:18px;margin:12px 0}
      #bd-npay .np-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}#bd-npay .np-between{justify-content:space-between}
      #bd-npay button{font:inherit;font-size:14px;min-height:46px;padding:9px 15px;border:1px solid #bacdc2;border-radius:9px;background:#fff;color:#164b3c;cursor:pointer;white-space:normal;margin:0;box-shadow:none;line-height:1.4}
      #bd-npay button:hover{background:#edf7f1}#bd-npay button:disabled{opacity:.45;cursor:not-allowed}#bd-npay button.np-primary{background:var(--np-green);border-color:var(--np-green);color:white;font-weight:700}
      #bd-npay .np-calc{width:100%;font-size:18px;min-height:54px}#bd-npay :is(input,select,textarea,button):focus-visible,#bd-npay summary:focus-visible{outline:3px solid #df9c24;outline-offset:2px}
      #bd-npay input:not([type=checkbox]),#bd-npay select,#bd-npay textarea{font:inherit;font-size:16px;width:100%;min-width:0;min-height:46px;background:#fff;color:var(--np-ink);border:1px solid #a9beb3;border-radius:8px;padding:9px 10px;box-shadow:none;margin:0}
      #bd-npay input[type=checkbox]{width:20px;height:20px;accent-color:var(--np-green);margin:0;flex-shrink:0}#bd-npay label{display:block;font-size:14px;color:var(--np-ink)}
      #bd-npay .np-person{display:flex;align-items:center;gap:8px;margin-top:8px}#bd-npay .np-person label{flex:1;min-width:0}#bd-npay .np-person button{flex-shrink:0}
      #bd-npay .np-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}#bd-npay .np-part{border-top:1px solid #e5ece7;padding-top:14px;margin-top:14px}
      #bd-npay .np-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}#bd-npay .np-chip{display:flex;align-items:center;gap:7px;min-height:44px;border:1px solid #c6d8cd;background:#f7faf6;border-radius:8px;padding:8px 10px;cursor:pointer;overflow-wrap:anywhere;max-width:100%}
      #bd-npay .np-chip:has(input:checked){background:#e2f3e9;border-color:#81b9a0}#bd-npay .np-status{padding:12px;border-radius:9px;background:#fff5dc;color:#684b13;margin:12px 0;overflow-wrap:anywhere}
      #bd-npay .np-total{font-size:32px;font-weight:800;letter-spacing:-1px;color:var(--np-green)}#bd-npay .np-transfer{padding:12px 0;border-bottom:1px solid #e0e9e3;overflow-wrap:anywhere}#bd-npay .np-transfer b{color:var(--np-green)}
      #bd-npay .np-scroll{overflow-x:auto}#bd-npay table{width:100%;border-collapse:collapse;font-size:14px;margin:12px 0;background:white}#bd-npay th,#bd-npay td{padding:10px 8px;border:0;border-bottom:1px solid #dce7df;text-align:right;white-space:nowrap}#bd-npay th{background:#f0f5ef;color:#294c3d}#bd-npay td:first-child,#bd-npay th:first-child{text-align:left}
      #bd-npay summary{cursor:pointer;padding:12px 0;min-height:44px;font-weight:700}#bd-npay .np-detail{font-size:14px;overflow-wrap:anywhere}#bd-npay .np-footer{font-size:12px;color:#617368;margin-top:18px}#bd-npay textarea{min-height:220px}
      @media(max-width:480px){#bd-npay .np-body{padding:14px}#bd-npay .np-hero{padding:22px 18px}#bd-npay .np-card{padding:13px}#bd-npay h2{font-size:24px}#bd-npay .np-grid{grid-template-columns:1fr}#bd-npay .np-actions button{flex:1}}
    `;
    root.appendChild(style);
    var shell = document.createElement('div'); shell.className = 'np-shell'; root.appendChild(shell);
    shell.innerHTML = '<header class="np-hero"><div class="np-kicker">착착도구 · 모임 정산</div><h2>함께 먹은 만큼, 착착 나누기</h2><p>1차만 온 친구도, 술 안 마신 친구도.<br>누가 누구에게 얼마 보낼지 한 번에 정리해요.</p></header><div class="np-body">' +
      '<p class="np-note">🔒 입력한 이름·금액은 이 도구에서 서버로 보내지 않아요. 새로고침하면 지워지니 결과를 복사해 두세요.</p>' +
      '<div class="np-row np-actions">' + button('demo','예시로 체험하기') + button('reset','새로 시작') + '</div>' +
      '<div class="np-status" role="status" aria-live="polite" hidden></div>' +
      '<section class="np-section"><h3>① 함께한 사람</h3><p class="np-note">별명으로 입력해도 돼요. 최대 20명이며, 이름은 서로 다르게 적어 주세요.</p><div class="np-people"></div>' + button('add-person','＋ 사람 추가') + '</section>' +
      '<section class="np-section"><h3>② 자리별 지출</h3><p class="np-note">음식·기타 금액에 술값을 포함하지 마세요. 음식과 술을 나눠 실제 결제한 금액을 넣어요.</p><div class="np-rounds"></div>' + button('add-round','＋ 자리 추가 (최대 30개)') + '</section>' +
      button('calculate','정산 결과 보기','class="np-primary np-calc"') +
      '<section class="np-result np-card" tabindex="-1" aria-label="정산 결과" hidden></section>' +
      '<div class="np-manual" hidden><label>정산 내용 · 길게 눌러 전체 선택 후 복사하세요<textarea readonly aria-label="복사용 정산 내용"></textarea></label></div>' +
      '<p class="np-footer">원화 정수 기준 · 1원까지 합계 일치 · 입력 자료는 자동 저장되지 않아요.<br>실제 송금은 하지 않으며, 보내기 전 영수증과 참여자를 확인해 주세요.</p></div>';
    function $(s) { return root.querySelector(s); }
    function say(s) { var el = $('.np-status'); el.textContent = s; el.hidden = !s; }
    function invalidate() { revision++; resultRevision = -1; resultText = ''; $('.np-result').hidden = true; $('.np-manual').hidden = true; }
    function reset() { people = [{id:id(),name:'나'},{id:id(),name:'친구'}]; rounds = []; rounds.push(newRound()); invalidate(); render(); say(''); }
    function options(selected) { return '<option value="">결제자 선택</option>' + people.map(function(p){return '<option value="'+p.id+'"'+(p.id===selected?' selected':'')+'>'+esc(name(p.id))+'</option>';}).join(''); }
    function chips(r, type) {
      var ids = type === 'attendees' ? personIds() : r.attendees;
      return ids.length ? ids.map(function(pid){return '<label class="np-chip"><input type="checkbox" data-round="'+r.id+'" data-field="'+type+'" value="'+pid+'"'+(r[type].indexOf(pid)>=0?' checked':'')+'> '+esc(name(pid))+'</label>';}).join('') : '<span class="np-note">먼저 위에서 음식·기타 비용을 나눌 사람을 선택하세요.</span>';
    }
    function render() {
      $('.np-people').innerHTML = people.map(function(p,i){return '<div class="np-person"><label>'+(i+1)+'. 이름<input autocomplete="off" maxlength="20" data-person="'+p.id+'" value="'+esc(p.name)+'" aria-label="'+(i+1)+'번째 사람 이름"></label>'+button('remove-person','삭제','data-id="'+p.id+'" aria-label="'+(i+1)+'번째 사람 삭제"'+(people.length<=2?' disabled':''))+'</div>';}).join('');
      $('[data-action="add-person"]').disabled = people.length >= MAX_PEOPLE;
      renderRounds();
    }
    function renderRounds() {
      $('.np-rounds').innerHTML = rounds.map(function(r,i){return '<article class="np-card" data-card="'+r.id+'"><div class="np-row np-between"><h4>자리 '+(i+1)+'</h4>'+button('remove-round','자리 삭제','data-id="'+r.id+'"'+(rounds.length<=1?' disabled':''))+'</div><label>자리 이름<input maxlength="30" data-round="'+r.id+'" data-field="title" value="'+esc(r.title)+'" placeholder="예: 1차 고깃집"></label>'+part(r,'common','payer','음식·기타','attendees')+part(r,'alcohol','drinkPayer','술','drinkers')+'</article>';}).join('');
      $('[data-action="add-round"]').disabled = rounds.length >= MAX_ROUNDS;
    }
    function part(r, amount, payer, title, group) {
      return '<div class="np-part"><div class="np-grid"><label>'+title+'값 (원)<input type="text" inputmode="numeric" autocomplete="off" maxlength="12" data-round="'+r.id+'" data-field="'+amount+'" value="'+esc(r[amount])+'" placeholder="0"></label><label>'+title+'값 결제자<select data-round="'+r.id+'" data-field="'+payer+'">'+options(r[payer])+'</select></label></div><p class="np-note">'+(group==='attendees'?'음식·기타 비용을 나눌 사람':'그중 술값도 나눌 사람 · 안 마신 사람은 체크 해제')+'</p><div class="np-chips">'+chips(r,group)+'</div></div>';
    }
    function amount(raw, label) {
      var s = raw.trim();
      if (!s) return 0;
      if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(s)) throw Error(label+' 금액을 읽을 수 없어요. 원·마이너스·소수점 없이 숫자만 입력해 주세요. 예: 12,000');
      var n = Number(s.replace(/,/g,''));
      if (!Number.isSafeInteger(n) || n > MAX_AMOUNT) throw Error(label+' 금액이 너무 커요. 한 비용은 1억 원 이하로 입력해 주세요.');
      return n;
    }
    function calculate() {
      var names = people.map(function(p){return p.name.trim();});
      if (names.some(function(n){return !n;})) throw Error('이름이 빈 사람이 있어요. 모두 이름이나 별명을 적어 주세요.');
      if (new Set(names).size !== names.length) throw Error('같은 이름이 있어 구분할 수 없어요. 민수1·민수2처럼 다르게 적어 주세요.');
      var ledger = people.map(function(p){return {id:p.id,name:p.name.trim(),paid:0,share:0,balance:0};});
      var byId = {}; ledger.forEach(function(p){byId[p.id]=p;});
      var items = [], total = 0;
      rounds.forEach(function(r,i){
        var title = r.title.trim() || (i+1)+'번째 자리';
        [['common','payer','attendees','음식·기타'],['alcohol','drinkPayer','drinkers','술']].forEach(function(spec){
          var value = amount(r[spec[0]],title+' '+spec[3]);
          if (!value) return;
          var members = people.filter(function(p){return r[spec[2]].indexOf(p.id)>=0;});
          if (!members.length) throw Error(title+' '+spec[3]+'값은 있는데 나눌 사람이 없어요. 해당 비용을 나눌 사람을 1명 이상 체크해 주세요.');
          if (!byId[r[spec[1]]]) throw Error(title+' '+spec[3]+'값 결제자가 없어요. 실제로 결제한 사람을 선택해 주세요.');
          var base = Math.floor(value / members.length), remain = value % members.length;
          var shares = members.map(function(p,j){var n = base + (j < remain ? 1 : 0); byId[p.id].share += n; return {id:p.id,name:name(p.id),amount:n};});
          byId[r[spec[1]]].paid += value; total += value;
          items.push({title:title+' · '+spec[3],value:value,payer:name(r[spec[1]]),shares:shares});
        });
      });
      if (!total) throw Error('아직 나눌 금액이 없어요. 음식·기타값이나 술값에 1원 이상 입력해 주세요.');
      ledger.forEach(function(p){p.balance=p.paid-p.share;});
      var debt = ledger.filter(function(p){return p.balance<0;}).map(function(p){return {id:p.id,left:-p.balance};});
      var credit = ledger.filter(function(p){return p.balance>0;}).map(function(p){return {id:p.id,left:p.balance};});
      var transfers = [];
      while(debt.length && credit.length) {
        debt.sort(function(a,b){return b.left-a.left;}); credit.sort(function(a,b){return b.left-a.left;});
        var d=debt[0], c=credit[0], n=Math.min(d.left,c.left);
        transfers.push({from:d.id,to:c.id,amount:n}); d.left-=n; c.left-=n;
        if (!d.left) debt.shift(); if (!c.left) credit.shift();
      }
      if (ledger.reduce(function(s,p){return s+p.share;},0)!==total || debt.length || credit.length) throw Error('정산 합계를 맞추지 못했어요. 입력 내용을 확인하고 다시 계산해 주세요.');
      return {total:total,ledger:ledger,items:items,transfers:transfers};
    }
    function textReport(r) {
      var lines=['[착착도구 모임 정산]','총 지출 '+money(r.total),'','■ 송금 안내'];
      if (!r.transfers.length) lines.push('추가로 보낼 돈이 없어요.');
      r.transfers.forEach(function(t){lines.push(name(t.from)+' → '+name(t.to)+' : '+money(t.amount));});
      lines.push('','■ 사람별 합계');
      r.ledger.forEach(function(p){lines.push(p.name+' | 결제 '+money(p.paid)+' | 부담 '+money(p.share)+' | '+(p.balance>0?'받을 돈 ':p.balance<0?'보낼 돈 ':'차액 ')+money(Math.abs(p.balance)));});
      lines.push('','■ 계산 근거');
      r.items.forEach(function(item){lines.push(item.title+' '+money(item.value)+' (결제: '+item.payer+')'); lines.push(item.shares.map(function(s){return s.name+' '+money(s.amount);}).join(' / '));});
      lines.push('','나머지 1원은 비용별로 체크한 사람 중 이름 등록 순서대로 배분했어요.','음식·기타와 술값은 별도 금액입니다. 실제 송금 전 내역을 확인해 주세요.');
      return lines.join('\n');
    }
    function showResult(r) {
      resultText=textReport(r); resultRevision=revision;
      $('.np-result').innerHTML='<h3>③ 정산 완료</h3><div class="np-note">모임 총 지출</div><div class="np-total">'+money(r.total)+'</div><p>'+people.length+'명 · 비용 '+r.items.length+'건 · 송금 '+r.transfers.length+'건</p><h4>이렇게 보내면 끝나요</h4>'+ (r.transfers.length?r.transfers.map(function(t){return '<div class="np-transfer">'+esc(name(t.from))+' → '+esc(name(t.to))+' <b>'+money(t.amount)+'</b></div>';}).join(''):'<p>이미 각자 부담할 만큼 결제했어요. 추가 송금은 없어요.</p>')+
        '<div class="np-scroll" tabindex="0" role="region" aria-label="사람별 정산표 · 좁은 화면에서 가로로 밀기"><table><caption>사람별 정산표 (좁으면 옆으로 밀어 보세요)</caption><thead><tr><th scope="col">이름</th><th scope="col">결제한 돈</th><th scope="col">부담할 돈</th><th scope="col">최종 차액</th></tr></thead><tbody>'+r.ledger.map(function(p){return '<tr><th scope="row">'+esc(p.name)+'</th><td>'+money(p.paid)+'</td><td>'+money(p.share)+'</td><td>'+(p.balance>0?'받기 ':p.balance<0?'보내기 ':'')+money(Math.abs(p.balance))+'</td></tr>';}).join('')+'</tbody></table></div><details><summary>왜 이 금액인가요? 계산 근거 보기</summary>'+r.items.map(function(item){return '<div class="np-detail"><p><b>'+esc(item.title)+' '+money(item.value)+'</b><br>결제: '+esc(item.payer)+'</p><p>'+item.shares.map(function(s){return esc(s.name)+' '+money(s.amount);}).join(' / ')+'</p></div>';}).join('')+'</details><p class="np-note">나머지 1원은 각 비용의 참여자 중 이름 등록 순서대로 배분해 합계를 맞춰요. 송금은 차액끼리 정리하며, 이체 횟수의 수학적 최솟값을 보장하지는 않아요.</p><div class="np-row np-actions">'+button('copy','단톡방용 결과 복사','class="np-primary"')+button('download','텍스트 저장')+button('manual','직접 선택해서 복사')+'</div>';
      $('.np-result').hidden=false; $('.np-result').focus();
    }
    function manual(s) { $('.np-manual').hidden=false; var ta=$('.np-manual textarea'); ta.value=s; ta.focus(); ta.select(); }
    function validResult() { return resultRevision===revision && !!resultText; }
    root.addEventListener('input',function(e){
      var el=e.target;
      if (el.dataset.person) { person(el.dataset.person).name=el.value; invalidate(); say('이름을 수정했어요. 입력을 마친 뒤 다시 정산해 주세요.'); }
      else if (el.dataset.round && el.type!=='checkbox' && el.tagName!=='SELECT') { var r=rounds.find(function(x){return x.id===el.dataset.round;}); r[el.dataset.field]=el.value; invalidate(); say('입력이 바뀌었어요. 아래에서 정산 결과를 다시 확인해 주세요.'); }
    });
    root.addEventListener('change',function(e){
      var el=e.target;
      if (el.dataset.person) { renderRounds(); return; }
      if (!el.dataset.round) return;
      var r=rounds.find(function(x){return x.id===el.dataset.round;}), f=el.dataset.field;
      if (el.type==='checkbox') {
        if(el.checked) { if(r[f].indexOf(el.value)<0) r[f].push(el.value); }
        else r[f]=r[f].filter(function(x){return x!==el.value;});
        if(f==='attendees') { r.drinkers=r.drinkers.filter(function(x){return r.attendees.indexOf(x)>=0;}); var box=el.closest('article').querySelectorAll('.np-chips')[1]; box.innerHTML=chips(r,'drinkers'); }
        invalidate(); say('부담할 사람이 바뀌었어요. 정산 결과를 다시 확인해 주세요.');
      } else if (el.tagName==='SELECT') { r[f]=el.value; invalidate(); say('결제자가 바뀌었어요. 정산 결과를 다시 확인해 주세요.'); }
    });
    root.addEventListener('click',function(e){
      var el=e.target.closest('button[data-action]'); if(!el || !root.contains(el)) return;
      var action=el.dataset.action;
      if(action==='calculate') { try { showResult(calculate()); say('정산이 끝났어요. 복사한 결과를 단톡방에 직접 붙여 넣으세요.'); } catch(err) { invalidate(); say(err.message); $('.np-status').scrollIntoView({block:'nearest'}); } return; }
      if(action==='copy') {
        if(!validResult()) { say('입력이 바뀌었어요. 먼저 다시 정산해 주세요.'); return; }
        var snapshot=resultText, current=revision;
        if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(snapshot).then(function(){if(current===revision)say('복사했어요. 카카오톡 단체방에 붙여 넣어 주세요.');}).catch(function(){if(current===revision){manual(snapshot);say('브라우저가 자동 복사를 허용하지 않았어요. 아래 내용을 길게 눌러 복사해 주세요.');}});
        else { manual(snapshot); say('이 브라우저에서는 자동 복사가 어려워요. 아래 내용을 직접 선택해 복사해 주세요.'); }
        return;
      }
      if(action==='manual') { if(validResult())manual(resultText); return; }
      if(action==='download') {
        if(!validResult()) return;
        try { var blob=new Blob(['\uFEFF'+resultText],{type:'text/plain;charset=utf-8'}), url=URL.createObjectURL(blob), a=document.createElement('a'); a.href=url; a.download='group-split-result.txt'; root.appendChild(a); a.click(); a.remove(); setTimeout(function(){URL.revokeObjectURL(url);},60000); say('텍스트 파일 저장을 요청했어요. 아이폰에서 미리보기가 열리면 공유 → 파일에 저장을 이용하세요. 저장이 안 되면 결과 복사를 이용해 주세요.'); }
        catch(err) { manual(resultText); say('파일을 저장하지 못했어요. 아래 정산 내용을 직접 복사해 주세요.'); }
        return;
      }
      if(action==='reset') { if(window.confirm('입력 내용을 지우고 새로 시작할까요? 필요한 결과는 먼저 복사해 주세요.')) reset(); return; }
      if(action==='demo') {
        if(!window.confirm('현재 입력을 예시로 바꿀까요? 필요한 결과는 먼저 복사해 주세요.')) return;
        people=['민수','지연','현우','수빈'].map(function(n){return {id:id(),name:n};}); rounds=[];
        var ids=personIds(), a=newRound(); a.title='1차 고깃집'; a.common='80000'; a.alcohol='30000'; a.drinkers=[ids[0],ids[2],ids[3]]; rounds.push(a);
        var b=newRound(); b.title='2차 호프'; b.common='45000'; b.alcohol='15000'; b.payer=ids[2]; b.drinkPayer=ids[2]; b.attendees=[ids[0],ids[2],ids[3]]; b.drinkers=[ids[0],ids[2]]; rounds.push(b);
        invalidate(); render(); say('예시: 지연은 1차만 참석하고 술은 안 마셔요. 수빈은 2차에서 술을 안 마셔요. 아래 정산 버튼을 눌러 보세요.'); return;
      }
      if(action==='add-person' && people.length<MAX_PEOPLE) {
        var p={id:id(),name:''}; people.push(p); invalidate(); render(); $('[data-person="'+p.id+'"]').focus(); say('사람을 추가했어요. 기존 자리에는 자동 포함되지 않으니 참석한 자리에서 체크해 주세요.'); return;
      }
      if(action==='remove-person' && people.length>2) {
        if(!window.confirm(name(el.dataset.id)+'님을 모든 자리에서 삭제할까요? 이 사람이 낸 비용의 결제자는 다시 골라야 해요.'))return;
        var pid=el.dataset.id; people=people.filter(function(p){return p.id!==pid;}); rounds.forEach(function(r){r.attendees=r.attendees.filter(function(x){return x!==pid;});r.drinkers=r.drinkers.filter(function(x){return x!==pid;});if(r.payer===pid)r.payer='';if(r.drinkPayer===pid)r.drinkPayer='';}); invalidate();render();say('사람을 삭제했어요. 남은 비용의 결제자와 부담할 사람을 확인해 주세요.'); return;
      }
      if(action==='add-round' && rounds.length<MAX_ROUNDS) { rounds.push(newRound());invalidate();renderRounds();$('.np-rounds article:last-child input').focus();say('자리를 추가했어요. 음식은 전체 인원, 술은 선택한 사람에게만 나눠요.');return; }
      if(action==='remove-round' && rounds.length>1) { if(!window.confirm('이 자리의 입력 내용을 삭제할까요?'))return;rounds=rounds.filter(function(r){return r.id!==el.dataset.id;});invalidate();renderRounds();say('자리를 삭제했어요. 다시 정산해 주세요.'); }
    });
    reset();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
