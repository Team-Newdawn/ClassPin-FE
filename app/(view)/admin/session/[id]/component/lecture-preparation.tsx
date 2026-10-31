"use client";

import Link from "next/link";
import Image from "next/image";
import { useRef, useState } from "react";
import { useLanguage } from "@/app/_controller/language-context";
import type { Question } from "@/app/_model/types";
import { LECTURE_REACTION_EMOJIS } from "@/app/_model/lecture-reactions";
import { SlideCanvas } from "@/app/component/slide-canvas";
import type { useSessionAdminController } from "../controller";
import { QR_POSITIONS } from "@/app/_model/presentation-options";
import { PinClusterPopover } from "./pin-cluster-popover";
import { usePinCluster } from "./pin-cluster-controller";
import styles from "./lecture-preparation.module.css";

// 질문 PIN 공개를 켰을 때 "이런 식으로 PIN이 찍힌다"를 보여 주는 예시. 저장되지 않는다. 가까운 PIN은 묶음으로 보인다.
const SAMPLE_PINS: { x: number; y: number; reactions: number; ko: string; en: string }[] = [
  { x: .22, y: .28, reactions: 2, ko: "이 용어의 정확한 정의가 궁금해요.", en: "What exactly does this term mean?" },
  { x: .6, y: .45, reactions: 7, ko: "이 그래프의 세로축 단위가 뭔가요?", en: "What unit is the vertical axis in this graph?" },
  { x: .615, y: .47, reactions: 4, ko: "값이 갑자기 꺾이는 이유가 있나요?", en: "Why does the value drop suddenly here?" },
  { x: .603, y: .485, reactions: 1, ko: "이 그래프 데이터 출처를 알고 싶어요.", en: "Where does the data in this graph come from?" },
  { x: .32, y: .7, reactions: 5, ko: "이 공식이 시험에도 나오나요?", en: "Will this formula be on the exam?" },
  { x: .335, y: .72, reactions: 0, ko: "공식 유도 과정을 한 번 더 설명해 주세요.", en: "Could you explain how the formula is derived again?" },
  { x: .82, y: .22, reactions: 3, ko: "예시를 하나 더 들어 주실 수 있나요?", en: "Could you give one more example?" },
];
const SAMPLE_SUMMARY = {
  ko: "예시 요약: 같은 부분에 대해 단위·출처·변화 이유를 묻는 질문이 모였어요. 실제 강의에서는 AI가 묶인 질문을 요약해 보여 줘요.",
  en: "Example summary: These questions ask about units, sources, and changes in the same spot. During a live lecture, AI summarizes the grouped questions.",
};

function Icon({ name, size = 16 }: { name: string; size?: number }) {
  return <Image src={`/assets/design/prepare-${name}.svg`} width={size} height={size} alt="" />;
}

function Toggle({ checked, label, disabled, onClick }: { checked: boolean; label: string; disabled?: boolean; onClick?: () => void }) {
  return <button type="button" className={styles.toggle} role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={onClick}><Image src={`/assets/design/prepare-${checked ? "on" : "off"}.svg`} width={36} height={20} alt="" /></button>;
}

