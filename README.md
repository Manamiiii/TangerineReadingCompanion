# 橘子阅读伴侣 · Tangerine Reading Companion

**读长篇时，记住已经遇到的人物和地点，按当前章节回顾自己的笔记，减少搜索时碰到后续剧情的机会。**

适合边读边记、容易忘记名称、希望自己掌握阅读进度的中文读者。你在原来的电子书应用或纸书上阅读，在这里记录；本工具不提供书籍正文，也不会连接或读取你的微信读书账号。

当前是可本地运行、自行部署的 Web/PWA 试用版本。无需注册；记录、备注和备份不需要 AI 或 API Key。Windows、Android、iOS 原生安装包尚未提供。

![实际界面：按章节回顾读者确认的名称与备注，使用虚构测试书演示](docs/images/reading-memory.png)

## 能帮你做什么

- **记住读过的名称**：粘贴一小段内容，匹配已有名称，或选中文字手动记录。在“已遇到”中检索、补记出现章节、保存个人备注。
- **按进度回顾**：退回较早章节时，较后章节的记录与位置隐藏。内置背景只在对应名称被确认后出现；这不是对任意外部内容“绝不剧透”的保证。
- **理解地点**：把自己确认的现实地点放在地图上；虚构或位置模糊的地点只能用明确标注的参考区域，不能当作精确坐标。
- **自己保管数据**：书架与记录保存在当前浏览器，通过 JSON 显式备份和迁移，不需要账号或后端。

可选辅助包括本机截图 OCR、模型名称识别和当前内容依据摘录。模型只产生受限候选；依据摘录只来自当前原文或已解锁背景，不提供自由剧情问答。

### 内置资料的实际范围

当前只有《飘》范纯海 / 夏旻译、长江文艺出版社、2018-05、ISBN 9787570202188，章节为 1–63。资料包含 40 个隐藏的按需匹配名称和部分独立背景说明；**不含完整人物关系、逐章剧情解读或已发布的章节事实**。其他书可以创建个人书籍，自行积累记录，不代表自动获得完整知识库。

## 快速开始

需要 Node.js `^20.19.0 || >=22.12.0`，可使用 `.nvmrc` 指定的版本；用 Git 下载需要先安装 Git。首次安装依赖需要联网，不需要管理员权限或原生编译工具链。

```bash
git clone https://github.com/Manamiiii/TangerineReadingCompanion.git
cd TangerineReadingCompanion
npm ci
npm run dev
```

也可在 GitHub 点击 **Code → Download ZIP**，解压后在包含 `package.json` 的目录打开终端，从 `npm ci` 开始。安装失败时先核对 `node --version` 和网络。

打开 **http://localhost:5174/**，保持终端运行。按 `Ctrl+C` 停止服务。端口被占用会报错，不会悄悄换地址；如果已经运行本项目，直接打开原地址即可。

Windows PowerShell 若提示不允许执行 `npm.ps1`，使用 `npm.cmd ci` 和 `npm.cmd run dev`，无需修改系统执行策略。安装依赖后，也可双击仓库根目录的 `TangerineReadingCompanion.vbs`，查看启动状态并打开浏览器。这个快捷入口启动的是本地开发服务，不是原生安装包，开发模式不启用离线缓存。详见[运行与开发说明](docs/development.md)。

### 第一次使用：先完成一个无需 AI 的记录

1. 点击“添加书籍”，填写书名、作者和章节数，点击“创建并开始阅读”；其他字段可以留空，AI 选项默认不勾选。
2. 先设置“我已经读到”的章节。
3. 到“已遇到”，输入一个刚读到的名称，选择类型，点击“记在第 N 章”。也可在“阅读输入”粘贴一小段文字并选中名称记录。
4. 点击该记录的“查看详情”，写一条“个人备注”并点击“保存备注”。刷新后，记录仍在；临时原文不会恢复。
5. 点击右上角“数据管理 → 导出备份”，确认 JSON 文件已经保存。下次从书架“继续上次阅读”进入。

想体验内置匹配，可以选择《飘》并在段落框输入“亚特兰大”；这仅用于验证名称匹配，不代表它在你选择的章节出现过。实际阅读中只记录你确实读到的内容。更详细的步骤见[试用说明](docs/trial-guide.md)。

## 数据、隐私与限制

- **数据按浏览器和网站地址隔离**：`localhost`、`127.0.0.1`、不同端口、不同浏览器或部署域名不是同一个书架。迁移前先导出，再在新地址导入；没有自动同步。
- **请保留 JSON 备份**：清理网站数据、无痕会话结束、浏览器回收存储都可能让记录丢失。持久存储申请不替代备份。备份含个人书目、备注和位置，请妥善保管。
- 导入先预览并要求导入前备份；同一 key 的整条记录会被覆盖，备份中没有的其他本机记录保留。它不逐字段合并，不能把旧备份当成“只添加新内容”。详见[数据与迁移](docs/data-sync.md)。
- 原文、截图、OCR 原文、模型临时结果及剧透授权不持久化，刷新、切书或切换章节会清空相关临时输入。你主动保存的名称、备注、封面，以及可选生成的隐藏名称词典会保留。
- 模型功能由你提供 API Key，可能产生服务商费用。仅在明确使用相关功能时外发；书目截图在模型配置完整时会把 OCR 文字发送到所选接口校对。接口必须允许浏览器跨域调用。模型名和免费额度以服务商控制台为准，见[模型配置](docs/model-provider-setup.md)。
- Key 只存放在当前 `sessionStorage`，不进入数据库或导出；浏览器恢复会话可能恢复会话存储。在共用电脑上用完应在设置中清空 Key 并保存。
- OCR 在设备上识别，首次引擎加载可能需要联网，速度和准确率取决于设备及图片；识别后请核对。打开地图会访问外部瓦片服务，搜索会发送你提交的地名；地图和模型均不保证离线或始终可用。
- “试用反馈”导出的是单书诊断与阅读记录，**仍含个人备注，不是匿名文件，也不能用于恢复备份**。分享前检查内容，不要将完整备份或 Key 提交到公开 Issue。

