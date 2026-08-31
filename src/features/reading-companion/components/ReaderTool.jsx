import { ReadingInputSource } from './ReadingInputSource.jsx'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useReadingInput } from '../input/useReadingInput.js'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, BookOpen, ClipboardPaste, Map as MapIcon, Plus, Settings2, ShieldCheck, UserRoundSearch } from 'lucide-react'
import { getReadingState, saveReadingState } from '../db/readingState.js'
import { deletePersonalReadingPackage, savePersonalReadingPackage } from '../db/personalBooks.js'
import { loadReadingPackage, loadReadingPackageCatalog } from '../data/readingPackages.js'
import { generateId } from '../../../utils.js'
import { preparePersonalBookKnowledge } from '../model/modelAdapter.js'
import { loadStoredModelConfig, saveStoredModelConfig } from '../../model/modelConfig.js'
import { createPersonalReadingPackage, mergePersonalBookKnowledge, personalCatalogEntry } from '../domain/personalBooks.js'
import { recordReadingTrialDiagnostic } from '../domain/trialDiagnostics.js'
import { ReadingLibrary } from './ReadingLibrary.jsx'
import { loadLastReadingPackageId, parseReaderLocation, saveLastReadingPackageId, writeReaderLocation } from '../navigation/readerLocation.js'
import { loadStoredReadingMapConfig, saveStoredReadingMapConfig } from '../map/mapConfig.js'
import { OBSERVED_ENTITY_KIND, OBSERVED_PLACE_KIND, normalizeObservedEntityName, readerConfirmedMapEntities, scanOnDemandEntities, scanObservedEntities, unlockedOnDemandEntities, upsertObservedEntity, visibleReadingEntities, visibleReadingFacts, visibleObservedEntities } from '../domain/readingCompanion.js'
import { PLACE_KIND_LABELS, OBSERVED_KIND_LABELS, OBSERVED_PLACE_KIND_LABELS, READER_TAB, observedRecordAction } from './readerUi.js'
import { ModelAnalysisPanel } from './ModelAnalysisPanel.jsx'
import { PersonalBookPreparationPanel } from './PersonalBookPreparationPanel.jsx'
import { ReadingQuestionPanel } from './ReadingQuestionPanel.jsx'
import { ObservedEntitiesPanel } from './ObservedEntitiesPanel.jsx'
import { ReadingMapPanel } from './ReadingMapPanel.jsx'

const ReadingServiceSettings = lazy(() => import('./ReadingServiceSettings.jsx').then((module) => ({
  default: module.ReadingServiceSettings,
})))

const ReadingFactsPanel = lazy(() => import('./ReadingFactsPanel.jsx').then((module) => ({
  default: module.ReadingFactsPanel,
})))

const EMPTY_OBSERVED_ENTITIES = Object.freeze([])

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

