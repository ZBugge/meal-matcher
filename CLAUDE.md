# MealMatch - Claude Code Instructions

## Project Overview
MealMatch is a collaborative meal decision app where groups can swipe left/right on meal ideas to find consensus. Built with React + TypeScript frontend and Express + TypeScript backend.

## Tech Stack
- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, Framer Motion, React Router v6
- **Backend**: Express, TypeScript, SQLite (sql.js), bcryptjs, express-session
- **Testing**: Vitest

## Project Structure
```
food-app/
├── client/           # React frontend
│   └── src/
│       ├── api/      # API client
│       ├── components/  # SwipeCard, SwipeDeck
│       ├── hooks/    # useAuth, useLocalStorage
│       └── pages/    # All page components
├── server/           # Express backend
│   └── src/
│       ├── db/       # Database schema (SQLite)
│       ├── middleware/  # Auth middleware
│       ├── routes/   # API routes
│       └── services/ # Matching algorithm
├── agents/           # AI agent orchestrator
│   ├── orchestrator/ # Node.js orchestration service
│   │   └── src/      # index.ts, github.ts, agent-manager.ts, state.ts
│   └── prompts/      # Agent prompt templates (grooming.md, feature-builder.md, pr-reviewer.md)
└── SPEC.MD           # Full product specification
```

## Development Commands
```bash
# Install all dependencies
npm run install:all

# Run both frontend and backend in dev mode
npm run dev

# Run only backend
npm run dev:server

# Run only frontend
npm run dev:client

# Build for production
npm run build

# Run tests
npm test
```

## Key Patterns

### SQLite Boolean Handling
SQLite stores booleans as 0/1. Always use ternary when rendering:
```tsx
// CORRECT
{meal.archived ? <Badge>Archived</Badge> : null}

// WRONG - renders "0"
{meal.archived && <Badge>Archived</Badge>}
```

### Type Consistency Across Layers
When changing a core data type (like vote values), ensure ALL related files are updated:
```typescript
// Example: Changing vote from boolean to number
// 1. Update server types (server/src/types.ts)
vote: number; // 0 = no, 1 = yes, 2 = maybe

// 2. Update client hooks (client/src/hooks/useLocalStorage.ts)
export interface SwipeProgress {
  swipes: Record<string, number>; // not boolean!
}

// 3. Update API client types (client/src/api/client.ts)
swipes: { mealId: string; vote: number }[];
```
Use grep/search to find all usages: `Record<string, boolean>`, `vote: boolean`, etc.

### React Hooks Rules
All React hooks must be declared at the TOP of components, BEFORE any conditional returns. This is a runtime error that TypeScript won't catch.
```tsx
// WRONG - hooks after early return causes runtime crash
function Component() {
  if (loading) return <Spinner />;
  const [value, setValue] = useState(''); // ❌ Called conditionally
}

// CORRECT - all hooks before any returns
function Component() {
  const [value, setValue] = useState(''); // ✅ Always called
  if (loading) return <Spinner />;
}
```

### Session Configuration
- Production uses secure cookies with `sameSite: 'lax'`
- CORS is only enabled in development
- Static files served before API routes in production

### API Routes
- Auth: `/api/auth/*` (register, login, logout, me)
- Meals: `/api/meals/*` (CRUD operations)
- Sessions: `/api/sessions/*` (create, close, select)
- Participant: `/api/join/*`, `/api/swipes/*`, `/api/results/*`

## Database
- SQLite with sql.js (in-memory with file persistence)
- Database file: `server/data/database.db`
- Schema defined in `server/src/db/schema.ts`

## Deployment (Railway)
- Build command: `npm install && bash build.sh`
- Start command: `npm start`
- Use Railway volumes for SQLite persistence: mount `/data`
- Set `DATABASE_PATH=/data/database.db`
- Set `SESSION_SECRET` environment variable

## Common Tasks

### Adding a new API endpoint
1. Create route in `server/src/routes/`
2. Add types to `server/src/types.ts`
3. Register route in `server/src/index.ts`
4. Add client method in `client/src/api/client.ts`

### Adding a new page
1. Create component in `client/src/pages/`
2. Add route in `client/src/App.tsx`
3. Update navigation as needed

## Notes
- Invite codes are 6 alphanumeric characters (uppercase, no ambiguous chars)
- Meals are soft-deleted (archived flag)
- Session meal pool is locked after creation
- Results include voter breakdown for hosts only

