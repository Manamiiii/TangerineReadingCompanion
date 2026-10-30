import { modelConfigIsComplete } from '../../model/modelConfig.js'
import { useAsyncTask } from '../../../platform/useAsyncTask.js'
import { useState } from 'react'
import { Settings2, Sparkles } from 'lucide-react'
import { preparePersonalBookKnowledge } from '../model/modelAdapter.js'
import { recordReadingTrialDiagnostic } from '../domain/trialDiagnostics.js'

export function PersonalBookPreparationPanel({
  readingPackage,
  modelConfig,
  onPrepared,
  onOpenSettings,
}) {
  const task = useAsyncTask(readingPackage.id)
  const [requestState, setRequestState] = useState('idle')
  const [message, setMessage] = useState('')
  const configured = modelConfigIsComplete(modelConfig)
  const preparedCount = (readingPackage.onDemandEntities || [])
    .filter((entity) => entity.sourceIds?.includes('source-personal-model-preparation'))
    .length

  async function prepare() {
    const ticket = task.start()
    setRequestState('working')
    setMessage('')
    try {
      const candidates = await preparePersonalBookKnowledge({
        endpoint: modelConfig.endpoint,
        model: modelConfig.model,
        apiKey: modelConfig.apiKey,
        signal: ticket.signal,
        temperature: modelConfig.temperature,
        book: readingPackage.book,
        edition: readingPackage.edition,
      })
      if (!ticket.isCurrent()) return
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
      if (!ticket.isCurrent()) return
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
          <strong>可选：AI 准备名称词典</strong>
          <small>
            {preparedCount > 0
              ? `已经准备 ${preparedCount} 个名称；重新运行只会补充，不会清空阅读记录。`
              : '也可以直接手动记录，无需配置模型。使用 AI 会发送书目和版本信息，可能产生 API 费用。'}
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

