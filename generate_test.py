import asyncio
import json
import uuid
from websockets import connect

# Use the deployed backend
# Or use localhost if running locally. Let's use the deployed backend:
# WS_URL = "wss://lingogen-backend.onrender.com/ws"
# But wait, we don't have tokens for the deployed backend easily.
# Let's import the local backend functions to generate a token, then test locally!

import sys
sys.path.append("./backend")
from services.auth_service import create_access_token
from services.db_service import db_service

async def main():
    # 1. Create two fake users in the DB
    uid1 = str(uuid.uuid4())
    uid2 = str(uuid.uuid4())
    
    await db_service.save_user(uid1, {
        "uid": uid1, "email": "test1@abc.com", "display_name": "T1", "onboarded": True, "interests": ["coding"]
    })
    await db_service.save_user(uid2, {
        "uid": uid2, "email": "test2@abc.com", "display_name": "T2", "onboarded": True, "interests": ["coding"]
    })
    
    t1 = create_access_token(uid1)
    t2 = create_access_token(uid2)

    print("Tokens generated.")
    
    # We will connect to the local backend. We should start it first!
    # So this script will just print the tokens and we can run another script to connect.
    print(f"export T1={t1}")
    print(f"export T2={t2}")

if __name__ == "__main__":
    asyncio.run(main())
