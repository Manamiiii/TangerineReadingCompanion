import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  ClipboardPaste,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Image,
  Map as MapIcon,
  MapPin,
  Maximize2,
  Minimize2,
  Plus,
  ScanSearch,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserRoundSearch,
  X,
} from 'lucide-react'
import { getReadingState, saveReadingState } from '../db/readingState.js'
import {
  deletePersonalReadingPackage,
  savePersonalReadingPackage,
} from '../db/personalBooks.js'
import { loadReadingPackage, loadReadingPackageCatalog } from '../data/readingPackages.js'
import { generateId } from '../../../utils.js'
import { Modal } from '../../../components/common.jsx'
import packageMetadata from '../../../../package.json'
import { searchReadingPlaces } from '../map/geocoding.js'
import {
  recognizeImageText,
} from '../../ocr/localOcr.js'
import {
  analyzeReadingExcerpt,
  answerReadingQuestion,
  preparePersonalBookKnowledge,
  suggestReadingPlaceQueries,
} from '../model/modelAdapter.js'
import {
  READING_MODEL_PROVIDER,
  READING_MODEL_PROVIDERS,
} from '../model/modelProviders.js'
import {
  loadStoredModelConfig,
  saveStoredModelConfig,
} from '../../model/modelConfig.js'
import {
  createPersonalReadingPackage,
  mergePersonalBookKnowledge,
  personalCatalogEntry,
} from '../domain/personalBooks.js'
import {
  createReadingFeedbackBundle,
  summarizeReadingFeedback,
} from '../domain/feedbackBundle.js'
import {
  readingTrialDiagnosticsSnapshot,
  recordReadingTrialDiagnostic,
} from '../domain/trialDiagnostics.js'
import { ReadingLibrary } from './ReadingLibrary.jsx'
import {
  READING_MAP_PROVIDER,
  READING_MAP_PROVIDERS,
  loadStoredReadingMapConfig,
  normalizeReadingMapProvider,
  saveStoredReadingMapConfig,
} from '../map/mapConfig.js'
import {
  SPOILER_GATE_ACTION,
  SPOILER_CATEGORY_LABELS,
  SPOILER_RISK,
  canRevealRisk,
  clearObservedPlaceLocation,
  confirmObservedPlaceApproximateArea,
  confirmObservedPlaceLocation,
  confirmObservedRealPlaceFallbackArea,
  OBSERVED_ENTITY_KIND,
  OBSERVED_PLACE_KIND,
  matchOnDemandEntity,
  normalizeObservedEntityName,
  observedEntityEncounterChapterIds,
  readingEntitySafeNoteSources,
  readingPlaceRelations,
  readerConfirmedMapEntities,
  scanOnDemandEntities,
  scanObservedEntities,
  spoilerGateAction,
  unlockedOnDemandEntities,
  upsertObservedEntity,
  updateObservedEntityNote,
  updateObservedPlaceKind,
  visibleReadingEntities,
  visibleReadingFacts,
  visibleObservedEntities,
} from '../domain/readingCompanion.js'

const ReadingGeoMap = lazy(() => import('./ReadingGeoMap.jsx').then((module) => ({
  default: module.ReadingGeoMap,
})))

const APP_BUILD = String(import.meta.env.VITE_APP_BUILD || 'local').slice(0, 7)
const EMPTY_OBSERVED_ENTITIES = Object.freeze([])

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

const OBSERVED_PLACE_KIND_LABELS = {
  [OBSERVED_PLACE_KIND.UNKNOWN]: '不确定',
  [OBSERVED_PLACE_KIND.REAL]: '现实地点',
  [OBSERVED_PLACE_KIND.FICTIONAL]: '虚构地点',
  [OBSERVED_PLACE_KIND.PROTOTYPE]: '有现实原型',
  [OBSERVED_PLACE_KIND.APPROXIMATE]: '位置模糊',
}

const OBSERVED_PLACE_KIND_DESCRIPTIONS = {
  [OBSERVED_PLACE_KIND.UNKNOWN]: '原文信息不足时先这样记录；不会开放公网地图搜索。',
  [OBSERVED_PLACE_KIND.REAL]: '现实中可确认的地点；可以搜索并保存现代代表位置。',
  [OBSERVED_PLACE_KIND.FICTIONAL]: '作品虚构地点；不保存伪造的精确坐标，只能设置宽泛参考区域。',
  [OBSERVED_PLACE_KIND.PROTOTYPE]: '虚构地点有可靠资料支持的现实原型；原型与作品地点必须明确区分。',
  [OBSERVED_PLACE_KIND.APPROXIMATE]: '只能确认国家、州、省或地区，无法可靠定位到精确点。',
}

const PLACE_ACCESS_LABELS = {
  'reader-confirmed-exact-match': '阅读中确认后解锁',
  'reader-confirmed-geocoder': '个人确认位置',
  'reader-confirmed-approximate-area': '宽泛参考区域',
  'reader-confirmed-fallback-area': '精确位置未收录',
}

const READER_TAB = Object.freeze({
  INPUT: 'input',
  RECORDS: 'records',
  MAP: 'map',
  FACTS: 'facts',
  SETTINGS: 'settings',
})

function observedRecordAction(
  observedEntities,
  name,
  kind,
  currentChapterId,
  chapters,
  packageEntityId = '',
  equivalentNames = [],
) {
  const normalizedEquivalentNames = new Set(
    equivalentNames.map(normalizeObservedEntityName).filter(Boolean),
  )
  const existing = observedEntities.find((item) => (
    item.kind === kind
    && (
      normalizeObservedEntityName(item.name) === normalizeObservedEntityName(name)
      || (packageEntityId && item.packageEntityId === packageEntityId)
      || (
        packageEntityId
        && normalizedEquivalentNames.has(normalizeObservedEntityName(item.name))
      )
    )
  ))
  const currentIndex = chapters.findIndex((item) => item.id === currentChapterId)
  if (!existing) {
    return {
      type: 'add',
      label: `记在${chapters[currentIndex]?.label || '当前章'}`,
    }
  }
  const existingIndex = chapters.findIndex((item) => item.id === existing.firstSeenChapterId)
  const existingChapter = chapters[existingIndex]
  if (existingIndex > currentIndex) {
    return {
      type: 'move-earlier',
      label: `提前到${chapters[currentIndex]?.label || '当前章'}`,
      existing,
      existingChapter,
    }
  }
  if (!observedEntityEncounterChapterIds(existing, chapters).includes(currentChapterId)) {
    return {
      type: 'record-again',
      label: `记录${chapters[currentIndex]?.label || '当前章'}出现`,
      existing,
      existingChapter,
    }
  }
  return {
    type: 'recorded',
    label: `${chapters[currentIndex]?.label || '当前章'}已记录`,
    existing,
    existingChapter,
  }
}

function loadStoredReadingModelConfig(providerId = '', allowLegacy = true) {
  return loadStoredModelConfig(providerId, allowLegacy)
}

function LoadingPanel({ message }) {
  return <div className="reader-loading">{message}</div>
}

function ReaderError({ message }) {
  return (
    <div className="reader-error" role="alert">
      <strong>阅读资料加载失败</strong>
      <span>{message}</span>
    </div>
  )
}

