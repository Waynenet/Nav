export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }
  });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function authorize(request, env) {
  if (!env.ADMIN_TOKEN) {
    return { authorized: false, status: 503, error: 'ADMIN_TOKEN 未配置' };
  }

  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) {
    return { authorized: false, status: 401, error: '缺少 Bearer Token' };
  }

  const token = header.slice(7).trim();
  if (!token) {
    return { authorized: false, status: 401, error: '缺少 Bearer Token' };
  }

  const digest = async (value) => {
    const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
    return new Uint8Array(buffer);
  };

  const [left, right] = await Promise.all([digest(token), digest(env.ADMIN_TOKEN)]);
  if (left.length !== right.length) {
    return { authorized: false, status: 401, error: 'Token 无效' };
  }

  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];

  return diff === 0
    ? { authorized: true }
    : { authorized: false, status: 401, error: 'Token 无效' };
}

export function parseId(value) {
  if (!/^\d+$/.test(String(value))) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function nullOrString(value) {
  if (value === undefined || value === null) return null;
  const text = asString(value);
  return text === '' ? null : text;
}

export async function getRow(db, table, id) {
  const result = await db.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
  return result || null;
}

export async function findCategoryBySlug(db, slug) {
  if (!slug) return null;
  const result = await db
    .prepare('SELECT id, slug FROM categories WHERE slug = ?')
    .bind(slug)
    .first();
  return result || null;
}

export async function nextSiblingSortOrder(db, table, column, value) {
  const sql = value === null || value === undefined
    ? `SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM ${table} WHERE ${column} IS NULL`
    : `SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM ${table} WHERE ${column} = ?`;
  const statement = value === null || value === undefined
    ? db.prepare(sql)
    : db.prepare(sql).bind(value);
  const result = await statement.first();
  return (result.max_order ?? -1) + 1;
}

export async function getDescendantIds(db, id) {
  const result = await db.prepare(`
    WITH RECURSIVE tree(id) AS (
      SELECT id FROM categories WHERE id = ?
      UNION ALL
      SELECT c.id FROM categories c JOIN tree t ON c.parent_id = t.id
    )
    SELECT id FROM tree WHERE id != ?
  `).bind(id, id).all();
  return result.results.map((row) => row.id);
}

export async function swapSortOrders(db, table, first, second) {
  const firstOrder = first.sort_order ?? 0;
  const secondOrder = second.sort_order ?? 0;
  await db.batch([
    db.prepare(`UPDATE ${table} SET sort_order = ? WHERE id = ?`)
      .bind(secondOrder, first.id),
    db.prepare(`UPDATE ${table} SET sort_order = ? WHERE id = ?`)
      .bind(firstOrder, second.id)
  ]);
}
