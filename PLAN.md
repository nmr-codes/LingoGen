# LingoGen — Full Authentication System Plan (Google, Email, GitHub) 🚀

This document outlines the detailed roadmap, technical architecture, and codebase changes required to implement a robust authentication system supporting **Google Identity Services**, **Verified Email/Password**, and **GitHub OAuth 2.0** for LingoGen.

---

## 1. 📋 Credentials & Settings Required from the User

Before proceeding with the implementation, you must configure the following OAuth applications and email services. **These values must be entered in the respective `.env` files.**

### A. Google OAuth 2.0 Configuration
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project, then navigate to **APIs & Services** → **Credentials**.
3. Click **Create Credentials** → **OAuth Client ID**.
4. Set **Application Type** to *Web application*.
5. Set **Authorized JavaScript Origins** to:
   - `http://localhost:3000` (Local development)
   - `https://www.lingogen.me` (Production domain)
   - `https://lingo-gen-rho.vercel.app` (Vercel deployment domain)
6. Copy the **Client ID**. No Client Secret is needed as we verify the Google JWT ID token directly on the backend.

### B. GitHub OAuth 2.0 Configuration
1. Go to [GitHub Developer Settings](https://github.com/settings/developers) → **OAuth Apps** → **New OAuth App**.
2. Set the following parameters:
   - **Application Name:** LingoGen
   - **Homepage URL:** `http://localhost:3000` (Local) or `https://www.lingogen.me` (Production)
   - **Authorization callback URL:** `http://localhost:3000/auth/github/callback` (Local) and `https://www.lingogen.me/auth/github/callback` (Production)
3. Register the application, then copy the **Client ID** and generate a **Client Secret**.

### C. Email Service Configuration (Resend API)
1. Sign up at [Resend](https://resend.com/).
2. Navigate to **API Keys** → **Create API Key**.
3. Copy the API Key.
4. Verify your sending domain under **Domains** so you can send verification emails.

### D. Environment Variables Configuration

#### Frontend Environment (`.env.local` or Vercel Settings)
Configure the following keys in your frontend variables:
```env
NEXT_PUBLIC_API_URL="http://localhost:8000"
NEXT_PUBLIC_WS_URL="ws://localhost:8000"

# Google Client ID (GIS SDK)
NEXT_PUBLIC_GOOGLE_CLIENT_ID="your-google-client-id-here.apps.googleusercontent.com"

# GitHub Client ID (OAuth link builder)
NEXT_PUBLIC_GITHUB_CLIENT_ID="your-github-client-id-here"
```

#### Backend Environment (`backend/.env` or Render Settings)
Configure the following keys in your backend variables:
```env
# Google Authentication Verification
GOOGLE_CLIENT_ID="your-google-client-id-here.apps.googleusercontent.com"

# GitHub OAuth App Secrets
GITHUB_CLIENT_ID="your-github-client-id-here"
GITHUB_CLIENT_SECRET="your-github-client-secret-here"
GITHUB_REDIRECT_URI="http://localhost:3000/auth/github/callback"

# Caching & Session Token
JWT_SECRET="generate-a-secure-random-string-here"
JWT_ALGORITHM="HS256"

# Resend Transactional Email Key
RESEND_API_KEY="re_yourResendApiKeyHere"
SMTP_FROM_NAME="LingoGen"
SMTP_FROM_EMAIL="noreply@yourdomain.com"
```

---

## 2. Technical Architecture & Auth Flows

```
                               ┌──────────────┐
                               │   Frontend   │
                               └──────┬───────┘
                                      │
           ┌──────────────────────────┼──────────────────────────┐
           │ (1) Google ID Token      │ (2) Email + Pass + Code  │ (3) GitHub OAuth Code
           ▼                          ▼                          ▼
   ┌───────────────┐          ┌───────────────┐          ┌───────────────┐
   │ POST /auth/   │          │ POST /auth/   │          │ POST /auth/   │
   │    google     │          │   register    │          │    github     │
   └───────┬───────┘          └───────┬───────┘          └───────┬───────┘
           │                          │                          │
           │        ┌─────────────────┼──────────────────────────┘
           ▼        ▼                 ▼
     ┌────────────────────────┐     ┌────────────────────────┐
     │   Google Auth Verify   │     │   GitHub API Exchange  │
     │   (Audience match check)│     │   (Access Token/User)  │
     └──────────────┬─────────┘     └─────────┬──────────────┘
                    │                         │
                    └───────────┬─────────────┘
                                ▼
                   ┌─────────────────────────┐
                   │  Check user in Postgres │
                   │  (Save or update row)   │
                   └────────────┬────────────┘
                                │
                                ▼
                   ┌─────────────────────────┐
                   │ Issue LingoGen JWT Token│
                   │ (Stored in LocalStorage)│
                   └─────────────────────────┘
```

### A. Google Auth Flow
1. User interacts with the Google Sign-in button on the frontend.
2. The browser receives an ID Token (JWT) directly from Google Identity Services.
3. The token is sent via `POST /auth/google` to the FastAPI backend.
4. The backend verifies the token's signature and matches the client audience ID.
5. The backend signs a local LingoGen access token containing the user's Google UID and returns the session credentials.

### B. GitHub OAuth Flow
1. User clicks **Continue with GitHub** on the frontend.
2. The client redirects the user to the GitHub authorization page:
   `https://github.com/login/oauth/authorize?client_id=<client_id>&redirect_uri=<callback_uri>&scope=user:email`
3. After authorization, GitHub redirects back to the frontend callback page (`/auth/github/callback?code=...`).
4. The frontend grabs the `code` and posts it to the backend via `POST /auth/github { "code": "..." }`.
5. The backend requests an Access Token from GitHub's server:
   `POST https://github.com/login/oauth/access_token`
6. The backend retrieves the user profile details (`GET https://api.github.com/user`) and email details (`GET https://api.github.com/user/emails`).
7. The user record is saved to the database, and a local LingoGen access token is returned to initiate the session.

### C. Email & Verification Flow
1. **Request Verification Code:** User registers by submitting their email. The backend generates a 6-digit random code, saves it to Redis with a 10-minute expiry time, and delivers it via the Resend API to the user's inbox.
2. **Verify Code:** User enters the 6-digit code. The backend verifies it against the Redis cache and generates a short-lived `email_verification` validation token.
3. **Register/Upgrade:** User enters a password. The frontend submits the email, password, and validation token to the database. The password is cryptographically hashed using `bcrypt` and saved.

---

## 3. Required Code Changes

### Database Layout Updates ([db_models.py](file:///home/lazy/Desktop/LingoGen/backend/models/db_models.py))
To support both Google and GitHub logins, we update the `users` table to maintain independent social identifiers:
* Add columns `google_id` (VARCHAR, Nullable, Unique)
* Add columns `github_id` (VARCHAR, Nullable, Unique)

### Backend Configuration ([config.py](file:///home/lazy/Desktop/LingoGen/backend/config.py))
Update the backend configurations settings mapping class to read GitHub keys:
```python
github_client_id: str = ""
github_client_secret: str = ""
github_redirect_uri: str = "http://localhost:3000/auth/github/callback"
```

### GitHub Service Provider ([auth_service.py](file:///home/lazy/Desktop/LingoGen/backend/services/auth_service.py))
Implement a function to verify and exchange authorization codes for GitHub profiles:
```python
async def get_github_user_info(code: str) -> dict:
    """Exchange OAuth code for GitHub user profile and verified email."""
    # 1. Exchange code for access token
    # 2. Query profile info from api.github.com/user
    # 3. Query private emails list from api.github.com/user/emails
    # 4. Return username, email, and avatar picture url
```

### Backend Auth Router endpoints ([auth.py](file:///home/lazy/Desktop/LingoGen/backend/routers/auth.py))
Create a new endpoint `POST /auth/github` mapping the payload code exchange, checking if the email/github_id exists in the database, and returning the user instance and JWT.

---

## 4. Step-by-Step Implementation Roadmap

### Phase 1: Backend Database & Config Setup
- [ ] Add `github_id` and `google_id` properties to [db_models.py](file:///home/lazy/Desktop/LingoGen/backend/models/db_models.py).
- [ ] Implement auto-migrations inside [database.py](file:///home/lazy/Desktop/LingoGen/backend/database.py) to append columns on application start.
- [ ] Add GitHub properties inside the settings configurations mapping class ([config.py](file:///home/lazy/Desktop/LingoGen/backend/config.py)).

### Phase 2: Create GitHub OAuth Integration Service
- [ ] Write exchange logic inside [auth_service.py](file:///home/lazy/Desktop/LingoGen/backend/services/auth_service.py) using `httpx.AsyncClient`.
- [ ] Create `GitHubAuthRequest` pydantic model in [user.py](file:///home/lazy/Desktop/LingoGen/backend/models/user.py).
- [ ] Mount `/auth/github` endpoint handler inside [auth.py](file:///home/lazy/Desktop/LingoGen/backend/routers/auth.py).

### Phase 3: Frontend Client Integration
- [ ] Add GitHub authentication function to the API Client ([api.ts](file:///home/lazy/Desktop/LingoGen/lib/api.ts)).
- [ ] Build GitHub callback handler route `app/auth/github/callback/page.tsx` on the frontend.
- [ ] Design the UI **Continue with GitHub** button inside [auth/page.tsx](file:///home/lazy/Desktop/LingoGen/app/auth/page.tsx).

---

## 5. Verification & Manual Testing Plan

### A. Google OAuth Verification
* Click Google button. Ensure a popup shows, the login is successful, and it redirects to `/chat` or `/setup`.

### B. Email Code Verification
* Register a new email. Verify the 6-digit code is sent to your email inbox. Ensure incorrect codes return 400 errors, and correct codes unlock the password step.

### C. GitHub OAuth Verification
* Click **Continue with GitHub**. Confirm authorization consent page appears on github.com. Verify it redirects back to the application callback and launches the chat dashboard.
