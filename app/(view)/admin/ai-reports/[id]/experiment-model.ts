import type { AiReportDetailDto } from "@/app/_model/ai-report";

export type ExperimentRun = {id:string;ocr:string;layout:string;llm:string;pipelineMs:number;outputGatePassCount:number;layoutRegionCounts?:Record<string,number>;records:Array<{alias:string;page:number;question:string;displayable:boolean;issues:string[];output:Record<string,string>}>};
export const experimentOptions = [
  ["saved", "기존 강사 리포트"],
  ["base", "기본 분석 · Tesseract + Qwen3 4B"],
  ["ocr-easy", "글자 인식 비교 · EasyOCR"],
  ["ocr-paddle", "글자 인식 비교 · 한국어 PP-OCRv5"],
  ["llm-small", "문맥 분석 비교 · Qwen3 1.7B"],
  ["llm-granite", "문맥 분석 비교 · Granite 3.3 2B"],
] as const;
export const experimentModels:Record<string,string>={tesseract:"Tesseract",easyocr:"EasyOCR",paddleocr:"한국어 PP-OCRv5",ppv3:"PP-DocLayoutV3",pps:"PP-DocLayout-S",florence:"Florence-2",qwen4:"Qwen3 4B",qwen17:"Qwen3 1.7B",granite2:"Granite 3.3 2B"};

/** Adapt saved experimental outputs to the existing report presentation; never persist. */
export function experimentReport(saved:AiReportDetailDto,run:ExperimentRun):AiReportDetailDto {
  const source=saved.canonical_result as Record<string,unknown>|null;
  const accepted=run.records.filter(r=>r.displayable);
  const section=(id:string,title:string,body:string,refs:string[]=[])=>({id,title,body,evidenceLevel:"limited",evidenceRefs:refs});
  const refs=(r:ExperimentRun["records"][number])=>{const matches=saved.category_pins?.filter(p=>p.page===r.page&&p.text===r.question)??[];return matches.length===1?[matches[0].evidenceRef]:[];};
  const summary=[section("experiment-summary","선택한 AI 조합의 분석 결과",`${run.records.length}개 PIN 중 ${accepted.length}개가 형식·인용 검사를 통과했습니다. 의미 정확도 검증은 별도이며, 아래 내용은 모델이 생성한 미검증 초안입니다.`),section("experiment-excluded","검토가 필요한 출력",`${run.records.length-accepted.length}개 출력은 검사에 실패해 개선안 본문에서 제외했습니다. 질문 유형 원그래프와 페이지별 질문 수는 동일한 원본 질문 데이터 기준입니다.`)];
  const confusion=accepted.map(r=>section(`analysis-${r.alias}`,`${r.page}페이지 · ${r.question}`,`AI 해석(검토 필요): ${r.output.analysis||"해석 없음"}`,refs(r)));
  if (run.layoutRegionCounts) summary.unshift(...accepted.slice(0,3).map(r=>section(`excerpt-${r.alias}`,`${r.page}페이지 · ${r.output.target||r.question}`,`개별 분석 발췌 · ${r.output.analysis||"해석 없음"}`,refs(r))));
  const priorities=accepted.filter(r=>r.output.action).map(r=>section(`action-${r.alias}`,`${r.page}페이지 · ${r.output.target||r.question}`,`AI 제안(우선순위 미평가): ${r.output.action}`,refs(r)));
  const canonical={overallEvidenceLevel:"limited",executiveSummary:summary,confusionPoints:confusion,improvementPriorities:priorities,
    unansweredQuestions:[section("answer-status","답변 상태는 이번 실험에서 재확인하지 않았습니다","현재 미답변 여부는 기존 강사 리포트 또는 질문 목록에서 확인하세요.")],
    materials:Array.isArray(source?.materials)?source.materials.map((m:Record<string,unknown>)=>({...m,slides:Array.isArray(m.slides)?m.slides.map((s:Record<string,unknown>,i:number)=>{const p=Number(s.slideNumber??i+1);const records=accepted.filter(r=>r.page===p);return {...s,regionCount:run.layoutRegionCounts?.[String(p)]??s.regionCount,summary:records.length?records.map(r=>`[실험 초안] ${r.output.analysis}`).join("\n"):"이 페이지에서 자동 검사를 통과한 PIN 분석이 없습니다."};}):[]})):[],
    narrative:{title:"AI 강사 리포트 · 모델 비교 초안",paragraphs:[...summary.map(s=>s.body),...accepted.map(r=>`${r.page}페이지 — ${r.question}\nAI 해석: ${r.output.analysis||"없음"}\n개선 제안(검토 필요): ${r.output.action||"없음"}`)]}};
  return {...saved,canonical_result:canonical,revisions:[],current_revision_id:null,confirmed_revision_id:null,product_status:"ready",status:"ready"};
}