export function ReaderTool() {
  const [catalog, setCatalog] = useState(null)
  const [selectedPackageId, setSelectedPackageId] = useState(
    () => parseReaderLocation(window.location.hash).packageId,
  )
  const [readingPackage, setReadingPackage] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [pendingChapterId, setPendingChapterId] = useState('')
  const [saveState, setSaveState] = useState('idle')
  const {
    excerpt, link, imageInput, inputStatus, ocrState, ocrProgress, sessionVersion,
    setInputStatus, changeExcerpt: updateExcerpt, pasteFromClipboard, chooseImage,
    clearImage, clearInput, runLocalOcr,
  } = useReadingInput(selectedPackageId)
  const [scanResults, setScanResults] = useState([])
  const [selectedExcerptText, setSelectedExcerptText] = useState('')
  const [selectedEntityKind, setSelectedEntityKind] = useState(OBSERVED_ENTITY_KIND.PERSON)
  const [selectedPlaceKind, setSelectedPlaceKind] = useState(OBSERVED_PLACE_KIND.UNKNOWN)
  const [scanStatus, setScanStatus] = useState('')
  const [activeTab, setActiveTab] = useState(
    () => parseReaderLocation(window.location.hash).tab,
  )
  const [mapMounted, setMapMounted] = useState(false)
  const [mapFocus, setMapFocus] = useState(null)
  const [lastPackageId, setLastPackageId] = useState(() => loadLastReadingPackageId())
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
    function applyBrowserLocation() {
      const location = parseReaderLocation(window.location.hash)
      setSelectedPackageId(location.packageId)
      setReadingPackage((current) => (
        current?.id === location.packageId ? current : null
      ))
      setActiveTab(location.tab)
      if (location.tab === READER_TAB.MAP) setMapMounted(true)
    }
    window.addEventListener('popstate', applyBrowserLocation)
    window.addEventListener('hashchange', applyBrowserLocation)
    return () => {
      window.removeEventListener('popstate', applyBrowserLocation)
      window.removeEventListener('hashchange', applyBrowserLocation)
    }
  }, [])

  useEffect(() => {
    if (!catalog || !selectedPackageId) return
    if (catalog.some((entry) => entry.id === selectedPackageId)) return
    setSelectedPackageId('')
    setReadingPackage(null)
    setActiveTab(READER_TAB.INPUT)
    writeReaderLocation({}, { replace: true })
  }, [catalog, selectedPackageId])

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

  useEffect(() => {
    if (!readingPackage) return
    setLastPackageId(saveLastReadingPackageId(readingPackage.id))
  }, [readingPackage])

  useEffect(() => {
    setSelectedExcerptText('')
    setScanStatus('')
  }, [sessionVersion])


  useEffect(() => {
    if (activeTab === READER_TAB.MAP) setMapMounted(true)
  }, [activeTab])

  const editionId = readingPackage?.edition.id || ''
  const savedState = useLiveQuery(
    () => (editionId ? getReadingState(editionId) : null),
    [editionId],
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

  useEffect(() => {
    if (!readingPackage || activeTab !== READER_TAB.FACTS) return
    const hasVisibleBackground = readingPackage.facts.length > 0
      || unlockedEntities.some((entity) => entity.safeNote)
    if (hasVisibleBackground) return
    setActiveTab(READER_TAB.INPUT)
    writeReaderLocation({ packageId: readingPackage.id, tab: READER_TAB.INPUT }, { replace: true })
  }, [activeTab, readingPackage, unlockedEntities])
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
    clearInput()
    setMapFocus(null)
    setPendingChapterId(chapterId)
    setSaveState('saving')
    try {
      await saveReadingState(editionId, {
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
      await saveReadingState(editionId, {
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

  function openTab(tab) {
    setActiveTab(tab)
    if (tab === READER_TAB.MAP) setMapMounted(true)
    writeReaderLocation({ packageId: selectedPackageId, tab }, { replace: true })
  }

  function selectBook(packageId) {
    setSelectedPackageId(packageId)
    setLastPackageId(saveLastReadingPackageId(packageId))
    setPendingChapterId('')
    clearInput()
    setScanResults([])
    setSelectedExcerptText('')
    setScanStatus('')
    setActiveTab(READER_TAB.INPUT)
    setMapMounted(false)
    writeReaderLocation({ packageId, tab: READER_TAB.INPUT })
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
    if (lastPackageId === entry.id) {
      saveLastReadingPackageId('')
      setLastPackageId('')
    }
  }

  function returnToLibrary() {
    setSelectedPackageId('')
    setReadingPackage(null)
    setPendingChapterId('')
    clearInput()
    setScanResults([])
    setSelectedExcerptText('')
    setScanStatus('')
    setActiveTab(READER_TAB.INPUT)
    setMapMounted(false)
    writeReaderLocation({})
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
    updateExcerpt(value)
    setSelectedExcerptText('')
    setSelectedEntityKind(OBSERVED_ENTITY_KIND.PERSON)
    setSelectedPlaceKind(OBSERVED_PLACE_KIND.UNKNOWN)
    setScanStatus('')
    setInputStatus('')
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

  if (loadError) return <ReaderError message={loadError} />
  if (!catalog) return <LoadingPanel message="正在加载阅读书架…" />
  if (!selectedPackageId) {
    return (
      <ReadingLibrary
        catalog={catalog}
        continuePackageId={lastPackageId}
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
              onClick={() => openTab(tab.id)}
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
                onOpenSettings={() => openTab(READER_TAB.SETTINGS)}
              />
            )}
            <ReadingInputSource key={sessionVersion}
              excerpt={excerpt}
              link={link}
              imageInput={imageInput}
              ocrState={ocrState}
              ocrProgress={ocrProgress}
              pasteFromClipboard={pasteFromClipboard}
              chooseImage={chooseImage}
              runLocalOcr={runLocalOcr}
              clearImage={clearImage}
              clearInput={clearInput}
              changeExcerpt={changeExcerpt}
              captureExcerptSelection={captureExcerptSelection}
            />
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
            <div className="reader-reading-workspace" key={`${selectedPackageId}:${currentChapterId}:${sessionVersion}`}>
              <div className="reader-reading-lane reader-understanding-lane">
                <ReadingQuestionPanel
                  excerpt={excerpt}
                  selectedText={selectedExcerptText}
                  bookTitle={readingPackage.book.title}
                  currentChapter={currentChapter}
                  modelConfig={modelConfig}
                  onOpenSettings={() => openTab(READER_TAB.SETTINGS)}
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
                  onOpenSettings={() => openTab(READER_TAB.SETTINGS)}
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
            onOpenMap={entity => { setMapFocus({ id: entity.id, name: entity.name, packageEntityId: entity.packageEntityId }); openTab(READER_TAB.MAP) }}
          />
        )}

        {mapMounted && (
          <div hidden={activeTab !== READER_TAB.MAP}>
            <ReadingMapPanel
              focus={mapFocus}
              key={selectedPackageId}
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
              onOpenSettings={() => openTab(READER_TAB.SETTINGS)}
              isActive={activeTab === READER_TAB.MAP}
            />
          </div>
        )}

        {activeTab === READER_TAB.FACTS && (
          <Suspense fallback={<div className="reader-empty-state">正在加载背景资料…</div>}>
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
          </Suspense>
        )}

        {activeTab === READER_TAB.SETTINGS && (
          <Suspense fallback={<div className="reader-empty-state">正在加载设置…</div>}>
            <ReadingServiceSettings
              modelConfig={modelConfig}
              mapConfig={mapConfig}
              readingPackage={readingPackage}
              readingState={savedState}
              currentChapterId={currentChapterId}
              onLoadModelProvider={(providerId) => loadStoredReadingModelConfig(providerId, false)}
              onSaveModel={saveModelConfig}
              onSaveMap={saveMapConfig}
            />
          </Suspense>
        )}
      </main>
    </div>
  )
}
