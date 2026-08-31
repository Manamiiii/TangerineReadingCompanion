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

游戏场景、资料表、收集记录和其他 `meta` 项全部忽略。阅读状态与个人书籍在写入前执行结构校验。阅读状态的规范 key 为 `readerState:{editionId}`。旧备份可能在多个场景保存同一版本的阅读状态；导入时移除场景维度并按 `editionId` 归一，同一版本存在多条记录时保留 `updatedAt` 较新的记录。浏览器中已有的旧场景记录也会在首次读取该版本时懒复制到规范 key，旧记录保留，后续只写规范 key。

该兼容流程不读取或修改原 TangerineTools 数据库。用户先下载 JSON 文件，再在阅读伴侣中明确选择导入。

## 可靠性与迁移确认

导入文件先校验并预览新增、同 key 覆盖和保留数量，不立即写入。统计按规范化阅读 key 计算；同 key 覆盖整条记录，不做字段级合并。文件上限为 50 MB。应用要求先下载本机阅读备份并由读者确认文件已保存，才开放合并按钮。浏览器只能确认下载已发起，最近备份时间也只表示发起时间，不宣称文件保存成功。

合并在单个 Dexie 写事务中执行。预览持有仅在内存中的数据库快照，写入前再次比较；另一标签页或当前阅读操作改变了本机数据时拒绝导入，要求重新预览和备份。事务失败不留下部分导入；备份中缺少的本机 key 和旧场景记录不会删除。完成后明确显示结果，由读者刷新页面使用导入数据，不自动重载丢失临时输入。

旧场景懒复制在选书后的独立写事务中运行；React 的 liveQuery 只读取状态，不执行迁移写入。读取与迁移共用按版本选择最新记录的规则，旧记录保留，不升级 schema。

持久存储申请由浏览器决定，拒绝或不支持不阻止阅读与 JSON 备份；持久存储也不能防止用户手动清理。多端数据和存储权限各自独立，原生与浏览器先采用 JSON 迁移，不假设共用 IndexedDB。
