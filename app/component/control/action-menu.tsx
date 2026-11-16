"use client";

import Image from "next/image";
import type { ReactNode } from "react";

/** Closes the action menu that contains `element` and moves focus back to its "⋯" trigger. */
export function closeActionMenu(element: HTMLElement) {
  const details = element.closest("details");
  details?.removeAttribute("open");
  details?.querySelector("summary")?.focus();
}

/**
 * A card's "⋯" menu on a native `<details>`: only one menu with the same `name` is open at a time, and leaving it
 * with focus or Escape closes it. `floating` pins the panel to the viewport so a table row cannot clip it.
 * The caller owns the look through the class names (including the icon size) and the panel contents through `children`.
 */
export function ActionMenu({ name, label, title = label, disabled = false, busy = false, floating = false, className, triggerClassName, panelClassName, children }: {
  name: string;
  label: string;
  title?: string;
  disabled?: boolean;
  busy?: boolean;
  floating?: boolean;
  className?: string;
  triggerClassName?: string;
  panelClassName?: string;
  children: ReactNode;
}) {
  return <details className={className} name={name}
    onToggle={(event) => {
      const panel = event.currentTarget.lastElementChild as HTMLElement;
      if (!event.currentTarget.open) { panel.removeAttribute("style"); return; }
      if (!floating) return;
      const rect = event.currentTarget.getBoundingClientRect();
      Object.assign(panel.style, {
        position: "fixed",
        top: `${Math.max(12, Math.min(rect.bottom + 6, innerHeight - panel.offsetHeight - 12))}px`,
        left: `${Math.max(12, Math.min(rect.right - panel.offsetWidth, innerWidth - panel.offsetWidth - 12))}px`,
        right: "auto",
      });
    }}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.removeAttribute("open"); }}
    onKeyDown={(event) => { if (event.key === "Escape") closeActionMenu(event.currentTarget); }}>
    <summary className={triggerClassName} aria-label={label} title={title} aria-disabled={disabled} onClick={(event) => { if (disabled) event.preventDefault(); }}>
      {busy ? <span className="spinner dark" /> : <Image src="/assets/design/dots.svg" alt="" width={18} height={18} />}
    </summary>
    <div className={panelClassName}>{children}</div>
  </details>;
}
