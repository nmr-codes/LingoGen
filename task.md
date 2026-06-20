# Hybrid Matchmaking Implementation

- `[x]` 1. **Database & Backend Models**
  - `[x]` Update `models/db_models.py` to add `native_language` and `learning_language` columns to `UserDB`.
  - `[x]` Update `models/user.py` schemas to include the new language fields.
  - `[x]` Update `services/db_service.py` `get_user` to return the new fields.
- `[x]` 2. **Matchmaking Engine**
  - `[x]` Update `services/redis_service.py` to serialize and store the entire `PublicProfile` payload in the queue along with a timestamp.
  - `[x]` Update `services/matchmaking.py` to calculate the new multi-factor score (Language, Interests, Intent, Age).
  - `[x]` Update `services/matchmaking.py` to enforce the 10-second wait threshold for 0-score matches.
- `[x]` 3. **Frontend Integration**
  - `[x]` Update `app/setup/page.tsx` to add a language selection step.
  - `[x]` Update `app/chat/page.tsx` to display matched languages in the chat header.
