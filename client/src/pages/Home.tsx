import { useLocation } from "wouter";
import QueryAssistant from "@/pages/QueryAssistant";
import CodeAssistant from "@/pages/CodeAssistant";
import QueryHistory from "@/pages/QueryHistory";
import SchemaManager from "@/pages/SchemaManager";
import Settings from "@/pages/Settings";
import { Menu, X } from "lucide-react";
import { useState } from "react";

export default function Home() {
  const [location, setLocation] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Determine current page
  const currentPage = location.split("/")[1] || "query";

  const renderContent = () => {
    switch (currentPage) {
      case "query":
        return <QueryAssistant />;
      case "code":
        return <CodeAssistant />;
      case "history":
        return <QueryHistory />;
      case "schemas":
        return <SchemaManager />;
      case "settings":
        return <Settings />;
      default:
        return <QueryAssistant />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex relative overflow-hidden">
      {/* Grid background */}
      <div className="absolute inset-0 opacity-5 pointer-events-none">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "w-64" : "w-0"
        } bg-slate-900 border-r border-white border-opacity-10 transition-all duration-300 flex flex-col relative z-20`}
      >
        <div className="p-6 border-b border-white border-opacity-10">
          <h2 className="text-white font-bold text-lg tracking-wide">SQL & Code</h2>
          <p className="text-gray-400 text-xs mt-1">Assistant Platform</p>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <SidebarItem
            label="New Query"
            isActive={currentPage === "query"}
            onClick={() => {
              setLocation("/query");
              setSidebarOpen(false);
            }}
          />
          <SidebarItem
            label="Query History"
            isActive={currentPage === "history"}
            onClick={() => {
              setLocation("/history");
              setSidebarOpen(false);
            }}
          />
          <SidebarItem
            label="Schema Manager"
            isActive={currentPage === "schemas"}
            onClick={() => {
              setLocation("/schemas");
              setSidebarOpen(false);
            }}
          />
          <SidebarItem
            label="Settings"
            isActive={currentPage === "settings"}
            onClick={() => {
              setLocation("/settings");
              setSidebarOpen(false);
            }}
          />
        </nav>

        <div className="p-4 border-t border-white border-opacity-10 text-xs text-gray-400">
          Local SQL assistant
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative z-10">
        {/* Header */}
        <header className="border-b border-white border-opacity-10 p-4 flex items-center justify-between bg-slate-900 bg-opacity-50 backdrop-blur">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-white hover:text-gray-300 transition-colors"
          >
            {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <h1 className="text-white font-bold text-xl flex-1 text-center">
            {getPageTitle(currentPage)}
          </h1>
          <div className="w-6"></div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-6">{renderContent()}</div>
      </main>
    </div>
  );
}

function SidebarItem({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 rounded transition-colors text-sm font-medium ${
        isActive
          ? "bg-blue-600 text-white"
          : "text-gray-300 hover:bg-white hover:bg-opacity-5"
      }`}
    >
      {label}
    </button>
  );
}

function getPageTitle(page: string): string {
  const titles: Record<string, string> = {
    query: "SQL Query Assistant",
    code: "Code Assistant",
    history: "Query History",
    schemas: "Schema Manager",
    settings: "Settings",
  };
  return titles[page] || "SQL Query Assistant";
}
