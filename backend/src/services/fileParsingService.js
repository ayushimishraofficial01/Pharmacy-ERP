// Phase 10 — tabular file parsing for purchase import (requirement 12).
// Uses the `xlsx` (SheetJS) package for BOTH .xlsx and .csv — one
// battle-tested parser instead of a hand-rolled CSV parser with its own
// quoting/escaping edge cases. `xlsx` is a new dependency added to
// package.json; it is NOT part of the original merged codebase's installed
// node_modules, so `npm install` must be run before this works. Required
// lazily (inside the function, not at module load) so the rest of the app
// still boots even if this specific dependency hasn't been installed yet —
// only purchase-import requests fail, with a clear message, not the whole server.
function parseTabularFile(buffer, filename) {
  let XLSX;
  try {
    // eslint-disable-next-line global-require
    XLSX = require('xlsx');
  } catch (err) {
    throw Object.assign(new Error('The "xlsx" package is not installed. Run `npm install` (it was added to package.json for Phase 10 purchase import) and try again.'), { statusCode: 500 });
  }

  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  } catch (err) {
    throw Object.assign(new Error(`Could not parse "${filename}" as a CSV/Excel file: ${err.message}`), { statusCode: 400 });
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw Object.assign(new Error(`"${filename}" has no sheets`), { statusCode: 400 });
  const sheet = workbook.Sheets[sheetName];

  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  if (rows.length === 0) throw Object.assign(new Error(`"${filename}" has a header row but no data rows`), { statusCode: 400 });

  const headers = Object.keys(rows[0]);
  return { headers, rows };
}

module.exports = { parseTabularFile };
