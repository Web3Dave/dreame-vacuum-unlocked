import styles from "./badge.module.css";

type Tone = "ok" | "bad" | "muted";

export default function Badge({ children, tone = "muted" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`${styles.badge} ${tone !== "muted" ? styles[tone] : ""}`}>{children}</span>;
}