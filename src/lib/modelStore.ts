/**
 * Keeps one GLB file per site in IndexedDB, so a model attached to a site is
 * still there after a reload. (localStorage is far too small for 3D models.)
 * Every call fails soft: if storage is blocked, the app simply has no saved model.
 */

const DB = 'digiher-models'
const STORE = 'glb'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  try {
    const db = await open()
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return undefined
  }
}

export interface SavedModel {
  name: string
  file: Blob
}

export const saveSiteModel = (siteId: string, name: string, file: Blob) =>
  run('readwrite', (s) => s.put({ name, file } satisfies SavedModel, siteId))

export const loadSiteModel = (siteId: string) => run<SavedModel | undefined>('readonly', (s) => s.get(siteId))

export const deleteSiteModel = (siteId: string) => run('readwrite', (s) => s.delete(siteId))
