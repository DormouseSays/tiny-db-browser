"use client";

import styles from "./QueryBar.module.css";

type QueryBarProps = {
  value: string;
  onChange: (sql: string) => void;
  /** Run the current SQL (fired on submit / Run click). */
  onRun: () => void;
};

/** The SQL editor at the bottom of the data view: a textarea plus a Run button. */
export default function QueryBar({ value, onChange, onRun }: QueryBarProps) {
  return (
    <form
      className={styles.queryBar}
      onSubmit={(event) => {
        event.preventDefault();
        onRun();
      }}
    >
      <textarea
        className={styles.sqlInput}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        placeholder="Enter a SQL query…"
        aria-label="SQL query"
      />
      <button type="submit" className={styles.runButton}>
        Run
      </button>
    </form>
  );
}
