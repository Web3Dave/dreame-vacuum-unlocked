"use client";

import AppShell from "../components/organisms/appShell/appShell";

/**
 * The single-page React app: the AppShell (persistent nav + header) renders
 * once and swaps tab content by URL hash. Served by Flask at the add-on root.
 */
export default function HomePage() {
  return <AppShell />;
}