export function LecturePreparation({ controller: c }: { controller: ReturnType<typeof useSessionAdminController> }) {
  const { locale, t } = useLanguage();
  const [previewOpen, setPreviewOpen] = useState(false);
  const dialogTrigger = useRef<HTMLButtonElement | null>(null);
  const copy = (ko: string, en: string) => locale === "ko" ? ko : en;
  const { session, slide, presentationOptions: options } = c;
  const pins: Question[] = session?.showQuestionPins ? SAMPLE_PINS.map(({ x, y, reactions, ko, en }, index) => ({
    id: `sample-pin-${index}`, sessionId: session.id, slideIndex: session.currentSlide, x, y, category: "", marker: "pin",
    text: copy(ko, en), status: "unanswered", isMine: false, reactionCount: reactions, reactedByMe: false, createdAt: "",
  })) : [];
  const previewPins = options.questionMode === "bubbles" ? pins.slice(0, 1) : pins;
  const { expandedIds, highlightedId, highlightPin, clusterQuestions, openCluster, closeCluster } = usePinCluster(slide?.id, previewPins);
  if (!session || !slide) return null;
  const openPreview = (trigger: HTMLButtonElement) => { trigger.focus(); dialogTrigger.current = trigger; setPreviewOpen(true); };
  const qr = session.showPresentationQr && <span className={styles.qr} data-position={options.qrPosition} style={{ width: `min(${options.qrSize}px, 20%)` }} aria-label={t("session.qrPosition")}><Icon name="qr" size={50} /></span>;
  const positionLabel = (position: string) => t(position === "top-left" ? "session.qrTopLeft" : position === "top-center" ? "session.qrTopCenter" : position === "top-right" ? "session.qrTopRight" : position === "bottom-left" ? "session.qrBottomLeft" : position === "bottom-center" ? "session.qrBottomCenter" : "session.qrBottomRight");
  const sizeLabel = ["S", "M", "L"][[64, 96, 160].indexOf(options.qrSize)] ?? copy("직접 조절", "Custom");
  const noteStatus = c.noteSavingSlideId === slide.id ? t("session.speakerNotesSaving") : c.noteDirty ? t("session.speakerNotesPending") : c.noteSavedSlideId === slide.id ? t("session.speakerNotesSaved") : t("session.speakerNotesAutosaveHint");
  return <div className={styles.root} aria-busy={c.lectureSaving}>
    <header className={styles.header}>
      <Link href={c.folderHref} className={styles.back} aria-label={t("session.backToFolder")}><Icon name="back" /></Link>
      <div className={styles.title}><small>{c.folder?.name ?? t("folders.unfiled")} · {t("folders.prepare")}</small><h1 title={session.title}>{session.title}</h1></div>
      <span className={styles.badge}>{t("folders.prepare")}</span>
      <span className={styles.saveStatus} role="status"><Icon name="cloud" />{noteStatus}</span>
      <button type="button" className={styles.previewButton} onClick={event => openPreview(event.currentTarget)}><Icon name="eye" size={15} />{copy("슬라이드쇼 미리보기", "Slideshow preview")}</button>
      <button type="button" className={styles.startButton} disabled={c.lectureSaving} onClick={c.startPreparedLecture}><Icon name="play" />{c.lectureSaving ? t("folders.startingLive") : t("folders.startLive")}</button>
    </header>
    {c.actionError && <p className={styles.error} role="alert">{c.actionError} {t("common.tryAgain")} <button type="button" onClick={c.saveNoteOnBlur}>{copy("노트 저장 재시도", "Retry saving notes")}</button></p>}
    <div className={styles.workspace} inert={c.lectureSaving}>
      <aside className={styles.slides} aria-label={t("session.slideNavigation")}>
        <div className={styles.slideHeading}><b>{copy("슬라이드", "Slides")} · {session.slides.length}</b><span>{copy("노트", "Notes")} {session.slides.filter(item => item.id === slide.id ? c.noteDraft.trim() : item.speakerNote?.trim()).length}</span></div>
        <nav>{session.slides.map((item, index) => <button type="button" className={styles.slideButton} key={item.id} aria-label={t("common.slideLabel", { number: index + 1 })} aria-current={index === session.currentSlide ? "page" : undefined} onClick={() => c.changeSlide(index)}><small>{index + 1}</small><span className={styles.thumbnail}><SlideCanvas slide={item} compact />{(item.id === slide.id ? c.noteDraft.trim() : item.speakerNote?.trim()) && <span className={styles.noteMark}><Icon name="note-small" size={11} /></span>}</span></button>)}</nav>
        <button type="button" className={styles.addSlide} disabled><Icon name="plus" size={15} />{copy("슬라이드 추가", "Add slide")}</button>
        <small className={styles.unavailable}>{copy("슬라이드 추가는 추후 제공됩니다.", "Slide append is not available yet.")}</small>
      </aside>
      <main className={styles.stage}>
        <div className={styles.canvasHeading}><b>{t("common.slideLabel", { number: session.currentSlide + 1 })}</b><span>{copy("점선 = 청중 화면에서 QR이 뜨는 자리", "Dashed box = QR position on the audience screen")}</span></div>
        <div className={styles.canvas} onWheel={c.handleSlideWheel}><SlideCanvas slide={slide} questions={previewPins} showQuestionLabels={session.showQuestionLabels} onSelectCluster={openCluster} expandedIds={expandedIds} highlightedId={highlightedId} dimmed={Boolean(expandedIds)}>
          {clusterQuestions.length > 0 && <PinClusterPopover key={expandedIds!.join("|")} questions={clusterQuestions} folder={null} summary={copy(SAMPLE_SUMMARY.ko, SAMPLE_SUMMARY.en)} highlightedId={highlightedId} onHighlight={highlightPin} onClose={closeCluster} />}
        </SlideCanvas>{qr}</div>
        <section className={styles.notes} aria-labelledby="prepare-notes-title">
          <div className={styles.notesHeading}><Icon name="note" /><b id="prepare-notes-title">{copy("발표자 노트", "Speaker notes")}</b><small>{t("session.speakerNotesPrivate")}</small><span>{c.noteDraft.length.toLocaleString()} / 10,000</span></div>
          <textarea aria-labelledby="prepare-notes-title" value={c.noteDraft} maxLength={10000} placeholder={t("session.speakerNotesHint")} onChange={event => c.changeNoteDraft(event.target.value)} onBlur={c.saveNoteOnBlur} />
          <small role="status" aria-live="polite">{noteStatus}</small>
        </section>
      </main>
      <aside className={styles.settings} aria-label={copy("강의 설정", "Lecture settings")}>
        <section className={styles.questionSettings}>
          <div className={styles.sectionHeading}><h2>{t("session.questionDisplay")}</h2><p>{copy("강의 중 언제든 변경할 수 있어요", "You can change this anytime during the lecture")}</p></div>
          <div className={styles.questionModes} role="group" aria-label={t("session.questionDisplay")}>
            {(["off", "pins", "questions", "bubbles"] as const).map(mode => <button key={mode} type="button" aria-pressed={options.questionMode === mode} disabled={c.lectureSaving} onClick={() => c.changeQuestionDisplayMode(mode)}>{t(mode === "off" ? "session.displayOff" : mode === "pins" ? "session.pinsOnly" : mode === "questions" ? "session.pinsAndQuestions" : "session.displayBubbles")}</button>)}
          </div>
        </section>
        <section>
          <div className={styles.sectionHeading}><h2>{t("session.qrLayout")}</h2><p>{copy("위치와 크기는 강의 중에도 설정 가능", "Adjust position and size during the lecture")}</p></div>
          <div className={styles.qrControls}>
            <div className={styles.cornerPicker} role="group" aria-label={t("session.qrPosition")}>{QR_POSITIONS.map(position => <button key={position} type="button" data-position={position} aria-label={positionLabel(position)} aria-pressed={options.qrPosition === position && session.showPresentationQr} disabled={c.lectureSaving} onClick={() => c.changePresentationQrPlacement(position)} />)}</div>
            <div className={styles.qrStatus}><b>{session.showPresentationQr ? positionLabel(options.qrPosition) : t("session.qrHidden")}</b><span>{copy("QR 숨기기", "Hide QR")}<Toggle checked={!session.showPresentationQr} disabled={c.lectureSaving} label={t("session.qrHidden")} onClick={() => c.changePresentationQrPlacement(session.showPresentationQr ? "hidden" : options.qrPosition)} /></span></div>
          </div>
          <div className={styles.qrSize}>
            <div className={styles.sizeHeading}><b>{copy("QR 코드 크기", "QR code size")}</b><span role="status" aria-live="polite">{sizeLabel} · {options.qrSize}px {copy("선택됨", "selected")}</span></div>
            <div className={styles.sizeOptions} role="group" aria-label={t("session.qrSize")}>{([64, 96, 160] as const).map((size, index) => <button key={size} type="button" aria-pressed={options.qrSize === size} disabled={c.lectureSaving} onClick={() => c.changePresentationOptions({ qrSize: size })}><b>{["S", "M", "L"][index]}</b><small>{size}px</small></button>)}</div>
          </div>
        </section>
        <section><h2>{copy("청중 반응", "Audience reactions")}</h2><div className={styles.settingRow}><span><b>{copy("공감 허용", "Allow empathy")}</b><small>{copy("같은 질문에 👍로 모이게 해요", "Gather the same question with 👍")}</small></span><Toggle checked={session.allowQuestionReactions} disabled={c.lectureSaving} label={copy("공감 허용", "Allow empathy")} onClick={() => c.toggleReactionAllowed("allowQuestionReactions")} /></div><div className={styles.settingRow}><span><b>{copy("이모지 반응", "Emoji reactions")}</b><small>{LECTURE_REACTION_EMOJIS.join(" ")} {copy("빠른 반응", "quick reactions")}</small></span><Toggle checked={session.allowEmojiReactions} disabled={c.lectureSaving} label={copy("이모지 반응", "Emoji reactions")} onClick={() => c.toggleReactionAllowed("allowEmojiReactions")} /></div><div className={styles.settingRow}><span><b>{copy("질문 핀 공개", "Show question PINs")}</b><small>{copy("청중끼리 서로의 질문 위치를 봐요", "Let the audience see where questions are pinned")}</small></span><Toggle checked={session.showQuestionPins} label={t("session.pinLive")} onClick={c.toggleQuestionPins} /></div></section>
        <p className={styles.startHint}><Icon name="play-blue" size={14} />{copy("세션을 시작하면 청중 QR이 열리고 LIVE로 바뀌어요", "Start the session to open the audience QR and go LIVE")}</p>
      </aside>
    </div>
    {previewOpen && <dialog aria-labelledby="prepare-dialog-title" className={styles.dialog} ref={node => { if (node && !node.open) node.showModal(); }} onClose={() => { setPreviewOpen(false); requestAnimationFrame(() => dialogTrigger.current?.focus()); }} onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}><header><h2 id="prepare-dialog-title">{copy("슬라이드쇼 미리보기", "Slideshow preview")}</h2><button type="button" autoFocus onClick={event => event.currentTarget.closest("dialog")?.close()}>{t("common.close")}</button></header>
      <div className={`${styles.canvas} class-presentation-canvas`}><SlideCanvas slide={slide} questions={previewPins} showQuestionLabels={session.showQuestionLabels} onSelectCluster={() => undefined} />{qr}</div><p>{copy("현재 슬라이드의 슬라이드쇼 표시 미리보기입니다. PIN은 예시입니다.", "Preview of the current slide in the slideshow. PINs are examples.")}</p></dialog>}
  </div>;
}
