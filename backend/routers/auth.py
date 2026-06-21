import uuid
import random
from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from models.user import GoogleAuthRequest, EmailAuthRequest, UpgradeRequest, AuthResponse, UserProfile
from services.auth_service import (
    verify_google_token, 
    create_access_token, 
    get_password_hash, 
    verify_password,
    decode_access_token
)
from services.db_service import db_service

router = APIRouter()

@router.post("/google", response_model=AuthResponse)
async def google_auth(body: GoogleAuthRequest):
    """
    Verify a Google ID token.
    If mode=login: fails if user not in DB.
    If mode=signup: creates user, or auto-logs in if they already exist.
    """
    try:
        google_info = await verify_google_token(body.credential)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))

    uid = google_info["sub"]
    existing = await db_service.get_user(uid)

    if existing:
        user = UserProfile(**existing)
    else:
        email = google_info.get("email", "").strip().lower()
        if not email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Google account must have an email address."
            )
            
        # Check if user with this email already exists (e.g. registered via email)
        email_uid = await db_service.get_uid_by_email(email)
        if email_uid:
            # User registered with email. Link Google UID by migrating their db row
            existing_email_user = await db_service.get_user(email_uid)
            if existing_email_user:
                user = UserProfile(**existing_email_user)
                user.uid = uid
                user.photo_url = google_info.get("picture", user.photo_url)
                await db_service.save_user(uid, user.model_dump())
                await db_service.delete_user(email_uid)
        else:
            user = UserProfile(
                uid=uid,
                email=email,
                display_name=google_info.get("name", display_name_from_email(email)),
                photo_url=google_info.get("picture", ""),
            )
            await db_service.save_user(uid, user.model_dump())

    token = create_access_token(user.uid)
    return AuthResponse(access_token=token, user=user)

def display_name_from_email(email: str) -> str:
    return email.split("@")[0] if "@" in email else "user"


@router.post("/register", response_model=AuthResponse)
async def email_register(body: EmailAuthRequest):
    """Register a new user with email and password."""
    email = body.email.strip().lower()
    uid = await db_service.get_uid_by_email(email)
    if uid:
        existing = await db_service.get_user(uid)
        if existing:
            user = UserProfile(**existing)
            if user.hashed_password:
                if verify_password(body.password, user.hashed_password):
                    # Auto-login
                    token = create_access_token(user.uid)
                    return AuthResponse(access_token=token, user=user)
                else:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Email already registered. Incorrect password for auto-login."
                    )
            else:
                # User exists but was registered via Google (no password). 
                # Since they are trying to sign up, link this password to their account and auto-login!
                user.hashed_password = get_password_hash(body.password)
                await db_service.save_user(uid, user.model_dump())
                token = create_access_token(user.uid)
                return AuthResponse(access_token=token, user=user)
    
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


@router.post("/login", response_model=AuthResponse)
async def email_login(body: EmailAuthRequest):
    """Login with email and password."""
    email = body.email.strip().lower()
    uid = await db_service.get_uid_by_email(email)
    if not uid:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found. Please sign up."
        )
    
    existing = await db_service.get_user(uid)
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found.")
        
    user = UserProfile(**existing)
    if not user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account was created with Google. Please continue with Google."
        )
        
    if not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password."
        )
        
    token = create_access_token(user.uid)
    return AuthResponse(access_token=token, user=user)

# ── Guest Mode & Upgrades ──────────────────────────────────
bearer = HTTPBearer()

async def get_current_uid(creds: HTTPAuthorizationCredentials = Depends(bearer)) -> str:
    uid = decode_access_token(creds.credentials)
    if not uid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return uid

@router.post("/guest", response_model=AuthResponse)
async def guest_auth():
    """Create an ephemeral guest user account."""
    uid = str(uuid.uuid4())
    rand_id = random.randint(1000, 9999)
    display_name = f"Guest #{rand_id}"
    
    user = UserProfile(
        uid=uid,
        email=f"guest_{uid}@anonconnect.com",
        display_name=display_name,
        onboarded=True,  # Guest bypasses setup wizard
        is_guest=True
    )
    await db_service.save_user(uid, user.model_dump())
    
    token = create_access_token(uid)
    return AuthResponse(access_token=token, user=user)

@router.post("/upgrade", response_model=AuthResponse)
async def upgrade_guest(
    body: UpgradeRequest,
    uid: str = Depends(get_current_uid)
):
    """
    Upgrade a guest account to a permanent registered account.
    If target credentials already exist, we swap sessions.
    Otherwise, we upgrade the guest account details.
    """
    existing_guest = await db_service.get_user(uid)
    if not existing_guest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Guest user not found.")
        
    guest_profile = UserProfile(**existing_guest)
    if not guest_profile.is_guest:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User is already registered.")

    if body.method == "google":
        if not body.credential:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google credential required.")
        try:
            google_info = await verify_google_token(body.credential)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))
            
        target_uid = google_info["sub"]
        target_email = google_info.get("email", "")
        
        # If google account already exists, switch session
        target_exists = await db_service.get_user(target_uid)
        if target_exists:
            user = UserProfile(**target_exists)
            token = create_access_token(user.uid)
            return AuthResponse(access_token=token, user=user)
            
        # Or if someone has the same email
        email_uid = await db_service.get_uid_by_email(target_email)
        if email_uid and email_uid != uid:
            target_exists = await db_service.get_user(email_uid)
            if target_exists:
                user = UserProfile(**target_exists)
                token = create_access_token(user.uid)
                return AuthResponse(access_token=token, user=user)
        
        # Upgrade current guest user by creating a new google sub entry & deleting the old guest UID
        user = UserProfile(
            uid=target_uid,
            email=target_email,
            display_name=google_info.get("name", guest_profile.display_name),
            photo_url=google_info.get("picture", guest_profile.photo_url),
            age=guest_profile.age,
            gender=guest_profile.gender,
            native_language=guest_profile.native_language,
            learning_language=guest_profile.learning_language,
            interests=guest_profile.interests,
            bio=guest_profile.bio,
            looking_for=guest_profile.looking_for,
            onboarded=True,
            is_guest=False
        )
        await db_service.save_user(target_uid, user.model_dump())
        await db_service.delete_user(uid)
        
        token = create_access_token(target_uid)
        return AuthResponse(access_token=token, user=user)

    elif body.method == "email":
        if not body.email or not body.password:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email and password required.")
            
        target_email = body.email.strip().lower()
        
        # If email already exists, switch session
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

    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid upgrade method.")
