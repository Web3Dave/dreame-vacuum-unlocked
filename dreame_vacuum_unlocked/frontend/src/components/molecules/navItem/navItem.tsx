import Link from "next/link";
import styles from "./navItem.module.css";

export default function NavItem({ href, label, active }: { href: string; label: string; active?: boolean }) {
  // When served under HA ingress, hrefs carry the base prefix (a full web path)
  // and are not Next routes - use a plain <a> so navigation is a reliable full
  // page load (Flask serves the target). Same-root relative hrefs (no leading
  // slash / no base) can use Next's client-side Link.
  const isWebPath = href.startsWith("/");
  if (isWebPath) {
    return (
      <a href={href} aria-current={active ? "page" : undefined} className={styles.item}>
        {label}
      </a>
    );
  }
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={styles.item}>
      {label}
    </Link>
  );
}