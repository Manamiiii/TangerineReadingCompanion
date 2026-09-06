import { useAsyncTask } from '../../../platform/useAsyncTask.js'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Map as MapIcon, MapPin, Maximize2, Minimize2, ScanSearch, Settings2, Sparkles } from 'lucide-react'
import { searchReadingPlaces } from '../map/geocoding.js'
import { suggestReadingPlaceQueries } from '../model/modelAdapter.js'
import { recordReadingTrialDiagnostic } from '../domain/trialDiagnostics.js'
import { ReadingSafeNote } from './ReadingSafeNote.jsx'
import { READING_MAP_PROVIDER, READING_MAP_PROVIDERS } from '../map/mapConfig.js'
import { confirmObservedPlaceApproximateArea, confirmObservedPlaceLocation, confirmObservedRealPlaceFallbackArea, OBSERVED_ENTITY_KIND, OBSERVED_PLACE_KIND, matchOnDemandEntity, readingPlaceRelations, visibleReadingEntities, visibleObservedEntities } from '../domain/readingCompanion.js'
import { PLACE_KIND_LABELS, PLACE_ACCESS_LABELS } from './readerUi.js'

const ReadingGeoMap = lazy(() => import('./ReadingGeoMap.jsx').then(module => ({ default: module.ReadingGeoMap })))

export function ReadingMapPanel({
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
  focus,
  sessionVersion,
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
  const lookupContext = JSON.stringify([sessionVersion, currentChapterId, providerId, lookupTargetId, lookupQuery, lookupMode, isActive])
  const lookupTask = useAsyncTask(lookupContext)
  useEffect(() => {
    setLookupResults([])
    setLookupState('idle')
    setTranslationState('idle')
    setLookupMessage('')
  }, [lookupContext])
  useEffect(() => { setLookupSuggestions([]) }, [sessionVersion, currentChapterId, providerId, lookupTargetId])
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
  useEffect(() => {
    if (!isActive || !focus) return
    const place = places.find(item => item.id === focus.packageEntityId || item.id === 'reader-map:' + focus.id || item.name === focus.name)
    if (place) setSelectedPlaceId(place.id)
    else if (searchableObservedPlaces.some(item => item.id === focus.id)) setLookupTargetId(focus.id)
  }, [focus, isActive, places, searchableObservedPlaces])
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
    lookupTask.cancel()
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
    const ticket = lookupTask.start()
    setTranslationState('working')
    setLookupMessage('')
    try {
      const suggestions = await suggestReadingPlaceQueries({
        endpoint: modelConfig.endpoint,
        model: modelConfig.model,
        apiKey: modelConfig.apiKey,
        signal: ticket.signal,
        temperature: modelConfig.temperature,
        query: lookupMode === 'approximate-area' ? lookupQuery : lookupTarget.name,
        bookTitle,
        chapterLabel: currentChapter?.label,
      })
      if (!ticket.isCurrent()) return
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
      if (!ticket.isCurrent()) return
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
    const ticket = lookupTask.start()
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
          signal: ticket.signal,
          temperature: modelConfig.temperature,
          query: lookupTarget.name,
          bookTitle,
          chapterLabel: currentChapter?.label,
        })
        if (!ticket.isCurrent()) return
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
      if (!ticket.isCurrent()) return
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
    const ticket = lookupTask.start()
    setLookupState('loading')
    setLookupMessage('')
    setLookupResults([])
    try {
      const results = await searchReadingPlaces({
        providerId,
        query: lookupQuery,
        tiandituToken,
        signal: ticket.signal,
      })
      if (!ticket.isCurrent()) return
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
      if (!ticket.isCurrent()) return
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
      const update = current => lookupMode === 'approximate-area'
        ? confirmObservedPlaceApproximateArea(
            current,
            lookupTarget.id,
            result,
            areaRadiusKm,
          )
        : lookupMode === 'fallback-area'
          ? confirmObservedRealPlaceFallbackArea(
              current,
              lookupTarget.id,
              result,
              areaRadiusKm,
            )
        : confirmObservedPlaceLocation(
            current,
            lookupTarget.id,
            result,
          )
      await onChangeObservedEntities(update)
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
                    lookupTask.cancel()
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


