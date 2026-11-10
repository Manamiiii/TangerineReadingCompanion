# 本地运行与部署

## 安装与地址

完整获取与安装步骤见 [README](../README.md#快速开始)。使用锁文件执行 `npm ci`；不需要 `.env` 或服务器端密钥。`VITE_APP_BUILD` 仅用于构建标识，可不设置，不是 Key 配置入口。模型和地图设置在应用中填写。

本机路径和配置不写入源码；额外本机文件保存在仓库外或忽略的 `.private/`，不得放到 `public/`。构建会先执行隐私检查；完整规则与检查范围见[本机私有信息说明](local-privacy.md)。

开发地址固定为 `http://localhost:5174/`。请持续使用同一浏览器及地址，否则会看到不同的本机书架。不要为了绕过端口冲突直接更换端口；先检查是否已有服务。换域名或设备前先导出 JSON，在目标地址预览并合并导入。

## Windows 快捷入口

下面的 VBS 入口用于源码开发，不是安装版。Windows Setup 的构建、数据位置和验收分别见 [桌面开发](native-development.md) 与 [安装说明](windows-installation.md)。两种入口的数据独立，需 JSON 迁移。

完成下文桌面验收交付后，双击根目录 `TangerineReadingCompanion.vbs`。启动器在后台用 Vite 提供已验证的固定源码快照，仅复用快照标识、页面标识及进程归属一致的服务，在状态窗口中显示进度与错误，然后打开默认浏览器。首次克隆没有已选快照时会明确提示；普通开发继续使用 `npm run dev`。它不安装依赖、不请求管理员权限，也不是 Windows 原生安装包。若系统禁用了 WScript，可直接使用终端方式。

可以自己为该 VBS 创建快捷方式，并选用 `assets/tangerine-reading-companion.ico`。仓库不要求作者本机的桌面目录或绝对路径。

关闭浏览器不停止后台服务；注销或重启 Windows 会结束服务。启动窗口的“停止等待”只停止等待及自动打开浏览器。故障日志位于忽略的 `artifacts/launcher-error.log`、`launcher-server.log` 和 `launcher-server-error.log`，分享前检查本机路径等信息。

只检查启动、不打开窗口或浏览器：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/launch-desktop.ps1 -NoOpenBrowser
```

VBS 从自身位置定位项目，不接收额外启动参数。PowerShell 从 PATH 查找 Node，在工程内启动 `scripts/serve-review.mjs`；服务的 Vite 根目录是已选源码快照，依赖使用本仓库已校验的安装记录。`-OnProgress` 供启动窗口接收进度，`-NoOpenBrowser` 供后台或诊断使用。启动互斥锁保护并发启动，同一地址且来源、版本均匹配的阅读服务可复用；旧版或其他服务占用 5174 时显示失败，不停止或接管。源码入口与安装器均不自动创建桌面快捷方式，已有指向 VBS 的快捷方式可继续使用原浏览器书架。

## 桌面验收交付

桌面 `.lnk → TangerineReadingCompanion.vbs → scripts/launch-desktop.ps1 → scripts/serve-review.mjs → artifacts/review/releases/<提交>-<内容摘要>`，地址继续为 `http://localhost:5174/`。仍是开发模式的 Vite 网页，不注册新的 Service Worker；浏览器书架与 Key 不迁移。`npm run dev` 明确用于工作区开发，不能与桌面验收服务同时占用该端口。

维护步骤（不在每次点击快捷方式时构建）：以下 PowerShell 命令沿用 VBS 的单进程执行策略参数，不运行 Set-ExecutionPolicy、不修改系统或用户策略。

1. 核对本项目实际快捷方式目标、参数、工作目录、图标，以及 5174 的监听进程与启动命令。若有运行中、暂停、未保存或无法确认状态的会话，只做独立构建与隔离验证，保留当前实例；不自动刷新真实页面。
2. 按项目规则完成 lint、测试、隐私、构建等检查并提交。工作区干净后运行 `npm run review:prepare`。它按已跟踪文件建立固定源码副本和 SHA-256 清单，不复制 `.env`、私有文件、真实数据或 node_modules。已有快照不覆盖；依赖仍来自本项目，启动时校验 npm 安装记录摘要，依赖变化须重新验证。该摘要不替代依赖审计，也不保证手工修改的第三方文件未变。
3. 将输出的快照目录名传给 `npm run review:verify -- <快照目录名>`。使用临时端口及全新隐藏浏览器上下文验证实际 HTML 标识、设置页提交号、合成书籍/进度与临时原文清理。测试不会读取真实浏览器 profile，结果写在快照内 `verified.json`。需已有 Playwright Chromium；缺失时先按工具安装授权规则处理。
4. 只有原端口无服务时，运行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/select-review.ps1 -Snapshot <快照目录名>`。它与启动器共用互斥锁，要求验证记录匹配；端口占用则拒绝选择。旧选择记录和快照保留，不做资产清理。
5. 在确认没有活动会话后，通过 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/launch-desktop.ps1 -NoOpenBrowser` 启动/核验，不打开用户浏览器。运行 `npm run review:check` 比较实际服务和 HTML 标识，再运行 `npm run review:verify -- --running`，用独立浏览器核验原地址的实际界面版本。快捷方式目标正确时保留原文件；仅纠正已证明属于本项目的错误目标。
6. 交接记录源码提交、工作区状态、快照目录、源码摘要/manifest SHA-256、实际进程及页面验证范围。本机绝对路径、进程和快捷方式记录只写忽略的 artifacts。区分“源码完成”“入口选择完成”和“运行服务已核验”，用户已有标签页版本不可从服务状态推定。

运行服务不自动跟随工作区修改，快照目录也不能手工编辑。当前服务不匹配时启动器会拒绝复用，不强杀、不重启。需要切换时先保存/处理临时输入、结束模型/OCR 操作，并由用户关闭相关会话后正常退出原服务；终端启动可用 Ctrl+C，后台服务可在正常注销或重启 Windows 后结束。没有安全退出条件时保留“待安全切换”，不能声称已更新实例。

新服务已核验但原标签页仍旧时，用户先处理临时输入，再在同一浏览器、同一地址刷新，进入书内“设置”核对本次提交前七位。若已有旧 PWA 缓存控制页面导致版本不一致，先报告版本差异，使用页面已有的显式更新流程；不要通过清除站点数据、Key 或更换地址解决。安装候选、正式安装和桌面安装候选“当前”目录均不属于这条源码验收交付流程。

## 生产构建与离线

```bash
npm run build
npm run preview -- --host localhost --port 5174 --strictPort
```

先停止占用 5174 的开发服务。`preview` 仅用于本机检查生产构建。打开浏览器并等待“离线阅读已准备”，再断网刷新验证。不要把开发模式“可打开”当作离线准备完成。

生产构建采用相对路径，包含共享核心、懒加载面板和正式资料。Service Worker 保留当前与上一版缓存，新版等待显式更新；旧页面保持对应版本资料，过旧资源缺失时提示刷新。更新会清空该页的临时输入。OCR 引擎首次初始化、在线地图和模型不属于离线保证。

## 部署

将 `npm run build` 生成的 `dist/` 交给 HTTPS 静态托管服务。无需部署 Node 服务或数据库，不要部署整个源码目录或将 Vite 开发端口开放到公网。

构建自动生成 `dist/licenses/`：项目 GPL v3 全文、生产依赖的完整许可与 NOTICE，以及 OCR 来源和许可。不要在上传时删掉它或 `reader-ocr/` 下的许可文本。缺失依赖许可或安装版本与锁文件不一致时，构建会失败；先执行 `npm ci`，仍失败则核对该版本上游许可，不要关闭检查。补充材料来源见 [第三方许可说明](../THIRD_PARTY_NOTICES.md)。

部署压缩 JavaScript 仍属于向浏览器分发程序。请在发布说明或站点可访问的说明中提供与该构建一致的源码提交链接或源码包，包括构建脚本；修改版不能只指向本项目上游最新分支。构建附带许可文本不替代相应源码的提供。

GitHub Pages 配置位于 `.github/workflows/pages.yml`：

1. 默认只验证，不上传 Pages 产物或部署。维护者决定发布后，在 Settings → Pages 中选择 GitHub Actions 作为来源，并在 Actions 仓库变量中设置 `ENABLE_GITHUB_PAGES=true`。
2. 按工作流运行安装、lint、Node 测试、浏览器 E2E、资料校验与构建。
3. 只有部署开关开启时，`main` 的推送或手动工作流才会进入部署；PR 始终仅检查。关闭或删除该变量会停止后续自动部署，不会删除已经发布的网站。
4. 检查 Actions 的部署结果与 `github-pages` 环境显示的网址，在独立浏览器验证首次打开、刷新、子路径资源和备份下载，再对外提供链接。

工作流存在不代表仓库已公开、Pages 已启用或线上部署成功。发布与仓库可见性由维护者决定。

## 验证

```bash
npm run lint
npm test
npm run check:packages
npx playwright install chromium
npm run test:e2e
npm run build
git diff --check
```

E2E 使用独立端口 4174 和临时浏览器上下文、合成数据，不读取日常浏览器书架。截图、报告和跨版本测试构建写到忽略的 `artifacts/e2e/`。Windows 启动器回归在 Windows 上执行，在 Linux CI 中跳过；它使用服务替身，不等于跨设备启动器实测。

修改界面后检查窄屏、键盘及空状态；修改备份或持久化前阅读 [data-sync.md](data-sync.md)。不要升级 Dexie schema、清空替换导入或把密钥写入构建环境。发布正式书籍资料必须先 staging、preview，再获得显式 apply 授权。
