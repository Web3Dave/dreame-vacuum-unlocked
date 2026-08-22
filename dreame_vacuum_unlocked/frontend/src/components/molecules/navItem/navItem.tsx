import Link from "next/link";
import styles from "./navItem.module.css";

export default function NavItem({ href, label, active }: { href: string; label: string; active?: boolean }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={styles.item}>
      {label}
    </Link>
  );
}