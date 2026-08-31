import { useEffect, useState } from 'react'
import { Settings2, ShieldCheck } from 'lucide-react'
import { answerReadingQuestion } from '../model/modelAdapter.js'
import { recordReadingTrialDiagnostic } from '../domain/trialDiagnostics.js'

export function ReadingQuestionPanel({
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


