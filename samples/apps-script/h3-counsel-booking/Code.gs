/**
 * [하·업무] 진로상담 예약 웹앱 — 상담 업무
 * 학생이 학교 계정으로 들어와 주간 캘린더에서 빈 상담 시간을 골라 예약하고, 자기 예약만 보고 취소한다.
 * 예약되면 담당 교사(배포한 사람)에게 메일이 가고, 교사의 구글 캘린더에 일정이 들어간다.
 * 수준: 시작 프롬프트 + 다듬기 3회
 *
 * ── 시트 구조 ─────────────────────────────────────────────
 * 시트 이름 "슬롯", 1행은 제목, 2행부터 슬롯 하나가 한 행
 *   A 날짜        2026-11-04   (서식 > 숫자 > 일반 텍스트 권장)
 *   B 시간        15:40        (시작 시각, 일반 텍스트 권장)
 *   C 상태        빈자리 / 예약됨 / 닫힘   (교사가 "닫힘"으로 바꾸면 예약 불가)
 *   D 예약자이메일 (자동)
 *   E 주제        (자동: "주제 · 메모")
 *   F 일정ID      (자동: 캘린더 일정 삭제용, 지우지 마세요)
 * 교사가 할 일: A·B 에 상담 가능한 시간을 적고 C 를 "빈자리"로 둔다.
 *
 * ── 설치·배포 ─────────────────────────────────────────────
 * 1) 스프레드시트 > 확장 프로그램 > Apps Script > 이 파일을 Code.gs 에 붙여넣기
 * 2) 왼쪽 [+] > HTML > 파일 이름은 index (확장자 없이) > index.html 붙여넣기
 * 3) 배포 > 새 배포 > 유형: 웹 앱
 *      실행 사용자: 나 / 액세스 권한: (학교 도메인) 내 모든 사용자
 *    ※ 같은 학교 도메인 + "실행: 나" 여야 학생 이메일을 알 수 있다.
 * 4) 처음 배포할 때 메일·캘린더·시트 권한 승인
 * 5) 코드를 고친 뒤에는 배포 > 배포 관리 > 연필 > 버전: 새 버전 > 배포 (URL 그대로)
 */
const SHEET = '슬롯';
const SLOT_MIN = 30;           // 상담 1회 길이(분)
const MAX_ACTIVE = 1;          // 학생 1명이 동시에 가질 수 있는 예약 수
const MEMO_MAX = 200;
const TOPICS = ['진로 고민', '고등학교 진학', '진로검사 결과', '학과·직업 정보', '기타'];
const ST = { OPEN: '빈자리', TAKEN: '예약됨', CLOSED: '닫힘' };

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('진로상담 예약')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ── 공용 ── */
function me_() {
  const e = Session.getActiveUser().getEmail();
  if (!e) throw new Error('학교 계정으로 로그인한 뒤 다시 열어 주세요.');
  return e.toLowerCase();
}
function tz_() { return Session.getScriptTimeZone(); }
function fmt_(d, p) { return Utilities.formatDate(d, tz_(), p); }
// 시트에 쓰는 사용자 글자: =,+,-,@ 로 시작하면 수식이 되지 않게 ' 를 붙인다
function safe_(s) { s = String(s); return /^[=+\-@]/.test(s) ? "'" + s : s; }

// 날짜·시간 칸을 "2026-11-04", "15:40" 으로 맞춘다 (날짜 서식으로 바뀌어도 읽히게)
function norm_(d, t) {
  const m = String(d).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  const n = String(t).match(/(\d{1,2}):(\d{2})/);
  if (!m || !n) return null;
  let h = +n[1];
  if (/오후|PM/i.test(t) && h < 12) h += 12;
  if (/오전|AM/i.test(t) && h === 12) h = 0;
  const p = x => ('0' + x).slice(-2);
  const date = m[1] + '-' + p(m[2]) + '-' + p(m[3]);
  const time = p(h) + ':' + n[2];
  return { date: date, time: time, id: date + ' ' + time };
}

function read_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET);
  if (!sh) throw new Error('"' + SHEET + '" 시트를 찾지 못했어요. 선생님께 알려 주세요.');
  const n = sh.getLastRow() - 1;
  if (n < 1) return { sh: sh, rows: [] };
  const disp = sh.getRange(2, 1, n, 2).getDisplayValues();
  const vals = sh.getRange(2, 3, n, 4).getValues();
  const rows = [];
  disp.forEach((r, i) => {
    const k = norm_(r[0], r[1]);
    if (!k) return;
    rows.push({ row: i + 2, id: k.id, date: k.date, time: k.time,
      state: String(vals[i][0]).trim() || ST.OPEN,
      email: String(vals[i][1]).trim().toLowerCase(),
      topic: String(vals[i][2]), eventId: String(vals[i][3]) });
  });
  return { sh: sh, rows: rows };
}

/* ── 학생 화면이 부르는 함수 (index.html 과 이름 1:1) ── */

