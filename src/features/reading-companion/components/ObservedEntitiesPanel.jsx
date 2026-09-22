import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, UserRoundSearch } from 'lucide-react'
import { generateId } from '../../../utils.js'
import { Modal } from '../../../components/common.jsx'
import { ReadingSafeNote } from './ReadingSafeNote.jsx'
import { clearObservedPlaceLocation, OBSERVED_ENTITY_KIND, OBSERVED_PLACE_KIND, matchOnDemandEntity, observedEntityEncounterChapterIds, upsertObservedEntity, updateObservedEntityNote, updateObservedPlaceKind, visibleObservedEntities } from '../domain/readingCompanion.js'
import { PLACE_KIND_LABELS, OBSERVED_KIND_LABELS, OBSERVED_PLACE_KIND_LABELS, OBSERVED_PLACE_KIND_DESCRIPTIONS, observedRecordAction } from './readerUi.js'

function ObservedPagination({
  page,
  pageSize,
  totalPages,
  totalItems,
  onPageChange,
  onPageSizeChange,
}) {
  return (
    <div className="reader-observed-pagination">
      <span>共 {totalItems} 条</span>
      <label>
        每页
        <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
          {[10, 20, 50].map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <button type="button" disabled={page <= 1} onClick={() => onPageChange(1)}>首页</button>
      <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>上一页</button>
      <label>
        第
        <input
          type="number"
          min="1"
          max={totalPages}
          value={page}
          onChange={(event) => onPageChange(Number(event.target.value))}
          aria-label="跳转到指定页"
        />
        / {totalPages} 页
      </label>
      <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>下一页</button>
      <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(totalPages)}>末页</button>
    </div>
  )
}


