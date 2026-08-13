import { useEffect, useState } from 'react'
import {
  Image,
  Laptop,
  LibraryBig,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import {
  requestAppInstall,
  subscribeInstallPrompt,
} from '../../../pwaInstall.js'
import {
  recognizeImageText,
  recognizeStructuredImageText,
} from '../../ocr/localOcr.js'
import { analyzeReadingBookMetadata } from '../model/modelAdapter.js'
import {
  PERSONAL_BOOK_COVER_THEMES,
  extractPersonalBookMetadataDetails,
  mergePersonalBookMetadata,
} from '../domain/personalBooks.js'
import { recordReadingTrialDiagnostic } from '../domain/trialDiagnostics.js'

const BOOK_COVER_THEME_LABELS = {
  amber: '暖金',
  violet: '紫罗兰',
  ocean: '深海',
  forest: '森林',
  ink: '墨色',
}

function BookCover({ title, author = '', cover, compact = false }) {
  const theme = PERSONAL_BOOK_COVER_THEMES.includes(cover?.theme)
    ? cover.theme
    : 'amber'
  return (
    <span className={`reader-visual-cover theme-${theme}${compact ? ' compact' : ''}`}>
      {cover?.image ? (
        <img src={cover.image} alt="" />
      ) : (
        <>
          <i aria-hidden="true" />
          <strong>{title || '书名'}</strong>
          {author && <small>{author}</small>}
        </>
      )}
    </span>
  )
}
function PersonalBookCreator({ onCreate, onCancel, modelConfig }) {
  const [form, setForm] = useState({
    title: '',
    author: '',
    translators: '',
    publisher: '',
    isbn: '',
    publishedAt: '',
    originalLanguage: '',
    chapterCount: 1,
    chapterText: '',
    coverTheme: 'amber',
    coverImage: '',
    prepareWithModel: true,
  })
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [metadataScan, setMetadataScan] = useState({
    state: 'idle',
    fileName: '',
    progress: 0,
    result: null,
    ocrText: '',
    correctedFields: [],
  })

  function change(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
    setStatus('')
  }

  function chooseCover(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > 1_500_000) {
      setStatus('封面图片不能超过 1.5 MB。')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      change('coverImage', typeof reader.result === 'string' ? reader.result : '')
    }
    reader.onerror = () => setStatus('封面图片读取失败。')
    reader.readAsDataURL(file)
  }

  async function chooseMetadataScreenshot(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setStatus('')
    setMetadataScan({
      state: 'working',
      fileName: file.name,
      progress: 0,
      result: null,
      ocrText: '',
      correctedFields: [],
    })
    try {
      let text = await recognizeImageText(
        file,
        (progress) => {
          if (Number.isFinite(progress?.progress)) {
            setMetadataScan((current) => ({
              ...current,
              progress: Math.round(progress.progress * 100),
            }))
          }
        },
        { preserveLines: true },
      )
      if (!text) throw new Error('截图中没有识别出文字')
      let localDetails = extractPersonalBookMetadataDetails(text)
      if (
        !localDetails.metadata.title
        || !localDetails.metadata.translators?.length
        || localDetails.uncertainFields.length > 0
      ) {
        const retryText = await recognizeStructuredImageText(file, (progress) => {
          if (Number.isFinite(progress?.progress)) {
            setMetadataScan((current) => ({
              ...current,
              progress: Math.round(progress.progress * 100),
            }))
          }
        })
        const retryDetails = extractPersonalBookMetadataDetails(retryText)
        const quality = (details) => (
          Object.keys(details.metadata).length * 2
          - details.uncertainFields.length * 3
          + (details.metadata.title ? 2 : 0)
          + (details.metadata.translators?.length ? 2 : 0)
        )
        if (quality(retryDetails) > quality(localDetails)) {
          text = retryText
          localDetails = retryDetails
        }
      }
      const localMetadata = localDetails.metadata
      const configured = Boolean(
        modelConfig.endpoint.trim()
        && modelConfig.model.trim()
        && modelConfig.apiKey.trim(),
      )
      const modelMetadata = configured
        ? await analyzeReadingBookMetadata({
            endpoint: modelConfig.endpoint,
            model: modelConfig.model,
            apiKey: modelConfig.apiKey,
            temperature: modelConfig.temperature,
            ocrText: text,
            localMetadata,
            uncertainFields: localDetails.uncertainFields,
          })
        : {}
      const metadata = mergePersonalBookMetadata(
        localMetadata,
        modelMetadata,
        localDetails.uncertainFields,
      )
      const correctedFields = Object.keys(metadata).filter((key) => {
        const localValue = localMetadata[key]
        const finalValue = metadata[key]
        return JSON.stringify(localValue ?? null) !== JSON.stringify(finalValue ?? null)
          && finalValue
      })
      setForm((current) => ({
        ...current,
        title: metadata.title || current.title,
        author: metadata.author || current.author,
        translators: metadata.translators?.join('、') || current.translators,
        publisher: metadata.publisher || current.publisher,
        isbn: metadata.isbn || current.isbn,
        publishedAt: metadata.publishedAt || current.publishedAt,
        originalLanguage: metadata.originalLanguage || current.originalLanguage,
        chapterCount: metadata.chapterCount || current.chapterCount,
      }))
      setMetadataScan({
        state: 'done',
        fileName: file.name,
        progress: 100,
        result: metadata,
        ocrText: text,
        correctedFields,
      })
      setStatus('已填入识别到的书籍信息，请核对后创建。')
      recordReadingTrialDiagnostic({
        area: 'book',
        action: 'book-metadata-scan',
        outcome: 'success',
        providerId: configured ? modelConfig.providerId : 'local',
      })
    } catch (error) {
      setMetadataScan({
        state: 'error',
        fileName: file.name,
        progress: 0,
        result: null,
        ocrText: '',
        correctedFields: [],
      })
      setStatus(error?.message || '书籍详情截图识别失败')
      recordReadingTrialDiagnostic({
        area: 'book',
        action: 'book-metadata-scan',
        outcome: 'error',
        providerId: modelConfig.apiKey.trim() ? modelConfig.providerId : 'local',
        error,
      })
    }
  }

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setStatus('')
    try {
      await onCreate(form)
      recordReadingTrialDiagnostic({
        area: 'book',
        action: 'book-create',
        outcome: 'success',
        providerId: form.prepareWithModel ? modelConfig.providerId : 'local',
      })
    } catch (error) {
      setStatus(error?.message || '创建书籍失败')
      setSaving(false)
      recordReadingTrialDiagnostic({
        area: 'book',
        action: 'book-create',
        outcome: 'error',
        providerId: form.prepareWithModel ? modelConfig.providerId : 'local',
        error,
      })
    }
  }

  return (
    <section className="reader-personal-book-creator">
      <div className="reader-personal-book-heading">
        <div>
          <strong>添加个人书籍</strong>
          <span>填好书目和章节即可；模型可以自动准备阅读时会用到的基础名称。</span>
        </div>
        <button type="button" className="icon-btn" onClick={onCancel} aria-label="关闭添加书籍">
          <X size={15} />
        </button>
      </div>
      <form onSubmit={submit}>
        <div className="reader-book-metadata-scan">
          <div>
            <Image size={18} />
            <span>
              <strong>从书籍详情截图自动填入</strong>
              <small>
                {metadataScan.fileName || '支持类似微信读书详情、版权信息页面的截图'}
              </small>
            </span>
          </div>
          <label className="btn btn-sm">
            <Upload size={13} />
            {metadataScan.state === 'working'
              ? `识别中 ${metadataScan.progress}%`
              : '选择截图并识别'}
            <input
              type="file"
              accept="image/*"
              onChange={chooseMetadataScreenshot}
              disabled={metadataScan.state === 'working'}
              hidden
            />
          </label>
        </div>
        {metadataScan.result && (
          <div className="reader-book-metadata-result">
            <div>
              <strong>识别器 v5</strong>
              <span>
                书名：{metadataScan.result.title || '未识别'}
                {' · '}
                作者：{metadataScan.result.author || '未识别'}
                {metadataScan.correctedFields.includes('author') && '（模型校对）'}
                {' · '}
                译者：{metadataScan.result.translators?.join('、') || '未识别'}
                {metadataScan.correctedFields.includes('translators') && '（模型校对）'}
              </span>
            </div>
            <details>
              <summary>查看 OCR 文字</summary>
              <pre>{metadataScan.ocrText}</pre>
            </details>
          </div>
        )}
        <div className="reader-cover-builder">
          <BookCover
            title={form.title}
            author={form.author}
            cover={{ theme: form.coverTheme, image: form.coverImage }}
          />
          <div>
            <strong>书架封面</strong>
            <div className="reader-cover-themes" aria-label="封面配色">
              {PERSONAL_BOOK_COVER_THEMES.map((theme) => (
                <button
                  key={theme}
                  type="button"
                  className={`theme-${theme}${form.coverTheme === theme ? ' active' : ''}`}
                  onClick={() => change('coverTheme', theme)}
                >
                  {BOOK_COVER_THEME_LABELS[theme]}
                </button>
              ))}
            </div>
            <div className="reader-cover-image-actions">
              <label className="btn btn-sm">
                <Image size={13} /> 使用封面图片
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseCover} hidden />
              </label>
              {form.coverImage && (
                <button type="button" className="btn btn-sm" onClick={() => change('coverImage', '')}>
                  恢复文字封面
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="reader-personal-book-grid">
          <label>
            <span>书名 *</span>
            <input value={form.title} onChange={(event) => change('title', event.target.value)} />
          </label>
          <label>
            <span>作者 *</span>
            <input value={form.author} onChange={(event) => change('author', event.target.value)} />
          </label>
          <label>
            <span>译者</span>
            <input
              value={form.translators}
              onChange={(event) => change('translators', event.target.value)}
              placeholder="多人用顿号分隔"
            />
          </label>
          <label>
            <span>出版社 / 版本</span>
            <input value={form.publisher} onChange={(event) => change('publisher', event.target.value)} />
          </label>
          <label>
            <span>ISBN</span>
            <input value={form.isbn} onChange={(event) => change('isbn', event.target.value)} />
          </label>
          <label>
            <span>出版月份</span>
            <input
              type="month"
              value={form.publishedAt}
              onChange={(event) => change('publishedAt', event.target.value)}
            />
          </label>
          <label>
            <span>原作语言</span>
            <input
              value={form.originalLanguage}
              onChange={(event) => change('originalLanguage', event.target.value)}
              placeholder="例如 en、zh"
            />
          </label>
          <label>
            <span>章节数</span>
            <input
              type="number"
              min="1"
              max="1000"
              value={form.chapterCount}
              onChange={(event) => change('chapterCount', event.target.value)}
            />
          </label>
        </div>
        <label className="reader-personal-chapters">
          <span>或者粘贴目录（每行一章）</span>
          <textarea
            rows={6}
            value={form.chapterText}
            onChange={(event) => change('chapterText', event.target.value)}
            placeholder={'1\n2\n3\n…\n也可以粘贴“第一章 某某”等完整标题'}
          />
          <small>粘贴目录后以非空行数为准；纯数字会自动显示为“第 N 章”。</small>
        </label>
        <label className="reader-personal-ai-option">
          <input
            type="checkbox"
            checked={form.prepareWithModel}
            onChange={(event) => change('prepareWithModel', event.target.checked)}
          />
          <span>
            <strong>创建后用 AI 准备基础资料</strong>
            <small>
              自动建立隐藏名称词典，不需要提前读过本书或逐条审核；名称以后在原文中出现时才会显示。
            </small>
          </span>
        </label>
        {status && <p className="reader-observed-status" role="alert">{status}</p>}
        <div className="reader-personal-book-actions">
          <button type="button" className="btn" onClick={onCancel}>取消</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            <Plus size={14} /> {saving ? '创建中…' : '创建并开始阅读'}
          </button>
        </div>
      </form>
    </section>
  )
}

