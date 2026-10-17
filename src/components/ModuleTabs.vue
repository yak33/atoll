<script setup lang="ts">
/**
 * 模块 Tab(用量 | 番茄 | …)。
 * 按钮列表由容器(App.vue)经 provide('visibleModuleTabs') 下发的「可见模块」驱动——
 * 用户在设置里隐藏/排序模块时,所有面板的 Tab 同步生效;
 * 未 provide 时(单测/浏览器预览)回落完整注册表。样式(.module-tabs/.tab-btn)在 App.vue 全局。
 *
 * @author ZHANGCHAO 2026/10/06
 */
import { computed, inject, type ComputedRef } from 'vue'
import { ISLAND_MODULES, type IslandModuleDefinition } from '../islandModules'
import type { IslandModule } from '../core/appSettings'

defineProps<{
  current: IslandModule
}>()

const emit = defineEmits<{ switchModule: [module: IslandModule] }>()

const visibleTabs = inject<ComputedRef<IslandModuleDefinition[]> | null>('visibleModuleTabs', null)
const tabs = computed(() => visibleTabs?.value ?? ISLAND_MODULES)
</script>

<template>
  <div class="module-tabs">
    <button
      v-for="m in tabs"
      :key="m.id"
      :class="['tab-btn', current === m.id ? 'tab-btn-active' : '']"
      type="button"
      @click="emit('switchModule', m.id)"
    >
      {{ m.label }}
    </button>
  </div>
</template>
