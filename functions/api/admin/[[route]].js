import {
  authorize,
  asString,
  findCategoryBySlug,
  getDescendantIds,
  getRow,
  json,
  nextSiblingSortOrder,
  nullOrString,
  parseId,
  readJson,
  swapSortOrders
} from '../../_shared/helpers.js';

const PROTECTED_SLUGS = ['search', 'about'];

async function createCategory(db, body) {
  const title = asString(body.title);
  if (!title) return json({ error: '分类标题不能为空' }, 400);

  let parentId = null;
  if (body.parentId !== null && body.parentId !== undefined) {
    parentId = parseId(body.parentId);
    if (!parentId) return json({ error: '父分类 ID 无效' }, 400);
    const parent = await getRow(db, 'categories', parentId);
    if (!parent) return json({ error: '父分类不存在' }, 404);
  }

  const slug = nullOrString(body.slug);
  if (slug) {
    const existing = await findCategoryBySlug(db, slug);
    if (existing) return json({ error: 'slug 已存在' }, 409);
  }

  const icon = nullOrString(body.icon);
  const sortOrder = await nextSiblingSortOrder(db, 'categories', 'parent_id', parentId);
  const result = await db.prepare(
    'INSERT INTO categories (parent_id, slug, title, icon, sort_order) VALUES (?, ?, ?, ?, ?)'
  ).bind(parentId, slug, title, icon, sortOrder).run();

  return json({
    category: {
      id: result.meta.last_row_id,
      parent_id: parentId,
      slug,
      title,
      icon,
      sort_order: sortOrder
    }
  }, 201);
}

async function patchCategory(db, id, body) {
  const row = await getRow(db, 'categories', id);
  if (!row) return json({ error: '分类不存在' }, 404);

  const updates = {};

  if (body.title !== undefined) {
    const title = asString(body.title);
    if (!title) return json({ error: '分类标题不能为空' }, 400);
    updates.title = title;
  }

  if (body.icon !== undefined) {
    updates.icon = nullOrString(body.icon);
  }

  if (body.slug !== undefined) {
    const slug = nullOrString(body.slug);
    if (PROTECTED_SLUGS.includes(row.slug) && slug !== row.slug) {
      return json({ error: '不允许修改 search/about 分类的 slug' }, 400);
    }
    if (slug) {
      const existing = await findCategoryBySlug(db, slug);
      if (existing && existing.id !== id) return json({ error: 'slug 已存在' }, 409);
    }
    updates.slug = slug;
  }

  if (body.parentId !== undefined) {
    let newParentId = null;
    if (body.parentId !== null) {
      newParentId = parseId(body.parentId);
      if (!newParentId) return json({ error: '父分类 ID 无效' }, 400);
    }
    if (newParentId !== row.parent_id) {
      if (newParentId === id) return json({ error: '父分类不能是自己' }, 400);
      if (newParentId !== null) {
        const parent = await getRow(db, 'categories', newParentId);
        if (!parent) return json({ error: '父分类不存在' }, 404);
        const descendants = await getDescendantIds(db, id);
        if (descendants.includes(newParentId)) {
          return json({ error: '不能移动到自己的子分类下' }, 400);
        }
      }
      updates.parent_id = newParentId;
      updates.sort_order = await nextSiblingSortOrder(db, 'categories', 'parent_id', newParentId);
    }
  }

  if (Object.keys(updates).length === 0) {
    return json({ error: '没有需要更新的字段' }, 400);
  }

  const sets = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    sets.push(`${key} = ?`);
    values.push(value);
  }
  values.push(id);
  await db.prepare(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();

  return json({ category: { ...row, ...updates } });
}

