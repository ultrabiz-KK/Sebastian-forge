import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TitleBar } from "./TitleBar";
import { SessionExpiredBanner } from "../SessionExpiredBanner";

export function MainLayout() {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-sebastian-parchment font-serif">
      {/* カスタムタイトルバー */}
      <TitleBar />
      <SessionExpiredBanner />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-5xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
