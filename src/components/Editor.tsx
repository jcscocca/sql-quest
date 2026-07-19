import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { sql } from '@codemirror/lang-sql'
import type { WorldSchema } from '../lib/content'

export function Editor({ value, onChange, schema }: {
  value: string
  onChange: (v: string) => void
  schema: WorldSchema
}) {
  const extensions = useMemo(
    () => [
      sql({
        schema: Object.fromEntries(schema.tables.map(t => [t.name, t.columns.map(c => c.name)])),
        upperCaseKeywords: true,
      }),
    ],
    [schema],
  )
  return (
    <CodeMirror
      value={value}
      height="220px"
      theme="dark"
      onChange={onChange}
      extensions={extensions}
    />
  )
}