## 安装、部署与常见问题

**可以直接下载 EXE / APK 吗？** 当前没有原生安装包。浏览器支持时，可将生产站点安装为 PWA；它仍使用对应浏览器的数据与权限。[多端路线](docs/multiplatform-roadmap.md)描述的是后续计划。

**如何部署？** 运行 `npm ci`、`npm run build`，将生成的 `dist/` 部署到支持 HTTPS 的静态网站。不要把 `npm run dev` 暴露到公网，也不要直接双击 `dist/index.html`。仓库有 GitHub Pages 工作流，但不把它当作已经可用的在线演示：部署者需启用 Pages 的 GitHub Actions 来源，并检查工作流及最终网址。详见[部署说明](docs/development.md#部署)。

**能离线吗？** 生产站点显示“离线阅读已准备”后，阅读界面、内置资料与本机记录可离线使用；模型、在线地图和首次 OCR 不在保证范围内。开发模式不启用这项缓存。新版就绪会提示手动更新，刷新前请处理好临时输入。

**粘贴按钮不工作？** 先直接点击段落框按 `Ctrl+V`（macOS 用 `⌘V`）。自动读取剪贴板受浏览器权限及 HTTPS/localhost 环境限制。

**个人书籍没有自动匹配？** 未准备词典时属于正常情况，可以先手动记录；已有名称之后会参与本机匹配。AI 辅助在书内“设置”配置，完全可选。

**如何反馈问题？** 提交操作步骤、期望与实际结果、系统/浏览器版本；可附去除私人内容的截图。请勿公开粘贴 Key、书籍原文、完整备份或未经检查的反馈包。

## 开发

静态前端：Vite、React、Dexie、Leaflet。没有账号系统和后端。依赖与版本以 `package.json` 和锁文件为准。

| 命令 | 用途 |
|---|---|
| `npm run dev` | 本地开发，固定端口 5174 |
| `npm run lint` | 静态检查 |
| `npm test` | 领域、数据边界、迁移、离线及启动器测试 |
| `npm run test:e2e` | 独立 Chromium 浏览器测试；首次先 `npx playwright install chromium` |
| `npm run build` | 生成 `dist/` |
| `npm run preview -- --host localhost --port 5174 --strictPort` | 本机验证生产构建；先停止开发服务 |
| `npm run check:packages` | 校验正式资料包 |
| `npm run check:native` | 只读检查原生环境，不安装工具 |
| `npm run audit:quality` / `npm run audit:links` | 资料覆盖与来源审计，后者访问来源链接 |
| `npm run preview:data` / `npm run check:preset` | staging 生成预览 / dry-run 检查差异 |
| `npm run apply:preset` | 仅在显式批准后发布正式资料 |

```text
src/platform/                     # 平台输入与导出适配
src/features/reading-companion/    # 阅读、书架、记录、地图与资料规则
src/features/model/               # 可选模型连接与配置
src/features/ocr/                 # 本机 OCR
src/components/                   # 数据管理、离线状态与公共组件
src/styles/                       # 按功能拆分的样式
public/presets/reading-companion/  # 正式版本化资料
public/icons/                     # 网页与 PWA 图标
assets/                           # 图标原图和 Windows ICO
scripts/reading-companion/        # 资料 staging、校验与发布
scripts/build-offline.mjs          # 离线资源与内容指纹
scripts/launch-desktop.ps1         # Windows 本地启动器
scripts/tests/、tests/e2e/         # Node 与浏览器测试
docs/                             # 产品、安全与开发说明
```

[系统能力](docs/system-capabilities.md) · [产品与架构](docs/product-and-architecture.md) · [模型边界](docs/model-prompts.md) · [运行与开发](docs/development.md) · [原生开发](docs/native-development.md)

## License

本项目原创代码与文档采用 **GNU General Public License v3.0 only**（`GPL-3.0-only`），完整条款见 [LICENSE](LICENSE)。Copyright (C) 2026 Tangerine Reading Companion contributors.

欢迎使用、学习、修改与分享，也允许商用。分发本项目或受 GPL 约束的修改版时，须保留许可与版权声明，并依 GPL v3 提供相应源码；仅公开压缩后的构建产物不足以履行源码义务。软件按原样提供，不作担保。以上为简要说明，以许可证全文为准。

第三方依赖、OCR 语言资源、地图和书籍参考资料保留各自的授权条件，项目许可证不重新授权这些内容，也不要求你公开自己的阅读记录。来源与分发注意事项见 [第三方许可说明](THIRD_PARTY_NOTICES.md)；图标来源见 [assets/README.md](assets/README.md)。
