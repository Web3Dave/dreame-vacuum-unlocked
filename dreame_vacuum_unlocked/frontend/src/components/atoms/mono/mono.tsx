import styles from "./mono.module.css";

/** Inline code / monospace label (entity ids, model names, dids). */
export default function Mono({ children }: { children: React.ReactNode }) {
  return <code className={styles.mono}>{children}</code>;
}