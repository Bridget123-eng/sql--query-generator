# SQL & Code Assistant - Project Guide

## Overview

The **Intelligent SQL & Code Assistant** is a professional web application that leverages advanced AI to help developers generate, understand, debug, and optimize SQL queries and code across multiple programming languages.

## Key Features

### SQL Query Assistant
- **Natural Language to SQL**: Convert plain English requirements into optimized SQL queries
- **Query Explanation**: Get clear, simple explanations of generated queries
- **Impact Analysis**: Analyze potential impact with row count estimates and risk warnings
- **Schema Management**: Define or paste database schemas for accurate query generation
- **Query History**: Track all generated queries with full context and results

### Code Assistant
- **Code Generation**: Generate code in Python, JavaScript, Java, C++, C#, Go, Rust, and more
- **Code Debugging**: Identify and fix errors with AI-powered analysis
- **Code Optimization**: Improve performance and readability of existing code
- **Code Explanation**: Understand complex code through detailed explanations
- **Code History**: Keep track of all generated and modified code snippets

## Architecture

### Database Schema
- **users**: Core authentication table
- **queryHistory**: Tracks all SQL/code generation requests
- **schemaDefinitions**: User-defined database schemas
- **codeSnippets**: Generated and debugged code storage
- **executionResults**: Query execution outcomes and results

### Backend Stack
- **Framework**: Express.js with tRPC
- **Database**: MySQL with Drizzle ORM
- **AI Integration**: Manus built-in LLM (gpt-5-mini model)
- **Authentication**: Manus OAuth

### Frontend Stack
- **Framework**: React 19 with TypeScript
- **Styling**: Tailwind CSS 4
- **UI Components**: shadcn/ui
- **State Management**: tRPC with React Query
- **Design**: Engineering blueprint aesthetic with dark blue background and grid pattern

## Project Structure

```
sql-assistant/
├── client/                 # React frontend
│   ├── src/
│   │   ├── pages/         # Page components
│   │   ├── components/    # Reusable UI components
│   │   ├── lib/           # Utilities and tRPC client
│   │   └── App.tsx        # Main app with routing
│   └── index.html
├── server/                # Express backend
│   ├── routers/           # tRPC routers
│   │   ├── assistant.ts   # SQL/code generation APIs
│   │   └── schemas.ts     # Schema management APIs
│   ├── llm-helpers.ts     # LLM integration functions
│   ├── db.ts              # Database query helpers
│   ├── routers.ts         # Main router aggregation
│   └── _core/             # Framework utilities
├── drizzle/               # Database schema and migrations
├── shared/                # Shared types and constants
└── todo.md                # Project feature tracking
```

## Getting Started

### Prerequisites
- Node.js 22+
- MySQL database
- Manus account with OAuth configured

### Installation

1. **Install dependencies**:
   ```bash
   pnpm install
   ```

2. **Set up environment**:
   - Database URL is automatically configured
   - OAuth credentials are injected by Manus platform
   - LLM API keys are pre-configured

3. **Run development server**:
   ```bash
   pnpm dev
   ```

4. **Run tests**:
   ```bash
   pnpm test
   ```

## Usage Guide

### Generating SQL Queries

1. Navigate to **New Query** from sidebar
2. Describe your requirement in natural language
3. (Optional) Select a saved schema or paste custom SQL DDL
4. Click **Generate Query**
5. Review the generated query, explanation, and impact analysis
6. Copy the query or save to history

### Generating Code

1. Navigate to **New Query** (Code tab appears in sidebar)
2. Select **Generate** mode
3. Choose your programming language
4. Describe what code you need
5. Click **Generate Code**
6. Review the generated code and explanation
7. Copy or download the code

### Debugging Code

1. In **New Query**, select **Debug** mode
2. Paste your code
3. (Optional) Include error message
4. Select language
5. Click **Debug Code**
6. Review identified issues and corrected code

