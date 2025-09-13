import { FileUpload } from '@components/FileUpload'

export function UploadPage() {
  return (
    <section>
      <h1>Upload Snapshot</h1>
      <p>Provide a point-in-time JSON snapshot of your assets and assumptions.</p>
      <p>
        Example file: <code>examples/sample_snapshot.json</code>
      </p>
      <FileUpload />
    </section>
  )
}

