const state = {
    token: sessionStorage.getItem('adminToken') || '',
    tables: null,
    selectedId: null,
    expandedGroups: new Set()
};

const bySort = (a, b) => (a.sort_order - b.sort_order) || (a.id - b.id);

const $ = (selector) => document.querySelector(selector);

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function toast(message, type = 'ok') {
    const el = $('#toast');
    el.textContent = message;
    el.className = `toast ${type}`;
    el.hidden = false;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        el.hidden = true;
    }, 2600);
}

function showLogin(message = '') {
    $('#login-view').hidden = false;
    $('#admin-view').hidden = true;
    $('#logout-btn').hidden = true;
    $('#conn-status').textContent = '';
    const errorBox = $('#login-error');
    if (message) {
        errorBox.textContent = message;
        errorBox.hidden = false;
    } else {
        errorBox.textContent = '';
        errorBox.hidden = true;
    }
}

function showAdmin() {
    $('#login-view').hidden = true;
    $('#admin-view').hidden = false;
    $('#logout-btn').hidden = false;
    $('#conn-status').textContent = '已连接';
}

function logout() {
    state.token = '';
    state.tables = null;
    state.selectedId = null;
    sessionStorage.removeItem('adminToken');
    showLogin();
}

async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    const response = await fetch(path, { ...options, headers });
    let body = null;
    try {
        body = await response.json();
    } catch {
        body = null;
    }
    if (response.status === 401) {
        logout();
        throw new Error((body && body.error) || '登录已过期，请重新登录');
    }
    if (!response.ok) {
        throw new Error((body && body.error) || `请求失败 (${response.status})`);
    }
    return body;
}

async function loadTables() {
    const tables = await api('api/admin/data');
    state.tables = {
        categories: tables.categories || [],
        bookmarks: tables.bookmarks || [],
        searchGroups: tables.searchGroups || [],
        searchItems: tables.searchItems || []
    };
    render();
}

function findCategory(id) {
    return (state.tables && state.tables.categories.find((item) => item.id === id)) || null;
}

function findBookmark(id) {
    return (state.tables && state.tables.bookmarks.find((item) => item.id === id)) || null;
}

function findGroup(id) {
    return (state.tables && state.tables.searchGroups.find((item) => item.id === id)) || null;
}

function findItem(id) {
    return (state.tables && state.tables.searchItems.find((item) => item.id === id)) || null;
}

function iconButton(action, id, icon, title, direction = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'icon-btn';
    button.title = title;
    button.dataset.action = action;
    button.dataset.id = String(id);
    if (direction) button.dataset.direction = direction;
    button.innerHTML = `<i class="${icon}"></i>`;
    return button;
}

function render() {
    renderTree();
    renderDetail();
}

function renderTree() {
    const container = $('#category-tree');
    container.innerHTML = '';
    const topCategories = state.tables.categories
        .filter((item) => item.parent_id === null || item.parent_id === undefined)
        .sort(bySort);
    topCategories.forEach((category) => container.appendChild(renderTreeItem(category)));
}

function renderTreeItem(category) {
    const wrapper = document.createElement('div');
    wrapper.className = 'tree-item';

    const row = document.createElement('div');
    const selected = findCategory(state.selectedId);
    const isActive = state.selectedId === category.id || (selected && selected.parent_id === category.id);
    row.className = `tree-row${isActive ? ' selected' : ''}`;

    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'tree-label';
    label.dataset.action = 'select-category';
    label.dataset.id = String(category.id);
    label.innerHTML = `<i class="${escapeHtml(category.icon || 'ti ti-folder')}"></i>`;
    label.appendChild(document.createTextNode(category.title));
    row.appendChild(label);

    wrapper.appendChild(row);
    return wrapper;
}

