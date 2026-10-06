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
 * 消息,事件驱动零轮询。支持纯文本与图像两类内容:
 * - 纯文本:触发 clipboard:text-changed
 * - 图像(截图/复制图片):落盘缓存 + 缩略图,触发 clipboard:image-changed
 * - 写回剪贴板:分别提供 write_clipboard_text 与 write_clipboard_image
 */
mod clipboard_watch {
    use super::*;
    use clipboard_rs::{common::RustImage, Clipboard, ClipboardWatcher};
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};
    use tauri::Manager;

    #[derive(serde::Serialize, Clone)]
    pub struct ClipboardImagePayload {
        pub path: String,
        pub data_url: String,
        pub width: u32,
        pub height: u32,
    }

    struct ClipHandler {
        app: tauri::AppHandle,
        ctx: clipboard_rs::ClipboardContext,
        img_dir: PathBuf,
        last_text: String,
        last_img_hash: u64,
    }

    const BASE64_CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    fn bytes_to_base64(bytes: &[u8]) -> String {
        let mut result = String::with_capacity((bytes.len() + 2) / 3 * 4);
        for chunk in bytes.chunks(3) {
            let b0 = chunk[0] as usize;
            let b1 = chunk.get(1).copied().unwrap_or(0) as usize;
            let b2 = chunk.get(2).copied().unwrap_or(0) as usize;
            result.push(BASE64_CHARS[b0 >> 2] as char);
            result.push(BASE64_CHARS[((b0 & 3) << 4) | (b1 >> 4)] as char);
            if chunk.len() > 1 {
                result.push(BASE64_CHARS[((b1 & 0xf) << 2) | (b2 >> 6)] as char);
            } else {
                result.push('=');
            }
            if chunk.len() > 2 {
                result.push(BASE64_CHARS[b2 & 0x3f] as char);
            } else {
                result.push('=');
            }
        }
        result
    }

    impl clipboard_rs::ClipboardHandler for ClipHandler {
        fn on_clipboard_change(&mut self) {
            // 1. 优先尝试文本
            if let Ok(text) = self.ctx.get_text() {
                if !text.is_empty() {
                    if text != self.last_text {
                        self.last_text = text.clone();
                        self.last_img_hash = 0;
                        let _ = self.app.emit("clipboard:text-changed", text);
                    }
                    return;
                }
            }

            // 2. 检查是否为图片(截图/复制网页图像)
            if let Ok(img) = self.ctx.get_image() {
                if img.is_empty() {
                    return;
                }
                let (w, h) = img.get_size();
                if w == 0 || h == 0 {
                    return;
                }

                // 编码为 PNG
                let png_buf = match img.to_png() {
                    Ok(buf) => buf,
                    Err(_) => return,
                };
                let bytes = png_buf.get_bytes();
                if bytes.is_empty() {
                    return;
                }

                // 计算快照特征哈希去重防抖(长度 + 首尾样本 + 宽高)
                let hash = (bytes.len() as u64)
                    ^ ((bytes[0] as u64) << 32)
                    ^ ((bytes[bytes.len() - 1] as u64) << 16)
                    ^ ((w as u64) << 48)
                    ^ (h as u64);
                if hash == self.last_img_hash {
                    return;
                }
                self.last_img_hash = hash;
                self.last_text.clear();

                // 生成缩略图 Data URL (宽限在 240px 内,轻量极速渲染)
                let thumb_data_url = if w > 240 || h > 240 {
                    match img.thumbnail(240, 240) {
                        Ok(thumb) => match thumb.to_png() {
                            Ok(t_buf) => format!("data:image/png;base64,{}", bytes_to_base64(t_buf.get_bytes())),
                            Err(_) => format!("data:image/png;base64,{}", bytes_to_base64(bytes)),
                        },
                        Err(_) => format!("data:image/png;base64,{}", bytes_to_base64(bytes)),
                    }
                } else {
                    format!("data:image/png;base64,{}", bytes_to_base64(bytes))
                };

                // 原图存入本地缓存目录
                let now_ms = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis();
                let file_name = format!("clip_{}.png", now_ms);
                let full_path = self.img_dir.join(file_name);
                if fs::write(&full_path, bytes).is_err() {
                    return;
                }

                // 缓存清理:超过 30 张清理最老的缓存原图
                if let Ok(entries) = fs::read_dir(&self.img_dir) {
                    let mut files: Vec<PathBuf> = entries
                        .filter_map(|e| e.ok().map(|e| e.path()))
                        .filter(|p| p.extension().map_or(false, |ext| ext == "png"))
                        .collect();
                    if files.len() > 30 {
                        files.sort_by_key(|p| p.metadata().and_then(|m| m.modified()).ok());
                        for old in files.iter().take(files.len() - 30) {
                            let _ = fs::remove_file(old);
                        }
                    }
                }

                let payload = ClipboardImagePayload {
                    path: full_path.to_string_lossy().to_string(),
                    data_url: thumb_data_url,
                    width: w,
                    height: h,
                };
                let _ = self.app.emit("clipboard:image-changed", payload);
            }
        }
    }

    /// 启动剪贴板监听(文本 + 图片)
    pub fn start(app: tauri::AppHandle) {
        let img_dir = match app.path().app_data_dir() {
            Ok(dir) => dir.join("clipboard_images"),
            Err(_) => std::env::temp_dir().join("atoll_clipboard_images"),
        };
        let _ = fs::create_dir_all(&img_dir);

        std::thread::spawn(move || {
            let handler = ClipHandler {
                app: app.clone(),
                ctx: match clipboard_rs::ClipboardContext::new() {
                    Ok(ctx) => ctx,
                    Err(_) => return,
                },
                img_dir,
                last_text: String::new(),
                last_img_hash: 0,
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

/// 把文本写回系统剪贴板(剪贴板历史「点击复制文本」用)
#[tauri::command]
fn write_clipboard_text(text: String) -> Result<(), String> {
    use clipboard_rs::Clipboard;
    let ctx = clipboard_rs::ClipboardContext::new().map_err(|e| e.to_string())?;
    ctx.set_text(text).map_err(|e| e.to_string())
}

/// 把本地图片写回系统剪贴板(剪贴板历史「点击复制图片」用)
#[tauri::command]
fn write_clipboard_image(path: String) -> Result<(), String> {
    use clipboard_rs::{common::RustImage, Clipboard, RustImageData};
    let img = RustImageData::from_path(&path).map_err(|e| e.to_string())?;
    let ctx = clipboard_rs::ClipboardContext::new().map_err(|e| e.to_string())?;
    ctx.set_image(img).map_err(|e| e.to_string())
}

/// 显示/隐藏托盘图标(设置面板「显示托盘图标」开关用)
#[tauri::command]
fn set_tray_visible(app: tauri::AppHandle, visible: bool) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id("main") {
        if visible {
            tray.set_visible(true).map_err(|e| e.to_string())?;
        } else {
            tray.set_visible(false).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// 退出应用(托盘被隐藏后,设置面板的兜底退出入口)
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0)
}

/// 「关于」弹窗:版本 + 作者 + 链接,Windows 原生 MessageBox
fn show_about_dialog(app: &tauri::AppHandle) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONINFORMATION, MB_OK};
    let version = app.package_info().version.to_string();
    let text = format!(
        "atoll(环礁)v{version}\nWindows 桌面灵动岛悬浮组件\n\n作者:ZHANGCHAO\n官网:https://atoll-site-swart.vercel.app\n源码:https://github.com/yak33/atoll"
    );
    let title: Vec<u16> = "atoll · 关于".encode_utf16().chain(std::iter::once(0)).collect();
    let text_wide: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        MessageBoxW(std::ptr::null_mut(), text_wide.as_ptr(), title.as_ptr(), MB_OK | MB_ICONINFORMATION);
    }
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
            write_clipboard_text,
            write_clipboard_image,
            set_tray_visible,
            quit_app
        ])
        .setup(|app| {
            // 剪贴板文本监听:应用启动即开始,记录与否由前端设置决定
            clipboard_watch::start(app.handle().clone());
            // 托盘:显示/隐藏 + 隐藏托盘 + 关于 + 退出。窗口可见性事件发给前端统一管理,
            // 避免 Rust/JS 两边同时改窗口可见性互相打架。
            let toggle = MenuItem::with_id(app, "toggle", "显示 / 隐藏", true, None::<&str>)?;
            let hide_tray = MenuItem::with_id(app, "hide-tray", "隐藏托盘图标", true, None::<&str>)?;
            let about = MenuItem::with_id(app, "about", "关于 atoll", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle, &hide_tray, &about, &quit])?;

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
                    "hide-tray" => {
                        if let Some(tray) = app.tray_by_id("main") {
                            let _ = tray.set_visible(false);
                        }
                        // 通知前端同步设置面板的开关状态并持久化
                        if let Some(window) = app.get_webview_window("island") {
                            let _ = window.emit("tray:hidden", ());
                        }
                    }
                    "about" => show_about_dialog(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
