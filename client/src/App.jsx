import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { RequireAuth, RequireAdmin, RequireGuest } from './components/ProtectedRoute.jsx';

import LoginPage from './pages/auth/LoginPage.jsx';
import SignupPage from './pages/auth/SignupPage.jsx';
import NotificationsPage from './pages/NotificationsPage.jsx';
import SupportPage from './pages/SupportPage.jsx';

import HomePage from './pages/customer/HomePage.jsx';
import CategoryDirectoryPage from './pages/customer/CategoryDirectoryPage.jsx';
import SearchResultsPage from './pages/customer/SearchResultsPage.jsx';
import ProviderProfilePage from './pages/customer/ProviderProfilePage.jsx';
import MessagesPage from './pages/customer/MessagesPage.jsx';
import ConversationPage from './pages/customer/ConversationPage.jsx';
import FavoritesPage from './pages/customer/FavoritesPage.jsx';
import JobsPage from './pages/customer/JobsPage.jsx';
import JobDetailPage from './pages/customer/JobDetailPage.jsx';
import SettingsPage from './pages/customer/SettingsPage.jsx';

import OnboardingWizardPage from './pages/provider/OnboardingWizardPage.jsx';
import ProviderDashboardPage from './pages/provider/ProviderDashboardPage.jsx';
import ProviderInboxPage from './pages/provider/ProviderInboxPage.jsx';
import ProviderConversationPage from './pages/provider/ProviderConversationPage.jsx';
import ProviderJobsPage from './pages/provider/ProviderJobsPage.jsx';
import ProviderJobDetailPage from './pages/provider/ProviderJobDetailPage.jsx';
import ProviderEarningsPage from './pages/provider/ProviderEarningsPage.jsx';
import ProviderServicesPage from './pages/provider/ProviderServicesPage.jsx';
import ProviderAvailabilityPage from './pages/provider/ProviderAvailabilityPage.jsx';
import ProviderReviewsPage from './pages/provider/ProviderReviewsPage.jsx';
import ProviderProPage from './pages/provider/ProviderProPage.jsx';
import ProviderBoostPage from './pages/provider/ProviderBoostPage.jsx';
import ProviderSettingsPage from './pages/provider/ProviderSettingsPage.jsx';

import AdminPage from './pages/admin/AdminPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<RequireGuest><LoginPage /></RequireGuest>} />
      <Route path="/signup" element={<RequireGuest><SignupPage /></RequireGuest>} />

      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route path="/" element={<HomePage />} />
        <Route path="/services" element={<CategoryDirectoryPage />} />
        <Route path="/search" element={<SearchResultsPage />} />
        <Route path="/providers/:id" element={<ProviderProfilePage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/messages/:id" element={<ConversationPage />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/jobs/:id" element={<JobDetailPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/settings" element={<SettingsPage />} />

        <Route path="/provider/onboarding" element={<OnboardingWizardPage />} />
        <Route path="/provider" element={<ProviderDashboardPage />} />
        <Route path="/provider/inbox" element={<ProviderInboxPage />} />
        <Route path="/provider/inbox/:id" element={<ProviderConversationPage />} />
        <Route path="/provider/jobs" element={<ProviderJobsPage />} />
        <Route path="/provider/jobs/:id" element={<ProviderJobDetailPage />} />
        <Route path="/provider/earnings" element={<ProviderEarningsPage />} />
        <Route path="/provider/services" element={<ProviderServicesPage />} />
        <Route path="/provider/availability" element={<ProviderAvailabilityPage />} />
        <Route path="/provider/reviews" element={<ProviderReviewsPage />} />
        <Route path="/provider/pro" element={<ProviderProPage />} />
        <Route path="/provider/boost" element={<ProviderBoostPage />} />
        <Route path="/provider/settings" element={<ProviderSettingsPage />} />

        <Route path="/admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
      </Route>

      {/* Catch-all: without this, an unmatched URL (mistyped, stale bookmark,
          old deep link) renders nothing at all -- a blank white page with no
          way back except editing the URL by hand. */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
