import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TableList from "./TableList";

const TABLES = ["users", "orders"];

function noopProps() {
  return {
    tables: TABLES,
    selectedTable: "users" as string | null,
    editorTable: undefined as string | null | undefined,
    onSelect: vi.fn(),
    onEdit: vi.fn(),
    onAddTable: vi.fn(),
  };
}

describe("TableList", () => {
  it("renders a button per table and a header count", () => {
    render(<TableList {...noopProps()} />);
    expect(screen.getByText("Tables (2)")).toBeInTheDocument();
    TABLES.forEach((t) =>
      expect(screen.getByRole("button", { name: t })).toBeInTheDocument(),
    );
  });

  it("shows an empty message when there are no tables", () => {
    render(<TableList {...noopProps()} tables={[]} selectedTable={null} />);
    expect(screen.getByText("No tables")).toBeInTheDocument();
  });

  it("calls onSelect / onEdit / onAddTable", async () => {
    const user = userEvent.setup();
    const props = noopProps();
    render(<TableList {...props} />);

    await user.click(screen.getByRole("button", { name: "orders" }));
    expect(props.onSelect).toHaveBeenCalledWith("orders");

    await user.click(screen.getByRole("button", { name: "Edit users" }));
    expect(props.onEdit).toHaveBeenCalledWith("users");

    await user.click(screen.getByRole("button", { name: "+ Add table" }));
    expect(props.onAddTable).toHaveBeenCalledTimes(1);
  });
});
