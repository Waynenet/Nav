// pageData <-> D1 表数据的双向转换，供 Pages Functions 和 Node 同步脚本共用。

const bySort = (a, b) =>
  (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.id ?? 0) - (b.id ?? 0);

function groupRows(rows, key) {
  const map = new Map();
  for (const row of rows || []) {
    const list = map.get(row[key]) || [];
    list.push(row);
    map.set(row[key], list);
  }
  for (const list of map.values()) list.sort(bySort);
  return map;
}

export function pageDataToTables(pageData) {
  const categories = [];
  const bookmarks = [];
  const searchGroups = [];
  const searchItems = [];
  let categoryId = 0;
  let groupId = 0;
  let itemId = 0;
  let bookmarkId = 0;

  const addBookmarks = (targetId, items) => {
    (items || []).forEach((item, index) => {
      bookmarkId += 1;
      bookmarks.push({
        id: bookmarkId,
        category_id: targetId,
        title: String(item.title ?? ''),
        url: String(item.url ?? ''),
        description: item.description ?? null,
        sort_order: index
      });
    });
  };

  (pageData || []).forEach((node, index) => {
    categoryId += 1;
    const parentId = categoryId;
    categories.push({
      id: parentId,
      parent_id: null,
      slug: node.id ?? null,
      title: String(node.title ?? ''),
      icon: node.icon ?? null,
      sort_order: index
    });

    if (Array.isArray(node.searchConfig)) {
      node.searchConfig.forEach((group, groupIndex) => {
        groupId += 1;
        searchGroups.push({
          id: groupId,
          category_id: parentId,
          group_name: String(group.groupName ?? ''),
          sort_order: groupIndex
        });
        (group.items || []).forEach((item, itemIndex) => {
          itemId += 1;
          searchItems.push({
            id: itemId,
            group_id: groupId,
            item_id: String(item.id ?? ''),
            name: String(item.name ?? ''),
            url: String(item.url ?? ''),
            placeholder: item.placeholder ?? null,
            sort_order: itemIndex
          });
        });
      });
    }

    if (Array.isArray(node.children)) {
      node.children.forEach((child, childIndex) => {
        categoryId += 1;
        categories.push({
          id: categoryId,
          parent_id: parentId,
          slug: null,
          title: String(child.title ?? ''),
          icon: child.icon ?? null,
          sort_order: childIndex
        });
        addBookmarks(categoryId, child.items);
      });
    } else if (Array.isArray(node.items)) {
      addBookmarks(parentId, node.items);
    }
  });

  return { categories, bookmarks, searchGroups, searchItems };
}

export function tablesToPageData(tables) {
  const categories = tables.categories || [];
  const bookmarks = tables.bookmarks || [];
  const searchGroups = tables.searchGroups || [];
  const searchItems = tables.searchItems || [];

  const bookmarksByCategory = groupRows(bookmarks, 'category_id');
  const groupsByCategory = groupRows(searchGroups, 'category_id');
  const itemsByGroup = groupRows(searchItems, 'group_id');

  const buildBookmark = (row) => {
    const item = { title: row.title, url: row.url };
    if (row.description != null && row.description !== '') {
      item.description = row.description;
    }
    return item;
  };

  const buildNode = (row, extra) => {
    const node = {};
    if (row.slug) node.id = row.slug;
    node.title = row.title;
    if (row.icon) node.icon = row.icon;
    if (extra) Object.assign(node, extra);
    return node;
  };

  const buildSearchConfig = (categoryId) => {
    const groups = groupsByCategory.get(categoryId) || [];
    return groups.map((group) => ({
      groupName: group.group_name,
      items: (itemsByGroup.get(group.id) || []).map((item) => {
        const searchItem = {
          id: item.item_id,
          name: item.name,
          url: item.url
        };
        if (item.placeholder != null && item.placeholder !== '') {
          searchItem.placeholder = item.placeholder;
        }
        return searchItem;
      })
    }));
  };

  const buildBookmarkItems = (categoryId) =>
    (bookmarksByCategory.get(categoryId) || []).map(buildBookmark);

  const buildChildren = (parentId) =>
    categories
      .filter((row) => row.parent_id === parentId)
      .sort(bySort)
      .map((child) => {
        const childNode = { title: child.title };
        if (child.icon) childNode.icon = child.icon;
        childNode.items = buildBookmarkItems(child.id);
        return childNode;
      });

  return categories
    .filter((row) => row.parent_id === null || row.parent_id === undefined)
    .sort(bySort)
    .map((row) => {
      const children = buildChildren(row.id);
      const searchConfig = buildSearchConfig(row.id);
      const bookmarksOfCategory = buildBookmarkItems(row.id);
      const extra = {};

      if (searchConfig.length > 0) {
        extra.searchConfig = searchConfig;
      } else if (children.length > 0) {
        extra.children = children;
      } else if (bookmarksOfCategory.length > 0) {
        extra.items = bookmarksOfCategory;
      }

      return buildNode(row, extra);
    });
}
