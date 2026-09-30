/**
 * 凭据持久化(core 层)。
 * tauri-plugin-store 落盘到 %APPDATA%/com.atoll.app/,与 WebView 的
 * localStorage 解耦,换打包方式不丢 Key。
 *
 * @author ZHANGCHAO 2026/10/01
 */
import { load } from '@tauri-apps/plugin-store'
import type { ZhipuCredential } from '../adapters/zhipu'

const STORE_FILE = 'settings.json'
const CREDENTIAL_KEY = 'zhipu_credential'

// 模块级单例:多处 load 同一文件会报资源占用
let storePromise: Promise<Awaited<ReturnType<typeof load>>> | null = null

function getStore() {
  if (storePromise === null) {
    storePromise = load(STORE_FILE, { autoSave: true })
  }
  return storePromise
}

export async function loadCredential(): Promise<ZhipuCredential | null> {
  try {
    const store = await getStore()
    const value = await store.get<ZhipuCredential>(CREDENTIAL_KEY)
    if (value === null || value === undefined) return null
    // 兼容脏数据:apiKey 缺失或为空视为未配置
    if (typeof value.apiKey !== 'string' || value.apiKey.trim() === '') return null
    return value
  } catch {
    // store 本身打不开(极少见)按未配置处理,不阻塞 UI
    return null
  }
}

export async function saveCredential(credential: ZhipuCredential): Promise<void> {
  const store = await getStore()
  await store.set(CREDENTIAL_KEY, credential)
  await store.save()
}
