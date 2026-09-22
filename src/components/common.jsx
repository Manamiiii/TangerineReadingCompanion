import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

export function FileButton({ children, onChange, accept = 'image/png,image/jpeg,image/webp,image/bmp', disabled = false, className = 'btn btn-sm' }) {
  const input = useRef(null)
  return <>
    <button type="button" className={className} disabled={disabled} onClick={() => input.current.click()}>{children}</button>
    <input ref={input} type="file" accept={accept} disabled={disabled} onChange={onChange} hidden />
  </>
}

export function Modal({ title, onClose, children, width = 520, footer }) {
  const dialog = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    const element = dialog.current
    element.showModal()
    return () => { element.close(); if (previous?.isConnected) previous.focus() }
  }, [])

  return (
    <dialog ref={dialog} aria-label={title} className="modal-backdrop" onCancel={event => { event.preventDefault(); onClose?.() }} onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <div className="modal-panel" style={{ maxWidth: width }}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </dialog>
  )
}
