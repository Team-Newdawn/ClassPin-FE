"use client";

import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useLanguage } from "@/app/_controller/language-context";
import { clampQrSize, type PresentationOptions, type presentationOptions } from "@/app/_model/presentation-options";
import styles from "./presentation-qr.module.css";

type Layout = ReturnType<typeof presentationOptions>;

export function PresentationQr({ options, onChange, joinUrl, code }: {
  options: Layout;
  onChange: (patch: Partial<PresentationOptions>) => Promise<void>;
  joinUrl: string;
  code: string;
}) {
  const { t } = useLanguage();
  const ref = useRef<HTMLElement>(null);
  const gesture = useRef<{ pointer: number; resize: boolean; x: number; y: number; box: DOMRect; parent: DOMRect; size: number } | null>(null);
  const [preview, setPreview] = useState<{ qrSize: number; qrOffset: Layout["qrOffset"] } | null>(null);
  const [error, setError] = useState(false);
  const size = preview?.qrSize ?? options.qrSize;
  const offset = preview?.qrOffset ?? options.qrOffset;
  const save = async (patch: Partial<PresentationOptions>) => {
    try { await onChange(patch); setError(false); } catch { setError(true); }
  };
  const offsetAt = (left: number, top: number, box: DOMRect, parent: DOMRect) => ({
    x: Math.min(1, Math.max(0, left / Math.max(1, parent.width - box.width))),
    y: Math.min(1, Math.max(0, top / Math.max(1, parent.height - box.height)))
  });
  const start = (event: PointerEvent<HTMLElement>) => {
    if (!options.qrEditable || event.button !== 0) return;
    event.preventDefault();
    const box = event.currentTarget.getBoundingClientRect();
    const parent = event.currentTarget.parentElement!.getBoundingClientRect();
    gesture.current = { pointer: event.pointerId, resize: Boolean((event.target as Element).closest("[data-resize]")), x: event.clientX, y: event.clientY, box, parent, size };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    const drag = gesture.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    setPreview(drag.resize
      ? { qrSize: clampQrSize(drag.size + (Math.abs(dx) > Math.abs(dy) ? dx : dy)), qrOffset: options.qrOffset }
      : { qrSize: size, qrOffset: offsetAt(drag.box.left - drag.parent.left + dx, drag.box.top - drag.parent.top + dy, drag.box, drag.parent) });
  };
  const finish = (event: PointerEvent<HTMLElement>) => {
    if (gesture.current?.pointer !== event.pointerId) return;
    if (preview) save(preview);
    gesture.current = null;
    setPreview(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const moveByKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!event.key.startsWith("Arrow")) return;
    event.preventDefault(); event.stopPropagation();
    const box = ref.current!.getBoundingClientRect();
    const parent = ref.current!.parentElement!.getBoundingClientRect();
    const step = event.shiftKey ? 16 : 4;
    save({ qrOffset: offsetAt(box.left - parent.left + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0), box.top - parent.top + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0), box, parent) });
  };
  const style = { "--qr-size": `${size}px`, "--qr-code-font-size": `${Math.min(16, size / (code.length || 1) * 1.25)}px`, ...(offset ? { left: `calc((100% - ${size + 16}px) * ${offset.x})`, top: `calc((100% - ${size + 46}px) * ${offset.y})`, right: "auto", bottom: "auto", transform: "none" } : {}) } as CSSProperties;

  return <aside ref={ref} className={styles.root} data-position={options.qrPosition} data-editable={options.qrEditable} style={style}
    aria-label={`${t("presentation.joinQrAria")} · ${code}`} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={() => { gesture.current = null; setPreview(null); }}>
    <QRCodeSVG value={joinUrl} size={size} bgColor="var(--color-bg-surface)" fgColor="var(--color-text-primary)" level="M" />
    <b>{code}</b>
    {options.qrEditable && <><button type="button" className={styles.move} aria-label={t("session.qrMove")} onKeyDown={moveByKey} />
      <button type="button" className={styles.resize} data-resize aria-label={t("session.qrResize")} onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        save({ qrSize: event.key === "Home" ? 64 : event.key === "End" ? 160 : clampQrSize(size + (["ArrowUp", "ArrowRight"].includes(event.key) ? 8 : -8)) });
      }} /></>}
    {error && <span className={styles.error} role="alert">{t("session.qrEditError")}</span>}
  </aside>;
}
