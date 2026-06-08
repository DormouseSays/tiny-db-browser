"use client";

import { useState } from "react";
import styles from "./OpenMenu.module.css";

export type ServerFile = { id: string; name: string };

type OpenMenuProps = {
  /** Icon shown on the trigger button. */
  glyph: string;
  /** Accessible label and tooltip for the trigger button. */
  title: string;
  /** Message shown when the loaded list is empty. */
  emptyLabel: string;
  /** Class for the trigger button, so it matches the surrounding menu bar. */
  buttonClassName: string;
  /** Load the selectable files; called each time the menu is opened. */
  load: () => Promise<ServerFile[]>;
  /** Open the file the user picked. */
  onOpen: (file: ServerFile) => void;
  /** Report a load failure (the menu closes itself first). */
  onError: (message: string) => void;
};

/**
 * A menu-bar button with a dropdown listing database files to open. The list is
 * (re)loaded each time the menu opens; `files` is null while that load is in
 * flight. Used for both server uploads and the pre-set on-disk files.
 */
export default function OpenMenu({
  glyph,
  title,
  emptyLabel,
  buttonClassName,
  load,
  onOpen,
  onError,
}: OpenMenuProps) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<ServerFile[] | null>(null);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setFiles(null);
    try {
      setFiles(await load());
    } catch (err) {
      setOpen(false);
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  function pick(file: ServerFile) {
    setOpen(false);
    onOpen(file);
  }

  return (
    <div className={styles.openMenu}>
      <button
        type="button"
        className={buttonClassName}
        title={title}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        {glyph}
      </button>
      {open && (
        <>
          <div
            className={styles.dropdownOverlay}
            onClick={() => setOpen(false)}
          />
          <div className={styles.dropdown} role="menu">
            {files === null ? (
              <p className={styles.dropdownEmpty}>Loading…</p>
            ) : files.length === 0 ? (
              <p className={styles.dropdownEmpty}>{emptyLabel}</p>
            ) : (
              <ul className={styles.dropdownList}>
                {files.map((file) => (
                  <li key={file.id}>
                    <button
                      type="button"
                      className={styles.dropdownItem}
                      role="menuitem"
                      onClick={() => pick(file)}
                    >
                      {file.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