---

## Agent Orchestrator

The `agents/` directory contains an automated GitHub issue implementation system using Claude Code.

### Workflow Phases
```
needs-grooming → grooming → awaiting-approval → ready → in-progress → pr-ready → merged
```

1. **Grooming** (interactive): Agent asks clarifying questions, produces implementation plan
2. **Building** (autonomous): Agent implements the approved plan, creates PR
3. **Reviewing** (autonomous): Agent reviews PR against plan, merges if tests pass

### Labels
| Label | Meaning |
|-------|---------|
| `needs-grooming` | New issue, needs clarification |
| `grooming` | Agent is asking questions |
| `awaiting-approval` | Plan posted, waiting for review |
| `ready` | Plan approved, start building |
| `in-progress` | Agent is implementing |
| `pr-ready` | PR created, ready for review |
| `merged` | PR merged, issue closed |

### Orchestrator Commands
```bash
cd agents/orchestrator

npm run dev              # Start the orchestrator
npm run status           # Show tracked issues by phase
npm run retry <issue#>   # Reset and retry a specific issue
npm run reset            # Clear all tracked issues
```

### Key Files
- **`agents/orchestrator/src/index.ts`** - Main loop, polls GitHub, routes issues to agents
- **`agents/orchestrator/src/github.ts`** - GitHub API wrapper (Octokit)
- **`agents/orchestrator/src/agent-manager.ts`** - Spawns Claude Code in terminal windows
- **`agents/orchestrator/src/state.ts`** - SQLite tracking of issue/agent state
- **`agents/orchestrator/src/config.ts`** - Environment variables and settings

### Prompt Templates
- **`agents/prompts/grooming.md`** - Interactive requirements gathering
- **`agents/prompts/feature-builder.md`** - Autonomous implementation
- **`agents/prompts/pr-reviewer.md`** - PR review and merge

### Environment Variables
```env
GITHUB_TOKEN=ghp_...     # GitHub PAT with repo, read:org, workflow scopes
GH_TOKEN=ghp_...         # Same token (for gh CLI)
GITHUB_REPO=owner/repo   # Target repository
GROOMING_LABEL=needs-grooming
ISSUE_LABEL=ready
```

---

## Key Files Reference

### Backend Files
- **`server/src/index.ts`** - Express app setup, middleware, route registration, server start
- **`server/src/db/schema.ts`** - Database initialization, table creation, query helpers (getOne, getAll, runQuery)
- **`server/src/types.ts`** - All TypeScript interfaces for database entities and API requests/responses
- **`server/src/middleware/auth.ts`** - Authentication middleware (requireAuth, optionalAuth)
- **`server/src/routes/auth.ts`** - POST /api/auth/register, /login, /logout, GET /api/auth/me
- **`server/src/routes/meals.ts`** - CRUD for meals: GET/POST /api/meals, PUT/DELETE /api/meals/:id
- **`server/src/routes/sessions.ts`** - Session management: POST /api/sessions (create), POST /api/sessions/:id/close, POST /api/sessions/:id/select
- **`server/src/routes/swipes.ts`** - Participant flow: POST /api/join/:code, POST /api/swipes, GET /api/results/:sessionId
- **`server/src/services/matching.ts`** - Algorithm to calculate best meal matches from swipes

### Frontend Files
- **`client/src/App.tsx`** - React Router setup, all route definitions
- **`client/src/api/client.ts`** - All API calls to backend (fetch wrapper, typed methods)
- **`client/src/hooks/useAuth.tsx`** - Auth context provider, useAuth hook, login/logout/register
- **`client/src/hooks/useLocalStorage.ts`** - Generic localStorage hook with type safety
- **`client/src/components/SwipeCard.tsx`** - Single swipeable meal card (Framer Motion)
- **`client/src/components/SwipeDeck.tsx`** - Stack of SwipeCards with swipe handling
- **`client/src/pages/Dashboard.tsx`** - Host view: meal management, session creation
- **`client/src/pages/SessionView.tsx`** - Host view: active session monitoring, close session
- **`client/src/pages/JoinSession.tsx`** - Participant enters invite code and display name
- **`client/src/pages/SwipeSession.tsx`** - Participant swipes through meals
- **`client/src/pages/Results.tsx`** - Match results display

