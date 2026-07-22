import Link from "next/link";

export function PinLogo({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="pin-logo" href="/" aria-label="Pin Class 홈">
      <span className="pin-logo-mark"><span /></span>
      {!compact && <span>Pin <b>Class</b></span>}
    </Link>
  );
}
