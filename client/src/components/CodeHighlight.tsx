import { useMemo } from "react";

interface CodeHighlightProps {
  code: string;
  language?: string;
  className?: string;
}

export function CodeHighlight({ code, language = "sql", className = "" }: CodeHighlightProps) {
  const tokens = useMemo(() => highlightCode(code, language), [code, language]);

  return (
    <pre className={`bg-slate-800 p-4 rounded text-gray-300 text-sm overflow-auto max-h-96 border border-white border-opacity-10 font-mono ${className}`}>
      {tokens.map((token, index) =>
        token.className ? (
          <span key={index} className={token.className}>{token.value}</span>
        ) : (
          token.value
        )
      )}
    </pre>
  );
}

interface HighlightToken {
  value: string;
  className?: string;
}

function highlightCode(code: string, language: string): HighlightToken[] {
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

  // Match each original token once. Rendering spans through React ensures
  // class names can never be interpreted as query text and highlighted again.
  const keywordPattern = keywords.join("|");
  const tokenPattern = new RegExp(
    `(--[^\\n]*|//[^\\n]*|/\\*[\\s\\S]*?\\*/)|((['"\\x60])(?:(?=(\\\\?))\\4.)*?\\3)|\\b(${keywordPattern})\\b|\\b(\\d+(?:\\.\\d+)?)\\b`,
    "gi"
  );

  const result: HighlightToken[] = [];
  let lastIndex = 0;

  for (const match of code.matchAll(tokenPattern)) {
    const token = match[0];
    const index = match.index ?? 0;
    const plainText = code.slice(lastIndex, index);
    if (plainText) result.push({ value: plainText });

    const className = match[1]
      ? "text-gray-500"
      : match[2]
        ? "text-green-400"
        : match[5]
          ? "text-blue-400 font-semibold"
          : "text-yellow-400";

    result.push({ value: token, className });
    lastIndex = index + token.length;
  }

  const remainingText = code.slice(lastIndex);
  if (remainingText) result.push({ value: remainingText });
  return result;
}
