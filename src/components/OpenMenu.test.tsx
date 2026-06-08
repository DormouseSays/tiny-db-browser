import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OpenMenu from "./OpenMenu";

const FILES = [
  { id: "sales", name: "sales.db" },
  { id: "people", name: "people.sqlite" },
];

function setup(
  overrides: Partial<Parameters<typeof OpenMenu>[0]> = {},
) {
  const props = {
    glyph: "🗄",
    title: "Open a preset database on disk",
    emptyLabel: "No preset databases configured",
    buttonClassName: "btn",
    load: vi.fn().mockResolvedValue(FILES),
    onOpen: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
  render(<OpenMenu {...props} />);
  return props;
}

describe("OpenMenu", () => {
  it("loads and lists files when the menu is opened", async () => {
    const user = userEvent.setup();
    const props = setup();

    await user.click(screen.getByRole("button", { name: props.title }));

    expect(props.load).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByRole("menuitem", { name: "sales.db" })).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("menuitem", { name: "people.sqlite" }),
    ).toBeInTheDocument();
  });

  it("calls onOpen with the chosen file and closes the menu", async () => {
    const user = userEvent.setup();
    const props = setup();

    await user.click(screen.getByRole("button", { name: props.title }));
    await user.click(await screen.findByRole("menuitem", { name: "sales.db" }));

    expect(props.onOpen).toHaveBeenCalledWith({ id: "sales", name: "sales.db" });
    await waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
    );
  });

  it("shows the empty label when no files are returned", async () => {
    const user = userEvent.setup();
    const props = setup({ load: vi.fn().mockResolvedValue([]) });

    await user.click(screen.getByRole("button", { name: props.title }));

    expect(
      await screen.findByText("No preset databases configured"),
    ).toBeInTheDocument();
  });

  it("reports a load failure via onError and stays closed", async () => {
    const user = userEvent.setup();
    const props = setup({
      load: vi.fn().mockRejectedValue(new Error("boom")),
    });

    await user.click(screen.getByRole("button", { name: props.title }));

    await waitFor(() => expect(props.onError).toHaveBeenCalledWith("boom"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("toggles closed when the trigger is clicked again", async () => {
    const user = userEvent.setup();
    const props = setup();
    const trigger = screen.getByRole("button", { name: props.title });

    await user.click(trigger);
    expect(await screen.findByRole("menu")).toBeInTheDocument();

    await user.click(trigger);
    await waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
    );
  });
});
