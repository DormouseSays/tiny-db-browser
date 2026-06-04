"use client";

import { useState } from "react";
import TabRow from "@/components/TabRow";
import styles from "./page.module.css";

const ICONS = [
  { glyph: "🗂", label: "Tables" },
  { glyph: "▶", label: "Run query" },
  { glyph: "🔍", label: "Search" },
  { glyph: "🔄", label: "Refresh" },
];

const TABS = ["users", "orders", "products"];

export default function Home() {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className={styles.window}>
      {/* Icon menu bar */}
      <div className={styles.menuBar}>
        {ICONS.map((icon) => (
          <button
            key={icon.label}
            type="button"
            className={styles.iconButton}
            title={icon.label}
            aria-label={icon.label}
          >
            {icon.glyph}
          </button>
        ))}
        <span className={styles.menuSpacer} />
        <button
          type="button"
          className={styles.iconButton}
          title="Settings"
          aria-label="Settings"
        >
          ⚙
        </button>
      </div>

      {/* Tab row */}
      <TabRow tabs={TABS} activeTab={activeTab} onSelect={setActiveTab} />

      {/* Content area */}
      <main className={styles.content}>
        <h1>{TABS[activeTab]}</h1>
        <p>Content for the “{TABS[activeTab]}” tab goes here.</p>
      </main>

      {/* Footer */}
      <footer className={styles.footer}>
        <span>Ready</span>
        <span>{TABS.length} tables</span>
      </footer>
    </div>
  );
}
