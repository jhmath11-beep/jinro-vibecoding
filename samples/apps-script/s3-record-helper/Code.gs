/**
 * [상·업무] 생기부 진로활동 초안 도우미 — 학교생활기록부 창의적 체험활동(진로활동) 특기사항 작성 업무
 * 교사가 1년 동안 쌓은 관찰 기록을 학생별로 모아 보고, 규칙으로 문장 초안을 조립한 뒤
 * 글자수·바이트·금지어(예시)를 실시간으로 확인한다. AI 다듬기는 선택이며 기본은 꺼져 있다.
 * 이 도구는 "초안"만 만든다. 학교 기재요령 확인과 교사 최종 검토 후 NEIS에 직접 입력한다.
 * 수준: 시작 프롬프트 + 다듬기 3회
 *
 * ── 시트 구조 ─────────────────────────────────────────────
 * "관찰기록" (교사가 누적, 1행 제목)
 *     A 날짜 | B 학번 | C 이름 | D 활동 | E 관찰 내용
 *     - 관찰 내용은 "~함.", "~임." 처럼 끝내면 문장 조립이 자연스럽다.
 * "초안" (자동, 학번당 한 줄로 덮어씀)
 *     A 학번 | B 이름 | C 초안 | D 글자수 | E 바이트 | F 저장 시각
 *
 * ── 설치·배포 ─────────────────────────────────────────────
 * 1) 스프레드시트 > 확장 프로그램 > Apps Script > 이 파일을 Code.gs 에 붙여넣기
 * 2) [+] > HTML > 파일 이름은 index > index.html 붙여넣기
 * 3) 편집기에서 selfTest 실행 → "자체검사 통과" 확인 (node: node -e "console.log(require('./Code.gs').selfTest())")
 * 4) 배포 > 새 배포 > 웹 앱 > 실행 사용자: 나 / 액세스 권한: 나만   (학생 기록이 보이므로 반드시 "나만")
 * 5) 코드를 고친 뒤에는 배포 > 배포 관리 > 연필 > 버전: 새 버전 > 배포
 *
 * ── (선택) AI 다듬기 켜기 ── 교육청·학교의 생성형 AI 활용 지침을 먼저 확인하세요.
 * 프로젝트 설정(톱니) > 스크립트 속성 에 아래 3개를 추가 (키는 코드·시트에 적지 않는다)
 *     AI_ENABLED     true
 *     GEMINI_API_KEY (Google AI Studio 에서 받은 키)
 *     GEMINI_MODEL   (AI Studio 에서 확인한 모델 이름)
 * AI 로는 이름·학번·반·번호를 코드로 지운 초안만 보낸다. 관찰 기록 원문은 보내지 않는다.
 */
const REC_SHEET = '관찰기록';
const DRAFT_SHEET = '초안';
// 글자수·바이트 기준: 학교 기재요령(해당 연도)을 확인해 바꾸세요
const CONFIG = { limitChars: 700, limitBytes: 2100, hangulBytes: 3, otherBytes: 1, newlineBytes: 2 };
// 금지·주의 표현 "예시 목록" — 실제 기준은 해당 연도 학교생활기록부 기재요령을 따르세요
const BANNED_EXAMPLES = ['토익', '토플', 'TOEIC', 'TOEFL', '교외', '논문', '특허', '출간', '어학연수', '부모님 직업'];

/* ═══ 순수 함수 (node 로도 실행됨) ═══ */

// 바이트: 한글 등 비ASCII = hangulBytes, 영문·숫자·공백·문장부호 = otherBytes, 줄바꿈 = newlineBytes (\r 은 무시)
function countBytes(text, cfg) {
  cfg = cfg || CONFIG;
  let b = 0;
  for (const ch of String(text)) {
    if (ch === '\r') continue;
    b += ch === '\n' ? cfg.newlineBytes : ch.charCodeAt(0) > 127 ? cfg.hangulBytes : cfg.otherBytes;
  }
  return b;
}

// AI 로 보내기 전 개인정보 지우기: 이름(성 포함·이름만) → "학생", 학번·학년·반·번호 숫자 삭제
function anonymize(text, name, id) {
  let t = String(text);
  name = String(name || '').trim();
  if (name) {
    t = t.split(name).join('학생');
    if (name.length >= 3) t = t.split(name.slice(1)).join('학생');      // 성 뺀 이름
  }
  if (id) t = t.split(String(id)).join('');
  return t.replace(/\d+\s*학년\s*\d+\s*반(\s*\d+\s*번)?/g, '')
    .replace(/\d+\s*반\s*\d+\s*번/g, '').replace(/\d+\s*반(?![가-힣])/g, '').replace(/\d+\s*번(?=\s*(이|가|은|는|의|을|를|학생|\)|,|$))/g, '') // 번호만 쓴 호칭(7번이)은 지우고, 횟수(3번 발표)는 남김
    .replace(/\b\d{4,6}\b(?!\s*(년|월|일|회|명|개|시|분|번째))/g, '')                                        // 학번처럼 보이는 숫자
    .replace(/[ \t]{2,}/g, ' ').trim();
}

function selfTest() {
  const ok = (c, m) => { if (!c) throw new Error('자체검사 실패: ' + m); };
  ok(countBytes('') === 0, '빈 글');
  ok(countBytes('가a 1.') === 3 + 1 + 1 + 1 + 1, '한글3 영문·숫자·공백·마침표 1');
  ok(countBytes('가\r\n나') === 3 + 2 + 3, '줄바꿈 2 (\\r 무시)');
  const a = anonymize('2학년 3반 7번 김하윤(20307)은 하윤이라 불림', '김하윤', '20307');
  ok(anonymize('7번이 발표함', '', '') === '이 발표함', '번호만 있는 경우');
  ok(anonymize('2035년 미래 직업을 3번 발표함', '', '') === '2035년 미래 직업을 3번 발표함', '연도·횟수는 남김');
  ok(a.indexOf('김하윤') < 0 && a.indexOf('하윤') < 0 && a.indexOf('20307') < 0 && a.indexOf('3반') < 0, '개인정보 지우기: ' + a);
  return '자체검사 통과';
}

