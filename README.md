# LingoGen 💬

> **LingoGen** is a real-time, fully anonymous language exchange matchmaking platform. It allows language learners from around the globe to connect instantly, pair based on native/target language compatibility, discuss shared interests, and practice speaking safely without registering.

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [How It Works](#2-how-it-works)
    - [Smart Matchmaking Engine](#smart-matchmaking-engine)
    - [WebSocket Communication Lifecycle](#websocket-communication-lifecycle)
    - [Guest Mode & 3-Chat Limit](#guest-mode--3-chat-limit)
    - [Account Upgrading Flow](#account-upgrading-flow)
3. [Project Directory Structure](#3-project-directory-structure)
4. [API & WebSocket Specifications](#4-api--websocket-specifications)
    - [REST API Routes](#rest-api-routes)
    - [WebSocket Protocols](#websocket-protocols)
5. [Local Development Setup](#5-local-development-setup)
    - [Prerequisites](#prerequisites)
    - [Backend Setup](#backend-setup)
    - [Frontend Setup](#frontend-setup)
    - [Running Locally](#running-locally)
6. [Production Deployment](#6-production-deployment)

---

## 1. System Architecture

LingoGen is built using a modern decoupled architecture designed to deliver sub-100ms message delivery times and resilient connection handling.

```mermaid
flowchart TD
    subgraph Frontend [Next.js App Router Client]
        UI[Chat Interface / Pages]
        Socket[AnonSocket Client]
    end

    subgraph Backend [FastAPI Backend Server]
        FastAPI[FastAPI Gateway]
        RouterWS[WebSocket Router]
        RouterAuth[Auth Router]
        RouterProfile[Profile Router]
        Matchmaker[Matchmaking Engine]
        DBService[DB Service]
        RedisService[Redis Service]
    end

    subgraph Infrastructure [Data & Messaging Layer]
        Redis[(Redis Cache & Queue)]
        Postgres[(PostgreSQL Database)]
        Resend[Resend Email API]
    end

    UI -->|API Requests| RouterAuth
    UI -->|API Requests| RouterProfile
    Socket <-->|Persistent WS Connection| RouterWS
    
    RouterAuth --> DBService
    RouterAuth --> RedisService
    RouterAuth --> Resend
    RouterProfile --> DBService
    RouterWS --> Matchmaker
    
    Matchmaker --> RedisService
    Matchmaker --> DBService
    
    DBService --> Postgres
    RedisService --> Redis
```

### Tech Stack Details
- **Frontend:** Next.js 15 (App Router, React 19, TypeScript), Vanilla CSS for a custom lightweight, pencil-drawn design aesthetic.
- **Backend:** FastAPI (Python 3.12+), Uvicorn, SQLAlchemy (Async pg).
- **Caching & Real-time Coordination:** Redis (for live presence, matchmaking queues, typing status, and message broker).
- **Database:** PostgreSQL (for permanent user profiles, registration credentials, and message history archives).
- **Communication:** WebSockets (duplex real-time events) and Resend API (for verification emails).

---

## 2. How It Works

### Smart Matchmaking Engine

The matchmaking engine in [backend/services/matchmaking.py](file:///home/lazy/Desktop/LingoGen/backend/services/matchmaking.py) matches online users based on an interactive language exchange scoring algorithm.

When a user triggers `find_match` on the client, they join a Redis sorted set queue sorted by join time. The engine calculates compatibility scores between the searching user and candidate profiles:

1. **Language Exchange Compatibility (+50 points):** A perfect native-learning cross-match. If User A's Native Language is User B's Learning Language **and** User A's Learning Language is User B's Native Language.
2. **Shared Interests Alignment (+10 points per shared interest):** Checked against 30 predefined interest tags (e.g., Cooking, Tech, Coding, Anime, Philosophy).
3. **Interaction Intent Match (+20 points):** Matches users looking for the same type of exchange (e.g., Casual Chat, Exam Prep, etc.).
4. **Age Proximity (+5 points):** Awarded if users are within 5 years of age.

```
Score = (Perfect Language Swap * 50) + (Common Interests Count * 10) + (Intent Match * 20) + (Age Proximity * 5)
```

#### Queue Fallback Logic
* To avoid endless queues, if candidates exist but no scored match is found (compatibility score equals `0`), the candidate who has **waited the longest** is paired if they have been in the queue for **longer than 5 seconds**.
* When a match is successfully made, a transaction-safe pipeline executes `zrem` to extract both users from the queue atomically, preventing double-matching.

---

### WebSocket Communication Lifecycle

Real-time interactions are controlled via a single WebSocket endpoint `/ws` managed in [backend/routers/ws.py](file:///home/lazy/Desktop/LingoGen/backend/routers/ws.py).

```
[Client]                                                [Backend Server]
   │                                                           │
   ├─────────── WS Connect (token=<jwt>) ──────────────────────>│ (Accept & Verify JWT)
   ├─────────── send: {"type": "find_match"} ─────────────────>│ (Add to Redis queue)
   │<────────── recv: {"type": "searching", ...} ──────────────┤
   │                                                           │ *Match Found*
   │<────────── recv: {"type": "matched", ...} ────────────────┤ (Send Partner details + Icebreaker)
   │                                                           │
   ├─────────── send: {"type": "message", "text": "Hi"} ──────>│ (Save to Postgres DB)
   │<────────── recv: {"type": "message", "sender": "me", ...} ┤ (Echo back to sender)
   │<────────── (to partner) "sender": "stranger" ─────────────┤ (Deliver to partner)
   │                                                           │
   ├─────────── send: {"type": "typing", "is_typing": true} ──>│ (Store typing status in Redis)
   │<────────── (to partner) typing update ────────────────────┤
   │                                                           │
   ├─────────── send: {"type": "end_chat"} ───────────────────>│ (Clean up session, close active sockets)
   │<────────── recv: {"type": "chat_ended"} ──────────────────┤
   │<────────── (to partner) recv: {"type": "partner_left"} ───┤
```

- **Reconnection Resiliency:** If a user loses internet connectivity temporarily, the frontend [lib/websocket.ts](file:///home/lazy/Desktop/LingoGen/lib/websocket.ts) client retries with an exponential backoff. The backend caches active session states. Upon reconnecting, the backend immediately returns the active partner's public profile, restores up to 50 items of historical conversation messages, and restores the chat state seamlessly.
- **Heartbeat & Pings:** The server coordinates a 20-second ping/pong heartbeat to maintain connections, keeping active socket instances alive through reverse proxies (e.g. Render, Nginx).

---

### Guest Mode & 3-Chat Limit

To enable zero-friction entries, LingoGen supports an ephemeral **Guest Mode**.
1. Clicking **Start Practice** on the landing page immediately hits `POST /auth/guest` which provisions an anonymous UUID, saves a guest record in the DB, and returns a temporary authentication JWT.
2. The user bypasses the onboarding setup wizard and can immediately join the matchmaking pool.
3. Every time a chat session is successfully created (`try_create_session` in `matchmaking.py`), the backend increments the guest's `chat_count` counter.
4. Once `chat_count >= 3`, the WebSocket router will reject new `find_match` requests and transmit a `registration_required` event payload to trigger an upgrade modal.

---

### Account Upgrading Flow

When a guest upgrades to a registered account (via Google OAuth 2.0 or Email/Password):
- **Email Upgrades:** The backend validates email ownership using a 6-digit verification code sent via [backend/services/email_service.py](file:///home/lazy/Desktop/LingoGen/backend/services/email_service.py). After verification, the guest's db row is updated with the password hash and the `is_guest` flag is disabled.
- **Session Migration:** The backend automatically migrates the guest user's profile configuration, age, target languages, and interests list to the new permanent profile, keeping all setup wizard options intact.

---

## 3. Project Directory Structure

```
LingoGen/
├── app/                        # Next.js App Router Pages
│   ├── layout.tsx              # Root HTML container and Google OAuth script loader
│   ├── page.tsx                # Home Landing Page
│   ├── auth/                   # Email/Google Auth Forms (Sign In / Sign Up)
│   ├── setup/                  # 3-Step Profile Wizard (Interests, Languages, Bio)
│   ├── chat/                   # Interactive Real-Time WebSocket Chat Page
│   ├── profile/                # User Profile viewer & editor
│   └── globals.css             # Theme style variables & custom pencil design system
├── components/                 # Shared React Components
│   ├── AuthProvider.tsx        # Authentication wrapper providing profile & login utilities
│   ├── Navbar.tsx              # Site Header & Navigation Panel
│   ├── MessageBubble.tsx       # Formatted chat messages with bubble styling
│   ├── MatchmakingSpinner.tsx  # Dynamic pencil-sketch matchmaking state animation
│   └── InterestSelector.tsx    # Responsive grid panel to choose interest tags
├── lib/                        # Client helper APIs
│   ├── api.ts                  # Fetch API wrapper with 401/403 path guards and JWT parsing
│   ├── websocket.ts            # Client-side WebSocket class (AnonSocket) with reconnect loops
│   └── constants.ts            # Core lists for interests, languages, and settings
└── backend/                    # FastAPI Server Code
    ├── main.py                 # Core application initialization, CORS, & routers mounting
    ├── config.py               # Environment configuration loader via Pydantic Settings
    ├── database.py             # SQLAlchemy Async Engine, Sessions, and Auto-Migrations
    ├── Dockerfile              # Docker container containerization parameters
    ├── requirements.txt        # Backend dependencies manifest
    ├── models/                 # SQLAlchemy schemas & Pydantic response models
    │   ├── db_models.py        # Users and Messages tables schemas
    │   ├── user.py             # UserProfile validation schemas
    │   └── chat.py             # Chat events and status structures
    ├── services/               # Business Logic Providers
    │   ├── db_service.py       # SQL helpers for user profiles & persistent messages
    │   ├── redis_service.py    # Async Redis helpers for queues, sessions, & presence
    │   ├── auth_service.py     # JWT encode/decode, Google ID verification, password hashing
    │   ├── email_service.py    # Resend email API client for transactional verification codes
    │   └── matchmaking.py      # Matchmaking loop calculations & session transitions
    └── routers/                # FastAPI Endpoints
        ├── auth.py             # Google Auth, Verification Codes, Sign-In, & Guest Upgrades
        ├── profile.py          # Own Profile endpoints & online counts retrieval
        └── ws.py               # WebSocket routing, connection cycles, & messaging loops
```

---

## 4. API & WebSocket Specifications

### REST API Routes

All JSON payloads should be sent with `Content-Type: application/json`. Authenticaton requires a bearer header: `Authorization: Bearer <jwt>`.

| Route | Method | Auth Required | Description |
|---|---|---|---|
| `/auth/google` | `POST` | No | Exchange Google ID token for JWT token |
| `/auth/send-code` | `POST` | No | Generate & send email verification code (Rate-Limited) |
| `/auth/verify-code` | `POST` | No | Verify 6-digit code, returns validation token |
| `/auth/register` | `POST` | No | Register new email account using validation token |
| `/auth/login` | `POST` | No | Email & Password Sign In |
| `/auth/guest` | `POST` | No | Create an ephemeral guest session |
| `/auth/upgrade` | `POST` | Yes | Upgrade guest account to permanent status |
| `/api/profile/me` | `GET` | Yes | Get currently authenticated profile |
| `/api/profile/me` | `PATCH` | Yes | Edit profile fields (Languages, interests, etc.) |
| `/api/online-count`| `GET` | No | Get total online users & search queue counts |
| `/health` | `GET` | No | Application health status check |

---

### WebSocket Protocols

WebSocket endpoint expects parameters in the query string:
`ws://<backend-host>/ws?token=<JWT_TOKEN>`

#### Client Events (Client → Server)
* **Start Matchmaking:**
  ```json
  {"type": "find_match"}
  ```
* **Cancel Search:**
  ```json
  {"type": "cancel_match"}
  ```
* **Send Message:**
  ```json
  {"type": "message", "text": "Message content"}
  ```
* **Send Typing Status:**
  ```json
  {"type": "typing", "is_typing": true}
  ```
* **Add Emoji Reaction:**
  ```json
  {"type": "react", "message_id": "UUID", "reaction": "👍"}
  ```
* **Close Conversation:**
  ```json
  {"type": "end_chat"}
  ```
* **Keep Alive:**
  ```json
  {"type": "ping"}
  ```

#### Server Events (Server → Client)
* **Initial Welcome:**
  ```json
  {"type": "connected", "user": { ... }, "online_count": 10}
  ```
* **Reconnection restored:**
  ```json
  {"type": "reconnected", "session_id": "...", "partner": { ... }, "messages": [ ... ], "user": { ... }, "online_count": 10}
  ```
* **Search In-Progress:**
  ```json
  {"type": "searching", "queue_count": 2}
  ```
* **Match Partner Found:**
  ```json
  {"type": "matched", "session_id": "...", "partner": { ... }, "common_interests": ["Coding"], "ice_breaker": "..."}
  ```
* **Incoming Message:**
  ```json
  {"type": "message", "id": "...", "session_id": "...", "text": "...", "timestamp": 171822394, "sender": "stranger|me"}
  ```
* **Partner Typing Indicator:**
  ```json
  {"type": "typing", "is_typing": true}
  ```
* **Partner Reaction Broadcast:**
  ```json
  {"type": "reaction", "message_id": "...", "reaction": "👍"}
  ```
* **Partner Closed Connection:**
  ```json
  {"type": "partner_left"}
  ```
* **Guest Limit Reached:**
  ```json
  {"type": "registration_required", "message": "You have reached the limit of 3 guest chats. Please register to continue matching."}
  ```

---

## 5. Local Development Setup

### Prerequisites
Make sure you have installed:
- **Python 3.10+**
- **Node.js 18+**
- **Redis**

### Backend Setup

1. **Enter directory & configure environment:**
   ```bash
   cd backend
   cp .env.example .env
   ```
2. **Edit `.env` variables:**
   ```env
   # PostgreSQL Connection (local dev port 5433 or default 5432)
   DATABASE_URL="postgresql+asyncpg://postgres:password@localhost:5432/anonconnect"
   
   # Redis connection endpoint
   REDIS_URL="redis://localhost:6379/0"
   
   # Random JWT signing key
   JWT_SECRET="generate-a-secure-random-secret"
   
   # CORS settings
   FRONTEND_URL="http://localhost:3000"
   
   # Google Auth ID Client
   GOOGLE_CLIENT_ID="your-google-oauth-client-id"
   
   # Resend Email Configuration (For code verifications)
   RESEND_API_KEY="re_yourApiKey"
   SMTP_FROM_EMAIL="noreply@yourdomain.com"
   ```
3. **Install dependencies and activate venv:**
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

### Frontend Setup

1. **Navigate to the workspace root and copy environment files:**
   ```bash
   cd ..
   cp .env.local.example .env.local
   ```
2. **Configure `.env.local` parameters:**
   ```env
   NEXT_PUBLIC_API_URL="http://localhost:8000"
   NEXT_PUBLIC_WS_URL="ws://localhost:8000"
   NEXT_PUBLIC_GOOGLE_CLIENT_ID="your-google-oauth-client-id"
   ```
3. **Install node dependencies:**
   ```bash
   npm install
   ```

### Running Locally

To start the application, run the following processes in separate terminals:

1. **Start Redis Server:**
   ```bash
   redis-server
   ```
2. **Start PostgreSQL database:** Ensure your local PostgreSQL instance is running with the credentials configured in `DATABASE_URL`.
3. **Run FastAPI Backend:**
   ```bash
   cd backend
   source .venv/bin/activate
   uvicorn main:app --reload --port 8000
   ```
4. **Run Next.js Frontend:**
   ```bash
   # From root folder
   npm run dev
   ```
   Open **http://localhost:3000** in your browser.

---

## 6. Production Deployment

LingoGen is optimized for deployment via **Render** (backend services) and **Vercel** (frontend application).

### Render Backend Deploy (FastAPI + Postgres + Redis)

Use the predefined configuration inside [render.yaml](file:///home/lazy/Desktop/LingoGen/render.yaml) to automatically launch the stack on Render.

1. Create a new **Blueprint Instance** on Render.
2. Link the repository.
3. Configure the following environment variables:
    * `DATABASE_URL` (Auto-generated by Render's Postgres instance)
    * `REDIS_URL` (Auto-generated by Render's Redis instance)
    * `JWT_SECRET` (Auto-generated by Render)
    * `FRONTEND_URL` (The live URL of your Vercel deployment)
    * `GOOGLE_CLIENT_ID` (Your production Google OAuth application ID)
    * `RESEND_API_KEY` (Your Resend transactional mail key)
    * `SMTP_FROM_EMAIL` (Your validated Resend sender address)
    * `DEBUG` -> `False`

### Vercel Frontend Deploy (Next.js)

1. Create a new project in Vercel.
2. Choose the root folder containing the Next.js setup.
3. Configure the **Build & Development Settings** and add the environment variables:
    * `NEXT_PUBLIC_API_URL` -> Link to your backend Render Service (`https://...onrender.com`)
    * `NEXT_PUBLIC_WS_URL` -> Link to your backend Render WS (`wss://...onrender.com`)
    * `NEXT_PUBLIC_GOOGLE_CLIENT_ID` -> Your production Google OAuth application ID
4. Click **Deploy**. Vercel will build the React bundles and host them on globally optimized CDNs.
