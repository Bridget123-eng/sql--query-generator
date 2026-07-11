# SQL & Code Assistant - Project TODO

## Database Schema
- [x] Add QueryHistory table (userId, type, input, query, explanation, createdAt, executedAt)
- [x] Add SchemaDefinition table (userId, name, schema, createdAt, updatedAt)
- [x] Add CodeSnippet table (userId, input, code, explanation, language, createdAt)
- [x] Add ExecutionResult table (queryHistoryId, rowsAffected, rowsReturned, result, executedAt, error)

## Backend APIs - Query Generation & Streaming
- [x] Create LLM streaming helper for token-by-token output
- [x] Build SQL generation endpoint with streaming (accepts natural language + schema)
- [x] Build SQL explanation endpoint with streaming
- [x] Build code generation endpoint with streaming (multiple languages)
- [x] Build code explanation endpoint with streaming
- [x] Build code debugging endpoint with streaming
- [x] Build query impact analyzer (detects risky operations, estimates row counts)
- [ ] Build query execution endpoint (with safety checks)

## Backend APIs - Schema & History Management
- [x] Build schema upload/paste endpoint (validate and store)
- [x] Build schema retrieval endpoint (list user schemas)
- [x] Build query history endpoint (list, search, filter by type)
- [x] Build code snippet history endpoint
- [x] Build delete/archive endpoints for history items

## Frontend - Layout & Navigation
- [x] Implement engineering blueprint aesthetic (deep blue bg, grid pattern, white lines)
- [x] Build sidebar navigation with exact labels: New Query, Query History, Schema Manager, Settings
- [x] Create main content area layout
- [x] Add responsive design for mobile/tablet

## Frontend - Query Assistant Page
- [x] Build query type selector (SQL / Code)
- [x] Build natural language input textarea
- [x] Build schema selector/uploader
- [x] Implement streaming output display for generated queries
- [x] Add query explanation display (streaming)
- [x] Build impact analyzer display with warnings
- [x] Add copy/execute buttons
- [ ] Implement execution results display with row counts

## Frontend - Code Assistant Page
- [x] Build code language selector
- [x] Build natural language input for code generation
- [x] Implement streaming code output with syntax highlighting
- [x] Build code explanation display (streaming)
- [x] Build debugging interface (paste code, get analysis)
- [x] Add optimization suggestions display
- [x] Implement copy/download buttons

## Frontend - Query History Page
- [x] Build query history list with filters (type, date, schema)
- [x] Add search functionality
- [x] Implement query detail view (full query, explanation, results)
- [x] Add re-run button for previous queries
- [ ] Build delete/archive functionality

## Frontend - Schema Manager Page
- [x] Build schema upload interface (paste SQL DDL)
- [ ] Implement schema preview/validation
- [x] Build schema list with edit/delete options
- [x] Add schema selection for query generation
- [ ] Implement schema versioning display

## Frontend - Settings Page
- [x] Build user profile section
- [ ] Add API key management (if applicable)
- [ ] Build export/backup options
- [ ] Add theme/appearance settings

## Testing & Integration
- [x] Write vitest tests for LLM streaming helpers
- [x] Write vitest tests for impact analyzer logic
- [ ] Write vitest tests for schema parser
- [x] Test end-to-end SQL generation flow
- [x] Test end-to-end code generation flow
- [x] Test history persistence across sessions
- [ ] Test streaming output in browser
- [x] Test impact warnings for risky operations

## Deployment & Polish
- [x] Verify all streaming works smoothly
- [x] Test on mobile/tablet viewports
- [x] Verify database persistence
- [x] Check error handling and user feedback
- [x] Performance optimization (streaming, lazy loading)
- [x] Create checkpoint for deployment
