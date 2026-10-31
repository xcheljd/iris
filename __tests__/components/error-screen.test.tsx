import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorScreen } from "@/components/error-screen";

vi.mock("@/components/topbar", () => ({ Topbar: ({ title }: { title?: string }) => <header>{title}</header> }));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("ErrorScreen", () => {
  it("never shows the raw error message", () => {
    const err = Object.assign(new Error("SqliteError: no such table: secrets"), { digest: "abc123" });
    render(<ErrorScreen error={err} retry={vi.fn()} title="Clients" />);
    expect(screen.getByText("This page couldn't load")).toBeInTheDocument();
    expect(screen.getByText("Try again, or go back to the Dashboard.")).toBeInTheDocument();
    expect(screen.queryByText(/SqliteError/)).not.toBeInTheDocument();
  });

  it("shows the reference code only when Next provides a digest", () => {
    const { rerender } = render(<ErrorScreen error={Object.assign(new Error("x"), { digest: "abc123" })} retry={vi.fn()} />);
    expect(screen.getByText("abc123")).toBeInTheDocument();
    rerender(<ErrorScreen error={new Error("x")} retry={vi.fn()} />);
    expect(screen.queryByText(/Reference code/)).not.toBeInTheDocument();
  });

  it("offers Try again (re-fetch) and Go to Dashboard", async () => {
    const retry = vi.fn();
    render(<ErrorScreen error={new Error("x")} retry={retry} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /try again/i }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: /go to dashboard/i })).toHaveAttribute("href", "/");
  });

  it("keeps the top bar inside the app, drops it outside", () => {
    const { rerender } = render(<ErrorScreen error={new Error("x")} retry={vi.fn()} title="Clients" />);
    expect(screen.getByRole("banner")).toHaveTextContent("Clients");
    rerender(<ErrorScreen error={new Error("x")} retry={vi.fn()} withTopbar={false} />);
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
  });
});

function errorFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return errorFiles(p);
    return name === "error.tsx" ? [p] : [];
  });
}

describe("every error.tsx", () => {
  const files = errorFiles(join(process.cwd(), "app"));
  it("finds them", () => expect(files.length).toBeGreaterThanOrEqual(5));
  it.each(files)("%s uses ErrorScreen and never prints error.message", (f) => {
    const src = readFileSync(f, "utf8");
    expect(src).toContain("<ErrorScreen");
    expect(src).not.toContain("error.message");
  });
});
