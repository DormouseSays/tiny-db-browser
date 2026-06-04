import styles from "./TabRow.module.css";

type TabRowProps = {
  tabs: string[];
  activeTab: number;
  onSelect: (index: number) => void;
};

export default function TabRow({ tabs, activeTab, onSelect }: TabRowProps) {
  return (
    <div className={styles.tabRow}>
      {tabs.map((tab, i) => (
        <button
          key={tab}
          type="button"
          className={`${styles.tab} ${i === activeTab ? styles.tabActive : ""}`}
          onClick={() => onSelect(i)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
