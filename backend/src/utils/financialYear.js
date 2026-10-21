// India's financial year typically runs Apr-Mar, but Organization.financialYearStartMonth
// (set in Stage 1) makes this configurable per org.
function getFinancialYear(date, startMonth = 4) {
  const d = date ? new Date(date) : new Date();
  const month = d.getMonth() + 1; // 1-12
  const year = d.getFullYear();
  const startYear = month >= startMonth ? year : year - 1;
  const endYear = startYear + 1;
  return `${startYear}-${String(endYear).slice(-2)}`; // e.g. "2026-27"
}

module.exports = { getFinancialYear };
