"use client";

import Image from "next/image";
import Link from "next/link";

import { useLanguage } from "@/app/_controller/language-context";
import styles from "./pin-logo.module.css";

export function PinLogo({ href = "/" }: { href?: string }) {
  const { t } = useLanguage();
  return <Link className={styles.root} href={href} aria-label={`OhPin · ${t("common.home")}`}>
    <Image className={styles.image} src="/assets/design/ohpin-mark.svg" width={37.5} height={26} alt="" loading="eager" />
    <span>Oh<span className={styles.pin}>Pin</span></span>
  </Link>;
}
