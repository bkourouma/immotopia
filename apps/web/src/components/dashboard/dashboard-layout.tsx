import React, { Suspense } from 'react';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { SidebarProvider } from '../../context/SidebarContext';

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
    <SidebarProvider>
      <div className="flex h-screen">
        {/* Sidebar - Handles both desktop and mobile internally */}
        <Sidebar />

        {/* Main Content Area with responsive padding */}
        <div className="flex flex-1 flex-col lg:pl-64 overflow-hidden">
          {/* Sticky Header */}
          <Header />

          {/* Main Content */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden bg-slate-50 px-4 sm:px-6 lg:px-8 py-4">
            <Suspense fallback={<LoadingSpinner />}>
              {children}
            </Suspense>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

