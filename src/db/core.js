import Dexie from 'dexie'

export const db = new Dexie('tangerine-reading-companion')

// 阅读状态和个人书籍均是不需要额外索引的本地记录。保持 v1，后续升级必须先设计迁移。
db.version(1).stores({
  meta: 'key',
})
