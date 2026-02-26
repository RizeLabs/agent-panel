import type { ReactNode } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="flex h-screen w-screen bg-panel-bg overflow-hidden">
      {/* Fixed-width sidebar on the left */}
      <Sidebar />

      {/* Right section: header + main content */}
      <div className="flex flex-col flex-1 min-w-0">
        <Header />

        <main className="flex-1 overflow-auto p-4">
          {children}
        </main>
      </div>
    </div>
  );
}
