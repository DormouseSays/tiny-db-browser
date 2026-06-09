"use client";

import { useState, type FormEvent } from "react";
import Modal from "./Modal";
import type { DatabaseInfo } from "@/lib/schema";
import type { D1Connection } from "@/lib/api";
import styles from "./D1ConnectButton.module.css";

type D1ConnectButtonProps = {
  glyph: string;
  /** Accessible label and tooltip for the trigger button. */
  title: string;
  /** Class for the trigger button, so it matches the surrounding menu bar. */
  buttonClassName: string;
  /** Open the connection on the server (held until the tab closes). */
  connect: (connection: D1Connection) => Promise<DatabaseInfo>;
  /** Called with the opened database once the connection succeeds. */
  onOpen: (info: DatabaseInfo) => void;
};

/**
 * A menu-bar button that opens a modal to enter Cloudflare D1 connection
 * details, then hands the opened database to `onOpen`. Credentials live only in
 * this form until submitted and are cleared whenever the modal closes.
 */
export default function D1ConnectButton({
  glyph,
  title,
  buttonClassName,
  connect,
  onOpen,
}: D1ConnectButtonProps) {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [databaseId, setDatabaseId] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function close() {
    setOpen(false);
    // Don't leave the token sitting in component state after the modal closes.
    setAccountId("");
    setDatabaseId("");
    setApiToken("");
    setName("");
    setError(null);
    setSubmitting(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (!accountId.trim() || !databaseId.trim() || !apiToken.trim()) {
      setError("Account ID, database ID, and API token are all required.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const info = await connect({
        accountId: accountId.trim(),
        databaseId: databaseId.trim(),
        apiToken: apiToken.trim(),
        name: name.trim(),
      });
      onOpen(info);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={buttonClassName}
        title={title}
        aria-label={title}
        onClick={() => setOpen(true)}
      >
        {glyph}
      </button>
      {open && (
        <Modal title="Open Cloudflare D1 database" onClose={close}>
          <form className={styles.form} onSubmit={submit}>
            <label className={styles.field}>
              <span className={styles.label}>Account ID</span>
              <input
                className={styles.input}
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
                placeholder="e.g. a1b2c3d4e5f6…"
                spellCheck={false}
                autoFocus
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Database ID</span>
              <input
                className={styles.input}
                value={databaseId}
                onChange={(event) => setDatabaseId(event.target.value)}
                placeholder="e.g. 00000000-0000-0000-0000-000000000000"
                spellCheck={false}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>API token</span>
              <input
                className={styles.input}
                type="password"
                value={apiToken}
                onChange={(event) => setApiToken(event.target.value)}
                placeholder="Token with D1 read/write access"
                spellCheck={false}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Display name (optional)</span>
              <input
                className={styles.input}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Defaults to the database ID"
                spellCheck={false}
              />
            </label>

            {error && <p className={styles.error}>{error}</p>}

            <div className={styles.footer}>
              <button type="button" className={styles.cancel} onClick={close}>
                Cancel
              </button>
              <button
                type="submit"
                className={styles.connect}
                disabled={submitting}
              >
                {submitting ? "Connecting…" : "Connect"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
