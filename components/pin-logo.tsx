import Link from "next/link";

/** 기본값은 강의 앱(Pin Class). 피드백 앱은 제품명과 홈 경로를 갈아 끼운다. */
export function PinLogo({ compact = false, href = "/", product = "Class", label = "Pin Class 홈" }: {
  compact?: boolean;
  href?: string;
  product?: string;
  label?: string;
}) {
  return (
    <Link className="pin-logo" href={href} aria-label={label}>
      <span className="pin-logo-mark"><span /></span>
      {!compact && <span>Pin{product ? <> <b>{product}</b></> : null}</span>}
    </Link>
  );
}
