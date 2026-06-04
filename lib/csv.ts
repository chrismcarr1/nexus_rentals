import "server-only";

export type CsvCell = string | number | null | undefined;

function neutralizeSpreadsheetFormula(value: string) {
  return /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
}

export function escapeCsvCell(value: CsvCell) {
  const text = typeof value === "number" ? String(value) : neutralizeSpreadsheetFormula(String(value ?? ""));
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildCsv(rows: CsvCell[][], lineEnding = "\n") {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join(lineEnding);
}