function WindowsInstallCard() {
  const isWindows = navigator.userAgent.includes('Windows')
  const [installable, setInstallable] = useState(false)
  const [status, setStatus] = useState('')
  const standalone = window.matchMedia('(display-mode: standalone)').matches

  useEffect(() => subscribeInstallPrompt(setInstallable), [])
  if (!isWindows) return null

  async function install() {
    const choice = await requestAppInstall()
    if (choice?.outcome === 'accepted') {
      setStatus('安装已开始，完成后可从开始菜单或桌面打开。')
    } else if (choice) {
      setStatus('已取消安装；以后仍可从浏览器菜单安装。')
    }
  }

  return (
    <section className="reader-windows-install">
      <Laptop size={22} />
      <div>
        <strong>{standalone ? '已作为 Windows 应用运行' : '安装到 Windows'}</strong>
        <p>
          {standalone
            ? '可从开始菜单或桌面直接打开。'
            : '用 Edge 或 Chrome 安装后可从开始菜单启动，并继续使用本机书架、剪贴板和 OCR。'}
        </p>
        {!standalone && !installable && (
          <small>如果按钮尚未出现，请使用浏览器地址栏或“应用”菜单中的“安装 Tangerine Reading Companion”。</small>
        )}
        {status && <small>{status}</small>}
      </div>
      {!standalone && installable && (
        <button type="button" className="btn btn-sm" onClick={install}>
          <Laptop size={14} /> 安装应用
        </button>
      )}
    </section>
  )
}

