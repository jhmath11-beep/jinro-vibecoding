/**
 * [상·업무] 진로 체험 부스 배정 — 진로체험의 날 운영 업무
 * 학생이 구글 폼으로 1~3지망을 내면, 교사가 웹 콘솔에서 선착순 또는 "시드 무작위"로 정원 안에서 배정하고
 * "배정표"·"부스별 명단" 시트를 만든다. 학생은 같은 웹앱에서 학번+확인코드로 자기 결과만 조회한다.
 * 수준: 시작 프롬프트 + 다듬기 3회
 *
 * ── 시트 구조 ─────────────────────────────────────────────
 * "설문지 응답 시트1" (폼 응답, 1행 제목은 폼 질문 제목 그대로)
 *     타임스탬프 | 학번 | 이름 | 1지망 | 2지망 | 3지망 | 확인코드
 *     - 1~3지망: 드롭다운(보기는 "부스" 시트 이름과 똑같이)  - 확인코드: 학생이 정한 숫자 4자리(단답, 숫자 검증)
 *     - 같은 학번이 여러 번 내면 마지막 응답만 쓴다(그 제출 시각으로 선착순 계산)
 * "부스"  A 이름 | B 정원   (2행부터 부스 하나씩)
 * 자동으로 만들어지는 시트
 *     "배정표"      학번 | 이름 | 배정 부스 | 지망 순위 | 비고
 *     "부스별 명단"  부스마다 제목 줄 + 학번·이름 (인쇄용)
 *     "배정 기록"   실행 시각 | 실행한 사람 | 방식 | 시드 | 신청 | 배정 | 미배정   (같은 시드 = 같은 결과 재현용)
 *
 * ── 설치·배포 ─────────────────────────────────────────────
 * 1) 응답 스프레드시트 > 확장 프로그램 > Apps Script > 이 파일을 Code.gs 에 붙여넣기
 * 2) [+] > HTML > 파일 이름은 index > index.html 붙여넣기
 * 3) 편집기에서 함수 testAssign 실행 → 실행 로그에 "자체검사 통과"가 나오는지 확인
 *    (컴퓨터에 node 가 있으면: node -e "console.log(require('./Code.gs').testAssign())")
 * 4) 배포 > 새 배포 > 웹 앱 > 실행 사용자: 나 / 액세스 권한: (학교 도메인) 내 모든 사용자
 *    - 같은 주소를 교사가 열면 콘솔, 학생이 열면 조회 화면이 나온다(배포한 계정 = 교사)
 * 5) 코드를 고친 뒤에는 배포 > 배포 관리 > 연필 > 버전: 새 버전 > 배포
 */
const FORM_SHEET = '설문지 응답 시트1';
const BOOTH_SHEET = '부스';
const HEAD = { ts: '타임스탬프', id: '학번', name: '이름', c1: '1지망', c2: '2지망', c3: '3지망', code: '확인코드' };
const MAX_TRY = 5;              // 학번 하나당 확인코드 틀림 허용 횟수
const LOCK_MIN = 10;            // 넘으면 잠그는 시간(분)

/* ═══ 배정 로직: 순수 함수 (시트·구글 기능 없음 → node 로도 실행됨) ═══ */

