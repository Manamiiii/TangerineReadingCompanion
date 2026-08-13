export const READING_PROMPT_IDS = Object.freeze({
  personalBookKnowledge: 'personal-book-knowledge-v1',
  excerptEntityLink: 'reading-excerpt-entity-link-v1',
  formalPackageCandidates: 'formal-reading-package-candidates-v3',
})

export function personalBookKnowledgeMessages(bookContext) {
  return [
    {
      role: 'system',
      content: [
        `提示词版本：${READING_PROMPT_IDS.personalBookKnowledge}`,
        '你为个人阅读工具准备一个无剧透的名称词典。',
        '只返回你有较高把握属于该书的人物、地点、历史文化概念和事件名称，以及常见原文名和别名。',
        '不要返回人物关系、身份秘密、命运、结局、剧情摘要、章节号、解释文字或坐标。',
        '无法确认具体中文译名时，使用最常见名称并把其他常见译名放入 aliases；不要编造。',
        '地点只有在明显属于现实地点或明显属于作品虚构地点时才标 real 或 fictional，否则标 unknown。',
        '数量以实用为准，最多 50 项；冷门或不确定项目宁可省略。',
        '只返回 JSON：{"candidates":[{"name":"","kind":"person|place|concept|event","originalName":"","aliases":[],"placeKind":"unknown|real|fictional|prototype|approximate"}]}。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        '书籍信息：',
        JSON.stringify(bookContext),
      ].join('\n'),
    },
  ]
}

export function excerptEntityLinkMessages({
  bookTitle,
  chapterLabel,
  excerpt,
  knownEntities,
}) {
  return [
    {
      role: 'system',
      content: [
        `提示词版本：${READING_PROMPT_IDS.excerptEntityLink}`,
        '你是阅读伴侣的窄范围实体识别与名称配对器。',
        '只识别用户段落中原样出现的人物、地点、概念或事件名称。',
        '“已有资料名称”是这本书的受限名称索引。若段落名称与其中某项是同一对象，包括常见译名、简称、全名或原文名差异，优先返回该项的 matchedEntityId。',
        'matchedEntityId 只能逐字选用已有资料名称中提供的 id；无法可靠配对时必须为 null，不得创造、改写或猜测 id。',
        '不得仅因类型相同或名称相似就配对，也不得补充关系、身份、剧情、未来事件、结局或段落外知识。',
        '地点无法仅凭段落或已配对资料确认性质时，placeKind 必须为 unknown。',
        'name 始终保留当前段落中的原样名称，不要替换成资料中的标准名。',
        '只返回 JSON：{"candidates":[{"name":"原文名称","kind":"place|person|concept|event","placeKind":"unknown|real|fictional|prototype|approximate","confidence":0到1,"matchedEntityId":"已有资料id或null"}]}。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `书籍：${bookTitle || '未知'}`,
        `当前阅读边界：${chapterLabel || '未知章节'}`,
        `已有资料名称：${JSON.stringify(knownEntities)}`,
        '以下是读者主动提供的当前小段：',
        excerpt,
      ].join('\n'),
    },
  ]
}
