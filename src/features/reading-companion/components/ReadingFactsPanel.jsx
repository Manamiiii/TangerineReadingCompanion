import { useMemo, useState } from 'react'
import { AlertTriangle, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import {
  OBSERVED_ENTITY_KIND,
  SPOILER_CATEGORY_LABELS,
  SPOILER_GATE_ACTION,
  SPOILER_RISK,
  canRevealRisk,
  spoilerGateAction,
  visibleReadingFacts,
} from '../domain/readingCompanion.js'
import { ReadingSafeNote } from './ReadingSafeNote.jsx'

const PLACE_KIND_LABELS = {
  real: '真实地点',
  fictional: '虚构地点',
  prototype: '原型地点',
  approximate: '模糊区域',
}

const OBSERVED_KIND_LABELS = {
  [OBSERVED_ENTITY_KIND.PLACE]: '地点',
  [OBSERVED_ENTITY_KIND.PERSON]: '人物',
  [OBSERVED_ENTITY_KIND.CONCEPT]: '概念',
  [OBSERVED_ENTITY_KIND.EVENT]: '事件',
}

function ReadingFactContent({ fact, entities, onHide }) {
  const entityNames = fact.entityIds
    .map((entityId) => entities.find((entity) => entity.id === entityId)?.name)
    .filter(Boolean)
  return (
    <div className={`reader-fact-content ${fact.riskLevel}`}>
      <p>{fact.content}</p>
      {entityNames.length > 0 && <small>相关实体：{entityNames.join('、')}</small>}
      {fact.riskLevel !== SPOILER_RISK.SAFE && (
        <button type="button" className="btn btn-sm" onClick={onHide}>
          <EyeOff size={13} /> 收起并撤销本次授权
        </button>
      )}
    </div>
  )
}

export function ReadingFactsPanel({
  facts,
  entities,
  backgroundEntities,
  sources,
  currentChapterId,
  currentChapter,
  chapters,
}) {
  const visibleFacts = useMemo(
    () => visibleReadingFacts(facts, currentChapterId, chapters),
    [facts, currentChapterId, chapters],
  )
  const safeBackgrounds = backgroundEntities.filter((entity) => entity.safeNote)
  const [gateStates, setGateStates] = useState({})

  function setGateState(factId, state) {
    setGateStates((current) => ({ ...current, [factId]: state }))
  }

  function riskCategories(fact) {
    return fact.riskCategories.map(
      (category) => SPOILER_CATEGORY_LABELS[category] || '未分类风险',
    )
  }

  return (
    <section className="reader-panel">
      <div className="reader-panel-heading">
        <div>
          <ShieldCheck size={20} />
          <h3>背景资料</h3>
        </div>
        <span className="reader-system-chip"><ShieldCheck size={13} /> 随阅读进度解锁</span>
      </div>
      {safeBackgrounds.length === 0 && visibleFacts.length === 0 ? (
        <div className="reader-facts-empty">
          <ShieldCheck size={24} />
          <strong>当前还没有已解锁的背景资料</strong>
          <p>阅读中确认带背景注释的名称后，资料会在这里汇总，并随章节进度隐藏或显示。</p>
        </div>
      ) : null}
      {safeBackgrounds.length > 0 && (
        <section className="reader-background-section">
          <div className="reader-content-section-heading">
            <div>
              <strong>名称背景</strong>
              <span>只包含当前进度已解锁的简短说明</span>
            </div>
            <b>{safeBackgrounds.length}</b>
          </div>
          <div className="reader-background-list">
            {safeBackgrounds.map((entity) => (
              <article className="reader-background-card" key={entity.id}>
                <div className="reader-background-heading">
                  <strong>{entity.name}</strong>
                  <span>
                    {entity.kind === OBSERVED_ENTITY_KIND.PLACE
                      ? PLACE_KIND_LABELS[entity.placeKind]
                      : OBSERVED_KIND_LABELS[entity.kind]}
                  </span>
                </div>
                {entity.originalName && entity.originalName !== entity.name && (
                  <p className="reader-background-original">{entity.originalName}</p>
                )}
                <ReadingSafeNote
                  entity={entity}
                  sources={sources}
                  className="reader-background-safe-note"
                />
              </article>
            ))}
          </div>
        </section>
      )}
      {visibleFacts.length > 0 && (
        <section className="reader-background-section">
          <div className="reader-content-section-heading">
            <div>
              <strong>阅读说明</strong>
              <span>可能涉及剧情的信息会单独确认</span>
            </div>
            <b>{visibleFacts.length}</b>
          </div>
          <div className="reader-fact-list">
            {visibleFacts.map((fact, index) => {
              const gateState = gateStates[fact.id] || 'hidden'
              const gateAction = spoilerGateAction(fact.riskLevel)
              const isSafe = gateAction === SPOILER_GATE_ACTION.DISPLAY
              const isRevealed = canRevealRisk(
                fact.riskLevel,
                gateState === 'revealed' ? fact.riskLevel : 'none',
              )
              return (
                <article className={`reader-fact-card ${fact.riskLevel}`} key={fact.id}>
                  <div className="reader-fact-heading">
                    <strong>已审计说明 {index + 1}</strong>
                    <span>{isSafe ? '安全资料' : fact.riskLevel === SPOILER_RISK.HIGH ? '高风险' : '潜在剧透'}</span>
                  </div>
                  {isRevealed ? (
                    <ReadingFactContent
                      fact={fact}
                      entities={entities}
                      onHide={() => setGateState(fact.id, 'hidden')}
                    />
                  ) : gateState === 'hidden' ? (
                    <div className="reader-fact-locked">
                      <EyeOff size={18} />
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => setGateState(fact.id, 'warning')}
                      >
                        <Eye size={13} /> 请求查看
                      </button>
                    </div>
                  ) : (
                    <div className={`reader-spoiler-warning ${gateState === 'confirming' ? 'high' : ''}`} role="alert">
                      <AlertTriangle size={20} />
                      <div>
                        <strong>
                          {gateState === 'confirming'
                            ? '请再次确认显示高风险内容'
                            : '以下内容可能涉及剧透'}
                        </strong>
                        <p>可能涉及：{riskCategories(fact).join('、')}。</p>
                        <small>当前阅读进度：{currentChapter?.label || '未知'}。</small>
                        <div className="reader-warning-actions">
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => setGateState(fact.id, 'hidden')}
                          >
                            保持隐藏
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={() => setGateState(
                              fact.id,
                              gateAction === SPOILER_GATE_ACTION.CONFIRM_TWICE
                                && gateState !== 'confirming'
                                ? 'confirming'
                                : 'revealed',
                            )}
                          >
                            {gateState === 'confirming' ? '确认显示' : '仍然查看'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        </section>
      )}
    </section>
  )
}
