import styles from "./valueTable.module.css";

export interface ValueRow {
  label: string;
  value: React.ReactNode;
}

export default function ValueTable({ rows }: { rows: ValueRow[] }) {
  return (
    <table className={styles.table}>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td>{r.label}</td>
            <td>{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}