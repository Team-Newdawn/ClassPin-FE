"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AdminShell } from "@/app/component/admin-shell";
import { LoadingScreen } from "@/app/component/loading-screen";
import { ArrowLeft, Check, Clock3, FileText, MapPin, Sparkles } from "@/app/component/icons";
import styles from "./page.module.css";

type Region = {
  alias: string;
  type: string;
  summary: string;
  concepts: string[];
  confidence: number;
  importance: "high" | "medium" | "low";
  bboxNorm: { x1: number; y1: number; x2: number; y2: number };
};

type PinInsight = {
  questionAlias: string;
  question: string;
  category: string;
  regionAlias: string;
  mappingStatus: string;
  relation: string;
  analysis: string;
  instructorAction: string;
  confidence: number;
};

type Report = {
  schemaVersion: "classpin-local-ai-report.v1";
  evaluationOnly: true;
  sessionId: string;
  slideNumber: number;
  slideAlias: string;
  image: string;
  summary: string;
  keyConcepts: string[];
  stats: {
    ocrElements: number;
    semanticRegions: number;
    ignoredElements: number;
    analyzedPins: number;
  };
  regions: Region[];
  pins: PinInsight[];
  qualityWarnings: { candidateAlias: string; reason: string }[];
  runtime: {
    model: string;
    license: string;
    elapsedMs: number;
    peakProcessTreeRssMb: number;
    externalApiCostKrw: number;
  };
};

const RELATION_LABELS: Record<string, string> = {
  asks_clarification: "추가 설명 요청",
  requests_evidence: "근거 요청",
  challenges_assumption: "전제·타당성 이의",
  suggests_improvement: "개선 제안",
  confirms: "동의·확인",
  unrelated: "위치와 무관",
};

const TYPE_LABELS: Record<string, string> = {
  title: "제목",
  paragraph: "본문",
  image: "이미지",
  chart: "차트",
  table: "표",
  other: "기타",
};

const WARNING_LABELS: Record<string, string> = {
  "sparse-ocr-confidence-capped": "OCR 근거가 적어 신뢰도 상한을 적용했습니다.",
  "generic-semantic-output": "이미지 의미를 텍스트만으로 확정하기 어려워 검토가 필요합니다.",
};

function confidenceLabel(value: number) {
  if (value >= 0.75) return "높음";
  if (value >= 0.5) return "보통";
  return "검토 필요";
}