function renderDetail() {
    const detail = $('#category-detail');
    if (!state.selectedId) {
        detail.innerHTML = '<div class="empty-state"><i class="ti ti-folder-open"></i><p>请选择一个分类</p><button class="btn primary" data-action="create-top-category" type="button"><i class="ti ti-plus"></i> 新增顶层分类</button></div>';
        return;
    }

    const category = findCategory(state.selectedId);
    if (!category) {
        detail.innerHTML = '<div class="empty-state"><p>分类不存在</p></div>';
        return;
    }

    const isSearch = category.slug === 'search';
    const isAbout = category.slug === 'about';
    const isProtected = isSearch || isAbout;
    const children = state.tables.categories
        .filter((item) => item.parent_id === category.id)
        .sort(bySort);
    const bookmarks = state.tables.bookmarks
        .filter((item) => item.category_id === category.id)
        .sort(bySort);
    const groups = state.tables.searchGroups
        .filter((item) => item.category_id === category.id)
        .sort(bySort);

    const slugReadonly = isProtected;
    const slugInput = `<input id="category-slug" value="${escapeHtml(category.slug || '')}" ${slugReadonly ? 'disabled' : ''} placeholder="顶层节点 ID（可留空）">`;

    const backHtml = category.parent_id
        ? `<button class="btn" data-action="select-category" data-id="${category.parent_id}" type="button"><i class="ti ti-arrow-left"></i> 返回上级</button>`
        : '';

    const actionsHtml = `
        <button class="btn" data-action="move-category" data-id="${category.id}" data-direction="up" type="button"><i class="ti ti-arrow-up"></i> 上移</button>
        <button class="btn" data-action="move-category" data-id="${category.id}" data-direction="down" type="button"><i class="ti ti-arrow-down"></i> 下移</button>
        ${isProtected ? '' : `<button class="btn danger" data-action="delete-category" data-id="${category.id}" type="button"><i class="ti ti-trash"></i> 删除</button>`}
    `;

    const childrenHtml = isProtected
        ? ''
        : `
        <div class="list-panel child-section">
            <div class="list-head">
                <h3>子分类 (${children.length})</h3>
                <button class="btn small" data-action="add-child" data-id="${category.id}" type="button"><i class="ti ti-plus"></i> 新增子分类</button>
            </div>
            ${children.length > 0
                ? `<div class="child-list">
                    ${children.map((child) => `
                        <div class="child-row">
                            <button class="child-open" data-action="select-category" data-id="${child.id}" type="button">${escapeHtml(child.title)}</button>
                            <button class="btn small" data-action="rename-category" data-id="${child.id}" type="button"><i class="ti ti-edit"></i> 重命名</button>
                            <button class="icon-btn" data-action="move-category" data-id="${child.id}" data-direction="up" title="上移" type="button"><i class="ti ti-arrow-up"></i></button>
                            <button class="icon-btn" data-action="move-category" data-id="${child.id}" data-direction="down" title="下移" type="button"><i class="ti ti-arrow-down"></i></button>
                            <button class="btn small danger" data-action="delete-category" data-id="${child.id}" type="button">删除</button>
                        </div>`).join('')}
                </div>`
                : '<p class="muted">暂无子分类</p>'}
        </div>`;

    const bookmarksHtml = (!isSearch && !isAbout && children.length === 0)
        ? bookmarksEditorHtml(bookmarks)
        : '';
    const searchHtml = isSearch ? searchEditorHtml(groups) : '';
    const aboutHtml = isAbout
        ? '<p class="muted">此分类仅作为“关于本站”锚点，不包含书签或搜索配置。</p>'
        : '';

    detail.innerHTML = `
        <div class="detail-head">
            <div>
                <h2>${escapeHtml(category.title)}</h2>
                <span class="muted">分类 ID: ${category.id}</span>
            </div>
            <div class="detail-actions">
                ${backHtml}
                ${actionsHtml}
                <button class="btn" data-action="create-top-category" type="button"><i class="ti ti-plus"></i> 新增顶层分类</button>
            </div>
        </div>
        <div class="category-info">
            <div class="form-grid">
                <div class="field"><label>标题</label><input id="category-title" value="${escapeHtml(category.title)}"></div>
                <div class="field"><label>图标 class</label><input id="category-icon" value="${escapeHtml(category.icon || '')}" placeholder="如 ti ti-star"></div>
                <div class="field"><label>slug</label>${slugInput}</div>
            </div>
            <div><button class="btn primary" data-action="save-category" type="button"><i class="ti ti-device-floppy"></i> 保存分类信息</button></div>
        </div>
        ${childrenHtml}
        ${searchHtml}
        ${bookmarksHtml}
        ${aboutHtml}
    `;
}

