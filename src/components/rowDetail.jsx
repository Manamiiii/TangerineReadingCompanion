import { CellView } from './catalog.jsx'
import { Modal } from './common.jsx'

// 资料库、孵蛋推荐等工具共用的资料行详情。
export function RowDetailModal({ row, fields, rows = [], onClose, onEdit, onDelete, onOpenReference, title = '详情' }) {
  const sorted = [...fields].sort((a, b) => a.order - b.order)
  const summarySupplementKeys = new Set(sorted
    .filter((field) => field.type === 'summary' || field.display?.kind === 'summary')
    .flatMap((field) => [field.display.imageField, field.display.descriptionField])
    .filter(Boolean))
  const detailFields = sorted.filter((field) => !summarySupplementKeys.has(field.key))

  return (
    <Modal
      title={title}
      onClose={onClose}
      width={680}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>关闭</button>
          {onDelete && <button type="button" className="btn btn-danger" onClick={onDelete}>删除</button>}
          {onEdit && <button type="button" className="btn btn-primary" onClick={onEdit}>编辑</button>}
        </>
      }
    >
      <div className="row-detail">
        {detailFields.map((field) => (
          <div key={field.id} className="row-detail-item">
            <div className="row-detail-label">
              {field.name}
              {field.hidden && <span className="filter-hidden-badge">隐藏列</span>}
            </div>
            <div className="row-detail-value">
              <CellView
                field={field}
                row={row}
                allFields={sorted}
                mode="detail"
                onOpenReference={onOpenReference}
                referenceRows={rows}
              />
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}
