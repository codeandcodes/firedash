import React, { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '@state/AppContext'
import { validateSnapshot } from '@types/schema'
import { Box, Button, Typography } from '@mui/material'

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
      navigate('/builder')
    } catch (e: any) {
      setErrors([`Failed to parse: ${e.message}`])
    }
  }

  const [dragOver, setDragOver] = useState(false)
  return (
    <>
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
      <Box onClick={() => inputRef.current?.click()}
           onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
           onDragLeave={() => setDragOver(false)}
           onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFileSelected(f) }}
           sx={{
             p: 3,
             border: '2px dashed',
             borderColor: dragOver ? 'primary.main' : 'divider',
             borderRadius: 2,
             textAlign: 'center',
             cursor: 'pointer'
           }}>
        <Typography>Drag & drop JSON here, or click to select</Typography>
        <Button sx={{ mt: 1 }} variant="outlined">Choose File</Button>
      </Box>
      {errors.length > 0 && (
        <Box sx={{ mt: 2, p: 2, borderRadius: 2, border: '1px solid', borderColor: 'error.dark', bgcolor: 'error.dark', opacity: 0.9 }}>
          <Typography variant="subtitle2">Validation errors</Typography>
          <ul>
            {errors.map((er, i) => (
              <li key={i}>{er}</li>
            ))}
          </ul>
        </Box>
      )}
    </>
  )
}
