from __future__ import annotations
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime


class UserProfile(BaseModel):
    uid: str
    email: str
    display_name: str = ""
    photo_url: str = ""
    age: Optional[int] = None
    gender: Optional[str] = None
    native_language: Optional[str] = None
    learning_language: Optional[str] = None
    interests: List[str] = Field(default_factory=list)
    bio: str = ""
    looking_for: str = ""
    hashed_password: Optional[str] = None
    onboarded: bool = False
    is_guest: bool = False
    created_at: float = Field(default_factory=lambda: datetime.utcnow().timestamp())


class UserProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    age: Optional[int] = Field(default=None, ge=13, le=99)
    gender: Optional[str] = None
    native_language: Optional[str] = None
    learning_language: Optional[str] = None
    interests: Optional[List[str]] = None
    bio: Optional[str] = Field(default=None, max_length=300)
    looking_for: Optional[str] = None
    onboarded: Optional[bool] = None


class PublicProfile(BaseModel):
    """Minimal profile shown to chat partner — stays anonymous."""
    age: Optional[int] = None
    gender: Optional[str] = None
    native_language: Optional[str] = None
    learning_language: Optional[str] = None
    interests: List[str] = Field(default_factory=list)
    looking_for: str = ""


from typing import Literal

class GoogleAuthRequest(BaseModel):
    credential: str  # Google ID token (JWT)
    mode: Literal["login", "signup"] = "login"

class EmailAuthRequest(BaseModel):
    email: str
    password: str

class UpgradeRequest(BaseModel):
    method: Literal["google", "email"]
    credential: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    verification_token: Optional[str] = None


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserProfile


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

