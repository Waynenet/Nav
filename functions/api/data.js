import { json } from '../_shared/helpers.js';
import { tablesToPageData } from '../_shared/nav-data.js';

export async function onRequestGet({ env }) {
  try {
    const [categories, bookmarks, groups, items] = await env.DB.batch([
      env.DB.prepare('SELECT * FROM categories ORDER BY sort_order, id'),
      env.DB.prepare('SELECT * FROM bookmarks ORDER BY sort_order, id'),
      env.DB.prepare('SELECT * FROM search_groups ORDER BY sort_order, id'),
      env.DB.prepare('SELECT * FROM search_items ORDER BY sort_order, id')
    ]);

    const pageData = tablesToPageData({
      categories: categories.results || [],
      bookmarks: bookmarks.results || [],
      searchGroups: groups.results || [],
      searchItems: items.results || []
    });

    return json({ pageData }, 200, { 'Cache-Control': 'no-store' });
  } catch (error) {
    console.error('读取 D1 数据失败:', error);
    return json({ error: '读取数据失败' }, 500);
  }
}
