# 原生安装版的构建边界

## 当前状态

共享 React 核心和平台输入接口已建立。Windows Tauri 2 外壳、安装包、托盘、全局快捷键和区域截图尚未交付；不能把 PWA 安装或浏览器测试视为原生安装验收。

`npm run check:native` 只读检查 Node、Rust/Cargo、MSVC 与 WebView2 注册状态，附带 Android SDK、Java 和 Xcode 线索；生成忽略的 `artifacts/native/environment.json`，缺项时退出码为 1。它不安装软件、不修改 PATH、不申请系统权限，不取代实际编译和真机验证。

Windows 开发环境未找到 Rust/Cargo 与 MSVC C++ 构建工具，需要使用者批准安装后继续。[Tauri 官方前置要求](https://v2.tauri.app/start/prerequisites/)规定 Windows 需要 Rust、Microsoft C++ 构建工具和 WebView2。Android SDK/NDK、macOS/Xcode、签名账号和华为设备信息按各端阶段补齐。

## Windows 后续交付顺序

1. 批准并补齐 Rust stable MSVC 工具链、C++ 桌面开发工作负载和 Windows SDK；确认 WebView2。保留安装来源和版本记录，不在仓库保存凭据。
2. 在现有仓库增加 Tauri 2 最小外壳，复用 Vite 的 5174 开发入口和 `dist/`，禁止加载远程页面作为应用核心。不预先开放 shell、任意文件读写或 HTTP 代理权限。
3. 在平台组合入口注入原生适配器；先完成剪贴板和由用户选定的 JSON 导出，再接入托盘、固定全局快捷键和区域截图。每项插件/命令单独限定 capabilities；截图先以内存传入共享输入区，不写临时原文文件。
4. 原生 WebView 数据与浏览器数据库独立。首次安装不扫描浏览器数据库，用户导出 JSON 后，在原生端预览、先备份再确认合并。
5. Windows 本机执行开发构建和安装包构建；测试安装、首次启动、关闭到托盘/退出、快捷键冲突、拒绝剪贴板权限、截图取消、输入清空、卸载边界与 JSON 往返。安装包类型按 [Tauri Windows 分发文档](https://v2.tauri.app/distribute/windows-installer/)验证。
6. 建立可复现的 Windows CI 构建，产物附版本、提交号和校验值。未签名包明确标记；公开发布或签名凭据接入另行确认，不声称已通过 SmartScreen 或商店审核。

## 移动端隐私前置条件

Android 分享接收须确认多 MIME、取消、重复分享、冷启动、切书及过期输入；尽量使用受限 content URI 流读入内存，不复制原文到持久收件箱。

iOS 需要 macOS/Xcode、主应用和 Swift Share Extension 真机验证。若跨进程交接必须依赖 App Group 临时文件，先提交访问范围、排除备份、最短 TTL、消费即删、错误/崩溃/冷启动清理及日志限制方案，获得明确批准后才能实现。当前未批准，也未创建这种持久化通道。

纯 HarmonyOS 在获得型号和系统版本后判断 ArkTS/ArkWeb 路线，不假定兼容 APK。账号、后端和跨端自动同步保持非目标。
