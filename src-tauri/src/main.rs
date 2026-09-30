// 防止 release 模式下弹控制台黑窗(Windows GUI 应用标准写法)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    atoll_lib::run()
}
