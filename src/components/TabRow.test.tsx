import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TabRow from "./TabRow";

const TABS = ["users", "orders", "products"];

describe("TabRow", () => {
  it("renders a tab for each entry", () => {
    render(<TabRow tabs={TABS} activeTab={0} onSelect={() => {}} onClose={() => {}} />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(TABS.length);
    TABS.forEach((label) => {
      expect(screen.getByRole("tab", { name: label })).toBeInTheDocument();
    });
  });

  it("marks only the active tab as selected", () => {
    render(<TabRow tabs={TABS} activeTab={1} onSelect={() => {}} onClose={() => {}} />);

    expect(screen.getByRole("tab", { name: "users" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getByRole("tab", { name: "orders" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "products" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("calls onSelect with the clicked tab's index", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <TabRow tabs={TABS} activeTab={0} onSelect={onSelect} onClose={() => {}} />,
    );

    await user.click(screen.getByRole("tab", { name: "products" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("calls onClose with the clicked tab's index", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <TabRow tabs={TABS} activeTab={0} onSelect={() => {}} onClose={onClose} />,
    );

    await user.click(screen.getByRole("button", { name: "Close orders" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith(1);
  });

  it("renders an empty tablist when given no tabs", () => {
    render(<TabRow tabs={[]} activeTab={0} onSelect={() => {}} onClose={() => {}} />);

    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
  });
});
