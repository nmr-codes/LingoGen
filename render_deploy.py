import requests
import json

API_KEY = "rnd_A1clK0F8uwqncEDGmb5dlo7El7D3"
OWNER_ID = "tea-csppf1l6l47c73djnnig"
HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Accept": "application/json",
    "Content-Type": "application/json"
}

def create_web_service():
    print("Creating Web Service...")
    url = "https://api.render.com/v1/services"
    payload = {
        "type": "web_service",
        "name": "lingogen-backend",
        "ownerId": OWNER_ID,
        "repo": "https://github.com/nmr-codes/LingoGen",
        "branch": "master",
        "env": "docker",
        "serviceDetails": {
            "runtime": "docker",
            "env": "docker",
            "dockerCommand": "",
            "dockerContext": "backend",
            "dockerfilePath": "backend/Dockerfile",
            "envVars": [
                {"key": "DATABASE_URL", "value": "postgresql://anonconnect_db_user:vcoAwu6zP1mJ6l9ZaI0cRXTGXjY2HeEO@dpg-d8r2dnojs32c73bgd2u0-a/anonconnect_db"},
                {"key": "REDIS_URL", "value": "redis://red-d8r2digjs32c73bgcro0:6379"},
                {"key": "JWT_SECRET", "generateValue": True},
                {"key": "FRONTEND_URL", "value": "https://lingogen.vercel.app"},
                {"key": "DEBUG", "value": "False"}
            ]
        }
    }
    res = requests.post(url, headers=HEADERS, json=payload)
    print("WS Response:", res.text)
    if res.status_code != 201:
        return None
    
    data = res.json()
    return data["service"]["url"]

if __name__ == "__main__":
    web_url = create_web_service()
    print("Live URL:", web_url)
