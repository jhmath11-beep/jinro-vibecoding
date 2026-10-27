/**
 * [중·수업] 진로검사 학급 대시보드 — [9진로01-02] 자신의 흥미·적성·가치관 탐색
 * 학생이 구글 폼에 커리어넷 검사 "결과값"(흥미 1·2순위, 가치관 상위 3개)만 적으면,
 * 교사 전용 웹 대시보드에서 반별 흥미 분포·가치관 순위·학생 목록을 본다.
 * 검사 문항은 다루지 않는다(결과값만). 수준: 시작 프롬프트 + 다듬기 3회
 *
 * ── 시트 구조 ─────────────────────────────────────────────
 * 구글 폼 응답 시트(기본 이름 "설문지 응답 시트1"). 1행 제목은 폼 질문 제목 그대로:
 *   타임스탬프 | 학년 | 반 | 번호 | 이름 | 흥미 1순위 | 흥미 2순위 | 가치관 상위 3개
 *   - 흥미 1·2순위: 객관식(현실형·탐구형·예술형·사회형·진취형·관습형)
 *   - 가치관 상위 3개: 체크박스(3개 선택 제한). 시트에는 "자율성, 보수, 창의성"처럼 쉼표로 들어온다.
 * 열 순서가 달라도 제목으로 찾는다. 같은 학년·반·번호가 여러 번 내면 마지막 응답만 센다.
 *
 * ── 설치·배포 ─────────────────────────────────────────────
 * 1) 응답 스프레드시트 > 확장 프로그램 > Apps Script > 이 파일을 Code.gs 에 붙여넣기
 * 2) [+] > HTML > 파일 이름은 index > index.html 붙여넣기
 * 3) 배포 > 새 배포 > 웹 앱 > 실행 사용자: 나 / 액세스 권한: 나만
 *    ※ 학생 이름이 보이는 화면이므로 반드시 "나만". 담임과 나눌 때는 웹앱 URL 대신 화면의 "이름 가리기"를 켜고 보여 준다.
 * 4) 코드를 고친 뒤에는 배포 > 배포 관리 > 연필 > 버전: 새 버전 > 배포
 */
const SHEET = '설문지 응답 시트1';
const TYPES = ['현실형', '탐구형', '예술형', '사회형', '진취형', '관습형'];
// 가치관 이름: 학교에서 쓰는 검사 결과지의 항목 이름과 똑같이 맞추세요 (폼 체크박스 보기와 같아야 함)
const VALUES = ['능력발휘', '자율성', '보수', '안정성', '사회적 인정', '사회봉사', '자기계발', '창의성'];
const HEAD = { grade: '학년', cls: '반', no: '번호', name: '이름', i1: '흥미 1순위', i2: '흥미 2순위', vals: '가치관 상위 3개' };

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('진로검사 학급 대시보드')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// index.html 이 부르는 유일한 함수. 시트를 읽기만 하고 쓰지 않는다.
function getDashboard() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET);
  if (!sh) throw new Error('"' + SHEET + '" 시트를 찾지 못했어요. 폼 응답 시트 이름을 Code.gs 의 SHEET 에 적어 주세요.');
  const all = sh.getDataRange().getDisplayValues();
  const head = (all.shift() || []).map(h => String(h).trim());
  const col = {}, missing = [];
  Object.keys(HEAD).forEach(k => { col[k] = head.indexOf(HEAD[k]); if (col[k] < 0) missing.push(HEAD[k]); });
  if (missing.length) throw new Error('폼 질문 제목이 달라요. 없는 열: ' + missing.join(', '));

  const num = s => parseInt(String(s).replace(/[^0-9]/g, ''), 10) || 0;
  const pick = (s, list) => { s = String(s).trim(); return list.filter(t => s.indexOf(t) === 0)[0] || ''; };
  const byStudent = {};
  all.forEach(r => {
    const g = num(r[col.grade]), c = num(r[col.cls]), n = num(r[col.no]);
    if (!g || !c || !n) return;                                  // 빈 줄·잘못된 줄은 건너뜀
    byStudent[g + '-' + c + '-' + n] = {                          // 같은 학생이면 뒤(최근) 응답이 덮어씀
      g: g, c: c, n: n, name: String(r[col.name]).trim().slice(0, 20),
      i1: pick(r[col.i1], TYPES), i2: pick(r[col.i2], TYPES),
      v: String(r[col.vals]).split(/\s*,\s*/).filter(v => VALUES.indexOf(v) >= 0).slice(0, 3)
    };
  });
  const rows = Object.keys(byStudent).map(k => byStudent[k])
    .sort((a, b) => a.g - b.g || a.c - b.c || a.n - b.n);
  return { updated: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'M월 d일 HH:mm'),
    types: TYPES, values: VALUES, rows: rows };
}
