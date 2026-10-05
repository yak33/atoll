/**
 * Tauri 应用入口(M3:托盘 / 全屏检测 / 开机自启)。
 * 壳层只做系统集成,业务逻辑一律在前端 TS。
 *
 * @author ZHANGCHAO 2026/09/30
 */
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager};

// windows-sys 的句柄在不同版本可能是指针或 isize,统一转 isize 判空
fn hwnd_is_null(hwnd: windows_sys::Win32::Foundation::HWND) -> bool {
    hwnd as isize == 0
}

/**
 * 检测前台窗口是否为全屏应用(游戏/全屏视频)。
 * 判定:前台窗口的矩形完整覆盖它所在显示器;桌面(Progman/WorkerW)不算。
 * 前端每 3 秒调用一次,全屏时隐藏灵动岛。
 */
#[tauri::command]
fn is_foreground_fullscreen() -> bool {
    unsafe {
        use windows_sys::Win32::Foundation::RECT;
        use windows_sys::Win32::Graphics::Gdi::{
            GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
        };
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            GetClassNameW, GetForegroundWindow, GetWindowRect,
        };

        // 取当前前台窗口;拿不到(如刚切换瞬间)按「非全屏」处理
        let hwnd = GetForegroundWindow();
        if hwnd_is_null(hwnd) {
            return false;
        }

        // 桌面/壁纸窗口会铺满屏幕,但不是「全屏应用」,跳过
        let mut class_name = [0u16; 64];
        let length = GetClassNameW(hwnd, class_name.as_mut_ptr(), 64);
        let class = String::from_utf16_lossy(&class_name[..length.max(0) as usize]);
        if class == "Progman" || class == "WorkerW" {
            return false;
        }

        // 前台窗口矩形
        let mut window_rect = RECT { left: 0, top: 0, right: 0, bottom: 0 };
        if GetWindowRect(hwnd, &mut window_rect) == 0 {
            return false;
        }

        // 前台窗口所在显示器的完整区域
        let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        if monitor as isize == 0 {
            return false;
        }
        let mut info: MONITORINFO = std::mem::zeroed();
        info.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        if GetMonitorInfoW(monitor, &mut info) == 0 {
            return false;
        }

        // 窗口盖住整块显示器 → 全屏
        window_rect.left <= info.rcMonitor.left
            && window_rect.top <= info.rcMonitor.top
            && window_rect.right >= info.rcMonitor.right
            && window_rect.bottom >= info.rcMonitor.bottom
    }
}

/**
 * 更新系统托盘悬浮提示文案(Tooltip)。
 * 由前端在用量刷新或番茄钟状态变化时调用,解决 Windows 托盘悬浮显示空白浮层的问题,
 * 同时让用户在全屏隐藏时鼠标移动到右下角托盘也能看清当前额度或专注状态。
 */
#[tauri::command]
fn set_tray_tooltip(app: tauri::AppHandle, tooltip: String) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id("main") {
        tray.set_tooltip(Some(tooltip)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/**
 * 剪贴板模块(H2):clipboard-rs 的 watcher 走 Win32 AddClipboardFormatListener
 * 消息,事件驱动零轮询。只把「纯文本」变化推给前端;图像/文件复制时 get_text
 * 返回 Err,自然被过滤。开关语义在前端(关闭记录时前端忽略事件,不落盘)。
 */
mod clipboard_watch {
    use super::*;
    // get_text/set_text 在 Clipboard trait 上,add_handler/start_watch 在 ClipboardWatcher trait 上
    use clipboard_rs::{Clipboard, ClipboardWatcher};

    struct TextHandler {
        app: tauri::AppHandle,
        ctx: clipboard_rs::ClipboardContext,
    }

    impl clipboard_rs::ClipboardHandler for TextHandler {
        fn on_clipboard_change(&mut self) {
            // 非文本内容(图像/文件)读文本会 Err,静默跳过
            if let Ok(text) = self.ctx.get_text() {
                if !text.is_empty() {
                    let _ = self.app.emit("clipboard:text-changed", text);
                }
            }
        }
    }

    /// 启动剪贴板文本监听(幂等:重复调用时第二个 watcher 会因占用失败并静默返回)
    pub fn start(app: tauri::AppHandle) {
        std::thread::spawn(move || {
            let handler = TextHandler {
                app: app.clone(),
                ctx: match clipboard_rs::ClipboardContext::new() {
                    Ok(ctx) => ctx,
                    Err(_) => return,
                },
            };
            let mut watcher = match clipboard_rs::ClipboardWatcherContext::new() {
                Ok(watcher) => watcher,
                Err(_) => return,
            };
            watcher.add_handler(handler);
            watcher.start_watch();
        });
    }
}

/// 把文本写回系统剪贴板(剪贴板历史「点击复制」用)
#[tauri::command]
fn write_clipboard_text(text: String) -> Result<(), String> {
    use clipboard_rs::Clipboard;
    let ctx = clipboard_rs::ClipboardContext::new().map_err(|e| e.to_string())?;
    ctx.set_text(text).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // http:请求经 Rust 侧发出,绕开 WebView 的 CORS(域名白名单在 capabilities)
        .plugin(tauri_plugin_http::init())
        // store:设置(API Key 等)持久化到应用数据目录
        .plugin(tauri_plugin_store::Builder::new().build())
        // notification:窗口重置提醒走 Windows toast
        .plugin(tauri_plugin_notification::init())
        // autostart:开机自启;Windows 走注册表,启动参数无
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![
            is_foreground_fullscreen,
            set_tray_tooltip,
            write_clipboard_text
        ])
        .setup(|app| {
            // 剪贴板文本监听:应用启动即开始,记录与否由前端设置决定
            clipboard_watch::start(app.handle().clone());
            // 托盘:显示/隐藏 + 退出。可见性事件发给前端统一管理,
            // 避免 Rust/JS 两边同时改窗口可见性互相打架。
            let toggle = MenuItem::with_id(app, "toggle", "显示 / 隐藏", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle, &quit])?;

            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().expect("未配置窗口图标").clone())
                .tooltip("atoll · 灵动岛")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle" => {
                        if let Some(window) = app.get_webview_window("island") {
                            let _ = window.emit("tray:toggle-visibility", ());
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
