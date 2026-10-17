/**
 * 模块布局(容器层纯函数):用户自定义的模块显示/隐藏与排序。
 *
 * 布局 = { order: 全部已知模块的用户排序, hidden: 隐藏子集 }。
 * 拆成两份而不是只存「可见序列」,是为了隐藏时不丢位置——重新显示时还在原地。
 * 纯函数不导入注册表(避免 core → 组件 的反向依赖),known 列表由调用方传入。
 *
 * @author ZHANGCHAO 2026/10/18
 */
import type { IslandModule } from './appSettings'

/** 模块布局:order 覆盖全部已知模块;hidden 是其子集 */
export interface ModuleLayout {
  order: IslandModule[]
  hidden: IslandModule[]
}

/**
 * 规整持久化数据:
 * - order 里未知模块剔除(将来删模块不留残骸),新模块按注册表顺序补到队尾;
 * - hidden 只保留仍在 order 里的;
 * - 至少保留一个可见模块:全部被隐藏时重置为全可见。
 */
export function normalizeModuleLayout(raw: unknown, known: readonly IslandModule[]): ModuleLayout {
  const order: IslandModule[] = []
  const pushIfKnown = (id: unknown): void => {
    if (typeof id === 'string' && known.includes(id as IslandModule) && !order.includes(id as IslandModule)) {
      order.push(id as IslandModule)
    }
  }
  const rawOrder = (raw as { order?: unknown } | null)?.order
  if (Array.isArray(rawOrder)) {
    for (const id of rawOrder) pushIfKnown(id)
  }
  for (const id of known) pushIfKnown(id)

  let hidden: IslandModule[] = []
  const rawHidden = (raw as { hidden?: unknown } | null)?.hidden
  if (Array.isArray(rawHidden)) {
    hidden = rawHidden.filter(
      (id): id is IslandModule => typeof id === 'string' && order.includes(id as IslandModule),
    )
  }
  // 可见数 = 0 时全部恢复显示(最后一个可见模块不可隐藏的规则在这里兜底)
  if (order.every((id) => hidden.includes(id))) hidden = []

  return { order, hidden }
}

/** 可见模块序列(order 剔除 hidden);滚轮环形切换与各处 Tab 都消费它 */
export function visibleModules(layout: ModuleLayout): IslandModule[] {
  return layout.order.filter((id) => !layout.hidden.includes(id))
}

/**
 * 显示/隐藏某个模块:隐藏最后一个可见模块时原样返回(不产生空布局);
 * 显示则从 hidden 移出,位置恢复到 order 里的原位。
 */
export function toggleModuleHidden(layout: ModuleLayout, id: IslandModule): ModuleLayout {
  if (!layout.order.includes(id)) return layout
  if (layout.hidden.includes(id)) {
    return { order: layout.order, hidden: layout.hidden.filter((item) => item !== id) }
  }
  if (visibleModules(layout).length <= 1) return layout
  return { order: layout.order, hidden: [...layout.hidden, id] }
}

/** 在完整 order 里上移/下移一位(与是否隐藏无关,边界不动);返回新布局 */
export function moveModule(layout: ModuleLayout, id: IslandModule, offset: -1 | 1): ModuleLayout {
  const idx = layout.order.indexOf(id)
  const target = idx + offset
  if (idx === -1 || target < 0 || target >= layout.order.length) return layout
  const order = [...layout.order]
  const [moved] = order.splice(idx, 1)
  order.splice(target, 0, moved)
  return { order, hidden: layout.hidden }
}
