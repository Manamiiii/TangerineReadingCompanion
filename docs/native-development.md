# Windows 桌面构建与边界

## 当前实现

Windows x64 使用 Electron 45.1.0 和 electron-builder 26.18.0，加载包内 Vite/React 核心。提供 NSIS 当前用户安装器，无后端、无常驻本地端口，不要求最终用户安装 Node、Python、Rust 或 WebView2。macOS 尚未构建或验收；移动端外壳另行设计。

最小版本提供独立窗口、开始菜单、Windows 卸载入口、手动版本下载入口、现有文字/图片输入与 JSON 导入导出。关闭窗口即退出；没有托盘、全局快捷键、系统区域截图或分享接收，不把这些规划能力描述为已实现。

## 构建

使用 README 指定 Node 版本和锁文件安装依赖。开发依赖仅安装在项目内，不需要 MSVC/Rust。若 npm 的安装脚本策略阻止 Electron 获取运行时，可明确执行已安装依赖的官方脚本 `node node_modules/electron/install.js`；不要全局放开所有依赖脚本。

```sh
npm run check:native
npm run lint
npm test
npm run check:packages
npm run dist:win
npm run check:desktop-package
npm run test:desktop
npm run build:installer-fixture
npm run test:installer
```

`check:native` 只读检查当前 Electron Windows 构建依赖，并生成忽略的 `artifacts/native/environment.json`，不安装任何工具。

`pack:win` 只生成应用目录；`dist:win` 生成 `artifacts/desktop/release/TangerineReadingCompanion-<版本>-win-x64-Setup.exe` 和 SHA256SUMS.txt，不发布。安装器默认当前用户安装，不提权，不自动启动，不默认创建桌面图标。程序运行中拒绝安装、升级和卸载，不强杀临时阅读会话。

## 安全、数据和离线

- 固定应用 ID 为 `org.tangerine.readingcompanion`，页面地址为 `app://reading/index.html`，数据位于系统用户应用数据目录中的 `TangerineReadingCompanion`。不得因版本变化而修改这三项，避免升级后读到另一份数据库。
- 页面沙箱、context isolation、webSecurity 保持开启，没有 Node 集成、preload 文件接口、shell IPC 或通用网络代理。包内协议限定路径，禁止跨目录读取；外部 HTTP(S) 链接交给系统浏览器，其他协议和带凭据链接拒绝。
- 应用只申请现有剪贴板和持久存储所需权限。文件导出显示保存对话框；保存取消不改数据。共享前端仍把下载视为 requested，导入前要求用户确认文件已保存。
- 数据库 schema、阅读备份格式与 merge-by-key 不变。安装版和浏览器存储独立，通过 JSON 显式迁移，不扫描日常浏览器数据。
- 不注册网页 Service Worker，不用网页缓存覆盖安装文件。阅读页面、正式资料和 OCR worker/WASM/语言资源随包分发；在线地图、地名搜索和模型仍需要对应服务。HTTP 磁盘缓存禁用；原文、截图、OCR 与模型内容仍是临时会话状态。
- 升级和默认卸载保留用户数据。API Key 不进入数据库、导出、日志、构建或源码。数据隔离不等于同一 OS 用户下的安全沙箱。
- 产物只允许 dist、desktop、项目元数据和许可证；打包后检查文件白名单、源码一致性和常见隐私信息。OCR Emscripten 运行时的虚拟路径与编码内容采用严格的上游字节一致性核对，不能借此豁免自有代码。

## 验证和发布边界

桌面测试使用隔离 profile、合成书籍和空 PATH，覆盖实际打包 EXE、备份下载/导入、离线 OCR、面板、重启和临时状态。安装测试使用实际生产应用标识及静默安装，在临时安装目录验证升级、运行中保护、卸载和重装。发现已有安装登记、同名开始菜单快捷方式或真实应用进程时拒绝测试，不覆盖用户安装。

0.0.9 是当前代码的低版本号 fixture，只用于安装器升级测试，不是历史业务数据迁移证据。测试会临时写入本测试应用的 HKCU 登记及开始菜单入口，并在结束时卸载；profile 留在系统临时目录供诊断。失败报告、截图和校验结果位于忽略的 artifacts，不能把含机器路径的原始报告公开上传。

Windows CI 使用命令行构建和相同回归；其结果不能代替干净 Windows 普通账号和交互向导验收。用户步骤见 [Windows 安装与验收](windows-installation.md)。安装包当前未签名；发布 Release、采购签名、接入签名凭据均须另行授权，不能承诺 SmartScreen 信任。

依赖审计应分别检查生产依赖和完整开发依赖。构建工具也可能有上游告警，不能把 `npm audit --omit=dev` 通过描述为全部依赖无漏洞；不要直接使用强制修复来降级打包器或破坏锁文件。当前打包脚本只处理仓库内受控资源，不接受用户上传的构建模板或路径模式。

## 后续平台

macOS 需要独立构建、签名/公证决策与真机验收。Android 系统分享只接收主动交付的内容；不绕过 DRM 或平台权限。iOS 若需 App Group 临时文件，必须先提供最短 TTL、消费即删、崩溃/冷启动清理、权限和排除备份方案，并取得明确批准。当前未批准这种通道。账号、后端和跨设备自动同步不属于首版。
