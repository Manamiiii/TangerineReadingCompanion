# 阅读伴侣模型提示词契约

本文定义当前段落名称识别、个人书籍运行时初始化和内置书正式预制使用的提示词边界。各路线共享名称类型、无剧透原则和“不确定则省略”原则，但输出权限不同，不能互换。

## 提示词目录

| 标识 | 使用位置 | 输入 | 允许输出 | 落库方式 |
|---|---|---|---|---|
| `reading-excerpt-entity-link-v1` | 读者显式分析当前段落 | 当前段落、书名、章节和最多 60 条已有资料名称索引 | 原文名称、类型、保守地点分类、置信度和索引内可选 `matchedEntityId` | 只显示候选；读者确认后写入已遇到记录 |
| `personal-book-knowledge-v1` | 用户在工具中创建或补充个人书籍 | 书名、作者、译者、出版社、出版时间、ISBN、原作语言 | 最多 50 个名称、原文名、别名、类型和保守地点分类 | 自动合并到个人书籍隐藏 `onDemandEntities` |
| `formal-reading-package-candidates-v3` | Codex 或其他维护模型预制内置书 | 版本信息、已核验公开来源摘录、可用的指定版本章节证据 | 带来源和阻塞项的实体、事实候选；可选的独立无剧情短注释及其精确来源 | 只能写入 staging；经过 preview 和显式 apply 才能发布 |

运行时提示词的可执行源位于 `src/features/reading-companion/model/promptCatalog.js`。修改其标识、消息或输出契约时必须同步更新本文和领域测试。缓存键包含提示词标识，升级标识会自然避开旧页面缓存。

供应商连接、HTTPS / localhost 校验、45 秒超时、JSON 解析和页面内临时缓存位于 `src/features/model/`，可由其他场景的受限模型任务复用。阅读提示词、输出权限和资料落库契约仍只属于阅读伴侣，不能被其他场景任务替换或放宽。

## 当前段落名称配对

`reading-excerpt-entity-link-v1` 只在读者点击模型识别后运行。应用把当前资料包中最多 60 条名称整理为只含稳定 id、标准名、原文名、别名、类型和保守地点分类的受限索引，不发送背景注释、关系、事实或未解锁剧情。模型识别段落中原样出现的名称，并在能确认是同一对象时从索引中逐字选择 `matchedEntityId`；无法可靠配对时返回 `null`。

应用丢弃索引外的 id，并以已配对资料的类型和地点性质为准。候选仍需读者确认才进入已遇到记录；确认后保留段落中的实际译名，同时保存资料实体 id，使不同译名能够复用同一份背景、地图和去重记录。读者编辑候选名称或类型时配对自动解除，避免修改后的文本沿用旧关系。

## 个人书籍运行时初始化

这条路线服务于“用户尚未读过本书”的场景。用户不需要审查模型列出的整本书知识：

- 结果不在初始化时完整展示，只作为隐藏精确匹配词典。
- 不生成关系、身份、命运、剧情、章节位置、解释、地图坐标或正式事实。
- 名称确实出现在当前阅读输入后才显示，由读者在眼前上下文中记录或忽略。
- 模型失败不影响书籍创建；重复执行只补充未存在的名称。

该输出是个人辅助资料，不是公开来源、指定版本证据或客观首次出现章节。

## 内置书正式预制

当用户要求“预制某本书”时，维护者使用 `formal-reading-package-candidates-v3`。用户只需尽可能提供版本信息；用户没有读过该书时，不要求其判断人物关系、剧情事实或首次出现章节。无法由来源和指定版本证据确定的内容保留为候选和阻塞项。

这里的“维护者审核”由准备内置资料包的开发者或代理完成，而不是由尚未读过本书的使用者完成。审核包括实际访问来源、核对每条说明是否被来源直接支持、检查指定译本名称、确认地图精度和虚构地点边界、评估剧透风险，并在存在章节展示条件时核对 `revealAt`。公开来源只能批准独立历史与地理背景；缺少指定译本章节证据的关系、剧情和首次出现位置不能靠模型记忆通过审核。

正式预制分为两步：

1. 维护者检索并核验可合法引用的书目、作者机构、图书馆、博物馆、政府地理和地图资料，把实际访问过的来源与必要摘录组成输入。
2. 模型把输入整理成 staging 候选。模型不能把自己的训练记忆声明为来源，也不能直接批准或发布候选。

### 标准系统提示词

