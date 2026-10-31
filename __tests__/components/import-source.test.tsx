import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ImportSource } from "@/components/import/import-source";
import { PROMO_FIELDS } from "@/lib/promo-import-parser";

const downloadCsv = vi.fn();
vi.mock("@/lib/download", () => ({ downloadCsv: (...a: unknown[]) => downloadCsv(...a) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
const readWorkbook = vi.fn();
vi.mock("read-excel-file/browser", () => ({ default: (...a: unknown[]) => readWorkbook(...a) }));

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});

const setup = () => {
  const onChange = vi.fn();
  render(<ImportSource id="promo" fields={PROMO_FIELDS} examples={[["Aldermoor", "DRIFTWOOD", "AD-8404", "500", "250", ""]]} onChange={onChange} />);
  const paste = (text: string) => fireEvent.change(screen.getByLabelText("Paste from a spreadsheet"), { target: { value: text } });
  return { onChange, paste };
};

describe("ImportSource", () => {
  it("lists the column order and offers a template", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /download template/i }));
    expect(downloadCsv).toHaveBeenCalledWith(
      "Brand,Collection,Model,MSRP,Sale price,Discount %\nAldermoor,DRIFTWOOD,AD-8404,500,250,\n",
      "promo-template.csv",
    );
  });

  it("reads titled columns in any order and previews rows with their file row numbers", () => {
    const { onChange, paste } = setup();
    paste("Spring sale\nStyle\tRetail\tPromo price\nAD-8404\t500\t250\n");
    expect(screen.getByText(/Matched by the titles in row 2/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Column for Model" })).toHaveTextContent("Column A · Style");
    expect(screen.getByRole("combobox", { name: "Column for Brand" })).toHaveTextContent("Not in file");
    expect(screen.getByRole("cell", { name: "3" })).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith(
      "Source row,Brand,Collection,Model,MSRP,Sale price,Discount %\n3,,,AD-8404,500,250,\n",
    );
  });

  it("holds the import back until a required column is picked", () => {
    const { onChange, paste } = setup();
    paste("Retail\tPromo price\n500\t250\n");
    expect(screen.getByText("Pick the column for Model")).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("reads untitled rows in A–F order", () => {
    const { onChange, paste } = setup();
    paste("Aldermoor\tDRIFTWOOD\tAD-8404\t500\t250\n");
    expect(screen.getByText(/No title row found/)).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith(
      "Source row,Brand,Collection,Model,MSRP,Sale price,Discount %\n1,Aldermoor,DRIFTWOOD,AD-8404,500,250,\n",
    );
  });

  it("lists a workbook's sheets, ticks the titled ones, and imports them together", async () => {
    readWorkbook.mockResolvedValue([
      { sheet: "Vellamy", data: [["Style", "Retail", "Promo Price"], ["VL-525", 895, 600]] },
      { sheet: "Notes", data: [["Call the rep before Friday"]] },
      { sheet: "Empty", data: [] },
      { sheet: "Aldermoor", data: [["Spring"], ["Retail", "Style"], [500, "AD-8404"]] },
    ]);
    const { onChange } = setup();
    const file = new File(["x"], "promos.xlsx");
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });

    expect(await screen.findByText(/This workbook has 3 sheets with data/)).toHaveTextContent("1 empty sheet left out");
    expect(screen.getByRole("checkbox", { name: "Import sheet Vellamy" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Import sheet Notes" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Import sheet Aldermoor" })).toBeChecked();
    expect(onChange).toHaveBeenLastCalledWith(
      "Source sheet,Source row,Brand,Collection,Model,MSRP,Sale price,Discount %\n" +
      "Vellamy,2,,,VL-525,895,600,\nAldermoor,3,,,AD-8404,500,,\n",
    );

    // Switch to the Aldermoor sheet's columns, then untick it.
    fireEvent.click(screen.getByRole("button", { name: "Aldermoor" }));
    expect(screen.getByText("Check the columns — Aldermoor")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Column for Model" })).toHaveTextContent("Column B · Style");
    fireEvent.click(screen.getByRole("checkbox", { name: "Import sheet Aldermoor" }));
    expect(onChange).toHaveBeenLastCalledWith(
      "Source sheet,Source row,Brand,Collection,Model,MSRP,Sale price,Discount %\nVellamy,2,,,VL-525,895,600,\n",
    );
  });

  it("reads a workbook with one sheet of data like a plain file", async () => {
    readWorkbook.mockResolvedValue([
      { sheet: "Promo", data: [["Style", "Retail"], ["VL-525", 895]] },
      { sheet: "Sheet2", data: [] },
    ]);
    const { onChange } = setup();
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [new File(["x"], "p.xlsx")] } });
    expect(await screen.findByText("Check the columns")).toBeInTheDocument();
    expect(screen.queryByText("Sheets to import")).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith("Source row,Brand,Collection,Model,MSRP,Sale price,Discount %\n2,,,VL-525,895,,\n");
  });
});
