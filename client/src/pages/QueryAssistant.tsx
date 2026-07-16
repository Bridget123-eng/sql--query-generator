import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Copy, Play, Zap, Database, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import { CodeHighlight } from "@/components/CodeHighlight";

export default function QueryAssistant() {
  const [prompt, setPrompt] = useState("");
  const [selectedSchema, setSelectedSchema] = useState<number | undefined>();
  const [customSchema, setCustomSchema] = useState("");
  const [generatedQueries, setGeneratedQueries] = useState<string[]>([]);
  const [selectedQueryIndex, setSelectedQueryIndex] = useState(0);
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [historyId, setHistoryId] = useState<number | undefined>();
  const [executionResults, setExecutionResults] = useState<any>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [writeConfirmed, setWriteConfirmed] = useState(false);

  const generateMutation = trpc.assistant.generateSQL.useMutation();
  const executeMutation = trpc.assistant.executeSQL.useMutation();
  const explainQuery = trpc.assistant.explainSQL.useQuery(
    {
      query: generatedQueries.length > 0 ? JSON.stringify(generatedQueries) : "",
      queryIndex: selectedQueryIndex,
      schemaId: selectedSchema,
      customSchema,
    },
    { enabled: generatedQueries.length > 0 }
  );

  const analyzeQuery = trpc.assistant.analyzeSQL.useQuery(
    {
      query: generatedQueries.length > 0 ? JSON.stringify(generatedQueries) : "",
      queryIndex: selectedQueryIndex,
      schemaId: selectedSchema,
      customSchema,
    },
    { enabled: generatedQueries.length > 0 }
  );
  const validateQuery = trpc.assistant.validateSQL.useQuery(
    { query: generatedQueries[selectedQueryIndex] ?? "", schemaId: selectedSchema, customSchema },
    { enabled: generatedQueries.length > 0 }
  );
  const optimizeQuery = trpc.assistant.optimizeSQL.useQuery(
    { query: generatedQueries[selectedQueryIndex] ?? "" },
    { enabled: generatedQueries.length > 0 }
  );

  const schemas = trpc.schemas.list.useQuery();
  const databaseSchema = trpc.assistant.inspectMySQLSchema.useQuery();

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Please enter a query prompt");
      return;
    }

    setLoading(true);
    try {
      const result = await generateMutation.mutateAsync({
        prompt,
        schemaId: selectedSchema,
        customSchema: customSchema || undefined,
      });
      setGeneratedQueries(result.queries || []);
      setSelectedQueryIndex(0);
      setHistoryId(undefined);
      setAnalysis(result.analysis);
      setExecutionResults(null);
      setWriteConfirmed(false);
      toast.success(`Generated ${result.queries?.length || 1} query option(s)`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate query");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    if (generatedQueries.length === 0) {
      toast.error("No query to execute");
      return;
    }

    const queryToExecute = generatedQueries[selectedQueryIndex];
    const isWrite = /^(INSERT|UPDATE|DELETE)\b/i.test(queryToExecute.trim());
    if (isWrite && !writeConfirmed) {
      toast.error("Confirm the write operation before continuing");
      return;
    }
    setIsExecuting(true);
    try {
      const result = await executeMutation.mutateAsync({
        query: queryToExecute,
        schemaId: selectedSchema,
        customSchema: customSchema || undefined,
        queryHistoryId: historyId,
        prompt,
        isReadOnly: !isWrite,
      });
      setExecutionResults(result);
      setHistoryId(result.historyId);
      toast.success(result.simulated ? "Query validation preview complete" : "Query executed successfully");
    } catch (error) {
      toast.error("Failed to execute query");
      console.error(error);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCopy = () => {
    if (generatedQueries.length > 0) {
      navigator.clipboard.writeText(generatedQueries[selectedQueryIndex]);
      toast.success("Query copied to clipboard");
    }
  };

  const currentQuery = generatedQueries.length > 0 ? generatedQueries[selectedQueryIndex] : "";
  const isWriteQuery = /^(INSERT|UPDATE|DELETE)\b/i.test(currentQuery.trim());
  const tablesInvolved = Array.from(
    new Set(Array.from(currentQuery.matchAll(/\b(?:FROM|JOIN|UPDATE|INTO)\s+([`"\w.]+)/gi), (match) => match[1].replace(/[`"]+/g, "")))
  );
  const attributesInvolved = Array.from(
    new Set([
      ...(currentQuery.match(/^\s*SELECT\s+([\s\S]*?)\s+FROM\b/i)?.[1]?.split(",") ?? []),
      ...Array.from(currentQuery.matchAll(/\b(?:WHERE|ON|SET|ORDER\s+BY|GROUP\s+BY)\s+([`"\w.]+)/gi), (match) => match[1]),
    ].map(attribute => attribute.trim()).filter(attribute => attribute && attribute !== "*"))
  );

  return (
    <div className="space-y-6">
      {/* Input Section */}
      <Card className="p-6 bg-slate-900 border-white border-opacity-10">
        <div className="space-y-4">
          <div>
            <label className="block text-white font-semibold mb-2">
              Describe Your Query
            </label>
            <Textarea
              placeholder="e.g., Show all employees whose salary is greater than 50000"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="bg-slate-800 border-white border-opacity-20 text-white placeholder-gray-500 min-h-24"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-white font-semibold mb-2">
                Database Schema
              </label>
              <select
                value={selectedSchema || ""}
                onChange={(e) => setSelectedSchema(e.target.value ? Number(e.target.value) : undefined)}
                className="w-full bg-slate-800 border border-white border-opacity-20 text-white rounded px-3 py-2"
              >
                <option value="">Select a schema...</option>
                {schemas.data?.map((schema) => (
                  <option key={schema.id} value={schema.id}>
                    {schema.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-white font-semibold mb-2">
                Or Paste Custom Schema
              </label>
              <Textarea
                placeholder="Paste your SQL DDL here..."
                value={customSchema}
                onChange={(e) => setCustomSchema(e.target.value)}
                className="bg-slate-800 border-white border-opacity-20 text-white placeholder-gray-500 h-10"
              />
            </div>
          </div>

          {databaseSchema.data?.configured && (
            <p className="text-sm text-emerald-300">Connected to MySQL database: {databaseSchema.data.database}. Its schema is automatically used when no saved or custom schema is selected.</p>
          )}

          <Button
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3"
          >
            <Play size={18} className="mr-2" />
            Generate Query
          </Button>
        </div>
      </Card>

      {/* Output Section */}
      {generatedQueries.length > 0 && (
        <Tabs defaultValue="query" className="w-full">
          <TabsList className="grid w-full grid-cols-5 bg-slate-900 border-b border-white border-opacity-10">
            <TabsTrigger value="query" className="text-white">
              Query
            </TabsTrigger>
            <TabsTrigger value="explanation" className="text-white">
              Explanation
            </TabsTrigger>
            <TabsTrigger value="impact" className="text-white">
              Impact Analysis
            </TabsTrigger>
            <TabsTrigger value="validation" className="text-white">
              Validate & Optimize
            </TabsTrigger>
            <TabsTrigger value="results" className="text-white">
              Results
            </TabsTrigger>
          </TabsList>

          {/* Query Tab */}
          <TabsContent value="query" className="space-y-4">
            {/* Query Selection */}
            {generatedQueries.length > 1 && (
              <Card className="p-4 bg-slate-900 border-white border-opacity-10">
                <h3 className="text-white font-semibold mb-3">Select Query Option</h3>
                <div className="grid grid-cols-2 gap-2">
                  {generatedQueries.map((_, index) => (
                    <Button
                      key={index}
                      onClick={() => setSelectedQueryIndex(index)}
                      variant={selectedQueryIndex === index ? "default" : "outline"}
                      className={`text-sm ${
                        selectedQueryIndex === index
                          ? "bg-blue-600 hover:bg-blue-700"
                          : "border-white border-opacity-30 text-white hover:bg-slate-800"
                      }`}
                    >
                      Option {index + 1}
                    </Button>
                  ))}
                </div>
              </Card>
            )}

            {/* Generated Query */}
            <Card className="p-6 bg-slate-900 border-white border-opacity-10">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-semibold">Generated Query</h3>
                <div className="flex gap-2">
                  <Button
                    onClick={handleCopy}
                    variant="outline"
                    size="sm"
                    className="text-white border-white border-opacity-30"
                  >
                    <Copy size={16} className="mr-2" />
                    Copy
                  </Button>
                  <Button
                    onClick={handleExecute}
                    disabled={isExecuting}
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Zap size={16} className="mr-2" />
                    Execute
                  </Button>
                </div>
              </div>
              <CodeHighlight code={currentQuery} language="sql" />
              {isWriteQuery && (
                <label className="mt-4 flex items-start gap-2 rounded border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-100">
                  <input type="checkbox" checked={writeConfirmed} onChange={(event) => setWriteConfirmed(event.target.checked)} className="mt-1" />
                  <span><ShieldAlert size={16} className="mr-1 inline" />I understand this query changes data and I have reviewed the impact.</span>
                </label>
              )}
              <p className="mt-3 text-xs text-gray-400">Execution provides a safe validation preview until a database connection is configured.</p>
            </Card>

            {/* Tables involved */}
            {tablesInvolved.length > 0 && (
              <Card className="p-4 bg-slate-900 border-white border-opacity-10">
                <div className="flex items-start gap-3">
                  <Database size={20} className="text-blue-400 mt-1 flex-shrink-0" />
                  <div>
                    <div className="text-white font-semibold">Tables Involved</div>
                    <div className="text-gray-300 text-sm mt-1">
                      {tablesInvolved.join(", ")}
                    </div>
                  </div>
                </div>
              </Card>
            )}
            {attributesInvolved.length > 0 && (
              <Card className="p-4 bg-slate-900 border-white border-opacity-10">
                <div className="text-white font-semibold">Attributes Involved</div>
                <div className="text-gray-300 text-sm mt-1">{attributesInvolved.join(", ")}</div>
              </Card>
            )}
          </TabsContent>

          {/* Explanation Tab */}
          <TabsContent value="explanation" className="space-y-4">
            <Card className="p-6 bg-slate-900 border-white border-opacity-10">
              <h3 className="text-white font-semibold mb-4">Query Explanation</h3>
              {explainQuery.isLoading ? (
                <div className="text-gray-400">Loading explanation...</div>
              ) : explainQuery.data?.explanation ? (
                <div className="text-gray-300 prose prose-invert max-w-none">
                  <Streamdown>{explainQuery.data.explanation}</Streamdown>
                </div>
              ) : (
                <div className="text-gray-400">No explanation available</div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="validation" className="space-y-4">
            <Card className="p-6 bg-slate-900 border-white border-opacity-10">
              <h3 className="text-white font-semibold mb-4">Query Validation</h3>
              {validateQuery.isLoading ? <div className="text-gray-400">Checking syntax and schema…</div> : validateQuery.data ? (
                <div className="space-y-4">
                  <div className={validateQuery.data.valid ? "text-emerald-300" : "text-red-300"}>
                    {validateQuery.data.valid ? "Valid for the selected schema" : "Validation issues found"}
                  </div>
                  {validateQuery.data.tables.length > 0 && <p className="text-sm text-gray-300">Tables: {validateQuery.data.tables.join(", ")}</p>}
                  {validateQuery.data.columns.length > 0 && <p className="text-sm text-gray-300">Filtered columns: {validateQuery.data.columns.join(", ")}</p>}
                  {validateQuery.data.errors.map((item, index) => <p key={`error-${index}`} className="rounded bg-red-950 p-3 text-sm text-red-200">{item}</p>)}
                  {validateQuery.data.warnings.map((item, index) => <p key={`warning-${index}`} className="rounded bg-amber-950 p-3 text-sm text-amber-200">{item}</p>)}
                </div>
              ) : <div className="text-gray-400">No validation result available.</div>}
            </Card>
            <Card className="p-6 bg-slate-900 border-white border-opacity-10">
              <h3 className="text-white font-semibold mb-4">Optimization Suggestions</h3>
              {optimizeQuery.isLoading ? <div className="text-gray-400">Reviewing query performance…</div> : (
                <ul className="space-y-2 text-sm text-gray-300">
                  {optimizeQuery.data?.suggestions.map((item, index) => <li key={index} className="rounded bg-slate-800 p-3">{item}</li>)}
                </ul>
              )}
            </Card>
          </TabsContent>

          {/* Impact Analysis Tab */}
          <TabsContent value="impact" className="space-y-4">
            <Card className="p-6 bg-slate-900 border-white border-opacity-10">
              <h3 className="text-white font-semibold mb-4">Impact Analysis</h3>
              {analyzeQuery.isLoading ? (
                <div className="text-gray-400">Analyzing query...</div>
              ) : analyzeQuery.data ? (
                <div className="space-y-4">
                  {/* Risk Level */}
                  <div className="flex items-start gap-3">
                    <AlertCircle
                      size={20}
                      className={
                        analyzeQuery.data.riskLevel === "high"
                          ? "text-red-500"
                          : analyzeQuery.data.riskLevel === "medium"
                          ? "text-yellow-500"
                          : "text-green-500"
                      }
                    />
                    <div>
                      <div className="text-white font-semibold">
                        Risk Level:{" "}
                        <span
                          className={
                            analyzeQuery.data.riskLevel === "high"
                              ? "text-red-500"
                              : analyzeQuery.data.riskLevel === "medium"
                              ? "text-yellow-500"
                              : "text-green-500"
                          }
                        >
                          {analyzeQuery.data.riskLevel.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Warnings */}
                  {analyzeQuery.data.warnings && analyzeQuery.data.warnings.length > 0 && (
                    <div className="bg-red-950 border border-red-700 rounded p-4">
                      <h4 className="text-red-300 font-semibold mb-2">Warnings</h4>
                      <ul className="space-y-1">
                        {analyzeQuery.data.warnings.map((warning: string, i: number) => (
                          <li key={i} className="text-red-200 text-sm">
                            • {warning}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Estimated Rows */}
                  <div className="bg-slate-800 border border-white border-opacity-10 rounded p-4">
                    <div className="text-gray-400 text-sm">Estimated Rows Affected</div>
                    <div className="text-white font-semibold text-lg">
                      {analyzeQuery.data.estimatedRows}
                    </div>
                  </div>

                  {/* Analysis */}
                  <div className="text-gray-300 text-sm">
                    <strong>Analysis:</strong> {analyzeQuery.data.analysis}
                  </div>
                </div>
              ) : (
                <div className="text-gray-400">No analysis available</div>
              )}
            </Card>
          </TabsContent>

          {/* Results Tab */}
          <TabsContent value="results" className="space-y-4">
            {executionResults ? (
              <>
                {/* Execution Status */}
                <Card className="p-6 bg-slate-900 border-white border-opacity-10">
                  <h3 className="text-white font-semibold mb-4">Execution Results</h3>
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
                    {executionResults.executionTimeMs !== undefined && (
                      <div className="bg-slate-800 border border-white border-opacity-10 rounded p-4">
                        <div className="text-gray-400 text-sm">Execution Time</div>
                        <div className="text-white font-semibold text-lg">{executionResults.executionTimeMs} ms</div>
                      </div>
                    )}
                  </div>
                  {executionResults.error && (
                    <div className="mt-4 bg-red-950 border border-red-700 rounded p-4">
                      <div className="text-red-300 font-semibold">Error</div>
                      <div className="text-red-200 text-sm mt-1">{executionResults.error}</div>
                    </div>
                  )}
                </Card>

                {/* Result Data */}
                {executionResults.result && (
                  <Card className="p-6 bg-slate-900 border-white border-opacity-10">
                    <h3 className="text-white font-semibold mb-4">Result Data</h3>
                    <div className="overflow-x-auto">
                      <pre className="text-gray-300 text-sm bg-slate-800 p-4 rounded overflow-auto max-h-96">
                        {JSON.stringify(executionResults.result, null, 2)}
                      </pre>
                    </div>
                  </Card>
                )}
              </>
            ) : (
              <Card className="p-6 bg-slate-900 border-white border-opacity-10">
                <div className="flex items-center justify-center gap-3 py-8">
                  <Zap size={20} className="text-gray-400" />
                  <div className="text-gray-400">
                    Click "Execute" to run the query and see results
                  </div>
                </div>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
