// 一次性安装脚本:把 atoll-trae-bridge 的 hooks 合并进 Trae 全局 hooks.json
// 用法: node scripts/install-trae-bridge.mjs  (在 atoll 仓库根目录执行)
// 国内版写 ~/.trae-cn/hooks.json,国际版写 ~/.trae/hooks.json,对所有项目生效
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const fragment = JSON.parse(fs.readFileSync(path.join(repoRoot, 'plugins', 'trae-bridge', 'hooks.json'), 'utf8')).hooks;
const home = process.env.USERPROFILE;
const targets = [path.join(home, '.trae-cn'), path.join(home, '.trae')];

for (const dir of targets) {
  const file = path.join(dir, 'hooks.json');
  if (!fs.existsSync(dir)) {
    console.log(`SKIP  ${file} (未安装该版本)`);
    continue;
  }
  let cfg = { hooks: {} };
  let existed = false;
  if (fs.existsSync(file)) {
    fs.copyFileSync(file, file + '.bak-atoll');
    cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    cfg.hooks = cfg.hooks ?? {};
    existed = true;
  }
  // 按名字替换旧的 atoll-* 条目,用户手工或设置界面添加的其他 hook 原样保留
  for (const [event, entries] of Object.entries(fragment)) {
    const others = (cfg.hooks[event] ?? []).filter((h) => !String(h.name ?? '').startsWith('atoll-'));
    cfg.hooks[event] = [...others, ...entries];
  }
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
  console.log(existed ? `OK    ${file}  (备份: ${file}.bak-atoll)` : `OK    ${file}  (新建)`);
}
