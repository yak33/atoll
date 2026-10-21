// 一次性安装脚本:把 atoll-workbuddy-bridge 的 hooks 合并进 WorkBuddy 的 settings.json
// 用法: node scripts/install-workbuddy-bridge.mjs  (在 atoll 仓库根目录执行)
//
// 目标目录(桌面端启动时把 CODEBUDDY_CONFIG_DIR 强制指向 ~/.workbuddy,
// 其内置 CLI 引擎随之读那份 settings.json;~/.codebuddy 只服务于独立 CodeBuddy CLI,一并合并两全):
//   ~/.workbuddy/settings.json  ← WorkBuddy 桌面端(主要目标)
//   ~/.codebuddy/settings.json  ← CodeBuddy 独立 CLI(若在用)
//
// 合并策略:按事件数组追加 atoll 条目(以 URL 里的 agent=workbuddy 识别旧条目并替换),
// 其余既有条目(如 orca 等第三方工具配的 hooks)与其他设置键原样保留。
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const fragment = JSON.parse(fs.readFileSync(path.join(repoRoot, 'plugins', 'workbuddy-bridge', 'hooks.json'), 'utf8'));
const home = process.env.USERPROFILE;
const targets = [path.join(home, '.workbuddy'), path.join(home, '.codebuddy')];

for (const dir of targets) {
  const file = path.join(dir, 'settings.json')
  if (!fs.existsSync(dir)) {
    console.log(`SKIP  ${file} (目录不存在)`)
    continue
  }

  let cfg = {}
  let existed = false
  if (fs.existsSync(file)) {
    fs.copyFileSync(file, file + '.bak-atoll')
    cfg = JSON.parse(fs.readFileSync(file, 'utf8'))
    existed = true
  }
  cfg.hooks = cfg.hooks ?? {}

  for (const [event, entries] of Object.entries(fragment)) {
    const others = (cfg.hooks[event] ?? []).filter(
      (item) => !JSON.stringify(item).includes('agent=workbuddy&name=WorkBuddy'),
    )
    cfg.hooks[event] = [...others, ...entries]
  }

  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n')
  console.log(existed ? `OK    ${file}  (备份: ${file}.bak-atoll)` : `OK    ${file}  (新建)`)
}
