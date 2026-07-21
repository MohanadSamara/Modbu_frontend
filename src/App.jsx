import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Dashboard from './pages/Dashboard.jsx';
import DeviceConnections from './pages/DeviceConnections.jsx';
import Brands from './pages/Brands.jsx';
import Alarms from './pages/Alarms.jsx';
import FuelLevels from './pages/FuelLevels.jsx';
import DeviceMapPage from './pages/DeviceMapPage.jsx';
import Events from './pages/Events.jsx';
import Projects from './pages/Projects.jsx';
import Settings from './pages/Settings.jsx';
import Users from './pages/Users.jsx';
import AuditLog from './pages/AuditLog.jsx';
import Login from './pages/Login.jsx';
import Roles from './pages/Roles.jsx';
import Permissions from './pages/Permissions.jsx';
import NotFound from './pages/NotFound.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { SettingsProvider } from './context/SettingsContext.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { FeedbackProvider } from './context/FeedbackContext.jsx';
import { PageEditProvider } from './context/PageEditContext.jsx';

function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <ErrorBoundary>
      {/* reducedMotion="user": every framer-motion animation in the app is
          automatically stripped for users with the OS reduce-motion setting. */}
      <MotionConfig reducedMotion="user">
      <FeedbackProvider>
      <AuthProvider>
        <SettingsProvider>
          <PageEditProvider>
          <Routes>
            {/* Public route: login page */}
            <Route path="/login" element={<Login />} />

            {/* Everything else requires authentication */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route
                path="connections"
                element={
                  <ProtectedRoute requiredPermission="device.read">
                    <DeviceConnections />
                  </ProtectedRoute>
                }
              />
              <Route
                path="brands"
                element={
                  <ProtectedRoute requiredPermission="device.read">
                    <Brands />
                  </ProtectedRoute>
                }
              />
              <Route
                path="alarms"
                element={
                  <ProtectedRoute requiredPermission="alarm.read">
                    <Alarms />
                  </ProtectedRoute>
                }
              />
              <Route
                path="fuel"
                element={
                  <ProtectedRoute requiredPermission="device.read">
                    <FuelLevels />
                  </ProtectedRoute>
                }
              />
              <Route
                path="map"
                element={
                  <ProtectedRoute requiredPermission="device.read">
                    <DeviceMapPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="events"
                element={
                  <ProtectedRoute requiredPermission="alarm.read">
                    <Events />
                  </ProtectedRoute>
                }
              />
              <Route
                path="projects"
                element={
                  <ProtectedRoute requiredAnyPermission={['project.read', 'device.read']}>
                    <Projects />
                  </ProtectedRoute>
                }
              />
              <Route
                path="settings"
                element={
                  <ProtectedRoute requiredPermission="settings.read">
                    <Settings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="users"
                element={
                  <ProtectedRoute requiredPermission="user.read">
                    <Users />
                  </ProtectedRoute>
                }
              />
              <Route
                path="audit"
                element={
                  <ProtectedRoute requiredPermission="audit.read">
                    <AuditLog />
                  </ProtectedRoute>
                }
              />
              <Route
                path="roles"
                element={
                  <ProtectedRoute requiredPermission="user.assign_role">
                    <Roles />
                  </ProtectedRoute>
                }
              />
              <Route
                path="permissions"
                element={
                  <ProtectedRoute requiredPermission="user.assign_role">
                    <Permissions />
                  </ProtectedRoute>
                }
              />
              {/* Catch-all: anything unmatched inside the app shell */}
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
          </PageEditProvider>
        </SettingsProvider>
      </AuthProvider>
      </FeedbackProvider>
      </MotionConfig>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