### Managing Schemas

1. Navigate to **Schema Manager**
2. Click **+** to create new schema
3. Enter schema name and paste SQL DDL or JSON
4. Save schema
5. Use saved schemas in query generation for faster, more accurate results

### Viewing History

1. Navigate to **Query History**
2. Browse all previous queries and code snippets
3. Click on any item to view full details
4. Copy or re-use previous queries

## API Reference

### SQL Generation
```typescript
trpc.assistant.generateSQL.useMutation({
  prompt: string,
  schemaId?: number,
  customSchema?: string
})
```

### SQL Explanation
```typescript
trpc.assistant.explainSQL.useQuery({
  query: string,
  schemaId?: number,
  customSchema?: string
})
```

### Query Impact Analysis
```typescript
trpc.assistant.analyzeSQL.useQuery({
  query: string,
  schemaId?: number,
  customSchema?: string
})
```

### Code Generation
```typescript
trpc.assistant.generateCode.useMutation({
  prompt: string,
  language: string
})
```

### Code Debugging
```typescript
trpc.assistant.debugCode.useMutation({
  code: string,
  language: string,
  errorMessage?: string
})
```

### Schema Management
```typescript
trpc.schemas.create.useMutation({ ... })
trpc.schemas.list.useQuery()
trpc.schemas.get.useQuery({ id: number })
trpc.schemas.update.useMutation({ ... })
trpc.schemas.delete.useMutation({ id: number })
```

## Design System

### Color Palette
- **Background**: Deep slate blue (#0f172a)
- **Primary**: Bright blue (#2563eb)
- **Accent**: White with opacity
- **Text**: White and gray scales

### Typography
- **Headings**: Bold sans-serif
- **Body**: Regular sans-serif
- **Code**: Monospace

### Components
- **Cards**: Slate background with white border opacity
- **Buttons**: Blue primary, outline variants
- **Inputs**: Dark slate with white border opacity
- **Grid**: Subtle background pattern for technical aesthetic

## Deployment

### Pre-Deployment Checklist
- [ ] All tests pass (`pnpm test`)
- [ ] TypeScript compiles without errors (`pnpm check`)
- [ ] Environment variables are configured
- [ ] Database migrations are applied
- [ ] OAuth credentials are set up

### Deployment Steps
1. Create a checkpoint in the Management UI
2. Click **Publish** button
3. Configure custom domain (optional)
4. Monitor deployment in Dashboard

### Post-Deployment
- Verify all features work in production
- Monitor error logs
- Test OAuth flow
- Verify database connectivity

## Troubleshooting

### LLM Generation Fails
- Check API key configuration
- Verify schema format is correct
- Ensure prompt is descriptive enough
- Check token usage limits

### Database Connection Issues
- Verify DATABASE_URL is set
- Check MySQL server is running
- Ensure credentials are correct
- Review connection pool settings

### Authentication Issues
- Clear browser cookies
- Verify OAuth redirect URL
- Check Manus OAuth configuration
- Review session storage

## Performance Optimization

### Frontend
- Use React Query caching for repeated queries
- Implement pagination for large history lists
- Lazy load code syntax highlighting
- Optimize bundle size with code splitting

### Backend
- Cache schema definitions
- Implement query result pagination
- Use database indexes on userId and createdAt
- Monitor LLM API response times

## Security Considerations

- All LLM API calls are server-side only
- User data is isolated by userId
- SQL queries are not executed automatically
- Schema definitions are stored securely
- OAuth tokens are handled securely

## Future Enhancements

- Real-time token streaming for query/code output
- Syntax highlighting for code display
- Query execution with result visualization
- Advanced filtering and search in history
- Export/import functionality
- Team collaboration features
- Query optimization suggestions
- Performance benchmarking

## Support & Feedback

For issues or feature requests, please refer to the project's issue tracker or contact the development team.

## License

This project is built on the Manus platform and follows its terms of service.