function bookmarksEditorHtml(bookmarks) {
    const items = bookmarks.map((bookmark) => `
        <div class="item-grid">
            <input class="bm-title" data-id="${bookmark.id}" value="${escapeHtml(bookmark.title)}">
            <input class="bm-url" data-id="${bookmark.id}" value="${escapeHtml(bookmark.url)}">
            <textarea class="bm-desc" data-id="${bookmark.id}">${escapeHtml(bookmark.description || '')}</textarea>
            <button class="btn small" data-action="save-bookmark" data-id="${bookmark.id}" type="button">保存</button>
            <button class="icon-btn" data-action="move-bookmark" data-id="${bookmark.id}" data-direction="up" title="上移" type="button">↑</button>
            <button class="icon-btn" data-action="move-bookmark" data-id="${bookmark.id}" data-direction="down" title="下移" type="button">↓</button>
            <button class="btn small danger" data-action="delete-bookmark" data-id="${bookmark.id}" type="button">删除</button>
        </div>`).join('');

    const addForm = `
        <div class="add-form">
            <div class="form-grid">
                <div class="field"><label>新增书签标题</label><input id="new-bm-title" placeholder="标题"></div>
                <div class="field span-2"><label>URL</label><input id="new-bm-url" placeholder="https://..."></div>
                <div class="field span-3"><label>描述</label><input id="new-bm-desc" placeholder="描述（可留空）"></div>
            </div>
            <div class="actions"><button class="btn primary" data-action="create-bookmark" type="button"><i class="ti ti-plus"></i> 添加书签</button></div>
        </div>`;

    return `
        <div class="list-panel">
            <div class="list-head"><h3>书签 (${bookmarks.length})</h3></div>
            ${items || '<p class="muted">暂无书签</p>'}
            ${addForm}
        </div>`;
}

