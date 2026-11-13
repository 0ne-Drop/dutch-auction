import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { SignupPage } from './pages/SignupPage'
import { BidPage } from './pages/BidPage'
import { WinsPage } from './pages/WinsPage'
import { RequireAuth } from './components/RequireAuth'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      {/* 모바일 웹앱: 넓은 화면에서도 휴대폰 폭으로 가운데 정렬 */}
      <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-white font-sans shadow-[0_0_0_1px_#e2e2e2]">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/items/:id" element={<RequireAuth><BidPage /></RequireAuth>} />
          <Route path="/wins" element={<RequireAuth><WinsPage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  </StrictMode>,
)
