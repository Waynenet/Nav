import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageDataToTables } from '../functions/_shared/nav-data.js';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const sqlValue = (value) => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
};

function buildInsert(table, rows) {
  const columns = Object.keys(rows[0] || {});
  if (columns.length === 0) return `-- ${table}: 无数据`;
  const statements = rows.map((row) => {
    const values = columns.map((column) => sqlValue(row[column])).join(', ');
    return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values});`;
  });
  return statements.join('\n');
}

function buildSeedSql(tables) {
  return [
    'DELETE FROM search_items;',
    'DELETE FROM search_groups;',
    'DELETE FROM bookmarks;',
    'DELETE FROM categories;',
    buildInsert('categories', tables.categories),
    buildInsert('bookmarks', tables.bookmarks),
    buildInsert('search_groups', tables.searchGroups),
    buildInsert('search_items', tables.searchItems)
  ].join('\n');
}

function runWrangler(args, { capture = false } = {}) {
  const cli = require.resolve('wrangler');
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      XDG_CONFIG_HOME: path.join(root, '.wrangler', 'xdg')
    }
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stderr || '');
    process.exit(result.status ?? 1);
  }
  if (capture) return result.stdout || '';
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  return '';
}

function getRow(stdout) {
  const output = JSON.parse(stdout.trim());
  const entries = Array.isArray(output) ? output : [output];
  const rows = entries.flatMap((entry) => entry.results || []);
  return rows[0] || {};
}

async function main() {
  const args = process.argv.slice(2);
  const target = args.includes('--remote') ? '--remote' : '--local';
  const databaseArg = args.find((arg) => arg.startsWith('--database='));
  const database = databaseArg ? databaseArg.slice('--database='.length) : 'nav';
  const persistArg = args.find((arg) => arg.startsWith('--persist-to='));
  const persistTo = persistArg ? persistArg.slice('--persist-to='.length) : null;
  const targetLabel = target === '--remote' ? '远程' : '本地';
  const persistArgs = persistTo && target === '--local' ? [`--persist-to=${persistTo}`] : [];

  const migrationPath = path.join(root, 'migrations', '0001_init.sql');
  console.log(`正在对 D1（${targetLabel}）执行建表迁移...`);
  runWrangler(['d1', 'execute', database, `--file=${migrationPath}`, target, ...persistArgs, '--yes']);

  console.log(`正在检查 D1（${targetLabel}）是否已有数据...`);
  const stdout = runWrangler(
    [
      'd1', 'execute', database,
      '--command=SELECT ' +
        '(SELECT COUNT(*) FROM categories) AS categories, ' +
        '(SELECT COUNT(*) FROM bookmarks) AS bookmarks, ' +
        '(SELECT COUNT(*) FROM search_groups) AS search_groups, ' +
        '(SELECT COUNT(*) FROM search_items) AS search_items',
      '--json', target, ...persistArgs, '--yes'
    ],
    { capture: true }
  );

  const row = getRow(stdout);
  const total = [row.categories, row.bookmarks, row.search_groups, row.search_items]
    .reduce((sum, value) => sum + Number(value || 0), 0);

  if (total > 0) {
    console.log(`D1 已有 ${total} 条数据，跳过播种，不会覆盖现有数据。`);
    return;
  }

  const raw = await readFile(path.join(root, 'js', 'data.json'), 'utf8');
  const data = JSON.parse(raw);
  if (!data || !Array.isArray(data.pageData)) {
    throw new Error('js/data.json 缺少 pageData 数组');
  }

  const tables = pageDataToTables(data.pageData);
  const sql = buildSeedSql(tables);
  const tmpDir = path.join(root, '.wrangler');
  await mkdir(tmpDir, { recursive: true });
  const sqlPath = path.join(tmpDir, 'nav-seed-if-empty.sql');
  await writeFile(sqlPath, sql, 'utf8');

  console.log('D1 为空，正在写入 js/data.json 的种子数据...');
  runWrangler(['d1', 'execute', database, `--file=${sqlPath}`, target, ...persistArgs, '--yes']);
  console.log('D1 初始化完成。');
}

main().catch((error) => {
  console.error('初始化失败:', error.message || error);
  process.exit(1);
});
