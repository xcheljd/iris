import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { CollectionsCsvExportDialog } from "@/components/collections-csv-export-dialog";
import { MatchedClientsCsvExportDialog } from "@/components/matched-clients-csv-export-dialog";
import { exportCollectionsCsv } from "@/lib/actions/collections-csv-export";
import { exportMatchedClientsCsv } from "@/lib/actions/matched-clients-csv-export";

// Regression (m10): on a failed export the dialogs kept `data` from the
// previous fetch, so the textarea still showed the earlier scope's rows.

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/actions/collections-csv-export", () => ({ exportCollectionsCsv: vi.fn() }));
vi.mock("@/lib/actions/matched-clients-csv-export", () => ({ exportMatchedClientsCsv: vi.fn() }));

const OLD = { csv: "Name\nOld Scope Row", rowCount: 1, truncated: false };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

async function expectStaleRowsCleared(rerenderClosedThenOpen: () => void) {
  await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue(OLD.csv));
  rerenderClosedThenOpen();
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to build CSV export"));
  expect(screen.getByRole("textbox")).toHaveValue("");
}

describe("CSV export dialogs on a failed fetch", () => {
  it("collections dialog drops the previous rows", async () => {
    vi.mocked(exportCollectionsCsv).mockResolvedValueOnce(OLD as never).mockRejectedValueOnce(new Error("boom"));
    const props = { onOpenChange: vi.fn(), selectedCollection: null, searchQuery: "" };
    const { rerender } = render(<CollectionsCsvExportDialog open {...props} />);
    await expectStaleRowsCleared(() => {
      rerender(<CollectionsCsvExportDialog open={false} {...props} />);
      rerender(<CollectionsCsvExportDialog open {...props} />);
    });
  });

  it("matched-clients dialog drops the previous rows", async () => {
    vi.mocked(exportMatchedClientsCsv).mockResolvedValueOnce(OLD as never).mockRejectedValueOnce(new Error("boom"));
    const matchedProps = { onOpenChange: vi.fn(), owners: [], matchTypes: [], brands: [] };
    const { rerender } = render(<MatchedClientsCsvExportDialog open {...matchedProps} />);
    await expectStaleRowsCleared(() => {
      rerender(<MatchedClientsCsvExportDialog open={false} {...matchedProps} />);
      rerender(<MatchedClientsCsvExportDialog open {...matchedProps} />);
    });
  });
});
