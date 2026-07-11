import { useEffect, useRef } from "react";

interface CodeHighlightProps {
  code: string;
  language?: string;
  className?: string;
}

export function CodeHighlight({ code, language = "sql", className = "" }: CodeHighlightProps) {
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    // Basic syntax highlighting without external library
    // This is a simple implementation that can be enhanced with Prism.js or highlight.js
    if (preRef.current) {
      preRef.current.innerHTML = highlightCode(code, language);
    }
  }, [code, language]);

  return (
    <pre
      ref={preRef}
      className={`bg-slate-800 p-4 rounded text-gray-300 text-sm overflow-auto max-h-96 border border-white border-opacity-10 font-mono ${className}`}
    >
      {code}
    </pre>
  );
}

function highlightCode(code: string, language: string): string {
  // SQL keywords
  const sqlKeywords = [
    "SELECT",
    "FROM",
    "WHERE",
    "INSERT",
    "UPDATE",
    "DELETE",
    "CREATE",
    "ALTER",
    "DROP",
    "JOIN",
    "LEFT",
    "RIGHT",
    "INNER",
    "OUTER",
    "ON",
    "AND",
    "OR",
    "NOT",
    "IN",
    "LIKE",
    "BETWEEN",
    "ORDER",
    "BY",
    "GROUP",
    "HAVING",
    "LIMIT",
    "OFFSET",
    "DISTINCT",
    "AS",
    "TABLE",
    "DATABASE",
    "PRIMARY",
    "KEY",
    "FOREIGN",
    "UNIQUE",
    "INDEX",
  ];

  // Python keywords
  const pythonKeywords = [
    "def",
    "class",
    "if",
    "else",
    "elif",
    "for",
    "while",
    "return",
    "import",
    "from",
    "as",
    "try",
    "except",
    "finally",
    "with",
    "lambda",
    "yield",
    "pass",
    "break",
    "continue",
    "True",
    "False",
    "None",
    "and",
    "or",
    "not",
    "in",
    "is",
  ];

  // JavaScript keywords
  const jsKeywords = [
    "function",
    "const",
    "let",
    "var",
    "if",
    "else",
    "for",
    "while",
    "return",
    "import",
    "export",
    "default",
    "async",
    "await",
    "try",
    "catch",
    "finally",
    "class",
    "extends",
    "new",
    "this",
    "super",
    "true",
    "false",
    "null",
    "undefined",
  ];

  let keywords: string[] = [];

  if (language === "sql") {
    keywords = sqlKeywords;
  } else if (language === "python") {
    keywords = pythonKeywords;
  } else if (language === "javascript" || language === "typescript") {
    keywords = jsKeywords;
  }

  let highlighted = code;

  // Escape HTML
  highlighted = highlighted
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  // Highlight keywords
  keywords.forEach((keyword) => {
    const regex = new RegExp(`\\b${keyword}\\b`, "gi");
    highlighted = highlighted.replace(
      regex,
      `<span class="text-blue-400 font-semibold">${keyword}</span>`
    );
  });

  // Highlight strings
  highlighted = highlighted.replace(
    /(['"`])(?:(?=(\\?))\2.)*?\1/g,
    '<span class="text-green-400">$&</span>'
  );

  // Highlight comments
  highlighted = highlighted.replace(
    /(--[^\n]*|\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g,
    '<span class="text-gray-500">$1</span>'
  );

  // Highlight numbers
  highlighted = highlighted.replace(
    /\b(\d+(?:\.\d+)?)\b/g,
    '<span class="text-yellow-400">$1</span>'
  );

  return highlighted;
}
