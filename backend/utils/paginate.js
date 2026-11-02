// ?page=1&limit=20 -> { page, limit, skip }. Bad or missing values fall back to safe defaults.
function parsePagination(query, { defaultLimit = 20, maxLimit = 50 } = {}) {
  const toInt = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : NaN; };
  let page = toInt(query.page);
  let limit = toInt(query.limit);
  if (!(page >= 1)) page = 1;
  if (!(limit >= 1)) limit = defaultLimit;
  limit = Math.min(limit, maxLimit);
  return { page, limit, skip: (page - 1) * limit };
}

function pageResult(items, total, { page, limit }) {
  return { items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}

module.exports = { parsePagination, pageResult };
