import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { tablesToPageData } from '../functions/_shared/nav-data.js';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const QUERIES = [
  'SELECT * FROM categories ORDER BY sort_order, id',
  'SELECT * FROM bookmarks ORDER BY sort_order, id',
  'SELECT * FROM search_groups ORDER BY sort_order, id',
  'SELECT * FROM search_items ORDER BY sort_order, id'
];

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
  if (result.status !== 0) {
    process.stderr.write(result.stderr || '');
    process.exit(result.status ?? 1);
  }
  return result.stdout || '';
}

async function confirm(message) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => {
    rl.question(`${message} (y/N) `, resolve);
  });
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

async function main() {
  const args = process.argv.slice(2);
  const target = args.includes('--remote') ? '--remote' : '--local';

  console.log(`正在从 D1（${target === '--remote' ? '远程' : '本地'}）导出数据...`);
  const stdout = runWrangler([
    'd1', 'execute', 'DB',
    `--command=${QUERIES.join('; ')}`,
    '--json',
    target
  ]);

  const output = JSON.parse(stdout.trim());
  const results = Array.isArray(output) ? output : output.results;
  if (!Array.isArray(results) || results.length < 4) {
    throw new Error('无法解析 wrangler 的查询结果');
  }

  const [categories, bookmarks, groups, items] = results.map((result) => result.results || []);
  const pageData = tablesToPageData({ categories, bookmarks, searchGroups: groups, searchItems: items });
  const serialized = `${JSON.stringify({ pageData }, null, 2)}\n`;

  const dataPath = path.join(root, 'js', 'data.json');
  if (!args.includes('--yes')) {
    const ok = await confirm(`将用 D1 数据覆盖 ${dataPath}，是否继续？`);
    if (!ok) {
      console.log('已取消导出。');
      return;
    }
  }

  await writeFile(dataPath, serialized, 'utf8');
  console.log('D1 数据已写回 js/data.json。');
}

main().catch((error) => {
  console.error('导出失败:', error.message || error);
  process.exit(1);
});
