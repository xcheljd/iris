import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MergeClientDialog } from "@/components/merge/merge-client-dialog";

const mockPush = vi.fn();
const toastError = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: mockPush, refresh: vi.fn() })),
}));

vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => toastError(...args), success: vi.fn() },
}));

vi.mock("@/lib/actions", () => ({ mergeClients: vi.fn() }));

vi.mock("@/components/client-provider", () => ({
  useClient: () => ({ id: "current", firstName: "Cara", lastName: "Current", notes: null }),
}));

async function openAndType(text: string) {
  render(
    <MergeClientDialog>
      <button>Merge</button>
    </MergeClientDialog>,
  );
  await userEvent.click(screen.getByText("Merge"));
  await userEvent.type(screen.getByPlaceholderText("Search by name, phone, or email…"), text);
  // 300ms search debounce
  await act(async () => {
    await new Promise((r) => setTimeout(r, 350));
  });
}

describe("MergeClientDialog search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders hits from the /api/search envelope, excluding the current client", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            hits: [
              { id: "c1", firstName: "Alice", lastName: "Anderson", phone: "555-0001" },
              { id: "current", firstName: "Cara", lastName: "Current", phone: "555-0009" },
            ],
            prospects: [],
            lists: [],
            recentlyViewed: [],
            isPhoneticFallback: false,
          }),
      } as Response),
    ) as unknown as typeof fetch;

    await openAndType("Ali");

    expect(await screen.findByText("Alice Anderson")).toBeInTheDocument();
    expect(screen.queryByText("Cara Current")).not.toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("shows the empty state when the envelope has no hits", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ hits: [], prospects: [], lists: [], recentlyViewed: [] }),
      } as Response),
    ) as unknown as typeof fetch;

    await openAndType("Ali");

    expect(screen.getByText("No clients found")).toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("toasts when the search responds with a non-2xx status", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: "boom" }),
      } as Response),
    ) as unknown as typeof fetch;

    await openAndType("Ali");

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Search failed. Please try again."),
    );
  });

  it("toasts and does not crash when the search request rejects", async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error("network"))) as unknown as typeof fetch;

    await openAndType("Ali");

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Search failed. Please try again."),
    );
    expect(screen.getByText("No clients found")).toBeInTheDocument();
  });

  // Regression: a search response that lands after the query was shortened
  // below 2 characters filled the list under the short query.
  it("does not show a late response once the query is shorter than 2 characters", async () => {
    let respond!: (r: Response) => void;
    global.fetch = vi.fn(
      () => new Promise<Response>((r) => { respond = r; }),
    ) as unknown as typeof fetch;

    await openAndType("Ali"); // debounce fired; the fetch is in flight
    const input = screen.getByPlaceholderText("Search by name, phone, or email…");
    await userEvent.type(input, "{backspace}{backspace}");
    expect(input).toHaveValue("A");

    await act(async () => {
      respond({
        ok: true,
        json: () =>
          Promise.resolve({
            hits: [{ id: "c1", firstName: "Alice", lastName: "Anderson", phone: "555-0001" }],
          }),
      } as Response);
    });

    expect(screen.queryByText("Alice Anderson")).not.toBeInTheDocument();
  });

  it("starts from an empty search each time the dialog is opened", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            hits: [{ id: "c1", firstName: "Alice", lastName: "Anderson", phone: "555-0001" }],
          }),
      } as Response),
    ) as unknown as typeof fetch;

    await openAndType("Ali");
    expect(await screen.findByText("Alice Anderson")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByText("Merge"));

    expect(await screen.findByPlaceholderText("Search by name, phone, or email…")).toHaveValue("");
    expect(screen.queryByText("Alice Anderson")).not.toBeInTheDocument();
  });

  it("toasts and stays on the search step when the candidate fetch 404s", async () => {
    global.fetch = vi.fn((url: string) => {
      if (String(url).startsWith("/api/search")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              hits: [{ id: "c1", firstName: "Alice", lastName: "Anderson", phone: "555-0001" }],
            }),
        } as Response);
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response);
    }) as unknown as typeof fetch;

    await openAndType("Ali");
    await userEvent.click(await screen.findByText("Alice Anderson"));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Could not load client details"),
    );
    // Still on the search step — no resolution panel.
    expect(screen.getByPlaceholderText("Search by name, phone, or email…")).toBeInTheDocument();
  });
});
