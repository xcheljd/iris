/** Save a Blob to the user's Downloads via a temporary link (the browser picks the folder). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Save CSV text as a UTF-8 .csv file. */
export function downloadCsv(csv: string, filename: string): void {
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), filename);
}
