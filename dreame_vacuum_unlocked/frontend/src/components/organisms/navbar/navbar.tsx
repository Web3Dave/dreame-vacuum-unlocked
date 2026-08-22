import Link from "next/link";
import NavItem from "../../../components/molecules/navItem/navItem";
import SettingsGear from "../../../components/molecules/settingsGear/settingsGear";
import { hashHref } from "../../../lib/api";
import styles from "./navbar.module.css";

export interface NavSection {
  /** path relative to the app root (e.g. "tasks", "" for home) */
  path: string;
  label: string;
  page: string;
}

const SECTIONS: NavSection[] = [
  { path: "", label: "Devices", page: "devices" },
  { path: "tasks", label: "Tasks", page: "tasks" },
  { path: "tags", label: "Tags", page: "tags" },
  { path: "classifications", label: "Classifications", page: "classifications" },
  { path: "cleaning", label: "Cleaning", page: "cleaning" },
  { path: "maps", label: "Maps", page: "maps" },
  { path: "activity", label: "Activity", page: "activity" },
];

export default function NavBar({ active }: { active?: string }) {
  return (
    <nav className={styles.nav}>
      {SECTIONS.map((s) => (
        <NavItem key={s.page} href={hashHref(s.path)} label={s.label} active={active === s.page} />
      ))}
      <SettingsGear />
    </nav>
  );
}

/** Home anchor — kept separate so it can point at the index route. */
export function HomeLink() {
  return (
    <Link href={hashHref("")} className={styles.home}>
      Dreame Companion
    </Link>
  );
}