import type { ReactNode } from "react";
import styles from "./loading-screen.module.css";

export function LoadingScreen({ children }: { children?: ReactNode }) {
  return <div className={styles.root}>{children ?? <span className="spinner dark" />}</div>;
}
