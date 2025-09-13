import React, { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '@state/AppContext'
import { validateSnapshot } from '@types/schema'

export const FileUpload: React.FC = () => {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const { setSnapshot } = useApp()
  const navigate = useNavigate()

  async function onFileSelected(file: File) {
    setErrors([])
    try {
      const text = await file.text()
      const json = JSON.parse(text)
      const res = validateSnapshot(json)
      if (!res.valid) {
        setErrors(res.errors || ['Invalid file'])
        return
      }
      setSnapshot(json)
      navigate('/snapshot')
    } catch (e: any) {
      setErrors([`Failed to parse: ${e.message}`])
    }
  }

  return (
    <div>
      <div>
        <button onClick={() => inputRef.current?.click()}>Select JSON Snapshot</button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onFileSelected(f)
          }}
        />
      </div>
      {errors.length > 0 && (
        <div className="errors">
          <strong>Validation errors</strong>
          <ul>
            {errors.map((er, i) => (
              <li key={i}>{er}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

