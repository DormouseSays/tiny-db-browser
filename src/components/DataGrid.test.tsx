import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DataGrid from "./DataGrid";
import type { TableEditing } from "./useTableEditing";
import type { QueryResult } from "@/lib/schema";

/** A fully-stubbed editing controller; override the fields a test cares about. */
function makeEditing(overrides: Partial<TableEditing> = {}): TableEditing {
  return {
    edit: null,
    insertValues: null,
    pendingDelete: null,
    error: null,
    flashing: false,
    reset: vi.fn(),
    endFlash: vi.fn(),
    startEdit: vi.fn(),
    changeCell: vi.fn(),
    saveEdit: vi.fn(),
    cancelEdit: vi.fn(),
    startInsert: vi.fn(),
    changeInsertCell: vi.fn(),
    saveInsert: vi.fn(),
    cancelInsert: vi.fn(),
    startDelete: vi.fn(),
    confirmDelete: vi.fn(),
    cancelDelete: vi.fn(),
    ...overrides,
  };
}

const RESULT: QueryResult = {
  columns: ["id", "name"],
  rows: [
    [1, "Ada"],
    [2, null],
  ],
};

describe("DataGrid", () => {
  it("shows the placeholder when no result is loaded", () => {
    render(
      <DataGrid
        result={null}
        error={null}
        busy={false}
        editableTable={null}
        editing={makeEditing()}
      />,
    );
    expect(
      screen.getByText("Select a table to view its data."),
    ).toBeInTheDocument();
  });

  it("shows a loading placeholder while busy", () => {
    render(
      <DataGrid
        result={null}
        error={null}
        busy
        editableTable={null}
        editing={makeEditing()}
      />,
    );
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders a query error instead of the grid", () => {
    render(
      <DataGrid
        result={null}
        error="no such table: nope"
        busy={false}
        editableTable={null}
        editing={makeEditing()}
      />,
    );
    expect(screen.getByText("no such table: nope")).toBeInTheDocument();
  });

  it("renders headers, numbered rows, and formats NULL cells", () => {
    render(
      <DataGrid
        result={RESULT}
        error={null}
        busy={false}
        editableTable="users"
        editing={makeEditing()}
      />,
    );
    expect(screen.getByRole("columnheader", { name: "name" })).toBeInTheDocument();
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("NULL")).toBeInTheDocument();
    // One header row plus one row per result row.
    expect(screen.getAllByRole("row")).toHaveLength(RESULT.rows.length + 1);
  });

  it("starts an edit when an editable cell is clicked", async () => {
    const user = userEvent.setup();
    const editing = makeEditing();
    render(
      <DataGrid
        result={RESULT}
        error={null}
        busy={false}
        editableTable="users"
        editing={editing}
      />,
    );
    await user.click(screen.getByText("Ada"));
    expect(editing.startEdit).toHaveBeenCalledWith(0, 1);
  });

  it("does not make cells editable for read-only results", async () => {
    const user = userEvent.setup();
    const editing = makeEditing();
    render(
      <DataGrid
        result={RESULT}
        error={null}
        busy={false}
        editableTable={null}
        editing={editing}
      />,
    );
    await user.click(screen.getByText("Ada"));
    expect(editing.startEdit).not.toHaveBeenCalled();
    // No per-row delete trigger on read-only results.
    expect(
      screen.queryByRole("button", { name: "Delete row" }),
    ).not.toBeInTheDocument();
  });

  it("arms delete confirmation from the row's delete trigger", async () => {
    const user = userEvent.setup();
    const editing = makeEditing();
    render(
      <DataGrid
        result={RESULT}
        error={null}
        busy={false}
        editableTable="users"
        editing={editing}
      />,
    );
    await user.click(screen.getAllByRole("button", { name: "Delete row" })[1]);
    expect(editing.startDelete).toHaveBeenCalledWith(1);
  });

  it("shows confirm/cancel actions for the row pending deletion", async () => {
    const user = userEvent.setup();
    const editing = makeEditing({ pendingDelete: 0 });
    render(
      <DataGrid
        result={RESULT}
        error={null}
        busy={false}
        editableTable="users"
        editing={editing}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));
    expect(editing.confirmDelete).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Cancel delete" }));
    expect(editing.cancelDelete).toHaveBeenCalledTimes(1);
  });

  it("renders inputs and save/cancel for the row being edited", async () => {
    const user = userEvent.setup();
    const editing = makeEditing({
      edit: { rowIndex: 0, colIndex: 1, values: ["1", "Ada"] },
    });
    render(
      <DataGrid
        result={RESULT}
        error={null}
        busy={false}
        editableTable="users"
        editing={editing}
      />,
    );
    const nameInput = screen.getByRole("textbox", { name: "name value" });
    expect(nameInput).toHaveValue("Ada");

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(editing.saveEdit).toHaveBeenCalledTimes(1);
  });

  it("renders the insert row and the inline error", () => {
    const editing = makeEditing({
      insertValues: ["", ""],
      error: "UNIQUE constraint failed",
    });
    render(
      <DataGrid
        result={RESULT}
        error={null}
        busy={false}
        editableTable="users"
        editing={editing}
      />,
    );
    expect(
      screen.getByRole("textbox", { name: "New name value" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save new row" })).toBeInTheDocument();
    expect(screen.getByText("UNIQUE constraint failed")).toBeInTheDocument();
    // The "+ Insert row" trigger is hidden while inserting.
    expect(
      screen.queryByRole("button", { name: "+ Insert row" }),
    ).not.toBeInTheDocument();
  });

  it("starts an insert from the + Insert row button", async () => {
    const user = userEvent.setup();
    const editing = makeEditing();
    render(
      <DataGrid
        result={RESULT}
        error={null}
        busy={false}
        editableTable="users"
        editing={editing}
      />,
    );
    await user.click(screen.getByRole("button", { name: "+ Insert row" }));
    expect(editing.startInsert).toHaveBeenCalledTimes(1);
  });
});
