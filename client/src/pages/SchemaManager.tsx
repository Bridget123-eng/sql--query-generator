import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, CheckCircle, AlertCircle, Database } from "lucide-react";
import { toast } from "sonner";
import { CodeHighlight } from "@/components/CodeHighlight";

// Simple SQL schema parser to extract table names and columns
function parseSchema(schema: string, format: string) {
  const result = {
    tables: [] as { name: string; columns: string[] }[],
    isValid: true,
    message: "",
  };

  if (format === "json") {
    try {
      const parsed = JSON.parse(schema);
      if (typeof parsed === "object" && parsed !== null) {
        result.isValid = true;
        result.message = "Valid JSON schema";
        if (Array.isArray(parsed)) {
          result.tables = parsed.map((table: any) => ({
            name: table.name || "Unknown",
            columns: table.columns || [],
          }));
        }
      }
    } catch (e) {
      result.isValid = false;
      result.message = "Invalid JSON format";
    }
  } else {
    // SQL DDL parsing
    const tableMatches = schema.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?(\w+)[`"]?\s*\(([\s\S]*?)\);/gi);
    if (tableMatches && tableMatches.length > 0) {
      result.isValid = true;
      result.message = `Found ${tableMatches.length} table(s)`;

      tableMatches.forEach((match) => {
        const nameMatch = match.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?(\w+)[`"]?/i);
        const columnsMatch = match.match(/\(([\s\S]*)\)/);

        if (nameMatch && columnsMatch) {
          const tableName = nameMatch[1];
          const columnsStr = columnsMatch[1];
          const columns = columnsStr
            .split(",")
            .map((col) => col.trim().split(/\s+/)[0])
            .filter((col) => col && !col.toLowerCase().startsWith("primary") && !col.toLowerCase().startsWith("foreign"));

          result.tables.push({
            name: tableName,
            columns: columns,
          });
        }
      });
    } else {
      result.isValid = false;
      result.message = "No valid CREATE TABLE statements found";
    }
  }

  return result;
}

