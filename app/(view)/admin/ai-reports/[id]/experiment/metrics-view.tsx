import type { LabJob } from "@/app/_service/model-lab-service";
import { labModels, type LabSelection } from "@/app/_model/model-lab";
import { labSeconds } from "@/app/_model/model-lab-metrics";
import styles from "./page.module.css";

const names = {ocr:"글자 읽기 · OCR",layout:"영역 구분 · Layout",llm:"문맥 해석 · 리포트 생성"};
const states: Record<string,string> = {cached:"✓ 캐시 재사용",running:"◷ 실행 중",complete:"✓ 실행 완료",failed:"! 실패",unavailable:"— 결과 없음"};
export default function LabMetricsView({job}:{job:LabJob}) {
  const metrics = job.metrics;
  if (!metrics) return null;
  return <section className={styles.card} aria-label="모델별 실행 현황">
    <h2>모델별 실행 현황</h2>
    <p>시간·자원은 실제 측정 기록입니다. 캐시 재사용 항목은 이번에 모델을 다시 실행하지 않았습니다.</p>
    <div className={styles.grid}>{metrics.stages.map(stage=>{
      const key = stage.key as keyof LabSelection;
      const label = labModels[key].find(([id])=>id===job[key])?.[1] ?? job[key];
      return <article className={styles.metricStage} key={key}>
        <small>{names[key]}</small><h3>{label}</h3>
        <span className={styles.statusBadge} data-status={stage.status}>{states[stage.status] ?? stage.status}</span>
        <dl>
          <div><dt>{stage.status === "cached" ? "원래 생성 시간" : "실행 소요 시간"}</dt><dd>{stage.measuredMs === null && stage.status === "running" ? "측정 중" : labSeconds(stage.measuredMs)}</dd></div>
          <div><dt>처리량</dt><dd>{stage.completed}/{stage.total} {key === "llm" ? "PIN" : "페이지"}</dd></div>
          <div><dt>최대 메모리</dt><dd>{stage.peakRssMiB === null ? "미측정" : `${stage.peakRssMiB.toFixed(0)} MiB`}</dd></div>
          <div><dt>외부 API 호출료</dt><dd>0원</dd></div>
        </dl>
      </article>;
    })}</div>
    {job.status === "running"&&<p role="status">요청 후 경과 {labSeconds(metrics.requestElapsedMs)} · 준비·검증 포함, 약 3초마다 갱신됩니다.</p>}
    <div className={styles.metricFooter}>
      <span>LLM 준비 {labSeconds(metrics.readyMs)}</span>
      <span>입력 {metrics.promptTokens?.toLocaleString("ko-KR") ?? "미측정"} 토큰</span>
      <span>출력 {metrics.completionTokens?.toLocaleString("ko-KR") ?? "미측정"} 토큰</span>
      <strong>외부 API 합계 0원</strong>
    </div>
    <p><small>로컬 모델이므로 외부 API 요금이 없습니다. 전기료·장비 감가상각은 미측정이며 총 운영비가 0원이라는 뜻은 아닙니다. 토큰 수는 비용 청구량이 아닌 처리량입니다. 캐시의 시간·메모리·토큰은 과거 실행 기록입니다.</small></p>
    {metrics.pins.length>0&&<details><summary>PIN별 생성 시간 ({metrics.pins.length}/17)</summary>
      <div className={styles.metricTableWrap}><table className={styles.metricTable}><caption>선택한 LLM의 PIN별 요청·생성·검사 소요 시간. 캐시 조회 시 과거 기록입니다.</caption><thead><tr><th scope="col">PIN / 페이지</th><th scope="col">소요 시간</th><th scope="col">출력 검사</th><th scope="col">API 호출료</th></tr></thead><tbody>{metrics.pins.map(pin=><tr key={pin.alias}><th scope="row">{pin.alias} · {pin.page ?? "?"}p</th><td>{labSeconds(pin.elapsedMs)}</td><td>{pin.passed ? "통과" : "검토 필요"}</td><td>0원</td></tr>)}</tbody></table></div>
      <small>출력 검사 통과는 의미 정확도를 보장하지 않습니다. 단계 총 시간에는 모델 준비·종료 등이 포함되어 PIN별 합계와 다를 수 있습니다.</small>
    </details>}
  </section>;
}
