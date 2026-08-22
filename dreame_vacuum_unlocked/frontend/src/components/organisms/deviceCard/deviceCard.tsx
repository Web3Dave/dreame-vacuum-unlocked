import Card from "../../../components/atoms/card/card";
import Mono from "../../../components/atoms/mono/mono";
import ValueTable, { ValueRow } from "../../../components/atoms/valueTable/valueTable";
import type { Device } from "../../../lib/types";
import styles from "./deviceCard.module.css";

function stateRows(dev: Device): ValueRow[] {
  const st = dev.state ?? {};
  return Object.entries(st).map(([role, s]) => {
    let value: React.ReactNode = s.state;
    const battery = (s.attributes ?? {}).battery_level as number | undefined;
    if (typeof battery === "number") value = `${s.state} · ${battery}%`;
    return { label: role, value };
  });
}

function entityRows(dev: Device): ValueRow[] {
  return Object.entries(dev.entities ?? {}).map(([role, eid]) => ({
    label: role,
    value: <Mono>{eid}</Mono>,
  }));
}

export default function DeviceCard({ dev, haUp }: { dev: Device; haUp: boolean }) {
  const hasState = !!dev.state && Object.keys(dev.state).length > 0;
  return (
    <Card className={styles.card}>
      <h2 className={styles.title}>{dev.name || dev.did}</h2>
      <div className={styles.model}>
        {dev.model || "unknown model"} · did {dev.did}
      </div>
      {hasState ? (
        <ValueTable rows={stateRows(dev)} />
      ) : dev.entities ? (
        <>
          <ValueTable rows={entityRows(dev)} />
          <p className={styles.hint}>State unavailable — check the Home Assistant API connection.</p>
        </>
      ) : (
        <p className={styles.hint}>No entities reported.</p>
      )}
    </Card>
  );
}