async function deleteCategory(db, id) {
  const row = await getRow(db, 'categories', id);
  if (!row) return json({ error: '分类不存在' }, 404);
  if (PROTECTED_SLUGS.includes(row.slug)) {
    return json({ error: '不允许删除 search/about 分类' }, 400);
  }

  const descendants = await getDescendantIds(db, id);
  const ids = [id, ...descendants];
  const placeholders = ids.map(() => '?').join(', ');
  const results = await db.batch([
    db.prepare(
      `DELETE FROM search_items WHERE group_id IN (SELECT id FROM search_groups WHERE category_id IN (${placeholders}))`
    ).bind(...ids),
    db.prepare(`DELETE FROM search_groups WHERE category_id IN (${placeholders})`).bind(...ids),
    db.prepare(`DELETE FROM bookmarks WHERE category_id IN (${placeholders})`).bind(...ids),
    db.prepare(`DELETE FROM categories WHERE id IN (${placeholders})`).bind(...ids)
  ]);
  const deleted = results.reduce((sum, result) => sum + (result.meta?.changes || 0), 0);
  return json({ deleted });
}

async function moveCategory(db, id, body) {
  const direction = body.direction;
  if (direction !== 'up' && direction !== 'down') {
    return json({ error: 'direction 必须是 up 或 down' }, 400);
  }

  const row = await getRow(db, 'categories', id);
  if (!row) return json({ error: '分类不存在' }, 404);

  const siblingsResult = row.parent_id === null
    ? await db.prepare('SELECT * FROM categories WHERE parent_id IS NULL ORDER BY sort_order, id').all()
    : await db.prepare('SELECT * FROM categories WHERE parent_id = ? ORDER BY sort_order, id').bind(row.parent_id).all();
  const siblings = siblingsResult.results;
  const index = siblings.findIndex((item) => item.id === id);
  if (index < 0) return json({ error: '分类不存在' }, 404);

  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= siblings.length) {
    return json({ category: row });
  }

  await swapSortOrders(db, 'categories', siblings[index], siblings[target]);
  return json({ category: await getRow(db, 'categories', id) });
}

async function createBookmark(db, body) {
  const categoryId = parseId(body.categoryId);
  if (!categoryId) return json({ error: 'categoryId 无效' }, 400);

  const category = await getRow(db, 'categories', categoryId);
  if (!category) return json({ error: '分类不存在' }, 404);

  const title = asString(body.title);
  const url = asString(body.url);
  if (!title || !url) return json({ error: '标题和 URL 不能为空' }, 400);

  const description = nullOrString(body.description);
  const sortOrder = await nextSiblingSortOrder(db, 'bookmarks', 'category_id', categoryId);
  const result = await db.prepare(
    'INSERT INTO bookmarks (category_id, title, url, description, sort_order) VALUES (?, ?, ?, ?, ?)'
  ).bind(categoryId, title, url, description, sortOrder).run();

  return json({
    bookmark: {
      id: result.meta.last_row_id,
      category_id: categoryId,
      title,
      url,
      description,
      sort_order: sortOrder
    }
  }, 201);
}

