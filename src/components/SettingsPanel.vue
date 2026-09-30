<script setup lang="ts">
/**
 * 设置面板(M1 最小实现)。
 * 点药丸弹出:智谱凭据表单 + 手动刷新 + 当前状态。
 * 窗口尺寸切换(340x460)由 App.vue 负责,本组件只管表单本身。
 *
 * @author ZHANGCHAO 2026/10/01
 */
import { onMounted, ref } from 'vue'
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import type { ZhipuCredential } from '../adapters/zhipu'

const props = defineProps<{
  initial: ZhipuCredential | null
}>()

const emit = defineEmits<{
  save: [credential: ZhipuCredential]
  close: []
}>()

const DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4'

const apiKey = ref(props.initial?.apiKey ?? '')
const baseUrl = ref(props.initial?.baseUrl ?? DEFAULT_BASE_URL)
const organizationId = ref(props.initial?.organizationId ?? '')
const projectId = ref(props.initial?.projectId ?? '')
const validationMessage = ref('')

// 开机自启:独立于表单保存,切换即生效
const autostartOn = ref(false)

onMounted(async () => {
  try {
    autostartOn.value = await isEnabled()
  } catch {
    // 查询失败保持默认不勾选
  }
})

async function handleAutostartToggle(): Promise<void> {
  try {
    if (autostartOn.value) {
      await enable()
    } else {
      await disable()
    }
  } catch {
    // 失败回滚勾选状态
    autostartOn.value = !autostartOn.value
  }
}

function handleSave() {
  if (apiKey.value.trim() === '') {
    validationMessage.value = 'API Key 不能为空'
    return
  }
  if (baseUrl.value.trim() === '') {
    validationMessage.value = 'base_url 不能为空'
    return
  }
  validationMessage.value = ''
  const credential: ZhipuCredential = {
    apiKey: apiKey.value.trim(),
    baseUrl: baseUrl.value.trim(),
  }
  // 团队版字段:非空才写入,空串不入库,保证 organizationId 非空 == 团队版语义
  const org = organizationId.value.trim()
  if (org !== '') credential.organizationId = org
  const project = projectId.value.trim()
  if (project !== '') credential.projectId = project
  emit('save', credential)
}
</script>

<template>
  <div class="panel">
    <div class="header">
      <span class="title">atoll 设置</span>
      <button class="close-btn" type="button" @click="emit('close')">✕</button>
    </div>

    <form class="form" @submit.prevent="handleSave">
      <label class="field">
        <span class="field-label">API Key *</span>
        <input v-model="apiKey" type="password" class="input" placeholder="智谱开放平台 API Key" autocomplete="off" />
      </label>

      <label class="field">
        <span class="field-label">base_url</span>
        <input v-model="baseUrl" type="text" class="input" placeholder="https://open.bigmodel.cn/api/paas/v4" />
        <span class="field-hint">含 bigmodel.cn / z.ai 自动匹配额度主机,其他域名回落国内站</span>
      </label>

      <div class="section-title">团队版(个人版留空)</div>
      <label class="field">
        <span class="field-label">组织 ID</span>
        <input v-model="organizationId" type="text" class="input" placeholder="bigmodel-organization" autocomplete="off" />
      </label>
      <label class="field">
        <span class="field-label">项目 ID(可选)</span>
        <input v-model="projectId" type="text" class="input" placeholder="bigmodel-project" autocomplete="off" />
      </label>
      <span class="field-hint">团队版必填组织 ID,否则官方返回「当前用户不存在coding plan」</span>

      <div class="section-title">系统</div>
      <label class="toggle-row">
        <input v-model="autostartOn" type="checkbox" class="checkbox" @change="handleAutostartToggle" />
        <span class="field-label">开机自动启动</span>
      </label>

      <div v-if="validationMessage" class="validation">{{ validationMessage }}</div>

      <div class="actions">
        <button class="btn-primary" type="submit">保存</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
  border-radius: 16px;
  background: rgba(24, 24, 27, 0.96);
  color: #e4e4e7;
  font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: 12px;
  padding: 14px 16px 16px;
  user-select: none;
  overflow-y: auto;
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox {
  accent-color: #22c55e;
  width: 14px;
  height: 14px;
  cursor: pointer;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.title {
  font-size: 13px;
  font-weight: 600;
}

.close-btn {
  border: none;
  background: transparent;
  color: #a1a1aa;
  font-size: 13px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #e4e4e7;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-label {
  font-size: 11px;
  color: #a1a1aa;
}

.field-hint {
  font-size: 10px;
  color: #71717a;
  line-height: 1.4;
}

.input {
  box-sizing: border-box;
  width: 100%;
  height: 30px;
  padding: 0 8px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: #e4e4e7;
  font-size: 12px;
  font-family: inherit;
  outline: none;
}

.input:focus {
  border-color: #22c55e;
}

.section-title {
  margin-top: 4px;
  font-size: 11px;
  color: #71717a;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 10px;
}

.validation {
  color: #f87171;
  font-size: 11px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
}

.btn-primary {
  height: 30px;
  padding: 0 18px;
  border: none;
  border-radius: 8px;
  background: #22c55e;
  color: #052e16;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary:hover {
  background: #16a34a;
}
</style>
