/**
 * Tauri 应用入口。壳层只负责窗口与插件注册,业务逻辑一律在前端 TS。
 * M1 起按架构文档在此追加插件注册(tauri-plugin-http / store 等)。
 *
 * @author ZHANGCHAO 2026/09/30
 */
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // http:请求经 Rust 侧发出,绕开 WebView 的 CORS(域名白名单在 capabilities)
        .plugin(tauri_plugin_http::init())
        // store:设置(API Key 等)持久化到应用数据目录
        .plugin(tauri_plugin_store::Builder::new().build())
        // notification:窗口重置提醒走 Windows toast
        .plugin(tauri_plugin_notification::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
