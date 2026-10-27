/**
 * [상] 진로 활동 포트폴리오 웹앱 (학교 구글 워크스페이스 계정 전용)
 * 학생: 웹앱에 들어와 진로 활동을 기록하고 "내 기록"만 본다.
 * 교사: 시트에서 전체 기록을 보고, buildStats 를 실행해 [통계] 시트로 영역별 참여를 확인한다.
 * 설치: 새 스프레드시트 > 확장 프로그램 > Apps Script
 *       Code.gs 에 이 파일, [+ > HTML] 이름 index 로 s1-portfolio-index.html 붙여넣기
 *       배포 > 새 배포 > 웹 앱 · 실행 사용자: 나 · 액세스: (학교 도메인) 내 모든 사용자
 *       ※ 실행 사용자 '나' + 같은 도메인이어야 학생 이메일을 알 수 있다
 */
const SHEET = '기록';
const AREAS = ['자기이해', '직업체험', '진로정보 탐색', '동아리·봉사', '학습·독서', '기타'];

function doGet() {
  return HtmlService.createTemplateFromFile('index').evaluate()
    .setTitle('나의 진로 포트폴리오')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function sheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET);
  if (!sh) {
    sh = ss.insertSheet(SHEET);
    sh.appendRow(['기록 시각', '이메일', '날짜', '영역', '활동명', '배운 점', '진로와의 연결']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function me_() {
  const email = Session.getActiveUser().getEmail();
  if (!email) throw new Error('학교 계정으로 로그인해야 쓸 수 있어요.');
  return email;
}

function getInit() {
  return { email: me_(), areas: AREAS, records: myRecords_() };
}

function addRecord(r) {
  // 신뢰 경계: 브라우저에서 온 값은 서버에서 다시 검사한다
  // 앞에 ' 를 붙여 =, +, -, @ 로 시작하는 글이 수식·날짜로 바뀌지 않게 한다(수식 주입 방지)
  const clean = s => "'" + String(s || '').trim().slice(0, 500);
  if (!String(r.title || '').trim()) throw new Error('활동명을 적어 주세요.');
  if (!AREAS.includes(r.area)) throw new Error('영역을 골라 주세요.');
  sheet_().appendRow([new Date(), me_(), clean(r.date), r.area, clean(r.title), clean(r.learned), clean(r.link)]);
  return myRecords_();
}

function myRecords_() {
  const email = me_();
  const tz = Session.getScriptTimeZone();
  return sheet_().getDataRange().getValues().slice(1)
    .filter(row => row[1] === email)
    .map(row => ({
      date: row[2] instanceof Date ? Utilities.formatDate(row[2], tz, 'yyyy-MM-dd') : String(row[2]),
      area: row[3], title: row[4], learned: row[5], link: row[6],
    }))
    .reverse();
}

/** 교사용: 스크립트 편집기에서 직접 실행 → [통계] 시트 생성 */
function buildStats() {
  const rows = sheet_().getDataRange().getValues().slice(1);
  const people = [...new Set(rows.map(r => r[1]))];
  const table = people.map(p => [p, ...AREAS.map(a => rows.filter(r => r[1] === p && r[3] === a).length)]);
  const ss = SpreadsheetApp.getActive();
  const st = ss.getSheetByName('통계') || ss.insertSheet('통계');
  st.clear();
  st.getRange(1, 1, 1, AREAS.length + 1).setValues([['학생', ...AREAS]]).setFontWeight('bold');
  if (table.length) st.getRange(2, 1, table.length, AREAS.length + 1).setValues(table);
}
