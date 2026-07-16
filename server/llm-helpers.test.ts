import { describe, it, expect, vi } from "vitest";
import {
  generateSQLQuery,
  explainSQLQuery,
  analyzeQueryImpact,
  generateCode,
  explainCode,
  debugCode,
  optimizeCode,
  localSqlFallback,
} from "./llm-helpers";

// Mock the invokeLLM function
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(async (params: any) => {
    // Return mock responses based on the system prompt
    if (params.messages[0]?.content?.includes("SQL query generator")) {
      return {
        choices: [
          {
            message: {
              content: "SELECT * FROM Employee WHERE Salary > 50000;",
            },
          },
        ],
      };
    }

    if (params.messages[0]?.content?.includes("SQL query explainer")) {
      return {
        choices: [
          {
            message: {
              content:
                "This query selects all columns from the Employee table where the salary is greater than 50000.",
            },
          },
        ],
      };
    }

    if (params.response_format) {
      // Return structured JSON response based on schema name
      const schemaName = params.response_format?.json_schema?.name;
      if (schemaName === "code_debug") {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  issues: ["Missing colon after function definition"],
                  correctedCode: "def broken(x):\n  return x + 1",
                  explanation: "Python functions require a colon at the end of the def line",
                }),
              },
            },
          ],
        };
      }
      // Default to query_analysis response
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                warnings: ["No WHERE clause in UPDATE"],
                estimatedRows: "~100",
                riskLevel: "high",
                analysis: "This operation will affect many rows",
              }),
            },
          },
        ],
      };
    }

    if (params.messages[0]?.content?.includes("programmer")) {
      return {
        choices: [
          {
            message: {
              content: "def factorial(n):\n  return 1 if n <= 1 else n * factorial(n-1)",
            },
          },
        ],
      };
    }

    return {
      choices: [
        {
          message: {
            content: "Mock response",
          },
        },
      ],
    };
  }),
}));

describe("LLM Helpers", () => {
  describe("generateSQLQuery", () => {
    it("should generate SQL query from natural language", async () => {
      const result = await generateSQLQuery(
        "Show all employees with salary > 50000",
        "CREATE TABLE Employee (id INT, name VARCHAR(100), Salary INT);"
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toContain("SELECT");
      expect(result[0]).toContain("Employee");
    });

    it("should handle empty input gracefully", async () => {
      const result = await generateSQLQuery("", "");
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("local SQL fallback", () => {
    it("interprets a normal read request without a hard-coded table list", () => {
      const [query] = localSqlFallback("Show all customers where balance is greater than 1000");
      expect(query).toBe("SELECT *\nFROM customers\nWHERE balance > 1000;");
    });

    it("uses the supplied schema and understands sorting and limits", () => {
      const [query] = localSqlFallback(
        "Find the top 3 students with highest CGPA",
        "CREATE TABLE Students (id INT, cgpa DECIMAL(3,2));"
      );
      expect(query).toBe("SELECT *\nFROM Students\nORDER BY CGPA DESC\nLIMIT 3;");
    });

    it("interprets a filtered percentage increase", () => {
      const [query] = localSqlFallback("Increase salary of all employees in IT department by 10%");
      expect(query).toContain("UPDATE employees");
      expect(query).toContain("SET salary = salary * 1.1000");
      expect(query).toContain("WHERE Department = 'IT'");
    });

    it("generates a ranked distinct salary query from a single-table schema", () => {
      const [query] = localSqlFallback(
        "Find the second highest distinct salary",
        "CREATE TABLE employees (id INT, salary DECIMAL(10,2));"
      );
      expect(query).toBe("SELECT DISTINCT salary\nFROM employees\nORDER BY salary DESC\nLIMIT 1 OFFSET 1;");
    });

    it("uses the unique salary column in a multi-table schema", () => {
      const [query] = localSqlFallback(
        "Find the second highest distinct salary",
        "CREATE TABLE departments (id INT, name VARCHAR(100));\nCREATE TABLE employees (id INT, salary DECIMAL(10,2));"
      );
      expect(query).toContain("FROM employees");
    });

    it("does not mistake ranking words for table names", () => {
      const [query] = localSqlFallback("Find the second highest distinct salary");
      expect(query).toContain("Please name the table");
    });
  });

  describe("explainSQLQuery", () => {
    it("should explain SQL query in plain language", async () => {
      const result = await explainSQLQuery(
        "SELECT * FROM Employee WHERE Salary > 50000",
        "CREATE TABLE Employee (id INT, name VARCHAR(100), Salary INT);"
      );

      expect(result).toContain("query");
      expect(result.length > 0).toBe(true);
    });
  });

  describe("analyzeQueryImpact", () => {
    it("should analyze query impact and return structured data", async () => {
      const result = await analyzeQueryImpact(
        "UPDATE Employee SET Salary = Salary * 1.10",
        "CREATE TABLE Employee (id INT, Salary INT);"
      );

      expect(result).toHaveProperty("warnings");
      expect(result).toHaveProperty("estimatedRows");
      expect(result).toHaveProperty("riskLevel");
      expect(result).toHaveProperty("analysis");
      expect(["low", "medium", "high"]).toContain(result.riskLevel);
    });

    it("should identify risky operations", async () => {
      const result = await analyzeQueryImpact(
        "DELETE FROM Employee",
        "CREATE TABLE Employee (id INT);"
      );

      expect(result.riskLevel).toBeDefined();
      expect(result.warnings).toBeDefined();
    });
  });

  describe("generateCode", () => {
    it("should generate code in specified language", async () => {
      const result = await generateCode(
        "Write a function to calculate factorial",
        "python"
      );

      expect(result).toContain("def");
      expect(result.length > 0).toBe(true);
    });
  });

  describe("explainCode", () => {
    it("should explain code in plain language", async () => {
      const result = await explainCode(
        "def factorial(n): return 1 if n <= 1 else n * factorial(n-1)",
        "python"
      );

      expect(result.length > 0).toBe(true);
      expect(typeof result).toBe("string");
    });
  });

  describe("debugCode", () => {
    it("should debug code and return issues", async () => {
      const result = await debugCode(
        "def broken(x)\n  return x + 1",
        "python"
      );

      expect(result).toHaveProperty("issues");
      expect(result).toHaveProperty("correctedCode");
      expect(result).toHaveProperty("explanation");
      expect(Array.isArray(result.issues)).toBe(true);
    });
  });

  describe("optimizeCode", () => {
    it("should optimize code", async () => {
      const result = await optimizeCode(
        "for i in range(len(arr)): print(arr[i])",
        "python"
      );

      expect(result.length > 0).toBe(true);
      expect(typeof result).toBe("string");
    });
  });
});
