from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from models.user import UserProfile, UserProfileUpdate
from services.auth_service import decode_access_token, get_user_profile
from services.db_service import db_service
from services.redis_service import redis_service

router = APIRouter()
bearer = HTTPBearer()


async def get_current_uid(creds: HTTPAuthorizationCredentials = Depends(bearer)) -> str:
    uid = decode_access_token(creds.credentials)
    if not uid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    
    # Ensure the user actually exists in the database (prevents ghost sessions if Redis was wiped)
    exists = await db_service.get_user(uid)
    if not exists:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User session expired or database wiped")
        
    return uid


@router.get("/profile/me", response_model=UserProfile)
async def get_my_profile(uid: str = Depends(get_current_uid)):
    profile = await get_user_profile(uid)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@router.patch("/profile/me", response_model=UserProfile)
async def update_my_profile(
    body: UserProfileUpdate,
    uid: str = Depends(get_current_uid),
):
    update_data = body.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    await db_service.update_user(uid, update_data)

    profile = await get_user_profile(uid)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found after update")
    return profile


@router.get("/online-count")
async def get_online_count():
    count = await redis_service.online_count()
    queue = await redis_service.queue_count()
    return {"online": count, "searching": queue}

@router.get("/debug")
async def get_debug_info():
    members = await redis_service.get_queue_members_with_scores()
    import time
    now = time.time()
    
    queue_data = []
    for uid, joined_at in members:
        prof = await redis_service.get_queue_profile(uid)
        queue_data.append({
            "uid": uid,
            "joined_at": joined_at,
            "wait_time": now - joined_at,
            "profile": prof
        })
        
    return {
        "now": now,
        "queue_count": len(members),
        "queue": queue_data
    }

@router.get("/debug/user")
async def get_debug_user_info(uid: str):
    sid = await redis_service.get_user_session(uid)
    sdata = await redis_service.get_session(sid) if sid else None
    return {"uid": uid, "sid": sid, "sdata": sdata}

@router.get("/migrate-languages")
async def migrate_languages():
    from database import engine
    from sqlalchemy import text
    try:
        async with engine.begin() as conn:
            await conn.execute(text("ALTER TABLE users ADD COLUMN native_language VARCHAR;"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN learning_language VARCHAR;"))
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
