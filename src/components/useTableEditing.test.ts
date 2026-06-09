import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTableEditing } from "./useTableEditing";
import type { QueryResult } from "@/lib/schema";
import * as api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  updateRow: vi.fn().mockResolvedValue(undefined),
  insertRow: vi.fn().mockResolvedValue(undefined),
  deleteRow: vi.fn().mockResolvedValue(undefined),
}));

const RESULT: QueryResult = {
  columns: ["id", "name"],
  rows: [
    [1, "Ada"],
    [2, "Grace"],
  ],
};

const reload = vi.fn();

function setup() {
  return renderHook(() =>
    useTableEditing({
      databaseId: "db1",
      table: "users",
      result: RESULT,
      rowIds: [1, 2],
      reload,
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useTableEditing", () => {
  it("startEdit seeds the per-cell string values from the row", () => {
    const { result } = setup();
    act(() => result.current.startEdit(0, 1));
    expect(result.current.edit).toEqual({
      rowIndex: 0,
      colIndex: 1,
      values: ["1", "Ada"],
    });
  });

  it("saveEdit sends the edited values (empty → null) and reloads", async () => {
    const { result } = setup();
    act(() => result.current.startEdit(0, 1));
    act(() => result.current.changeCell(1, "Ada Lovelace"));
    await act(async () => {
      await result.current.saveEdit();
    });

    expect(api.updateRow).toHaveBeenCalledWith("db1", "users", 1, {
      id: "1",
      name: "Ada Lovelace",
    });
    expect(reload).toHaveBeenCalledWith("users");
    expect(result.current.edit).toBeNull();
  });

  it("confirmDelete deletes the pending row by rowid and reloads", async () => {
    const { result } = setup();
    act(() => result.current.startDelete(1));
    await act(async () => {
      await result.current.confirmDelete();
    });

    expect(api.deleteRow).toHaveBeenCalledWith("db1", "users", 2);
    expect(reload).toHaveBeenCalledWith("users");
    expect(result.current.pendingDelete).toBeNull();
  });

  it("saveInsert sends the new row's values and reloads", async () => {
    const { result } = setup();
    act(() => result.current.startInsert());
    expect(result.current.insertValues).toEqual(["", ""]);
    act(() => result.current.changeInsertCell(0, "3"));
    act(() => result.current.changeInsertCell(1, "Eve"));
    await act(async () => {
      await result.current.saveInsert();
    });

    expect(api.insertRow).toHaveBeenCalledWith("db1", "users", {
      id: "3",
      name: "Eve",
    });
    expect(reload).toHaveBeenCalledWith("users");
  });

  it("surfaces a failed mutation as an error and flashes the row", async () => {
    vi.mocked(api.updateRow).mockRejectedValueOnce(new Error("boom"));
    const { result } = setup();
    act(() => result.current.startEdit(0, 0));
    await act(async () => {
      await result.current.saveEdit();
    });

    expect(result.current.error).toBe("boom");
    expect(result.current.flashing).toBe(true);
    expect(reload).not.toHaveBeenCalled();
  });

  it("only one action is active at a time", () => {
    const { result } = setup();
    act(() => result.current.startEdit(0, 0));
    act(() => result.current.startDelete(1));
    expect(result.current.edit).toBeNull();
    expect(result.current.pendingDelete).toBe(1);

    act(() => result.current.startInsert());
    expect(result.current.pendingDelete).toBeNull();
    expect(result.current.insertValues).toEqual(["", ""]);
  });

  it("reset clears every in-progress action", () => {
    const { result } = setup();
    act(() => result.current.startEdit(0, 0));
    act(() => result.current.reset());
    expect(result.current.edit).toBeNull();
    expect(result.current.insertValues).toBeNull();
    expect(result.current.pendingDelete).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
