import styles from "./TabRow.module.css";

type TabRowProps = {
  tabs: string[];
  activeTab: number;
  onSelect: (index: number) => void;
  onClose: (index: number) => void;
};

export default function TabRow({
  tabs,
  activeTab,
  onSelect,
  onClose,
}: TabRowProps) {
  return (
    <div className={styles.tabRow} role="tablist">
      {tabs.map((tab, i) => (
        <div
          key={tab}
          className={`${styles.tab} ${i === activeTab ? styles.tabActive : ""}`}
        >
          <button
            type="button"
            role="tab"
            aria-selected={i === activeTab}
            className={styles.tabLabel}
            onClick={() => onSelect(i)}
          >
            {tab}
          </button>
          <button
            type="button"
            className={styles.closeButton}
            aria-label={`Close ${tab}`}
            title={`Close ${tab}`}
            onClick={() => onClose(i)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
