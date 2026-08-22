import styles from "./statusMessage.module.css";

type Tone = "ok" | "err" | "info";

export default function StatusMessage({ tone = "info", children }: { tone?: Tone; children: React.ReactNode }) {
  if (!children) return null;
  return <div className={`${styles.status} ${styles[tone]}`}>{children}</div>;
}