# MealMatch - Collaborative Meal Decision App

> **Working Title:** MealMatch (suggested alternatives: SwipeSupper, DinnerSync, GrubVote, ChowChoose)

A mobile-first web app that helps groups decide what to eat by swiping left/right on meal ideas. Only meals with group consensus become final options.

---

## Table of Contents

1. [Core Concept](#core-concept)
2. [MVP Scope](#mvp-scope)
3. [User Flows](#user-flows)
4. [Technical Architecture](#technical-architecture)
5. [Data Model](#data-model)
6. [UI/UX Specifications](#uiux-specifications)
7. [Business Logic](#business-logic)
8. [Post-MVP Features](#post-mvp-features)
9. [Technical Decisions](#technical-decisions)
10. [Deployment Strategy](#deployment-strategy)

---

## Core Concept

### Problem
Decision fatigue around meals. Groups waste time debating "what should we eat?" with no structured way to find consensus.

### Solution
- One user (host) maintains a collection of meal ideas
- Host creates a swipe session and shares a public invite link
- Everyone swipes left (no) or right (yes) on each meal
- Results show meals ranked by approval percentage
- Unanimous matches are highlighted; majority-approved meals shown with "X% agreed" badges
- Group picks final meal from the results

### Key Differentiator
Unlike polls or random pickers, this uses the familiar swipe mechanic to make decisions feel low-pressure and even fun.

---

## MVP Scope

### In Scope

**Host Features:**
- Email/password account registration and login
- Create, view, and archive meals (title + optional description)
- Create swipe sessions from their meal collection
- Share public invite link
- Manually close sessions when ready
- View results with full voting breakdown (who voted what)
- See meal metadata (pick counts, usage history)
- Select final meal from results (saved to history)

**Participant Features:**
- Join via public invite link (no account required)
- Enter display name to participate
- Swipe through meals (binary yes/no, no skip option)
- Review all choices before final submit
- Resume swiping if accidentally closed browser (local storage)
- View results after session closes (aggregate only, no individual votes visible)
- Optional account creation prompt after first session

**Session Features:**
- Randomized meal order per participant (prevents position bias)
- Meal pool locked after session creation (no mid-session edits)
- Straight-to-swiping experience (no preview of meals)
- Soft limit: warn host when inviting 10+ people (unanimous matches become unlikely)
- Results calculated with majority threshold + "X% agreed" badges

### Out of Scope for MVP

- Images/photos on meals
- Full recipes (ingredients, steps)
- Shopping list generation
- Tags and filtering
- Playlist-style collections
- Restaurant mode
- Real-time updates during swiping
- Push/email notifications
- Final group vote UI (just show results, discuss externally)
- Offline support
- Rate limiting/abuse prevention

---

## User Flows

### Flow 1: Host Registration & Meal Setup

```
1. Host visits app → Register page
2. Enter email + password → Create account
3. Redirect to dashboard (empty state)
4. Click "Add Meal" → Modal with:
   - Title (required)
   - Description (optional)
5. Save → Meal appears in collection
6. Repeat to build meal library
```

### Flow 2: Creating a Swipe Session

```
1. Host clicks "New Session" from dashboard
2. See all meals (checked by default)
3. Uncheck any meals to exclude
4. (Optional) See warning if collection > 30 meals
5. Click "Create Session"
6. Meal pool is now LOCKED
7. See session page with:
   - Public invite link (copy button)
   - "Close Session" button
   - Status: "Waiting for participants"
```

### Flow 3: Participant Swiping

```
1. Participant opens invite link
2. If session closed → Error: "This session has ended"
3. If session open → Enter display name
4. Begin swiping immediately (no preview)
5. Each card shows: Title + Description (if any)
6. Swipe right = Yes, Swipe left = No (or use buttons)
7. Can navigate back to change previous swipes
8. After last meal → Review screen showing all choices
9. Click "Submit" → Swipes saved to server
10. See "Waiting for results" message
11. If browser closes before submit → Resume from local storage
12. Account creation prompt appears post-submit
```

### Flow 4: Closing Session & Viewing Results

```
1. Host clicks "Close Session"
2. All participants redirected to results page
3. Results show:
   - Unanimous matches highlighted at top
   - All meals ranked by approval percentage
   - "X% agreed" badges on each meal
   - For host only: voting breakdown (who voted what)
4. Host clicks meal to select as final choice
5. Selection saved to history with timestamp
```

### Flow 5: Optional Account Creation (Participant)

```
1. After submitting swipes, participant sees prompt:
   "Want to create your own meal sessions? Create an account."
2. Options: "Create Account" or "Maybe Later"
3. If create → Register form (email + password)
4. After registration → Can now host their own sessions
5. Note: Anonymous swipe history is NOT merged with new account
```

---

## Technical Architecture

### Recommended Stack

**Frontend:**
- React 18 + TypeScript
- Vite (fast dev server, optimized builds)
- TailwindCSS (utility-first, mobile-responsive)
- Framer Motion (for swipe gesture physics)
- React Router v6

**Backend:**
- Express + TypeScript
- Express Session with secure cookies
- bcryptjs for password hashing

**Database:**
- Start with SQLite + sql.js (mirrors NFL app experience)
- Design schema to support future Postgres migration
- Use Railway volumes for persistence if staying with SQLite

**Why This Stack:**
- Proven deployment path on Railway (you've done this before)
- Framer Motion provides production-ready swipe gestures
- TailwindCSS enables rapid mobile-first development
- No new learning curve - leverages your existing knowledge

### Project Structure

```
food-app/
├── client/
│   ├── src/
│   │   ├── api/              # API client
│   │   ├── components/
│   │   │   ├── SwipeCard.tsx
│   │   │   ├── SwipeDeck.tsx
│   │   │   └── ...
│   │   ├── hooks/
│   │   │   ├── useSwipeGesture.ts
│   │   │   └── useLocalStorage.ts
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── SwipeSession.tsx
│   │   │   ├── Results.tsx
│   │   │   └── ...
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── package.json
├── server/
│   ├── src/
│   │   ├── db/
│   │   │   └── schema.ts
│   │   ├── middleware/
│   │   │   └── auth.ts
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── meals.ts
│   │   │   ├── sessions.ts
│   │   │   └── swipes.ts
│   │   ├── services/
│   │   │   └── matching.ts
│   │   └── index.ts
│   └── package.json
├── package.json              # Monorepo scripts
├── railway.json
├── build.sh
├── SPEC.MD
└── CLAUDE.md
```

---

## Data Model

### Entity Relationship

```
hosts (accounts)
  │
  ├── meals (1:many)
  │     └── archived: boolean
  │
  └── sessions (1:many)
        │
        ├── session_meals (many:many with meals)
        │
        ├── participants (1:many)
        │     │
        │     └── swipes (1:many, links to session_meals)
        │
        └── selected_meal_id (nullable FK to meals)
```

### Schema Design

```sql
-- Host accounts
CREATE TABLE hosts (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Meals owned by hosts
-- Note: 'type' field supports future restaurant mode
CREATE TABLE meals (
  id TEXT PRIMARY KEY,
  host_id TEXT NOT NULL REFERENCES hosts(id),
  title TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'meal',  -- 'meal' | 'restaurant' (future)
  archived INTEGER DEFAULT 0,
  pick_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Swipe sessions
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  host_id TEXT NOT NULL REFERENCES hosts(id),
  invite_code TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'open',  -- 'open' | 'closed'
  selected_meal_id TEXT REFERENCES meals(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME
);

-- Junction table: which meals are in which session
CREATE TABLE session_meals (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  meal_id TEXT NOT NULL REFERENCES meals(id),
  display_order INTEGER  -- For deterministic ordering if needed
);

-- Participants in a session
CREATE TABLE participants (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  display_name TEXT NOT NULL,
  host_id TEXT REFERENCES hosts(id),  -- NULL if anonymous
  submitted INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Individual swipes
CREATE TABLE swipes (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  session_meal_id TEXT NOT NULL REFERENCES session_meals(id),
  vote INTEGER NOT NULL,  -- 1 = yes, 0 = no
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(participant_id, session_meal_id)
);

-- Session history (what was selected)
CREATE TABLE session_history (
  id TEXT PRIMARY KEY,
  session_id TEXT UNIQUE NOT NULL REFERENCES sessions(id),
  selected_meal_id TEXT NOT NULL REFERENCES meals(id),
  selected_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Design Notes

1. **Type flag on meals:** Supports future restaurant mode without schema changes
2. **Archived vs deleted:** Soft delete preserves historical data integrity
3. **host_id on participants:** NULL means anonymous, populated if logged in
4. **pick_count on meals:** Denormalized for quick host metadata display
5. **invite_code:** Short, shareable code (e.g., "TACO42") for URLs

---

## UI/UX Specifications

### Design Principles

1. **Mobile-first:** Primary use case is swiping on phones
2. **Thumb-friendly:** Key actions in bottom 50% of screen
3. **Minimal chrome:** Cards should dominate the viewport
4. **Clear feedback:** Obvious visual response to swipes
5. **Accessible:** Good color contrast, semantic HTML, keyboard nav for buttons

### Swipe Interface

**Card Design:**
- Full-width on mobile (with padding)
- Centered title, description below
- Solid background color (no images in MVP)
- Subtle shadow for depth
- Corner indicator showing progress (3/12)

**Gesture Behavior:**
- Drag threshold: 100px before card commits
- Velocity threshold: Fast swipe commits regardless of distance
- Visual feedback: Card rotates slightly in swipe direction
- Color tint: Green for right, red for left (subtle)
- Return animation if threshold not met

**Button Fallback:**
- Two large buttons below card
- "Nope" (left) and "Yum" (right)
- Same visual feedback as swipe
- Essential for desktop and accessibility

**Review Screen:**
- List of all meals with Yes/No indicators
- Tap any meal to flip its vote
- Clear "Submit" button at bottom
- Back button to return to swiping

### Results Interface

**For All Participants:**
- Unanimous matches at top with celebration styling
- All meals listed with approval percentage bars
- "X/Y agreed" badges (e.g., "3/4 agreed")
- Selected meal highlighted after host picks

**For Host Only (Additional):**
- Expandable voting breakdown per meal
- Shows each participant's vote
- "Select This" button on each meal
- Dashboard link to create new session

### Responsive Breakpoints

- **Mobile (<640px):** Full-screen cards, stacked layout
- **Tablet (640-1024px):** Centered card with more padding
- **Desktop (>1024px):** Card in center column, nav visible

---

## Business Logic

### Matching Algorithm

```typescript
interface MatchResult {
  mealId: string;
  title: string;
  yesCount: number;
  totalVotes: number;
  percentage: number;
  isUnanimous: boolean;
  voters: { name: string; vote: boolean }[];  // Host only
}

function calculateResults(sessionId: string): MatchResult[] {
  // 1. Get all submitted participants
  // 2. For each meal in session:
  //    - Count yes votes
  //    - Calculate percentage
  //    - Flag if unanimous (100%)
  // 3. Sort by percentage descending
  // 4. Return ranked list
}
```

### Session State Machine

```
OPEN (default)
  │
  ├── Participants can join
  ├── Participants can swipe
  ├── Host can view status
  │
  └── Host clicks "Close Session"
        │
        ▼
CLOSED
  │
  ├── New participants see error
  ├── Results calculated and visible
  ├── Host can select final meal
  │
  └── Host selects meal
        │
        ▼
COMPLETED (session has selected_meal_id)
```

### Invite Code Generation

```typescript
function generateInviteCode(): string {
  // 6 alphanumeric characters, uppercase
  // Avoid ambiguous characters (0/O, 1/I/L)
  // Examples: "TACO42", "PIZZA7", "GRUB3X"
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
}
```

### Local Storage Recovery

```typescript
// Key format: swipe_session_{sessionId}_{participantName}
interface SwipeProgress {
  sessionId: string;
  participantName: string;
  swipes: Record<string, boolean>;  // mealId -> vote
  currentIndex: number;
  savedAt: number;
}

// On page load:
// 1. Check localStorage for matching session
// 2. If found and session still open, offer to resume
// 3. On each swipe, update localStorage
// 4. Clear localStorage after successful submit
```

---

## Post-MVP Features

### Phase 2: Rich Meals

- Image upload for meals (consider Cloudinary or S3)
- Full recipes: ingredients list, cooking steps
- Auto-generate shopping list from selected meal
- Prep time and difficulty metadata

### Phase 3: Organization

- **Tags:** breakfast, dinner, vegetarian, quick, etc.
- **Playlists:** Curated collections like "Weeknight Quick" or "Date Night"
- Filter sessions by tags/playlists
- Smart suggestions based on recent selections

### Phase 4: Group Vote

- After results shown, secondary vote on top matches
- Each person picks their #1 from matches
- Most votes wins (tie = random)

### Phase 5: Restaurant Mode

- Unified entity model (meals already have `type` field)
- Additional fields: address, hours, price range
- Location-aware suggestions (if user grants permission)
- Link to Google Maps / Yelp

### Phase 6: Notifications

- Email when invited to session
- Reminder if incomplete after X hours
- Results ready notification

### Phase 7: Templates

- Save session configuration for reuse
- "Friday Dinner" template with same meal pool
- Quick-create new session from template

---

## Technical Decisions

### Why Email/Password over OAuth

- Simpler implementation (no external dependencies)
- Matches your NFL app pattern
- Full control over user data
- OAuth can be added later as enhancement

### Why SQLite to Start

- Zero external service dependencies
- Fast local development
- Proven Railway deployment with volumes
- Schema designed for Postgres migration if needed

### Why Framer Motion for Swipes

- Production-ready gesture handling
- Physics-based animations feel natural
- Active maintenance and community
- TypeScript support

### SQLite Boolean Handling (from NFL app lessons)

Always use ternary operators when rendering based on SQLite booleans:

```tsx
// WRONG - renders "0" when archived is 0
{meal.archived && <Badge>Archived</Badge>}

// CORRECT
{meal.archived ? <Badge>Archived</Badge> : null}
```

### Session Cookie Configuration (from NFL app lessons)

```typescript
// Production: same-origin, no CORS needed
if (process.env.NODE_ENV !== 'production') {
  app.use(cors({
    origin: ['http://localhost:5173'],
    credentials: true,
  }));
}

// Trust Railway's reverse proxy
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7,  // 7 days
  },
}));
```

---

## Deployment Strategy

### Railway Configuration

**Build (same pattern as NFL app):**

```json
// railway.json
{
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm install && bash build.sh"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

**Critical Middleware Order:**

```typescript
// 1. Static files FIRST (before CORS)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(clientPath));
}

// 2. CORS only in development
if (process.env.NODE_ENV !== 'production') {
  app.use(cors({ ... }));
}

// 3. Body parsers
app.use(express.json());

// 4. Session
app.use(session({ ... }));

// 5. API routes
app.use('/api/...', ...);

// 6. SPA fallback LAST
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => res.sendFile(indexPath));
}
```

### Environment Variables

```bash
NODE_ENV=production
SESSION_SECRET=<64-char-hex>
DATABASE_PATH=/data/database.db  # If using Railway volumes
```

### Volumes (if staying with SQLite)

1. Railway Dashboard → Service → Settings
2. Add Volume → Mount path: `/data`
3. Set `DATABASE_PATH=/data/database.db`
4. Redeploy

---

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create host account |
| POST | `/api/auth/login` | Login host |
| POST | `/api/auth/logout` | Logout host |
| GET | `/api/auth/me` | Get current host |

### Meals

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/meals` | List host's meals (excludes archived) |
| POST | `/api/meals` | Create meal |
| PATCH | `/api/meals/:id` | Update meal |
| DELETE | `/api/meals/:id` | Archive meal (soft delete) |

### Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sessions` | List host's sessions |
| POST | `/api/sessions` | Create session with meal IDs |
| GET | `/api/sessions/:id` | Get session details (host view) |
| POST | `/api/sessions/:id/close` | Close session |
| POST | `/api/sessions/:id/select` | Select final meal |

### Participant Flow

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/join/:inviteCode` | Get session for swiping (public) |
| POST | `/api/join/:inviteCode` | Join session with display name |
| POST | `/api/swipes/:sessionId` | Submit all swipes |
| GET | `/api/results/:sessionId` | Get results (after close) |

---

## Open Questions / Future Considerations

1. **Image hosting:** When adding images post-MVP, evaluate Cloudinary (easy) vs S3 (cheaper at scale)

2. **Database migration:** If scaling beyond hobby use, consider Railway Postgres addon or Neon free tier

3. **Real-time updates:** If adding live features later, consider Socket.io or Server-Sent Events

4. **PWA potential:** Could add service worker for home screen install and faster loads

5. **Analytics:** If needed later, design events now (session_created, swipe_completed, meal_selected)

---

## Appendix: Name Suggestions

Since you need a name, here are some options:

**Playful:**
- SwipeSupper
- GrubMatch
- ChowChoose
- NomNomVote

**Clean/Modern:**
- MealMatch
- DinnerSync
- FoodFlip
- TableVote

**Descriptive:**
- WhatToEat
- GroupGrub
- MealConsensus

My recommendation: **MealMatch** - clear, memorable, describes the core mechanic.

---

*Last updated: January 2026*
*Spec version: 1.0 (MVP)*
