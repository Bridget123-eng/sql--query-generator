import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Play, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import { CodeHighlight } from "@/components/CodeHighlight";

const LANGUAGES = [
  "python",
  "javascript",
  "typescript",
  "java",
  "cpp",
  "csharp",
  "go",
  "rust",
  "sql",
];

export default function CodeAssistant() {
  const [mode, setMode] = useState<"generate" | "debug" | "optimize">("generate");
  const [prompt, setPrompt] = useState("");
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("python");
  const [errorMessage, setErrorMessage] = useState("");

  const [generatedCode, setGeneratedCode] = useState("");
  const [explanation, setExplanation] = useState("");
  const [debugResult, setDebugResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const generateMutation = trpc.assistant.generateCode.useMutation();
  const debugMutation = trpc.assistant.debugCode.useMutation();
  const optimizeMutation = trpc.assistant.optimizeCode.useMutation();
  const explainQuery = trpc.assistant.explainCode.useQuery(
    { code: generatedCode, language },
    { enabled: !!generatedCode }
  );

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Please enter a code prompt");
      return;
    }

    setLoading(true);
    try {
      const result = await generateMutation.mutateAsync({
        prompt,
        language,
      });
      setGeneratedCode(result.code);
      toast.success("Code generated successfully");
    } catch (error) {
      toast.error("Failed to generate code");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDebug = async () => {
    if (!code.trim()) {
      toast.error("Please paste code to debug");
      return;
    }

    setLoading(true);
    try {
      const result = await debugMutation.mutateAsync({
        code,
        language,
        errorMessage: errorMessage || undefined,
      });
      setDebugResult(result);
      setGeneratedCode(result.correctedCode);
      toast.success("Code debugged successfully");
    } catch (error) {
      toast.error("Failed to debug code");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleOptimize = async () => {
    if (!code.trim()) {
      toast.error("Please paste code to optimize");
      return;
    }

    setLoading(true);
    try {
      const result = await optimizeMutation.mutateAsync({
        code,
        language,
      });
      setGeneratedCode(result.code);
      toast.success("Code optimized successfully");
    } catch (error) {
      toast.error("Failed to optimize code");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedCode);
    toast.success("Code copied to clipboard");
  };

  return (
    <div className="space-y-6">
      {/* Mode Selection */}
      <div className="flex gap-2">
        {(["generate", "debug", "optimize"] as const).map((m) => (
          <Button
            key={m}
            onClick={() => {
              setMode(m);
              setGeneratedCode("");
              setDebugResult(null);
              setExplanation("");
            }}
            variant={mode === m ? "default" : "outline"}
            className={
              mode === m
                ? "bg-blue-600 text-white"
                : "border-white border-opacity-30 text-white hover:bg-white hover:bg-opacity-10"
            }
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </Button>
        ))}
      </div>

      {/* Input Section */}
      <Card className="p-6 bg-slate-900 border-white border-opacity-10">
        <div className="space-y-4">
          <div>
            <label className="block text-white font-semibold mb-2">
              {mode === "generate" ? "Describe Your Code" : "Paste Your Code"}
            </label>
            <Textarea
              placeholder={
                mode === "generate"
                  ? "e.g., Write a function to calculate factorial"
                  : "Paste your code here..."
              }
              value={mode === "generate" ? prompt : code}
              onChange={(e) =>
                mode === "generate" ? setPrompt(e.target.value) : setCode(e.target.value)
              }
              className="bg-slate-800 border-white border-opacity-20 text-white placeholder-gray-500 min-h-32"
            />
          </div>

          {mode !== "generate" && (
            <div>
              <label className="block text-white font-semibold mb-2">
                {mode === "debug" ? "Error Message (Optional)" : ""}
              </label>
              {mode === "debug" && (
                <Textarea
                  placeholder="Paste any error message here..."
                  value={errorMessage}
                  onChange={(e) => setErrorMessage(e.target.value)}
                  className="bg-slate-800 border-white border-opacity-20 text-white placeholder-gray-500 h-16"
                />
              )}
            </div>
          )}

          <div>
            <label className="block text-white font-semibold mb-2">
              Programming Language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full bg-slate-800 border border-white border-opacity-20 text-white rounded px-3 py-2"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang.charAt(0).toUpperCase() + lang.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <Button
            onClick={
              mode === "generate"
                ? handleGenerate
                : mode === "debug"
                ? handleDebug
                : handleOptimize
            }
            disabled={
              loading ||
              (mode === "generate" ? !prompt.trim() : !code.trim())
            }
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3"
          >
            <Play size={18} className="mr-2" />
            {mode === "generate"
              ? "Generate Code"
              : mode === "debug"
              ? "Debug Code"
              : "Optimize Code"}
          </Button>
        </div>
      </Card>

      {/* Output Section */}
      {generatedCode && (
        <Tabs defaultValue="code" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-slate-900 border-b border-white border-opacity-10">
            <TabsTrigger value="code" className="text-white">
              {mode === "debug" ? "Corrected Code" : "Code"}
            </TabsTrigger>
            <TabsTrigger value="analysis" className="text-white">
              {mode === "debug" ? "Issues & Fixes" : "Explanation"}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="code" className="space-y-4">
            <Card className="p-6 bg-slate-900 border-white border-opacity-10">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-semibold">
                  {mode === "debug" ? "Corrected Code" : "Generated Code"}
                </h3>
                <Button
                  onClick={handleCopy}
                  variant="outline"
                  size="sm"
                  className="text-white border-white border-opacity-30"
                >
                  <Copy size={16} className="mr-2" />
                  Copy
                </Button>
              </div>
              <CodeHighlight code={generatedCode} language={language} />
            </Card>
          </TabsContent>

          <TabsContent value="analysis" className="space-y-4">
            <Card className="p-6 bg-slate-900 border-white border-opacity-10">
              {mode === "debug" && debugResult?.issues ? (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-white font-semibold mb-3">Issues Found</h3>
                    <div className="bg-red-950 border border-red-700 rounded p-4 space-y-2">
                      {debugResult.issues.map((issue: string, i: number) => (
                        <div key={i} className="text-red-200 text-sm flex gap-2">
                          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                          <span>{issue}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-white font-semibold mb-3">Explanation</h3>
                    <div className="text-gray-300 prose prose-invert max-w-none text-sm">
                      <Streamdown>{debugResult.explanation}</Streamdown>
                    </div>
                  </div>
                </div>
              ) : explainQuery.data?.explanation ? (
                <div>
                  <h3 className="text-white font-semibold mb-3">Code Explanation</h3>
                  <div className="text-gray-300 prose prose-invert max-w-none text-sm">
                    <Streamdown>{explainQuery.data.explanation}</Streamdown>
                  </div>
                </div>
              ) : (
                <div className="text-gray-400">Loading explanation...</div>
              )
              }
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
