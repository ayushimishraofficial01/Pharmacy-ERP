// Phase 10 — shared tabular export formatting (requirements 19, 20).
// toCsv is pure (no DB, no file I/O) so it's unit-testable the same way
// gstCalculationService/saleCalculationService are. toXlsxBuffer needs the
// `xlsx` package (already added to package.json for the purchase import).

function csvEscape(value) {
  const str = String(value ?? '');
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

/** rows: array of plain objects. columns: [{ key, label }] — controls order and header text independent of object key names. */
function toCsv(rows, columns) {
  const header = columns.map((c) => csvEscape(c.label)).join(',');
  const lines = rows.map((row) => columns.map((c) => csvEscape(row[c.key])).join(','));
  return [header, ...lines].join('\n');
}

function toXlsxBuffer(rows, columns, sheetName = 'Sheet1') {
  let XLSX;
  try {
    // eslint-disable-next-line global-require
    XLSX = require('xlsx');
  } catch (err) {
    throw Object.assign(new Error('The "xlsx" package is not installed. Run `npm install` and try again, or use format=csv.'), { statusCode: 500 });
  }
  const plainRows = rows.map((row) => {
    const out = {};
    for (const c of columns) out[c.label] = row[c.key] ?? '';
    return out;
  });
  const sheet = XLSX.utils.json_to_sheet(plainRows, { header: columns.map((c) => c.label) });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { toCsv, toXlsxBuffer, csvEscape };