function ModelAnalysisPanel({
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

function PersonalBookPreparationPanel({
  readingPackage,
  modelConfig,
  onPrepared,
  onOpenSettings,
}) {
  const [requestState, setRequestState] = useState('idle')
  const [message, setMessage] = useState('')
  const configured = Boolean(
    modelConfig.endpoint.trim()
    && modelConfig.model.trim()
    && modelConfig.apiKey.trim(),
  )
  const preparedCount = (readingPackage.onDemandEntities || [])
    .filter((entity) => entity.sourceIds?.includes('source-personal-model-preparation'))
    .length

  async function prepare() {
    setRequestState('working')
    setMessage('')
    try {
      const candidates = await preparePersonalBookKnowledge({
        endpoint: modelConfig.endpoint,
        model: modelConfig.model,
        apiKey: modelConfig.apiKey,
        temperature: modelConfig.temperature,
        book: readingPackage.book,
        edition: readingPackage.edition,
      })
      const addedCount = await onPrepared(candidates)
      setRequestState('done')
      setMessage(
        addedCount > 0
          ? `已准备 ${addedCount} 个基础名称。以后它们在当前原文中出现时，系统会自动发现。`
          : '这次没有发现新的基础名称，现有资料已经保留。',
      )
      recordReadingTrialDiagnostic({
        area: 'model',
        action: 'model-personal-book-preparation',
        outcome: 'success',
        providerId: modelConfig.providerId,
      })
    } catch (error) {
      setRequestState('error')
      setMessage(error?.message || '基础资料准备失败')
      recordReadingTrialDiagnostic({
        area: 'model',
        action: 'model-personal-book-preparation',
        outcome: 'error',
        providerId: modelConfig.providerId,
        error,
      })
    }
  }

  return (
    <div className="reader-preparation-panel">
      <div>
        <Sparkles size={19} />
        <span>
          <strong>AI 准备这本书</strong>
          <small>
            {preparedCount > 0
              ? `已经准备 ${preparedCount} 个名称；重新运行只会补充，不会清空阅读记录。`
              : '自动准备人物、地点和概念名称，不需要你提前了解或逐条审核。'}
          </small>
        </span>
      </div>
      <div className="reader-preparation-actions">
        <button
          type="button"
          className="btn btn-sm"
          onClick={prepare}
          disabled={!configured || requestState === 'working'}
        >
          <Sparkles size={13} />
          {requestState === 'working'
            ? '正在准备…'
            : preparedCount > 0
              ? '补充基础资料'
              : '准备基础资料'}
        </button>
        {!configured && (
          <button type="button" className="btn btn-sm" onClick={onOpenSettings}>
            <Settings2 size={13} /> 配置模型
          </button>
        )}
      </div>
      {message && <p className="reader-model-message" role="status">{message}</p>}
    </div>
  )
}

function ReadingQuestionPanel({
  excerpt,
  selectedText,
  bookTitle,
  currentChapter,
  modelConfig,
  onOpenSettings,
}) {
  const [question, setQuestion] = useState('')
  const [requestState, setRequestState] = useState('idle')
  const [message, setMessage] = useState('')
  const [result, setResult] = useState(null)
  const configured = Boolean(
    modelConfig.endpoint.trim()
    && modelConfig.model.trim()
    && modelConfig.apiKey.trim(),
  )

  useEffect(() => {
    if (selectedText) setQuestion(`“${selectedText}”是什么意思？`)
  }, [selectedText])

  async function ask(event) {
    event.preventDefault()
    setRequestState('working')
    setMessage('')
    setResult(null)
    try {
      const answer = await answerReadingQuestion({
        endpoint: modelConfig.endpoint,
        model: modelConfig.model,
        apiKey: modelConfig.apiKey,
        temperature: modelConfig.temperature,
        question,
        excerpt,
        bookTitle,
        chapterLabel: currentChapter?.label,
      })
      setResult(answer)
      setRequestState('done')
      recordReadingTrialDiagnostic({
        area: 'model',
        action: 'model-question',
        outcome: 'success',
        providerId: modelConfig.providerId,
      })
    } catch (error) {
      setRequestState('error')
      setMessage(error?.message || '当前内容答疑失败')
      recordReadingTrialDiagnostic({
        area: 'model',
        action: 'model-question',
        outcome: 'error',
        providerId: modelConfig.providerId,
        error,
      })
    }
  }

  return (
    <div className="reader-question-panel">
      <div className="reader-model-heading">
        <div>
          <ShieldCheck size={19} />
          <div>
            <strong>无剧透问问当前内容</strong>
            <p>只解释眼前段落、概念和时代背景。</p>
          </div>
        </div>
        {configured ? (
          <span className="reader-safe-chip">当前进度内</span>
        ) : (
          <button type="button" className="btn btn-sm" onClick={onOpenSettings}>
            <Settings2 size={13} /> 配置模型
          </button>
        )}
      </div>
      <form className="reader-question-form" onSubmit={ask}>
        <input
          value={question}
          onChange={(event) => {
            setQuestion(event.target.value)
            setMessage('')
            setResult(null)
          }}
          placeholder="例如：重建时期是什么意思？这句话为什么这样表达？"
        />
        <button
          type="submit"
          className="btn btn-sm"
          disabled={!configured || !question.trim() || requestState === 'working'}
        >
          {requestState === 'working' ? '解释中…' : '解释'}
        </button>
      </form>
      {message && <p className="reader-model-message" role="status">{message}</p>}
      {result && (
        <div className="reader-question-answer" role="status">
          <strong>{result.uncertain ? '可能的解释' : '解释'}</strong>
          <p>{result.answer}</p>
        </div>
      )}
    </div>
  )
}

function ReadingServiceSettings({
  modelConfig,
  mapConfig,
  scene,
  readingPackage,
  readingState,
  currentChapterId,
  onLoadModelProvider,
  onSaveModel,
  onSaveMap,
}) {
  const [modelDraft, setModelDraft] = useState(modelConfig)
  const [mapDraft, setMapDraft] = useState(mapConfig)
  const [message, setMessage] = useState('')

  useEffect(() => setModelDraft(modelConfig), [modelConfig])
  useEffect(() => setMapDraft(mapConfig), [mapConfig])

  const selectedModelProvider = READING_MODEL_PROVIDERS[modelDraft.providerId]
    || READING_MODEL_PROVIDERS[READING_MODEL_PROVIDER.CUSTOM]
  const feedbackSummary = summarizeReadingFeedback(readingState?.observedEntities)
  const feedbackChapter = readingPackage?.chapters
    ?.find((chapter) => chapter.id === currentChapterId)

  function exportReadingFeedback() {
    try {
      const payload = createReadingFeedbackBundle({
        appVersion: packageMetadata.version,
        appBuild: APP_BUILD,
        scene,
        readingPackage,
        readingState,
        currentChapterId,
        diagnostics: readingTrialDiagnosticsSnapshot(),
      })
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const editionKey = readingPackage.edition.isbn || readingPackage.edition.id
      link.href = url
      link.download = `reading-feedback-${editionKey}-${payload.exportedAt.slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
      setMessage('阅读反馈包已导出。')
      recordReadingTrialDiagnostic({
        area: 'feedback',
        action: 'feedback-export',
        outcome: 'success',
        providerId: 'local',
      })
    } catch (error) {
      setMessage(error?.message || '阅读反馈包导出失败。')
      recordReadingTrialDiagnostic({
        area: 'feedback',
        action: 'feedback-export',
        outcome: 'error',
        providerId: 'local',
        error,
      })
    }
  }

  function changeModelProvider(providerId) {
    setModelDraft(onLoadModelProvider(providerId))
    setMessage('')
  }

  function saveModel(event) {
    event.preventDefault()
    onSaveModel(modelDraft)
    setMessage(
      modelDraft.apiKey.trim()
        ? `已切换到${selectedModelProvider.label}，请回到“阅读输入”用当前段落验证。`
        : '模型地址和名称已保存，API Key 已清除。',
    )
  }

  function saveMap(event) {
    event.preventDefault()
    onSaveMap(mapDraft)
    setMessage(
      mapDraft.providerId === READING_MAP_PROVIDER.DOMESTIC
        ? (mapDraft.tiandituToken.trim()
          ? '国内地图配置已保存，可以回到地图验证底图和搜索。'
          : '已切换到国内地图，但还需要填写天地图浏览器端 Key。')
        : '已切换到国际地图；底图免 Key，国内网络不可用时可使用 VPN。',
    )
  }

  return (
    <div className="reader-settings-grid">
      <section className="reader-panel reader-settings-card">
        <div className="reader-panel-heading">
          <div><Sparkles size={20} /><h3>模型服务</h3></div>
          <span className="reader-system-chip">可选</span>
        </div>
        <p className="reader-settings-intro">
          用于准备个人书的隐藏名称、发现当前段落里的新名称、解释当前内容，以及整理书目和地图搜索词。
          模型不能直接写入正式资料或生成坐标。
        </p>
        <form className="reader-settings-form" onSubmit={saveModel}>
          <label>
            <span>模型供应商</span>
            <select
              value={modelDraft.providerId}
              onChange={(event) => changeModelProvider(event.target.value)}
            >
              {Object.values(READING_MODEL_PROVIDERS).map((provider) => (
                <option key={provider.id} value={provider.id}>{provider.label}</option>
              ))}
            </select>
            <small>{selectedModelProvider.description}</small>
          </label>
          <label>
            <span>Chat Completions 兼容地址</span>
            <input
              value={modelDraft.endpoint}
              onChange={(event) => setModelDraft((current) => ({
                ...current,
                endpoint: event.target.value,
              }))}
              placeholder="https://api.openai.com/v1/chat/completions"
            />
          </label>
          <label>
            <span>模型 ID</span>
            <input
              list="reader-model-options"
              value={modelDraft.model}
              onChange={(event) => setModelDraft((current) => ({
                ...current,
                model: event.target.value,
              }))}
              placeholder="按服务商文档填写"
            />
            <datalist id="reader-model-options">
              {selectedModelProvider.models.map((model) => (
                <option key={model.id} value={model.id}>{model.label}</option>
              ))}
            </datalist>
            {selectedModelProvider.models.length > 0 && (
              <small>可从建议模型中选择，也可以手动填写服务商当前支持的模型 ID。</small>
            )}
          </label>
          <label>
            <span>API Key</span>
            <input
              type="password"
              value={modelDraft.apiKey}
              onChange={(event) => setModelDraft((current) => ({
                ...current,
                apiKey: event.target.value,
              }))}
              placeholder="粘贴 API Key"
              autoComplete="off"
            />
          </label>
          <div className="reader-settings-actions">
            <button type="submit" className="btn">保存并切换到此模型</button>
            <button
              type="button"
              className="btn"
              onClick={() => setModelDraft((current) => ({ ...current, apiKey: '' }))}
            >
              清除 Key
            </button>
          </div>
          <small>供应商地址和模型 ID 保存在本机，API Key 仅保存在当前浏览器会话。</small>
        </form>
        <details className="reader-service-guide">
          <summary>{selectedModelProvider.label}配置提示</summary>
          <ol>
            <li>在服务商控制台创建 API Key；网页会员或聊天订阅通常不等于 API 额度。</li>
            <li>确认完整接口地址以 <code>/chat/completions</code> 结尾，并核对模型 ID。</li>
            <li>保存后回到“阅读输入”，只放入不敏感的短段落进行测试。</li>
          </ol>
          {(selectedModelProvider.consoleUrl || selectedModelProvider.docsUrl) && (
            <div className="reader-guide-links">
              {selectedModelProvider.consoleUrl && (
                <a href={selectedModelProvider.consoleUrl} target="_blank" rel="noreferrer">
                  打开服务商控制台 <ExternalLink size={12} />
                </a>
              )}
              {selectedModelProvider.docsUrl && (
                <a href={selectedModelProvider.docsUrl} target="_blank" rel="noreferrer">
                  查看官方文档 <ExternalLink size={12} />
                </a>
              )}
            </div>
          )}
        </details>
        <p className="reader-settings-storage">
          阅读伴侣配置独立保存。每个供应商的地址和模型名分别保存在本机 localStorage；各家 Key 分别存在 sessionStorage，关闭浏览器会话后失效。
          不同功能会发送书目信息，或当前问题、段落、书名和章节标签；只有点击功能或创建时保留 AI 准备选项才会调用。
        </p>
      </section>

      <section className="reader-panel reader-settings-card">
        <div className="reader-panel-heading">
          <div><MapIcon size={20} /><h3>地图服务</h3></div>
          <span className="reader-system-chip">国内 / 国外</span>
        </div>
        <p className="reader-settings-intro">地图只检索标记为现实的地点。</p>
        <form className="reader-settings-form" onSubmit={saveMap}>
          <label>
            <span>地图网络</span>
            <select
              value={mapDraft.providerId}
              onChange={(event) => setMapDraft((current) => ({
                ...current,
                providerId: normalizeReadingMapProvider(event.target.value),
              }))}
            >
              {Object.values(READING_MAP_PROVIDERS).map((provider) => (
                <option key={provider.id} value={provider.id}>{provider.label}</option>
              ))}
            </select>
            <small>{READING_MAP_PROVIDERS[mapDraft.providerId].description}</small>
          </label>
          {mapDraft.providerId === READING_MAP_PROVIDER.DOMESTIC && (
            <label>
              <span>天地图浏览器端 Key</span>
              <input
                type="password"
                value={mapDraft.tiandituToken}
                onChange={(event) => setMapDraft((current) => ({
                  ...current,
                  tiandituToken: event.target.value,
                }))}
                placeholder="在天地图控制台创建浏览器端应用"
                autoComplete="off"
              />
            </label>
          )}
          <div className="reader-settings-actions">
            <button type="submit" className="btn">保存地图配置</button>
            <button
              type="button"
              className="btn"
              onClick={() => setMapDraft((current) => ({ ...current, tiandituToken: '' }))}
            >
              清除天地图 Key
            </button>
          </div>
        </form>
        <details className="reader-service-guide">
          <summary>天地图配置教程</summary>
          <ol>
            <li>注册并登录天地图，进入控制台的应用管理。</li>
            <li>创建应用并选择“浏览器端”，复制生成的 Key。</li>
            <li>切换为“国内地图”，粘贴 Key 并保存，再到地图页验证。</li>
          </ol>
          <div className="reader-guide-links">
            <a href="https://console.tianditu.gov.cn/api/key" target="_blank" rel="noreferrer">
              打开天地图控制台 <ExternalLink size={12} />
            </a>
            <a href="https://www.tianditu.gov.cn/" target="_blank" rel="noreferrer">
              天地图官网 <ExternalLink size={12} />
            </a>
          </div>
        </details>
        <p className="reader-settings-storage">天地图 Key 保存在当前浏览器。</p>
      </section>
      <section className="reader-panel reader-settings-card reader-feedback-card">
        <div className="reader-panel-heading">
          <div><Download size={20} /><h3>试用反馈</h3></div>
          <span className="reader-system-chip">单书</span>
        </div>
        <div className="reader-feedback-summary">
          <div><span>当前进度</span><strong>{feedbackChapter?.label || '尚未记录'}</strong></div>
          <div><span>已遇到</span><strong>{feedbackSummary.observedCount}</strong></div>
          <div><span>个人备注</span><strong>{feedbackSummary.noteCount}</strong></div>
          <div><span>地图确认</span><strong>{feedbackSummary.mappedPlaceCount}</strong></div>
        </div>
        <p className="reader-settings-intro">
          只导出当前书的版本、进度、已遇到记录、备注、地图确认和脱敏运行诊断。不包含 API Key、段落、搜索词、截图或模型内容。
        </p>
        <button type="button" className="btn reader-feedback-export" onClick={exportReadingFeedback}>
          <Download size={14} />
          导出当前书反馈
        </button>
        <p className="reader-settings-storage">
          应用 {packageMetadata.version} ({APP_BUILD}) · 资料包 {readingPackage?.packageVersion || '未知'}
        </p>
      </section>
      {message && <p className="reader-settings-message" role="status">{message}</p>}
    </div>
  )
}

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

function ReadingSafeNote({ entity, sources, className }) {
  if (!entity?.safeNote) return null
  const noteSources = readingEntitySafeNoteSources(entity, sources)
  return (
    <div className={className}>
      <p>{entity.safeNote}</p>
      {noteSources.length > 0 && (
        <details className="reader-safe-note-sources">
          <summary>资料来源 {noteSources.length}</summary>
          <div>
            {noteSources.map((source) => (
              <a
                href={source.url}
                key={source.id}
                target="_blank"
                rel="noreferrer"
              >
                {source.label}
                <ExternalLink size={12} aria-hidden="true" />
              </a>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function ObservedEntitiesPanel({
  observedEntities,
  onDemandEntities,
  sources,
  currentChapterId,
  currentChapter,
  chapters,
  onChange,
}) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState(OBSERVED_ENTITY_KIND.PLACE)
  const [placeKind, setPlaceKind] = useState(OBSERVED_PLACE_KIND.UNKNOWN)
  const [status, setStatus] = useState('')
  const [kindFilter, setKindFilter] = useState('all')
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
  const filteredEntities = useMemo(
    () => visibleEntities
      .filter((entity) => kindFilter === 'all' || entity.kind === kindFilter)
      .sort((left, right) => {
        const leftChapter = chapters.findIndex((item) => item.id === left.firstSeenChapterId)
        const rightChapter = chapters.findIndex((item) => item.id === right.firstSeenChapterId)
        return leftChapter - rightChapter || left.name.localeCompare(right.name, 'zh-CN')
      }),
    [visibleEntities, kindFilter, chapters],
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
    ? observedEntityEncounterChapterIds(selectedEntity, chapters)
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
  }, [kindFilter, pageSize])

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
      const next = upsertObservedEntity(observedEntities, {
        id: generateId('observed'),
        name,
        kind,
        placeKind,
        firstSeenChapterId: currentChapterId,
      }, chapters)
      if (next === observedEntities) {
        setStatus(`这个名称${currentAction.label}。`)
        return
      }
      await onChange(next)
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
      await onChange(observedEntities.filter((entity) => entity.id !== id))
    } catch (error) {
      setStatus(error?.message || '删除失败')
    }
  }

  async function removeObservedMapLocation(id) {
    setStatus('')
    try {
      await onChange(clearObservedPlaceLocation(observedEntities, id))
      setStatus('已清除个人地图位置，名称和首次遇到章节仍然保留。')
    } catch (error) {
      setStatus(error?.message || '清除地图位置失败')
    }
  }

  async function changeObservedPlaceKind(id, nextPlaceKind) {
    setStatus('')
    try {
      await onChange(updateObservedPlaceKind(observedEntities, id, nextPlaceKind))
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
      const next = upsertObservedEntity(observedEntities, {
        id: entity.id,
        name: entity.name,
        kind: entity.kind,
        placeKind: entity.placeKind,
        firstSeenChapterId: currentChapterId,
      }, chapters)
      if (next === observedEntities) {
        setStatus(`“${entity.name}”在${currentChapter?.label || '当前章'}已经记录。`)
        return
      }
      await onChange(next)
      setStatus(`已补记“${entity.name}”在${currentChapter?.label || '当前章'}的出现。`)
    } catch (error) {
      setStatus(error?.message || '记录本章出现失败')
    }
  }

  async function saveObservedNote(entity) {
    setStatus('')
    try {
      const draft = noteDrafts[entity.id] ?? entity.note ?? ''
      await onChange(updateObservedEntityNote(observedEntities, entity.id, draft))
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
            const encounterChapterIds = observedEntityEncounterChapterIds(entity, chapters)
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

            {selectedEntity.kind === OBSERVED_ENTITY_KIND.PLACE && !selectedMatch && (
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

function ReadingMapPanel({
  entities,
  observedEntities,
  onDemandEntities,
  sources,
  currentChapterId,
  chapters,
  onChangeObservedEntities,
  mapConfig,
  modelConfig,
  bookTitle,
  currentChapter,
  onOpenSettings,
  isActive,
}) {
  const { providerId, tiandituToken } = mapConfig
  const [renderedMapConfig, setRenderedMapConfig] = useState(mapConfig)
  const [lookupTargetId, setLookupTargetId] = useState('')
  const [lookupQuery, setLookupQuery] = useState('')
  const [lookupMode, setLookupMode] = useState('exact')
  const [areaRadiusKm, setAreaRadiusKm] = useState(50)
  const [translationState, setTranslationState] = useState('idle')
  const [lookupSuggestions, setLookupSuggestions] = useState([])
  const [lookupState, setLookupState] = useState('idle')
  const [lookupResults, setLookupResults] = useState([])
  const [lookupMessage, setLookupMessage] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const lookupRequestRef = useRef(0)
  const workspaceRef = useRef(null)
  const places = useMemo(
    () => visibleReadingEntities(entities, currentChapterId, chapters)
      .filter((entity) => entity.kind === 'place'),
    [entities, currentChapterId, chapters],
  )
  const spatialPlaces = useMemo(
    () => places.filter((place) => (
      Number.isFinite(place.geometry?.latitude)
      && Number.isFinite(place.geometry?.longitude)
    )),
    [places],
  )
  const visibleObservedPlaces = useMemo(
    () => visibleObservedEntities(observedEntities, currentChapterId, chapters)
      .filter((entity) => entity.kind === OBSERVED_ENTITY_KIND.PLACE),
    [observedEntities, currentChapterId, chapters],
  )
  const searchableObservedPlaces = useMemo(
    () => visibleObservedPlaces.filter((entity) => (
      !entity.mapLocation
      && (
        (
          entity.placeKind === OBSERVED_PLACE_KIND.REAL
          && !matchOnDemandEntity(
            onDemandEntities,
            entity.name,
            entity.kind,
            entity.packageEntityId,
          )
        )
        || [
          OBSERVED_PLACE_KIND.FICTIONAL,
          OBSERVED_PLACE_KIND.PROTOTYPE,
          OBSERVED_PLACE_KIND.APPROXIMATE,
        ].includes(entity.placeKind)
      )
    )),
    [visibleObservedPlaces, onDemandEntities],
  )
  const lookupTarget = searchableObservedPlaces.find((place) => place.id === lookupTargetId)
  const [selectedPlaceId, setSelectedPlaceId] = useState('')
  const [distanceFromId, setDistanceFromId] = useState('')
  const [distanceToId, setDistanceToId] = useState('')
  const [distancePair, setDistancePair] = useState(null)
  const selectedPlace = places.find((place) => place.id === selectedPlaceId) || places[0] || null
  const distancePlaces = useMemo(
    () => places.filter((place) => (
      place.geometry
      && place.geometry.type !== 'area'
      && Number.isFinite(place.geometry.latitude)
      && Number.isFinite(place.geometry.longitude)
    )),
    [places],
  )
  const distanceRelation = useMemo(
    () => {
      if (!distancePair) return null
      const pairPlaces = distancePlaces.filter((place) => (
        place.id === distancePair.fromId || place.id === distancePair.toId
      ))
      return readingPlaceRelations(pairPlaces, distancePair.fromId)
        .find((relation) => relation.id === distancePair.toId) || null
    },
    [distancePair, distancePlaces],
  )

  useEffect(() => {
    if (isActive) setRenderedMapConfig(mapConfig)
  }, [isActive, mapConfig])

  useEffect(() => {
    if (selectedPlaceId && !places.some((place) => place.id === selectedPlaceId)) {
      setSelectedPlaceId('')
    }
  }, [places, selectedPlaceId])

  useEffect(() => {
    const validIds = new Set(distancePlaces.map((place) => place.id))
    if (distanceFromId && !validIds.has(distanceFromId)) setDistanceFromId('')
    if (distanceToId && !validIds.has(distanceToId)) setDistanceToId('')
    if (
      distancePair
      && (!validIds.has(distancePair.fromId) || !validIds.has(distancePair.toId))
    ) {
      setDistancePair(null)
    }
  }, [distanceFromId, distancePair, distancePlaces, distanceToId])

  useEffect(() => {
    setLookupResults([])
    setLookupState('idle')
    setLookupMessage('')
    setLookupSuggestions([])
  }, [providerId])

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === workspaceRef.current)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  useEffect(() => {
    if (!isExpanded) return undefined
    function handleEscape(event) {
      if (event.key === 'Escape') setIsExpanded(false)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isExpanded])

  async function toggleFullscreen() {
    if (isExpanded) {
      setIsExpanded(false)
      return
    }
    try {
      if (document.fullscreenElement === workspaceRef.current) {
        await document.exitFullscreen()
      } else if (workspaceRef.current?.requestFullscreen) {
        await workspaceRef.current.requestFullscreen()
        if (document.fullscreenElement !== workspaceRef.current) setIsExpanded(true)
      } else {
        setIsExpanded(true)
      }
    } catch (error) {
      setIsExpanded(true)
      setLookupMessage(
        `${error?.message || '浏览器未允许原生全屏'}；已改用窗口内全屏地图。`,
      )
    }
  }

  function beginLookup(place) {
    setLookupTargetId(place.id)
    const nextMode = place.placeKind === OBSERVED_PLACE_KIND.REAL ? 'exact' : 'approximate-area'
    setLookupMode(nextMode)
    setLookupQuery(nextMode === 'exact' ? place.name : '')
    setAreaRadiusKm(50)
    setTranslationState('idle')
    setLookupSuggestions([])
    setLookupResults([])
    setLookupState('idle')
    setLookupMessage('')
  }

  async function suggestLookupQueries() {
    setTranslationState('working')
    setLookupMessage('')
    try {
      const suggestions = await suggestReadingPlaceQueries({
        endpoint: modelConfig.endpoint,
        model: modelConfig.model,
        apiKey: modelConfig.apiKey,
        temperature: modelConfig.temperature,
        query: lookupMode === 'approximate-area' ? lookupQuery : lookupTarget.name,
        bookTitle,
        chapterLabel: currentChapter?.label,
      })
      setLookupSuggestions(suggestions)
      setLookupQuery(suggestions[0])
      setTranslationState('done')
      setLookupMessage(`已结合《${bookTitle}》生成地图检索词，请选择或修改后搜索。`)
      recordReadingTrialDiagnostic({
        area: 'model',
        action: 'map-query-suggestion',
        outcome: 'success',
        providerId: modelConfig.providerId,
      })
    } catch (error) {
      setTranslationState('error')
      setLookupMessage(error?.message || '生成英文搜索词失败')
      recordReadingTrialDiagnostic({
        area: 'model',
        action: 'map-query-suggestion',
        outcome: 'error',
        providerId: modelConfig.providerId,
        error,
      })
    }
  }

  async function activateLookupFallback() {
    setTranslationState('working')
    setLookupResults([])
    setLookupState('idle')
    let requestedModelSuggestion = false
    try {
      let suggestions = lookupSuggestions
      if (suggestions.length === 0 && modelConfig.apiKey) {
        requestedModelSuggestion = true
        suggestions = await suggestReadingPlaceQueries({
          endpoint: modelConfig.endpoint,
          model: modelConfig.model,
          apiKey: modelConfig.apiKey,
          temperature: modelConfig.temperature,
          query: lookupTarget.name,
          bookTitle,
          chapterLabel: currentChapter?.label,
        })
        setLookupSuggestions(suggestions)
      }
      const broadQuery = suggestions.at(-1) || lookupQuery
      setLookupMode('fallback-area')
      setAreaRadiusKm(20)
      setLookupQuery(broadQuery)
      setTranslationState('done')
      setLookupMessage(
        suggestions.length > 0
          ? '已切换为参考区域兜底，并选用最宽泛的地区候选。请搜索并确认所在城市或地区；结果不会保存为精确坐标。'
          : '已切换为参考区域兜底。请把搜索词改成所在城市、州或地区；结果不会保存为精确坐标。',
      )
      if (requestedModelSuggestion) {
        recordReadingTrialDiagnostic({
          area: 'model',
          action: 'map-query-suggestion',
          outcome: 'success',
          providerId: modelConfig.providerId,
        })
      }
    } catch (error) {
      setTranslationState('error')
      setLookupMessage(error?.message || '生成参考区域搜索词失败')
      if (requestedModelSuggestion) {
        recordReadingTrialDiagnostic({
          area: 'model',
          action: 'map-query-suggestion',
          outcome: 'error',
          providerId: modelConfig.providerId,
          error,
        })
      }
    }
  }

  async function submitLookup(event) {
    event.preventDefault()
    const requestId = lookupRequestRef.current + 1
    lookupRequestRef.current = requestId
    setLookupState('loading')
    setLookupMessage('')
    setLookupResults([])
    try {
      const results = await searchReadingPlaces({
        providerId,
        query: lookupQuery,
        tiandituToken,
      })
      if (lookupRequestRef.current !== requestId) return
      setLookupResults(results)
      setLookupState('ready')
      if (results.length === 0) {
        setLookupMessage('没有找到候选；可以补充英文名、州或国家后重试。')
        recordReadingTrialDiagnostic({
          area: 'map',
          action: 'map-search',
          outcome: 'error',
          providerId,
          error: new Error('没有搜索结果'),
        })
      } else {
        recordReadingTrialDiagnostic({
          area: 'map',
          action: 'map-search',
          outcome: 'success',
          providerId,
        })
      }
    } catch (error) {
      if (lookupRequestRef.current !== requestId) return
      setLookupState('error')
      setLookupMessage(error?.message || '地图搜索失败')
      recordReadingTrialDiagnostic({
        area: 'map',
        action: 'map-search',
        outcome: 'error',
        providerId,
        error,
      })
    }
  }

  async function confirmLookupResult(result) {
    if (!lookupTarget) return
    setLookupMessage('')
    try {
      const next = lookupMode === 'approximate-area'
        ? confirmObservedPlaceApproximateArea(
            observedEntities,
            lookupTarget.id,
            result,
            areaRadiusKm,
          )
        : lookupMode === 'fallback-area'
          ? confirmObservedRealPlaceFallbackArea(
              observedEntities,
              lookupTarget.id,
              result,
              areaRadiusKm,
            )
        : confirmObservedPlaceLocation(
            observedEntities,
            lookupTarget.id,
            result,
          )
      await onChangeObservedEntities(next)
      setLookupTargetId('')
      setLookupQuery('')
      setLookupResults([])
      setLookupState('idle')
      setLookupMessage(
        lookupMode !== 'exact'
          ? `已把“${lookupTarget.name}”标在参考区域内；圆圈不代表精确位置。`
          : `已把“${lookupTarget.name}”作为个人确认的现实地点加入地图。`,
      )
      recordReadingTrialDiagnostic({
        area: 'map',
        action: 'map-result-confirmation',
        outcome: 'success',
        providerId,
      })
    } catch (error) {
      setLookupMessage(error?.message || '保存地图位置失败')
      recordReadingTrialDiagnostic({
        area: 'map',
        action: 'map-result-confirmation',
        outcome: 'error',
        providerId,
        error,
      })
    }
  }

  return (
    <section
      className={`reader-panel reader-map-workspace ${isExpanded ? 'reader-map-expanded' : ''}`}
      ref={workspaceRef}
    >
      <div className="reader-panel-heading">
        <div>
          <MapIcon size={20} />
          <h3>探索已读地点</h3>
        </div>
        <div className="reader-map-heading-actions">
          <button type="button" className="btn btn-sm" onClick={onOpenSettings}>
            <Settings2 size={13} /> 地图设置
          </button>
          <button type="button" className="btn btn-sm" onClick={toggleFullscreen}>
            {isFullscreen || isExpanded
              ? <Minimize2 size={13} />
              : <Maximize2 size={13} />}
            {isFullscreen || isExpanded ? '退出全屏' : '全屏地图'}
          </button>
        </div>
      </div>
      <div className="reader-map-provider-panel">
        <strong>{READING_MAP_PROVIDERS[providerId].label}</strong>
        <span>
          {providerId === READING_MAP_PROVIDER.INTERNATIONAL
            ? '搜索结果优先显示中文；底图文字由 OpenStreetMap 数据决定。'
            : READING_MAP_PROVIDERS[providerId].description}
        </span>
        {providerId === READING_MAP_PROVIDER.DOMESTIC && !tiandituToken && (
          <button type="button" onClick={onOpenSettings}>填写天地图 Key</button>
        )}
      </div>
      <div className="reader-place-lookup">
        <div className="reader-place-lookup-heading">
          <div>
            <strong>补充地图位置</strong>
            <span>现实地点可确认位置；虚构或模糊地点只能设置宽泛参考区域。</span>
          </div>
        </div>
        {searchableObservedPlaces.length > 0 ? (
          <div className="reader-place-lookup-targets">
            {searchableObservedPlaces.map((place) => (
              <button
                className={lookupTargetId === place.id ? 'active' : ''}
                key={place.id}
                type="button"
                onClick={() => beginLookup(place)}
              >
                <MapPin size={13} />
                {place.placeKind === OBSERVED_PLACE_KIND.REAL
                  ? `定位“${place.name}”`
                  : `设置“${place.name}”的参考区域`}
              </button>
            ))}
          </div>
        ) : (
          <p>没有等待定位的地点。</p>
        )}
        {lookupTarget && (
          <>
            <div className="reader-place-name-context">
              <span>
                {lookupMode === 'exact'
                  ? '作品名称'
                  : lookupMode === 'fallback-area'
                    ? '精确位置未收录'
                    : '虚构或模糊地点'}
              </span>
              <strong>{lookupTarget.name}</strong>
              <small>
                {lookupMode === 'exact'
                  ? '请核对现代地图名称。'
                  : lookupMode === 'fallback-area'
                    ? '只选择它所在的现实城市或地区，不把结果当作该地点的精确坐标。'
                    : '请输入它可能所在的现实国家、州、省或地区，不要搜索虚构名称本身。'}
              </small>
            </div>
            <form className="reader-place-lookup-form" onSubmit={submitLookup}>
              <label>
                <span>{lookupMode === 'exact' ? '现代地图搜索词' : '现实参考区域'}</span>
                <input
                  value={lookupQuery}
                  onChange={(event) => {
                    setLookupQuery(event.target.value)
                    setLookupSuggestions([])
                  }}
                  maxLength={120}
                  placeholder={lookupMode === 'exact'
                    ? '例如 Virginia, United States'
                    : '例如 Georgia, United States'}
                />
              </label>
              {lookupMode !== 'exact' && (
                <label className="reader-place-radius">
                  <span>区域半径</span>
                  <select
                    value={areaRadiusKm}
                    onChange={(event) => setAreaRadiusKm(Number(event.target.value))}
                  >
                    {[20, 50, 100, 200, 500].map((radius) => (
                      <option key={radius} value={radius}>{radius} 公里</option>
                    ))}
                  </select>
                </label>
              )}
              {providerId === READING_MAP_PROVIDER.INTERNATIONAL
                && /[\p{Script=Han}]/u.test(lookupQuery)
                && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={!modelConfig.apiKey || translationState === 'working'}
                    onClick={suggestLookupQueries}
                    title={modelConfig.apiKey ? '' : '请先在设置中配置模型'}
                  >
                    <Sparkles size={13} />
                    {translationState === 'working' ? '翻译中…' : '生成英文搜索词'}
                  </button>
                )}
              <button type="submit" className="btn btn-sm" disabled={!lookupQuery.trim() || lookupState === 'loading'}>
                <ScanSearch size={13} /> {lookupState === 'loading' ? '搜索中…' : '搜索公网地图'}
              </button>
            </form>
            {lookupSuggestions.length > 0 && (
              <div className="reader-place-query-suggestions">
                {lookupSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className={lookupQuery === suggestion ? 'active' : ''}
                    onClick={() => setLookupQuery(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            {lookupMode === 'exact'
              && lookupState === 'ready'
              && lookupResults.length === 0
              && (
                <button
                  type="button"
                  className="btn btn-sm reader-place-fallback"
                  disabled={translationState === 'working'}
                  onClick={activateLookupFallback}
                >
                  <MapPin size={13} />
                  找不到精确地点，改用参考区域
                </button>
              )}
          </>
        )}
        {lookupResults.length > 0 && (
          <div className="reader-place-lookup-results">
            {lookupResults.map((result) => (
              <article key={result.id}>
                <div>
                  <strong>{result.label}</strong>
                  <span>
                    {result.latitude.toFixed(5)}, {result.longitude.toFixed(5)}
                    {result.category && ` · ${result.category}`}
                    {result.geometry && result.geometry.type !== 'Point'
                      ? ` · ${result.geometry.type}`
                      : ''}
                  </span>
                </div>
                <button type="button" onClick={() => confirmLookupResult(result)}>
                  {lookupMode !== 'exact'
                    ? '用作宽泛参考区域'
                    : `确认“${lookupTarget?.name}”是这里`}
                </button>
              </article>
            ))}
            <small>
              {lookupMode !== 'exact'
                ? '将显示半透明圆圈，不会标成精确地点。'
                : '现代地图候选需要你确认，不代表作品年代边界。'}
            </small>
          </div>
        )}
        {lookupMessage && <p className="reader-place-lookup-message" role="status">{lookupMessage}</p>}
      </div>
      <div className="reader-map-layout">
        <Suspense fallback={<div className="reader-map-loading">正在加载地图组件…</div>}>
          <ReadingGeoMap
            places={spatialPlaces}
            selectedPlaceId={selectedPlaceId}
            onSelectPlace={setSelectedPlaceId}
            providerId={renderedMapConfig.providerId}
            tiandituToken={renderedMapConfig.tiandituToken}
            isActive={isActive}
          />
        </Suspense>
        {places.length === 0 ? (
          <div className="reader-map-background-card">
            <MapPin size={20} />
            <strong>当前还没有可定位地点</strong>
            <span>先显示世界视图；加入地点后会自动缩放到相关区域。</span>
          </div>
        ) : (
          <div className="reader-place-list">
            {places.map((place) => (
              <button
                className={selectedPlace?.id === place.id ? 'active' : ''}
                key={place.id}
                type="button"
                onClick={() => setSelectedPlaceId(place.id)}
              >
                <strong>{place.name}</strong>
                <span>{PLACE_KIND_LABELS[place.placeKind] || '地点'}</span>
              </button>
            ))}
          </div>
        )}
        {distancePlaces.length >= 2 && (
          <section className="reader-place-distance">
            <div className="reader-content-section-heading">
              <div>
                <strong>比较两个地点</strong>
                <span>按需计算现代代表位置之间的直线距离</span>
              </div>
            </div>
            <div className="reader-place-distance-form">
              <select
                value={distanceFromId}
                onChange={(event) => {
                  const nextId = event.target.value
                  setDistanceFromId(nextId)
                  if (nextId === distanceToId) setDistanceToId('')
                  setDistancePair(null)
                }}
                aria-label="距离起点"
              >
                <option value="">选择起点</option>
                {distancePlaces.map((place) => (
                  <option key={place.id} value={place.id}>{place.name}</option>
                ))}
              </select>
              <span>到</span>
              <select
                value={distanceToId}
                onChange={(event) => {
                  setDistanceToId(event.target.value)
                  setDistancePair(null)
                }}
                aria-label="距离终点"
              >
                <option value="">选择终点</option>
                {distancePlaces
                  .filter((place) => place.id !== distanceFromId)
                  .map((place) => (
                    <option key={place.id} value={place.id}>{place.name}</option>
                  ))}
              </select>
              <button
                type="button"
                className="btn btn-sm"
                disabled={!distanceFromId || !distanceToId || distanceFromId === distanceToId}
                onClick={() => setDistancePair({
                  fromId: distanceFromId,
                  toId: distanceToId,
                })}
              >
                计算距离
              </button>
            </div>
            {distanceRelation && (
              <p className="reader-place-distance-result">
                {distancePlaces.find((place) => place.id === distancePair.fromId)?.name}
                {' → '}
                {distanceRelation.name}：{distanceRelation.direction}方向，直线约{' '}
                <strong>
                  {distanceRelation.distanceKm < 10
                    ? distanceRelation.distanceKm.toFixed(1)
                    : Math.round(distanceRelation.distanceKm)} 公里
                </strong>
              </p>
            )}
          </section>
        )}
        {selectedPlace && (
          <div className="reader-place-detail">
              <div className="reader-place-detail-heading">
                <div>
                <strong>{selectedPlace.name}</strong>
                <span>{PLACE_KIND_LABELS[selectedPlace.placeKind] || '地点'}</span>
                </div>
                {PLACE_ACCESS_LABELS[selectedPlace.accessMode] && (
                  <span className="reader-place-access">
                    {PLACE_ACCESS_LABELS[selectedPlace.accessMode]}
                  </span>
                )}
              </div>
              {selectedPlace.aliases?.length > 0 && (
                <p className="reader-place-aliases">别名：{selectedPlace.aliases.join('、')}</p>
              )}
              <section className="reader-place-detail-section">
                <div className="reader-content-section-heading">
                  <div>
                    <strong>地图位置</strong>
                    <span>现代地理参照</span>
                  </div>
                </div>
                <dl className="reader-place-meta">
                  {selectedPlace.parentLabel && (
                    <div><dt>区域</dt><dd>{selectedPlace.parentLabel}</dd></div>
                  )}
                  {selectedPlace.geocodingProviderId && (
                    <div>
                      <dt>地图服务</dt>
                      <dd>
                        {selectedPlace.geocodingProviderId === READING_MAP_PROVIDER.DOMESTIC
                          ? '天地图'
                          : 'OpenStreetMap Nominatim'}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>坐标或范围</dt>
                    <dd>
                      {selectedPlace.geometry
                        ? [
                            `${selectedPlace.geometry.latitude.toFixed(4)}, ${selectedPlace.geometry.longitude.toFixed(4)}`,
                            selectedPlace.geometry.type === 'area'
                              ? `半径约 ${selectedPlace.geometry.radiusKm} km`
                              : selectedPlace.geometry.type === 'geojson'
                                ? selectedPlace.geometry.geojson?.type || '路径或范围'
                                : null,
                          ].filter(Boolean).join(' · ')
                        : '未发布可显示的位置'}
                    </dd>
                  </div>
                </dl>
                {selectedPlace.scopeNote && (
                  <p className="reader-place-scope-note">{selectedPlace.scopeNote}</p>
                )}
                {['reader-confirmed-approximate-area', 'reader-confirmed-fallback-area']
                  .includes(selectedPlace.accessMode) && (
                    <p className="reader-place-precision">
                      参考区域只表示大致背景，不参与精确距离判断。
                    </p>
                  )}
              </section>
              {selectedPlace.safeNote && (
                <section className="reader-place-detail-section">
                  <div className="reader-content-section-heading">
                    <div>
                      <strong>无剧透背景</strong>
                      <span>当前进度可查看</span>
                    </div>
                  </div>
                  <ReadingSafeNote
                    entity={selectedPlace}
                    sources={sources}
                    className="reader-place-safe-note"
                  />
                </section>
              )}
          </div>
        )}
      </div>
    </section>
  )
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

function ReadingFactsPanel({
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

export function ReaderTool({ scene }) {
  const [catalog, setCatalog] = useState(null)
  const [selectedPackageId, setSelectedPackageId] = useState('')
  const [readingPackage, setReadingPackage] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [pendingChapterId, setPendingChapterId] = useState('')
  const [saveState, setSaveState] = useState('idle')
  const [excerpt, setExcerpt] = useState('')
  const [imageInput, setImageInput] = useState(null)
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false)
  const [scanResults, setScanResults] = useState([])
  const [selectedExcerptText, setSelectedExcerptText] = useState('')
  const [selectedEntityKind, setSelectedEntityKind] = useState(OBSERVED_ENTITY_KIND.PERSON)
  const [selectedPlaceKind, setSelectedPlaceKind] = useState(OBSERVED_PLACE_KIND.UNKNOWN)
  const [scanStatus, setScanStatus] = useState('')
  const [inputStatus, setInputStatus] = useState('')
  const [ocrState, setOcrState] = useState('idle')
  const [ocrProgress, setOcrProgress] = useState(0)
  const [activeTab, setActiveTab] = useState(READER_TAB.INPUT)
  const [mapMounted, setMapMounted] = useState(false)
  const [modelConfig, setModelConfig] = useState(() => loadStoredReadingModelConfig())
  const [mapConfig, setMapConfig] = useState(() => loadStoredReadingMapConfig())

  useEffect(() => {
    let active = true
    loadReadingPackageCatalog()
      .then((entries) => {
        if (!active) return
        setCatalog(entries)
      })
      .catch((error) => {
        if (active) setLoadError(error?.message || '无法读取阅读资料目录')
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const entry = catalog?.find((item) => item.id === selectedPackageId)
    if (!entry) return undefined
    let active = true
    setReadingPackage(null)
    setLoadError('')
    loadReadingPackage(entry)
      .then((pkg) => {
        if (active) setReadingPackage(pkg)
      })
      .catch((error) => {
        if (active) setLoadError(error?.message || '无法读取阅读资料包')
      })
    return () => { active = false }
  }, [catalog, selectedPackageId])

  useEffect(() => () => {
    if (imageInput?.url) URL.revokeObjectURL(imageInput.url)
  }, [imageInput])

  useEffect(() => {
    if (!imagePreviewOpen) return undefined
    function closePreview(event) {
      if (event.key === 'Escape') setImagePreviewOpen(false)
    }
    window.addEventListener('keydown', closePreview)
    return () => window.removeEventListener('keydown', closePreview)
  }, [imagePreviewOpen])

  useEffect(() => {
    if (activeTab === READER_TAB.MAP) setMapMounted(true)
  }, [activeTab])

  const editionId = readingPackage?.edition.id || ''
  const savedState = useLiveQuery(
    () => (editionId ? getReadingState(scene.id, editionId) : null),
    [scene.id, editionId],
  )
  const defaultChapterId = readingPackage?.chapters[0]?.id || ''
  const currentChapterId = pendingChapterId || savedState?.currentChapterId || defaultChapterId
  const currentChapter = readingPackage?.chapters.find((chapter) => chapter.id === currentChapterId)
  const progressPercent = readingPackage && currentChapter
    ? Math.round((currentChapter.number / readingPackage.chapters.length) * 100)
    : 0

  const editionSummary = useMemo(() => {
    if (!readingPackage) return ''
    const { edition } = readingPackage
    return [
      edition.publisher,
      edition.publishedAt === '未知' ? null : `${edition.publishedAt.replace('-', '年')}月`,
      edition.isbn.startsWith('personal-') ? null : `ISBN ${edition.isbn}`,
    ].filter(Boolean).join(' · ')
  }, [readingPackage])
  const observedEntities = savedState?.observedEntities || EMPTY_OBSERVED_ENTITIES

  useEffect(() => {
    const text = excerpt.trim()
    if (!text || !readingPackage) {
      setScanResults([])
      return undefined
    }
    const timer = setTimeout(() => {
      const packageMatches = scanOnDemandEntities(
        text,
        readingPackage.onDemandEntities || [],
      ).map((match) => ({ ...match, source: 'package' }))
      const observedMatches = scanObservedEntities(text, observedEntities)
      const seen = new Set()
      const knownMatches = [...packageMatches, ...observedMatches].filter((match) => {
        const key = `${match.entity.kind}:${normalizeObservedEntityName(match.matchedTerm)}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      setScanResults(knownMatches)
    }, 250)
    return () => clearTimeout(timer)
  }, [excerpt, observedEntities, readingPackage])

  const unlockedEntities = useMemo(
    () => unlockedOnDemandEntities(
      readingPackage?.onDemandEntities,
      observedEntities,
      currentChapterId,
      readingPackage?.chapters,
    ),
    [
      readingPackage?.onDemandEntities,
      readingPackage?.chapters,
      observedEntities,
      currentChapterId,
    ],
  )
  const personalMapEntities = useMemo(
    () => readerConfirmedMapEntities(
      observedEntities,
      currentChapterId,
      readingPackage?.chapters,
    ),
    [observedEntities, currentChapterId, readingPackage?.chapters],
  )
  const visibleMapEntities = useMemo(
    () => {
      const merged = new Map()
      for (const entity of [
        ...(readingPackage?.entities || []),
        ...unlockedEntities,
        ...personalMapEntities,
      ]) {
        const key = `${entity.kind}:${normalizeObservedEntityName(entity.name)}`
        const existing = merged.get(key)
        merged.set(key, existing && entity.geometry
          ? {
              ...existing,
              ...entity,
              aliases: [...new Set([...(existing.aliases || []), ...(entity.aliases || [])])],
            }
          : existing || entity)
      }
      return [...merged.values()]
    },
    [readingPackage?.entities, unlockedEntities, personalMapEntities],
  )

  async function changeChapter(chapterId) {
    setPendingChapterId(chapterId)
    setSaveState('saving')
    try {
      await saveReadingState(scene.id, editionId, {
        packageId: readingPackage.id,
        bookId: readingPackage.book.id,
        currentChapterId: chapterId,
      })
      setSaveState('saved')
    } catch {
      setSaveState('error')
    } finally {
      setPendingChapterId('')
    }
  }

  async function changeObservedEntities(observedEntities) {
    setSaveState('saving')
    try {
      await saveReadingState(scene.id, editionId, {
        packageId: readingPackage.id,
        bookId: readingPackage.book.id,
        observedEntities,
      })
      setSaveState('saved')
    } catch (error) {
      setSaveState('error')
      throw error
    }
  }

  function selectBook(packageId) {
    setSelectedPackageId(packageId)
    setPendingChapterId('')
    setExcerpt('')
    setScanResults([])
    setSelectedExcerptText('')
    setScanStatus('')
    setActiveTab(READER_TAB.INPUT)
    setMapMounted(false)
    clearImage()
  }

  async function createPersonalBook(form) {
    let pkg = createPersonalReadingPackage({
      ...form,
      packageId: generateId('reader-package-personal'),
      bookId: generateId('reader-book-personal'),
      editionId: generateId('reader-edition-personal'),
    })
    await savePersonalReadingPackage(pkg)
    let preparationStatus = ''
    const modelConfigured = Boolean(
      modelConfig.endpoint.trim()
      && modelConfig.model.trim()
      && modelConfig.apiKey.trim(),
    )
    if (form.prepareWithModel && modelConfigured) {
      try {
        const candidates = await preparePersonalBookKnowledge({
          endpoint: modelConfig.endpoint,
          model: modelConfig.model,
          apiKey: modelConfig.apiKey,
          temperature: modelConfig.temperature,
          book: pkg.book,
          edition: pkg.edition,
        })
        const prepared = mergePersonalBookKnowledge(
          pkg,
          candidates,
          () => generateId('personal-ai-entity'),
        )
        pkg = prepared.package
        await savePersonalReadingPackage(pkg)
        preparationStatus = `书籍已创建，并自动准备了 ${prepared.addedCount} 个基础名称。`
        recordReadingTrialDiagnostic({
          area: 'model',
          action: 'model-personal-book-preparation',
          outcome: 'success',
          providerId: modelConfig.providerId,
        })
      } catch (error) {
        preparationStatus = `书籍已创建；AI 基础资料暂时没有准备成功：${error?.message || '模型请求失败'}`
        recordReadingTrialDiagnostic({
          area: 'model',
          action: 'model-personal-book-preparation',
          outcome: 'error',
          providerId: modelConfig.providerId,
          error,
        })
      }
    } else if (form.prepareWithModel) {
      preparationStatus = '书籍已创建。配置模型后，可在阅读页一键准备基础资料。'
    }
    const entry = personalCatalogEntry(pkg)
    setCatalog((current) => [
      ...(current || []).filter((item) => item.id !== entry.id),
      entry,
    ])
    selectBook(pkg.id)
    setInputStatus(preparationStatus)
  }

  async function preparePersonalBook(candidates) {
    const prepared = mergePersonalBookKnowledge(
      readingPackage,
      candidates,
      () => generateId('personal-ai-entity'),
    )
    if (prepared.addedCount === 0) return 0
    await savePersonalReadingPackage(prepared.package)
    setReadingPackage(prepared.package)
    return prepared.addedCount
  }

  async function deletePersonalBook(entry) {
    const confirmed = window.confirm(
      `删除个人书籍“${entry.title}”？这会同时删除该版本的进度、已遇到名称和个人地图位置，且无法撤销。`,
    )
    if (!confirmed) return
    await deletePersonalReadingPackage(entry.id)
    setCatalog((current) => (current || []).filter((item) => item.id !== entry.id))
  }

  function returnToLibrary() {
    setSelectedPackageId('')
    setReadingPackage(null)
    setPendingChapterId('')
    setExcerpt('')
    setScanResults([])
    setSelectedExcerptText('')
    setScanStatus('')
    setActiveTab(READER_TAB.INPUT)
    setMapMounted(false)
    clearImage()
  }

  function saveModelConfig(nextConfig) {
    const normalized = saveStoredModelConfig(nextConfig)
    setModelConfig(normalized)
  }

  function saveMapConfig(nextConfig) {
    setMapConfig(saveStoredReadingMapConfig(nextConfig))
  }

  function changeExcerpt(value) {
    setExcerpt(value)
    setSelectedExcerptText('')
    setSelectedEntityKind(OBSERVED_ENTITY_KIND.PERSON)
    setSelectedPlaceKind(OBSERVED_PLACE_KIND.UNKNOWN)
    setScanStatus('')
    setInputStatus('')
  }

  async function pasteFromClipboard() {
    setInputStatus('')
    if (!navigator.clipboard?.readText) {
      setInputStatus('当前浏览器不支持直接读取剪贴板，请使用 Ctrl+V。')
      return
    }
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) {
        setInputStatus('剪贴板里没有文字。')
        return
      }
      changeExcerpt(text)
      setInputStatus('已从剪贴板粘贴。')
    } catch {
      setInputStatus('浏览器没有获得剪贴板权限，请点击文本框后使用 Ctrl+V。')
    }
  }

  function actionForObservedName(name, kind, packageEntityId = '') {
    const packageEntity = readingPackage.onDemandEntities?.find(
      (entity) => entity.id === packageEntityId,
    )
    const equivalentNames = packageEntity
      ? [packageEntity.name, packageEntity.originalName, ...(packageEntity.aliases || [])]
      : []
    return observedRecordAction(
      observedEntities,
      name,
      kind,
      currentChapterId,
      readingPackage.chapters,
      packageEntityId,
      equivalentNames,
    )
  }

  async function confirmObservedCandidate({
    name,
    kind,
    placeKind,
    packageEntityId = '',
  }) {
    setScanStatus('')
    try {
      const packageEntity = readingPackage.onDemandEntities?.find(
        (entity) => entity.id === packageEntityId,
      )
      const action = actionForObservedName(name, kind, packageEntityId)
      const next = upsertObservedEntity(observedEntities, {
        id: generateId('observed'),
        name,
        kind,
        placeKind,
        packageEntityId,
        equivalentNames: packageEntity
          ? [packageEntity.name, packageEntity.originalName, ...(packageEntity.aliases || [])]
          : [],
        firstSeenChapterId: currentChapterId,
      }, readingPackage.chapters)
      if (next === observedEntities) {
        setScanStatus(`“${name}”${action.label}。`)
        return
      }
      await changeObservedEntities(next)
      setSelectedExcerptText('')
      setScanStatus(
        action.type === 'move-earlier'
          ? `已把“${name}”的首次记录从${action.existingChapter?.label || '较后章节'}提前到${currentChapter?.label || '当前章'}。`
          : action.type === 'record-again'
            ? `已补记“${name}”在${currentChapter?.label || '当前章'}的出现。`
            : `已把“${name}”记在${currentChapter?.label || '当前章'}。`,
      )
    } catch (error) {
      setScanStatus(error?.message || '保存候选失败')
    }
  }

  async function confirmScannedEntity({ entity, matchedTerm }) {
    await confirmObservedCandidate({
      name: matchedTerm,
      kind: entity.kind,
      placeKind: entity.placeKind,
      packageEntityId: entity.id,
    })
  }

  function captureExcerptSelection(event) {
    const start = event.currentTarget.selectionStart
    const end = event.currentTarget.selectionEnd
    const selected = event.currentTarget.value.slice(start, end).trim()
    const nextSelected = selected.length >= 2
      && selected.length <= 120
      && !selected.includes('\n')
      ? selected
      : ''
    setSelectedExcerptText(nextSelected)
    if (nextSelected) {
      setSelectedEntityKind(OBSERVED_ENTITY_KIND.PERSON)
      setSelectedPlaceKind(OBSERVED_PLACE_KIND.UNKNOWN)
    }
  }

  async function confirmModelCandidate(candidate) {
    const packageEntity = readingPackage.onDemandEntities?.find(
      (entity) => entity.id === candidate.matchedEntityId,
    )
    const next = upsertObservedEntity(observedEntities, {
      id: generateId('observed'),
      name: candidate.name,
      kind: candidate.kind,
      placeKind: candidate.placeKind,
      packageEntityId: candidate.matchedEntityId,
      equivalentNames: packageEntity
        ? [packageEntity.name, packageEntity.originalName, ...(packageEntity.aliases || [])]
        : [],
      firstSeenChapterId: currentChapterId,
    }, readingPackage.chapters)
    if (next === observedEntities) return false
    await changeObservedEntities(next)
    return true
  }

  function chooseImage(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (imageInput?.url) URL.revokeObjectURL(imageInput.url)
    setImageInput({ file, name: file.name, url: URL.createObjectURL(file) })
    setImagePreviewOpen(false)
    setOcrState('idle')
    setOcrProgress(0)
    setInputStatus('')
    event.target.value = ''
  }

  function clearImage() {
    if (imageInput?.url) URL.revokeObjectURL(imageInput.url)
    setImageInput(null)
    setImagePreviewOpen(false)
    setOcrState('idle')
    setOcrProgress(0)
  }

  async function runLocalOcr() {
    if (!imageInput?.file || ocrState === 'working') return
    setOcrState('working')
    setOcrProgress(0)
    setInputStatus('正在本机初始化 OCR…')
    try {
      const text = await recognizeImageText(imageInput.file, (progress) => {
        if (Number.isFinite(progress?.progress)) {
          setOcrProgress(Math.round(progress.progress * 100))
        }
        if (progress?.status === 'recognizing text') {
          setInputStatus('正在本机识别截图文字…')
        }
      })
      if (!text) {
        setOcrState('empty')
        setInputStatus('OCR 没有识别出文字，可以换一张更清晰的截图。')
        recordReadingTrialDiagnostic({
          area: 'ocr',
          action: 'ocr-excerpt',
          outcome: 'error',
          providerId: 'local',
          error: new Error('没有识别出文字'),
        })
        return
      }
      changeExcerpt(text)
      setOcrState('done')
      setInputStatus('OCR 文字已放入当前段落，请先核对再扫描或调用模型。')
      recordReadingTrialDiagnostic({
        area: 'ocr',
        action: 'ocr-excerpt',
        outcome: 'success',
        providerId: 'local',
      })
    } catch (error) {
      setOcrState('error')
      setInputStatus(`本机 OCR 失败：${error?.message || '无法初始化识别引擎'}`)
      recordReadingTrialDiagnostic({
        area: 'ocr',
        action: 'ocr-excerpt',
        outcome: 'error',
        providerId: 'local',
        error,
      })
    }
  }

  if (loadError) return <ReaderError message={loadError} />
  if (!catalog) return <LoadingPanel message="正在加载阅读书架…" />
  if (!selectedPackageId) {
    return (
      <ReadingLibrary
        catalog={catalog}
        onSelect={selectBook}
        onCreate={createPersonalBook}
        onDelete={deletePersonalBook}
        modelConfig={modelConfig}
      />
    )
  }
  if (!readingPackage) return <LoadingPanel message="正在加载阅读资料…" />

  const readerTabs = [
    { id: READER_TAB.INPUT, label: '阅读输入', icon: ClipboardPaste },
    {
      id: READER_TAB.RECORDS,
      label: '已遇到',
      icon: UserRoundSearch,
      count: visibleObservedEntities(
        observedEntities,
        currentChapterId,
        readingPackage.chapters,
      ).length,
    },
    {
      id: READER_TAB.MAP,
      label: '地图',
      icon: MapIcon,
      count: visibleReadingEntities(
        visibleMapEntities,
        currentChapterId,
        readingPackage.chapters,
      ).filter((entity) => entity.kind === 'place').length,
    },
    ...(readingPackage.facts.length > 0 || unlockedEntities.some((entity) => entity.safeNote)
      ? [{
          id: READER_TAB.FACTS,
          label: '背景资料',
          icon: ShieldCheck,
          count: visibleReadingFacts(
            readingPackage.facts,
            currentChapterId,
            readingPackage.chapters,
          ).length + unlockedEntities.filter((entity) => entity.safeNote).length,
        }]
      : []),
    { id: READER_TAB.SETTINGS, label: '设置', icon: Settings2 },
  ]

  return (
    <div className="reader-tool">
      <section className="reader-hero">
        <div className="reader-hero-copy">
          <button type="button" className="reader-back-button" onClick={returnToLibrary}>
            <ArrowLeft size={15} /> 返回书架
          </button>
          <span className="reader-eyebrow"><BookOpen size={15} /> 经典文学阅读伴侣</span>
          <h2>{readingPackage.book.title}</h2>
          <p>
            {readingPackage.book.author}
            {readingPackage.edition.translators.length > 0
              ? ` · ${readingPackage.edition.translators.join('、')} 译`
              : ''}
          </p>
          <small>{editionSummary}</small>
        </div>
        <div className="reader-progress-card">
          <label>
            <span>我已经读到</span>
            <select value={currentChapterId} onChange={(event) => changeChapter(event.target.value)}>
              {readingPackage.chapters.map((chapter) => (
                <option key={chapter.id} value={chapter.id}>{chapter.label}</option>
              ))}
            </select>
          </label>
          <div className="reader-progress-track" aria-label={`阅读进度 ${progressPercent}%`}>
            <span style={{ width: `${progressPercent}%` }} />
          </div>
          <small>
            共 {readingPackage.chapters.length} 章
            {saveState === 'saving' && ' · 保存中…'}
            {saveState === 'saved' && ' · 已保存到本机'}
            {saveState === 'error' && ' · 保存失败'}
          </small>
        </div>
      </section>

      <nav className="reader-tabs" role="tablist" aria-label="阅读伴侣功能">
        {readerTabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              id={`reader-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`reader-panel-${tab.id}`}
              className={activeTab === tab.id ? 'active' : ''}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={17} />
              <span>{tab.label}</span>
              {Number.isFinite(tab.count) && <b>{tab.count}</b>}
            </button>
          )
        })}
      </nav>

      <main
        className="reader-tab-content"
        id={`reader-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`reader-tab-${activeTab}`}
      >
        {activeTab === READER_TAB.INPUT && (
          <div className="reader-input-grid">
          <section className="reader-panel">
            <div className="reader-panel-heading">
              <div>
                <ClipboardPaste size={20} />
                <h3>放入正在阅读的内容</h3>
              </div>
            </div>
            {readingPackage.personal && (
              <PersonalBookPreparationPanel
                readingPackage={readingPackage}
                modelConfig={modelConfig}
                onPrepared={preparePersonalBook}
                onOpenSettings={() => setActiveTab(READER_TAB.SETTINGS)}
              />
            )}
            <div className="reader-input-sources" aria-label="选择内容输入方式">
              <button type="button" className="reader-input-source" onClick={pasteFromClipboard}>
                <ClipboardPaste size={20} />
                <span>
                  <strong>从剪贴板粘贴</strong>
                  <small>直接放入刚复制的文字</small>
                </span>
              </button>
              <label className="reader-input-source">
                <Image size={20} />
                <span>
                  <strong>从截图提取</strong>
                  <small>选择图片后在本机识别</small>
                </span>
                <Upload size={15} />
                <input type="file" accept="image/*" onChange={chooseImage} hidden />
              </label>
            </div>
            {imageInput && (
              <>
                <div className="reader-image-attachment">
                  <button
                    type="button"
                    className="reader-image-thumbnail"
                    onClick={() => setImagePreviewOpen(true)}
                    aria-label="打开截图大图"
                  >
                    <img src={imageInput.url} alt="" />
                  </button>
                  <div>
                    <strong>{imageInput.name}</strong>
                    <span>点击缩略图查看大图</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={runLocalOcr}
                    disabled={ocrState === 'working'}
                  >
                    <ScanSearch size={13} />
                    {ocrState === 'working'
                      ? `识别中 ${ocrProgress}%`
                      : '提取文字'}
                  </button>
                  <button type="button" className="icon-btn" onClick={clearImage} aria-label="移除截图">
                    <X size={15} />
                  </button>
                </div>
                {imagePreviewOpen && (
                  <div
                    className="reader-image-lightbox"
                    role="dialog"
                    aria-modal="true"
                    aria-label="截图大图预览"
                    onMouseDown={(event) => {
                      if (event.target === event.currentTarget) setImagePreviewOpen(false)
                    }}
                  >
                    <div>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => setImagePreviewOpen(false)}
                        aria-label="关闭大图"
                      >
                        <X size={18} />
                      </button>
                      <img src={imageInput.url} alt="所选阅读页面大图预览" />
                    </div>
                  </div>
                )}
              </>
            )}
            <label className="reader-excerpt-field">
              <span>粘贴当前段落</span>
              <textarea
                className="textarea"
                value={excerpt}
                onChange={(event) => changeExcerpt(event.target.value)}
                onSelect={captureExcerptSelection}
                placeholder="从微信读书复制一小段文字，本机可以扫描其中已审计的名称…"
                rows={7}
              />
              <small>{excerpt.length} 字</small>
            </label>
            {selectedExcerptText && (
              <div
                className={[
                  'reader-selection-add',
                  selectedEntityKind === OBSERVED_ENTITY_KIND.PLACE ? 'has-place' : '',
                ].filter(Boolean).join(' ')}
              >
                <strong>记录“{selectedExcerptText}”</strong>
                <select
                  aria-label="名称类型"
                  value={selectedEntityKind}
                  onChange={(event) => setSelectedEntityKind(event.target.value)}
                >
                  {Object.entries(OBSERVED_KIND_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                {selectedEntityKind === OBSERVED_ENTITY_KIND.PLACE && (
                  <select
                    aria-label="地点性质"
                    value={selectedPlaceKind}
                    onChange={(event) => setSelectedPlaceKind(event.target.value)}
                  >
                    {Object.entries(OBSERVED_PLACE_KIND_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={
                    actionForObservedName(selectedExcerptText, selectedEntityKind).type
                    === 'recorded'
                  }
                  onClick={() => confirmObservedCandidate({
                    name: selectedExcerptText,
                    kind: selectedEntityKind,
                    placeKind: selectedEntityKind === OBSERVED_ENTITY_KIND.PLACE
                      ? selectedPlaceKind
                      : undefined,
                  })}
                >
                  <Plus size={13} />
                  {actionForObservedName(selectedExcerptText, selectedEntityKind).label}
                </button>
              </div>
            )}
            <p className="reader-input-status" role="status">
              {inputStatus || '\u00a0'}
            </p>
            <div className="reader-reading-workspace">
              <div className="reader-reading-lane reader-understanding-lane">
                <ReadingQuestionPanel
                  excerpt={excerpt}
                  selectedText={selectedExcerptText}
                  bookTitle={readingPackage.book.title}
                  currentChapter={currentChapter}
                  modelConfig={modelConfig}
                  onOpenSettings={() => setActiveTab(READER_TAB.SETTINGS)}
                />
              </div>
              <div className="reader-reading-lane reader-recording-lane">
                <div className="reader-reading-lane-heading">
                  <UserRoundSearch size={17} />
                  <strong>记录这段里的名称</strong>
                </div>
                {scanResults.length > 0 && (
              <div className="reader-scan-results" role="status">
                <div className="reader-scan-results-heading">
                  <strong>本机已知名称匹配</strong>
                  <span>{scanResults.length} 个</span>
                </div>
                {scanResults.map((result) => {
                  const action = actionForObservedName(
                    result.matchedTerm,
                    result.entity.kind,
                  )
                  return (
                  <div className="reader-scan-result" key={result.entity.id}>
                    <div>
                      <strong>{result.matchedTerm}</strong>
                      <span>
                        {result.entity.kind === OBSERVED_ENTITY_KIND.PLACE
                          ? (PLACE_KIND_LABELS[result.entity.placeKind]
                            || OBSERVED_PLACE_KIND_LABELS[result.entity.placeKind]
                            || '地点')
                          : OBSERVED_KIND_LABELS[result.entity.kind]}
                        {result.entity.name !== result.matchedTerm ? ` · 资料名 ${result.entity.name}` : ''}
                        {result.source === 'observed' ? ' · 已遇到名称' : ''}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={action.type === 'recorded'}
                      onClick={() => confirmScannedEntity(result)}
                    >
                      <Plus size={13} /> {action.label}
                    </button>
                  </div>
                  )
                })}
              </div>
                )}
                {scanStatus && <p className="reader-scan-status" role="status">{scanStatus}</p>}

                <ModelAnalysisPanel
                  excerpt={excerpt}
                  bookTitle={readingPackage.book.title}
                  currentChapter={currentChapter}
                  knownEntities={readingPackage.onDemandEntities || []}
                  onConfirmCandidate={confirmModelCandidate}
                  actionFor={actionForObservedName}
                  modelConfig={modelConfig}
                  onOpenSettings={() => setActiveTab(READER_TAB.SETTINGS)}
                />
              </div>
            </div>

          </section>
          </div>
        )}

        {activeTab === READER_TAB.RECORDS && (
          <ObservedEntitiesPanel
            observedEntities={observedEntities}
            onDemandEntities={readingPackage.onDemandEntities || []}
            sources={readingPackage.sources || []}
            currentChapterId={currentChapterId}
            currentChapter={currentChapter}
            chapters={readingPackage.chapters}
            onChange={changeObservedEntities}
          />
        )}

        {mapMounted && (
          <div hidden={activeTab !== READER_TAB.MAP}>
            <ReadingMapPanel
              entities={visibleMapEntities}
              observedEntities={observedEntities}
              onDemandEntities={readingPackage.onDemandEntities || []}
              sources={readingPackage.sources || []}
              currentChapterId={currentChapterId}
              chapters={readingPackage.chapters}
              onChangeObservedEntities={changeObservedEntities}
              mapConfig={mapConfig}
              modelConfig={modelConfig}
              bookTitle={readingPackage.book.title}
              currentChapter={currentChapter}
              onOpenSettings={() => setActiveTab(READER_TAB.SETTINGS)}
              isActive={activeTab === READER_TAB.MAP}
            />
          </div>
        )}

        {activeTab === READER_TAB.FACTS && (
          <ReadingFactsPanel
            key={`${readingPackage.id}:${currentChapterId}`}
            facts={readingPackage.facts}
            entities={readingPackage.entities}
            backgroundEntities={unlockedEntities}
            sources={readingPackage.sources || []}
            currentChapterId={currentChapterId}
            currentChapter={currentChapter}
            chapters={readingPackage.chapters}
          />
        )}

        {activeTab === READER_TAB.SETTINGS && (
          <ReadingServiceSettings
            modelConfig={modelConfig}
            mapConfig={mapConfig}
            scene={scene}
            readingPackage={readingPackage}
            readingState={savedState}
            currentChapterId={currentChapterId}
            onLoadModelProvider={(providerId) => loadStoredReadingModelConfig(providerId, false)}
            onSaveModel={saveModelConfig}
            onSaveMap={saveMapConfig}
          />
        )}
      </main>
    </div>
  )
}
