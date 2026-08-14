import { ExternalLink } from 'lucide-react'
import { readingEntitySafeNoteSources } from '../domain/readingCompanion.js'

export function ReadingSafeNote({ entity, sources, className }) {
  if (!entity?.safeNote) return null
  const noteSources = readingEntitySafeNoteSources(entity, sources)
  return (
    <div className={className}>
      <p>{entity.safeNote}</p>
      {noteSources.length > 0 && (
        <details className="reader-safe-note-sources">
          <summary>资料来源 {noteSources.length}</summary>
          <div>
            {noteSources.map((source) => (
              <a
                href={source.url}
                key={source.id}
                target="_blank"
                rel="noreferrer"
              >
                {source.label}
                <ExternalLink size={12} aria-hidden="true" />
              </a>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
