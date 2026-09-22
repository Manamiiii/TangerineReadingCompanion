# Tangerine Reading Companion

Tangerine Reading Companion（橘子阅读伴侣）是一个本地优先、尊重阅读进度的多端可安装个人阅读伴侣。当前已交付 Web/PWA，共享 Vite/React 核心；Windows、Android、iOS 按计划使用 Tauri 2 外壳。它按书和版本保存阅读进度、已遇到的人物与地点、个人备注和地图位置，并在展示资料与模型回答前执行剧透门禁。

多端平台支持、统一输入契约和按序验收清单见 [多端路线](docs/multiplatform-roadmap.md)。多端安装不代表自动同步，首阶段不加入账号或后端。

## 当前能力

- 内置书籍与个人书架；个人书籍支持文字封面或本机图片封面。
- 按章节保存进度，并记录当前已遇到的人物、地点、概念和事件。
- 页面文本、剪贴板或截图 OCR 输入；候选由读者确认后保存。
- 已批准资料与个人确认地点的地图展示。
- 当前内容依据查找：模型只选择原文和已解锁背景中的原句，不自由补充剧情。
- `safe` / `potential` / `high` 三级剧透控制。
- 智谱、DeepSeek、MiniMax、OpenAI 和自定义兼容接口的个人 BYOK 配置。
- JSON 备份与恢复；可直接导入 TangerineTools 全量备份中的阅读数据。
- IndexedDB 本地持久化和 PWA 安装。

## 本地运行

Node.js 需要满足 `>=20.19.0`。

```bash
npm install
npm run dev
```

开发服务器固定使用 `http://localhost:5174/`；端口被占用时会直接报错，不会自动切换到其他端口。

## 常用命令

| 命令 | 用途 |
|---|---|
| `npm run lint` | 静态检查 |
| `npm test` | 领域规则、资料包、迁移、输入与离线策略测试 |
| `npm run test:e2e` | 构建后在独立 Chromium 中运行阅读流程；首次先 `npx playwright install chromium` |
| `npm run check:native` | 只读检查原生构建环境，缺项时退出码 1 |
| `npm run build` | 生产构建 |
| `npm run check:packages` | 校验正式阅读资料包 |
| `npm run audit:quality` | 生成资料覆盖与来源质量报告 |
| `npm run audit:links` | 额外检查已批准来源链接 |
| `npm run preview:data` | 从 staging 构建发布预览 |
| `npm run check:preset` | dry-run 检查预览与正式资料包差异 |
| `npm run apply:preset` | 在显式确认后发布预览 |

## 数据与隐私

运行时数据保存在浏览器数据库 `tangerine-reading-companion` 的 `meta` 表中。粘贴段落、截图、OCR 原文和剧透授权不会持久化。模型与地图配置使用 `tangerine-reading-companion:*` 独立浏览器存储命名空间；普通旧配置迁移后保留旧键；旧地图 Key 迁入会话存储后移除持久副本。模型与地图 Key 只保存在当前浏览器会话中；模型、地图与瓦片服务的外发边界见 [产品与架构](docs/product-and-architecture.md) 和 [模型提示词契约](docs/model-prompts.md)。

完整备份采用同 key 覆盖、本地其他记录保留的合并语义。导入旧 TangerineTools 备份时，只读取 `readerState:` 和 `readerPersonalPackage:` 记录，忽略游戏及其他数据，并将旧场景下的同版本进度归一为版本级阅读状态。

## 结构

```text
src/platform/                     # 输入契约、平台能力和 Web 适配器
src/features/reading-companion/   # 阅读界面、领域规则、资料读取、地图与模型契约
src/styles/                       # 按功能拆分的样式，styles.css 保持导入顺序
src/features/model/               # 供应商连接与本机配置
src/features/ocr/                 # 本机 OCR
scripts/reading-companion/        # 资料 staging、校验、审计与发布
public/presets/reading-companion/ # 正式版本化资料包
tests/e2e/                        # 独立浏览器端到端测试
scripts/build-offline.mjs         # 生成资料内容指纹与离线缓存清单
docs/                             # 产品、安全、模型、数据与多端交付规范
```

原生环境、安装权限和后续验收见 [原生开发](docs/native-development.md)。E2E 使用独立端口 4174、临时浏览器上下文和合成数据，不读取日常浏览器书架；报告与截图在忽略的 `artifacts/e2e/`。

## 部署

仓库通过 `.github/workflows/pages.yml` 构建 GitHub Pages。CI 包含 lint、Node 测试、浏览器 E2E、资料校验和构建。生产构建使用相对路径，适配仓库子路径部署。应用只在生产模式注册 Service Worker，预缓存共享核心、全部按需组件和已发布资料；新版本准备完成后显示显式更新按钮。资料 JSON 使用内容指纹地址，旧标签页继续使用其原版资料；保留当前与上一版缓存，过旧页面提示刷新，不自动丢弃临时输入。OCR 首次初始化、在线地图和模型不属于离线保证。


浏览器更新测试会在忽略的 `artifacts/e2e/versions-*/` 中生成三份合成构建，并在独立本机端口验证两个标签页的更新、离线旧资料读取、缓存淘汰和懒加载失败恢复；不修改正式资料，也不读取日常浏览器数据。
