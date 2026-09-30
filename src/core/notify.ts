/**
 * Windows toast 通知(M2)。
 * 通知是增强能力:权限被拒或发送失败一律静默,绝不影响数据展示主流程。
 *
 * @author ZHANGCHAO 2026/10/01
 */
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'

export async function sendToast(body: string): Promise<void> {
  try {
    let granted = await isPermissionGranted()
    if (!granted) {
      granted = (await requestPermission()) === 'granted'
    }
    if (!granted) return
    sendNotification({ title: 'atoll', body })
  } catch {
    // 通知失败不影响主流程
  }
}
