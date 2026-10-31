import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, renderHook, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { useFetchOnOpen } from "@/hooks/use-fetch-on-open";
import { EmailRecipientsDialog } from "@/components/email-recipients-dialog";
import { TransferClientDialog } from "@/components/transfer-client-dialog";
import { getEmailRecipients } from "@/lib/actions/email-recipients";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/actions/email-recipients", () => ({ getEmailRecipients: vi.fn() }));
vi.mock("@/lib/actions", () => ({ transferClient: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("useFetchOnOpen", () => {
  it("ignores a reply that arrives after the dialog closed", async () => {
    let resolve!: (v: string) => void;
    const fetcher = vi.fn(() => new Promise<string>((r) => { resolve = r; }));
    const { result, rerender } = renderHook(({ open }) => useFetchOnOpen(open, "k", fetcher, vi.fn()), {
      initialProps: { open: true },
    });
    expect(result.current.loading).toBe(true);
    rerender({ open: false });
    await act(async () => { resolve("late"); });
    expect(result.current.data).toBeNull();
  });

  it("ignores an older request's reply once the key changed", async () => {
    const resolvers: Record<string, (v: string) => void> = {};
    const { result, rerender } = renderHook(
      ({ k }) => useFetchOnOpen(true, k, () => new Promise<string>((r) => { resolvers[k] = r; }), vi.fn()),
      { initialProps: { k: "a" } },
    );
    rerender({ k: "b" });
    await act(async () => { resolvers.b("B"); });
    await act(async () => { resolvers.a("A"); });
    expect(result.current).toEqual({ data: "B", loading: false });
  });

  it("clears the previous data and reports when a request fails", async () => {
    const onError = vi.fn();
    const fetcher = vi.fn().mockResolvedValueOnce("first").mockRejectedValueOnce(new Error("boom"));
    const { result, rerender } = renderHook(({ k }) => useFetchOnOpen(true, k, fetcher, onError), {
      initialProps: { k: "a" },
    });
    await waitFor(() => expect(result.current.data).toBe("first"));
    rerender({ k: "b" });
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(result.current).toEqual({ data: null, loading: false });
  });
});

describe("EmailRecipientsDialog", () => {
  const RESULT = { clients: { emails: ["a@x.com"], count: 1 }, prospects: { emails: [], count: 0 } };

  it("does not refetch when the parent passes an equal new filters object", async () => {
    vi.mocked(getEmailRecipients).mockResolvedValue(RESULT as never);
    const { rerender } = render(<EmailRecipientsDialog open onOpenChange={vi.fn()} filters={{ q: "a" }} />);
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue("a@x.com"));
    rerender(<EmailRecipientsDialog open onOpenChange={vi.fn()} filters={{ q: "a" }} />);
    expect(getEmailRecipients).toHaveBeenCalledTimes(1);
  });

  it("does not show the previous filter's emails after a failed refetch", async () => {
    vi.mocked(getEmailRecipients).mockResolvedValueOnce(RESULT as never).mockRejectedValueOnce(new Error("boom"));
    const { rerender } = render(<EmailRecipientsDialog open onOpenChange={vi.fn()} filters={{ q: "a" }} />);
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue("a@x.com"));
    rerender(<EmailRecipientsDialog open onOpenChange={vi.fn()} filters={{ q: "b" }} />);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to load email recipients"));
    expect(screen.getByRole("textbox")).toHaveValue("");
  });
});

describe("TransferClientDialog", () => {
  it("lists active associates when opened", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([
        { id: "e1", firstName: "Jordan", lastName: null, active: true },
        { id: "e2", firstName: "Gone", lastName: null, active: false },
      ]), { status: 200 }),
    );
    const user = userEvent.setup();
    render(
      <TransferClientDialog clientId="c1" clientName="Jane Doe" currentEmployeeId={null}>
        <button>Transfer</button>
      </TransferClientDialog>,
    );
    await user.click(screen.getByRole("button", { name: "Transfer" }));
    expect(global.fetch).toHaveBeenCalledWith("/api/employees");
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
  });

  it("reports a failed employee load", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("nope", { status: 500 }));
    const user = userEvent.setup();
    render(
      <TransferClientDialog clientId="c1" clientName="Jane Doe" currentEmployeeId={null}>
        <button>Transfer</button>
      </TransferClientDialog>,
    );
    await user.click(screen.getByRole("button", { name: "Transfer" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to load employee list"));
  });
});