export default function AiInstructorReportPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params.id;
  const [report, setReport] = useState<Report | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/generated/ai-reports/${encodeURIComponent(sessionId)}/report.json`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Report request failed: ${response.status}`);
        const value = (await response.json()) as Report;
        if (value.schemaVersion !== "classpin-local-ai-report.v1" || value.sessionId !== sessionId) {
          throw new Error("Report identity mismatch");
        }
        setReport(value);
        setState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setReport(null);
        setState("missing");
      });
    return () => controller.abort();
  }, [sessionId]);

  if (state === "loading") return <LoadingScreen />;

  if (state === "missing" || !report) {
    return (
      <AdminShell>
        <main className={styles.empty}>
          <span className={styles.emptyIcon}><FileText /></span>
          <h1>아직 생성된 AI 리포트가 없어요</h1>
          <p>이 세션의 PDF 분석이 완료되면 페이지 요소와 PIN 질문을 연결한 리포트가 여기에 표시됩니다.</p>
          <Link className="btn primary" href={`/admin/session/${sessionId}`}><ArrowLeft />세션으로 돌아가기</Link>
        </main>
      </AdminShell>
    );
  }

  const safeImageName = /^slide-\d{3}\.semantic-overlay\.jpg$/.test(report.image)
    ? report.image
    : `slide-${String(report.slideNumber).padStart(3, "0")}.semantic-overlay.jpg`;
  const imageSrc = `/generated/ai-reports/${encodeURIComponent(sessionId)}/${safeImageName}`;

  return (
    <AdminShell>
      <main className={styles.page}>
        <header className={styles.header}>
          <Link href={`/admin/session/${sessionId}`} className={styles.back}><ArrowLeft />세션으로 돌아가기</Link>
          <div className={styles.titleRow}>
            <div>
              <span className={styles.eyebrow}><Sparkles />AI Instructor Report</span>
              <h1>AI 강사 리포트</h1>
              <p>슬라이드의 의미 영역과 해당 위치에 남겨진 PIN 질문을 함께 해석합니다.</p>
            </div>
            <div className={styles.badges}>
              <span>로컬 PoC</span>
              <span>Supabase 미사용</span>
            </div>
          </div>
          <div className={styles.scopeNotice}>
            현재 검증 범위는 <strong>{report.slideNumber}번 슬라이드 1페이지</strong>입니다. 전체 PPT 분석은 다음 단계에서 같은 구조로 확장합니다.
          </div>
        </header>

        <section className={styles.heroGrid}>
          <article className={styles.panel}>
            <div className={styles.panelHead}><div><span className={styles.sectionLabel}>SEGMENTATION</span><h2>의미 영역 오버레이</h2></div><span className={styles.slideBadge}>Slide {report.slideNumber}</span></div>
            <div className={styles.imageFrame}>
              <Image src={imageSrc} alt={`${report.slideNumber}번 슬라이드 의미 영역 오버레이`} width={1600} height={900} priority unoptimized />
            </div>
          </article>

          <article className={`${styles.panel} ${styles.summaryPanel}`}>
            <span className={styles.sectionLabel}>PAGE UNDERSTANDING</span>
            <h2>페이지 핵심 해석</h2>
            <p className={styles.summary}>{report.summary}</p>
            <div className={styles.concepts}>
              {report.keyConcepts.map((concept) => <span key={concept}>{concept}</span>)}
            </div>
            <div className={styles.statGrid}>
              <Stat value={report.stats.ocrElements} label="OCR 요소" />
              <Stat value={report.stats.semanticRegions} label="의미 영역" />
              <Stat value={report.stats.ignoredElements} label="잡음 분리" />
              <Stat value={report.stats.analyzedPins} label="PIN 의미 분석" />
            </div>
          </article>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <div><span className={styles.sectionLabel}>PIN INSIGHT</span><h2>PIN에서 읽힌 강사 인사이트</h2><p>질문 위치와 주변 요소의 의미를 함께 사용한 분석입니다.</p></div>
          </div>
          <div className={styles.pinList}>
            {report.pins.length ? report.pins.map((pin) => (
              <article className={styles.pinCard} key={pin.questionAlias}>
                <div className={styles.pinMeta}><span><MapPin />{pin.questionAlias} → {pin.regionAlias}</span><em>{RELATION_LABELS[pin.relation] ?? pin.relation}</em></div>
                <h3>{pin.question || "질문 원문 없음"}</h3>
                <p>{pin.analysis}</p>
                <div className={styles.action}><span><Check />강사 권장 행동</span><p>{pin.instructorAction}</p></div>
                <small>위치 매핑 {pin.mappingStatus === "mapped" ? "완료" : pin.mappingStatus} · 의미 신뢰도 {confidenceLabel(pin.confidence)} ({pin.confidence.toFixed(2)})</small>
              </article>
            )) : <p className={styles.noData}>분석된 PIN이 없습니다.</p>}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}><div><span className={styles.sectionLabel}>REGION DETAIL</span><h2>페이지 요소별 의미</h2><p>위치·유형·요약·핵심 개념을 영역 단위로 확인할 수 있습니다.</p></div></div>
          <div className={styles.regionTableWrap}>
            <table className={styles.regionTable}>
              <thead><tr><th>영역</th><th>AI가 파악한 의미</th><th>신뢰도</th><th>정규화 위치</th></tr></thead>
              <tbody>{report.regions.map((region) => (
                <tr key={region.alias}>
                  <td><strong>{region.alias}</strong><span>{TYPE_LABELS[region.type] ?? region.type}</span></td>
                  <td><p>{region.summary}</p><div className={styles.miniConcepts}>{region.concepts.map((concept) => <span key={concept}>{concept}</span>)}</div></td>
                  <td><span className={`${styles.confidence} ${region.confidence < 0.5 ? styles.low : ""}`}>{confidenceLabel(region.confidence)}</span><small>{region.confidence.toFixed(2)}</small></td>
                  <td><code>({region.bboxNorm.x1.toFixed(3)}, {region.bboxNorm.y1.toFixed(3)})<br />– ({region.bboxNorm.x2.toFixed(3)}, {region.bboxNorm.y2.toFixed(3)})</code></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>

        <section className={styles.bottomGrid}>
          <article className={`${styles.panel} ${styles.warningPanel}`}>
            <span className={styles.sectionLabel}>QUALITY GATE</span>
            <h2>자동 품질 경고</h2>
            <ul>{report.qualityWarnings.length ? report.qualityWarnings.map((warning) => <li key={`${warning.candidateAlias}-${warning.reason}`}><strong>{warning.candidateAlias}</strong>{WARNING_LABELS[warning.reason] ?? warning.reason}</li>) : <li>자동 품질 경고가 없습니다.</li>}</ul>
            <p>현재는 OCR·배치 기반입니다. 이미지 중심의 저신뢰 영역만 로컬 비전 모델로 재검사하는 2단계 경로가 다음 개선점입니다.</p>
          </article>
          <article className={styles.panel}>
            <span className={styles.sectionLabel}>LOCAL RUNTIME</span>
            <h2>실행 비용</h2>
            <div className={styles.runtime}><Clock3 /><div><strong>{(report.runtime.elapsedMs / 1000).toFixed(1)}초</strong><span>페이지 분석 시간</span></div></div>
            <dl>
              <div><dt>모델</dt><dd>{report.runtime.model}</dd></div>
              <div><dt>라이선스</dt><dd>{report.runtime.license}</dd></div>
              <div><dt>최대 메모리</dt><dd>{(report.runtime.peakProcessTreeRssMb / 1024).toFixed(2)} GB</dd></div>
              <div><dt>외부 API 비용</dt><dd>{report.runtime.externalApiCostKrw.toLocaleString()}원</dd></div>
            </dl>
          </article>
        </section>
      </main>
    </AdminShell>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return <div className={styles.stat}><strong>{value}</strong><span>{label}</span></div>;
}
