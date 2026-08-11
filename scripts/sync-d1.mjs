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

function runWrangler(args) {
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
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function main() {
  const args = process.argv.slice(2);
  const target = args.includes('--remote') ? '--remote' : '--local';

  const raw = await readFile(path.join(root, 'js', 'data.json'), 'utf8');
  const data = JSON.parse(raw);
  if (!data || !Array.isArray(data.pageData)) {
    throw new Error('js/data.json 缺少 pageData 数组');
  }

  const tables = pageDataToTables(data.pageData);
  const sql = buildSeedSql(tables);
  const tmpDir = path.join(root, '.wrangler');
  await mkdir(tmpDir, { recursive: true });
  const sqlPath = path.join(tmpDir, 'nav-seed.sql');
  await writeFile(sqlPath, sql, 'utf8');

  console.log(`准备同步 js/data.json 到 D1（${target === '--remote' ? '远程' : '本地'}）...`);
  runWrangler(['d1', 'execute', 'DB', `--file=${sqlPath}`, target]);
  console.log('D1 数据同步完成。');
}

main().catch((error) => {
  console.error('同步失败:', error.message || error);
  process.exit(1);
});
