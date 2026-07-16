import { useState } from "react";
import { useLocation } from "wouter";
import { CircleHelp, Database, Droplets, Info, Type, X } from "lucide-react";

type Tab = "appearance" | "connections" | "formatting" | "help" | "about";

export default function Settings() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("appearance");
  const [theme, setTheme] = useState("Dark");
  const [fontSize, setFontSize] = useState(14);
  const [gridFontSize, setGridFontSize] = useState(12);
  const [rowHeight, setRowHeight] = useState(32);
  const [pageSize, setPageSize] = useState(100);
  const [cacheThreshold, setCacheThreshold] = useState(10_000);

  const tabs: { id: Tab; label: string; icon: typeof Droplets }[] = [
    { id: "appearance", label: "Appearance", icon: Droplets },
    { id: "connections", label: "Connections", icon: Database },
    { id: "formatting", label: "Formatting", icon: Type },
    { id: "help", label: "Help", icon: CircleHelp },
    { id: "about", label: "About", icon: Info },
  ];

  return (
    <section className="mx-auto w-full max-w-7xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl">
      <header className="flex items-center justify-between border-b border-slate-700 px-6 py-5">
        <h2 className="text-2xl font-bold text-slate-100">Settings</h2>
        <button aria-label="Close settings" onClick={() => setLocation("/query")} className="rounded p-1 text-slate-300 transition hover:bg-slate-800 hover:text-white">
          <X size={36} strokeWidth={2.5} />
        </button>
      </header>

      <div className="px-6 pt-5">
        <nav className="flex gap-2 border-b border-slate-700" aria-label="Settings sections">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)} className={`flex items-center gap-2 rounded-t-lg px-5 py-3 text-base font-semibold transition ${activeTab === id ? "bg-blue-500 text-white shadow-[inset_0_-3px_0_0_#2563eb]" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`}>
              <Icon size={21} />{label}
            </button>
          ))}
        </nav>
      </div>

      <div className="p-6">
        {activeTab === "appearance" ? (
          <>
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-700 bg-slate-800/90 p-5">
                <h3 className="mb-4 text-lg font-bold text-slate-100">Editor Settings</h3>
                <label className="block text-sm font-semibold text-slate-300">Theme
                  <select value={theme} onChange={event => setTheme(event.target.value)} className="mt-2 w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2.5 text-base text-slate-100 outline-none focus:border-blue-500">
                    <option>Dark</option><option>Light</option><option>System</option>
                  </select>
                </label>
                <Range label={`Font Size: ${fontSize}px`} value={fontSize} onChange={setFontSize} min={11} max={22} />
                <SelectSetting label="Font Family" value="Monospace (Default)" options={["Monospace (Default)", "JetBrains Mono", "Fira Code", "System Mono"]} />
                <SelectSetting label="File Save Strategy" value="Auto-save (3s delay)" options={["Auto-save (3s delay)", "Auto-save immediately", "Manual save"]} />
                <SelectSetting label="Autocomplete" value="Word matching (lightweight)" options={["Word matching (lightweight)", "Schema-aware", "Disabled"]} />
                <SelectSetting label="Engine Detection" value="Suggest (warn on mismatch)" options={["Suggest (warn on mismatch)", "Auto-detect", "Disabled"]} hint="Detect query engine from SQL syntax" />
                <SelectSetting label="Examples Button" value="Show (tab bar)" options={["Show (tab bar)", "Show (menu)", "Hide"]} />
                <div className="mt-5"><p className="mb-2 text-sm font-semibold text-slate-300">Preview</p><pre className="rounded-md border border-slate-700 bg-slate-950 px-3 py-3 font-mono text-xl text-slate-100">SELECT * FROM users;</pre></div>
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-800/90 p-5">
                <h3 className="mb-4 text-lg font-bold text-slate-100">Results Grid Settings</h3>
                <Range label={`Grid Font Size: ${gridFontSize}px`} value={gridFontSize} onChange={setGridFontSize} min={10} max={20} />
                <Range label={`Row Height: ${rowHeight}px`} value={rowHeight} onChange={setRowHeight} min={24} max={56} />
                <Range label={`Page Size: ${pageSize} rows`} value={pageSize} onChange={setPageSize} min={25} max={500} step={25} />
                <Range label={`Cache Threshold: ${cacheThreshold.toLocaleString()} rows`} value={cacheThreshold} onChange={setCacheThreshold} min={1000} max={50000} step={1000} hint="Datasets under this size will be cached for instant sorting." />
                <p className="mb-2 mt-5 text-sm font-semibold text-slate-300">Preview</p>
                <div className="overflow-hidden rounded-md border border-slate-700" style={{ fontSize: gridFontSize }}>
                  <div className="grid grid-cols-2 border-b border-slate-700 bg-slate-900 px-3 py-2 font-semibold text-slate-400"><span>Name</span><span>Value</span></div>
                  <div className="grid grid-cols-2 bg-slate-950 px-3 text-slate-100" style={{ minHeight: rowHeight, alignItems: "center" }}><span>Row 1</span><span>Data</span></div>
                </div>
              </div>
            </div>
            <div className="mt-5 rounded-xl border border-slate-700 bg-slate-800/90 p-5 sm:flex sm:items-center sm:gap-8">
              <h3 className="text-lg font-bold text-slate-100">Data Explorer</h3>
              <label className="mt-3 block text-sm font-semibold text-slate-300 sm:mt-0">Sort Files By
                <select className="ml-0 mt-2 rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-base font-normal text-slate-100 outline-none focus:border-blue-500 sm:ml-3 sm:mt-0"><option>None (insertion order)</option><option>Name</option><option>Last modified</option></select>
              </label>
            </div>
          </>
        ) : <Placeholder title={tabs.find(tab => tab.id === activeTab)?.label ?? "Settings"} />}
      </div>
    </section>
  );
}

function Range({ label, value, onChange, min, max, step = 1, hint }: { label: string; value: number; onChange: (value: number) => void; min: number; max: number; step?: number; hint?: string }) {
  return <label className="mt-4 block text-sm font-semibold text-slate-300">{label}<input className="mt-2 block w-full accent-blue-500" type="range" value={value} min={min} max={max} step={step} onChange={event => onChange(Number(event.target.value))} />{hint && <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span>}</label>;
}

function SelectSetting({ label, value, options, hint }: { label: string; value: string; options: string[]; hint?: string }) {
  return <label className="mt-4 block text-sm font-semibold text-slate-300">{label}<select defaultValue={value} className="mt-2 block w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2.5 text-base font-normal text-slate-100 outline-none focus:border-blue-500">{options.map(option => <option key={option}>{option}</option>)}</select>{hint && <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span>}</label>;
}

function Placeholder({ title }: { title: string }) {
  return <div className="rounded-xl border border-slate-700 bg-slate-800/90 p-6 text-slate-300"><h3 className="text-lg font-bold text-white">{title}</h3><p className="mt-2 text-sm text-slate-400">These settings are available in the next update.</p></div>;
}
