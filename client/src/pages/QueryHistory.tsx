import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Trash2, RotateCcw, Play, Database, TrendingDown, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useState, useMemo } from "react";
import { CodeHighlight } from "@/components/CodeHighlight";

export default function QueryHistory() {
  const { data: history, isLoading, refetch } = trpc.assistant.getQueryHistory.useQuery({ limit: 100 });
  const deleteMutation = trpc.assistant.deleteQueryHistory.useMutation();
  const executeMutation = trpc.assistant.executeSQL.useMutation();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResults, setExecutionResults] = useState<any>(null);

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this query?")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("Query deleted");
      if (selectedId === id) setSelectedId(null);
      refetch();
    } catch (error) {
      toast.error("Failed to delete query");
      console.error(error);
    }
  };

  const handleRerun = async (item: any) => {
    if (!item.query) {
      toast.error("No query to execute");
      return;
    }

    setIsExecuting(true);
    try {
      // Parse the query if it's a JSON array (multiple queries)
      let queryToExecute = item.query;
      if (queryToExecute.startsWith("[")) {
        const queries = JSON.parse(queryToExecute);
        queryToExecute = queries[0] || queryToExecute;
      }

      const result = await executeMutation.mutateAsync({
        query: queryToExecute,
        queryHistoryId: item.id,
        isReadOnly: true,
      });
      setExecutionResults(result);
      toast.success("Query executed successfully");
    } catch (error) {
      toast.error("Failed to execute query");
      console.error(error);
    } finally {
      setIsExecuting(false);
    }
  };

  const filteredHistory = useMemo(() => {
    if (!history) return [];
    return history.filter((item) => {
      const matchesSearch =
        item.input.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.query?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
      const matchesType = !filterType || item.type === filterType;
      return matchesSearch && matchesType;
    });
  }, [history, searchQuery, filterType]);

  if (isLoading) {
    return (
      <div className="text-center text-gray-400">
        <div className="animate-spin inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full"></div>
        <p className="mt-2">Loading history...</p>
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <Card className="p-8 text-center bg-slate-900 border-white border-opacity-10">
        <p className="text-gray-400">No query history yet. Generate your first query to get started!</p>
      </Card>
    );
  }

  const selected = selectedId ? history.find((h) => h.id === selectedId) : null;

  // Parse query if it's a JSON array
  const displayQuery = selected?.query
    ? selected.query.startsWith("[")
      ? JSON.parse(selected.query)[0]
      : selected.query
    : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* History List */}
      <div className="lg:col-span-1">
        <Card className="bg-slate-900 border-white border-opacity-10 overflow-hidden flex flex-col h-full">
          <div className="p-4 border-b border-white border-opacity-10 space-y-3">
            <h3 className="text-white font-semibold">Query History</h3>
            <Input
              placeholder="Search queries..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-800 border-white border-opacity-20 text-white placeholder-gray-500 text-sm"
            />
            <div className="flex gap-2">
              <select
                value={filterType || ""}
                onChange={(e) => setFilterType(e.target.value || null)}
                className="flex-1 bg-slate-800 border border-white border-opacity-20 text-white text-sm rounded px-2 py-1"
              >
                <option value="">All Types</option>
                <option value="sql">SQL</option>
                <option value="code">Code</option>
              </select>
              {(searchQuery || filterType) && (
                <Button
                  onClick={() => {
                    setSearchQuery("");
                    setFilterType(null);
                  }}
                  variant="outline"
                  size="sm"
                  className="text-white border-white border-opacity-30"
                >
                  <RotateCcw size={14} />
                </Button>
              )}
            </div>
          </div>

          <div className="divide-y divide-white divide-opacity-10 max-h-96 overflow-y-auto flex-1">
            {filteredHistory.length > 0 ? (
              filteredHistory.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setSelectedId(item.id);
                    setExecutionResults(null);
                  }}
                  className={`w-full text-left p-3 transition-colors ${
                    selectedId === item.id
                      ? "bg-blue-600 bg-opacity-20 border-l-2 border-blue-600"
                      : "hover:bg-white hover:bg-opacity-5"
                  }`}
                >
                  <div className="text-xs text-gray-400 mb-1">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </div>
                  <div className="text-white text-sm truncate">{item.input}</div>
                  <div className="text-xs text-gray-500 mt-1 capitalize">
                    {item.type}
                    {item.executedAt && " • Executed"}
                  </div>
                </button>
              ))
            ) : (
              <div className="p-4 text-center text-gray-400 text-sm">No results found</div>
            )}
          </div>
        </Card>
      </div>

      {/* Details */}
      <div className="lg:col-span-2">
        {selected ? (
          <div className="space-y-4">
            {/* Query */}
            <Card className="p-6 bg-slate-900 border-white border-opacity-10">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-semibold">
                  {selected.type === "sql" ? "Query" : "Code"}
                </h3>
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      if (displayQuery) {
                        navigator.clipboard.writeText(displayQuery);
                        toast.success("Copied to clipboard");
                      }
                    }}
                    variant="outline"
                    size="sm"
                    className="text-white border-white border-opacity-30"
                  >
                    <Copy size={16} />
                  </Button>
                  {selected.type === "sql" && (
                    <Button
                      onClick={() => handleRerun(selected)}
                      disabled={isExecuting}
                      variant="outline"
                      size="sm"
                      className="text-white border-white border-opacity-30 hover:bg-green-600 hover:border-green-600"
                    >
                      <Play size={16} />
                    </Button>
                  )}
                  <Button
                    onClick={() => handleDelete(selected.id)}
                    variant="outline"
                    size="sm"
                    className="text-white border-white border-opacity-30 hover:bg-red-600 hover:border-red-600"
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>
              {displayQuery ? (
                <CodeHighlight code={displayQuery} language={selected.type === "sql" ? "sql" : "javascript"} />
              ) : (
                <pre className="bg-slate-800 p-4 rounded text-gray-300 text-sm">No query generated</pre>
              )}
            </Card>

            {/* Tables Involved */}
            {selected.tablesInvolved && (
              <Card className="p-4 bg-slate-900 border-white border-opacity-10">
                <div className="flex items-start gap-3">
                  <Database size={20} className="text-blue-400 mt-1 flex-shrink-0" />
                  <div>
                    <div className="text-white font-semibold">Tables Involved</div>
                    <div className="text-gray-300 text-sm mt-1">{selected.tablesInvolved}</div>
                  </div>
                </div>
              </Card>
            )}

            {/* Estimated Impact */}
            {(selected.affectedRows !== null || selected.returnedRows !== null) && (
              <Card className="p-4 bg-slate-900 border-white border-opacity-10">
                <div className="flex items-start gap-3">
                  <TrendingDown size={20} className="text-yellow-400 mt-1 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-white font-semibold mb-2">Estimated Impact</div>
                    <div className="grid grid-cols-2 gap-2">
                      {selected.returnedRows !== null && (
                        <div className="bg-slate-800 p-2 rounded">
                          <div className="text-gray-400 text-xs">Rows Returned</div>
                          <div className="text-white font-semibold">{selected.returnedRows}</div>
                        </div>
                      )}
                      {selected.affectedRows !== null && (
                        <div className="bg-slate-800 p-2 rounded">
                          <div className="text-gray-400 text-xs">Rows Affected</div>
                          <div className="text-white font-semibold">{selected.affectedRows}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Explanation */}
            {selected.explanation && (
              <Card className="p-6 bg-slate-900 border-white border-opacity-10">
                <h3 className="text-white font-semibold mb-4">Explanation</h3>
                <div className="text-gray-300 text-sm max-h-48 overflow-auto">
                  {selected.explanation}
                </div>
              </Card>
            )}

            {/* Execution Results */}
            {executionResults && (
              <Card className="p-6 bg-slate-900 border-white border-opacity-10">
                <h3 className="text-white font-semibold mb-4">Execution Results</h3>
                <div className="space-y-4">
                  {executionResults.error ? (
                    <div className="bg-red-950 border border-red-700 rounded p-4">
                      <div className="flex items-start gap-2">
                        <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-1" />
                        <div>
                          <div className="text-red-300 font-semibold">Execution Error</div>
                          <div className="text-red-200 text-sm mt-1">{executionResults.error}</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        {executionResults.rowsReturned !== undefined && (
                          <div className="bg-slate-800 border border-white border-opacity-10 rounded p-4">
                            <div className="text-gray-400 text-sm">Rows Returned</div>
                            <div className="text-white font-semibold text-lg">
                              {executionResults.rowsReturned}
                            </div>
                          </div>
                        )}
                        {executionResults.rowsAffected !== undefined && (
                          <div className="bg-slate-800 border border-white border-opacity-10 rounded p-4">
                            <div className="text-gray-400 text-sm">Rows Affected</div>
                            <div className="text-white font-semibold text-lg">
                              {executionResults.rowsAffected}
                            </div>
                          </div>
                        )}
                      </div>
                      {executionResults.result && (
                        <div>
                          <div className="text-gray-400 text-sm mb-2">Result Data</div>
                          <div className="overflow-x-auto">
                            <pre className="text-gray-300 text-sm bg-slate-800 p-4 rounded overflow-auto max-h-48">
                              {JSON.stringify(executionResults.result, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </Card>
            )}

            {/* Metadata */}
            <Card className="p-6 bg-slate-900 border-white border-opacity-10">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-gray-400 text-xs">Type</div>
                  <div className="text-white font-semibold capitalize">{selected.type}</div>
                </div>
                <div>
                  <div className="text-gray-400 text-xs">Created</div>
                  <div className="text-white font-semibold">
                    {new Date(selected.createdAt).toLocaleString()}
                  </div>
                </div>
                {selected.executedAt && (
                  <div>
                    <div className="text-gray-400 text-xs">Last Executed</div>
                    <div className="text-white font-semibold">
                      {new Date(selected.executedAt).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>
        ) : (
          <Card className="p-8 text-center bg-slate-900 border-white border-opacity-10">
            <p className="text-gray-400">Select a query to view details</p>
          </Card>
        )}
      </div>
    </div>
  );
}