// 한 주 슬롯. 다른 학생 이메일·주제는 절대 내보내지 않고 상태만 보낸다.
function getWeek(offset) {
  offset = Math.max(0, Math.min(3, parseInt(offset, 10) || 0));
  const email = me_();
  const now = new Date();
  const nowStr = fmt_(now, 'yyyy-MM-dd HH:mm');
  const dow = +fmt_(now, 'u');                            // 1=월 … 7=일
  const mon = now.getTime() - (dow - 1) * 864e5 + offset * 7 * 864e5;
  const days = [0, 1, 2, 3, 4].map(i => fmt_(new Date(mon + i * 864e5), 'yyyy-MM-dd'));
  const data = read_().rows;
  const slots = {}, times = {};
  data.forEach(r => {
    const mine = r.state === ST.TAKEN && r.email === email;
    if (days.indexOf(r.date) >= 0) {
      times[r.time] = 1;
      slots[r.id] = mine ? 'mine' : r.id <= nowStr ? 'past'
        : r.state === ST.OPEN ? 'open' : r.state === ST.TAKEN ? 'taken' : 'closed';
    }
  });
  const mineList = data.filter(r => r.state === ST.TAKEN && r.email === email && r.id > nowStr)
    .map(r => ({ id: r.id, date: r.date, time: r.time, topic: r.topic }));
  return { me: email, offset: offset, today: nowStr.slice(0, 10), days: days,
    times: Object.keys(times).sort(), slots: slots, mine: mineList,
    topics: TOPICS, slotMin: SLOT_MIN, memoMax: MEMO_MAX };
}

function book(id, topic, memo, offset) {
  const email = me_();
  id = String(id || '');
  topic = String(topic || '');
  memo = String(memo || '').trim();
  if (TOPICS.indexOf(topic) < 0) throw new Error('상담 주제를 하나 골라 주세요.');
  if (memo.length > MEMO_MAX) throw new Error('메모는 ' + MEMO_MAX + '자까지 쓸 수 있어요.');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('예약이 몰리고 있어요. 잠시 후 다시 눌러 주세요.');
  let slot, sh;
  try {
    const d = read_(); sh = d.sh;
    slot = d.rows.filter(r => r.id === id)[0];
    // 잠금 안에서 남은 자리를 다시 확인한다 — 동시에 눌러도 한 명만 통과
    if (!slot) throw new Error('그 시간이 목록에서 사라졌어요. 새로고침해 주세요.');
    if (slot.id <= fmt_(new Date(), 'yyyy-MM-dd HH:mm')) throw new Error('이미 지난 시간이에요. 다른 시간을 골라 주세요.');
    if (slot.state !== ST.OPEN) throw new Error('방금 다른 학생이 이 시간을 예약했어요. 다른 시간을 골라 주세요.');
    const active = d.rows.filter(r => r.state === ST.TAKEN && r.email === email && r.id > fmt_(new Date(), 'yyyy-MM-dd HH:mm')).length;
    if (active >= MAX_ACTIVE) throw new Error('이미 예약이 있어요. 내 예약을 취소한 뒤 다시 골라 주세요.');
    sh.getRange(slot.row, 3, 1, 3).setValues([[ST.TAKEN, email, safe_(topic + (memo ? ' · ' + memo : ''))]]);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  // 메일·캘린더는 잠금 밖에서 (실패해도 예약 자체는 유지)
  const p = slot.date.split('-').map(Number), q = slot.time.split(':').map(Number);
  const start = new Date(p[0], p[1] - 1, p[2], q[0], q[1]);
  const end = new Date(start.getTime() + SLOT_MIN * 60000);
  try {
    const ev = CalendarApp.getDefaultCalendar().createEvent('진로상담 · ' + topic, start, end,
      { description: '예약자: ' + email + (memo ? '\n메모: ' + memo : '') });
    sh.getRange(slot.row, 6).setValue(ev.getId());
  } catch (e) { console.warn('캘린더 등록 실패: ' + e); }
  try {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
      '[진로상담 예약] ' + slot.date + ' ' + slot.time + ' · ' + topic,
      '새 상담 예약이 들어왔어요.\n\n시간: ' + slot.date + ' ' + slot.time + ' (' + SLOT_MIN + '분)\n예약자: ' + email +
      '\n주제: ' + topic + (memo ? '\n메모: ' + memo : '') + '\n\n시트: ' + SpreadsheetApp.getActive().getUrl());
  } catch (e) { console.warn('알림 메일 실패(예약은 됨): ' + e); }
  return getWeek(offset);
}

function cancel(id, offset) {
  const email = me_();
  id = String(id || '');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('잠시 후 다시 눌러 주세요.');
  let slot;
  try {
    const d = read_();
    slot = d.rows.filter(r => r.id === id)[0];
    if (!slot || slot.state !== ST.TAKEN || slot.email !== email) throw new Error('내 예약을 찾지 못했어요. 새로고침해 주세요.');
    if (slot.id <= fmt_(new Date(), 'yyyy-MM-dd HH:mm')) throw new Error('이미 지난 상담은 취소할 수 없어요.');
    d.sh.getRange(slot.row, 3, 1, 4).setValues([[ST.OPEN, '', '', '']]);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  try {
    const ev = slot.eventId && CalendarApp.getDefaultCalendar().getEventById(slot.eventId);
    if (ev) ev.deleteEvent();
  } catch (e) { console.warn('캘린더 삭제 실패: ' + e); }
  try {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
      '[진로상담 취소] ' + slot.date + ' ' + slot.time,
      email + ' 학생이 예약을 취소했어요. 이 시간은 다시 "빈자리"가 됐어요.');
  } catch (e) { console.warn('취소 메일 실패(취소는 됨): ' + e); }
  return getWeek(offset);
}
