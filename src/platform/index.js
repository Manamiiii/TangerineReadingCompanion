import { createWebPlatform } from './webPlatform.js'

// Composition root. Native shells will supply their adapter here, never in reader components.
export const platform = createWebPlatform()

export function exportJsonFile(name, payload) {
  return platform.fileExport.save({
    name,
    blob: new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
  })
}
