import { useRef, useState } from 'react'
import { Database, Download, Upload } from 'lucide-react'
import { ReaderTool } from './features/reading-companion/index.js'
import {
  exportReadingData,
  importReadingData,
  READING_COMPANION_SCENE,
} from './readingDataTransfer.js'

export default function App() {
  const fileInputRef = useRef(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  async function handleExport() {
    setError('')
    const payload = await exportReadingData()
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `tangerine-reading-companion-${payload.exportedAt.slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setNotice(`已导出 ${payload.data.meta.length} 条阅读记录。`)
  }

  async function handleImport(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    setNotice('')
    try {
      const payload = JSON.parse(await file.text())
      const result = await importReadingData(payload)
      setNotice(`已导入 ${result.imported} 条阅读记录${result.source === 'tangerine-tools' ? '，来源为 TangerineTools 备份' : ''}。页面即将刷新。`)
      window.setTimeout(() => window.location.reload(), 700)
    } catch (importError) {
      setError(importError?.message || '阅读数据导入失败')
    }
  }

  return (
    <div className="app-shell reader-app-shell">
      <header className="app-header reader-app-header">
        <div>
          <strong className="app-brand reader-app-brand">Tangerine Reading Companion</strong>
          <span className="reader-app-subtitle">橘子阅读伴侣</span>
        </div>
        <details className="reader-data-menu">
          <summary className="btn"><Database size={15} /> 数据管理</summary>
          <div className="reader-data-menu-popover">
            <strong>本机阅读数据</strong>
            <p>备份或恢复书架、阅读进度与个人记录。</p>
            <button type="button" className="btn" onClick={() => fileInputRef.current?.click()}>
              <Upload size={15} /> 导入备份
            </button>
            <button type="button" className="btn" onClick={handleExport}>
              <Download size={15} /> 导出备份
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept="application/json,.json" hidden onChange={handleImport} />
        </details>
      </header>
      {(notice || error) && (
        <div className={`reader-transfer-notice ${error ? 'error' : ''}`} role="status">
          {error || notice}
        </div>
      )}
      <main className="app-main reader-app-main">
        <ReaderTool scene={READING_COMPANION_SCENE} />
      </main>
    </div>
  )
}
