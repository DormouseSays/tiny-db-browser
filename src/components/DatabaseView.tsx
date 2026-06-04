import type { LoadedDatabase } from "@/lib/sqlite";
import styles from "./DatabaseView.module.css";

type DatabaseViewProps = {
  database: LoadedDatabase;
};

export default function DatabaseView({ database }: DatabaseViewProps) {
  return (
    <div className={styles.view}>
      <h1 className={styles.title}>{database.name}</h1>
      <p className={styles.subtitle}>
        {database.tables.length}{" "}
        {database.tables.length === 1 ? "table" : "tables"}
      </p>

      {database.tables.length === 0 ? (
        <p className={styles.empty}>This database has no tables.</p>
      ) : (
        <ul className={styles.tableList}>
          {database.tables.map((table) => (
            <li key={table} className={styles.tableItem}>
              <span className={styles.tableIcon} aria-hidden="true">
                ▦
              </span>
              {table}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
