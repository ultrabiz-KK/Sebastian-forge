import React from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function MainLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-sebastian-bg font-sans">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-5xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