// 시드 글자 → 32비트 정수 (FNV-1a)
function seedHash(s) {
  let h = 2166136261;
  s = String(s);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
// 시드 고정 난수 (mulberry32)
function rng(seed) {
  let a = seedHash(seed);
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * applicants: [{ id, name, ts, choices:[부스이름…] }]   booths: [{ name, cap }]
 * opts: { mode:'first' | 'seed', seed }
 * 순서를 정한 뒤 한 명씩 "남은 자리가 있는 가장 높은 지망"에 넣는다. 정원은 절대 넘지 않는다.
 */
function assign(applicants, booths, opts) {
  const left = {};
  booths.forEach(b => { left[b.name] = Math.max(0, Math.floor(Number(b.cap) || 0)); });
  // 시트 순서와 상관없게 학번으로 먼저 정렬
  const base = applicants.slice().sort((a, b) => String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
  let order;
  if (opts.mode === 'first') {
    order = base.slice().sort((a, b) => a.ts - b.ts);          // 안정 정렬: 같은 시각이면 학번 순
  } else {
    const r = rng(opts.seed);
    order = base.slice();
    for (let i = order.length - 1; i > 0; i--) {               // Fisher–Yates
      const j = Math.floor(r() * (i + 1));
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }
  }
  const got = {};
  order.forEach(a => {
    const seen = {};
    const ch = (a.choices || []).filter(c => c && left.hasOwnProperty(c) && !seen[c] && (seen[c] = 1));
    for (let k = 0; k < ch.length; k++) {
      if (left[ch[k]] > 0) { left[ch[k]]--; got[a.id] = { booth: ch[k], rank: (a.choices.indexOf(ch[k]) + 1) }; return; }
    }
  });
  const rows = base.map(a => ({ id: a.id, name: a.name,
    booth: got[a.id] ? got[a.id].booth : '', rank: got[a.id] ? got[a.id].rank : 0 }));
  const seats = {};
  booths.forEach(b => { seats[b.name] = rows.filter(r => r.booth === b.name).length; });
  return { rows: rows, seats: seats, unassigned: rows.filter(r => !r.booth).map(r => r.id) };
}

// 자체검사: 정원 초과 없음 / 지망 밖 배정 없음 / 같은 시드 = 같은 결과 / 선착순 1등은 1지망
function testAssign() {
  const ok = (c, m) => { if (!c) throw new Error('자체검사 실패: ' + m); };
  const booths = [{ name: 'A', cap: 3 }, { name: 'B', cap: 2 }, { name: 'C', cap: 1 }];
  const apps = [];
  for (let i = 0; i < 12; i++) apps.push({ id: String(20100 + i), name: 's' + i, ts: 1000 - i,
    choices: [['A', 'B', 'C'][i % 3], ['B', 'C', 'A'][i % 3], 'A'] });
  const r1 = assign(apps, booths, { mode: 'seed', seed: '2026' });
  booths.forEach(b => ok(r1.seats[b.name] <= b.cap, b.name + ' 정원 초과'));
  r1.rows.forEach(r => ok(!r.booth || apps.filter(a => a.id === r.id)[0].choices.indexOf(r.booth) >= 0, r.id + ' 지망 밖 배정'));
  ok(r1.unassigned.length === 12 - 6, '미배정 수');
  ok(JSON.stringify(r1) === JSON.stringify(assign(apps.slice().reverse(), booths, { mode: 'seed', seed: '2026' })), '같은 시드 다른 결과');
  const f = assign(apps, booths, { mode: 'first' });
  ok(f.rows.filter(r => r.id === '20111')[0].rank === 1, '선착순 1등이 1지망 못 받음');
  ok(assign([{ id: '1', name: 'x', ts: 1, choices: ['없는부스', 'A', 'A'] }], booths, { mode: 'first' }).rows[0].booth === 'A', '없는 부스 건너뛰기');
  return '자체검사 통과';
}

if (typeof module !== 'undefined') module.exports = { assign: assign, testAssign: testAssign, seedHash: seedHash };

/* ═══ 웹앱 (구글 기능 사용) ═══ */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('진로 체험 부스 배정')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function isTeacher_() {
  const me = Session.getActiveUser().getEmail();
  return !!me && me === Session.getEffectiveUser().getEmail();
}
function requireTeacher_() { if (!isTeacher_()) throw new Error('교사만 쓸 수 있는 기능이에요.'); }
function safe_(s) { s = String(s); return /^[=+\-@]/.test(s) ? "'" + s : s; }
function props_() { return PropertiesService.getScriptProperties(); }
function now_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'); }

function readBooths_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(BOOTH_SHEET);
  if (!sh) throw new Error('"' + BOOTH_SHEET + '" 시트가 없어요. A열 이름, B열 정원으로 만들어 주세요.');
  const n = sh.getLastRow() - 1;
  return (n > 0 ? sh.getRange(2, 1, n, 2).getValues() : [])
    .map(r => ({ name: String(r[0]).trim(), cap: Math.floor(Number(r[1]) || 0) }))
    .filter(b => b.name && b.cap > 0);
}

function readApplicants_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(FORM_SHEET);
  if (!sh) throw new Error('"' + FORM_SHEET + '" 시트가 없어요. 폼 응답 시트 이름을 확인해 주세요.');
  const all = sh.getDataRange().getValues();
  const head = (all.shift() || []).map(h => String(h).trim());
  const col = {}, miss = [];
  Object.keys(HEAD).forEach(k => { col[k] = head.indexOf(HEAD[k]); if (col[k] < 0) miss.push(HEAD[k]); });
  if (miss.length) throw new Error('폼 질문 제목이 달라요. 없는 열: ' + miss.join(', '));
  const by = {};
  all.forEach(r => {
    const id = String(r[col.id]).replace(/\D/g, '');
    if (!id) return;
    by[id] = { id: id, name: String(r[col.name]).trim().slice(0, 20),
      ts: r[col.ts] instanceof Date ? r[col.ts].getTime() : 0,
      choices: [r[col.c1], r[col.c2], r[col.c3]].map(c => String(c).trim()),
      code: String(r[col.code]).replace(/\D/g, '').replace(/^(\d{1,3})$/, m => ('000' + m).slice(-4)) }; // 0123 이 123 으로 저장돼도 맞춤
  });
  return Object.keys(by).map(k => by[k]);
}

function checkMode_(mode, seed) {
  if (mode !== 'first' && mode !== 'seed') throw new Error('배정 방식을 골라 주세요.');
  seed = String(seed || '').trim();
  if (mode === 'seed' && !/^[0-9A-Za-z가-힣-]{1,20}$/.test(seed)) throw new Error('시드는 글자·숫자 20자 안으로 적어 주세요.');
  return seed;
}

/* ── index.html 이 부르는 함수 (이름 1:1) ── */

// 교사면 콘솔 정보, 학생이면 { isTeacher:false } 만
function getConsole() {
  if (!isTeacher_()) return { isTeacher: false };
  const booths = readBooths_(), apps = readApplicants_();
  const names = booths.map(b => b.name);
  const issues = [];
  apps.forEach(a => {
    a.choices.forEach((c, i) => { if (c && names.indexOf(c) < 0) issues.push(a.id + ' ' + (i + 1) + '지망 "' + c + '"는 부스 시트에 없어요'); });
    if (!/^\d{4}$/.test(a.code)) issues.push(a.id + ' 확인코드가 숫자 4자리가 아니에요');
  });
  return { isTeacher: true, url: ScriptApp.getService().getUrl(), booths: booths, count: apps.length,
    issues: issues.slice(0, 30), issueCount: issues.length,
    last: JSON.parse(props_().getProperty('LAST') || 'null'), published: props_().getProperty('PUBLISHED') === 'true' };
}

function previewAssign(mode, seed) {
  requireTeacher_();
  seed = checkMode_(mode, seed);
  const res = assign(readApplicants_(), readBooths_(), { mode: mode, seed: seed });
  return { mode: mode, seed: seed, rows: res.rows, seats: res.seats, unassigned: res.unassigned };
}

// 서버에서 다시 계산해서 시트에 쓴다 (화면이 보낸 결과는 믿지 않는다)
function commitAssign(mode, seed) {
  requireTeacher_();
  seed = checkMode_(mode, seed);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('다른 배정이 진행 중이에요. 잠시 후 다시 눌러 주세요.');
  try {
    const booths = readBooths_(), apps = readApplicants_();
    const res = assign(apps, booths, { mode: mode, seed: seed });
    const ss = SpreadsheetApp.getActive();
    const sheet = name => { const s = ss.getSheetByName(name) || ss.insertSheet(name); s.clear(); return s; };

    const t = sheet('배정표');
    const out = [['학번', '이름', '배정 부스', '지망 순위', '비고']].concat(res.rows.map(r =>
      [safe_(r.id), safe_(r.name), safe_(r.booth || '미배정'), r.rank || '', r.booth ? '' : '지망 부스 정원 마감']));
    t.getRange(1, 1, out.length, 5).setValues(out);
    t.setFrozenRows(1);

    const l = sheet('부스별 명단');
    const list = [];
    booths.forEach(b => {
      const m = res.rows.filter(r => r.booth === b.name);
      list.push(['■ ' + b.name + ' (' + m.length + '/' + b.cap + '명)', '']);
      m.forEach(r => list.push([safe_(r.id), safe_(r.name)]));
      list.push(['', '']);
    });
    if (res.unassigned.length) {
      list.push(['■ 미배정 (' + res.unassigned.length + '명)', '']);
      res.rows.filter(r => !r.booth).forEach(r => list.push([safe_(r.id), safe_(r.name)]));
    }
    if (list.length) l.getRange(1, 1, list.length, 2).setValues(list);

    const last = { time: now_(), mode: mode, seed: seed, total: apps.length,
      assigned: apps.length - res.unassigned.length, unassigned: res.unassigned.length };
    const log = ss.getSheetByName('배정 기록') || ss.insertSheet('배정 기록');
    if (log.getLastRow() === 0) log.appendRow(['실행 시각', '실행한 사람', '방식', '시드', '신청', '배정', '미배정']);
    log.appendRow([last.time, Session.getActiveUser().getEmail(), mode === 'first' ? '선착순' : '시드 무작위',
      safe_(seed || '-'), last.total, last.assigned, last.unassigned]);
    props_().setProperty('LAST', JSON.stringify(last));
    return getConsole();
  } finally {
    lock.releaseLock();
  }
}

function setPublished(on) {
  requireTeacher_();
  if (on && !props_().getProperty('LAST')) throw new Error('먼저 배정을 확정해 주세요.');
  props_().setProperty('PUBLISHED', on ? 'true' : 'false');
  return getConsole();
}

// 학생 조회: 학번 + 확인코드가 둘 다 맞을 때만 본인 결과. 틀린 이유는 구분해 알려 주지 않는다.
function lookup(id, code) {
  id = String(id || '').replace(/\D/g, '');
  code = String(code || '').replace(/\D/g, '');
  if (!id || code.length !== 4) throw new Error('학번과 확인코드 4자리를 입력해 주세요.');
  if (props_().getProperty('PUBLISHED') !== 'true') throw new Error('아직 결과가 공개되지 않았어요. 선생님 안내를 기다려 주세요.');
  const cache = CacheService.getScriptCache(), key = 'try_' + id;
  const tries = Number(cache.get(key) || 0);
  if (tries >= MAX_TRY) throw new Error('여러 번 틀려서 ' + LOCK_MIN + '분 동안 조회가 잠겼어요. 잠시 후 다시 해 주세요.');
  const a = readApplicants_().filter(x => x.id === id)[0];
  if (!a || a.code !== code) {
    cache.put(key, String(tries + 1), LOCK_MIN * 60);
    throw new Error('학번 또는 확인코드가 맞지 않아요. (남은 기회 ' + (MAX_TRY - tries - 1) + '번)');
  }
  cache.remove(key);
  const sh = SpreadsheetApp.getActive().getSheetByName('배정표');
  const row = (sh ? sh.getDataRange().getDisplayValues() : []).filter(r => String(r[0]).replace(/\D/g, '') === id)[0];
  if (!row) return { name: a.name, booth: '', rank: 0 };
  return { name: a.name, booth: row[2] === '미배정' ? '' : row[2], rank: Number(row[3]) || 0 };
}