function searchEditorHtml(groups) {
    const groupHtml = groups.map((group) => {
        const expanded = state.expandedGroups.has(group.id);
        const items = state.tables.searchItems
            .filter((item) => item.group_id === group.id)
            .sort(bySort);
        const itemRows = items.map((item) => `
            <div class="search-item-grid">
                <input class="si-id" data-id="${item.id}" value="${escapeHtml(item.item_id)}" placeholder="item_id">
                <input class="si-name" data-id="${item.id}" value="${escapeHtml(item.name)}" placeholder="名称">
                <input class="si-url" data-id="${item.id}" value="${escapeHtml(item.url)}" placeholder="搜索 URL">
                <input class="si-ph" data-id="${item.id}" value="${escapeHtml(item.placeholder || '')}" placeholder="占位符">
                <button class="btn small" data-action="save-item" data-id="${item.id}" type="button">保存</button>
                <button class="icon-btn" data-action="move-item" data-id="${item.id}" data-direction="up" title="上移" type="button">↑</button>
                <button class="icon-btn" data-action="move-item" data-id="${item.id}" data-direction="down" title="下移" type="button">↓</button>
                <button class="btn small danger" data-action="delete-item" data-id="${item.id}" type="button">删除</button>
            </div>`).join('');

        const addItem = expanded ? `
            <div class="add-form">
                <div class="form-grid">
                    <div class="field"><label>item_id</label><input id="new-item-id" placeholder="type-xxx"></div>
                    <div class="field"><label>名称</label><input id="new-item-name" placeholder="百度"></div>
                    <div class="field span-2"><label>URL</label><input id="new-item-url" placeholder="https://..."></div>
                    <div class="field span-3"><label>占位符</label><input id="new-item-ph" placeholder="可留空"></div>
                </div>
                <div class="actions"><button class="btn primary" data-action="create-item" data-group="${group.id}" type="button"><i class="ti ti-plus"></i> 添加搜索项</button></div>
            </div>` : '';

        return `
            <div class="group-item">
                <div class="group-head">
                    <button class="icon-btn" data-action="toggle-group" data-id="${group.id}" title="${expanded ? '收起' : '展开'}" type="button">${expanded ? '▾' : '▸'}</button>
                    <input class="grp-name" data-id="${group.id}" value="${escapeHtml(group.group_name)}" placeholder="分组名称">
                    <button class="btn small" data-action="save-group" data-id="${group.id}" type="button">保存</button>
                    <button class="icon-btn" data-action="move-group" data-id="${group.id}" data-direction="up" title="上移" type="button">↑</button>
                    <button class="icon-btn" data-action="move-group" data-id="${group.id}" data-direction="down" title="下移" type="button">↓</button>
                    <button class="btn small danger" data-action="delete-group" data-id="${group.id}" type="button">删除</button>
                </div>
                ${expanded ? `<div class="group-items">${itemRows || '<p class="muted">暂无搜索项</p>'}${addItem}</div>` : ''}
            </div>`;
    }).join('');

    const addGroup = `
        <div class="add-form">
            <div class="field"><label>新增搜索分组</label><input id="new-group-name" placeholder="分组名称"></div>
            <div class="actions"><button class="btn primary" data-action="create-group" type="button"><i class="ti ti-plus"></i> 添加分组</button></div>
        </div>`;

    return `
        <div class="list-panel">
            <div class="list-head"><h3>搜索配置 (${groups.length})</h3></div>
            ${groupHtml || '<p class="muted">暂无搜索分组</p>'}
            ${addGroup}
        </div>`;
}

async function reload() {
    await loadTables();
}

async function selectCategory(id) {
    state.selectedId = id;
    render();
}

async function createTopCategory() {
    const title = prompt('输入顶层分类标题');
    if (!title || !title.trim()) return;
    const slug = prompt('输入 slug（节点 ID，可留空）', '');
    await api('api/admin/categories', {
        method: 'POST',
        body: JSON.stringify({ title: title.trim(), slug: slug.trim() || null })
    });
    toast('顶层分类已创建');
    await reload();
}

async function addChildCategory(parentId) {
    const parent = findCategory(parentId);
    if (!parent) return;
    const title = prompt(`在“${parent.title}”下新增子分类，输入标题`);
    if (!title || !title.trim()) return;
    await api('api/admin/categories', {
        method: 'POST',
        body: JSON.stringify({ parentId, title: title.trim() })
    });
    toast('子分类已创建');
    await reload();
}

async function renameCategory(id) {
    const category = findCategory(id);
    if (!category) return;
    const title = prompt('输入新的分类标题', category.title);
    if (!title || !title.trim() || title.trim() === category.title) return;
    await api(`api/admin/categories/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: title.trim() })
    });
    toast('分类已重命名');
    await reload();
}

async function deleteCategory(id) {
    const category = findCategory(id);
    if (!category) return;
    if (!confirm(`确认删除“${category.title}”？其子分类和书签也会一并删除。`)) return;
    await api(`api/admin/categories/${id}`, { method: 'DELETE' });
    if (state.selectedId === id) state.selectedId = null;
    toast('分类已删除');
    await reload();
}

async function moveCategory(id, direction) {
    await api(`api/admin/categories/${id}/move`, {
        method: 'POST',
        body: JSON.stringify({ direction })
    });
    await reload();
}

async function saveCategory() {
    const id = state.selectedId;
    const category = findCategory(id);
    if (!category) return;
    const title = $('#category-title').value.trim();
    const icon = $('#category-icon').value.trim();
    const slugInput = $('#category-slug');
    const slug = slugInput.disabled ? category.slug : (slugInput.value.trim() || null);
    if (!title) {
        toast('分类标题不能为空', 'error');
        return;
    }
    await api(`api/admin/categories/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title, icon, slug })
    });
    toast('分类信息已保存');
    await reload();
}

