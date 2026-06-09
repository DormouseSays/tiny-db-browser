import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RowActions from "./RowActions";

describe("RowActions", () => {
  it("renders a labelled button per action", () => {
    render(
      <RowActions
        actions={[
          { glyph: "💾", label: "Save changes", onClick: () => {} },
          { glyph: "✕", label: "Cancel", onClick: () => {} },
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: "Save changes" })).toHaveTextContent(
      "💾",
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("calls the matching handler when a button is clicked", async () => {
    const user = userEvent.setup();
    const save = vi.fn();
    const cancel = vi.fn();
    render(
      <RowActions
        actions={[
          { glyph: "💾", label: "Save changes", onClick: save },
          { glyph: "✕", label: "Cancel", onClick: cancel },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
  });
});
