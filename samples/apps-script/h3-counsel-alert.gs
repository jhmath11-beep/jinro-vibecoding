/**
 * [하] 진로상담 신청 → 담당교사 메일 알림
 * 준비: 구글 폼(문항: 학년, 반, 이름, 상담 희망 주제, 희망 날짜) → 응답을 스프레드시트에 연결
 * 설치: 연결된 시트에서 [확장 프로그램 > Apps Script]에 붙여넣기 → 저장
 *       → 왼쪽 시계(트리거) > 트리거 추가 > 함수 onCounselSubmit, 이벤트: 스프레드시트에서 · 양식 제출 시
 */
const TEACHER_EMAIL = '본인메일@학교도메인'; // 받을 주소로 바꾸기

function onCounselSubmit(e) {
  const a = e.namedValues; // { '이름': ['홍길동'], ... } 폼 문항 제목이 열쇠
  const get = k => (a[k] || [''])[0];
  const subject = `[진로상담 신청] ${get('학년')}학년 ${get('반')}반 ${get('이름')} - ${get('상담 희망 주제')}`;
  const body = [
    '진로상담 신청이 들어왔습니다.',
    `학생: ${get('학년')}학년 ${get('반')}반 ${get('이름')}`,
    `주제: ${get('상담 희망 주제')}`,
    `희망 날짜: ${get('희망 날짜')}`,
    '',
    '시트 바로가기: ' + SpreadsheetApp.getActive().getUrl(),
  ].join('\n');
  MailApp.sendEmail(TEACHER_EMAIL, subject, body);

  // 신청 행 옆에 "처리 상태" 칸을 채워 둔다
  const sheet = e.range.getSheet();
  const head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  let col = head.indexOf('처리 상태') + 1;
  if (!col) { col = head.length + 1; sheet.getRange(1, col).setValue('처리 상태'); }
  sheet.getRange(e.range.getRow(), col).setValue('접수');
}