async function createBookmark() {
    const title = $('#new-bm-title').value.trim();
    const url = $('#new-bm-url').value.trim();
    const description = $('#new-bm-desc').value.trim();
    if (!title || !url) {
        toast('标题和 URL 不能为空', 'error');
        return;
    }
    await api('api/admin/bookmarks', {
        method: 'POST',
        body: JSON.stringify({ categoryId: state.selectedId, title, url, description })
    });
    toast('书签已添加');
    await reload();
}

async function saveBookmark(id) {
    const bookmark = findBookmark(id);
    if (!bookmark) return;
    const title = $(`.bm-title[data-id="${id}"]`).value.trim();
    const url = $(`.bm-url[data-id="${id}"]`).value.trim();
    const description = $(`.bm-desc[data-id="${id}"]`).value.trim();
    if (!title || !url) {
        toast('标题和 URL 不能为空', 'error');
        return;
    }
    await api(`api/admin/bookmarks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title, url, description })
    });
    toast('书签已保存');
    await reload();
}

async function deleteBookmark(id) {
    const bookmark = findBookmark(id);
    if (!bookmark) return;
    if (!confirm(`确认删除书签“${bookmark.title}”？`)) return;
    await api(`api/admin/bookmarks/${id}`, { method: 'DELETE' });
    toast('书签已删除');
    await reload();
}

async function moveBookmark(id, direction) {
    await api(`api/admin/bookmarks/${id}/move`, {
        method: 'POST',
        body: JSON.stringify({ direction })
    });
    await reload();
}

async function createGroup() {
    const groupName = $('#new-group-name').value.trim();
    if (!groupName) {
        toast('分组名称不能为空', 'error');
        return;
    }
    await api('api/admin/search-groups', {
        method: 'POST',
        body: JSON.stringify({ categoryId: state.selectedId, groupName })
    });
    toast('搜索分组已添加');
    await reload();
}

async function saveGroup(id) {
    const group = findGroup(id);
    if (!group) return;
    const groupName = $(`.grp-name[data-id="${id}"]`).value.trim();
    if (!groupName) {
        toast('分组名称不能为空', 'error');
        return;
    }
    await api(`api/admin/search-groups/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ groupName })
    });
    toast('搜索分组已保存');
    await reload();
}

async function deleteGroup(id) {
    const group = findGroup(id);
    if (!group) return;
    if (!confirm(`确认删除搜索分组“${group.group_name}”？组内搜索项会一并删除。`)) return;
    await api(`api/admin/search-groups/${id}`, { method: 'DELETE' });
    state.expandedGroups.delete(id);
    toast('搜索分组已删除');
    await reload();
}

async function moveGroup(id, direction) {
    await api(`api/admin/search-groups/${id}/move`, {
        method: 'POST',
        body: JSON.stringify({ direction })
    });
    await reload();
}

function toggleGroup(id) {
    if (state.expandedGroups.has(id)) {
        state.expandedGroups.delete(id);
    } else {
        state.expandedGroups.add(id);
    }
    renderDetail();
}

async function createItem(groupId) {
    const itemId = $('#new-item-id').value.trim();
    const name = $('#new-item-name').value.trim();
    const url = $('#new-item-url').value.trim();
    const placeholder = $('#new-item-ph').value.trim();
    if (!itemId || !name || !url) {
        toast('item_id、名称和 URL 不能为空', 'error');
        return;
    }
    await api('api/admin/search-items', {
        method: 'POST',
        body: JSON.stringify({ groupId, itemId, name, url, placeholder })
    });
    toast('搜索项已添加');
    await reload();
}

