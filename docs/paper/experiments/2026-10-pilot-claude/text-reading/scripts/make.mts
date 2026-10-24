import { PDFDocument, rgb } from "/Users/minchanpark/Documents/orca/workspaces/ClassPin-FE/feature-dev-ai/node_modules/pdf-lib/cjs/index.js";
import fontkit from "/Users/minchanpark/Documents/orca/workspaces/ClassPin-FE/feature-dev-ai/node_modules/@pdf-lib/fontkit/dist/fontkit.umd.js";
import { readFileSync, writeFileSync } from "node:fs";
let seed = 42; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const num = () => { const n = Math.floor(rnd() * 9000) + 1000; return n.toLocaleString("en-US"); };
const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
const font = await pdf.embedFont(readFileSync("/Users/minchanpark/Documents/orca/workspaces/ClassPin-FE/feature-dev-ai/public/assets/insights/NanumGothic-Regular.ttf"), { subset: false });
const qs: { id: string; page: number; q: string; a: string; size: number }[] = [];
const text = (p: any, s: string, x: number, y: number, size: number, color = rgb(0.1, 0.1, 0.1)) => p.drawText(s, { x, y: 540 - y, size, font, color });
// 1. dense table, 7pt
{ const p = pdf.addPage([960, 540]); text(p, "지역별 강좌 수강 현황 (단위: 명)", 40, 50, 20);
  const regions = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남"];
  const cols = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];
  cols.forEach((c, j) => text(p, c, 110 + j * 68, 90, 7));
  regions.forEach((r, i) => { text(p, r, 40, 110 + i * 28, 7); cols.forEach((c, j) => { const v = num(); text(p, v, 110 + j * 68, 110 + i * 28, 7);
    if (rnd() < 0.08) qs.push({ id: `T${qs.length + 1}`, page: 1, q: `표에서 ${r} 행, ${c} 열의 값`, a: v, size: 7 }); }); }); }
// 2. bar chart with 6pt value labels and similar values
{ const p = pdf.addPage([960, 540]); text(p, "학과별 중도 탈락률 추이", 40, 50, 20);
  const depts = ["경영학과", "경제학과", "컴퓨터공학과", "전자공학과", "기계공학과", "화학공학과", "국어국문학과", "영어영문학과", "심리학과", "사회학과", "수학과", "물리학과"];
  depts.forEach((d, i) => { const v = (rnd() * 9 + 1).toFixed(2) + "%", h = parseFloat(v) * 30, x = 60 + i * 72;
    p.drawRectangle({ x, y: 80, width: 34, height: h, color: rgb(0.2, 0.4, 0.9) }); text(p, v, x - 2, 540 - 80 - h - 10, 6); text(p, d, x - 6, 475, 6);
    if (i % 2 === 0) qs.push({ id: `C${qs.length + 1}`, page: 2, q: `막대 차트에서 ${d} 막대 위에 적힌 값`, a: v, size: 6 }); });
  text(p, "* 2024학년도 2학기 기준, 휴학생 제외", 40, 515, 6); qs.push({ id: `C${qs.length + 1}`, page: 2, q: "차트 하단 각주 문장 전체", a: "* 2024학년도 2학기 기준, 휴학생 제외", size: 6 }); }
// 3. footnotes and codes, 5.5-7pt
{ const p = pdf.addPage([960, 540]); text(p, "만족도 조사 결과 요약", 40, 50, 20); text(p, "전반적 만족도는 상승했으나 실습 환경 응답은 하락", 40, 110, 16);
  const notes = [["출처 1", `한국교육개발원 조사(2024.11.07), n=${num()}, 신뢰수준 95% ±2.${Math.floor(rnd() * 9)}%p`, 6],
    ["출처 2", `내부 LMS 로그 기준 집계 ID KEDI-${Math.floor(rnd() * 90000 + 10000)}-B`, 5.5], ["출처 3", `문항 Q${Math.floor(rnd() * 40 + 10)}·Q${Math.floor(rnd() * 40 + 50)} 결측 ${Math.floor(rnd() * 90 + 10)}건 제외`, 6],
    ["출처 4", `가중치: 학년 0.${Math.floor(rnd() * 90 + 10)}, 성별 0.${Math.floor(rnd() * 90 + 10)}, 계열 0.${Math.floor(rnd() * 90 + 10)}`, 5.5], ["문의", `insight-team${Math.floor(rnd() * 90 + 10)}@kedi.example.kr`, 6]];
  notes.forEach(([k, v, s], i) => { text(p, `${k}: ${v}`, 40, 440 + i * 14, s as number, rgb(0.45, 0.45, 0.45)); qs.push({ id: `F${qs.length + 1}`, page: 3, q: `하단 '${k}:' 뒤에 적힌 내용 전체`, a: v as string, size: s as number }); }); }
// 4. similar-looking Korean labels, 7pt, two-column dense list
{ const p = pdf.addPage([960, 540]); text(p, "지표 정의", 40, 50, 20);
  const pairs = ["수강신청률", "수강취소율", "수강정정률", "출석인정률", "출석미달률", "과제제출률", "과제지연률", "시험응시률", "재수강비율", "이수완료율", "학점포기율", "조기졸업률"];
  pairs.forEach((k, i) => { const v = (rnd() * 99).toFixed(1) + "%", d = `${Math.floor(rnd() * 900 + 100)}명 중 ${Math.floor(rnd() * 90 + 10)}명`, col = i % 2, row = Math.floor(i / 2);
    text(p, `${k}  ${v}  (${d})`, 60 + col * 440, 120 + row * 40, 7); if (i % 3 !== 2) qs.push({ id: `K${qs.length + 1}`, page: 4, q: `'${k}' 옆 괄호 안의 내용`, a: d, size: 7 }); }); }
writeFileSync("synth.pdf", await pdf.save()); writeFileSync("synth-q.json", JSON.stringify(qs, null, 1));
console.log(qs.length, qs.reduce((m: any, q) => (m[q.page] = (m[q.page] ?? 0) + 1, m), {}));
