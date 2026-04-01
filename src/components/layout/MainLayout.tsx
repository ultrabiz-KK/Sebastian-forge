import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { DemoBanner } from "../DemoBanner";
import { isDemoMode } from "../../lib/demoMode";

export function MainLayout() {
  const [demo, setDemo] = useState(isDemoMode());

  return (
    <div className="flex h-screen overflow-hidden bg-sebastian-parchment font-serif">
      <Sidebar onDemoToggle={() => setDemo(isDemoMode())} />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-5xl mx-auto">
          {demo && <DemoBanner />}
          <Outlet />
        </div>
      </main>
    </div>
  );
}
