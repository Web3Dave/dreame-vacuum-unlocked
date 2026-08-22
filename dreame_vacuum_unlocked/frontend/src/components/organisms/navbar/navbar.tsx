import Link from "next/link";
import NavItem from "../../../components/molecules/navItem/navItem";
import SettingsGear from "../../../components/molecules/settingsGear/settingsGear";
import styles from "./navbar.module.css";

export interface NavSection {
  href: string;
  label: string;
  page: string;
}

const SECTIONS: NavSection[] = [
  { href: "", label: "Devices", page: "devices" },
  { href: "tasks", label: "Tasks", page: "tasks" },
  { href: "tags", label: "Tags", page: "tags" },
  { href: "classifications", label: "Classifications", page: "classifications" },
  { href: "cleaning", label: "Cleaning", page: "cleaning" },
  { href: "maps", label: "Maps", page: "maps" },
  { href: "activity", label: "Activity", page: "activity" },
];

export default function NavBar({ active }: { active?: string }) {
  return (
    <nav className={styles.nav}>
      {SECTIONS.map((s) => (
        <NavItem key={s.page} href={s.href} label={s.label} active={active === s.page} />
      ))}
      <SettingsGear />
    </nav>
  );
}

/** Home anchor — kept separate so it can point at the index route. */
export function HomeLink() {
  return (
    <Link href="" className={styles.home}>
      Dreame Companion
    </Link>
  );
}