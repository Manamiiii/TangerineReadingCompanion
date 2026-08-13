import { useEffect, useState } from 'react'
import { ExternalLink, Sparkles } from 'lucide-react'
import {
  READING_MODEL_PROVIDER,
  READING_MODEL_PROVIDERS,
} from './modelProviders.js'
import { Modal } from '../../components/common.jsx'

export function ModelSettingsModal({
  config,
  domainLabel,
  copySourceLabel,
  canCopySource = false,
  onLoadProvider,
  onLoadCopySource,
  onSave,
  onClose,
}) {
  const [draft, setDraft] = useState(config)
  const [message, setMessage] = useState('')

  useEffect(() => setDraft(config), [config])

  const provider = READING_MODEL_PROVIDERS[draft.providerId]
    || READING_MODEL_PROVIDERS[READING_MODEL_PROVIDER.CUSTOM]

  function submit(event) {
    event.preventDefault()
    onSave(draft)
    setMessage(draft.apiKey.trim()
      ? `已保存 ${provider.label} 配置。`
      : '接口地址和模型已保存，API Key 已清除。')
  }

  function copySourceConfig() {
    setDraft(onLoadCopySource())
    setMessage(`已载入${copySourceLabel}配置；保存后将成为独立的${domainLabel}配置。`)
  }

  return (
    <Modal title={`${domainLabel}模型服务`} onClose={onClose} size="md">
      <form className="shared-model-settings" onSubmit={submit}>
        <p>
          这组配置只供{domainLabel}使用，与{copySourceLabel}互不联动。
          只有点击模型功能时才会发送当前所需的少量内容。
        </p>
        <div className="shared-model-copy">
          <button
            type="button"
            className="btn btn-sm"
            onClick={copySourceConfig}
            disabled={!canCopySource}
          >
            复制{copySourceLabel}配置
          </button>
          <small>
            {canCopySource
              ? '复制会载入当前表单，保存后仍可独立修改。'
              : `${copySourceLabel}还没有已保存的配置。`}
          </small>
        </div>
        <label>
          <span>模型供应商</span>
          <select
            className="select"
            value={draft.providerId}
            onChange={(event) => {
              setDraft(onLoadProvider(event.target.value))
              setMessage('')
            }}
          >
            {Object.values(READING_MODEL_PROVIDERS).map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
          <small>{provider.description}</small>
        </label>
        <label>
          <span>Chat Completions 兼容地址</span>
          <input
            className="input"
            value={draft.endpoint}
            onChange={(event) => setDraft((current) => ({ ...current, endpoint: event.target.value }))}
          />
        </label>
        <label>
          <span>模型 ID</span>
          <input
            className="input"
            list="shared-model-options"
            value={draft.model}
            onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))}
            placeholder="按服务商文档填写"
          />
          <datalist id="shared-model-options">
            {provider.models.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </datalist>
        </label>
        <label>
          <span>API Key</span>
          <input
            className="input"
            type="password"
            value={draft.apiKey}
            onChange={(event) => setDraft((current) => ({ ...current, apiKey: event.target.value }))}
            placeholder="只保存在当前浏览器会话"
            autoComplete="off"
          />
        </label>
        {(provider.consoleUrl || provider.docsUrl) && (
          <div className="shared-model-links">
            {provider.consoleUrl && <a href={provider.consoleUrl} target="_blank" rel="noreferrer">服务商控制台 <ExternalLink size={12} /></a>}
            {provider.docsUrl && <a href={provider.docsUrl} target="_blank" rel="noreferrer">官方文档 <ExternalLink size={12} /></a>}
          </div>
        )}
        <small>接口和模型保存在 localStorage；API Key 保存在 sessionStorage，关闭浏览器会话后失效。</small>
        {message && <p className="shared-model-message" role="status">{message}</p>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={() => setDraft((current) => ({ ...current, apiKey: '' }))}>清除 Key</button>
          <button type="submit" className="btn btn-primary"><Sparkles size={14} /> 保存配置</button>
        </div>
      </form>
    </Modal>
  )
}
