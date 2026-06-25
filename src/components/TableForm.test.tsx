import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TableForm from "./TableForm";
import * as api from "@/lib/api";
import type { ColumnDefinition } from "@/lib/schema";

vi.mock("@/lib/api");

const createTable = vi.mocked(api.createTable);
const rebuildTable = vi.mocked(api.rebuildTable);
const getTableSchema = vi.mocked(api.getTableSchema);

beforeEach(() => {
  vi.clearAllMocks();
  createTable.mockResolvedValue([]);
  rebuildTable.mockResolvedValue([]);
});

function renderForm(props: Partial<React.ComponentProps<typeof TableForm>> = {}) {
  const onSaved = vi.fn();
  const onCancel = vi.fn();
  render(
    <TableForm
      databaseId="db"
      existingTables={[]}
      onSaved={onSaved}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onSaved, onCancel };
}

const SCHEMA: ColumnDefinition[] = [
  { name: "id", type: "INTEGER", primaryKey: true, notNull: true },
  { name: "title", type: "TEXT", primaryKey: false, notNull: false },
];

describe("TableForm (create mode)", () => {
  it("starts as an empty new-table form with one column", () => {
    renderForm();
    expect(screen.getByText("New table")).toBeInTheDocument();
    expect(screen.getByLabelText("Table name")).toHaveValue("");
    expect(screen.getAllByLabelText("Column name")).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Create table" }),
    ).toBeInTheDocument();
  });

  it("adds and removes columns (the last column can't be removed)", async () => {
    const user = userEvent.setup();
    renderForm();

    // A lone column can't be removed.
    expect(screen.getByRole("button", { name: "Remove column" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "+ Add column" }));
    expect(screen.getAllByLabelText("Column name")).toHaveLength(2);

    const removeButtons = screen.getAllByRole("button", { name: "Remove column" });
    expect(removeButtons[0]).toBeEnabled();
    await user.click(removeButtons[0]);
    expect(screen.getAllByLabelText("Column name")).toHaveLength(1);
  });

  it("creates a table with the cleaned name and named columns", async () => {
    const user = userEvent.setup();
    createTable.mockResolvedValue(["widgets"]);
    const { onSaved } = renderForm();

    await user.type(screen.getByLabelText("Table name"), "  widgets  ");
    await user.type(screen.getByLabelText("Column name"), "id");
    await user.click(screen.getByLabelText("Primary key"));
    await user.click(screen.getByRole("button", { name: "Create table" }));

    expect(createTable).toHaveBeenCalledWith("db", "widgets", [
      expect.objectContaining({
        name: "id",
        type: "TEXT",
        primaryKey: true,
        notNull: false,
      }),
    ]);
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("widgets"));
  });

  it("drops unnamed columns before creating", async () => {
    const user = userEvent.setup();
    createTable.mockResolvedValue(["t"]);
    renderForm();

    await user.type(screen.getByLabelText("Table name"), "t");
    await user.click(screen.getByRole("button", { name: "+ Add column" }));
    const names = screen.getAllByLabelText("Column name");
    await user.type(names[0], "kept");
    // Leave the second column blank.
    await user.click(screen.getByRole("button", { name: "Create table" }));

    expect(createTable).toHaveBeenCalledWith("db", "t", [
      expect.objectContaining({ name: "kept" }),
    ]);
  });

  it("carries the chosen column type and not-null flag into the new table", async () => {
    const user = userEvent.setup();
    createTable.mockResolvedValue(["t"]);
    renderForm();

    await user.type(screen.getByLabelText("Table name"), "t");
    await user.type(screen.getByLabelText("Column name"), "count");
    await user.selectOptions(screen.getByLabelText("Column type"), "INTEGER");
    await user.click(screen.getByLabelText("Not null"));
    await user.click(screen.getByRole("button", { name: "Create table" }));

    expect(createTable).toHaveBeenCalledWith("db", "t", [
      expect.objectContaining({
        name: "count",
        type: "INTEGER",
        notNull: true,
        primaryKey: false,
      }),
    ]);
  });

  it("requires a table name", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("Column name"), "id");
    await user.click(screen.getByRole("button", { name: "Create table" }));

    expect(screen.getByText("Enter a table name.")).toBeInTheDocument();
    expect(createTable).not.toHaveBeenCalled();
  });

  it("rejects a name that collides with an existing table (case-insensitive)", async () => {
    const user = userEvent.setup();
    renderForm({ existingTables: ["Users"] });
    await user.type(screen.getByLabelText("Table name"), "users");
    await user.type(screen.getByLabelText("Column name"), "id");
    await user.click(screen.getByRole("button", { name: "Create table" }));

    expect(
      screen.getByText(/A table named .*users.* already exists/),
    ).toBeInTheDocument();
    expect(createTable).not.toHaveBeenCalled();
  });

  it("requires at least one named column", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("Table name"), "t");
    await user.click(screen.getByRole("button", { name: "Create table" }));

    expect(screen.getByText("Add at least one named column.")).toBeInTheDocument();
    expect(createTable).not.toHaveBeenCalled();
  });

  it("rejects duplicate column names (case-insensitive)", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("Table name"), "t");
    await user.click(screen.getByRole("button", { name: "+ Add column" }));
    const names = screen.getAllByLabelText("Column name");
    await user.type(names[0], "Name");
    await user.type(names[1], "name");
    await user.click(screen.getByRole("button", { name: "Create table" }));

    expect(screen.getByText("Column names must be unique.")).toBeInTheDocument();
    expect(createTable).not.toHaveBeenCalled();
  });

  it("disables the not-null checkbox when a column is a primary key", async () => {
    const user = userEvent.setup();
    renderForm();
    expect(screen.getByLabelText("Not null")).toBeEnabled();
    await user.click(screen.getByLabelText("Primary key"));
    expect(screen.getByLabelText("Not null")).toBeDisabled();
  });

  it("shows the server error and doesn't call onSaved when creation fails", async () => {
    const user = userEvent.setup();
    createTable.mockRejectedValue(new Error("disk full"));
    const { onSaved } = renderForm();

    await user.type(screen.getByLabelText("Table name"), "t");
    await user.type(screen.getByLabelText("Column name"), "id");
    await user.click(screen.getByRole("button", { name: "Create table" }));

    expect(await screen.findByText("disk full")).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderForm();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe("TableForm (edit mode)", () => {
  it("loads the existing schema into the form", async () => {
    getTableSchema.mockResolvedValue({ columns: SCHEMA, rowCount: 0 });
    renderForm({ table: "posts" });

    // Loading placeholder until the schema arrives.
    expect(screen.getByText("Loading…")).toBeInTheDocument();

    expect(await screen.findByText("Edit table")).toBeInTheDocument();
    expect(getTableSchema).toHaveBeenCalledWith("db", "posts");
    expect(screen.getByLabelText("Table name")).toHaveValue("posts");
    const names = screen.getAllByLabelText("Column name") as HTMLInputElement[];
    expect(names.map((i) => i.value)).toEqual(["id", "title"]);
  });

  it("shows an error when the schema fails to load", async () => {
    getTableSchema.mockRejectedValue(new Error("no such table"));
    renderForm({ table: "ghost" });
    expect(await screen.findByText("no such table")).toBeInTheDocument();
  });

  it("rebuilds the table directly when no data would be lost", async () => {
    getTableSchema.mockResolvedValue({ columns: SCHEMA, rowCount: 0 });
    rebuildTable.mockResolvedValue(["posts"]);
    const user = userEvent.setup();
    const { onSaved } = renderForm({ table: "posts", existingTables: ["posts"] });

    await screen.findByText("Edit table");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(rebuildTable).toHaveBeenCalledWith(
      "db",
      "posts",
      "posts",
      expect.arrayContaining([expect.objectContaining({ name: "id" })]),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("posts"));
  });

  it("shows the server error when rebuilding fails", async () => {
    getTableSchema.mockResolvedValue({ columns: SCHEMA, rowCount: 0 });
    rebuildTable.mockRejectedValue(new Error("constraint failed"));
    const user = userEvent.setup();
    const { onSaved } = renderForm({ table: "posts", existingTables: ["posts"] });

    await screen.findByText("Edit table");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("constraint failed")).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("warns before dropping a populated column and saves on confirmation", async () => {
    getTableSchema.mockResolvedValue({ columns: SCHEMA, rowCount: 3 });
    rebuildTable.mockResolvedValue(["posts"]);
    const user = userEvent.setup();
    const { onSaved } = renderForm({ table: "posts", existingTables: ["posts"] });

    await screen.findByText("Edit table");
    // Remove the second column ("title"), which holds data in 3 rows.
    const removeButtons = screen.getAllByRole("button", { name: "Remove column" });
    await user.click(removeButtons[1]);
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    // The save is held back behind a data-loss warning.
    expect(screen.getByText("⚠ Data loss warning")).toBeInTheDocument();
    expect(
      screen.getByText(/permanently delete the data in column .*title.* across 3 rows/),
    ).toBeInTheDocument();
    expect(rebuildTable).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Save anyway" }));
    expect(rebuildTable).toHaveBeenCalledWith(
      "db",
      "posts",
      "posts",
      expect.not.arrayContaining([expect.objectContaining({ name: "title" })]),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("posts"));
  });
});
