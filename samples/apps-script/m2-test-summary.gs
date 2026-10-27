/**
 * [중] 커리어넷 검사 결과 학급 집계 + 개인 한 줄 피드백
 * 준비: 구글 폼(학번, 이름, 흥미 1순위, 흥미 2순위, 가치관 1순위)
 *       흥미 문항은 객관식: 현실형/탐구형/예술형/사회형/진취형/관습형
 *       가치관 문항은 커리어넷 직업가치관검사 결과지의 1순위 가치를 그대로 적게 한다
 * 설치: 응답 시트에서 [확장 프로그램 > Apps Script] 붙여넣기 → 저장 → 시트 새로고침 → 메뉴 [진로 분석 > 집계 만들기]
 */
const TYPES = ['현실형', '탐구형', '예술형', '사회형', '진취형', '관습형'];
const TIP = {
  현실형: '직접 만들고 고치는 체험 활동(메이커, 기술 동아리)을 찾아보자.',
  탐구형: '궁금한 주제 하나를 골라 작은 탐구 보고서를 써 보자.',
  예술형: '내 작품을 모아 포트폴리오를 시작해 보자.',
  사회형: '봉사·또래 멘토링처럼 사람을 돕는 활동을 해 보자.',
  진취형: '학급·동아리 행사 기획을 맡아 리더 경험을 쌓아 보자.',
  관습형: '기록·정리 능력을 살려 학급 일지나 자료 관리 역할을 맡아 보자.',
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('진로 분석').addItem('집계 만들기', 'buildSummary').addToUi();
}

function buildSummary() {
  const ss = SpreadsheetApp.getActive();
  // 응답 시트 = 첫 줄에 '흥미 1순위' 제목이 있는 시트
  const src = ss.getSheets().find(s => s.getLastColumn() && s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].includes('흥미 1순위'));
  if (!src) throw new Error("'흥미 1순위' 열이 있는 응답 시트를 찾지 못했어요.");
  const [head, ...rows] = src.getDataRange().getValues();
  const col = name => head.indexOf(name);
  const i1 = col('흥미 1순위'), i2 = col('흥미 2순위'), iv = col('가치관 1순위'), iname = col('이름'), iid = col('학번');
  if ([i1, i2, iv, iname, iid].includes(-1)) throw new Error('폼 문항 제목이 학번/이름/흥미 1순위/흥미 2순위/가치관 1순위 인지 확인하세요.');

  // 1) 개인별 피드백 시트
  const out = ss.getSheetByName('개인 피드백') || ss.insertSheet('개인 피드백');
  out.clear();
  const personal = rows.filter(r => r[iname]).map(r => [r[iid], r[iname], r[i1] + '·' + r[i2], r[iv],
    `${r[iname]} 학생은 ${r[i1]}과 ${r[i2]} 흥미가 높고 '${r[iv]}'을(를) 중요하게 여겨요. ${TIP[r[i1]] || ''}`]);
  out.getRange(1, 1, 1, 5).setValues([['학번', '이름', '흥미 코드', '가치관 1순위', '한 줄 피드백']]).setFontWeight('bold');
  if (personal.length) out.getRange(2, 1, personal.length, 5).setValues(personal);
  out.autoResizeColumns(1, 4);

  // 2) 학급 분포 시트 + 막대 차트
  const sum = ss.getSheetByName('학급 분포') || ss.insertSheet('학급 분포');
  sum.clear();
  sum.getCharts().forEach(c => sum.removeChart(c));
  const table = TYPES.map(t => [t, rows.filter(r => r[i1] === t).length, rows.filter(r => r[i2] === t).length]);
  sum.getRange(1, 1, 1, 3).setValues([['흥미 유형', '1순위 인원', '2순위 인원']]).setFontWeight('bold');
  sum.getRange(2, 1, table.length, 3).setValues(table);
  sum.insertChart(sum.newChart().asColumnChart()
    .addRange(sum.getRange(1, 1, table.length + 1, 3))
    .setOption('title', '우리 반 흥미 유형 분포').setPosition(1, 5, 0, 0).build());

  // 3) 가치관 빈도
  const counts = {};
  rows.forEach(r => r[iv] && (counts[r[iv]] = (counts[r[iv]] || 0) + 1));
  const vals = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  sum.getRange(10, 1, 1, 2).setValues([['가치관 1순위', '인원']]).setFontWeight('bold');
  if (vals.length) sum.getRange(11, 1, vals.length, 2).setValues(vals);
  SpreadsheetApp.getUi().alert(`${personal.length}명 집계를 마쳤어요.`);
}
