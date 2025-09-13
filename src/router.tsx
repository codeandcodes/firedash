import { Routes, Route, Navigate } from 'react-router-dom'
import { UploadPage } from '@pages/UploadPage'
import { BuilderPage } from '@pages/BuilderPage'
import { PortfolioSnapshotPage } from '@pages/PortfolioSnapshotPage'
import { ContributionsExpensesPage } from '@pages/ContributionsExpensesPage'
import { RealEstatePage } from '@pages/RealEstatePage'
import { SocialSecurityPage } from '@pages/SocialSecurityPage'
import { AssumptionsPage } from '@pages/AssumptionsPage'
import { ScenariosPage } from '@pages/ScenariosPage'
import { ResultsPage } from '@pages/ResultsPage'
import { SensitivityPage } from '@pages/SensitivityPage'

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/upload" replace />} />
      <Route path="/upload" element={<UploadPage />} />
      <Route path="/builder" element={<BuilderPage />} />
      <Route path="/snapshot" element={<PortfolioSnapshotPage />} />
      <Route path="/contrib-expenses" element={<ContributionsExpensesPage />} />
      <Route path="/real-estate" element={<RealEstatePage />} />
      <Route path="/social-security" element={<SocialSecurityPage />} />
      <Route path="/assumptions" element={<AssumptionsPage />} />
      <Route path="/scenarios" element={<ScenariosPage />} />
      <Route path="/results" element={<ResultsPage />} />
      <Route path="/sensitivity" element={<SensitivityPage />} />
    </Routes>
  )
}