async function patchBookmark(db, id, body) {
  const row = await getRow(db, 'bookmarks', id);
  if (!row) return json({ error: '书签不存在' }, 404);

  const updates = {};

  if (body.title !== undefined) {
    const title = asString(body.title);
    if (!title) return json({ error: '书签标题不能为空' }, 400);
    updates.title = title;
  }

  if (body.url !== undefined) {
    const url = asString(body.url);
    if (!url) return json({ error: '书签 URL 不能为空' }, 400);
    updates.url = url;
  }

  if (body.description !== undefined) {
    updates.description = nullOrString(body.description);
  }

  if (body.categoryId !== undefined) {
    const categoryId = parseId(body.categoryId);
    if (!categoryId) return json({ error: 'categoryId 无效' }, 400);
    const category = await getRow(db, 'categories', categoryId);
    if (!category) return json({ error: '分类不存在' }, 404);
    if (categoryId !== row.category_id) {
      updates.category_id = categoryId;
      updates.sort_order = await nextSiblingSortOrder(db, 'bookmarks', 'category_id', categoryId);
    }
  }

  if (Object.keys(updates).length === 0) {
    return json({ error: '没有需要更新的字段' }, 400);
  }

  const sets = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    sets.push(`${key} = ?`);
    values.push(value);
  }
  values.push(id);
  await db.prepare(`UPDATE bookmarks SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();

  return json({ bookmark: { ...row, ...updates } });
}

async function deleteBookmark(db, id) {
  const row = await getRow(db, 'bookmarks', id);
  if (!row) return json({ error: '书签不存在' }, 404);
  await db.prepare('DELETE FROM bookmarks WHERE id = ?').bind(id).run();
  return json({ deleted: true });
}

async function moveBookmark(db, id, body) {
  const direction = body.direction;
  if (direction !== 'up' && direction !== 'down') {
    return json({ error: 'direction 必须是 up 或 down' }, 400);
  }

  const row = await getRow(db, 'bookmarks', id);
  if (!row) return json({ error: '书签不存在' }, 404);

  const siblingsResult = await db.prepare(
    'SELECT * FROM bookmarks WHERE category_id = ? ORDER BY sort_order, id'
  ).bind(row.category_id).all();
  const siblings = siblingsResult.results;
  const index = siblings.findIndex((item) => item.id === id);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= siblings.length) {
    return json({ bookmark: row });
  }

  await swapSortOrders(db, 'bookmarks', siblings[index], siblings[target]);
  return json({ bookmark: await getRow(db, 'bookmarks', id) });
}

async function createSearchGroup(db, body) {
  const categoryId = parseId(body.categoryId);
  if (!categoryId) return json({ error: 'categoryId 无效' }, 400);

  const category = await getRow(db, 'categories', categoryId);
  if (!category) return json({ error: '分类不存在' }, 404);
  if (category.slug !== 'search') {
    return json({ error: '搜索配置只能添加到 search 分类' }, 400);
  }

  const groupName = asString(body.groupName);
  if (!groupName) return json({ error: '搜索分组名称不能为空' }, 400);

  const sortOrder = await nextSiblingSortOrder(db, 'search_groups', 'category_id', categoryId);
  const result = await db.prepare(
    'INSERT INTO search_groups (category_id, group_name, sort_order) VALUES (?, ?, ?)'
  ).bind(categoryId, groupName, sortOrder).run();

  return json({
    searchGroup: {
      id: result.meta.last_row_id,
      category_id: categoryId,
      group_name: groupName,
      sort_order: sortOrder
    }
  }, 201);
}

async function patchSearchGroup(db, id, body) {
  const row = await getRow(db, 'search_groups', id);
  if (!row) return json({ error: '搜索分组不存在' }, 404);

  const updates = {};

  if (body.groupName !== undefined) {
    const groupName = asString(body.groupName);
    if (!groupName) return json({ error: '搜索分组名称不能为空' }, 400);
    updates.group_name = groupName;
  }

  if (body.categoryId !== undefined) {
    const categoryId = parseId(body.categoryId);
    if (!categoryId) return json({ error: 'categoryId 无效' }, 400);
    const category = await getRow(db, 'categories', categoryId);
    if (!category) return json({ error: '分类不存在' }, 404);
    if (category.slug !== 'search') {
      return json({ error: '搜索配置只能属于 search 分类' }, 400);
    }
    if (categoryId !== row.category_id) {
      updates.category_id = categoryId;
      updates.sort_order = await nextSiblingSortOrder(db, 'search_groups', 'category_id', categoryId);
    }
  }

  if (Object.keys(updates).length === 0) {
    return json({ error: '没有需要更新的字段' }, 400);
  }

  const sets = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    sets.push(`${key} = ?`);
    values.push(value);
  }
  values.push(id);
  await db.prepare(`UPDATE search_groups SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();

  return json({ searchGroup: { ...row, ...updates } });
}

