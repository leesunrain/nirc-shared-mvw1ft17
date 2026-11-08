'use strict';
const KEY='dongma2027_v1';const $=id=>document.getElementById(id);const iso=d=>{let x=new Date(d);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`};const dt=s=>new Date(s+'T12:00:00');const plus=(s,n)=>{let d=dt(s);d.setDate(d.getDate()+n);return iso(d)};const days=(a,b)=>Math.round((dt(a)-dt(b))/86400000);const today=iso(new Date());const DEFAULT={goal:'2:59:00',sex:'M',race:'2027-03-21',logs:{},history:[]};let state;try{state={...DEFAULT,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{state={...DEFAULT}};const save=()=>localStorage.setItem(KEY,JSON.stringify(state));
// Accept H:MM:SS, HMMSS, HHMMSS, and Korean hour/minute/second expressions.
function parseGoal(value){
  let s=String(value??'').trim().replace(/\s+/g,'');
  let h,m,secPart;
  if(/^\d{1,2}:\d{1,2}:\d{1,2}$/.test(s)){
    [h,m,secPart]=s.split(':').map(Number);
  }else if(/^\d{5,6}$/.test(s)){
    h=Number(s.slice(0,-4));m=Number(s.slice(-4,-2));secPart=Number(s.slice(-2));
  }else{
    const match=s.match(/^(\d{1,2})시간(?:(\d{1,2})분)?(?:(\d{1,2})초)?$/);
    if(!match)return null;
    h=Number(match[1]);m=Number(match[2]??0);secPart=Number(match[3]??0);
  }
  if(!Number.isInteger(h)||!Number.isInteger(m)||!Number.isInteger(secPart)||m>59||secPart>59)return null;
  const total=h*3600+m*60+secPart;
  if(total<7200||total>36000)return null;
  return `${h}:${String(m).padStart(2,'0')}:${String(secPart).padStart(2,'0')}`;
}
const sec=s=>{let normalized=parseGoal(s);if(!normalized)return NaN;let [h,m,ss]=normalized.split(':').map(Number);return h*3600+m*60+ss};const clock=n=>{n=Math.max(0,Math.round(n));return `${Math.floor(n/3600)}:${String(Math.floor(n%3600/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`};const pace=n=>{n=Math.round(n);return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}/km`};
// Jack Daniels VDOT: oxygen cost of velocity / sustainable VO2 fraction by race duration.
function vdotFor(distanceKm,seconds){
  const minutes=seconds/60, v=distanceKm*1000/minutes;
  const oxygen=-4.60+0.182258*v+0.000104*v*v;
  const fraction=0.8+0.1894393*Math.exp(-0.012778*minutes)+0.2989558*Math.exp(-0.1932605*minutes);
  return oxygen/fraction;
}
function timeFromVdot(distanceKm,target){
  let low=distanceKm*120,high=distanceKm*1200;
  for(let i=0;i<90;i++){
    const mid=(low+high)/2;
    if(vdotFor(distanceKm,mid)>target)low=mid;else high=mid;
  }
  return (low+high)/2;
}
function estimate(){
  const full=sec(state.goal);
  if(!Number.isFinite(full)||full<7200||full>36000)return null;
  // Empirical variable coefficient, anchored at full marathon 3:00.
  // Every 10 minutes slower adds 30 seconds: at 3:40, male 15m / female 10m.
  // This is an extrapolating model, not a validated population predictor.
  const fullHalfConstant=(state.sex==='F' ? 480 : 780)+(full-10800)/20;
  const half=(full-fullHalfConstant)/2;
  let personalTen=NaN;
  for(const add of [480,540,600]){
    const v=(half-add)/2;
    if((add===480&&v<=2400)||(add===540&&v>2400&&v<=3000)||(add===600&&v>3000)){
      personalTen=v;break;
    }
  }
  if(!Number.isFinite(personalTen))personalTen=(half-540)/2;
  const vdot=vdotFor(42.195,full);
  const vdotTen=timeFromVdot(10,vdot);
  const ten=(personalTen+vdotTen)/2;
  return {full,half,fullHalfConstant,ten,personalTen,vdotTen,vdot,k:ten/10,mp:full/42.195};
}
// 12-week specific block: flat marathon preparation; recover every fourth week.
const W=[
{t:4,l:'평지 24km 이지',km:24,mode:'easy'},
{t:4,l:'평지 26km · 후반 8km MP+10',km:26,mode:'mp10',tail:8},
{t:4,l:'평지 28km 이지',km:28,mode:'easy'},
{t:3,l:'평지 22km 회복',km:22,mode:'easy'},
{t:4,l:'평지 28km · 후반 8km MP+10',km:28,mode:'mp10',tail:8},
{t:4,l:'평지 30km 이지',km:30,mode:'easy'},
{t:3,l:'평지 32km · 후반 8km MP+10',km:32,mode:'mp10',tail:8},
{t:3,l:'D-4주 · 24km E + 8km MP+10초',km:32,mode:'mp10',tail:8},
{t:2,l:'D-3주 · 5km E + 20km MP + 5km E',km:30,mode:'mpMiddle'},
{t:2,l:'D-2주 · 하프 21.1km 통제주',km:21.1,mode:'half'},
{t:2,l:'D-1주 · 12km 전 구간 MP',km:12,mode:'mpFull'},
{t:2,l:'대회 주간 · 회복',km:0,mode:'easy'}];
const PRE=[16,20,24,16,20,24,24,16,20];
const PRE_TARGET=[75,80,85,70,85,90,95,80,85];
const PRE_VO2=[4,5,5,3,5,5,4,3,4];
const PRE_LT=[3,3,3,2,3,3,3,2,3];
function schedule(date){let E=estimate();if(!E)return {name:'목표 기록 확인',detail:'올바른 풀코스 목표 기록을 입력하세요.',km:0,type:'rest',phase:'설정'};let r=state.race;let raceWeek=plus(r,-83);let w=days(date,raceWeek);let wi=Math.floor(w/7);let dow=dt(date).getDay();let prepStart=plus(raceWeek,-63);let isRace=date===r;let phase=days(date,prepStart)<0?'준비 시작 전':days(date,r)>0?'대회 이후':wi>=0?(wi===11?'대회 주간':`본훈련 ${wi+1}/12주`):`준비기 ${Math.max(1,Math.floor(days(date,prepStart)/7)+1)}/9주`;let k=E.k, mp=E.mp;let easy=pace(k+100), jog=pace(k+100), sat=pace(k+70);const trainingMp=(E.full<=10800?254:E.mp);let name='',detail='',km=0,type='easy',sets=0;
if(isRace){name='🏁 풀코스 레이스';detail=`42.195km · 목표 ${clock(E.full)} · 평균 ${pace(mp)}\n전반 과속 금지, 급수·보급 계획 준수`;km=42.195;type='race';return {name,detail,km,type,phase,sets}}
// Race-week fixed sessions take precedence over generic taper and mileage allocation.
// Keep JD as the coach's named session; its exact reps/intensity are not specified.
if(days(r,date)===4){return {name:'잭 다니엘스(JD) 훈련',detail:'대회 전 수요일 · JD 훈련 (세부 구성은 감독자 기존 루틴 적용)\n워밍업·쿨다운 조깅은 각각 40분 이내 · 무리한 추가 훈련 금지',km:0,type:'point',phase,sets:0}}
if(days(r,date)===2){return {name:'25분주',detail:'대회 이틀 전 금요일 · 25분주\n조깅은 40분 이내 · 페이스와 세부 구성은 기존 감독자 루틴 적용 (총거리 미지정)',km:0,type:'easy',phase,sets:0}}
if(date==='2026-10-24')return {name:'준비기 전 회복·점검',detail:'가벼운 조깅 6~8km (선택) 또는 휴식 · 컨디션 점검\n10월 26일(월)부터 21주 정규 훈련 시작',km:7,type:'easy',phase:'사전 준비',sets:0};
if(date==='2026-10-25')return {name:'준비기 전 가벼운 조깅',detail:'이지 조깅 10~12km (선택) · '+pace(E.k+110)+'\n다음 날 월요일 휴식 후 정규 1주차 시작',km:11,type:'easy',phase:'사전 준비',sets:0};
if(days(date,prepStart)<0||days(date,r)>0){return {name:'정규 일정 외',detail:'훈련 기간은 대회일 기준 준비기 9주 + 본훈련 12주입니다.',km:0,type:'rest',phase,sets}}
let idx=wi<0?Math.min(8,Math.max(0,Math.floor(days(date,prepStart)/7))):wi;let peak=wi>=0&&wi<=10;let config=peak?W[wi]:null;
if(dow===1){name='휴식';detail='완전 휴식 · 가벼운 가동성 운동 선택';type='rest'}
if(dow===2){type='vo2';sets=peak?config.t:PRE_VO2[idx];if(wi===11){sets=3;name='가벼운 자극 · 400~1000m × 3';detail=`짧은 질주 3회 · 목표 ${pace(k-10)} 이내, 무리 금지\n반복 간 회복 2분 · 조깅은 총 40분 이내 (거리는 참고값)`;km=0}else if(peak && [1,3,5,7].includes(wi)){type='alternate';name='화요일 연속 변속주 (AR)';km=wi===7?8:10;detail=`워밍업 2km → (1000m ${pace(k+5)} / 1000m ${pace(trainingMp+30)}) × ${wi===7?2:3}회 → 쿨다운 2km\n정지 없는 연속주 · 일요일 MP 장거리 피로 시 이지 조깅 대체`;sets=wi===7?2:3}else{name=`VO₂max 1000m × ${sets}`;detail=`1000m ${sets}회 · ${pace(k-10)} (10K 페이스 −10초/km)\n반복 사이 2분 가벼운 조깅/걷기\n워밍업 2km + 쿨다운 2km · 총 약 ${sets+4+Math.max(0,sets-1)*0.2}km`;km=+(sets+4+Math.max(0,sets-1)*0.2).toFixed(1)}}
if(dow===3){name='이지 조깅';km=wi<0?12:wi>=9?6:wi===3||wi===6?8:9;detail=`${km}km · ${jog}\n전날 인터벌 후 회복 우선`}
if(dow===4){type='lt';let rep=peak?wi===3?'1600m × 3':wi===6?'2000m × 2':wi===9?'1600m × 2':wi===10?'1000m × 3':wi===8||wi===5||wi===6?'2000m × 2':'2000m × 3':`2000m × ${PRE_LT[idx]}`;if(wi===11){name='가벼운 조깅 + 짧은 자극';detail=`조깅 40분 이내 · ${jog}\n짧은 자극은 컨디션에 따라 선택 · 과도한 훈련 금지`;km=0;type='easy'}else{name=`LT 인터벌 ${rep}`;let part=rep.startsWith('1600')?1.6:rep.startsWith('1000')?1:2;let count=Number(rep.split('×')[1].trim());km=+(part*count+4+(count-1)*0.1).toFixed(1);sets=count;detail=`${rep} · ${pace(k+10)} (10K 페이스 +10초/km)\n반복 사이 1분 가벼운 이동/조깅\n워밍업 2km + 쿨다운 2km · 총 약 ${km}km`}}
if(dow===5){name='회복 조깅';km=wi<0?10:wi>=10?6:wi===3||wi===6?6:8;detail=`${km}km · ${jog}\n회복이 부족하면 휴식으로 대체`}
if(dow===6){name='유산소 이지주';km=wi<0?12:wi===11?0:wi>=9?8:wi===3||wi===6?8:wi===5||wi===8?10:11;detail=`${km}km · ${sat}\n일요일 장거리 대비 편안하게`}
if(dow===0){type='long';if(wi===11){name='대회 전날 휴식';detail='완전 휴식 · 보급·장비 점검';type='rest'}else if(peak){let c=W[wi];name=c.l;km=c.km;let tail=c.tail||0;if(c.mode==='easy')detail=`${km}km · 이지 ${easy}`;else if(c.mode==='steady')detail=`앞 ${km-tail}km ${easy} → 뒤 ${tail}km 스테디 ${pace(k+75)} (상태에 따라 조정)`;else if(c.mode==='progress')detail=`28km 프로그레션 · 이지 ${easy} 시작, 후반 점진 가속 (MP보다 빠르지 않게)`;else if(c.mode==='alternate')detail=`${km}km 변속주 · 이지 ${easy} / 스테디 ${pace(k+70)} 구간 반복\n피로가 높으면 전 구간 이지로 변경`;else if(c.mode==='mpTail')detail=`앞 ${km-tail}km 이지 ${easy} → 뒤 ${tail}km MP ${pace(trainingMp)}`;else if(c.mode==='mp10')detail=`앞 ${km-tail}km 이지 ${easy} → 후반 ${tail}km ${pace(trainingMp+10)}`;else if(c.mode==='mpMiddle')detail=`5km 이지 ${easy} → 20km MP ${pace(trainingMp)} → 5km 이지 ${easy}\nD-3주 핵심 고부하: 회복 상태에 따라 조절`;else if(c.mode==='half')detail=`하프 21.1km 통제주 · 목표 ${clock(E.full/2-50)} · 평균 ${pace((E.full/2-50)/21.0975)}\n전력 레이스 금지 · 피로 누적 시 거리/강도 축소`;else if(c.mode==='mpFull')detail=`12km 전 구간 MP ${pace(trainingMp)} · 대회 1주 전 마지막 MP 리듬 확인\n무리한 가속 금지 · 피로가 남으면 단축`;else detail=`${km}km MP ${pace(trainingMp)}`}else{km=PRE[idx];name=`너리재 언덕 ${km}km`;detail=`너리재 오르막·내리막 반복 · 총 ${km}km\n이지 노력 강도 유지, 내리막 과속 금지 · 8km 회전 기준, 추가 거리는 선택` }}
// Saturday is fixed at 10 km. Preparation weekly targets are met by Wednesday/Friday only.
if(dow===6 && wi===11){km=0;type='rest';name='대회 전날 휴식';detail='휴식 · 보급·장비 점검 · 새로운 훈련 금지'}
if(dow===6 && wi!==11){km=10;name='토요일 조깅 10km';detail=`10km · ${sat} (10K 기준 +1분 10초/km)\n일요일 장거리 대비 편안하게`}
if([3,5].includes(dow) && wi!==11){
 let monday=plus(date,-((dow+6)%7));
 let target;
 if(wi<0){target=PRE_TARGET[idx]}
 else {
  // Preserve the existing marathon-specific week's total: only move the
  // difference caused by Saturday's new fixed 10 km to Wed/Fri.
  let oldSat=wi>=9?8:wi===3||wi===6?8:wi===5||wi===8?10:11;
  target=null;
  let delta=oldSat-10;
  let oldWed=wi>=9?6:wi===3||wi===6?8:9;
  let oldFri=wi>=10?6:wi===3||wi===6?6:8;
  km=+( (dow===3?oldWed:oldFri) + (dow===3?Math.ceil(delta*10/2)/10:Math.floor(delta*10/2)/10) ).toFixed(1);
 }
 if(target!==null){
  let fixed=0;
  for(let j=0;j<7;j++){let day=plus(monday,j),dayDow=dt(day).getDay();if([3,5].includes(dayDow))continue;fixed+=schedule(day).km}
  let remaining=+(target-fixed).toFixed(1);
  km=dow===3?+(remaining/2).toFixed(1):+(remaining-+(remaining/2).toFixed(1)).toFixed(1);
 }
 name=dow===3?'이지 조깅':'회복 조깅';
 detail=`${km}km · ${jog} (10K 기준 +1분 40초/km)\n${wi<0?`준비기 주간 ${target}km 목표 · 수/금 거리 조절`:'본훈련 기존 주간 총거리 유지 · 수/금 거리 조절'}\n피로·통증 시 목표 거리보다 회복을 우선`;
}
return {name,detail,km,type,phase,sets}}
function el(tag,txt){let x=document.createElement(tag);x.textContent=txt;return x}function showTab(tab){document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===tab));['today','calendar','log','analysis'].forEach(id=>$(id).classList.toggle('hidden',id!==tab));if(tab==='analysis')renderStats();if(tab==='calendar')renderCal();if(tab==='log')renderLog()}
let selected=today,month=today.slice(0,7);function renderMetrics(){let E=estimate();$('metrics').replaceChildren();if(!E)return;[['풀코스 목표',clock(E.full)],['풀→하프 환산 상수',`${Math.floor(E.fullHalfConstant/60)}분 ${String(Math.round(E.fullHalfConstant%60)).padStart(2,'0')}초`],['공식 풀 목표 페이스',pace(E.mp)],['동마 훈련 MP (서브3)',pace(E.full<=10800?254:E.mp)],['10K 통합 예상 (평균)',clock(E.ten)],['10K 개인 공식',clock(E.personalTen)],['10K VDOT 환산',clock(E.vdotTen)],['10K 기준 페이스',pace(E.k)],['VO₂max 90% · 1000m',pace(E.k-10)],['LT 인터벌 · 2000m',pace(E.k+10)],['LT 지속주',pace(E.k+15)],['수·금 회복 조깅',pace(E.k+100)],['토요일 조깅 10km',pace(E.k+70)],['일요일 이지',pace(E.k+100)]].forEach(([a,b])=>{let d=el('div','');d.className='metric';d.append(el('small',a),el('b',b));$('metrics').append(d)})}
function renderDay(){let s=schedule(selected),log=state.logs[selected];$('selectedDate').value=selected;$('dayTitle').textContent=`${selected} · ${['일','월','화','수','목','금','토'][dt(selected).getDay()]}요일`;$('countdown').textContent=`대회까지 D${days(state.race,selected)>=0?'-'+days(state.race,selected):'+'+Math.abs(days(state.race,selected))} · ${state.race} (동아마라톤)`;$('phase').textContent=s.phase;$('workout').textContent=`${s.name}\n계획 거리: ${s.km}km\n${s.detail}`;$('dailyNote').textContent=log?`실제 기록: ${log.status==='done'?'완료':log.status==='partial'?'일부 완료':'미실시'} · ${log.distance||0}km · RPE ${log.rpe||'미입력'}`:'아직 실제 훈련 기록이 없습니다.';renderWeek()}
function renderWeek(){let monday=plus(selected,-((dt(selected).getDay()+6)%7));let box=$('weekTable');box.replaceChildren();let table=el('table',''),thead=el('tr','');['날짜','훈련','계획 거리','실제'].forEach(t=>thead.append(el('th',t)));table.append(thead);for(let i=0;i<7;i++){let date=plus(monday,i),s=schedule(date),l=state.logs[date],tr=el('tr','');[date.slice(5),s.name,`${s.km}km`,l?`${l.distance||0}km`:'—'].forEach(t=>tr.append(el('td',t)));tr.style.cursor='pointer';tr.onclick=()=>{selected=date;renderDay()};table.append(tr)}box.append(table)}
function renderCal(){let [y,m]=month.split('-').map(Number),first=new Date(y,m-1,1),offset=first.getDay(),count=new Date(y,m,0).getDate();$('monthTitle').textContent=`${y}년 ${m}월`;$('cal').replaceChildren();['일','월','화','수','목','금','토'].forEach(x=>$('cal').append(el('div',x)));for(let i=0;i<Math.ceil((offset+count)/7)*7;i++){let d=i-offset+1,date=iso(new Date(y,m-1,d,12)),s=schedule(date),l=state.logs[date],b=el('button','');b.className='day'+(d<1||d>count?' outside':'')+(l?(l.status==='miss'?' miss':' done'):'')+(s.type==='long'?' long':s.type==='lt'||s.type==='vo2'?' point':'')+(selected===date?' active':'');b.append(el('strong',String(dt(date).getDate())),el('small',s.name.replace('VO₂max ','').slice(0,13)));b.onclick=()=>{selected=date;renderDay();showTab('today')};$('cal').append(b)}}
function renderLog(){let date=$('logDate').value||selected;$('logDate').value=date;let s=schedule(date),l=state.logs[date];$('planned').textContent=`계획: ${s.name} · ${s.km}km\n${s.detail}`;$('kind').value=l?.kind||({vo2:'VO₂max 인터벌',lt:'LT 인터벌',long:'장거리',rest:'휴식',race:'대회'}[s.type]||'조깅');$('distance').value=l?.distance??'';$('pace').value=l?.pace||'';$('reps').value=l?.reps??'';$('status').value=l?.status||'done';$('rpe').value=l?.rpe||'';$('memo').value=l?.memo||'';renderRecent()}
function renderRecent(){let box=$('recent');box.replaceChildren();let keys=Object.keys(state.logs).sort().reverse().slice(0,25);if(!keys.length){box.textContent='아직 기록이 없습니다.';return}let table=el('table','');keys.forEach(date=>{let l=state.logs[date],tr=el('tr','');[date,l.kind,`${l.distance}km`,l.status==='done'?'완료':l.status==='partial'?'조정':'미실시'].forEach(v=>tr.append(el('td',v)));tr.onclick=()=>{$('logDate').value=date;renderLog();window.scrollTo({top:0,behavior:'smooth'})};table.append(tr)});box.append(table)}
function renderStats(){let keys=Object.keys(state.logs).sort(),plan=0,actual=0,completed=0,partial=0,point=0,long=0;keys.forEach(d=>{let l=state.logs[d],s=schedule(d);plan+=s.km;actual+=Number(l.distance)||0;if(l.status==='done')completed++;if(l.status==='partial')partial++;if(s.type==='lt'||s.type==='vo2')point++;if(s.type==='long')long++});let box=$('stats');box.replaceChildren();let g=el('div','');g.className='grid';[['기록 일수',keys.length+'일'],['계획 거리(기록일)',plan.toFixed(1)+'km'],['실제 누적 거리',actual.toFixed(1)+'km'],['거리 달성률',plan>0?(actual/plan*100).toFixed(0)+'%':'—'],['완료/조정',`${completed} / ${partial}일`],['기록된 포인트/장거리',`${point} / ${long}일`]].forEach(([a,b])=>{let d=el('div','');d.className='metric';d.append(el('small',a),el('b',b));g.append(d)});box.append(g);let h=el('h3','최근 8주 · 계획/실제 거리'),t=el('table','');box.append(h,t);for(let i=7;i>=0;i--){let end=plus(today,-i*7),start=plus(end,-6),p=0,a=0;for(let j=0;j<7;j++){let date=plus(start,j);if(date>today)continue;let s=schedule(date);p+=s.km;a+=Number(state.logs[date]?.distance)||0}let tr=el('tr','');[`${start.slice(5)}~${end.slice(5)}`,`${p.toFixed(0)}km`,`${a.toFixed(1)}km`].forEach(v=>tr.append(el('td',v)));t.append(tr)} }
function download(name,content,mime){let url=URL.createObjectURL(new Blob([content],{type:mime})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));$('saveGoal').onclick=()=>{let v=$('goal').value.trim();let normalized=parseGoal(v);if(!normalized){alert('기록을 확인해 주세요. 예: 25930 / 2:59:30 / 2시간 59분 30초');return}state.history.push({date:today,goal:state.goal,sex:state.sex});state.goal=normalized;state.sex=$('sex').value;save();renderMetrics();renderDay();alert('목표가 저장되었습니다. 과거 실제 훈련 기록은 유지됩니다.')};$('selectedDate').onchange=e=>{selected=e.target.value;renderDay()};$('goLog').onclick=()=>{$('logDate').value=selected;showTab('log')};$('logDate').onchange=renderLog;$('saveLog').onclick=()=>{let date=$('logDate').value,d=Number($('distance').value),v=$('pace').value.trim();if(!date||!Number.isFinite(d)||d<0||$('distance').value===''){alert('날짜와 실제 총거리를 입력하세요. 미실시한 날은 0km로 입력할 수 있습니다.');return}if(v&&!/^\d{1,2}:[0-5]\d$/.test(v)){alert('평균 페이스는 분:초 형식으로 입력하세요.');return}state.logs[date]={kind:$('kind').value,distance:d,pace:v,reps:$('reps').value,rpe:$('rpe').value,status:$('status').value,memo:$('memo').value,updated:new Date().toISOString(),plannedAtSave:schedule(date)};save();selected=date;renderDay();renderLog();alert('훈련 기록이 저장되었습니다.')};$('deleteLog').onclick=()=>{let d=$('logDate').value;if(state.logs[d]&&confirm(`${d} 기록을 삭제할까요?`)){delete state.logs[d];save();renderLog();renderDay()}};$('prevMonth').onclick=()=>{let [y,m]=month.split('-').map(Number);month=iso(new Date(y,m-2,1,12)).slice(0,7);renderCal()};$('nextMonth').onclick=()=>{let [y,m]=month.split('-').map(Number);month=iso(new Date(y,m,1,12)).slice(0,7);renderCal()};$('saveRace').onclick=()=>{let v=$('raceDate').value;if(!v){alert('대회 날짜를 입력하세요.');return}if(confirm('대회일 변경 시 앞으로 표시되는 계획이 재배치됩니다. 계속할까요?')){state.race=v;save();renderDay();alert('대회일을 저장했습니다. 공식 일정을 반드시 확인하세요.')}};$('export').onclick=()=>download(`dongma2027-backup-${today}.json`,JSON.stringify({app:'dongma2027',version:1,exported:new Date().toISOString(),data:state},null,2),'application/json');$('csv').onclick=()=>{let rows=[['날짜','계획훈련','계획km','실제종목','실제km','평균페이스','반복횟수','RPE','상태','메모']];Object.keys(state.logs).sort().forEach(date=>{let l=state.logs[date],p=l.plannedAtSave||schedule(date);rows.push([date,p.name,p.km,l.kind,l.distance,l.pace,l.reps,l.rpe,l.status,l.memo])});let csv='\ufeff'+rows.map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n');download(`dongma2027-records-${today}.csv`,csv,'text/csv;charset=utf-8')};$('import').onchange=async e=>{let file=e.target.files[0];if(!file)return;try{let obj=JSON.parse(await file.text());if(obj.app!=='dongma2027'||!obj.data||typeof obj.data.logs!=='object'||!obj.data.race)throw Error('지원하지 않는 백업 파일');if(confirm('현재 저장된 데이터를 백업 파일 내용으로 교체할까요?')){state={...DEFAULT,...obj.data};save();location.reload()}}catch(err){alert('복원 실패: '+err.message)}e.target.value=''};for(let i=1;i<=10;i++)$('rpe').append(el('option',String(i)));$('goal').value=state.goal;$('sex').value=state.sex;$('raceDate').value=state.race;$('selectedDate').value=selected;$('logDate').value=selected;renderMetrics();renderDay();renderLog();if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});


// Export the complete 21-week plan as a high-resolution, shareable PNG.
function makePlanCanvas(){
 const scale=2,W=1440,headerH=290,rowH=110,footerH=105,totalWeeks=21,H=headerH+totalWeeks*rowH+footerH;
 const c=document.createElement('canvas');c.width=W*scale;c.height=H*scale;const x=c.getContext('2d');x.scale(scale,scale);
 x.fillStyle='#f1f5fa';x.fillRect(0,0,W,H);
 x.fillStyle='#10294a';x.fillRect(0,0,W,headerH);
 x.fillStyle='#fff';x.font='bold 47px system-ui, sans-serif';x.fillText('2027 동아마라톤 | 21주 통합 훈련표',48,78);
 x.font='26px system-ui, sans-serif';x.fillStyle='#d9edff';x.fillText(`대회 ${state.race}  ·  풀 목표 ${state.goal}  ·  준비기 9주 + 본훈련 12주`,50,127);
 const E=estimate();if(E){x.font='23px system-ui, sans-serif';x.fillText(`10K 예상 ${clock(E.ten)}  |  VO₂max ${pace(E.k-10)}  |  LT ${pace(E.k+10)}  |  MP ${pace(E.mp)}`,50,176)}
 x.font='20px system-ui, sans-serif';x.fillStyle='#ffe3a3';x.fillText('※ 거리에는 워밍업·쿨다운 포함 / 실제 기록과 회복 상태에 따라 조정',50,218);
 const columns=[{name:'주차 / 날짜',x:40,w:230},{name:'주간 km',x:285,w:120},{name:'화 · VO₂max',x:420,w:255},{name:'목 · LT',x:690,w:250},{name:'일 · 장거리',x:955,w:440}];
 x.fillStyle='#dae9f6';x.fillRect(25,headerH-48,W-50,44);x.font='bold 20px system-ui, sans-serif';x.fillStyle='#173d62';columns.forEach(v=>x.fillText(v.name,v.x,headerH-18));
 function fit(t,max,width){let z=String(t);while(x.measureText(z).width>width&&z.length>4)z=z.slice(0,-2);return z===String(t)?z:z+'…'}
 const raceWeek=plus(state.race,-83),prepStart=plus(raceWeek,-63);
 for(let i=0;i<21;i++){
  const monday=plus(prepStart,i*7),sunday=plus(monday,6),tue=schedule(plus(monday,1)),thu=schedule(plus(monday,3)),sun=schedule(sunday);
  const y=headerH+i*rowH;
  x.fillStyle=i<9?(i%2?'#eaf5ff':'#f9fcff'):(i%2?'#fff7ec':'#fffdf9');x.fillRect(25,y,W-50,rowH-3);
  x.fillStyle=i<9?'#1978b8':'#df8534';x.fillRect(25,y,8,rowH-3);
  x.font='bold 22px system-ui, sans-serif';x.fillStyle='#173d62';x.fillText(`${i<9?'준비':'본훈련'} ${i<9?i+1:i-8}주`,40,y+34);
  x.font='18px system-ui, sans-serif';x.fillStyle='#55748b';x.fillText(`${monday.slice(5)} ~ ${sunday.slice(5)}`,40,y+65);
  let total=0;for(let d=0;d<7;d++)total+=schedule(plus(monday,d)).km;
  x.font='bold 26px system-ui, sans-serif';x.fillStyle='#173d62';x.fillText(`${Math.round(total)} km`,285,y+47);
  x.font='bold 20px system-ui, sans-serif';x.fillStyle='#183d60';x.fillText(fit(tue.name,0,245),420,y+37);x.fillText(fit(thu.name,0,235),690,y+37);x.fillText(fit(sun.name,0,420),955,y+37);
  x.font='17px system-ui, sans-serif';x.fillStyle='#5c7284';
  x.fillText(tue.type==='vo2'?`${pace(E.k-10)} · 회복 2분`:tue.type==='alternate'?'1000m 빠름/느림 연속':'컨디션 조절',420,y+70);
  x.fillText(thu.type==='lt'?`${pace(E.k+10)} · 회복 1분`:'강도 조절',690,y+70);
  x.fillText(fit(sun.detail.split('\\n')[0].split('\n')[0],0,420),955,y+70);
 }
 x.fillStyle='#10294a';x.fillRect(0,H-footerH,W,footerH);x.fillStyle='#fff';x.font='21px system-ui, sans-serif';x.fillText('월 휴식 · 수/금 회복 조깅 · 토 10km(+70초) · 화/목 포인트 · 일 장거리',45,H-footerH+42);
 x.font='18px system-ui, sans-serif';x.fillText('훈련관리 앱에서 생성한 개인 맞춤 계획 · 계획과 실제 운동은 앱에서 별도 기록',45,H-footerH+77);
 return c;
}
function planPng(){return new Promise((resolve,reject)=>{try{makePlanCanvas().toBlob(b=>b?resolve(b):reject(new Error('PNG 생성 실패')),'image/png')}catch(e){reject(e)}})}
// PNG exports: selected week, visible calendar month, or full 21-week plan.
function compactCanvas(mode){
 const dates=[];
 if(mode==='week') {let monday=plus(selected,-((dt(selected).getDay()+6)%7));for(let i=0;i<7;i++)dates.push(plus(monday,i));}
 else {let [y,m]=month.split('-').map(Number);let n=new Date(y,m,0).getDate();for(let i=1;i<=n;i++)dates.push(`${y}-${String(m).padStart(2,'0')}-${String(i).padStart(2,'0')}`);}
 const scale=2,W=1120,rowH=88,H=230+dates.length*rowH+95,c=document.createElement('canvas');c.width=W*scale;c.height=H*scale;const g=c.getContext('2d');g.scale(scale,scale);
 g.fillStyle='#f2f6fb';g.fillRect(0,0,W,H);g.fillStyle='#10294a';g.fillRect(0,0,W,190);
 g.fillStyle='white';g.font='bold 39px system-ui';g.fillText(`동아마라톤 ${mode==='week'?'주간':'월간'} 훈련표`,34,64);
 g.font='23px system-ui';g.fillText(`${dates[0]} ~ ${dates[dates.length-1]} · 목표 ${state.goal}`,34,109);
 g.fillText('월 휴식 / 화 VO₂max·AR / 목 LT / 토 10km(+70초) / 일 장거리',34,149);
 g.fillStyle='#d8e9f7';g.fillRect(20,190,W-40,39);g.fillStyle='#173d62';g.font='bold 20px system-ui';g.fillText('날짜',32,216);g.fillText('훈련',210,216);g.fillText('거리',625,216);g.fillText('핵심 내용',760,216);
 const fit=(value,width)=>{let v=String(value);while(g.measureText(v).width>width&&v.length>3)v=v.slice(0,-2);return v===String(value)?v:v+'…'};
 let total=0;
 dates.forEach((date,i)=>{let s=schedule(date),y=230+i*rowH;total+=s.km;g.fillStyle=i%2?'#eaf3fb':'#fff';g.fillRect(20,y,W-40,rowH-3);g.fillStyle='#153955';g.font='bold 20px system-ui';g.fillText(date.slice(5)+' ('+'일월화수목금토'[dt(date).getDay()]+')',32,y+34);g.fillText(fit(s.name,385),210,y+34);g.fillText(`${s.km}km`,625,y+34);g.font='17px system-ui';g.fillStyle='#516a80';g.fillText(fit(s.detail.split('\n')[0],325),760,y+34);let l=state.logs[date];if(l)g.fillText(`실제 ${l.distance||0}km / RPE ${l.rpe||'-'}`,210,y+65);else g.fillText(fit(s.phase,350),210,y+65);});
 g.fillStyle='#10294a';g.fillRect(0,H-95,W,95);g.fillStyle='#fff';g.font='bold 24px system-ui';g.fillText(`계획 합계 ${total.toFixed(1)}km · 실제 기록은 입력된 날짜만 표시`,30,H-43);
 return c;
}
function pngBlob(mode){return new Promise((resolve,reject)=>{try{(mode==='all'?makePlanCanvas():compactCanvas(mode)).toBlob(b=>b?resolve(b):reject(new Error('PNG 생성 실패')),'image/png')}catch(e){reject(e)}})}
async function imageAction(mode,share){try{const blob=await pngBlob(mode),label={week:'주간',month:'월간',all:'전체21주'}[mode],filename=`동아마라톤-${label}-훈련표-${state.goal.replaceAll(':','')}.png`;
 if(share){let file=new File([blob],filename,{type:'image/png'});if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:`동아마라톤 ${label} 훈련표`});return;}alert('직접 공유를 지원하지 않는 환경입니다. PNG 저장 후 갤러리에서 공유하세요.');return;}
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
 }catch(e){if(e.name!=='AbortError')alert('이미지 처리 실패: '+e.message)}}
[['exportWeek','week',false],['shareWeek','week',true],['exportMonth','month',false],['shareMonth','month',true],['exportPlan','all',false],['sharePlan','all',true]].forEach(([id,mode,share])=>$(id).onclick=()=>imageAction(mode,share));
