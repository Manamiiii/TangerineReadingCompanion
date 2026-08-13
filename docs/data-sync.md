# 阅读数据存储与迁移

## IndexedDB

数据库名为 `tangerine-reading-companion`。Dexie schema v1 仅包含：

```js
meta: 'key'
```

个人书籍使用 `readerPersonalPackage:` 前缀，阅读进度与个人记忆使用 `readerState:` 前缀。模型供应商地址和模型 ID 位于 `localStorage`，API Key 位于 `sessionStorage`，均不属于备份。

## 专用备份

备份格式为：

```json
{
  "format": "tangerine-reading-companion-backup",
  "schemaVersion": 1,
  "exportedAt": "ISO-8601",
  "data": { "meta": [] }
}
```

导入校验 `format`、`schemaVersion` 和 `data.meta`，只接受阅读键。相同 key 覆盖，本地其他 key 保留。

## TangerineTools 兼容导入

导入器也接受 TangerineTools 的全量 JSON 备份。它只提取：

- `readerPersonalPackage:*`
- `readerState:*`

游戏场景、资料表、收集记录和其他 `meta` 项全部忽略。旧备份可能在多个场景保存阅读状态；导入时按 `editionId` 归一为 `scene-reading-companion`，同一版本存在多条记录时保留 `updatedAt` 较新的记录。

该兼容流程不读取或修改原 TangerineTools 数据库。用户先下载 JSON 文件，再在阅读伴侣中明确选择导入。
