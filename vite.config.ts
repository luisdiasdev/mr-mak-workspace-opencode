import { defineConfig, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'

type WorkspaceStatus = 'active' | 'done' | 'archived'

interface WorkspacePatch {
  pinned?: boolean
  status?: WorkspaceStatus
}

/** The fields the workspace registry exposes; extra keys are preserved on save. */
interface RegistryEntity {
  id?: string
  pinned?: boolean
  status?: string
  updated?: string
  [key: string]: unknown
}

const WORKSPACE_STATUSES: readonly WorkspaceStatus[] = ['active', 'done', 'archived']

/** Validate the request body and return only the recognised patch fields. */
function parsePatch(chunks: Buffer[]): WorkspacePatch {
  const raw = Buffer.concat(chunks).toString().trim()
  if (!raw) throw new Error('Choose a pin or archive change.')
  const value: unknown = JSON.parse(raw)
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid request body.')
  }
  const body = value as Record<string, unknown>
  const patch: WorkspacePatch = {}
  if (body.pinned !== undefined) {
    if (typeof body.pinned !== 'boolean') throw new Error('Pinned must be true or false.')
    patch.pinned = body.pinned
  }
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !WORKSPACE_STATUSES.includes(body.status as WorkspaceStatus)) {
      throw new Error('Use active, done or archived status.')
    }
    patch.status = body.status as WorkspaceStatus
  }
  if (patch.pinned === undefined && patch.status === undefined) {
    throw new Error('Choose a pin or archive change.')
  }
  return patch
}

async function applyPatch(id: string, chunks: Buffer[], res: ServerResponse): Promise<void> {
  try {
    const patch = parsePatch(chunks)
    const file = path.resolve('workspace/workspace.json')
    const registry = JSON.parse(await readFile(file, 'utf8')) as { entities: RegistryEntity[] }
    const entity = registry.entities.find(item => item.id === id)
    if (!entity) {
      res.statusCode = 404
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Workspace card was not found.' }))
      return
    }
    if (patch.pinned !== undefined) entity.pinned = patch.pinned
    if (patch.status !== undefined) entity.status = patch.status
    entity.updated = new Date().toISOString().slice(0, 10)
    await writeFile(file, JSON.stringify(registry, null, 2) + '\n')
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ id }))
  } catch (error) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'The card could not be updated.' }))
  }
}

// The browser-only preview (`npm run dev`) has no desktop service, so card
// pin/archive actions write workspace.json directly. The desktop app instead
// uses the service's PATCH /api/workspace/:id (see desktop/service/server.mjs).
const workspaceApi = (): Plugin => ({
  name: 'mak-workspace-api',
  configureServer(server: ViteDevServer) {
    server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
      if (req.method !== 'PATCH' || typeof req.url !== 'string' || !req.url.startsWith('/api/workspace/')) {
        next()
        return
      }
      const id = decodeURIComponent(req.url.slice('/api/workspace/'.length).split('?')[0])
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))
      req.on('end', () => {
        void applyPatch(id, chunks, res)
      })
    })
  },
})

export default defineConfig({
  plugins: [react(), workspaceApi()],
  server: {
    port: 3009,
    open: true,
    fs: {
      allow: ['.'],
    },
  },
  publicDir: 'public',
  build: {
    // public/workspace is a junction into workspace/ (gigabytes of reports).
    // The dashboard is a dev-server tool, so never copy publicDir into dist.
    copyPublicDir: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
