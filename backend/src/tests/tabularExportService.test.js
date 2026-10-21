const { test } = require('node:test');
const assert = require('node:assert/strict');
const { toCsv, csvEscape } = require('../services/tabularExportService');

test('csvEscape: leaves a plain value unchanged', () => {
  assert.equal(csvEscape('hello'), 'hello');
});

test('csvEscape: quotes a value containing a comma', () => {
  assert.equal(csvEscape('Smith, John'), '"Smith, John"');
});

test('csvEscape: quotes and doubles internal quotes', () => {
  assert.equal(csvEscape('He said "hi"'), '"He said ""hi"""');
});

test('csvEscape: quotes a value containing a newline', () => {
  assert.equal(csvEscape('line1\nline2'), '"line1\nline2"');
});

test('csvEscape: null/undefined become an empty string, not the literal text "null"', () => {
  assert.equal(csvEscape(null), '');
  assert.equal(csvEscape(undefined), '');
});

test('toCsv: builds a header row from column labels and one line per row', () => {
  const rows = [{ id: 1, name: 'Paracetamol' }, { id: 2, name: 'Ibuprofen' }];
  const columns = [{ key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }];
  assert.equal(toCsv(rows, columns), 'ID,Name\n1,Paracetamol\n2,Ibuprofen');
});

test('toCsv: an empty row set still produces just the header', () => {
  const columns = [{ key: 'id', label: 'ID' }];
  assert.equal(toCsv([], columns), 'ID');
});

test('toCsv: escapes values that need it within a full row', () => {
  const rows = [{ name: 'Smith, John', note: 'said "ok"' }];
  const columns = [{ key: 'name', label: 'Name' }, { key: 'note', label: 'Note' }];
  assert.equal(toCsv(rows, columns), 'Name,Note\n"Smith, John","said ""ok"""');
});