async function saveItem(id) {
    const item = findItem(id);
    if (!item) return;
    const itemId = $(`.si-id[data-id="${id}"]`).value.trim();
    const name = $(`.si-name[data-id="${id}"]`).value.trim();
    const url = $(`.si-url[data-id="${id}"]`).value.trim();
    const placeholder = $(`.si-ph[data-id="${id}"]`).value.trim();
    if (!itemId || !name || !url) {
        toast('item_id、名称和 URL 不能为空', 'error');
        return;
    }
    await api(`api/admin/search-items/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ itemId, name, url, placeholder })
    });
    toast('搜索项已保存');
    await reload();
}

async function deleteItem(id) {
    const item = findItem(id);
    if (!item) return;
    if (!confirm(`确认删除搜索项“${item.name}”？`)) return;
    await api(`api/admin/search-items/${id}`, { method: 'DELETE' });
    toast('搜索项已删除');
    await reload();
}

async function moveItem(id, direction) {
    await api(`api/admin/search-items/${id}/move`, {
        method: 'POST',
        body: JSON.stringify({ direction })
    });
    await reload();
}

async function handleAction(action, id, dataset) {
    switch (action) {
        case 'select-category':
            await selectCategory(id);
            break;
        case 'add-child':
            await addChildCategory(id);
            break;
        case 'rename-category':
            await renameCategory(id);
            break;
        case 'delete-category':
            await deleteCategory(id);
            break;
        case 'move-category':
            await moveCategory(id, dataset.direction);
            break;
        case 'create-top-category':
            await createTopCategory();
            break;
        case 'save-category':
            await saveCategory();
            break;
        case 'create-bookmark':
            await createBookmark();
            break;
        case 'save-bookmark':
            await saveBookmark(id);
            break;
        case 'delete-bookmark':
            await deleteBookmark(id);
            break;
        case 'move-bookmark':
            await moveBookmark(id, dataset.direction);
            break;
        case 'create-group':
            await createGroup();
            break;
        case 'save-group':
            await saveGroup(id);
            break;
        case 'delete-group':
            await deleteGroup(id);
            break;
        case 'move-group':
            await moveGroup(id, dataset.direction);
            break;
        case 'toggle-group':
            toggleGroup(id);
            break;
        case 'create-item':
            await createItem(Number(dataset.group));
            break;
        case 'save-item':
            await saveItem(id);
            break;
        case 'delete-item':
            await deleteItem(id);
            break;
        case 'move-item':
            await moveItem(id, dataset.direction);
            break;
        default:
            break;
    }
}

document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const { action, id, direction } = button.dataset;
    handleAction(action, Number(id), { direction, group: button.dataset.group }).catch((error) => {
        toast(error.message || '操作失败', 'error');
    });
});


$('#logout-btn').addEventListener('click', logout);

$('#login-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const token = $('#login-token').value.trim();
    if (!token) return;
    state.token = token;
    api('api/admin/check')
        .then(() => {
            sessionStorage.setItem('adminToken', token);
            return enterAdmin();
        })
        .catch((error) => {
            state.token = sessionStorage.getItem('adminToken') || '';
            const errorBox = $('#login-error');
            errorBox.textContent = error.message || '登录失败';
            errorBox.hidden = false;
        });
});

async function enterAdmin() {
    await loadTables();
    showAdmin();
}

async function init() {
    if (!state.token) {
        showLogin();
        return;
    }
    try {
        await api('api/admin/check');
        await enterAdmin();
    } catch (error) {
        if (error.message === 'ADMIN_TOKEN 未配置') {
            showLogin('服务端尚未配置 ADMIN_TOKEN，请先在 Cloudflare Pages 环境变量中设置。');
        } else {
            logout();
        }
    }
}

init();
