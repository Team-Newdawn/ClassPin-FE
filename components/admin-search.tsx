import Image from "next/image";
import type { ChangeEventHandler } from "react";

export function AdminSearch({ className, value, placeholder, onChange }: { className: string; value: string; placeholder: string; onChange: ChangeEventHandler<HTMLInputElement> }) {
  return (
    <label className={`admin-search ${className}`}>
      <Image src="/assets/icons/search_icon.svg" alt="" width={27} height={27} />
      <input type="search" value={value} onChange={onChange} placeholder={placeholder} aria-label={placeholder} />
    </label>
  );
}
