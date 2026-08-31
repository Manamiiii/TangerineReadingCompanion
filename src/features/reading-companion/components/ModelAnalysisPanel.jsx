import { useEffect, useState } from 'react'
import { Plus, Settings2, ShieldCheck, Sparkles } from 'lucide-react'
import { analyzeReadingExcerpt } from '../model/modelAdapter.js'
import { recordReadingTrialDiagnostic } from '../domain/trialDiagnostics.js'
import { OBSERVED_ENTITY_KIND, OBSERVED_PLACE_KIND } from '../domain/readingCompanion.js'
import { OBSERVED_KIND_LABELS, OBSERVED_PLACE_KIND_LABELS } from './readerUi.js'

export function ModelAnalysisPanel({
  excerpt,
  bookTitle,
  currentChapter,
  knownEntities,
  onConfirmCandidate,
  actionFor,
  modelConfig,
  onOpenSettings,
}) {
  const [requestState, setRequestState] = useState('idle')
  const [message, setMessage] = useState('')
  const [candidates, setCandidates] = useState([])
  const [analysisExcerpt, setAnalysisExcerpt] = useState('')
  const configured = Boolean(
    modelConfig.endpoint.trim()
    && modelConfig.model.trim()
    && modelConfig.apiKey.trim(),
  )

  useEffect(() => {
    setCandidates([])
    setAnalysisExcerpt('')
    setMessage('')
    setRequestState('idle')
  }, [currentChapter?.id])

  const resultsStale = candidates.length > 0 && analysisExcerpt !== excerpt

  async function analyze() {
    setRequestState('working')
    setMessage('')
    try {
      const results = await analyzeReadingExcerpt({
        endpoint: modelConfig.endpoint,
        model: modelConfig.model,
        apiKey: modelConfig.apiKey,
        temperature: modelConfig.temperature,
        excerpt,
        bookTitle,
        chapterLabel: currentChapter?.label,
        knownEntities,
      })
      setCandidates(results)
      setAnalysisExcerpt(excerpt)
      setRequestState('done')
      setMessage(
        results.length > 0
          ? '发现了这段里的新名称。看到确实出现的名称时，直接记在本章即可。'
          : '这次没有发现新的名称。',
      )
      recordReadingTrialDiagnostic({
        area: 'model',
        action: 'model-excerpt-analysis',
        outcome: 'success',
        providerId: modelConfig.providerId,
      })
    } catch (error) {
      setRequestState('error')
      setMessage(error?.message || '模型识别失败')
      recordReadingTrialDiagnostic({
        area: 'model',
        action: 'model-excerpt-analysis',
        outcome: 'error',
        providerId: modelConfig.providerId,
        error,
      })
    }
  }

  function updateCandidate(index, patch) {
    setCandidates((current) => current.map((candidate, candidateIndex) => (
      candidateIndex === index
        ? {
            ...candidate,
            ...patch,
            ...(('name' in patch || 'kind' in patch) ? { matchedEntityId: null } : {}),
            ...(patch.kind === OBSERVED_ENTITY_KIND.PLACE && candidate.kind !== patch.kind
              ? { placeKind: OBSERVED_PLACE_KIND.UNKNOWN }
              : {}),
          }
        : candidate
    )))
  }

  async function confirm(candidate) {
    try {
      const action = actionFor(candidate.name, candidate.kind, candidate.matchedEntityId)
      await onConfirmCandidate(candidate)
      setCandidates((current) => current.map((item) => (
        item === candidate
          ? { ...item, recordedChapterId: currentChapter?.id }
          : item
      )))
      setMessage(
        action.type === 'move-earlier'
          ? `已把“${candidate.name}”从${action.existingChapter?.label || '较后章节'}提前到${currentChapter?.label || '当前章'}。`
          : action.type === 'record-again'
            ? `已补记“${candidate.name}”在${currentChapter?.label || '当前章'}的出现。`
            : `已把“${candidate.name}”记在${currentChapter?.label || '当前章'}。`,
      )
    } catch (error) {
      setMessage(error?.message || '保存模型候选失败')
    }
  }

  return (
    <div className="reader-model-panel">
      <div className="reader-model-heading">
        <div>
          <Sparkles size={19} />
          <div>
            <strong>发现这段里的新名称</strong>
          </div>
        </div>
        <button type="button" className="btn btn-sm" onClick={onOpenSettings}>
          <Settings2 size={14} /> {configured ? '模型设置' : '配置模型'}
        </button>
      </div>
      <button
        type="button"
        className="btn reader-model-run"
        onClick={analyze}
        disabled={!configured || !excerpt.trim() || requestState === 'working'}
      >
        <Sparkles size={15} />
        {requestState === 'working' ? '正在识别当前段落…' : '用模型发现新名称'}
      </button>
      {(resultsStale || message) && (
        <p className="reader-model-message" role="status">
          {resultsStale ? '当前段落已经改变，请重新识别后再记录。' : message}
        </p>
      )}
      {candidates.length > 0 && (
        <div className="reader-model-candidates">
          {candidates.map((candidate, index) => {
            const matchedEntity = knownEntities.find(
              (entity) => entity.id === candidate.matchedEntityId,
            )
            const action = actionFor(
              candidate.name,
              candidate.kind,
              candidate.matchedEntityId,
            )
            const isRecorded = action.type === 'recorded'
              || candidate.recordedChapterId === currentChapter?.id
            const candidateDisabled = isRecorded || resultsStale
            return (
              <div
                className={[
                  'reader-model-candidate',
                  isRecorded ? 'is-recorded' : '',
                  resultsStale ? 'is-stale' : '',
                ].filter(Boolean).join(' ')}
                key={`${index}:${candidate.name}`}
              >
                <div className="reader-model-candidate-fields">
                  <label>
                    <span>
                      名称
                      <span className="reader-model-field-meta">
                        {matchedEntity && (
                          <em
                            className="reader-model-entity-match"
                            title={`已配对资料：${matchedEntity.name}`}
                          >
                            资料 · {matchedEntity.name}
                          </em>
                        )}
                        {candidate.confidence !== null && (
                          <em className="reader-model-confidence">
                            {Math.round(candidate.confidence * 100)}%
                          </em>
                        )}
                      </span>
                    </span>
                    <input
                      value={candidate.name}
                      disabled={candidateDisabled}
                      onChange={(event) => updateCandidate(index, { name: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>类型</span>
                    <select
                      value={candidate.kind}
                      disabled={candidateDisabled}
                      onChange={(event) => updateCandidate(index, { kind: event.target.value })}
                    >
                      {Object.entries(OBSERVED_KIND_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                  {candidate.kind === OBSERVED_ENTITY_KIND.PLACE && (
                    <label>
                      <span>地点性质</span>
                      <select
                        value={candidate.placeKind || OBSERVED_PLACE_KIND.UNKNOWN}
                        disabled={candidateDisabled}
                        onChange={(event) => updateCandidate(index, {
                          placeKind: event.target.value,
                        })}
                      >
                        {Object.entries(OBSERVED_PLACE_KIND_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={candidateDisabled || !candidate.name.trim()}
                  onClick={() => confirm(candidate)}
                >
                  {isRecorded
                    ? <ShieldCheck size={13} />
                    : <Plus size={13} />}
                  {isRecorded ? `${currentChapter?.label || '本章'}已记录` : action.label}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

