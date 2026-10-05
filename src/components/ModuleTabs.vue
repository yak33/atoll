<script setup lang="ts">
/**
 * 模块 Tab(用量 | 番茄 | …)。
 * 按钮列表由 islandModules.ts 注册表驱动,新模块自动出现;
 * 样式(.module-tabs/.tab-btn)在 App.vue 全局。仅显示当前项,切换交给容器。
 *
 * @author ZHANGCHAO 2026/10/06
 */
import { ISLAND_MODULES } from '../islandModules'
import type { IslandModule } from '../core/appSettings'

defineProps<{
  current: IslandModule
}>()

const emit = defineEmits<{ switchModule: [module: IslandModule] }>()
</script>

<template>
  <div class="module-tabs">
    <button
      v-for="m in ISLAND_MODULES"
      :key="m.id"
      :class="['tab-btn', current === m.id ? 'tab-btn-active' : '']"
      type="button"
      @click="emit('switchModule', m.id)"
    >
      {{ m.label }}
    </button>
  </div>
</template>
