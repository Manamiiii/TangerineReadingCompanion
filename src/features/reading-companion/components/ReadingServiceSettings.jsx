import { useEffect, useState } from 'react'
import {
  Download,
  ExternalLink,
  Map as MapIcon,
  Sparkles,
} from 'lucide-react'
import packageMetadata from '../../../../package.json'
import {
  READING_MODEL_PROVIDER,
  READING_MODEL_PROVIDERS,
} from '../model/modelProviders.js'
import {
  READING_MAP_PROVIDER,
  READING_MAP_PROVIDERS,
  normalizeReadingMapProvider,
} from '../map/mapConfig.js'
import {
  createReadingFeedbackBundle,
  summarizeReadingFeedback,
} from '../domain/feedbackBundle.js'
import {
  readingTrialDiagnosticsSnapshot,
  recordReadingTrialDiagnostic,
} from '../domain/trialDiagnostics.js'

const APP_BUILD = String(import.meta.env.VITE_APP_BUILD || 'local').slice(0, 7)

export function ReadingServiceSettings({
  modelConfig,
  mapConfig,
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
