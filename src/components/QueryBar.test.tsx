import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import QueryBar from "./QueryBar";

describe("QueryBar", () => {
  it("shows the current SQL and reports edits", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <QueryBar value="SELECT 1" onChange={onChange} onRun={() => {}} />,
    );

    const input = screen.getByRole("textbox", { name: "SQL query" });
    expect(input).toHaveValue("SELECT 1");

    await user.type(input, "!");
    expect(onChange).toHaveBeenCalledWith("SELECT 1!");
  });

  it("runs the query when Run is clicked", async () => {
    const user = userEvent.setup();
    const onRun = vi.fn();
    render(<QueryBar value="SELECT 1" onChange={() => {}} onRun={onRun} />);

    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(onRun).toHaveBeenCalledTimes(1);
  });
});
