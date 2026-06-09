import styles from "./RowActions.module.css";

export type RowAction = {
  /** Glyph shown on the button. */
  glyph: string;
  /** Used as both the tooltip and the accessible label. */
  label: string;
  onClick: () => void;
  /** Style the button as destructive (e.g. confirm delete). */
  danger?: boolean;
};

/**
 * A compact group of icon buttons rendered in a row's number column while the
 * row is being edited, inserted, or confirmed for deletion. Sized to fit the
 * fixed-width number column so showing it never reflows the grid.
 */
export default function RowActions({ actions }: { actions: RowAction[] }) {
  return (
    <div className={styles.rowActions}>
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          className={`${styles.rowAction} ${
            action.danger ? styles.rowActionDanger : ""
          }`}
          title={action.label}
          aria-label={action.label}
          onClick={action.onClick}
        >
          {action.glyph}
        </button>
      ))}
    </div>
  );
}
