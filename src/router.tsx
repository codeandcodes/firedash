import { Routes, Route, Navigate } from 'react-router-dom'
import { UploadPage } from '@pages/UploadPage'
import { BuilderPage } from '@pages/BuilderPage'
import { PortfolioSnapshotPage } from '@pages/PortfolioSnapshotPage'
import { ContributionsExpensesPage } from '@pages/ContributionsExpensesPage'
import { RealEstatePage } from '@pages/RealEstatePage'
import { SocialSecurityPage } from '@pages/SocialSecurityPage'
import { AssumptionsPage } from '@pages/AssumptionsPage'
import { WhatIfsPage } from '@pages/WhatIfsPage'
import { ResultsPage } from '@pages/ResultsPage'
import { HistoricalDataPage } from '@pages/HistoricalDataPage'

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/upload" replace />} />
      <Route path="/upload" element={<UploadPage />} />
      <Route path="/historical" element={<HistoricalDataPage />} />
      <Route path="/builder" element={<BuilderPage />} />
      <Route path="/snapshot" element={<PortfolioSnapshotPage />} />
      <Route path="/contrib-expenses" element={<ContributionsExpensesPage />} />
      <Route path="/real-estate" element={<RealEstatePage />} />
      <Route path="/social-security" element={<SocialSecurityPage />} />
      <Route path="/assumptions" element={<AssumptionsPage />} />
      <Route path="/scenarios" element={<WhatIfsPage />} />
      <Route path="/results" element={<ResultsPage />} />
      <Route path="/sensitivity" element={<WhatIfsPage />} />
      <Route path="/what-ifs" element={<WhatIfsPage />} />
    </Routes>
  )
}
