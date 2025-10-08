import { Routes, Route, Navigate } from 'react-router-dom'
import { UploadPage } from '@pages/UploadPage'
import { BuilderPage } from '@pages/BuilderPage'
import { PortfolioSnapshotPage } from '@pages/PortfolioSnapshotPage'
import { WhatIfsPage } from '@pages/WhatIfsPage'
import { ResultsPage } from '@pages/ResultsPage'
import { HistoricalDataPage } from '@pages/HistoricalDataPage'
import { AnalysisPage } from '@pages/AnalysisPage'

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/upload" replace />} />
      <Route path="/upload" element={<UploadPage />} />
      <Route path="/historical" element={<HistoricalDataPage />} />
      <Route path="/builder" element={<BuilderPage />} />
      <Route path="/snapshot" element={<PortfolioSnapshotPage />} />
      <Route path="/scenarios" element={<WhatIfsPage />} />
      <Route path="/results" element={<ResultsPage />} />
      <Route path="/sensitivity" element={<WhatIfsPage />} />
      <Route path="/what-ifs" element={<WhatIfsPage />} />
      <Route path="/analysis" element={<AnalysisPage />} />
    </Routes>
  )
}
