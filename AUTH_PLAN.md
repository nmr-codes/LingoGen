# LingoGen — Full Authentication System Implementation Plan

> **Purpose:** This document is a complete, self-contained instruction set for an AI to implement Google OAuth Sign Up/Sign In and Email Authentication with email verification code for the LingoGen project. Read every section carefully before writing any code.

---

## 📋 REQUIREMENTS — What the Human Must Provide Before Starting

Before executing this plan, the human must provide the following credentials and configure the following services. **Do NOT use placeholder values — every value below must be real and working.**

### 1. Google OAuth 2.0 Credentials

Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → Create OAuth 2.0 Client ID.

**You need:**

| Value | Where to Get It | Where It Goes |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Google Cloud Console → OAuth 2.0 Client IDs → Client ID | Frontend: `.env.local` as `NEXT_PUBLIC_GOOGLE_CLIENT_ID` AND Backend: `backend/.env` as `GOOGLE_CLIENT_ID` |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console → OAuth 2.0 Client IDs → Client secret | **NOT needed** — we use Google Identity Services (GIS) which uses ID token verification, not server-side OAuth flow |

**Required Google Console Configuration:**
- **Application type:** Web application
- **Authorized JavaScript origins:** `http://localhost:3000` (dev) AND your production domain (e.g., `https://lingo-gen-rho.vercel.app`)
- **Authorized redirect URIs:** `http://localhost:3000` (dev) AND your production domain
- **OAuth consent screen:** Configure with app name "LingoGen", add scopes: `email`, `profile`, `openid`

### 2. Email Service Provider (SMTP) for Verification Codes

You need an SMTP service to send verification code emails. Choose ONE of the following:

**Option A — Gmail SMTP (free, easiest for development):**