```text
提示词版本：formal-reading-package-candidates-v3

你为 Tangerine Reading Companion 准备内置书资料包的研究候选。
只使用输入中列出的书籍版本、来源和证据；训练记忆只能帮助发现歧义，不能作为 sourceIds 或发布依据。
输出必须区分 sourceCandidates、entityCandidates 和 factCandidates，并适配版本化 staging。

规则：
1. 不复制大段受版权保护的原文，不补写缺失章节内容。
2. 每个实体或事实候选必须引用输入中真实存在的 sourceIds。
3. 没有指定译本章节证据时 revealAt 必须为 null，并加入 missing_edition_chapter_evidence。
4. 中文译名或别名未由指定版本确认时，加入 edition_aliases_not_audited。
5. 人物关系、身份、命运、剧情结果和与剧情相关的历史说明不得标为 safe。
6. 现实地点坐标必须来自输入中的地图或权威地理来源，并说明是点、范围、路径还是现代代表位置。
7. 虚构地点不得包含精确坐标；原型或模糊地点只能形成带置信度的候选区域。
8. 无法确认作品是否直接出现某名称时，加入 book_relevance_requires_confirmation。
9. status 只能是 candidate 或 rejected；模型不得输出 approved。
10. candidate 必须至少包含一个 blockers 项；宁可保留阻塞，也不要猜测。
11. 不要把候选内容放入正式 entities、facts 或 onDemandEntities。
12. 实体可以包含可选 safeNote，但只能概括来源明确支持、脱离作品剧情仍成立的背景知识，最长 400 字；不得解释该实体在书中的意义、关系、行动、命运或后续影响。
13. safeNote 必须同时给出非空 safeNoteSourceIds；其中每一项必须属于该候选的 sourceIds，并直接支持注释内容，不能把只支持名称、地图坐标或版本译名的来源列为注释来源。
14. 不能仅凭训练记忆生成 safeNote 或 safeNoteSourceIds。
15. 只返回 JSON，不返回解释性正文。
```

### 标准用户输入

```json
{
  "book": {
    "title": "书名",
    "author": "作者",
    "originalLanguage": "原作语言"
  },
  "edition": {
    "translators": [],
    "publisher": "出版社",
    "publishedAt": "出版时间",
    "isbn": "ISBN",
    "chapterLabels": []
  },
  "verifiedSources": [
    {
      "id": "source-stable-id",
      "label": "实际来源名称",
      "url": "实际访问地址",
      "organization": "发布机构",
      "accessedAt": "YYYY-MM-DD",
      "useFor": [],
      "evidence": "维护者提供的必要事实摘要或短摘录"
    }
  ],
  "editionEvidence": [
    {
      "chapterId": "chapter-stable-id",
      "evidence": "由用户提供或合法取得的最小必要章节证据"
    }
  ]
}
```

### 标准输出

```json
{
  "promptVersion": "formal-reading-package-candidates-v3",
  "sourceCandidates": [
    {
      "id": "source-stable-id",
      "status": "candidate",
      "kind": "book-metadata|edition-evidence|public-research|modern-geography|historical-map",
      "label": "实际来源名称",
      "organization": "发布机构",
      "url": "实际访问地址",
      "accessedAt": "YYYY-MM-DD",
      "useFor": [],
      "rightsStatus": "待维护者确认",
      "notes": "输入证据能支持什么，以及不能推出什么"
    }
  ],
  "entityCandidates": [
    {
      "status": "candidate",
      "entity": {
        "id": "stable-id",
        "name": "名称",
        "kind": "person|place|concept|event",
        "aliases": [],
        "revealAt": null,
        "safeNote": "可选；最长 400 字的独立无剧情背景说明",
        "safeNoteSourceIds": ["直接支持 safeNote 的 source-stable-id"]
      },
      "sourceIds": ["source-stable-id"],
      "blockers": ["missing_edition_chapter_evidence"],
      "notes": "当前证据支持什么，以及不能推出什么"
    }
  ],
  "factCandidates": [
    {
      "status": "candidate",
      "fact": {
        "id": "stable-id",
        "kind": "spatial|character|plot|history|concept",
        "content": "候选事实",
        "entityIds": [],
        "revealAt": null,
        "riskLevel": "safe|potential|high",
        "riskCategories": [],
        "confidence": 0
      },
      "sourceIds": ["source-stable-id"],
      "blockers": ["missing_edition_chapter_evidence"],
      "notes": "当前证据支持什么，以及不能推出什么"
    }
  ]
}
```

模型输出还要经过 `scripts/reading-companion/lib/package-pipeline.mjs` 的结构校验。公开来源能支持名称或现代地理信息时，可以先形成隐藏按需匹配候选；公开来源不能代替指定译本的 `revealAt` 证据。
