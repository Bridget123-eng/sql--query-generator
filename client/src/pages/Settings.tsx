import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Database, Server, XCircle } from "lucide-react";

export default function Settings() {
  const health = trpc.system.health.useQuery({ timestamp: Date.now() }, { refetchInterval: 30_000 });
  const status = health.data;

  return (
    <div className="max-w-2xl space-y-6">
      <Card className="p-6 bg-slate-900 border-white border-opacity-10">
        <h3 className="text-white font-semibold text-lg mb-4">Service Status</h3>
        {health.isLoading ? <p className="text-gray-400">Checking local services…</p> : health.isError || !status?.ok ? (
          <div className="flex gap-2 text-red-300"><XCircle size={20} />The application server is unavailable.</div>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-3 text-emerald-300"><CheckCircle2 size={20} />Application server is running</div>
            <div className="flex items-start gap-3 text-gray-300"><Server size={20} className="text-blue-400 mt-0.5" /><div><div className="text-white font-medium">AI provider</div><div>{status.llmProvider} — {status.llmModel}</div></div></div>
            <div className="flex items-start gap-3 text-gray-300"><Database size={20} className="text-blue-400 mt-0.5" /><div><div className="text-white font-medium">Target database</div><div>{status.databaseConfigured ? "Configured and available for schema discovery and execution." : "Not configured; queries run in safe preview mode."}</div></div></div>
          </div>
        )}
      </Card>

      <Card className="p-6 bg-slate-900 border-white border-opacity-10">
        <h3 className="text-white font-semibold text-lg mb-4">How to use the assistant</h3>
        <div className="space-y-3 text-gray-300 text-sm">
          <p><strong className="text-white">New Query:</strong> Write a natural-language request, choose a saved schema or use the connected database, then compare the generated SQL options.</p>
          <p><strong className="text-white">Query History:</strong> Search, copy, review, rerun, or delete previous requests.</p>
          <p><strong className="text-white">Schema Manager:</strong> Save SQL DDL or JSON schemas and use them when generating queries.</p>
          <p><strong className="text-white">Safety:</strong> Review validation and impact analysis before confirming UPDATE or DELETE operations.</p>
        </div>
      </Card>

      <Card className="p-6 bg-slate-900 border-white border-opacity-10">
        <h3 className="text-white font-semibold text-lg mb-4">Database connection settings</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-300">
          <Setting label="Host" value="Configured on the server (.env)" />
          <Setting label="Port" value="3306 for MySQL" />
          <Setting label="Database name" value={status?.databaseConfigured ? "Configured" : "Not configured"} />
          <Setting label="Username" value="Stored on the server" />
          <Setting label="Password" value="•••••••• (masked)" />
          <Setting label="SSL mode" value="Configure through the connection URL" />
        </div>
        <p className="mt-4 text-xs text-amber-200">Credentials are intentionally not editable or stored in the browser. Update the server connection URL and restart the app to change them.</p>
      </Card>

      <Card className="p-6 bg-slate-900 border-white border-opacity-10">
        <h3 className="text-white font-semibold text-lg mb-4">SQL dialect and query safety</h3>
        <div className="space-y-3 text-sm text-gray-300">
          <Setting label="SQL dialect" value="MySQL 8+ (active)" />
          <Setting label="Read-only protection" value="Enabled by default; writes require confirmation" />
          <Setting label="UPDATE / DELETE safety" value="Warnings are shown for queries without WHERE" />
          <Setting label="Dangerous SQL" value="DROP, ALTER, TRUNCATE, GRANT, and multi-statements are blocked" />
          <Setting label="Validation" value="Checks schema tables, filters, LIMIT usage, SELECT *, and index suggestions" />
        </div>
      </Card>

      <Card className="p-6 bg-slate-900 border-white border-opacity-10">
        <h3 className="text-white font-semibold text-lg mb-4">Results, AI, logging, and appearance</h3>
        <div className="space-y-3 text-sm text-gray-300">
          <Setting label="Result display" value="Shows returned rows, affected rows, and execution time" />
          <Setting label="AI generation" value="Generates SQL alternatives, explanations, tables, attributes, and impact warnings" />
          <Setting label="Logging and audit trail" value="Only executed SQL queries and their execution results are saved in Query History" />
          <Setting label="Appearance" value="Dark SQL workspace with syntax highlighting enabled" />
        </div>
      </Card>
    </div>
  );
}

function Setting({ label, value }: { label: string; value: string }) {
  return <div className="rounded bg-slate-800 p-3"><div className="text-xs text-gray-400">{label}</div><div className="mt-1 text-white">{value}</div></div>;
}
