export function parseCsvRecords(content: string): Array<Record<string, string>> {
  const rows = splitCsvRows(content);
  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0].map((header) => header.trim());
  const records: Array<Record<string, string>> = [];

  for (const values of rows.slice(1)) {
    const row: Record<string, string> = {};
    let nonEmptyCount = 0;
    for (let index = 0; index < headers.length; index += 1) {
      const header = headers[index];
      const value = (values[index] ?? '').trim();
      row[header] = value;
      if (value) nonEmptyCount += 1;
    }
    if (nonEmptyCount > 0) {
      records.push(row);
    }
  }

  return records;
}

function splitCsvRows(content: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      row.push(field);
      field = '';
      if (row.some((value) => value.trim().length > 0)) {
        rows.push(row);
      }
      row = [];
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }
      continue;
    }

    if (!inQuotes && char === ',') {
      row.push(field);
      field = '';
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((value) => value.trim().length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}
