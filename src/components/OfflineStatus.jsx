import { useEffect, useState } from 'react'

export function OfflineStatus() {
  const [status, setStatus] = useState('checking')
  const [online, setOnline] = useState(navigator.onLine)
  const [waiting, setWaiting] = useState(null)

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
      setStatus('unsupported')
      return
    }
    let active = true
    let checkGeneration = 0
    const cleanups = []
    const network = () => setOnline(navigator.onLine)
    window.addEventListener('online', network)
    window.addEventListener('offline', network)
    const checkWorker = worker => {
      if (!worker || !active) return
      const generation = ++checkGeneration
      const channel = new MessageChannel()
      const timer = setTimeout(() => { channel.port1.close(); if (active && generation === checkGeneration) setStatus('error') }, 2000)
      channel.port1.onmessage = event => {
        clearTimeout(timer)
        channel.port1.close()
        if (active && generation === checkGeneration) setStatus(event.data?.ready ? 'ready' : 'error')
      }
      worker.postMessage({ type: 'OFFLINE_STATUS' }, [channel.port2])
      cleanups.push(() => { clearTimeout(timer); channel.port1.close() })
    }
    const controlled = () => checkWorker(navigator.serviceWorker.controller)
    navigator.serviceWorker.addEventListener('controllerchange', controlled)
    navigator.serviceWorker.register('./sw.js').then(registration => {
      if (!active) return
      const inspect = () => {
        if (!active) return
        if (registration.waiting) setWaiting(registration.waiting)
        checkWorker(registration.active)
        const worker = registration.installing
        if (worker) {
          const changed = () => {
            if (!active) return
            if (worker.state === 'installed' && registration.waiting) setWaiting(registration.waiting)
            if (worker.state === 'activated') checkWorker(worker)
            if (worker.state === 'redundant' && !registration.active) setStatus('error')
          }
          worker.addEventListener('statechange', changed)
          cleanups.push(() => worker.removeEventListener('statechange', changed))
        }
      }
      registration.addEventListener('updatefound', inspect)
      cleanups.push(() => registration.removeEventListener('updatefound', inspect))
      inspect()
      registration.update().catch(() => {})
    }).catch(() => { if (active) setStatus('error') })
    return () => {
      active = false
      cleanups.forEach(cleanup => cleanup())
      window.removeEventListener('online', network)
      window.removeEventListener('offline', network)
      navigator.serviceWorker.removeEventListener('controllerchange', controlled)
    }
  }, [])

  function update() {
    if (!waiting) return
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true })
    waiting.postMessage({ type: 'ACTIVATE_UPDATE' })
  }

  return <aside className="reader-offline-status" aria-label="离线与更新状态">
    <span>{status === 'ready' ? '离线阅读已准备' : status === 'checking' ? '正在准备离线阅读…' : status === 'error' ? '离线准备失败，请联网后刷新重试' : '开发环境或当前浏览器未启用离线缓存'}</span>
    {!online && <span>当前离线；模型和在线地图不可用</span>}
    <details><summary>离线范围</summary><p>包含阅读界面、已发布书籍资料与本机记录。OCR 引擎首次初始化可能需要联网，地图瓦片和模型不保证离线可用。清理浏览器数据可能移除离线缓存及本机数据，请保留 JSON 备份。</p></details>
    {waiting && <button type="button" className="btn btn-sm" onClick={update}>更新并刷新（清空当前临时输入）</button>}
  </aside>
}
