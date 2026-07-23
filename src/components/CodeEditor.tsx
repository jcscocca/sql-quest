import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'

export function CodeEditor({ value, onChange }: {
  value: string
  onChange: (v: string) => void
}) {
  const extensions = useMemo(() => [javascript()], [])
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