if (typeof module !== 'undefined') module.exports = { countBytes: countBytes, anonymize: anonymize, selfTest: selfTest };

/* ═══ 웹앱 ═══ */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('진로활동 초안 도우미')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function safe_(s) { s = String(s); return /^[=+\-@]/.test(s) ? "'" + s : s; }
function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }

function readStudents_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(REC_SHEET);
  if (!sh) throw new Error('"' + REC_SHEET + '" 시트가 없어요. 날짜·학번·이름·활동·관찰 내용 열로 만들어 주세요.');
  const n = sh.getLastRow() - 1;
  const rows = n > 0 ? sh.getRange(2, 1, n, 5).getDisplayValues() : [];
  const by = {};
  rows.forEach(r => {
    const id = String(r[1]).replace(/\D/g, '');
    if (!id || !String(r[4]).trim()) return;
    by[id] = by[id] || { id: id, name: String(r[2]).trim(), records: [] };
    by[id].records.push({ date: String(r[0]).trim(), activity: String(r[3]).trim(), note: String(r[4]).trim() });
  });
  return by;
}

/* ── index.html 이 부르는 함수 (이름 1:1) ── */

function getInit() {
  const by = readStudents_();
  const dsh = SpreadsheetApp.getActive().getSheetByName(DRAFT_SHEET);
  const drafts = {};
  if (dsh && dsh.getLastRow() > 1) dsh.getRange(2, 1, dsh.getLastRow() - 1, 6).getDisplayValues()
    .forEach(r => { drafts[String(r[0]).replace(/\D/g, '')] = { text: r[2], saved: r[5] }; });
  const students = Object.keys(by).sort().map(id => {
    const s = by[id];
    s.records.sort((a, b) => a.date < b.date ? -1 : 1);
    s.draft = drafts[id] || null;
    return s;
  });
  return { config: CONFIG, banned: BANNED_EXAMPLES, aiEnabled: prop_('AI_ENABLED') === 'true', students: students };
}

function saveDraft(id, text) {
  id = String(id || '').replace(/\D/g, '');
  text = String(text || '');
  const s = readStudents_()[id];
  if (!s) throw new Error('그 학번의 관찰 기록이 없어요.');
  if (text.length > 5000) throw new Error('초안이 너무 길어요. 5000자 안으로 줄여 주세요.');
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(DRAFT_SHEET);
  if (!sh) { sh = ss.insertSheet(DRAFT_SHEET); sh.appendRow(['학번', '이름', '초안', '글자수', '바이트', '저장 시각']); sh.setFrozenRows(1); }
  const time = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  const row = [safe_(id), safe_(s.name), safe_(text), text.replace(/\r/g, '').length, countBytes(text), time];
  const ids = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues().map(r => String(r[0]).replace(/\D/g, '')) : [];
  const at = ids.indexOf(id);
  if (at >= 0) sh.getRange(at + 2, 1, 1, 6).setValues([row]); else sh.appendRow(row);
  return { saved: time };
}

// AI 다듬기 (선택). 서버에서 다시 개인정보를 지운 뒤 보낸다.
function polish(id, text) {
  if (prop_('AI_ENABLED') !== 'true') throw new Error('AI 다듬기가 꺼져 있어요. 스크립트 속성 AI_ENABLED 를 확인해 주세요.');
  const key = prop_('GEMINI_API_KEY'), model = prop_('GEMINI_MODEL');
  if (!key || !model) throw new Error('스크립트 속성에 GEMINI_API_KEY 와 GEMINI_MODEL 을 넣어 주세요.');
  id = String(id || '').replace(/\D/g, '');
  const s = readStudents_()[id];
  if (!s) throw new Error('그 학번의 관찰 기록이 없어요.');
  text = String(text || '');
  if (!text.trim() || text.length > 3000) throw new Error('다듬을 초안이 비어 있거나 너무 길어요.');
  const sent = anonymize(text, s.name, id);
  const prompt = [
    '너는 중학교 교사의 학교생활기록부 문장 다듬기를 돕는다.',
    '아래는 창의적 체험활동 진로활동 특기사항 초안이다.',
    '규칙:',
    '- 초안에 없는 사실·활동·성과·평가를 절대 추가하지 마라. 기록에 없는 내용은 쓰지 않는다.',
    '- 문장을 매끄럽게 잇고 중복만 줄여라. 분량을 늘리지 마라.',
    '- 문장 끝은 "~함.", "~임." 같은 명사형 종결을 유지하라.',
    '- 학생 이름·학번·학교명을 만들어 넣지 마라.',
    '- 다듬은 문장만 출력하라.',
    '',
    '초안:', sent
  ].join('\n');
  const res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-goog-api-key': key },
    payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  if (res.getResponseCode() !== 200) throw new Error('AI 응답 오류(' + res.getResponseCode() + '). 키·모델 이름·사용량을 확인해 주세요.');
  const j = JSON.parse(res.getContentText());
  const out = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts
    ? j.candidates[0].content.parts.map(p => p.text || '').join('').trim() : '';
  if (!out) throw new Error('AI 가 빈 답을 보냈어요. 잠시 후 다시 해 보세요.');
  return { sent: sent, text: out };
}
