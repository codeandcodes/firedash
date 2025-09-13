import { FileUpload } from '@components/FileUpload'
import { Card, CardContent, Typography } from '@mui/material'

export function UploadPage() {
  return (
    <section>
      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>Upload Snapshot</Typography>
          <Typography color="text.secondary">Provide a point-in-time JSON snapshot of your assets and assumptions.</Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>Example file: <code>examples/sample_snapshot.json</code></Typography>
          <FileUpload />
        </CardContent>
      </Card>
    </section>
  )
}