async function deleteSearchGroup(db, id) {
  const row = await getRow(db, 'search_groups', id);
  if (!row) return json({ error: '搜索分组不存在' }, 404);
  await db.batch([
    db.prepare('DELETE FROM search_items WHERE group_id = ?').bind(id),
    db.prepare('DELETE FROM search_groups WHERE id = ?').bind(id)
  ]);
  return json({ deleted: true });
}

async function moveSearchGroup(db, id, body) {
  const direction = body.direction;
  if (direction !== 'up' && direction !== 'down') {
    return json({ error: 'direction 必须是 up 或 down' }, 400);
  }

  const row = await getRow(db, 'search_groups', id);
  if (!row) return json({ error: '搜索分组不存在' }, 404);

  const siblingsResult = await db.prepare(
    'SELECT * FROM search_groups WHERE category_id = ? ORDER BY sort_order, id'
  ).bind(row.category_id).all();
  const siblings = siblingsResult.results;
  const index = siblings.findIndex((item) => item.id === id);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= siblings.length) {
    return json({ searchGroup: row });
  }

  await swapSortOrders(db, 'search_groups', siblings[index], siblings[target]);
  return json({ searchGroup: await getRow(db, 'search_groups', id) });
}

async function createSearchItem(db, body) {
  const groupId = parseId(body.groupId);
  if (!groupId) return json({ error: 'groupId 无效' }, 400);

  const group = await getRow(db, 'search_groups', groupId);
  if (!group) return json({ error: '搜索分组不存在' }, 404);

  const itemId = asString(body.itemId);
  const name = asString(body.name);
  const url = asString(body.url);
  if (!itemId) return json({ error: '搜索项 ID 不能为空' }, 400);
  if (!name || !url) return json({ error: '搜索项名称和 URL 不能为空' }, 400);

  const existing = await db.prepare('SELECT id FROM search_items WHERE item_id = ?').bind(itemId).first();
  if (existing) return json({ error: 'item_id 已存在' }, 409);

  const placeholder = nullOrString(body.placeholder);
  const sortOrder = await nextSiblingSortOrder(db, 'search_items', 'group_id', groupId);
  const result = await db.prepare(
    'INSERT INTO search_items (group_id, item_id, name, url, placeholder, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(groupId, itemId, name, url, placeholder, sortOrder).run();

  return json({
    searchItem: {
      id: result.meta.last_row_id,
      group_id: groupId,
      item_id: itemId,
      name,
      url,
      placeholder,
      sort_order: sortOrder
    }
  }, 201);
}

async function patchSearchItem(db, id, body) {
  const row = await getRow(db, 'search_items', id);
  if (!row) return json({ error: '搜索项不存在' }, 404);

  const updates = {};

  if (body.itemId !== undefined) {
    const itemId = asString(body.itemId);
    if (!itemId) return json({ error: '搜索项 ID 不能为空' }, 400);
    const existing = await db.prepare('SELECT id FROM search_items WHERE item_id = ?').bind(itemId).first();
    if (existing && existing.id !== id) return json({ error: 'item_id 已存在' }, 409);
    updates.item_id = itemId;
  }

  if (body.name !== undefined) {
    const name = asString(body.name);
    if (!name) return json({ error: '搜索项名称不能为空' }, 400);
    updates.name = name;
  }

  if (body.url !== undefined) {
    const url = asString(body.url);
    if (!url) return json({ error: '搜索项 URL 不能为空' }, 400);
    updates.url = url;
  }

  if (body.placeholder !== undefined) {
    updates.placeholder = nullOrString(body.placeholder);
  }

  if (body.groupId !== undefined) {
    const groupId = parseId(body.groupId);
    if (!groupId) return json({ error: 'groupId 无效' }, 400);
    const group = await getRow(db, 'search_groups', groupId);
    if (!group) return json({ error: '搜索分组不存在' }, 404);
    if (groupId !== row.group_id) {
      updates.group_id = groupId;
      updates.sort_order = await nextSiblingSortOrder(db, 'search_items', 'group_id', groupId);
    }
  }

  if (Object.keys(updates).length === 0) {
    return json({ error: '没有需要更新的字段' }, 400);
  }

  const sets = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    sets.push(`${key} = ?`);
    values.push(value);
  }
  values.push(id);
  await db.prepare(`UPDATE search_items SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();

  return json({ searchItem: { ...row, ...updates } });
}

async function deleteSearchItem(db, id) {
  const row = await getRow(db, 'search_items', id);
  if (!row) return json({ error: '搜索项不存在' }, 404);
  await db.prepare('DELETE FROM search_items WHERE id = ?').bind(id).run();
  return json({ deleted: true });
}

async function moveSearchItem(db, id, body) {
  const direction = body.direction;
  if (direction !== 'up' && direction !== 'down') {
    return json({ error: 'direction 必须是 up 或 down' }, 400);
  }

  const row = await getRow(db, 'search_items', id);
  if (!row) return json({ error: '搜索项不存在' }, 404);

  const siblingsResult = await db.prepare(
    'SELECT * FROM search_items WHERE group_id = ? ORDER BY sort_order, id'
  ).bind(row.group_id).all();
  const siblings = siblingsResult.results;
  const index = siblings.findIndex((item) => item.id === id);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= siblings.length) {
    return json({ searchItem: row });
  }

  await swapSortOrders(db, 'search_items', siblings[index], siblings[target]);
  return json({ searchItem: await getRow(db, 'search_items', id) });
}

function dispatchCollection(route, handlerMap) {
  const [resource, idPart, action] = route;
  if (resource === 'categories') {
    if (route.length === 1) return handlerMap.createCategory();
    const id = parseId(idPart);
    if (!id) return null;
    if (route.length === 3 && action === 'move') return handlerMap.moveCategory(id);
    if (route.length === 2) return handlerMap.category(id);
  }
  if (resource === 'bookmarks') {
    if (route.length === 1) return handlerMap.createBookmark();
    const id = parseId(idPart);
    if (!id) return null;
    if (route.length === 3 && action === 'move') return handlerMap.moveBookmark(id);
    if (route.length === 2) return handlerMap.bookmark(id);
  }
  if (resource === 'search-groups') {
    if (route.length === 1) return handlerMap.createSearchGroup();
    const id = parseId(idPart);
    if (!id) return null;
    if (route.length === 3 && action === 'move') return handlerMap.moveSearchGroup(id);
    if (route.length === 2) return handlerMap.searchGroup(id);
  }
  if (resource === 'search-items') {
    if (route.length === 1) return handlerMap.createSearchItem();
    const id = parseId(idPart);
    if (!id) return null;
    if (route.length === 3 && action === 'move') return handlerMap.moveSearchItem(id);
    if (route.length === 2) return handlerMap.searchItem(id);
  }
  return null;
}

function buildRouteHandlers(db, body) {
  return {
    createCategory: () => createCategory(db, body),
    moveCategory: (id) => moveCategory(db, id, body),
    category: (id) => patchCategory(db, id, body),
    createBookmark: () => createBookmark(db, body),
    moveBookmark: (id) => moveBookmark(db, id, body),
    bookmark: (id) => patchBookmark(db, id, body),
    createSearchGroup: () => createSearchGroup(db, body),
    moveSearchGroup: (id) => moveSearchGroup(db, id, body),
    searchGroup: (id) => patchSearchGroup(db, id, body),
    createSearchItem: () => createSearchItem(db, body),
    moveSearchItem: (id) => moveSearchItem(db, id, body),
    searchItem: (id) => patchSearchItem(db, id, body)
  };
}

async function handleAuthorized(request, env, handler) {
  const auth = await authorize(request, env);
  if (!auth.authorized) return json({ error: auth.error }, auth.status);
  try {
    return await handler();
  } catch (error) {
    console.error('管理接口错误:', error);
    return json({ error: '操作失败' }, 500);
  }
}

export async function onRequestGet({ request, env, params }) {
  const route = (params.route || []).map(String);
  if (route.length === 1 && route[0] === 'check') {
    return handleAuthorized(request, env, () => json({ ok: true }));
  }
  if (route.length === 1 && route[0] === 'data') {
    return handleAuthorized(request, env, async () => {
      const [categories, bookmarks, groups, items] = await env.DB.batch([
        env.DB.prepare('SELECT * FROM categories ORDER BY sort_order, id'),
        env.DB.prepare('SELECT * FROM bookmarks ORDER BY sort_order, id'),
        env.DB.prepare('SELECT * FROM search_groups ORDER BY sort_order, id'),
        env.DB.prepare('SELECT * FROM search_items ORDER BY sort_order, id')
      ]);
      return json({
        categories: categories.results || [],
        bookmarks: bookmarks.results || [],
        searchGroups: groups.results || [],
        searchItems: items.results || []
      }, 200, { 'Cache-Control': 'no-store' });
    });
  }
  return json({ error: '接口不存在' }, 404);
}

export async function onRequestPost({ request, env, params }) {
  const route = (params.route || []).map(String);
  const body = (await readJson(request)) || {};
  const handler = dispatchCollection(route, {
    createCategory: () => createCategory(env.DB, body),
    moveCategory: (id) => moveCategory(env.DB, id, body),
    category: () => null,
    createBookmark: () => createBookmark(env.DB, body),
    moveBookmark: (id) => moveBookmark(env.DB, id, body),
    bookmark: () => null,
    createSearchGroup: () => createSearchGroup(env.DB, body),
    moveSearchGroup: (id) => moveSearchGroup(env.DB, id, body),
    searchGroup: () => null,
    createSearchItem: () => createSearchItem(env.DB, body),
    moveSearchItem: (id) => moveSearchItem(env.DB, id, body),
    searchItem: () => null
  });
  if (!handler) return json({ error: '接口不存在' }, 404);
  return handleAuthorized(request, env, () => handler);
}

export async function onRequestPatch({ request, env, params }) {
  const route = (params.route || []).map(String);
  const body = (await readJson(request)) || {};
  const handler = dispatchCollection(route, {
    createCategory: () => null,
    moveCategory: () => null,
    category: (id) => patchCategory(env.DB, id, body),
    createBookmark: () => null,
    moveBookmark: () => null,
    bookmark: (id) => patchBookmark(env.DB, id, body),
    createSearchGroup: () => null,
    moveSearchGroup: () => null,
    searchGroup: (id) => patchSearchGroup(env.DB, id, body),
    createSearchItem: () => null,
    moveSearchItem: () => null,
    searchItem: (id) => patchSearchItem(env.DB, id, body)
  });
  if (!handler) return json({ error: '接口不存在' }, 404);
  return handleAuthorized(request, env, () => handler);
}

export async function onRequestDelete({ request, env, params }) {
  const route = (params.route || []).map(String);
  const body = (await readJson(request)) || {};
  const handler = dispatchCollection(route, {
    createCategory: () => null,
    moveCategory: () => null,
    category: (id) => deleteCategory(env.DB, id),
    createBookmark: () => null,
    moveBookmark: () => null,
    bookmark: (id) => deleteBookmark(env.DB, id),
    createSearchGroup: () => null,
    moveSearchGroup: () => null,
    searchGroup: (id) => deleteSearchGroup(env.DB, id),
    createSearchItem: () => null,
    moveSearchItem: () => null,
    searchItem: (id) => deleteSearchItem(env.DB, id)
  });
  if (!handler) return json({ error: '接口不存在' }, 404);
  return handleAuthorized(request, env, () => handler);
}
