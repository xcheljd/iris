import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProspectImportDialog } from "@/components/prospect-import-dialog";
import { analyzeProspectImport, importProspects } from "@/lib/actions";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/download", () => ({ downloadCsv: vi.fn() }));

vi.mock("@/lib/actions", () => ({
  analyzeProspectImport: vi.fn(),
  importProspects: vi.fn(),
}));

const CSV = "First Name,Last Name,Email\nAldermoor,Test,aldermoor.test@example.com\n";

function csvFile() {
  return new File([CSV], "prospect-report.csv", { type: "text/csv" });
}

function dropzone() {
  return screen.getByRole("button", { name: /click to choose|prospect-report\.csv/ });
}

describe("ProspectImportDialog dropzone", () => {
  const onOpenChangeAction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("takes a dropped file through the same handler as the picker", async () => {
    render(<ProspectImportDialog open onOpenChangeAction={onOpenChangeAction} />);

    fireEvent.dragOver(dropzone());
    expect(dropzone()).toHaveClass("border-primary");

    fireEvent.drop(dropzone(), { dataTransfer: { files: [csvFile()] } });

    expect(dropzone()).not.toHaveClass("border-primary");
    expect((await screen.findAllByText("prospect-report.csv")).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByRole("button", { name: "Analyze" })).toBeEnabled());
  });

  it("is a focusable button that opens the file picker from the keyboard", async () => {
    const user = userEvent.setup();
    render(<ProspectImportDialog open onOpenChangeAction={onOpenChangeAction} />);
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    const click = vi.spyOn(input, "click");

    dropzone().focus();
    expect(dropzone()).toHaveFocus();
    expect(dropzone()).toHaveAttribute("type", "button");
    await user.keyboard("{Enter}");
    expect(click).toHaveBeenCalledTimes(1);
    await user.keyboard(" ");
    expect(click).toHaveBeenCalledTimes(2);
  });

  it("stays open when asked to close mid-import", async () => {
    vi.mocked(analyzeProspectImport).mockResolvedValue({
      newCount: 1,
      alreadyClientCount: 0,
      alreadyProspectCount: 0,
      bannedCount: 0,
      unsubscribedCount: 0,
      deletedCount: 0,
      duplicateCount: 0,
      duplicateCsv: "",
      parseErrors: [],
    } as unknown as Awaited<ReturnType<typeof analyzeProspectImport>>);
    vi.mocked(importProspects).mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<ProspectImportDialog open onOpenChangeAction={onOpenChangeAction} />);

    fireEvent.drop(dropzone(), { dataTransfer: { files: [csvFile()] } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Analyze" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Analyze" }));
    await user.click(await screen.findByRole("button", { name: "Import 1 Prospect" }));
    expect(await screen.findByText("Importing...")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(onOpenChangeAction).not.toHaveBeenCalled();
    expect(screen.getByText("Importing...")).toBeInTheDocument();
  });
});