export function ReadingLibrary({ catalog, onSelect, onCreate, onDelete, modelConfig }) {
  const [creating, setCreating] = useState(false)
  return (
    <div className="reader-tool reader-library">
      <section className="reader-library-hero">
        <span className="reader-eyebrow"><LibraryBig size={15} /> 经典文学阅读伴侣</span>
        <h2>选择一本书</h2>
      </section>
      <WindowsInstallCard />
      <section className="reader-library-panel">
        <div className="reader-library-heading">
          <div>
            <h3>我的书架</h3>
            <span>{catalog.length} 本已准备</span>
          </div>
          <button type="button" className="btn btn-sm" onClick={() => setCreating(true)}>
            <Plus size={13} /> 添加书籍
          </button>
        </div>
        {creating && (
          <PersonalBookCreator
            onCreate={onCreate}
            onCancel={() => setCreating(false)}
            modelConfig={modelConfig}
          />
        )}
        {catalog.length > 0 ? (
          <div className="reader-book-grid">
            {catalog.map((entry) => (
              <article className="reader-book-card-shell" key={entry.id}>
                <span
                  className={`reader-book-source ${entry.source === 'personal' ? 'personal' : 'built-in'}`}
                  title={entry.source === 'personal' ? '个人书籍' : '内置书籍，不可删除'}
                >
                  {entry.source === 'personal' ? '个人书籍' : '内置'}
                </span>
                <button
                  className="reader-book-card"
                  type="button"
                  onClick={() => onSelect(entry.id)}
                >
                  <BookCover
                    title={entry.title}
                    cover={entry.cover}
                    compact
                  />
                  <span className="reader-book-copy">
                    <strong>{entry.title}</strong>
                    <small>{entry.editionLabel}</small>
                    <b>开始阅读</b>
                  </span>
                </button>
                {entry.source === 'personal' && (
                  <button
                    type="button"
                    className="reader-book-delete"
                    onClick={() => onDelete(entry)}
                    aria-label={`删除个人书籍“${entry.title}”`}
                  >
                    <Trash2 size={14} /> 删除
                  </button>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="reader-observed-empty">还没有已发布的书籍资料包。</div>
        )}
      </section>
    </div>
  )
}
