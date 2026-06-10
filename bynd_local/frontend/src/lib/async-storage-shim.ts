type AsyncStorageValue = string | null

const memoryStore = new Map<string, string>()

const isBrowser = typeof window !== 'undefined'

const getStore = () => {
  if (!isBrowser) {
    return {
      getItem: (key: string) => memoryStore.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memoryStore.set(key, value)
      },
      removeItem: (key: string) => {
        memoryStore.delete(key)
      },
      clear: () => memoryStore.clear(),
      keys: () => Array.from(memoryStore.keys())
    }
  }

  const getAllBrowserKeys = () => {
    const keys: string[] = []
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (key) {
        keys.push(key)
      }
    }
    return keys
  }

  return {
    getItem: (key: string) => window.localStorage.getItem(key),
    setItem: (key: string, value: string) => {
      window.localStorage.setItem(key, value)
    },
    removeItem: (key: string) => {
      window.localStorage.removeItem(key)
    },
    clear: () => window.localStorage.clear(),
    keys: () => getAllBrowserKeys()
  }
}

const storage = getStore()

const safe =
  <Args extends unknown[], Return>(
    fn: (...args: Args) => Return,
    fallback: Return
  ) =>
  (...args: Args): Return => {
    try {
      return fn(...args)
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('AsyncStorage shim error', error)
      }
      return fallback
    }
  }

const AsyncStorage = {
  getItem: (key: string): Promise<AsyncStorageValue> =>
    Promise.resolve(safe(storage.getItem, null)(key)),
  setItem: (key: string, value: string): Promise<void> =>
    Promise.resolve(safe(storage.setItem, undefined)(key, value)),
  removeItem: (key: string): Promise<void> =>
    Promise.resolve(safe(storage.removeItem, undefined)(key)),
  clear: (): Promise<void> => Promise.resolve(safe(storage.clear, undefined)()),
  multiGet: (keys: readonly string[]): Promise<[string, AsyncStorageValue][]> =>
    Promise.resolve(keys.map(key => [key, safe(storage.getItem, null)(key)])),
  multiRemove: (keys: readonly string[]): Promise<void> =>
    Promise.resolve(
      keys.forEach(key => safe(storage.removeItem, undefined)(key))
    ),
  multiSet: (entries: readonly [string, string][]): Promise<void> =>
    Promise.resolve(
      entries.forEach(([key, value]) =>
        safe(storage.setItem, undefined)(key, value)
      )
    ),
  getAllKeys: (): Promise<string[]> =>
    Promise.resolve(
      isBrowser ? (storage.keys() ?? []) : Array.from(memoryStore.keys())
    )
}

export type { AsyncStorageValue }
export { AsyncStorage }
export default AsyncStorage