export function ObservedEntitiesPanel({
  observedEntities,
  onDemandEntities,
  sources,
  currentChapterId,
  currentChapter,
  chapters,
  onChange,
  onOpenMap,
}) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState(OBSERVED_ENTITY_KIND.PLACE)
  const [placeKind, setPlaceKind] = useState(OBSERVED_PLACE_KIND.UNKNOWN)
  const [status, setStatus] = useState('')
  const [kindFilter, setKindFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('first')
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [noteDrafts, setNoteDrafts] = useState({})
  const [selectedEntityId, setSelectedEntityId] = useState('')
  const currentAction = observedRecordAction(
    observedEntities,
    name,
    kind,
    currentChapterId,
    chapters,
  )
  const visibleEntities = useMemo(
    () => visibleObservedEntities(observedEntities, currentChapterId, chapters),
    [observedEntities, currentChapterId, chapters],
  )
  const hiddenCount = observedEntities.length - visibleEntities.length
  const currentIndex = chapters.findIndex(chapter => chapter.id === currentChapterId)
  const visibleEncounters = entity => observedEntityEncounterChapterIds(entity, chapters)
    .filter(id => chapters.findIndex(chapter => chapter.id === id) <= currentIndex)
  const filteredEntities = useMemo(
    () => visibleEntities
      .filter((entity) => kindFilter === 'all' || entity.kind === kindFilter)
      .filter(entity => [entity.name, entity.note].some(value => String(value || '').normalize('NFKC').toLocaleLowerCase().includes(query.trim().normalize('NFKC').toLocaleLowerCase())))
      .sort((left, right) => {
        if (sort === 'name') return left.name.localeCompare(right.name, 'zh-CN')
        if (sort === 'recent') {
          const latest = entity => Math.max(-1, ...observedEntityEncounterChapterIds(entity, chapters).map(id => chapters.findIndex(chapter => chapter.id === id)).filter(index => index <= currentIndex))
          return latest(right) - latest(left) || left.name.localeCompare(right.name, 'zh-CN')
        }
        const leftChapter = chapters.findIndex((item) => item.id === left.firstSeenChapterId)
        const rightChapter = chapters.findIndex((item) => item.id === right.firstSeenChapterId)
        return leftChapter - rightChapter || left.name.localeCompare(right.name, 'zh-CN')
      }),
    [visibleEntities, kindFilter, chapters, query, sort, currentIndex],
  )
  const totalPages = Math.max(1, Math.ceil(filteredEntities.length / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const pageEntities = filteredEntities.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  )
  const groupedPageEntities = Object.entries(OBSERVED_KIND_LABELS)
    .map(([groupKind, label]) => ({
      kind: groupKind,
      label,
      entities: pageEntities.filter((entity) => entity.kind === groupKind),
    }))
    .filter((group) => group.entities.length > 0)
  const selectedEntity = visibleEntities.find((entity) => entity.id === selectedEntityId) || null
  const selectedEncounterChapterIds = selectedEntity
    ? visibleEncounters(selectedEntity)
    : []
  const selectedEncounterChapters = selectedEncounterChapterIds
    .map((chapterId) => chapters.find((item) => item.id === chapterId))
    .filter(Boolean)
  const selectedMatch = selectedEntity
    ? matchOnDemandEntity(
        onDemandEntities,
        selectedEntity.name,
        selectedEntity.kind,
        selectedEntity.packageEntityId,
      )
    : null
  const selectedNoteDraft = selectedEntity
    ? (noteDrafts[selectedEntity.id] ?? selectedEntity.note ?? '')
    : ''

  useEffect(() => {
    setPage(1)
  }, [kindFilter, pageSize, query, sort])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  useEffect(() => {
    if (selectedEntityId && !selectedEntity) setSelectedEntityId('')
  }, [selectedEntityId, selectedEntity])

  function changePage(nextPage) {
    if (!Number.isFinite(nextPage)) return
    setPage(Math.min(Math.max(1, Math.trunc(nextPage)), totalPages))
  }

  async function addObservedEntity(event) {
    event.preventDefault()
    setStatus('')
    try {
      const update = current => upsertObservedEntity(current, {
        id: generateId('observed'),
        name,
        kind,
        placeKind,
        firstSeenChapterId: currentChapterId,
      }, chapters)
      await onChange(update)
      setName('')
      setPlaceKind(OBSERVED_PLACE_KIND.UNKNOWN)
      setStatus(
        currentAction.type === 'move-earlier'
          ? `已从${currentAction.existingChapter?.label || '较后章节'}提前到${currentChapter?.label || '当前章'}。`
          : currentAction.type === 'record-again'
            ? `已补记${currentChapter?.label || '当前章'}的出现。`
            : `已把首次遇到位置记在${currentChapter?.label || '当前章'}。`,
      )
    } catch (error) {
      setStatus(error?.message || '保存失败')
    }
  }

  async function removeObservedEntity(id) {
    setStatus('')
    try {
      await onChange(current => current.filter((entity) => entity.id !== id))
    } catch (error) {
      setStatus(error?.message || '删除失败')
    }
  }

  async function removeObservedMapLocation(id) {
    setStatus('')
    try {
      await onChange(current => clearObservedPlaceLocation(current, id))
      setStatus('已清除个人地图位置，名称和首次遇到章节仍然保留。')
    } catch (error) {
      setStatus(error?.message || '清除地图位置失败')
    }
  }

  async function changeObservedPlaceKind(id, nextPlaceKind) {
    setStatus('')
    try {
      await onChange(current => updateObservedPlaceKind(current, id, nextPlaceKind))
      setStatus(
        nextPlaceKind === OBSERVED_PLACE_KIND.REAL
          ? '已标记为现实地点，可以在地图区域搜索位置。'
          : '地点性质已更新。',
      )
    } catch (error) {
      setStatus(error?.message || '更新地点性质失败')
    }
  }

  async function recordObservedAgain(entity) {
    setStatus('')
    try {
      const update = current => upsertObservedEntity(current, {
        id: entity.id,
        name: entity.name,
        kind: entity.kind,
        placeKind: entity.placeKind,
        firstSeenChapterId: currentChapterId,
      }, chapters)
      await onChange(update)
      setStatus(`已补记“${entity.name}”在${currentChapter?.label || '当前章'}的出现。`)
    } catch (error) {
      setStatus(error?.message || '记录本章出现失败')
    }
  }

  async function saveObservedNote(entity) {
    setStatus('')
    try {
      const draft = noteDrafts[entity.id] ?? entity.note ?? ''
      await onChange(current => updateObservedEntityNote(current, entity.id, draft))
      setNoteDrafts((current) => {
        const next = { ...current }
        delete next[entity.id]
        return next
      })
      setStatus(draft.trim() ? `已保存“${entity.name}”的个人备注。` : `已清除“${entity.name}”的个人备注。`)
    } catch (error) {
      setStatus(error?.message || '保存个人备注失败')
    }
  }

  return (
    <section className="reader-panel">
      <div className="reader-panel-heading">
        <div>
          <UserRoundSearch size={20} />
          <h3>管理已遇到的名称</h3>
        </div>
      </div>
      <form className="reader-observed-form" onSubmit={addObservedEntity}>
        <label>
          <span>名称</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：刚刚读到的人名或地名"
            maxLength={120}
          />
        </label>
        {kind === OBSERVED_ENTITY_KIND.PLACE && (
          <label>
            <span>地点性质</span>
            <select value={placeKind} onChange={(event) => setPlaceKind(event.target.value)}>
              {Object.entries(OBSERVED_PLACE_KIND_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span>类型</span>
          <select value={kind} onChange={(event) => setKind(event.target.value)}>
            {Object.entries(OBSERVED_KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="btn reader-observed-add"
          disabled={!name.trim() || currentAction.type === 'recorded'}
        >
          <Plus size={15} /> {currentAction.label}
        </button>
      </form>
      {kind === OBSERVED_ENTITY_KIND.PLACE && (
        <details className="reader-place-kind-guide">
          <summary>地点性质怎么选</summary>
          <dl>
            {Object.entries(OBSERVED_PLACE_KIND_LABELS).map(([value, label]) => (
              <div key={value}>
                <dt>{label}</dt>
                <dd>{OBSERVED_PLACE_KIND_DESCRIPTIONS[value]}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      {status && <p className="reader-observed-status" role="status">{status}</p>}
      <div className="reader-memory-search">
        <label>检索已遇到记录<input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索已解锁名称或个人备注" /></label>
        <label>排序<select value={sort} onChange={event => setSort(event.target.value)}>
          <option value="first">首次遇到</option><option value="recent">最近遇到</option><option value="name">名称</option>
        </select></label>
      </div>
      <div className="reader-observed-toolbar">
        <div className="reader-observed-filters" aria-label="按类型筛选">
          {[['all', '全部'], ...Object.entries(OBSERVED_KIND_LABELS)].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={kindFilter === value ? 'active' : ''}
              onClick={() => setKindFilter(value)}
            >
              {label}
              <span>
                {value === 'all'
                  ? visibleEntities.length
                  : visibleEntities.filter((entity) => entity.kind === value).length}
              </span>
            </button>
          ))}
        </div>
      </div>
      {pageEntities.length > 0 ? (
        <div className="reader-observed-groups">
          {groupedPageEntities.map((group) => (
            <section className="reader-observed-group" key={group.kind}>
              <h4>{group.label}<span>{group.entities.length}</span></h4>
              <div className="reader-observed-list">
          {group.entities.map((entity) => {
            const encounterChapterIds = visibleEncounters(entity)
            const encounterChapters = encounterChapterIds
              .map((chapterId) => chapters.find((item) => item.id === chapterId))
              .filter(Boolean)
            const firstChapter = encounterChapters[0]
            const latestChapter = encounterChapters.at(-1)
            const match = matchOnDemandEntity(
              onDemandEntities,
              entity.name,
              entity.kind,
              entity.packageEntityId,
            )
            return (
              <div className="reader-observed-item" key={entity.id}>
                <div className="reader-observed-item-heading">
                  <strong>{entity.name}</strong>
                  {entity.kind === OBSERVED_ENTITY_KIND.PLACE && (
                    <span>{OBSERVED_PLACE_KIND_LABELS[entity.placeKind] || '不确定'}</span>
                  )}
                </div>
                <dl className="reader-observed-summary">
                  <div><dt>首次</dt><dd>{firstChapter?.label || '未知'}</dd></div>
                  <div><dt>最近</dt><dd>{latestChapter?.label || firstChapter?.label || '未知'}</dd></div>
                  <div><dt>出现</dt><dd>{encounterChapters.length || 1} 章</dd></div>
                </dl>
                {(entity.note || match || entity.mapLocation) && (
                  <div className="reader-observed-badges">
                    {entity.note && <span>有备注</span>}
                    {match && <span>{match.safeNote ? '有背景' : '资料匹配'}</span>}
                    {entity.mapLocation && (
                      <span>{entity.mapLocation.mode === 'exact' ? '已定位' : '参考区域'}</span>
                    )}
                  </div>
                )}
                <div className="reader-observed-item-actions">
                  {!match && entity.kind === OBSERVED_ENTITY_KIND.PLACE && (
                    <select
                      aria-label={`${entity.name}的地点性质`}
                      value={entity.placeKind || OBSERVED_PLACE_KIND.UNKNOWN}
                      onChange={(event) => changeObservedPlaceKind(entity.id, event.target.value)}
                    >
                      {Object.entries(OBSERVED_PLACE_KIND_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    className="btn reader-observed-detail-btn"
                    onClick={() => setSelectedEntityId(entity.id)}
                  >
                    查看详情
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => removeObservedEntity(entity.id)}
                    aria-label={`删除${entity.name}的遇见记录`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
              </div>
            </section>
          ))}
          <ObservedPagination
            page={safePage}
            pageSize={pageSize}
            totalPages={totalPages}
            totalItems={filteredEntities.length}
            onPageChange={changePage}
            onPageSizeChange={setPageSize}
          />
        </div>
      ) : (
        <div className="reader-observed-empty">
          {visibleEntities.length > 0 ? '当前筛选下没有记录。' : '当前章及之前还没有手动记录的名称。'}
        </div>
      )}
      {hiddenCount > 0 && (
        <p className="reader-observed-hidden">
          有 {hiddenCount} 条较后章节的记录已隐藏，回到相应进度后才会显示名称。
        </p>
      )}
      {selectedEntity && (
        <Modal
          title={`${selectedEntity.name} · 阅读记忆`}
          width={720}
          onClose={() => setSelectedEntityId('')}
          footer={(
            <button type="button" className="btn" onClick={() => setSelectedEntityId('')}>
              关闭
            </button>
          )}
        >
          <div className="reader-memory-detail">
            {selectedEntity.kind === OBSERVED_ENTITY_KIND.PLACE && (selectedMatch || selectedEntity.mapLocation || (selectedEntity.placeKind && selectedEntity.placeKind !== OBSERVED_PLACE_KIND.UNKNOWN)) && (
              <button type="button" className="btn" onClick={() => onOpenMap(selectedEntity)}>在地图中查看此地点</button>
            )}
            <div className="reader-memory-overview">
              <div>
                <span>类型</span>
                <strong>{OBSERVED_KIND_LABELS[selectedEntity.kind]}</strong>
              </div>
              <div>
                <span>首次遇到</span>
                <strong>{selectedEncounterChapters[0]?.label || '未知章节'}</strong>
              </div>
              <div>
                <span>最近遇到</span>
                <strong>{selectedEncounterChapters.at(-1)?.label || '未知章节'}</strong>
              </div>
              <div>
                <span>出现章节</span>
                <strong>{selectedEncounterChapters.length || 1} 章</strong>
              </div>
            </div>

            <section className="reader-memory-section">
              <div className="reader-memory-section-heading">
                <div>
                  <strong>阅读记录</strong>
                  <span>你确认它出现过的章节</span>
                </div>
                {!selectedEncounterChapterIds.includes(currentChapterId) && (
                  <button type="button" className="btn btn-sm" onClick={() => recordObservedAgain(selectedEntity)}>
                    <Plus size={12} /> 记录{currentChapter?.label || '当前章'}
                  </button>
                )}
              </div>
              <div className="reader-observed-chapters">
                {selectedEncounterChapters.map((chapter) => (
                  <span key={chapter.id}>{chapter.label}</span>
                ))}
              </div>
              <label className="reader-observed-note">
                <span>个人备注</span>
                <textarea
                  value={selectedNoteDraft}
                  onChange={(event) => setNoteDrafts((current) => ({
                    ...current,
                    [selectedEntity.id]: event.target.value,
                  }))}
                  placeholder="记录自己已经读到和确认的信息"
                  maxLength={500}
                  rows={4}
                />
              </label>
              <div className="reader-observed-note-actions">
                <span>{selectedNoteDraft.length}/500</span>
                <button
                  type="button"
                  disabled={selectedNoteDraft.trim() === (selectedEntity.note || '')}
                  onClick={() => saveObservedNote(selectedEntity)}
                >
                  保存备注
                </button>
              </div>
            </section>

            {selectedEntity.kind === OBSERVED_ENTITY_KIND.PLACE && (!selectedMatch || selectedMatch.sourceIds?.includes('source-personal-model-preparation')) && (
              <section className="reader-memory-section">
                <div className="reader-memory-section-heading">
                  <div>
                    <strong>地点性质</strong>
                    <span>{OBSERVED_PLACE_KIND_DESCRIPTIONS[selectedEntity.placeKind]}</span>
                  </div>
                  <select
                    value={selectedEntity.placeKind || OBSERVED_PLACE_KIND.UNKNOWN}
                    onChange={(event) => changeObservedPlaceKind(
                      selectedEntity.id,
                      event.target.value,
                    )}
                  >
                    {Object.entries(OBSERVED_PLACE_KIND_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              </section>
            )}

            {selectedMatch && (
              <section className="reader-memory-section">
                <div className="reader-memory-section-heading">
                  <div>
                    <strong>资料与背景</strong>
                    <span>
                      {selectedMatch.kind === OBSERVED_ENTITY_KIND.PLACE
                        ? PLACE_KIND_LABELS[selectedMatch.placeKind]
                        : OBSERVED_KIND_LABELS[selectedMatch.kind]}
                      {selectedMatch.parentLabel ? ` · ${selectedMatch.parentLabel}` : ''}
                    </span>
                  </div>
                </div>
                {selectedMatch.name !== selectedEntity.name && (
                  <p className="reader-memory-alias">资料名称：{selectedMatch.name}</p>
                )}
                {selectedMatch.originalName && selectedMatch.originalName !== selectedMatch.name && (
                  <p className="reader-memory-alias">原文名称：{selectedMatch.originalName}</p>
                )}
                <ReadingSafeNote
                  entity={selectedMatch}
                  sources={sources}
                  className="reader-observed-safe-note"
                />
                {selectedMatch.scopeNote && (
                  <p className="reader-memory-scope">{selectedMatch.scopeNote}</p>
                )}
              </section>
            )}

            {selectedEntity.mapLocation && (
              <section className="reader-memory-section">
                <div className="reader-memory-section-heading">
                  <div>
                    <strong>地图位置</strong>
                    <span>
                      {selectedEntity.mapLocation.mode === 'exact'
                        ? '个人确认的现实位置'
                        : '个人设置的参考区域'}
                    </span>
                  </div>
                </div>
                <p className="reader-memory-location">{selectedEntity.mapLocation.label}</p>
                {selectedEntity.mapLocation.mode !== 'exact' && (
                  <p className="reader-memory-scope">
                    半径约 {selectedEntity.mapLocation.radiusKm} 公里 · 非精确位置
                  </p>
                )}
                <button
                  type="button"
                  className="reader-observed-unlink"
                  onClick={() => removeObservedMapLocation(selectedEntity.id)}
                >
                  清除位置并重新选择
                </button>
              </section>
            )}
          </div>
        </Modal>
      )}
    </section>
  )
}

