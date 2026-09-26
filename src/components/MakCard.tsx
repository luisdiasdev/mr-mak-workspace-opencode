import { useState } from 'react'
import type { WorkspaceEntity, WorkspaceUpdate } from '../types'
import { entityHash } from '../lib/route'
import { categoryIcon } from '../lib/categories'
import { contentUrl } from '../desktop/client'

/**
 * The design-system card: glass surface over the aura, gradient edge
 * (pink→purple; amber when pinned), glow + lift on hover. Building
 * block of the home grid; mirrored as `.mak-card` in
 * scripts/shared/report_style.py for generated reports.
 *
 * The whole surface navigates to the entity via a stretched link; a small
 * action menu floats over the top-right corner on hover to pin/unpin and
 * archive/unarchive.
 */
export default function MakCard({
  entity,
  archived = false,
  onUpdate,
}: {
  entity: WorkspaceEntity
  archived?: boolean
  onUpdate: (id: string, patch: WorkspaceUpdate) => Promise<void> | void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const steps = entity.steps.length

  const run = async (patch: WorkspaceUpdate) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await onUpdate(entity.id, patch)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the card.')
      window.setTimeout(() => setError(null), 4000)
    } finally {
      setBusy(false)
    }
  }

  return (
    <article
      className={`mak-card entity-card${entity.pinned ? ' pinned' : ''}${archived ? ' archived' : ''}`}
      data-entity={entity.id}
    >
      <a className="card-link" href={entityHash(entity.id)} aria-label={`Open ${entity.title}`} />

      <div className="card-actions">
        <button
          type="button"
          className={`card-action${entity.pinned ? ' on' : ''}`}
          disabled={busy}
          title={entity.pinned ? 'Unpin' : 'Pin'}
          aria-label={entity.pinned ? `Unpin ${entity.title}` : `Pin ${entity.title}`}
          onClick={() => run({ pinned: !entity.pinned })}
        >
          {'\u{1F4CC}'}
        </button>
        <button
          type="button"
          className={`card-action${archived ? ' on' : ''}`}
          disabled={busy}
          title={archived ? 'Unarchive' : 'Archive'}
          aria-label={archived ? `Unarchive ${entity.title}` : `Archive ${entity.title}`}
          onClick={() => run({ status: archived ? 'active' : 'archived' })}
        >
          {'\u{1F5C4}\u{FE0F}'}
        </button>
      </div>

      <div className="card-top">
        <span className="chip">
          <span aria-hidden="true">{categoryIcon(entity.category)}</span>
          {entity.category || 'other'}
        </span>
        {entity.pinned && <span className="chip chip-pin">pinned</span>}
        <span className={`status-dot ${entity.status}`} title={entity.status} />
      </div>

      <div className="card-project-title">
        {entity.icon && <img className="card-project-icon" src={contentUrl(`/workspace/${entity.folder}/${entity.icon}`)} width="48" height="48" alt="" loading="lazy" decoding="async" />}
        <h3 className="card-title">{entity.title}</h3>
      </div>

      {entity.description && <p className="card-desc">{entity.description}</p>}

      <div className="card-foot">
        <span>
          {steps} step{steps === 1 ? '' : 's'}
        </span>
        <span>·</span>
        <span>{entity.updated ?? entity.created}</span>
        <span className="card-open" aria-hidden="true">
          open →
        </span>
      </div>

      {error && <span className="card-error" role="alert">{error}</span>}
    </article>
  )
}
