# Tangerine Reading Companion

Tangerine Reading Companion（橘子阅读伴侣）是一个本地优先、尊重阅读进度的个人阅读 Web App。它按书和版本保存阅读进度、已遇到的人物与地点、个人备注和地图位置，并在展示资料与模型回答前执行剧透门禁。

## 当前能力

- 内置书籍与个人书架；个人书籍支持文字封面或本机图片封面。
- 按章节保存进度，并记录当前已遇到的人物、地点、概念和事件。
- 页面文本、剪贴板或截图 OCR 输入；候选由读者确认后保存。
- 已批准资料与个人确认地点的地图展示。
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
| `npm test` | 领域规则、资料包和迁移测试 |
| `npm run build` | 生产构建 |
| `npm run check:packages` | 校验正式阅读资料包 |
| `npm run audit:quality` | 生成资料覆盖与来源质量报告 |
| `npm run audit:links` | 额外检查已批准来源链接 |
| `npm run preview:data` | 从 staging 构建发布预览 |
| `npm run check:preset` | dry-run 检查预览与正式资料包差异 |
| `npm run apply:preset` | 在显式确认后发布预览 |

## 数据与隐私

运行时数据保存在浏览器数据库 `tangerine-reading-companion` 的 `meta` 表中。粘贴段落、截图、OCR 原文和剧透授权不会持久化。模型与地图配置使用 `tangerine-reading-companion:*` 独立浏览器存储命名空间；升级后会复制旧阅读配置但不删除旧键。模型 Key 只保存在当前浏览器会话中；模型、地图与瓦片服务的外发边界见 [产品与架构](docs/product-and-architecture.md) 和 [模型提示词契约](docs/model-prompts.md)。

完整备份采用同 key 覆盖、本地其他记录保留的合并语义。导入旧 TangerineTools 备份时，只读取 `readerState:` 和 `readerPersonalPackage:` 记录，忽略游戏及其他数据，并将旧场景下的同版本进度归一为版本级阅读状态。

## 结构

```text
src/features/reading-companion/   # 阅读界面、领域规则、资料读取、地图与模型契约
src/features/model/               # 供应商连接与本机配置
src/features/ocr/                 # 本机 OCR
scripts/reading-companion/        # 资料 staging、校验、审计与发布
public/presets/reading-companion/ # 正式版本化资料包
docs/                             # 产品、安全、模型和数据规范
```

## 部署

仓库通过 `.github/workflows/pages.yml` 构建 GitHub Pages。生产构建使用相对路径，适配仓库子路径部署。
