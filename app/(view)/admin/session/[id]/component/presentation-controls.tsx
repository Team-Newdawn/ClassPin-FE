"use client";

import { useId } from "react";
import { useLanguage } from "@/app/_controller/language-context";
import { QR_POSITIONS, type QrPosition, type QuestionDisplayMode } from "@/app/_model/presentation-options";
import type { useSessionAdminController } from "../controller";
import styles from "./presentation-controls.module.css";

export function PresentationControls({ controller: c }: { controller: ReturnType<typeof useSessionAdminController> }) {
  const { t } = useLanguage();
  const id = useId();
  const { presentationOptions: options, session } = c;
  if (!session) return null;
  const positionLabel = (position: QrPosition) => t(position === "top-left" ? "session.qrTopLeft" : position === "top-center" ? "session.qrTopCenter" : position === "top-right" ? "session.qrTopRight" : position === "bottom-left" ? "session.qrBottomLeft" : position === "bottom-center" ? "session.qrBottomCenter" : "session.qrBottomRight");

  return <div className={styles.root}>
    <div className={styles.control}><span>{t("session.questionDisplay")}</span><div className={styles.modes} role="group" aria-label={t("session.questionDisplay")}>
      {(["off", "pins", "questions", "bubbles"] as QuestionDisplayMode[]).map((mode) => <button key={mode} type="button" disabled={c.lectureSaving} aria-pressed={options.questionMode === mode} onClick={() => c.changeQuestionDisplayMode(mode)}>{t(mode === "off" ? "session.displayOff" : mode === "pins" ? "session.displayPins" : mode === "questions" ? "session.displayQuestions" : "session.displayBubbles")}</button>)}
    </div></div>
    <div className={styles.control}><span>{t("session.qrCode")}</span>
      <button className={styles.toggle} type="button" role="switch" aria-checked={session.showPresentationQr} aria-label={t("session.qrCode")} disabled={c.lectureSaving} onClick={() => c.changePresentationQrPlacement(session.showPresentationQr ? "hidden" : options.qrPosition)}><i /></button>
      <button className={styles.trigger} type="button" popoverTarget={id} disabled={!session.showPresentationQr || c.lectureSaving} aria-haspopup="dialog" aria-label={t("session.qrLayout")} onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        const menu = document.getElementById(id);
        if (menu) Object.assign(menu.style, { left: `${Math.max(12, Math.min(innerWidth - 314, box.right - 302))}px`, top: `${Math.max(12, Math.min(box.bottom + 8, innerHeight - 420))}px` });
      }}>{t("session.qrLayout")} <span aria-hidden="true">⌄</span></button>
    </div>
    <div id={id} popover="auto" role="dialog" aria-label={t("session.qrLayout")} className={styles.menu}>
      <b>{t("session.qrLayout")}</b>
      <div className={styles.positions} role="group" aria-label={t("session.qrLocation")}>
        {QR_POSITIONS.map((position) => <button type="button" key={position} data-position={position} aria-pressed={options.qrPosition === position} disabled={c.lectureSaving} onClick={() => c.changePresentationQrPlacement(position)}><span className={styles.thumbnail} aria-hidden="true" /><span>{positionLabel(position)}</span></button>)}
      </div>
      <hr /><b>{t("session.qrSize")}</b>
      <div className={styles.sizes} role="group" aria-label={t("session.qrSize")}>{([64, 96, 160] as const).map((size, index) => <button type="button" key={size} aria-pressed={options.qrSize === size} onClick={() => c.changePresentationOptions({ qrSize: size })}><b>{["S", "M", "L"][index]}</b><small>{size}px</small></button>)}</div>
      <hr /><div className={styles.edit}><span>{t("session.qrEditable")}</span><button type="button" className={styles.toggle} role="switch" aria-checked={options.qrEditable} aria-label={t("session.qrEditable")} onClick={() => c.changePresentationOptions({ qrEditable: !options.qrEditable })}><i /></button></div>
      <p>{t("session.qrEditHint")}</p>
    </div>
  </div>;
}