export default function SchemaManager() {
  const { data: schemas, isLoading, refetch } = trpc.schemas.list.useQuery();
  const createMutation = trpc.schemas.create.useMutation();
  const deleteMutation = trpc.schemas.delete.useMutation();

  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    schema: "",
    description: "",
    format: "sql" as "sql" | "json",
    isDefault: false,
  });

  const [schemaPreview, setSchemaPreview] = useState<any>(null);

  const handleSchemaChange = (value: string) => {
    setFormData({ ...formData, schema: value });
    const preview = parseSchema(value, formData.format);
    setSchemaPreview(preview);
  };

  const handleFormatChange = (format: "sql" | "json") => {
    setFormData({ ...formData, format });
    const preview = parseSchema(formData.schema, format);
    setSchemaPreview(preview);
  };

  const handleCreate = async () => {
    if (!formData.name.trim() || !formData.schema.trim()) {
      toast.error("Please fill in all required fields");
      return;
    }

    const preview = parseSchema(formData.schema, formData.format);
    if (!preview.isValid) {
      toast.error(preview.message);
      return;
    }

    try {
      await createMutation.mutateAsync(formData);
      toast.success("Schema created successfully");
      setFormData({ name: "", schema: "", description: "", format: "sql", isDefault: false });
      setSchemaPreview(null);
      setShowForm(false);
      refetch();
    } catch (error) {
      toast.error("Failed to create schema");
      console.error(error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this schema?")) return;

    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("Schema deleted");
      if (selectedId === id) setSelectedId(null);
      refetch();
    } catch (error) {
      toast.error("Failed to delete schema");
      console.error(error);
    }
  };

  const selected = selectedId ? schemas?.find((s) => s.id === selectedId) : null;
  const selectedPreview = selected ? parseSchema(selected.schema, selected.format) : null;

  if (isLoading) {
    return (
      <div className="text-center text-gray-400">
        <div className="animate-spin inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full"></div>
        <p className="mt-2">Loading schemas...</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Schema List */}
      <div className="lg:col-span-1">
        <Card className="bg-slate-900 border-white border-opacity-10 overflow-hidden">
          <div className="p-4 border-b border-white border-opacity-10 flex justify-between items-center">
            <h3 className="text-white font-semibold">Schemas</h3>
            <Button
              onClick={() => {
                setShowForm(!showForm);
                setSchemaPreview(null);
              }}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus size={16} />
            </Button>
          </div>

          <div className="divide-y divide-white divide-opacity-10 max-h-96 overflow-y-auto">
            {schemas && schemas.length > 0 ? (
              schemas.map((schema) => (
                <button
                  key={schema.id}
                  onClick={() => {
                    setSelectedId(schema.id);
                    setShowForm(false);
                  }}
                  className={`w-full text-left p-3 transition-colors ${
                    selectedId === schema.id
                      ? "bg-blue-600 bg-opacity-20 border-l-2 border-blue-600"
                      : "hover:bg-white hover:bg-opacity-5"
                  }`}
                >
                  <div className="text-white text-sm font-medium truncate">{schema.name}</div>
                  <div className="text-xs text-gray-500 mt-1">{schema.format}</div>
                </button>
              ))
            ) : (
              <div className="p-4 text-center text-gray-400 text-sm">No schemas yet</div>
            )}
          </div>
        </Card>
      </div>

      {/* Details / Form */}
      <div className="lg:col-span-2">
        {showForm ? (
          <Card className="p-6 bg-slate-900 border-white border-opacity-10 space-y-4">
            <h3 className="text-white font-semibold">Create New Schema</h3>

            <div>
              <label className="block text-white text-sm font-semibold mb-2">Schema Name</label>
              <Input
                placeholder="e.g., Production DB"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-slate-800 border-white border-opacity-20 text-white"
              />
            </div>

            <div>
              <label className="block text-white text-sm font-semibold mb-2">Description</label>
              <Input
                placeholder="Optional description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="bg-slate-800 border-white border-opacity-20 text-white"
              />
            </div>

            <div>
              <label className="block text-white text-sm font-semibold mb-2">Format</label>
              <select
                value={formData.format}
                onChange={(e) => handleFormatChange(e.target.value as "sql" | "json")}
                className="w-full bg-slate-800 border border-white border-opacity-20 text-white rounded px-3 py-2"
              >
                <option value="sql">SQL DDL</option>
                <option value="json">JSON</option>
              </select>
            </div>

            <div>
              <label className="block text-white text-sm font-semibold mb-2">Schema Definition</label>
              <Textarea
                placeholder={
                  formData.format === "sql"
                    ? "Paste your SQL DDL here...\n\nExample:\nCREATE TABLE employees (\n  id INT PRIMARY KEY,\n  name VARCHAR(100),\n  salary DECIMAL(10,2)\n);"
                    : "Paste your JSON schema here..."
                }
                value={formData.schema}
                onChange={(e) => handleSchemaChange(e.target.value)}
                className="bg-slate-800 border-white border-opacity-20 text-white min-h-40"
              />
            </div>

            {/* Schema Preview */}
            {schemaPreview && (
              <Card className="p-4 bg-slate-800 border border-white border-opacity-10">
                <div className="flex items-start gap-2 mb-3">
                  {schemaPreview.isValid ? (
                    <CheckCircle size={20} className="text-green-400 flex-shrink-0 mt-1" />
                  ) : (
                    <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-1" />
                  )}
                  <div>
                    <div
                      className={`font-semibold ${
                        schemaPreview.isValid ? "text-green-300" : "text-red-300"
                      }`}
                    >
                      {schemaPreview.message}
                    </div>
                  </div>
                </div>

                {schemaPreview.isValid && schemaPreview.tables.length > 0 && (
                  <div className="space-y-2">
                    {schemaPreview.tables.map((table: any, idx: number) => (
                      <div key={idx} className="bg-slate-700 p-2 rounded">
                        <div className="text-white font-semibold text-sm flex items-center gap-2">
                          <Database size={14} />
                          {table.name}
                        </div>
                        {table.columns.length > 0 && (
                          <div className="text-gray-400 text-xs mt-1">
                            Columns: {table.columns.join(", ")}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleCreate}
                disabled={createMutation.isPending || !schemaPreview?.isValid}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
              >
                {createMutation.isPending ? "Creating..." : "Create Schema"}
              </Button>
              <Button
                onClick={() => {
                  setShowForm(false);
                  setSchemaPreview(null);
                }}
                variant="outline"
                className="flex-1 border-white border-opacity-30 text-white"
              >
                Cancel
              </Button>
            </div>
          </Card>
        ) : selected ? (
          <div className="space-y-4">
            {/* Header */}
            <Card className="p-6 bg-slate-900 border-white border-opacity-10">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-white font-semibold text-lg">{selected.name}</h3>
                  {selected.description && (
                    <p className="text-gray-400 text-sm mt-1">{selected.description}</p>
                  )}
                </div>
                <Button
                  onClick={() => handleDelete(selected.id)}
                  variant="outline"
                  size="sm"
                  className="text-red-400 border-red-400 border-opacity-50 hover:bg-red-950"
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            </Card>

            {/* Schema Content */}
            <Card className="p-6 bg-slate-900 border-white border-opacity-10">
              <h3 className="text-white font-semibold mb-4">Schema Definition</h3>
              <div className="bg-slate-800 border border-white border-opacity-10 rounded overflow-auto max-h-64">
                <CodeHighlight code={selected.schema} language={selected.format === "sql" ? "sql" : "json"} />
              </div>
            </Card>

            {/* Tables Preview */}
            {selectedPreview && selectedPreview.isValid && selectedPreview.tables.length > 0 && (
              <Card className="p-6 bg-slate-900 border-white border-opacity-10">
                <h3 className="text-white font-semibold mb-4">Tables & Columns</h3>
                <div className="space-y-3">
                  {selectedPreview.tables.map((table: any, idx: number) => (
                    <div key={idx} className="bg-slate-800 border border-white border-opacity-10 rounded p-4">
                      <div className="text-white font-semibold flex items-center gap-2 mb-2">
                        <Database size={16} className="text-blue-400" />
                        {table.name}
                      </div>
                      {table.columns.length > 0 && (
                        <div className="text-gray-300 text-sm">
                          <div className="text-gray-400 text-xs mb-1">Columns:</div>
                          <div className="flex flex-wrap gap-2">
                            {table.columns.map((col: string, cidx: number) => (
                              <span
                                key={cidx}
                                className="bg-slate-700 px-2 py-1 rounded text-xs text-gray-300"
                              >
                                {col}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Metadata */}
            <Card className="p-6 bg-slate-900 border-white border-opacity-10">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-gray-400 text-xs">Format</div>
                  <div className="text-white font-semibold capitalize">{selected.format}</div>
                </div>
                <div>
                  <div className="text-gray-400 text-xs">Created</div>
                  <div className="text-white font-semibold">
                    {new Date(selected.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        ) : (
          <Card className="p-8 text-center bg-slate-900 border-white border-opacity-10">
            <p className="text-gray-400">Select a schema to view details or create a new one</p>
          </Card>
        )}
      </div>
    </div>
  );
}
