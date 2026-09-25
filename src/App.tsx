import React, { useState, useEffect } from 'react';
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext';
import { JobProvider } from './context/JobContext';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { DashboardPage } from './pages/DashboardPage';
import { DiscoverPage } from './pages/DiscoverPage';
import { CandidatesPage } from './pages/CandidatesPage';
import { ClipsPage } from './pages/ClipsPage';
import { QueuePage } from './pages/QueuePage';
import { SettingsPage } from './pages/SettingsPage';

function AppContent() {
  const { workspace, isLoading } = useWorkspace();
  const [currentPath, setCurrentPath] = useState<string>(() => {
    const path = window.location.pathname;
    return path === '/' ? '/dashboard' : path;
  });

  // Handle browser popstate
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      setCurrentPath(path === '/' ? '/dashboard' : path);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    window.scrollTo(0, 0);
  };

  // If loading and no cached workspace exists yet, show layout shell with skeleton instead of blank screen
  if (isLoading && !workspace) {
    return (
      <AppLayout currentPath={currentPath} onNavigate={navigate}>
        <div className="space-y-6 animate-pulse">
          <div className="h-8 w-48 bg-zinc-900 rounded" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="h-24 bg-zinc-900/60 rounded-lg border border-zinc-800/40" />
            <div className="h-24 bg-zinc-900/60 rounded-lg border border-zinc-800/40" />
            <div className="h-24 bg-zinc-900/60 rounded-lg border border-zinc-800/40" />
            <div className="h-24 bg-zinc-900/60 rounded-lg border border-zinc-800/40" />
          </div>
          <div className="h-64 bg-zinc-900/40 rounded-lg border border-zinc-800/40" />
        </div>
      </AppLayout>
    );
  }

  // If no workspace exists and not on login, enforce onboarding
  if (!workspace && currentPath !== '/login') {
    return (
      <OnboardingPage
        onComplete={() => {
          navigate('/dashboard');
        }}
      />
    );
  }

  // Render standalone routes
  if (currentPath === '/login') {
    return <LoginPage onNavigate={navigate} />;
  }

  if (currentPath === '/onboarding') {
    return (
      <OnboardingPage
        onComplete={() => {
          navigate('/dashboard');
        }}
      />
    );
  }

  // Render app layout routes
  return (
    <AppLayout currentPath={currentPath} onNavigate={navigate}>
      {currentPath === '/dashboard' && <DashboardPage onNavigate={navigate} />}
      {currentPath === '/discover' && <DiscoverPage onNavigate={navigate} />}
      {currentPath === '/candidates' && <CandidatesPage onNavigate={navigate} />}
      {currentPath === '/clips' && <ClipsPage onNavigate={navigate} />}
      {currentPath === '/queue' && <QueuePage onNavigate={navigate} />}
      {currentPath === '/settings' && <SettingsPage onNavigate={navigate} />}
      {!['/dashboard', '/discover', '/candidates', '/clips', '/queue', '/settings'].includes(
        currentPath,
      ) && <DashboardPage onNavigate={navigate} />}
    </AppLayout>
  );
}

export default function App() {
  return (
    <WorkspaceProvider>
      <JobProvider>
        <AppContent />
      </JobProvider>
    </WorkspaceProvider>
  );
}
