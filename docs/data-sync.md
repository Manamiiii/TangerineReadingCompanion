# 阅读数据存储与迁移

## IndexedDB

数据库名为 `tangerine-reading-companion`。Dexie schema v1 仅包含：

```js
meta: 'key'
```

个人书籍使用 `readerPersonalPackage:` 前缀，阅读进度与个人记忆使用 `readerState:` 前缀。模型供应商地址、模型 ID 与地图设置使用 `tangerine-reading-companion:*` 命名空间保存在 `localStorage`，API Key 位于同一命名空间的 `sessionStorage`，均不属于备份。首次升级会复制旧版阅读配置但不删除旧键，之后只写新命名空间。

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

导入器也接受 TangerineTools schema v1 的全量 JSON 备份。兼容识别要求文件不声明其他 `format`，并包含全量备份的 `scenes`、`catalogTables`、`catalogFields`、`catalogRows` 和 `meta` 数组；仅有任意 `data.meta` 的未知 JSON 不会被当成旧备份。导入时只提取：

- `readerPersonalPackage:*`
- `readerState:*`

游戏场景、资料表、收集记录和其他 `meta` 项全部忽略。阅读状态与个人书籍在写入前执行结构校验。旧备份可能在多个场景保存阅读状态；导入时按 `editionId` 归一为 `scene-reading-companion`，同一版本存在多条记录时保留 `updatedAt` 较新的记录。

该兼容流程不读取或修改原 TangerineTools 数据库。用户先下载 JSON 文件，再在阅读伴侣中明确选择导入。
