"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { LAB_REPORT_ID, labModels, type LabSelection } from "@/app/_model/model-lab";
import AiReportView from "../report-view";
import { useModelLab } from "./controller";
import styles from "./page.module.css";
import LabMetricsView from "./metrics-view";

const labels = { ocr:"01 · 글자 읽기 (OCR)", layout:"02 · 영역 구분 (Layout)", llm:"03 · 문맥·질문 해석 (LLM)" };
const description = { ocr:"이미지에 있는 한국어·영문·숫자를 읽습니다.", layout:"표·그림·본문의 위치를 찾습니다.", llm:"영역·페이지의 OCR 문맥과 PIN을 해석합니다." };
const modelName = (key: keyof LabSelection, id: string) => labModels[key].find(([value])=>value===id)?.[1] ?? id;
const statusName = (status: string) => ({running:"분석 중", complete:"검토 가능", failed:"실패"})[status] ?? status;

export default function ModelLabPage() {
  const { id } = useParams<{id:string}>();
  const lab = useModelLab();
  if (process.env.NODE_ENV !== "development" || id !== LAB_REPORT_ID) return <main className={styles.root}>이 페이지는 지정된 로컬 실험 자료 전용입니다.</main>;
  const running = lab.job?.status === "running";
  return <>
    <main className={styles.root}>
      <Link href={`/admin/ai-reports/${id}`}>← 기존 강사 리포트</Link>
      <header><span className={styles.eyebrow}>LOCAL MODEL LAB</span><h1>모델 조합 실험실</h1><p>각 단계의 모델을 골라, 같은 강사 리포트 형식으로 결과를 비교하세요.</p></header>
      <div className={styles.scope}><strong>뉴던 PPT · 15페이지 · 17 PIN</strong><span>고정된 실험 snapshot · 원본 리포트 변경 없음</span></div>
      <section className={styles.grid} aria-label="분석 모델 선택">
        {(Object.keys(labModels) as Array<keyof LabSelection>).map(key=><div className={styles.card} key={key}><label htmlFor={`lab-${key}`}>{labels[key]}</label><select id={`lab-${key}`} value={lab.selection[key]} disabled={lab.busy||running} onChange={event=>lab.setSelection({...lab.selection,[key]:event.target.value})}>{labModels[key].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><p>{description[key]}</p></div>)}
      </section>
      <section className={styles.card}>
        <div className={styles.actions}><button className="btn primary" disabled={lab.busy||running} onClick={()=>void lab.execute("fresh")}>새 실험 실행</button><button className="btn" disabled={lab.busy||running} onClick={()=>void lab.execute("cached")}>저장된 동일 조합 보기</button></div>
        <p>새 실험: 선택한 OCR·영역 모델의 15페이지 캐시를 재사용하고, LLM을 새로 실행합니다. CPU 4스레드 · 보통 수분 소요 · 최대 20분 · 외부 AI API 호출 없음.</p>
        <small>3 × 3 × 3 = 27개 조합. 미설치·데이터 누락 시 실패 사유를 표시합니다. S·Florence는 품질이 낮았던 후보이며 결과를 보장하지 않습니다.</small>
      </section>
      {lab.error&&<p role="alert" className={styles.warning}>{lab.error}</p>}
      {lab.job&&<LabMetricsView job={lab.job}/>}
      {lab.job&&<section className={styles.card} aria-live="polite"><h2>{statusName(lab.job.status)} · {lab.job.mode==="cached"?"기존 결과 조회":"새 LLM 실험"}</h2><p>{modelName("ocr",lab.job.ocr)} → {modelName("layout",lab.job.layout)} → {modelName("llm",lab.job.llm)}</p>{running&&<><progress max={17} value={lab.job.completed??0}/><p>PIN {lab.job.completed??0}/17 처리 · 창을 나가도 로컬 실행은 계속됩니다.</p></>}{lab.job.status==="failed"&&<p role="alert">실험이 실패했습니다 ({lab.job.error??"RUN_FAILED"}). 다른 모델로 자동 대체하지 않았습니다. 설정을 확인한 뒤 다시 실행해 주세요.</p>}{lab.job.run&&<p>검사 통과 {lab.job.run.outputGatePassCount}/17 · {lab.job.run.freshElapsedMs!==undefined?`이번 LLM 실행 ${(lab.job.run.freshElapsedMs/60000).toFixed(2)}분 · `:""}전처리 원래 시간 포함 {(lab.job.run.pipelineMs/60000).toFixed(2)}분<br/>검사 통과는 의미 정확도를 보장하지 않습니다. 아래 원그래프는 동일한 원본 질문 범주 집계입니다.</p>}</section>}
      <details className={styles.card}><summary>실험 기록 ({lab.history.length})</summary><div className={styles.history}>{lab.history.map(job=><button key={job.id} disabled={lab.busy||running} onClick={()=>void lab.open(job.id)}><strong>{modelName("ocr",job.ocr)} · {modelName("layout",job.layout)} · {modelName("llm",job.llm)}</strong><span>{statusName(job.status)} · {job.mode==="cached"?"저장 결과":"새 실험"} · {new Date(job.createdAt).toLocaleString("ko-KR")}</span></button>)}</div></details>
      {!lab.job?.run&&<div className={styles.empty}>조합을 선택해 실행하면 아래에 기존 데모와 동일한 강사 리포트가 표시됩니다.</div>}
    </main>
    {lab.job?.status==="complete"&&lab.job.run&&<div id="lab-report"><AiReportView key={lab.job.id} run={lab.job.run} embedded/></div>}
  </>;
}
