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
