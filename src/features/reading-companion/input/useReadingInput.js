import { useCallback, useEffect, useRef, useState } from 'react'
import { platform } from '../../../platform/index.js'
import { createInputRevision, normalizeReadingInput } from '../../../platform/readingInput.js'
import { recognizeImageText } from '../../ocr/localOcr.js'

export function useReadingInput(bookId) {
  const revision = useRef(createInputRevision())
  const [excerpt, setExcerpt] = useState('')
  const [link, setLink] = useState('')
  const [imageInput, setImageInput] = useState(null)
  const [inputStatus, setInputStatus] = useState('')
  const [ocrState, setOcrState] = useState('idle')
  const [ocrProgress, setOcrProgress] = useState(0)
  const [sessionVersion, setSessionVersion] = useState(0)

  const clearInput = useCallback(() => {
    revision.current.next()
    setExcerpt('')
    setLink('')
    setImageInput(null)
    setInputStatus('')
    setOcrState('idle')
    setOcrProgress(0)
    setSessionVersion((value) => value + 1)
  }, [])

  useEffect(() => {
    clearInput()
    return () => { revision.current.next() }
  }, [bookId, clearInput])

  useEffect(() => platform.appLifecycle.subscribe((event) => {
    if (event === 'exit') clearInput()
  }), [clearInput])

  useEffect(() => () => {
    if (imageInput?.url) URL.revokeObjectURL(imageInput.url)
  }, [imageInput])

  const acceptInput = useCallback((value) => {
    const input = normalizeReadingInput(value)
    revision.current.next()
    setInputStatus('')
    setOcrState('idle')
    setOcrProgress(0)
    setLink(input.kind === 'link' ? input.url : '')
    setExcerpt(input.kind === 'text' ? input.text : '')
    setImageInput(input.kind === 'image'
      ? { file: input.blob, name: input.name, url: URL.createObjectURL(input.blob) }
      : null)
    setSessionVersion((version) => version + 1)
    if (input.kind === 'link') setInputStatus('已接收链接；不会自动打开或抓取，请另行提供当前段落或截图。')
  }, [])

  useEffect(() => platform.shareInbox.subscribe((input) => {
    if (!bookId) return // Native adapter must request book selection before delivery.
    try { acceptInput(input) } catch (error) { setInputStatus(error.message) }
  }), [bookId, acceptInput])

  function changeExcerpt(text) {
    try {
      const input = normalizeReadingInput({ kind: 'text', source: 'manual', text })
      revision.current.next()
      setExcerpt(input.text)
      setLink('')
      setInputStatus('')
      setOcrState('idle')
      // Keep attached image while the reader corrects its OCR text.
    } catch (error) { setInputStatus(error.message) }
  }

  async function pasteFromClipboard() {
    const ticket = revision.current.next()
    try {
      const input = await platform.clipboard.read()
      if (!revision.current.isCurrent(ticket)) return
      if (!input.text.trim()) { setInputStatus('剪贴板里没有文字。'); return }
      acceptInput(/^https?:\/\/\S+$/i.test(input.text.trim())
        ? { kind: 'link', source: 'clipboard', url: input.text.trim() }
        : input)
    } catch (error) {
      if (revision.current.isCurrent(ticket)) setInputStatus(error.message)
    }
  }

  function chooseImage(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try { acceptInput({ kind: 'image', source: 'file', blob: file, name: file.name }) }
    catch (error) { setInputStatus(error.message) }
  }

  function clearImage() {
    revision.current.next()
    setImageInput(null)
    setOcrState('idle')
    setOcrProgress(0)
    setInputStatus('')
  }

  async function runLocalOcr() {
    if (!imageInput?.file || ocrState === 'working') return
    const ticket = revision.current.next()
    setOcrState('working')
    setInputStatus('正在本机识别截图文字…')
    try {
      const text = await recognizeImageText(imageInput.file, (progress) => {
        if (revision.current.isCurrent(ticket) && Number.isFinite(progress?.progress)) {
          setOcrProgress(Math.round(progress.progress * 100))
        }
      })
      if (!revision.current.isCurrent(ticket)) return
      const input = normalizeReadingInput({ kind: 'text', source: 'ocr', text })
      setExcerpt(input.text)
      setSessionVersion((version) => version + 1)
      setOcrState(text ? 'done' : 'empty')
      setInputStatus(text ? '本机识别完成，请核对文字后确认记录。' : '没有识别出文字，请换一张更清晰的截图。')
    } catch {
      if (!revision.current.isCurrent(ticket)) return
      setOcrState('error')
      setInputStatus('本机 OCR 失败，请检查图片或稍后重试。')
    }
  }

  return {
    excerpt, link, imageInput, inputStatus, ocrState, ocrProgress, sessionVersion,
    setInputStatus, changeExcerpt, pasteFromClipboard, chooseImage, clearImage, clearInput, runLocalOcr,
  }
}
