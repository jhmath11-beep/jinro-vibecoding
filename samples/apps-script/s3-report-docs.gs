/**
 * [상] 심리검사 종합 결과 → 학생별 해석 리포트(구글 문서·PDF) 일괄 생성
 * 준비 1) 시트 '결과' 열 제목: 학번 | 이름 | 흥미코드 | 적성 강점 | 가치관 1순위 | 가치관 2순위 | 희망 직업 | 리포트
 *        예) 흥미코드: 탐구형·예술형 / 적성 강점: 수리·논리력, 공간지각력
 *        값은 커리어넷 직업흥미·직업적성·직업가치관 검사 결과지에서 옮겨 적는다(검사 문항은 옮기지 않는다)
 * 준비 2) 구글 문서 템플릿에 {{이름}} {{흥미코드}} {{흥미해석}} {{적성}} {{가치관}} {{희망직업}} {{연결질문}} 넣기
 * 준비 3) 아래 TEMPLATE_ID(문서 주소의 /d/ 와 /edit 사이), FOLDER_ID(저장할 드라이브 폴더 주소 끝부분) 채우기
 * 실행: 시트 새로고침 → 메뉴 [리포트 > 전체 만들기]  (이미 리포트 링크가 있는 행은 건너뜀)
 */
const TEMPLATE_ID = '템플릿_문서_ID';
const FOLDER_ID = '저장_폴더_ID';
const MEANING = {
  현실형: '손과 몸을 써서 눈에 보이는 결과를 만드는 일에서 힘을 얻는 편',
  탐구형: '원리를 파고들고 분석하는 과정 자체를 즐기는 편',
  예술형: '자기만의 방식으로 생각과 느낌을 표현할 때 빛나는 편',
  사회형: '사람을 돕고 함께 성장하는 데서 보람을 느끼는 편',
  진취형: '목표를 세우고 사람들을 이끌며 일을 추진하는 편',
  관습형: '체계적으로 정리하고 정확하게 처리하는 데 강점이 있는 편',
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('리포트').addItem('전체 만들기', 'makeReports').addToUi();
}

function makeReports() {
  const sh = SpreadsheetApp.getActive().getSheetByName('결과');
  if (!sh) throw new Error("'결과' 시트를 먼저 만들어 주세요.");
  const [head, ...rows] = sh.getDataRange().getValues();
  const c = Object.fromEntries(head.map((h, i) => [h, i]));
  const need = ['학번', '이름', '흥미코드', '적성 강점', '가치관 1순위', '가치관 2순위', '희망 직업', '리포트'].filter(h => !(h in c));
  if (need.length) throw new Error('결과 시트에 이 열 제목이 없어요: ' + need.join(', '));
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const template = DriveApp.getFileById(TEMPLATE_ID);
  const started = Date.now();
  let made = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r[c['이름']] || r[c['리포트']]) continue;
    if (Date.now() - started > 5 * 60 * 1000) break; // ponytail: 실행 6분 제한 대비, 남은 행은 다시 실행하면 이어서 만든다

    const types = String(r[c['흥미코드']]).split(/[·,\s]+/).filter(Boolean);
    const copy = template.makeCopy(`${r[c['학번']]}_${r[c['이름']]}_진로리포트`, folder);
    const doc = DocumentApp.openById(copy.getId());
    const body = doc.getBody();
    const fill = {
      '이름': r[c['이름']],
      '흥미코드': types.join(' · '),
      '흥미해석': types.map(t => `${t}: ${MEANING[t] || '결과지 설명을 함께 읽어 보세요'}`).join('\n'),
      '적성': r[c['적성 강점']],
      '가치관': [r[c['가치관 1순위']], r[c['가치관 2순위']]].filter(Boolean).join(', '),
      '희망직업': r[c['희망 직업']] || '아직 정하지 않음',
      '연결질문': `'${r[c['희망 직업']] || '관심 직업'}'은(는) 내가 중요하게 여기는 '${r[c['가치관 1순위']]}'을(를) 어떻게 채워 줄까?`,
    };
    Object.entries(fill).forEach(([k, v]) => body.replaceText(`\\{\\{${k}\\}\\}`, String(v)));
    doc.saveAndClose();

    const pdf = folder.createFile(copy.getAs(MimeType.PDF));
    sh.getRange(i + 2, c['리포트'] + 1).setValue(pdf.getUrl());
    made++;
  }
  SpreadsheetApp.getUi().alert(`${made}개 리포트를 만들었어요.`);
}
