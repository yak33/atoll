// 一次性安装脚本:把 atoll-qoder-bridge 的 hooks 合并进 Qoder 用户级 settings.json
// 用法: node scripts/install-qoder-bridge.mjs  (在 atoll 仓库根目录执行)
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const fragment = JSON.parse(fs.readFileSync(path.join(repoRoot, 'plugins', 'qoder-bridge', 'hooks.json'), 'utf8'));
const home = process.env.USERPROFILE;
const targets = [path.join(home, '.qoder-cn'), path.join(home, '.qoder')];

for (const dir of targets) {
  const file = path.join(dir, 'settings.json');
  if (!fs.existsSync(file)) {
    console.log(`SKIP  ${file} (不存在)`);
    continue;
  }
  const backup = file + '.bak-atoll';
  fs.copyFileSync(file, backup);
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  // 只覆盖同名事件的 atoll 条目,其余事件与全部其他键(providers/enabledPlugins/mcpServers...)原样保留
  cfg.hooks = { ...cfg.hooks, ...fragment };
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
  console.log(`OK    ${file}  (备份: ${backup})`);
}
