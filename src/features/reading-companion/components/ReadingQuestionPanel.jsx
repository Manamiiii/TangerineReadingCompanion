import { useAsyncTask } from '../../../platform/useAsyncTask.js'
import { useEffect, useState } from 'react'
import { Settings2, ShieldCheck } from 'lucide-react'
import { answerReadingQuestion } from '../model/modelAdapter.js'
import { recordReadingTrialDiagnostic } from '../domain/trialDiagnostics.js'

export function ReadingQuestionPanel({
  excerpt,
  backgrounds,
  selectedText,
  modelConfig,
  onOpenSettings,
}) {
  const task = useAsyncTask(backgrounds)
  const [question, setQuestion] = useState('')
  const [requestState, setRequestState] = useState('idle')
  const [message, setMessage] = useState('')
  const [result, setResult] = useState(null)
  useEffect(() => { setResult(null); setRequestState('idle') }, [backgrounds])
  const configured = Boolean(
    modelConfig.endpoint.trim()
    && modelConfig.model.trim()
    && modelConfig.apiKey.trim(),
  )

  useEffect(() => {
    if (selectedText) { task.cancel(); setRequestState('idle'); setResult(null) }
    if (selectedText) setQuestion(`“${selectedText}”是什么意思？`)
  }, [selectedText, task])

  async function ask(event) {
    event.preventDefault()
    const ticket = task.start()
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
        backgrounds,
        signal: ticket.signal,
      })
      if (!ticket.isCurrent()) return
      setResult(answer)
      setRequestState('done')
      recordReadingTrialDiagnostic({
        area: 'model',
        action: 'model-question',
        outcome: 'success',
        providerId: modelConfig.providerId,
      })
    } catch (error) {
      if (!ticket.isCurrent()) return
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
            <strong>查找当前内容依据</strong>
            <p>从当前段落和已解锁背景中摘录依据。</p>
          </div>
        </div>
        {configured ? (
          <span className="reader-safe-chip">限当前依据</span>
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
            task.cancel()
            setRequestState('idle')
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
          {requestState === 'working' ? '查找中…' : '查找'}
        </button>
      </form>
      {message && <p className="reader-model-message" role="status">{message}</p>}
      {result && (
        <div className="reader-question-answer" role="status">
          <strong>相关依据</strong>
          {result.evidence.map((item, index) => <blockquote key={index}><p>{item.quote}</p><small>{item.label}</small></blockquote>)}
        </div>
      )}
    </div>
  )
}

