// Minimal RFC 4180 CSV reading and writing, shared by imports, exports and
// error reports (client and server).

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  const input = text.replace(/^﻿/, "")

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ",") {
      row.push(field)
      field = ""
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else {
      field += ch
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  // Drop blank lines.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""))
}

// Cells starting with = + - @ are treated as formulas by spreadsheet apps;
// prefix them so exported data can't execute. Plain numbers such as phone
// numbers ("+977 98...") and negative values are left alone.
function neutralise(value: string) {
  if (/^[=+\-@\t\r]/.test(value) && !/^[+-]?[\d\s-]+(\.\d+)?$/.test(value)) return `'${value}`
  return value
}

export function csvCell(value: unknown, { raw = false } = {}): string {
  if (value === null || value === undefined) return ""
  const plain = value instanceof Date ? value.toISOString().slice(0, 10) : String(value)
  const text = raw ? plain : neutralise(plain)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

// `raw` skips formula neutralising: for re-serialising data that is parsed
// again (import chunks), not for files opened in spreadsheets.
export function csvLine(values: unknown[], options: { raw?: boolean } = {}) {
  return values.map((v) => csvCell(v, options)).join(",") + "\r\n"
}

// Header keys compared loosely: "First Name", "first_name" and "FIRST-NAME" match.
export function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/[\s-]+/g, "_")
}
