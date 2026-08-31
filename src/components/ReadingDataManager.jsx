import { useEffect, useRef, useState } from 'react'
import { Database, Download, Upload } from 'lucide-react'
import { Modal } from './common.jsx'
import { exportReadingData, importReadingData, previewReadingImport } from '../readingDataTransfer.js'
import { exportJsonFile, platform } from '../platform/index.js'
import { inspectStorage, requestPersistentStorage, lastBackupRequest, recordBackupRequest } from '../platform/storageStatus.js'

export function ReadingDataManager() {
  const fileInput = useRef(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState(null)
  const [backupRequested, setBackupRequested] = useState(false)
  const [backupConfirmed, setBackupConfirmed] = useState(false)
  const [storage, setStorage] = useState(null)
  const [lastBackup, setLastBackup] = useState(lastBackupRequest)
  useEffect(() => { inspectStorage().then(setStorage) }, [])

  async function downloadBackup() {
    setBusy(true)
    setError('')
    try {
      const payload = await exportReadingData()
      const result = await exportJsonFile(`tangerine-reading-companion-${Date.now()}.json`, payload)
      if (result.status === 'cancelled') return
      setLastBackup(recordBackupRequest())
      setBackupRequested(true)
      setNotice(`已发起 ${payload.data.meta.length} 条阅读记录的备份下载，请确认文件已保存。`)
    } catch { setError('备份导出失败，本机数据未修改。请检查存储和下载权限。') }
    finally { setBusy(false) }
  }

  async function chooseBackup(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    setError('')
    setNotice('')
    setPending(null)
    setBackupRequested(false)
    setBackupConfirmed(false)
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('备份超过 50 MB，请使用较小的阅读专用备份。')
      const payload = JSON.parse(await file.text())
      const preview = await previewReadingImport(payload)
      setPending({ payload, preview })
    } catch (cause) { setError(cause instanceof SyntaxError ? '文件不是有效 JSON，本机数据未修改。' : cause.message) }
    finally { setBusy(false) }
  }

  async function applyImport() {
    if (!pending || !backupConfirmed) return
    setBusy(true)
    setError('')
    try {
      const result = await importReadingData(pending.payload, { expectedSnapshot: pending.preview.snapshot })
      setNotice(`合并完成：新增 ${result.added} 条，覆盖 ${result.replaced} 条，保留 ${result.retained} 条。刷新后使用导入的数据。`)
      setPending({ result })
    } catch (cause) { setError(cause.message) }
    finally { setBusy(false) }
  }

  return <>
    <details className="reader-data-menu">
      <summary className="btn"><Database size={15} /> 数据管理</summary>
      <div className="reader-data-menu-popover">
        <strong>本机阅读数据</strong>
        <p>{storage?.persisted ? '浏览器已授予持久存储。' : '存储可能被浏览器回收，请定期备份。'}</p>
        {storage?.supported && !storage.persisted && <button type="button" className="btn" onClick={async () => setStorage(await requestPersistentStorage())}>请求持久存储</button>}
        <small>{lastBackup ? `最近发起备份：${new Date(lastBackup).toLocaleString()}（请核对文件）` : '尚未发起过备份。'}</small>
        <button type="button" className="btn" disabled={busy} onClick={() => fileInput.current?.click()}><Upload size={15} /> 导入备份</button>
        <button type="button" className="btn" disabled={busy} onClick={downloadBackup}><Download size={15} /> 导出备份</button>
      </div>
      <input ref={fileInput} aria-label="选择阅读备份" type="file" accept="application/json,.json" hidden onChange={chooseBackup} />
    </details>
    {(notice || error) && <div className={`reader-transfer-notice ${error ? 'error' : ''}`} role="status">{error || notice}</div>}
    {pending && <Modal title={pending.result ? '导入结果' : '备份导入预览'} onClose={() => !busy && setPending(null)}>
      {pending.preview ? <>
        <p>来源：{pending.preview.source === 'tangerine-tools' ? 'TangerineTools（仅提取阅读数据）' : '阅读伴侣'}</p>
        <p>新增 {pending.preview.added} 条 · 覆盖 {pending.preview.replaced} 条 · 保留本机其他 {pending.preview.retained} 条</p>
        <p>同 key 的整条记录会被覆盖，不合并其内部字段；备份中缺少的本机记录不会删除。</p>
        <button type="button" className="btn" disabled={busy} onClick={downloadBackup}>先下载本机备份</button>
        <label className="reader-backup-confirm"><input type="checkbox" disabled={!backupRequested || busy} checked={backupConfirmed} onChange={event => setBackupConfirmed(event.target.checked)} />我已确认导入前备份文件保存成功</label>
        <button type="button" className="btn btn-primary" disabled={!backupConfirmed || busy} onClick={applyImport}>确认合并导入</button>
      </> : <><p>{notice}</p><button type="button" className="btn" onClick={() => platform.appLifecycle.reload()}>刷新并使用导入数据</button></>}
      {error && <p role="alert">{error}</p>}
    </Modal>}
  </>
}
