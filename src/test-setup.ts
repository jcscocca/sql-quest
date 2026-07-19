import 'fake-indexeddb/auto'
import { clear } from 'idb-keyval'
import { beforeEach } from 'vitest'

beforeEach(async () => {
  await clear()
})
