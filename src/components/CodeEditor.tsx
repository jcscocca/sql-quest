import { useMemo } from 'react'
import CodeMirror, { type Extension } from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'

export function CodeEditor({ value, onChange, lang }: {
  value: string
  onChange: (v: string) => void
  lang?: () => Extension
}) {
  const extensions = useMemo(() => [(lang ?? javascript)()], [])
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
