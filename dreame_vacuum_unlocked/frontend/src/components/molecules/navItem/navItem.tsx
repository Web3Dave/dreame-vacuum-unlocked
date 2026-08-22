import styles from "./navItem.module.css";

export default function NavItem({ href, label, active }: { href: string; label: string; active?: boolean }) {
  // Nav links are pure hash anchors (#/tasks, #/). Clicking sets the hash (no
  // page reload); the AppShell's hashchange listener swaps the content.
  return (
    <a
      href={href}
      aria-current={active ? "page" : undefined}
      className={styles.item}
      onClick={(e) => {
        e.preventDefault();
        window.location.hash = href.replace(/^#/, "");
      }}
    >
      {label}
    </a>
  );
}