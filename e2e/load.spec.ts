import { test, expect } from "@playwright/test";
import {
  FIXTURE_DB,
  FIXTURE_TABLE,
  FIXTURE_ROWS,
} from "./global-setup";

/**
 * Smoke test: the site loads and a database can be opened end to end. Uploading
 * the seeded fixture exercises the whole stack — the upload route, opening the
 * file with better-sqlite3 on the server, listing its tables, and reading a page
 * of rows back into the grid.
 */
test.describe("tiny-db-browser", () => {
  test("loads the page with nothing open", async ({ page }) => {
    await page.goto("/");

    // The empty state is shown until a database is opened.
    await expect(page.getByText("No database open")).toBeVisible();
    await expect(page.getByText("Ready", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Upload SQLite database" }),
    ).toBeVisible();
  });

  test("uploads a database and shows its tables and rows", async ({ page }) => {
    await page.goto("/");

    // Drive the hidden file input directly — that's what the ⬆ button triggers.
    await page.locator('input[type="file"]').setInputFiles(FIXTURE_DB);

    // A tab named after the uploaded file appears and becomes active.
    const tab = page.getByRole("tab", { name: "sample.db" });
    await expect(tab).toBeVisible();
    await expect(tab).toHaveAttribute("aria-selected", "true");

    // The sidebar lists the single seeded table.
    await expect(page.getByText("Tables (1)")).toBeVisible();
    await expect(
      page.getByRole("button", { name: FIXTURE_TABLE, exact: true }),
    ).toBeVisible();
    await expect(page.getByText("1 table")).toBeVisible();

    // The grid renders the seeded columns and every seeded row's data.
    const grid = page.getByRole("table");
    for (const column of ["id", "name", "quantity"]) {
      await expect(
        grid.getByRole("columnheader", { name: column, exact: true }),
      ).toBeVisible();
    }
    for (const row of FIXTURE_ROWS) {
      await expect(grid.getByRole("cell", { name: row.name })).toBeVisible();
      await expect(
        grid.getByRole("cell", { name: String(row.quantity), exact: true }),
      ).toBeVisible();
    }
  });
});
