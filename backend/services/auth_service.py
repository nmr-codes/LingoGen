from __future__ import annotations
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from jose import JWTError, jwt
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from config import get_settings
from models.user import UserProfile
from services.redis_service import redis_service
import bcrypt

logger = logging.getLogger(__name__)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def _settings():
    return get_settings()


# ── Google Token Verification ──────────────────────────────
async def verify_google_token(credential: str) -> dict:
    """Verify Google ID token and return its claims."""
    settings = _settings()
    try:
        info = id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            settings.google_client_id,
            clock_skew_in_seconds=3600  # 1 hour tolerance for local VM clock skews
        )
        return info
    except Exception as e:
        logger.error(f"Google token verification failed: {e}")
        raise ValueError(f"Invalid Google credential: {e}")


# ── JWT Helpers ────────────────────────────────────────────
def create_access_token(uid: str) -> str:
    settings = _settings()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"sub": uid, "exp": expire, "iat": datetime.now(timezone.utc)}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> Optional[str]:
    """Return uid from JWT, or None if invalid."""
    settings = _settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        uid: Optional[str] = payload.get("sub")
        return uid
    except JWTError:
        return None


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



async def get_github_user_info(code: str) -> dict:
    """Exchange an OAuth code for GitHub profile and email details."""
    settings = _settings()
    if not settings.github_client_id or not settings.github_client_secret:
        raise ValueError("GitHub OAuth is not configured.")

    headers = {"Accept": "application/json"}
    token_payload = {
        "client_id": settings.github_client_id,
        "client_secret": settings.github_client_secret,
        "code": code,
        "redirect_uri": settings.github_redirect_uri,
    }

    async with httpx.AsyncClient(timeout=30) as client:
        token_response = await client.post(
            "https://github.com/login/oauth/access_token",
            data=token_payload,
            headers=headers,
        )
        if token_response.status_code != 200:
            raise ValueError("Failed to exchange GitHub authorization code.")

        token_data = token_response.json()
        access_token = token_data.get("access_token")
        if not access_token:
            error_detail = token_data.get("error_description") or token_data.get("error") or "Unknown GitHub OAuth error."
            raise ValueError(error_detail)

        auth_headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/vnd.github+json",
        }

        profile_response = await client.get("https://api.github.com/user", headers=auth_headers)
        if profile_response.status_code != 200:
            raise ValueError("Failed to fetch GitHub profile information.")
        profile_data = profile_response.json()

        email = profile_data.get("email")
        if not email:
            email_response = await client.get("https://api.github.com/user/emails", headers=auth_headers)
            if email_response.status_code == 200:
                email_items = email_response.json() or []
                primary_email = next(
                    (item["email"] for item in email_items if item.get("primary") and item.get("verified")),
                    None,
                )
                if not primary_email:
                    primary_email = next((item["email"] for item in email_items if item.get("verified")), None)
                email = primary_email

        if not email:
            raise ValueError("GitHub account email is required for sign-in.")

        return {
            "id": str(profile_data.get("id")),
            "email": str(email).strip().lower(),
            "name": profile_data.get("name") or profile_data.get("login") or "GitHub User",
            "avatar_url": profile_data.get("avatar_url", ""),
        }


# ── User Management ────────────────────────────────────────
async def get_or_create_user(google_info: dict) -> UserProfile:
    uid: str = google_info["sub"]
    from services.db_service import db_service
    existing = await db_service.get_user(uid)

    if existing:
        profile = UserProfile(**existing)
    else:
        profile = UserProfile(
            uid=uid,
            email=google_info.get("email", ""),
            display_name=google_info.get("name", ""),
            photo_url=google_info.get("picture", ""),
            google_id=uid,
        )
        await db_service.save_user(uid, profile.model_dump())

    return profile


async def get_user_profile(uid: str) -> Optional[UserProfile]:
    from services.db_service import db_service
    data = await db_service.get_user(uid)
    if not data:
        return None
    try:
        return UserProfile(**data)
    except Exception as e:
        logger.error(f"Failed to parse UserProfile: {e} | data={data}")
        return None
