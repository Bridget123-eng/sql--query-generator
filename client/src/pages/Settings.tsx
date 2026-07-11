import { useAuth } from "@/_core/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Settings() {
  const { user } = useAuth();

  return (
    <div className="max-w-2xl space-y-6">
      {/* Profile */}
      <Card className="p-6 bg-slate-900 border-white border-opacity-10">
        <h3 className="text-white font-semibold text-lg mb-4">Profile</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-gray-400 text-sm mb-1">Name</label>
            <div className="text-white">{user?.name || "Not set"}</div>
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-1">Email</label>
            <div className="text-white">{user?.email || "Not set"}</div>
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-1">User ID</label>
            <div className="text-white font-mono text-sm">{user?.id}</div>
          </div>
        </div>
      </Card>

      {/* About */}
      <Card className="p-6 bg-slate-900 border-white border-opacity-10">
        <h3 className="text-white font-semibold text-lg mb-4">About</h3>
        <div className="space-y-3 text-gray-300 text-sm">
          <p>
            <strong>SQL & Code Assistant</strong> is an intelligent platform powered by advanced AI models to help you generate, understand, debug, and optimize SQL queries and code.
          </p>
          <p>
            <strong>Features:</strong>
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Natural language to SQL query generation</li>
            <li>Code generation in multiple languages</li>
            <li>Query impact analysis and warnings</li>
            <li>Code debugging and optimization</li>
            <li>Query and code history tracking</li>
            <li>Schema management and versioning</li>
          </ul>
        </div>
      </Card>

      {/* Keyboard Shortcuts */}
      <Card className="p-6 bg-slate-900 border-white border-opacity-10">
        <h3 className="text-white font-semibold text-lg mb-4">Tips</h3>
        <div className="space-y-3 text-gray-300 text-sm">
          <div>
            <strong className="text-white">Using Schemas:</strong>
            <p className="mt-1">Create reusable database schemas in the Schema Manager to quickly reference them when generating queries.</p>
          </div>
          <div>
            <strong className="text-white">Query History:</strong>
            <p className="mt-1">All your generated queries are automatically saved. Access them anytime from Query History.</p>
          </div>
          <div>
            <strong className="text-white">Impact Analysis:</strong>
            <p className="mt-1">Always review the impact analysis before executing destructive operations like DELETE or UPDATE.</p>
          </div>
          <div>
            <strong className="text-white">Code Debugging:</strong>
            <p className="mt-1">Paste your code and any error messages for AI-powered debugging and optimization suggestions.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
