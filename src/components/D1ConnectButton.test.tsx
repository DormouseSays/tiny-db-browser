import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import D1ConnectButton from "./D1ConnectButton";
import type { DatabaseInfo } from "@/lib/schema";

const INFO: DatabaseInfo = {
  id: "uuid-1",
  name: "my-d1",
  tables: ["users"],
  kind: "d1",
};

function setup(connect = vi.fn().mockResolvedValue(INFO)) {
  const onOpen = vi.fn();
  render(
    <D1ConnectButton
      glyph="☁"
      title="Open a Cloudflare D1 database"
      buttonClassName="btn"
      connect={connect}
      onOpen={onOpen}
    />,
  );
  return { connect, onOpen };
}

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Account ID"), "acc");
  await user.type(screen.getByLabelText("Database ID"), "db");
  await user.type(screen.getByLabelText("API token"), "tok");
}

describe("D1ConnectButton", () => {
  it("opens the modal when the menu button is clicked", async () => {
    const user = userEvent.setup();
    setup();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Open a Cloudflare D1 database" }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Account ID")).toBeInTheDocument();
  });

  it("validates that the required fields are present", async () => {
    const user = userEvent.setup();
    const { connect } = setup();
    await user.click(
      screen.getByRole("button", { name: "Open a Cloudflare D1 database" }),
    );
    await user.click(screen.getByRole("button", { name: "Connect" }));

    expect(connect).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Account ID, database ID, and API token are all required/),
    ).toBeInTheDocument();
  });

  it("connects with trimmed values and reports the opened database", async () => {
    const user = userEvent.setup();
    const { connect, onOpen } = setup();
    await user.click(
      screen.getByRole("button", { name: "Open a Cloudflare D1 database" }),
    );
    await fillForm(user);
    await user.type(screen.getByLabelText("Display name (optional)"), "My DB");
    await user.click(screen.getByRole("button", { name: "Connect" }));

    expect(connect).toHaveBeenCalledWith({
      accountId: "acc",
      databaseId: "db",
      apiToken: "tok",
      name: "My DB",
    });
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith(INFO));
    // The modal closes on success.
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("shows the failure and keeps the modal open when connecting fails", async () => {
    const user = userEvent.setup();
    const { onOpen } = setup(
      vi.fn().mockRejectedValue(new Error("Authentication error")),
    );
    await user.click(
      screen.getByRole("button", { name: "Open a Cloudflare D1 database" }),
    );
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "Connect" }));

    expect(await screen.findByText("Authentication error")).toBeInTheDocument();
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes (and clears) on Cancel", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(
      screen.getByRole("button", { name: "Open a Cloudflare D1 database" }),
    );
    await user.type(screen.getByLabelText("Account ID"), "acc");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );

    // Reopening shows an empty form (credentials were cleared).
    await user.click(
      screen.getByRole("button", { name: "Open a Cloudflare D1 database" }),
    );
    expect(screen.getByLabelText("Account ID")).toHaveValue("");
  });
});
