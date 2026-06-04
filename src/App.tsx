//import { ConsolePage } from './pages/ConsolePage';
import { DesktopLayout } from './pages/DesktopLayout';
import { TabletLayout } from './pages/TabletLayout';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import './App.scss';
import { pdfjs } from 'react-pdf';
import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { detectDevice } from './utils/detectDevice';

// Worker served from public/ — keep in sync via prestart script
pdfjs.GlobalWorkerOptions.workerSrc = `${window.location.origin}/pdf.worker.min.mjs`;

console.log('pdfjs.version=', pdfjs.version);
console.log('import.meta.url=', import.meta.url);
console.log('pdfjs.GlobalWorkerOptions.workerSrc=', pdfjs.GlobalWorkerOptions.workerSrc);

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function DeviceLayout() {
  const [deviceType, setDeviceType] = useState<ReturnType<typeof detectDevice>>(detectDevice());

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const updateDeviceType = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => setDeviceType(detectDevice()), 150);
    };
    window.addEventListener('resize', updateDeviceType);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updateDeviceType);
    };
  }, []);

  return (
    <div data-component="App">
      {deviceType.isDesktop && <DesktopLayout />}
      {(deviceType.isTablet || deviceType.isMobile) && <TabletLayout />}
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="*" element={<ProtectedRoute><DeviceLayout /></ProtectedRoute>} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