| Value | How to Get It |
|---|---|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | Your Gmail address (e.g., `lingogen.app@gmail.com`) |
| `SMTP_PASSWORD` | Go to [Google Account → Security → 2-Step Verification → App Passwords](https://myaccount.google.com/apppasswords) → Generate an app password for "Mail". Use the 16-character password generated. **NOT your Gmail password.** |
| `SMTP_FROM_NAME` | `LingoGen` |
| `SMTP_FROM_EMAIL` | Same as `SMTP_USER` |

**Option B — Resend (recommended for production, free tier = 100 emails/day):**

| Value | How to Get It |
|---|---|
| `RESEND_API_KEY` | Sign up at [resend.com](https://resend.com) → API Keys → Create API Key |
| `SMTP_FROM_EMAIL` | `noreply@yourdomain.com` (requires DNS verification of your domain in Resend) |

**Option C — Any SMTP Provider (SendGrid, Mailgun, AWS SES, etc.):**

| Value | Description |
|---|---|
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | SMTP port (usually `587` for TLS or `465` for SSL) |
| `SMTP_USER` | SMTP username/email |
| `SMTP_PASSWORD` | SMTP password or API key |
| `SMTP_FROM_NAME` | Display name in emails (e.g., `LingoGen`) |
| `SMTP_FROM_EMAIL` | Sender email address |

### 3. Environment Variables Summary

**Frontend (`/.env.local`)** — Add/verify these values exist:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<your-google-client-id>.apps.googleusercontent.com
```

**Backend (`/backend/.env`)** — Add these NEW values alongside existing ones:
```env
# Existing (verify they are set)
REDIS_URL=redis://localhost:6379/0
JWT_SECRET=<generate-with: openssl rand -hex 32>
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=10080
GOOGLE_CLIENT_ID=<your-google-client-id>.apps.googleusercontent.com
FRONTEND_URL=http://localhost:3000
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5433/anonconnect

# NEW — Email/SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<your-email>
SMTP_PASSWORD=<your-app-password>
SMTP_FROM_NAME=LingoGen
SMTP_FROM_EMAIL=<your-email>
SMTP_USE_TLS=true
```

### 4. Infrastructure Prerequisites

The following must already be running before starting development:

- **PostgreSQL** — via `docker-compose up -d` from project root (port 5433)
- **Redis** — running locally on port 6379 OR use fakeredis (auto-fallback exists)
- **Node.js** — v18+ installed
- **Python** — 3.11+ installed with venv at `backend/.venv`

---

## 🏗️ PROJECT CONTEXT — Understand Before Coding

### Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend Framework | Next.js (App Router) | 16.2.9 |
| Frontend Language | TypeScript | 5.x |
| React | React | 19.2.4 |
| Backend Framework | FastAPI | ≥0.115.0 |
| Database | PostgreSQL (via SQLAlchemy + asyncpg) | 15 |
| Cache/Realtime | Redis (via redis-py async) | ≥5.2.0 |
| Auth Tokens | JWT (python-jose) | ≥3.3.0 |
| Password Hashing | bcrypt | via passlib |
| Google Auth | google-auth library | ≥2.37.0 |
| Frontend Hosting | Vercel | — |
| Backend Hosting | Render | — |

### Existing File Structure (Relevant to Auth)

```
LingoGen/
├── app/
│   ├── auth/
│   │   └── page.tsx              ← Auth page (Sign In / Sign Up UI)
│   ├── layout.tsx                ← Root layout with AuthProvider + Navbar
│   └── globals.css               ← All CSS
├── components/
│   ├── AuthProvider.tsx          ← React context for auth state
│   └── Navbar.tsx                ← Navigation bar
├── lib/
│   ├── api.ts                    ← Frontend API client (all REST calls)
│   ├── auth.ts                   ← Firebase auth helpers (LEGACY — will be removed)
│   └── firebase.ts               ← Firebase config (LEGACY — will be removed)
├── backend/
│   ├── config.py                 ← Pydantic Settings model
│   ├── database.py               ← SQLAlchemy async engine + session
│   ├── main.py                   ← FastAPI app + CORS + router mounting
│   ├── models/
│   │   ├── db_models.py          ← SQLAlchemy ORM models (UserDB, MessageDB)
│   │   └── user.py               ← Pydantic request/response models
│   ├── routers/
│   │   ├── auth.py               ← Auth endpoints (/auth/google, /auth/login, /auth/register, /auth/guest, /auth/upgrade)
│   │   ├── profile.py            ← Profile CRUD
│   │   └── ws.py                 ← WebSocket chat
│   └── services/
│       ├── auth_service.py       ← JWT + Google token verification + password hashing
│       ├── db_service.py         ← Database CRUD operations
│       └── redis_service.py      ← Redis operations
├── .env.local                    ← Frontend env vars
├── backend/.env                  ← Backend env vars
├── docker-compose.yml            ← PostgreSQL container
└── package.json                  ← npm dependencies (includes firebase — LEGACY)
```

### Current Auth System State

The project currently has a **partially-working** auth system:

1. **Google OAuth** — Uses Google Identity Services (GIS) on frontend. The frontend loads the `https://accounts.google.com/gsi/client` script, renders a Google button, and sends the ID token to `POST /auth/google` on the backend. The backend verifies the token using `google.oauth2.id_token.verify_oauth2_token()`. **This works but has a rendering bug** where the Google button disappears on tab changes.

2. **Email/Password** — Uses plain email + password. `POST /auth/register` creates a new user with bcrypt-hashed password. `POST /auth/login` verifies credentials. **There is NO email verification** — anyone can register with any email address, even fake ones.

3. **Guest Mode** — `POST /auth/guest` creates a temporary guest user. Limited to 3 chats, then shows upgrade modal.

4. **Firebase** — The `lib/firebase.ts` and `lib/auth.ts` files exist but are **LEGACY and NOT actively used by any page**. The app uses its own JWT system. The `firebase` npm package is installed but should eventually be removed. **Do NOT use Firebase for this implementation.** Keep the files but don't integrate with them.

5. **JWT System** — The backend issues JWTs with `HS256` algorithm. Tokens contain `sub` (user UID), `exp`, and `iat`. Tokens are stored in `localStorage` as `ac_token`. The `AuthProvider` component reads the token on mount and calls `GET /api/profile/me` to load the user profile.

### Design System Reference

The auth page follows the design spec from `ABOUT.md` Section 8.2. Key design tokens:

- **Page background:** `--bg` (`#030712`)
- **Card background:** `rgba(11, 19, 41, 0.75)` with glassmorphism
- **Card max-width:** `450px`
- **Border radius:** `--radius-xl` (`24px`) for auth card
- **Primary gradient:** `linear-gradient(135deg, #3B82F6 0%, #10B981 100%)` for buttons
- **Font:** Inter (already loaded in layout.tsx)
- **Error color:** `--danger` (`#EF4444`)
- **Form labels:** Uppercase, `11px`, weight 700, letter-spacing `1.2px`
- **Animations:** `animate-slide-up` class for card entrance

---

## 🎯 IMPLEMENTATION OVERVIEW — What to Build

### Goal

Replace the current "direct email/password" registration with a **verification-code-based email authentication** system, while keeping the existing Google OAuth working (and fixing its rendering bug). The final system should have:

1. **Google Sign Up / Sign In** — One-click via Google Identity Services. Works for both new and returning users.
2. **Email Sign Up** — User enters email → receives 6-digit verification code → enters code → sets password → account created.
3. **Email Sign In** — User enters email + password → authenticated.
4. **Guest Mode** — Unchanged (already works).
5. **Guest Upgrade** — Unchanged conceptually, but the email upgrade path now goes through verification.

### Authentication Flow Diagrams

#### Google Auth Flow (Sign Up & Sign In — Combined)
```
User clicks Google button
    → Google Identity Services popup opens
    → User selects Google account
    → GIS returns ID token (JWT) to frontend callback
    → Frontend sends POST /auth/google { credential: <id_token> }
    → Backend verifies token with google.oauth2.id_token.verify_oauth2_token()
    → If user exists in DB → return JWT + user profile (Sign In)
    → If user does NOT exist → create user row → return JWT + user profile (Sign Up)
    → Frontend stores JWT in localStorage, updates AuthProvider context
    → Redirect: if onboarded=true → /chat, else → /setup
```

#### Email Sign Up Flow (NEW — with verification code)
```
User selects "Sign Up" tab
    → User enters email address
    → User clicks "Send Code"
    → Frontend sends POST /auth/send-code { email, purpose: "signup" }
    → Backend checks if email already registered:
        → If registered → return error "Email already registered. Please sign in."
        → If not registered → generate 6-digit code → store in Redis with 10-min TTL → send email
    → User receives email with 6-digit code
    → User enters code in UI
    → Frontend sends POST /auth/verify-code { email, code, purpose: "signup" }
    → Backend verifies code matches Redis entry
        → If invalid/expired → return error
        → If valid → return { verified: true, verification_token: <temp_jwt> }
    → UI shows password creation form
    → User enters password + confirm password
    → Frontend sends POST /auth/register { email, password, verification_token }
    → Backend verifies verification_token is valid and matches email
    → Backend creates user with hashed password → returns JWT + user profile
    → Frontend stores JWT, updates context → redirect to /setup
```

#### Email Sign In Flow (Unchanged)
```
User selects "Sign In" tab
    → User enters email + password
    → User clicks "Sign In"
    → Frontend sends POST /auth/login { email, password }
    → Backend verifies credentials → returns JWT + user profile
    → Frontend stores JWT, updates context → redirect to /chat (or /setup if not onboarded)
```

---

## 📝 STEP-BY-STEP IMPLEMENTATION

### Phase 1: Backend — New API Endpoints & Email Service

#### Step 1.1: Add SMTP settings to `backend/config.py`

**File:** `backend/config.py`
**Action:** ADD new fields to the `Settings` class.

Add these fields to the existing `Settings` class (do NOT remove any existing fields):

```python
# Email / SMTP
smtp_host: str = "smtp.gmail.com"
smtp_port: int = 587
smtp_user: str = ""
smtp_password: str = ""
smtp_from_name: str = "LingoGen"
smtp_from_email: str = ""
smtp_use_tls: bool = True
```

#### Step 1.2: Create the email service

**File:** `backend/services/email_service.py`
**Action:** CREATE new file.

This service handles sending verification code emails via SMTP. Implementation requirements:

1. Import `smtplib`, `email.mime.multipart.MIMEMultipart`, `email.mime.text.MIMEText`, `email.mime.base.MIMEBase`.
2. Create class `EmailService` with:
   - `async def send_verification_code(self, to_email: str, code: str) -> bool`
     - Build an HTML email with the LingoGen branding.
     - The email subject: `"Your LingoGen Verification Code"`
     - The email body must be an HTML template that:
       - Has a dark background matching the app (`#030712`)
       - Shows the LingoGen name/logo in gradient text
       - Displays the 6-digit code in large, spaced, monospace characters (each digit in its own box)
       - Includes text: "This code will expire in 10 minutes."
       - Includes text: "If you didn't request this code, please ignore this email."
       - Has a footer: "© 2026 LingoGen · Learn & Chat Globally & Anonymously"
     - Send via SMTP using settings from `config.py`
     - Use `smtplib.SMTP` for TLS (port 587) or `smtplib.SMTP_SSL` for SSL (port 465)
     - Run the synchronous SMTP calls in a thread executor using `asyncio.get_event_loop().run_in_executor(None, _send)` to avoid blocking the event loop
     - Return `True` on success, `False` on failure (log the error, don't crash)
3. Create a module-level singleton: `email_service = EmailService()`

**HTML Email Template Design:**
```html
<!-- Key styling for the verification code digits -->
<div style="display: flex; justify-content: center; gap: 8px; margin: 24px 0;">
  <!-- One div per digit: -->
  <div style="
    background: linear-gradient(135deg, #3B82F6 0%, #10B981 100%);
    color: white;
    font-size: 32px;
    font-weight: 800;
    width: 48px;
    height: 56px;
    line-height: 56px;
    text-align: center;
    border-radius: 12px;
    font-family: 'Courier New', monospace;
  ">{digit}</div>
</div>
```

#### Step 1.3: Add verification code storage to Redis

**File:** `backend/services/redis_service.py`
**Action:** ADD new methods to the existing `RedisService` class.

Add these methods to the class (do NOT modify or remove any existing methods):

```python
# ── Email Verification Codes ──────────────────────────
async def store_verification_code(self, email: str, code: str, purpose: str = "signup", ttl: int = 600) -> None:
    """Store a verification code in Redis with a TTL (default 10 minutes)."""
    key = f"verify:{purpose}:{email.lower()}"
    await self.client.set(key, code, ex=ttl)

async def get_verification_code(self, email: str, purpose: str = "signup") -> Optional[str]:
    """Retrieve a stored verification code."""
    key = f"verify:{purpose}:{email.lower()}"
    return await self.client.get(key)

async def delete_verification_code(self, email: str, purpose: str = "signup") -> None:
    """Delete a verification code after successful verification."""
    key = f"verify:{purpose}:{email.lower()}"
    await self.client.delete(key)

async def check_rate_limit(self, email: str, action: str = "send_code", max_attempts: int = 5, window: int = 300) -> bool:
    """Rate limiting: returns True if under limit, False if rate-limited."""
    key = f"rate:{action}:{email.lower()}"
    current = await self.client.get(key)
    if current and int(current) >= max_attempts:
        return False
    pipe = self.client.pipeline()
    pipe.incr(key)
    pipe.expire(key, window)
    await pipe.execute()
    return True
```

#### Step 1.4: Update Pydantic request/response models

**File:** `backend/models/user.py`
**Action:** ADD new request/response models at the end of the file (after existing classes).

```python
class SendCodeRequest(BaseModel):
    email: str
    purpose: Literal["signup", "reset_password"] = "signup"

class SendCodeResponse(BaseModel):
    message: str
    expires_in: int = 600  # seconds

class VerifyCodeRequest(BaseModel):
    email: str
    code: str
    purpose: Literal["signup", "reset_password"] = "signup"

class VerifyCodeResponse(BaseModel):
    verified: bool
    verification_token: str  # Short-lived JWT proving email is verified

class EmailRegisterRequest(BaseModel):
    email: str
    password: str
    verification_token: str  # Must be present and valid
```

**IMPORTANT:** Also keep the existing `EmailAuthRequest` model unchanged — it is still used by the Sign In endpoint.

#### Step 1.5: Add verification token helpers to auth_service

**File:** `backend/services/auth_service.py`
**Action:** ADD new functions (do NOT modify existing functions).

Add these functions after the existing `decode_access_token` function:

```python
def create_verification_token(email: str) -> str:
    """Create a short-lived JWT that proves an email has been verified."""
    settings = _settings()
    expire = datetime.now(timezone.utc) + timedelta(minutes=30)  # 30-minute validity
    payload = {
        "sub": email.lower(),
        "purpose": "email_verification",
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def verify_verification_token(token: str, expected_email: str) -> bool:
    """Verify that a verification token is valid and matches the expected email."""
    settings = _settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        if payload.get("purpose") != "email_verification":
            return False
        if payload.get("sub") != expected_email.lower():
            return False
        return True
    except JWTError:
        return False
```

#### Step 1.6: Create new auth endpoints in the auth router

**File:** `backend/routers/auth.py`
**Action:** MODIFY this file. Add new endpoints and update the existing `/register` endpoint.

**Add at the top of the file (imports):**
```python
import secrets
from services.email_service import email_service
from services.redis_service import redis_service
from services.auth_service import create_verification_token, verify_verification_token
from models.user import SendCodeRequest, SendCodeResponse, VerifyCodeRequest, VerifyCodeResponse, EmailRegisterRequest
```

**Add new endpoint — POST `/send-code`:**

```python
@router.post("/send-code", response_model=SendCodeResponse)
async def send_verification_code(body: SendCodeRequest):
    """
    Send a 6-digit verification code to the user's email.
    Rate-limited to 5 attempts per 5 minutes per email.
    """
    email = body.email.strip().lower()
    
    # Validate email format (basic check)
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid email address."
        )
    
    # Rate limiting
    allowed = await redis_service.check_rate_limit(email, action="send_code", max_attempts=5, window=300)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many code requests. Please wait 5 minutes and try again."
        )
    
    # For signup: check if email is already registered
    if body.purpose == "signup":
        uid = await db_service.get_uid_by_email(email)
        if uid:
            existing = await db_service.get_user(uid)
            if existing:
                user = UserProfile(**existing)
                if not user.is_guest and user.hashed_password:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="This email is already registered. Please sign in instead."
                    )
    
    # Generate 6-digit code
    code = f"{secrets.randbelow(900000) + 100000}"  # Ensures 6 digits (100000-999999)
    
    # Store in Redis with 10-minute TTL
    await redis_service.store_verification_code(email, code, purpose=body.purpose)
    
    # Send email
    sent = await email_service.send_verification_code(email, code)
    if not sent:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send verification email. Please try again later."
        )
    
    return SendCodeResponse(
        message=f"Verification code sent to {email}. Check your inbox.",
        expires_in=600
    )
```

**Add new endpoint — POST `/verify-code`:**

```python
@router.post("/verify-code", response_model=VerifyCodeResponse)
async def verify_code(body: VerifyCodeRequest):
    """
    Verify the 6-digit code entered by the user.
    Returns a verification_token (short-lived JWT) on success.
    """
    email = body.email.strip().lower()
    
    # Rate limiting on verification attempts (prevent brute force)
    allowed = await redis_service.check_rate_limit(email, action="verify_code", max_attempts=10, window=600)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many verification attempts. Please request a new code."
        )
    
    # Retrieve stored code
    stored_code = await redis_service.get_verification_code(email, purpose=body.purpose)
    if not stored_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code expired or not found. Please request a new code."
        )
    
    # Compare codes
    if body.code.strip() != stored_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect verification code. Please try again."
        )
    
    # Code is valid — delete it so it can't be reused
    await redis_service.delete_verification_code(email, purpose=body.purpose)
    
    # Generate a verification token (proves email is verified for the next 30 minutes)
    verification_token = create_verification_token(email)
    
    return VerifyCodeResponse(
        verified=True,
        verification_token=verification_token
    )
```

**REPLACE the existing `/register` endpoint:**

The current `/register` endpoint accepts `EmailAuthRequest` (email + password) without any verification. Replace it with a new version that requires the `verification_token`:

```python
@router.post("/register", response_model=AuthResponse)
async def email_register(body: EmailRegisterRequest):
    """
    Register a new user with email and password.
    Requires a valid verification_token obtained from /verify-code.
    """
    email = body.email.strip().lower()
    
    # Verify the verification token
    if not verify_verification_token(body.verification_token, email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification. Please verify your email again."
        )
    
    # Check if user already exists
    uid = await db_service.get_uid_by_email(email)
    if uid:
        existing = await db_service.get_user(uid)
        if existing:
            user = UserProfile(**existing)
            if user.hashed_password:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Email already registered. Please sign in."
                )
            else:
                # User exists via Google — link password to account
                user.hashed_password = get_password_hash(body.password)
                await db_service.save_user(uid, user.model_dump())
                token = create_access_token(user.uid)
                return AuthResponse(access_token=token, user=user)
    
    # Create new user
    new_uid = str(uuid.uuid4())
    user = UserProfile(
        uid=new_uid,
        email=email,
        display_name=email.split("@")[0],
        hashed_password=get_password_hash(body.password)
    )
    await db_service.save_user(new_uid, user.model_dump())
    
    token = create_access_token(user.uid)
    return AuthResponse(access_token=token, user=user)
```

**Update the existing `/login` endpoint:**

The current `/login` endpoint auto-creates accounts for unregistered emails. **Change it to reject unregistered emails instead:**

```python
@router.post("/login", response_model=AuthResponse)
async def email_login(body: EmailAuthRequest):
    """Login with email and password. Rejects unregistered emails."""
    email = body.email.strip().lower()
    uid = await db_service.get_uid_by_email(email)
    if not uid:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account found with this email. Please sign up first."
        )
    
    existing = await db_service.get_user(uid)
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found."
        )
        
    user = UserProfile(**existing)
    if not user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account uses Google sign-in. Please continue with Google."
        )
        
    if not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password."
        )
        
    token = create_access_token(user.uid)
    return AuthResponse(access_token=token, user=user)
```

**Update the `/upgrade` email path:**

In the existing `upgrade_guest` function, the `elif body.method == "email":` block currently upgrades guest accounts with just email + password. Update it to also require a `verification_token`. This means you need to update the `UpgradeRequest` model to include an optional `verification_token` field:

In `backend/models/user.py`, update:
```python
class UpgradeRequest(BaseModel):
    method: Literal["google", "email"]
    credential: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    verification_token: Optional[str] = None  # NEW — required for email method
```

Then in the upgrade endpoint's email branch, add verification:
```python
elif body.method == "email":
    if not body.email or not body.password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email and password required.")
    if not body.verification_token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email verification required.")
    
    target_email = body.email.strip().lower()
    
    # Verify the email was verified
    if not verify_verification_token(body.verification_token, target_email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification. Please verify your email again."
        )
    
    # Check if email already exists (existing logic, unchanged)
    email_uid = await db_service.get_uid_by_email(target_email)
    if email_uid:
        target_exists = await db_service.get_user(email_uid)
        if target_exists:
            user = UserProfile(**target_exists)
            token = create_access_token(user.uid)
            return AuthResponse(access_token=token, user=user)
    
    # Upgrade the existing guest profile in-place
    guest_profile.email = target_email
    guest_profile.hashed_password = get_password_hash(body.password)
    guest_profile.is_guest = False
    
    await db_service.save_user(uid, guest_profile.model_dump())
    user = guest_profile
    token = create_access_token(user.uid)
    return AuthResponse(access_token=token, user=user)
```

#### Step 1.7: Add `bcrypt` direct import to requirements

**File:** `backend/requirements.txt`
**Action:** ADD `bcrypt` to the list (it's currently used via passlib but imported directly in auth_service.py).

Add this line:
```
bcrypt>=4.0.0
```

The file currently has `passlib[bcrypt]>=1.7.4`. Keep it, but also add `bcrypt` explicitly since `auth_service.py` imports `bcrypt` directly.

#### Step 1.8: Update backend `.env.example`

**File:** `backend/.env.example`
**Action:** ADD the SMTP section.

Add at the bottom:
```env
# Email / SMTP (for verification codes)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-gmail-app-password
SMTP_FROM_NAME=LingoGen
SMTP_FROM_EMAIL=your-email@gmail.com
SMTP_USE_TLS=true
```

---

### Phase 2: Frontend — API Client Updates

#### Step 2.1: Add new API functions to `lib/api.ts`

**File:** `lib/api.ts`
**Action:** ADD new functions and types. Do NOT remove any existing functions.

Add these new types after the existing `AuthResponse` interface:

```typescript
export interface SendCodeResponse {
  message: string;
  expires_in: number;
}

export interface VerifyCodeResponse {
  verified: boolean;
  verification_token: string;
}
```

Add these new functions in the `// ── Auth ──` section:

```typescript
export async function sendVerificationCode(
  email: string,
  purpose: "signup" | "reset_password" = "signup"
): Promise<SendCodeResponse> {
  return apiFetch<SendCodeResponse>("/auth/send-code", {
    method: "POST",
    body: JSON.stringify({ email, purpose }),
  });
}

export async function verifyCode(
  email: string,
  code: string,
  purpose: "signup" | "reset_password" = "signup"
): Promise<VerifyCodeResponse> {
  return apiFetch<VerifyCodeResponse>("/auth/verify-code", {
    method: "POST",
    body: JSON.stringify({ email, code, purpose }),
  });
}

export async function registerWithVerifiedEmail(
  email: string,
  password: string,
  verificationToken: string
): Promise<AuthResponse> {
  const data = await apiFetch<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      verification_token: verificationToken,
    }),
  });
  localStorage.setItem("ac_token", data.access_token);
  return data;
}
```

**Update the `upgradeGuestAccount` function** to accept `verification_token`:

```typescript
export async function upgradeGuestAccount(
  method: "google" | "email",
  payload: {
    credential?: string;
    email?: string;
    password?: string;
    verification_token?: string;  // NEW
  }
): Promise<AuthResponse> {
  const data = await apiFetch<AuthResponse>("/auth/upgrade", {
    method: "POST",
    body: JSON.stringify({ method, ...payload }),
  });
  localStorage.setItem("ac_token", data.access_token);
  return data;
}
```

**KEEP the old `registerWithEmail` function** for backward compatibility but mark it deprecated:

```typescript
/** @deprecated Use registerWithVerifiedEmail instead */
export async function registerWithEmail(email: string, password: string): Promise<AuthResponse> {
  // This will now fail on the backend since verification_token is required
  const data = await apiFetch<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  localStorage.setItem("ac_token", data.access_token);
  return data;
}
```

---

### Phase 3: Frontend — Auth Page UI Rewrite

#### Step 3.1: Rewrite the Auth Page with multi-step signup flow

**File:** `app/auth/page.tsx`
**Action:** REWRITE the entire file.

The new auth page has these states:

**Sign In tab:**
- Email input + Password input + "Sign In" button
- Google button below divider
- (Same as before, unchanged)

**Sign Up tab — Step 1: Enter Email:**
- Email input
- "Send Verification Code" button
- Google button below divider

**Sign Up tab — Step 2: Enter Code:**
- Shows which email the code was sent to (with "change" link to go back)
- 6 individual digit input boxes (auto-focus next on input, auto-submit when all 6 filled)
- "Resend Code" button with countdown timer (60 seconds between resends)
- "Didn't receive it? Check your spam folder." helper text

**Sign Up tab — Step 3: Create Password:**
- Password input (with show/hide toggle)
- Confirm Password input (with show/hide toggle)
- Password strength indicator (optional but nice)
- "Create Account" button

**UI Implementation Details:**

1. **6-digit code input:** Use 6 individual `<input>` elements, each accepting 1 character. On input, auto-focus the next box. On backspace in an empty box, focus the previous box. On paste, distribute digits across all boxes. Each box is styled as:
   ```css
   width: 48px;
   height: 56px;
   text-align: center;
   font-size: 24px;
   font-weight: 700;
   background: rgba(255, 255, 255, 0.02);
   border: 1px solid var(--border);
   border-radius: var(--radius-md);
   color: var(--text);
   caret-color: var(--primary);
   ```
   On focus: `border-color: var(--primary); box-shadow: 0 0 0 3px rgba(59,130,246,0.15);`

2. **Resend countdown:** After sending a code, show "Resend code in 59s" counting down. When it reaches 0, show a clickable "Resend Code" link.

3. **Step transitions:** Use CSS transitions. Fade out current step, fade in next step. Use `opacity` and `transform: translateY()` transitions with 300ms duration.

4. **Google button rendering fix:** Extract the Google button initialization into a `useCallback` and re-render it whenever the `authMode` changes and when the button container ref changes. Use a `key` prop on the container div to force React to recreate the DOM element on mode change.

5. **Error display:** Same style as current — red-tinted banner at the top of the card.

6. **Loading states:** All buttons show a spinner or "Please wait..." text while API calls are in progress. Disable the button to prevent double-submission.

**Component structure pseudocode:**

```tsx
export default function AuthPage() {
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [signupStep, setSignupStep] = useState<1 | 2 | 3>(1);  // Only used when authMode === "signup"
  
  // Step 1 state
  const [email, setEmail] = useState("");
  
  // Step 2 state
  const [codeDigits, setCodeDigits] = useState(["", "", "", "", "", ""]);
  const [resendCountdown, setResendCountdown] = useState(0);
  
  // Step 3 state
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  
  // Shared state
  const [errorMsg, setErrorMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  
  // ... handlers for each step
  
  return (
    <div className="auth-page">
      <div className="auth-card animate-slide-up">
        {/* Title + Subtitle */}
        {/* Tab Selector (Sign In / Sign Up) */}
        {/* Error Banner */}
        
        {authMode === "login" && (
          /* Sign In form: email + password + submit + divider + google */
        )}
        
        {authMode === "signup" && signupStep === 1 && (
          /* Step 1: email + send code button + divider + google */
        )}
        
        {authMode === "signup" && signupStep === 2 && (
          /* Step 2: 6-digit code input + resend + back link */
        )}
        
        {authMode === "signup" && signupStep === 3 && (
          /* Step 3: password + confirm + create account button */
        )}
        
        {/* Terms text */}
      </div>
      
      {/* Account conflict modal (keep existing) */}
    </div>
  );
}
```

**CRITICAL DETAILS for the code input boxes:**

```tsx
// Create refs for each digit input
const codeRefs = useRef<(HTMLInputElement | null)[]>([]);

const handleCodeInput = (index: number, value: string) => {
  // Allow only digits
  const digit = value.replace(/\D/g, "").slice(-1);
  const newDigits = [...codeDigits];
  newDigits[index] = digit;
  setCodeDigits(newDigits);
  
  // Auto-focus next input
  if (digit && index < 5) {
    codeRefs.current[index + 1]?.focus();
  }
  
  // Auto-submit when all 6 digits are entered
  if (newDigits.every(d => d !== "") && newDigits.join("").length === 6) {
    handleVerifyCode(newDigits.join(""));
  }
};

const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
  if (e.key === "Backspace" && !codeDigits[index] && index > 0) {
    codeRefs.current[index - 1]?.focus();
  }
};

const handleCodePaste = (e: React.ClipboardEvent) => {
  e.preventDefault();
  const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
  const newDigits = [...codeDigits];
  for (let i = 0; i < 6; i++) {
    newDigits[i] = pasted[i] || "";
  }
  setCodeDigits(newDigits);
  // Focus the next empty input, or the last one
  const nextEmpty = newDigits.findIndex(d => d === "");
  codeRefs.current[nextEmpty >= 0 ? nextEmpty : 5]?.focus();
  
  if (newDigits.every(d => d !== "")) {
    handleVerifyCode(newDigits.join(""));
  }
};
```

**Resend countdown timer:**
```tsx
useEffect(() => {
  if (resendCountdown <= 0) return;
  const timer = setInterval(() => {
    setResendCountdown(prev => prev - 1);
  }, 1000);
  return () => clearInterval(timer);
}, [resendCountdown]);

const handleSendCode = async () => {
  setIsSubmitting(true);
  setErrorMsg("");
  try {
    await sendVerificationCode(email);
    setSignupStep(2);
    setResendCountdown(60);
  } catch (err: any) {
    setErrorMsg(err.message || "Failed to send code.");
  } finally {
    setIsSubmitting(false);
  }
};
```

---

### Phase 4: Frontend — Update Guest Upgrade Modal

#### Step 4.1: Update the guest upgrade flow in the chat page

**File:** Where the guest upgrade modal lives (check `app/chat/page.tsx` or wherever `upgradeGuestAccount` is called).
**Action:** MODIFY the email upgrade path to go through verification.

The guest upgrade modal currently has email + password fields. Update it to include the same 3-step flow:
1. Enter email → Send code
2. Enter verification code
3. Set password

You can reuse the same state machine and UI patterns from the auth page. Consider extracting the code input component into a shared component at `components/CodeInput.tsx` to avoid duplication.

**Shared Component — `components/CodeInput.tsx`:**

```tsx
"use client";
import { useRef } from "react";

interface CodeInputProps {
  digits: string[];
  onChange: (digits: string[]) => void;
  onComplete: (code: string) => void;
  disabled?: boolean;
}

export default function CodeInput({ digits, onChange, onComplete, disabled }: CodeInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  
  // ... implement with the same logic from Phase 3
  
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          disabled={disabled}
          onChange={e => handleInput(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          onPaste={i === 0 ? handlePaste : undefined}
          style={{
            width: 48,
            height: 56,
            textAlign: "center",
            fontSize: 24,
            fontWeight: 700,
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            color: "var(--text)",
            caretColor: "var(--primary)",
            outline: "none",
            transition: "border-color 0.2s, box-shadow 0.2s",
          }}
          onFocus={e => {
            e.target.style.borderColor = "var(--primary)";
            e.target.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.15)";
          }}
          onBlur={e => {
            e.target.style.borderColor = "var(--border)";
            e.target.style.boxShadow = "none";
          }}
        />
      ))}
    </div>
  );
}
```

---

### Phase 5: Fix the Google Button Rendering Bug

#### Step 5.1: Fix the Google button disappearing on tab switch

**File:** `app/auth/page.tsx` (part of the rewrite in Phase 3)
**Action:** This is included in the Phase 3 rewrite.

The root cause: The Google Identity Services library renders a button into a specific DOM element. When React re-renders the component (due to `authMode` state change), the DOM element is recreated, but `google.accounts.id.renderButton()` is not re-called.

**Fix strategy:**
1. Give the Google button container div a `key` prop that changes with `authMode`:
   ```tsx
   <div
     key={`google-btn-${authMode}`}
     ref={btnRef}
     id="google-signin-container"
     style={{ display: "flex", justifyContent: "center" }}
   />
   ```
2. Use a `useEffect` that depends on `authMode` and re-renders the button:
   ```tsx
   useEffect(() => {
     if (window.google && btnRef.current) {
       window.google.accounts.id.renderButton(btnRef.current, {
         theme: "filled_black",
         size: "large",
         width: 360,
         text: "continue_with",
         shape: "pill",
       });
     }
   }, [authMode, loading]);
   ```
3. Keep the `initGoogle` function but ensure it only calls `initialize()` once (track with a ref):
   ```tsx
   const gsiInitializedRef = useRef(false);
   
   const initGoogle = () => {
     const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
     if (!clientId || !window.google) return;
     
     if (!gsiInitializedRef.current) {
       window.google.accounts.id.initialize({
         client_id: clientId,
         callback: handleGoogleCredential,
         auto_select: false,
       });
       gsiInitializedRef.current = true;
     }
     
     if (btnRef.current) {
       window.google.accounts.id.renderButton(btnRef.current, {
         theme: "filled_black",
         size: "large",
         width: 360,
         text: "continue_with",
         shape: "pill",
       });
     }
   };
   ```

---

### Phase 6: CSS Additions

#### Step 6.1: Add styles for the verification code input

**File:** `app/globals.css`
**Action:** ADD new styles at the end of the file (do NOT modify existing styles).

```css
/* ── Verification Code Input ────────────────────────── */
.code-input-group {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin: 24px 0;
}

.code-input-group input {
  width: 48px;
  height: 56px;
  text-align: center;
  font-size: 24px;
  font-weight: 700;
  font-family: "Inter", monospace;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text);
  caret-color: var(--primary);
  outline: none;
  transition: border-color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
              box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.code-input-group input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
  background: rgba(0, 0, 0, 0.2);
}

.code-input-group input:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── Auth Step Transitions ──────────────────────────── */
.auth-step-enter {
  opacity: 0;
  transform: translateY(12px);
}

.auth-step-active {
  opacity: 1;
  transform: translateY(0);
  transition: opacity 0.3s ease, transform 0.3s ease;
}

/* ── Resend Code Link ───────────────────────────────── */
.resend-link {
  color: var(--primary);
  font-size: 13px;
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;
  text-decoration: underline;
  transition: color 0.2s;
}

.resend-link:hover {
  color: var(--primary-light);
}

.resend-link:disabled {
  color: var(--text-dim);
  cursor: not-allowed;
  text-decoration: none;
}

/* ── Password Toggle ────────────────────────────────── */
.password-field {
  position: relative;
}

.password-field .toggle-visibility {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 14px;
  padding: 4px;
  transition: color 0.2s;
}

.password-field .toggle-visibility:hover {
  color: var(--text);
}

/* ── Step Indicator (Email Sent) ────────────────────── */
.email-sent-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(16, 185, 129, 0.06);
  border: 1px solid rgba(16, 185, 129, 0.2);
  border-radius: var(--radius-full);
  padding: 6px 16px;
  font-size: 13px;
  color: var(--accent);
  margin-bottom: 16px;
}

.email-sent-badge::before {
  content: "✓";
  font-weight: 700;
}
```

---

### Phase 7: Update Frontend `.env.local.example`

**File:** `.env.local.example`
**Action:** Verify it has the GOOGLE_CLIENT_ID variable. It already does — no changes needed.

---

### Phase 8: Cleanup

#### Step 8.1: Remove Firebase dependency (optional but recommended)

The `firebase` npm package is installed (`"firebase": "^12.15.0"` in `package.json`) but is NOT used by any active code path. The files `lib/firebase.ts` and `lib/auth.ts` exist but are legacy.

**Decision for the human:** Do you want to remove Firebase?
- If YES: Run `npm uninstall firebase`, delete `lib/firebase.ts` and `lib/auth.ts`.
- If NO: Leave them. They don't interfere with the new auth system.

**Do NOT remove Firebase files unless the human explicitly confirms.**

---

## ✅ VERIFICATION CHECKLIST

After implementing all phases, verify each flow works:

### Test 1: Email Sign Up with Verification Code
1. Go to `/auth` → select "Sign Up" tab
2. Enter a real email address
3. Click "Send Verification Code"
4. Check the email inbox — verify the email arrived with a 6-digit code
5. Enter the code in the UI
6. Set a password and confirm it
7. Click "Create Account"
8. Verify: user is redirected to `/setup` (since `onboarded=false`)
9. Verify: `localStorage` has `ac_token`
10. Verify: the user row exists in PostgreSQL with `hashed_password` set and `is_guest=false`

### Test 2: Email Sign In
1. Go to `/auth` → select "Sign In" tab
2. Enter the email and password from Test 1
3. Click "Sign In"
4. Verify: user is authenticated and redirected

### Test 3: Email Sign Up — Duplicate Email
1. Go to `/auth` → "Sign Up"
2. Enter the same email from Test 1
3. Click "Send Verification Code"
4. Verify: error message "This email is already registered. Please sign in instead."

### Test 4: Google Sign Up (new user)
1. Go to `/auth` → click the Google button
2. Select a Google account that has NOT been used before
3. Verify: user is created and redirected to `/setup`

### Test 5: Google Sign In (existing user)
1. Go to `/auth` → click the Google button
2. Select the same Google account from Test 4
3. Verify: user is signed in and redirected to `/chat`

### Test 6: Google button rendering
1. Go to `/auth` → verify Google button is visible
2. Click "Sign Up" tab → verify Google button is still visible
3. Click "Sign In" tab → verify Google button is still visible
4. Refresh the page → verify Google button loads correctly

### Test 7: Rate Limiting
1. Send 5 verification codes to the same email rapidly
2. Verify: the 6th attempt returns a 429 error with "Too many code requests"

### Test 8: Expired Code
1. Send a verification code
2. Wait 10+ minutes (or manually delete the Redis key `verify:signup:<email>`)
3. Enter the code
4. Verify: error "Verification code expired or not found"

### Test 9: Guest Upgrade with Email
1. Go to landing page → "Start Practice" (creates guest)
2. Chat 3 times → upgrade modal appears
3. Enter email → receive code → verify → set password
4. Verify: `is_guest` is now `false` in the database

### Test 10: Invalid Code
1. Send a verification code
2. Enter a wrong code (e.g., 000000)
3. Verify: error "Incorrect verification code"

---

## ⚠️ IMPORTANT NOTES & EDGE CASES

1. **Do NOT use Firebase for any of this.** The project has Firebase files but they are legacy. All auth goes through the custom FastAPI backend.

2. **The `hashed_password` field already exists** in both the Pydantic `UserProfile` model and the SQLAlchemy `UserDB` model. Do NOT add it again.

3. **The `bcrypt` import in `auth_service.py`** uses `bcrypt` directly (not passlib). Keep this pattern. The `verify_password` and `get_password_hash` functions already exist — do NOT rewrite them.

4. **Next.js 16 — READ THE DOCS.** Before writing any code, check `node_modules/next/dist/docs/` for any breaking changes in routing, `use client` directives, or API conventions. The `AGENTS.md` file in the project root warns about this.

5. **The Google Identity Services (GIS) script** is loaded from `https://accounts.google.com/gsi/client`. It is NOT the old `gapi` library. The `initialize()` function must only be called ONCE. The `renderButton()` function can be called multiple times.

6. **The `ac_token`** is the localStorage key for the JWT. Do NOT change this key name — the `AuthProvider`, `Navbar`, and `api.ts` all reference it.

7. **The `AuthProvider` component** reads the token on mount and calls `getMyProfile()`. After setting `ac_token` in localStorage via `setAuth()`, the provider updates its state. **Do NOT call `window.location.reload()`** — use `router.replace()` and `setAuth()`.

8. **CORS is configured** in `backend/main.py` to allow `settings.frontend_url` and `http://localhost:3000`. If testing from a different port, update CORS.

9. **The `checkEmailRegistered` function** in `lib/api.ts` already exists. It calls `GET /auth/check-email?email=...`. You can use it to pre-check emails on the Sign In form to give better error messages, but it's not required for the verification flow.

10. **CSS class names** — The existing `globals.css` has classes like `.auth-page`, `.auth-card`, `.auth-title`, `.auth-sub`, `.auth-divider`, `.auth-terms`, `.form-group`, `.form-label`, `.form-input`, `.btn`, `.btn-primary`, `.btn-ghost`. Use these existing classes. Do NOT create new class names that duplicate existing ones.

11. **All API errors** from the backend follow the pattern `{ "detail": "Error message" }`. The `apiFetch` function in `lib/api.ts` already parses this and throws it as `new Error(err.detail)`. Frontend `catch` blocks receive `err.message`.

12. **The verification token is NOT the same as the access token.** The verification token is a short-lived JWT (30 min) that only proves the email was verified. The access token is the session JWT (7 days) returned after successful registration/login.

---

## 📁 FILES CHANGED SUMMARY

| File | Action | Description |
|---|---|---|
| `backend/config.py` | MODIFY | Add SMTP settings to Settings class |
| `backend/services/email_service.py` | CREATE | New email sending service |
| `backend/services/redis_service.py` | MODIFY | Add verification code + rate limit methods |
| `backend/models/user.py` | MODIFY | Add new request/response models, update UpgradeRequest |
| `backend/services/auth_service.py` | MODIFY | Add verification token functions |
| `backend/routers/auth.py` | MODIFY | Add `/send-code`, `/verify-code` endpoints; update `/register` and `/login` |
| `backend/requirements.txt` | MODIFY | Add `bcrypt>=4.0.0` |
| `backend/.env.example` | MODIFY | Add SMTP config section |
| `backend/.env` | MODIFY | Add actual SMTP credentials (human does this) |
| `lib/api.ts` | MODIFY | Add `sendVerificationCode`, `verifyCode`, `registerWithVerifiedEmail` functions |
| `app/auth/page.tsx` | REWRITE | Multi-step signup with code verification + Google button fix |
| `components/CodeInput.tsx` | CREATE | Reusable 6-digit code input component |
| `app/globals.css` | MODIFY | Add code input, step transition, resend link styles |
| `.env.local.example` | NO CHANGE | Already has GOOGLE_CLIENT_ID |

---

## 🔒 SECURITY CONSIDERATIONS

1. **Verification codes are 6-digit numeric** (100000–999999). With rate limiting (10 attempts per 10 minutes), brute force is not feasible (900,000 possible codes ÷ 10 attempts = 0.001% chance).

2. **Verification tokens are JWTs** signed with the same secret as access tokens. They have a `purpose: "email_verification"` claim to prevent misuse as access tokens.

3. **SMTP credentials** are stored in backend `.env` only — they are NEVER exposed to the frontend.

4. **Rate limiting** is per-email, per-action. Sending codes: 5 per 5 minutes. Verifying codes: 10 per 10 minutes.

5. **Passwords** are hashed with bcrypt (cost factor 12, default from `bcrypt.gensalt()`). The raw password is never stored or logged.

6. **Google ID tokens** are verified server-side using Google's public keys via `google.oauth2.id_token.verify_oauth2_token()`. They are never trusted on the frontend alone.
