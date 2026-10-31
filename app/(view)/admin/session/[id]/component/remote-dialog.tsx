"use client";

import { QRCodeSVG } from "qrcode.react";
import { Check } from "@/app/component/icons";
import { useLanguage } from "@/app/_controller/language-context";
import { useLectureRemoteIssuer } from "@/app/_controller/use-lecture-remote";
import { trapDialogFocus } from "@/app/component/dialog-focus";

/** owner 전용 발표 리모컨 발급. 링크는 발표 화면(프로젝터)에 띄우지 않는다. */
export function RemoteDialog({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const { t } = useLanguage();
  const { holder, url, busy, failed, copied, issue, copy } = useLectureRemoteIssuer(sessionId);
  const status = holder === "connected" ? t("session.remoteConnected")
    : holder === "waiting" ? t(url ? "session.remoteWaiting" : "session.remoteLinkHidden")
      : "";
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="share-modal" role="dialog" aria-modal="true" aria-labelledby="remote-title" aria-describedby="remote-description" onKeyDown={(event) => { trapDialogFocus(event); if (event.key === "Escape") onClose(); }}>
      <h2 id="remote-title">{t("session.remoteTitle")}</h2>
      <p id="remote-description">{t("session.remoteDescription")}</p>
      {url && <>
        <div className="qr-frame"><QRCodeSVG value={url} size={180} bgColor="transparent" fgColor="currentColor" /></div>
        <div className="link-copy"><span>{url.replace(/^https?:\/\//, "")}</span><button type="button" className="btn primary" onClick={copy}>{copied ? <><Check aria-hidden="true" />{t("session.copied")}</> : t("session.copyLink")}</button></div>
      </>}
      <p role="status">{status}</p>
      {failed && <div className="login-error" role="alert">{t("session.remoteError")} {t("common.tryAgain")}</div>}
      <div className="share-actions">
        <button type="button" className={`btn ${url ? "secondary" : "primary"}`} disabled={holder === null} aria-busy={busy} onClick={issue}>{busy ? <span className="spinner" /> : t(holder === "none" ? "session.remoteIssue" : "session.remoteReissue")}</button>
        <button type="button" className="btn secondary" autoFocus onClick={onClose}>{t("common.close")}</button>
      </div>
    </section>
  </div>;
}
