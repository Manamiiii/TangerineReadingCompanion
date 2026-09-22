import { Modal, FileButton } from '../../../components/common.jsx'
import { useState } from 'react'
import { ClipboardPaste, Image, Upload, ScanSearch, X } from 'lucide-react'

export function ReadingInputSource({ excerpt, link, imageInput, ocrState, ocrProgress, pasteFromClipboard, chooseImage, runLocalOcr, clearImage, clearInput, changeExcerpt, captureExcerptSelection }) {
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false)
  return <>
            <div className="reader-input-sources" aria-label="选择内容输入方式">
              <button type="button" className="reader-input-source" onClick={pasteFromClipboard}>
                <ClipboardPaste size={20} />
                <span>
                  <strong>从剪贴板粘贴</strong>
                  <small>直接放入刚复制的文字</small>
                </span>
              </button>
              <FileButton className="reader-input-source" onChange={chooseImage}>
                <Image size={20} />
                <span>
                  <strong>从截图提取</strong>
                  <small>选择图片后在本机识别</small>
                </span>
                <Upload size={15} />
              </FileButton>
            </div>
            {imageInput && (
              <>
                <div className="reader-image-attachment">
                  <button
                    type="button"
                    className="reader-image-thumbnail"
                    onClick={() => setImagePreviewOpen(true)}
                    aria-label="打开截图大图"
                  >
                    <img src={imageInput.url} alt="" />
                  </button>
                  <div>
                    <strong>{imageInput.name}</strong>
                    <span>点击缩略图查看大图</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={runLocalOcr}
                    disabled={ocrState === 'working'}
                  >
                    <ScanSearch size={13} />
                    {ocrState === 'working'
                      ? `识别中 ${ocrProgress}%`
                      : '提取文字'}
                  </button>
                  <button type="button" className="icon-btn" onClick={clearImage} aria-label="移除截图">
                    <X size={15} />
                  </button>
                </div>
                {imagePreviewOpen && (
                  <Modal title="截图大图预览" width={1000} onClose={() => setImagePreviewOpen(false)}>
                    <img src={imageInput.url} alt="所选阅读页面大图预览" style={{ display: 'block', maxWidth: '100%', maxHeight: '70vh', margin: 'auto', objectFit: 'contain' }} />
                  </Modal>
                )}
              </>
            )}
            <div className="reader-session-actions">
              <span>当前会话临时输入</span>
              <button type="button" className="btn btn-sm" onClick={clearInput}>清空当前内容</button>
            </div>
            {link && <p className="reader-input-status">已接收链接（不自动访问）：{link}</p>}
            <label className="reader-excerpt-field">
              <span>粘贴当前段落</span>
              <textarea
                className="textarea"
                value={excerpt}
                onChange={(event) => changeExcerpt(event.target.value)}
                onSelect={captureExcerptSelection}
                placeholder="从微信读书复制一小段文字，本机可以扫描其中已审计的名称…"
                rows={7}
              />
              <small>{excerpt.length} 字</small>
            </label>

</>
}
