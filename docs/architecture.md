# FinanceFlow Architecture

## System Overview

```mermaid
graph TB
    Browser[Browser / PWA] -->|fetch + X-Session-Token| Express[Express 5 Server]
    Express --> Middleware[Middleware Stack]
    Middleware --> Routes[API Routes - 37 files]
    Routes --> Services[Services]
    Routes --> Repos[Repositories - 20 files]
    Services --> Repos
    Repos --> DB[(SQLite WAL)]
    
    subgraph Middleware Stack
        ReqID[Request ID]
        Metrics[Metrics]
        CORS[CORS]
        Timeout[Timeout]
        RateLimit[Rate Limit]
        Auth[Auth]
        ETag[ETag]
        Cache[Cache]
    end
    
    subgraph Frontend SPA
        AppJS[app.js - Router]
        Utils[utils.js - API/DOM]
        Views[18 View Modules]
        AppJS --> Views
    end
    
    Browser --> Frontend_SPA
```

## Data Flow

```mermaid
sequenceDiagram
    participant B as Browser
    participant M as Middleware
    participant R as Route
    participant S as Schema
    participant Re as Repository
    participant DB as SQLite

    B->>M: POST /api/transactions
    M->>M: Auth (verify token)
    M->>R: Route handler
    R->>S: Zod validate
    S-->>R: Validated data
    R->>Re: repository.create(data)
    Re->>DB: INSERT INTO...
    DB-->>Re: Result
    Re-->>R: Created record
    R-->>B: 201 JSON response
```

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Database | SQLite (WAL) | Zero-config, single-file, fast reads |
| Auth | Session tokens in header | Inherently prevents CSRF |
| Frontend | Vanilla JS SPA | No build step, fast development |
| Testing | node:test + supertest | Zero dependencies, native Node.js |
| Icons | Material Icons (self-hosted) | Privacy, no CDN dependency |
