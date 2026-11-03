# 本地运行与部署

## 安装与地址

完整获取与安装步骤见 [README](../README.md#快速开始)。使用锁文件执行 `npm ci`；不需要 `.env` 或服务器端密钥。`VITE_APP_BUILD` 仅用于构建标识，可不设置，不是 Key 配置入口。模型和地图设置在应用中填写。

本机路径和配置不写入源码；额外本机文件保存在仓库外或忽略的 `.private/`，不得放到 `public/`。构建会先执行隐私检查；完整规则与检查范围见[本机私有信息说明](local-privacy.md)。

开发地址固定为 `http://localhost:5174/`。请持续使用同一浏览器及地址，否则会看到不同的本机书架。不要为了绕过端口冲突直接更换端口；先检查是否已有服务。换域名或设备前先导出 JSON，在目标地址预览并合并导入。

## Windows 快捷入口

安装 Node.js 并执行 `npm ci` 后，双击根目录 `TangerineReadingCompanion.vbs`。启动器在后台运行 Vite，复用已就绪服务，在状态窗口中显示进度与错误，然后打开默认浏览器。它不安装依赖、不请求管理员权限，也不是 Windows 原生安装包。若系统禁用了 WScript，可直接使用终端方式。

可以自己为该 VBS 创建快捷方式，并选用 `assets/tangerine-reading-companion.ico`。仓库不要求作者本机的桌面目录或绝对路径。

关闭浏览器不停止后台服务；注销或重启 Windows 会结束服务。启动窗口的“停止等待”只停止等待及自动打开浏览器。故障日志位于忽略的 `artifacts/launcher-error.log`、`launcher-server.log` 和 `launcher-server-error.log`，分享前检查本机路径等信息。

只检查启动、不打开窗口或浏览器：

```powershell
powershell -NoProfile -File scripts/launch-desktop.ps1 -NoOpenBrowser
```

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

1. 仓库维护者在 Settings → Pages 中选择 GitHub Actions 作为来源。
2. 按工作流运行安装、lint、Node 测试、浏览器 E2E、资料校验与构建。
3. 只有 `main` 的推送或手动工作流会进入部署；PR 仅检查。
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