## Database Schema

### Tables
```sql
hosts
  - id: TEXT PRIMARY KEY
  - email: TEXT UNIQUE NOT NULL
  - password_hash: TEXT NOT NULL
  - created_at: DATETIME

meals
  - id: TEXT PRIMARY KEY
  - host_id: TEXT NOT NULL REFERENCES hosts(id)
  - title: TEXT NOT NULL
  - description: TEXT
  - type: TEXT DEFAULT 'meal' ('meal' | 'restaurant')
  - archived: INTEGER DEFAULT 0 (SQLite boolean: 0 or 1)
  - pick_count: INTEGER DEFAULT 0
  - created_at: DATETIME

sessions
  - id: TEXT PRIMARY KEY
  - host_id: TEXT NOT NULL REFERENCES hosts(id)
  - invite_code: TEXT UNIQUE NOT NULL (6 chars)
  - status: TEXT DEFAULT 'open' ('open' | 'closed')
  - selected_meal_id: TEXT REFERENCES meals(id)
  - created_at: DATETIME
  - closed_at: DATETIME

session_meals (junction table)
  - id: TEXT PRIMARY KEY
  - session_id: TEXT NOT NULL REFERENCES sessions(id)
  - meal_id: TEXT NOT NULL REFERENCES meals(id)
  - display_order: INTEGER

participants
  - id: TEXT PRIMARY KEY
  - session_id: TEXT NOT NULL REFERENCES sessions(id)
  - display_name: TEXT NOT NULL
  - host_id: TEXT REFERENCES hosts(id)
  - submitted: INTEGER DEFAULT 0 (SQLite boolean: 0 or 1)
  - created_at: DATETIME

swipes
  - id: TEXT PRIMARY KEY
  - participant_id: TEXT NOT NULL REFERENCES participants(id)
  - session_meal_id: TEXT NOT NULL REFERENCES session_meals(id)
  - vote: INTEGER NOT NULL (1 = yes, 0 = no)
  - created_at: DATETIME
  - UNIQUE(participant_id, session_meal_id)

session_history
  - id: TEXT PRIMARY KEY
  - session_id: TEXT UNIQUE NOT NULL REFERENCES sessions(id)
  - selected_meal_id: TEXT NOT NULL REFERENCES meals(id)
  - selected_at: DATETIME
```

## Core Types

### Database Entities (server/src/types.ts)
```typescript
Meal: { id, host_id, title, description, type, archived, pick_count, created_at }
Session: { id, host_id, invite_code, status, selected_meal_id, created_at, closed_at }
Participant: { id, session_id, display_name, host_id, submitted, created_at }
Swipe: { id, participant_id, session_meal_id, vote, created_at }
```

### API Responses
```typescript
MatchResult: { mealId, title, description, yesCount, totalVotes, percentage, isUnanimous, voters? }
SessionWithDetails: extends Session + { meals[], participantCount, submittedCount }
```

### API Requests
```typescript
CreateMealRequest: { title, description? }
CreateSessionRequest: { mealIds[] }
JoinSessionRequest: { displayName }
SubmitSwipesRequest: { participantId, swipes: { mealId, vote }[] }
```

## Common Modification Patterns

### Add API Endpoint
1. Add route handler in `server/src/routes/[entity].ts`
2. Add types in `server/src/types.ts` if needed
3. Register route in `server/src/index.ts` (app.use('/api/...', ...Router))
4. Add client method in `client/src/api/client.ts`

### Add Database Query
Use helpers from `server/src/db/schema.ts`:
- `getOne<T>(sql, params)` - single row
- `getAll<T>(sql, params)` - multiple rows
- `runQuery(sql, params)` - insert/update/delete (auto-saves)

### Add Frontend Page
1. Create component in `client/src/pages/[Name].tsx`
2. Add route in `client/src/App.tsx` router
3. Add navigation link if needed

### Modify Session Flow
- Session creation: `server/src/routes/sessions.ts` POST /api/sessions
- Close session: `server/src/routes/sessions.ts` POST /api/sessions/:id/close
- Join session: `server/src/routes/swipes.ts` POST /api/join/:code
- Submit swipes: `server/src/routes/swipes.ts` POST /api/swipes
- Get results: `server/src/routes/swipes.ts` GET /api/results/:sessionId
- Matching logic: `server/src/services/matching.ts` calculateMatches()
