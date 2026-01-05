import React, { Suspense } from 'react';
import { Sidebar } from './sidebar';
import { Header } from './header';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

function LoadingSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
        <p className="mt-4 text-slate-600">Chargement...</p>
      </div>
    </div>
  );
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="flex h-screen">
      {/* Fixed Sidebar */}
      <Sidebar />

      {/* Main Content Area with left padding for sidebar and proper z-index */}
      <div className="flex flex-1 flex-col pl-64 overflow-hidden">
        {/* Sticky Header */}
        <Header />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-slate-50 p-4">
          <Suspense fallback={<LoadingSpinner />}>
            {children}
          </Suspense>
        </main>
      </div>
    </div>
  );
}

