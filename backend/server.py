from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, BeforeValidator
from typing import List, Optional, Annotated
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ---------- Mongo base ----------
PyObjectId = Annotated[str, BeforeValidator(str)]


class BaseDocument(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    model_config = {"populate_by_name": True}

    def to_mongo(self) -> dict:
        data = self.model_dump(by_alias=True)
        data.pop("_id", None)
        return data

    @classmethod
    def from_mongo(cls, doc: dict):
        if not doc:
            return None
        return cls.model_validate(doc)


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------- Models ----------
CONDITION_FACTORS = {
    "heart_condition": 0.80,
    "joint_pain": 0.85,
    "asthma": 0.90,
    "hypertension": 0.95,
    "diabetes": 1.05,
    "back_pain": 0.90,
}

ACTIVITY_FACTORS = {
    "sedentary": 0.80,
    "light": 0.90,
    "moderate": 1.00,
    "active": 1.15,
    "athlete": 1.30,
}


class ProfileIn(BaseModel):
    device_id: str
    name: str
    age: int = Field(ge=5, le=110)
    gender: str  # male | female | other
    weight_kg: float = Field(gt=20, lt=400)
    height_cm: float = Field(gt=80, lt=260)
    activity_level: str = "moderate"
    health_conditions: List[str] = []


class Profile(BaseDocument):
    device_id: str
    name: str
    age: int
    gender: str
    weight_kg: float
    height_cm: float
    activity_level: str
    health_conditions: List[str] = []
    step_goal: int = 10000
    calorie_goal: int = 400
    bmr: int = 1600
    created_at: str = Field(default_factory=utcnow_iso)
    updated_at: str = Field(default_factory=utcnow_iso)


class StepsIn(BaseModel):
    device_id: str
    date: str  # YYYY-MM-DD (client local date)
    steps: int = Field(ge=0, le=200000)
    mode: str = "increment"   # increment | set
    source: str = "phone"     # phone | ble


class StepDay(BaseDocument):
    device_id: str
    date: str
    steps: int = 0
    updated_at: str = Field(default_factory=utcnow_iso)


class CoachIn(BaseModel):
    device_id: str
    date: str
    refresh: bool = False


# ---------- Helpers ----------
def compute_goals(age: int, gender: str, weight: float, height: float, activity: str, conditions: List[str]):
    # Base step goal by age
    if age < 30:
        base = 10000
    elif age <= 45:
        base = 9000
    elif age <= 60:
        base = 8000
    else:
        base = 6500
    factor = ACTIVITY_FACTORS.get(activity, 1.0)
    for c in conditions:
        factor *= CONDITION_FACTORS.get(c, 1.0)
    step_goal = int(round(max(3000, min(20000, base * factor)) / 250) * 250)

    # Mifflin-St Jeor BMR
    if gender == "male":
        bmr = 10 * weight + 6.25 * height - 5 * age + 5
    elif gender == "female":
        bmr = 10 * weight + 6.25 * height - 5 * age - 161
    else:
        bmr = 10 * weight + 6.25 * height - 5 * age - 78
    calorie_goal = int(round(step_goal * 0.00057 * weight))
    return step_goal, calorie_goal, int(bmr)


def day_metrics(steps: int, profile: Optional[Profile]):
    weight = profile.weight_kg if profile else 70.0
    height = profile.height_cm if profile else 170.0
    goal = profile.step_goal if profile else 10000
    calories = round(steps * 0.00057 * weight, 1)
    distance_km = round(steps * (height * 0.00415) / 1000, 2)
    active_minutes = int(steps / 110)
    return {
        "steps": steps,
        "goal": goal,
        "progress": round(min(1.0, steps / goal) if goal else 0, 4),
        "calories": calories,
        "calorie_goal": profile.calorie_goal if profile else 400,
        "distance_km": distance_km,
        "active_minutes": active_minutes,
    }


async def get_profile_doc(device_id: str) -> Optional[Profile]:
    doc = await db.profiles.find_one({"device_id": device_id})
    return Profile.from_mongo(doc)


async def get_steps_map(device_id: str) -> dict:
    """Returns {date: total_steps} — used for achievements & streaks."""
    docs = await db.step_days.find(
        {"device_id": device_id},
        {"date": 1, "steps": 1, "_id": 0}
    ).to_list(2000)
    return {d["date"]: d.get("steps", 0) for d in docs}


async def get_steps_map_full(device_id: str) -> dict:
    """Returns {date: {steps, steps_phone, steps_ble}} — used for history chart."""
    docs = await db.step_days.find(
        {"device_id": device_id},
        {"date": 1, "steps": 1, "steps_phone": 1, "steps_ble": 1, "_id": 0}
    ).to_list(2000)
    return {
        d["date"]: {
            "steps": d.get("steps", 0),
            "steps_phone": d.get("steps_phone", 0),
            "steps_ble": d.get("steps_ble", 0),
        }
        for d in docs
    }


def calc_streaks(steps_map: dict, goal: int, today: str):
    # current streak: consecutive days meeting goal ending today (or yesterday if today not yet met)
    def met(d: str) -> bool:
        return steps_map.get(d, 0) >= goal

    today_dt = datetime.strptime(today, "%Y-%m-%d")
    current = 0
    cursor = today_dt if met(today) else today_dt - timedelta(days=1)
    while met(cursor.strftime("%Y-%m-%d")):
        current += 1
        cursor -= timedelta(days=1)

    # best streak over all history
    best = 0
    run = 0
    if steps_map:
        dates = sorted(steps_map.keys())
        prev = None
        for d in dates:
            if steps_map[d] >= goal:
                if prev and (datetime.strptime(d, "%Y-%m-%d") - datetime.strptime(prev, "%Y-%m-%d")).days == 1 and run > 0:
                    run += 1
                else:
                    run = 1
                best = max(best, run)
                prev = d
            else:
                run = 0
                prev = None
    return current, best


# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"message": "AeroStep API"}


@api_router.post("/profile")
async def upsert_profile(body: ProfileIn):
    step_goal, calorie_goal, bmr = compute_goals(
        body.age, body.gender, body.weight_kg, body.height_cm, body.activity_level, body.health_conditions
    )
    existing = await db.profiles.find_one({"device_id": body.device_id})
    profile = Profile(
        **body.model_dump(),
        step_goal=step_goal,
        calorie_goal=calorie_goal,
        bmr=bmr,
    )
    data = profile.to_mongo()
    if existing:
        data["created_at"] = existing.get("created_at", data["created_at"])
        data["updated_at"] = utcnow_iso()
        await db.profiles.update_one({"device_id": body.device_id}, {"$set": data})
    else:
        await db.profiles.insert_one(data)
    saved = await get_profile_doc(body.device_id)
    return saved.model_dump(exclude={"id"})


@api_router.get("/profile/{device_id}")
async def get_profile(device_id: str):
    profile = await get_profile_doc(device_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile.model_dump(exclude={"id"})


@api_router.post("/steps")
async def upsert_steps(body: StepsIn):
    source_field = f"steps_{body.source}"  # "steps_phone" or "steps_ble"
    if body.mode == "set":
        await db.step_days.update_one(
            {"device_id": body.device_id, "date": body.date},
            {"$set": {
                "steps": body.steps,
                source_field: body.steps,
                "last_source": body.source,
                "updated_at": utcnow_iso(),
            }},
            upsert=True,
        )
    else:
        await db.step_days.update_one(
            {"device_id": body.device_id, "date": body.date},
            {
                "$inc": {"steps": body.steps, source_field: body.steps},
                "$set": {"last_source": body.source, "updated_at": utcnow_iso()},
            },
            upsert=True,
        )
    doc = await db.step_days.find_one({"device_id": body.device_id, "date": body.date})
    profile = await get_profile_doc(body.device_id)
    return {"date": body.date, **day_metrics(doc.get("steps", 0), profile)}


@api_router.get("/steps/{device_id}/day/{date}")
async def get_day(device_id: str, date: str):
    doc = await db.step_days.find_one({"device_id": device_id, "date": date})
    profile = await get_profile_doc(device_id)
    steps = doc.get("steps", 0) if doc else 0
    return {"date": date, **day_metrics(steps, profile)}


@api_router.get("/steps/{device_id}/history")
async def get_history(device_id: str, days: int = 7, end: Optional[str] = None):
    profile = await get_profile_doc(device_id)
    full_map = await get_steps_map_full(device_id)
    goal = profile.step_goal if profile else 10000
    end_dt = datetime.strptime(end, "%Y-%m-%d") if end else datetime.now(timezone.utc)
    out = []
    for i in range(days - 1, -1, -1):
        d = (end_dt - timedelta(days=i)).strftime("%Y-%m-%d")
        day_data = full_map.get(d, {})
        s = day_data.get("steps", 0)
        out.append({
            "date": d,
            "steps": s,
            "steps_phone": day_data.get("steps_phone", 0),
            "steps_ble": day_data.get("steps_ble", 0),
            "met_goal": s >= goal,
        })
    total = sum(x["steps"] for x in out)
    active_days = [x for x in out if x["steps"] > 0]
    best = max(out, key=lambda x: x["steps"]) if out else None
    weight = profile.weight_kg if profile else 70.0
    height = profile.height_cm if profile else 170.0
    return {
        "days": out,
        "summary": {
            "total_steps": total,
            "avg_steps": int(total / len(active_days)) if active_days else 0,
            "best_day": best,
            "goal_met_days": sum(1 for x in out if x["met_goal"]),
            "total_distance_km": round(total * (height * 0.00415) / 1000, 1),
            "total_calories": int(total * 0.00057 * weight),
        },
    }


BADGE_DEFS = [
    {"id": "first_steps", "name": "First Steps", "desc": "Walk 1,000 steps in a day", "icon": "footsteps"},
    {"id": "high_five", "name": "High Five", "desc": "Walk 5,000 steps in a day", "icon": "hand-left"},
    {"id": "goal_crusher", "name": "Goal Crusher", "desc": "Hit your daily step goal", "icon": "ribbon"},
    {"id": "ten_k", "name": "10K Club", "desc": "Walk 10,000 steps in a day", "icon": "flash"},
    {"id": "ultra", "name": "Ultra Walker", "desc": "Walk 20,000 steps in a day", "icon": "rocket"},
    {"id": "streak_3", "name": "On Fire", "desc": "3-day goal streak", "icon": "flame"},
    {"id": "streak_7", "name": "Unstoppable", "desc": "7-day goal streak", "icon": "bonfire"},
    {"id": "road_runner", "name": "Road Runner", "desc": "42 km total distance", "icon": "map"},
    {"id": "centurion", "name": "Centurion", "desc": "100,000 total steps", "icon": "trophy"},
]


@api_router.get("/achievements/{device_id}")
async def get_achievements(device_id: str, date: Optional[str] = None):
    profile = await get_profile_doc(device_id)
    goal = profile.step_goal if profile else 10000
    height = profile.height_cm if profile else 170.0
    steps_map = await get_steps_map(device_id)
    today = date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    current_streak, best_streak = calc_streaks(steps_map, goal, today)
    max_day = max(steps_map.values()) if steps_map else 0
    total = sum(steps_map.values())
    total_km = total * (height * 0.00415) / 1000

    unlocked = {
        "first_steps": max_day >= 1000,
        "high_five": max_day >= 5000,
        "goal_crusher": max_day >= goal,
        "ten_k": max_day >= 10000,
        "ultra": max_day >= 20000,
        "streak_3": best_streak >= 3,
        "streak_7": best_streak >= 7,
        "road_runner": total_km >= 42,
        "centurion": total >= 100000,
    }
    badges = [{**b, "unlocked": unlocked.get(b["id"], False)} for b in BADGE_DEFS]
    return {
        "current_streak": current_streak,
        "best_streak": best_streak,
        "total_steps": total,
        "unlocked_count": sum(1 for b in badges if b["unlocked"]),
        "badges": badges,
    }


@api_router.post("/ai/coach")
async def ai_coach(body: CoachIn):
    profile = await get_profile_doc(body.device_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Create your profile first")

    if not body.refresh:
        cached = await db.ai_tips.find_one({"device_id": body.device_id, "date": body.date})
        if cached:
            return {"tip": cached["tip"], "cached": True}

    history = await get_history(body.device_id, days=7, end=body.date)
    days_txt = ", ".join(f"{d['date']}: {d['steps']} steps" for d in history["days"])
    conditions = ", ".join(profile.health_conditions) or "none"

    from emergentintegrations.llm.chat import LlmChat, UserMessage
    chat = LlmChat(
        api_key=os.environ["EMERGENT_LLM_KEY"],
        session_id=f"coach-{body.device_id}-{body.date}",
        system_message=(
            "You are an energetic, concise fitness coach inside a pedometer app. "
            "Reply with exactly 3 short, personalized, actionable tips as bullet points (each under 20 words). "
            "No headers, no intro, no outro. Use plain text bullets starting with '•'. Be motivating and specific to the data."
        ),
    ).with_model("openai", "gpt-4o")
    msg = UserMessage(
        text=(
            f"User: {profile.name}, age {profile.age}, {profile.gender}, {profile.weight_kg}kg, {profile.height_cm}cm. "
            f"Activity level: {profile.activity_level}. Health conditions: {conditions}. "
            f"Daily step goal: {profile.step_goal}. Last 7 days: {days_txt}. "
            f"Today is {body.date}. Give 3 tips."
        )
    )
    try:
        response = await chat.send_message(msg)
    except Exception as e:
        logger.error(f"AI coach error: {e}")
        raise HTTPException(status_code=502, detail="AI coach is unavailable right now")

    tip = str(response).strip()
    await db.ai_tips.update_one(
        {"device_id": body.device_id, "date": body.date},
        {"$set": {"tip": tip, "created_at": utcnow_iso()}},
        upsert=True,
    )
    return {"tip": tip, "cached": False}


@api_router.get("/health")
async def health_check():
    return {"status": "ok"}

app.include_router(api_router)

# CORS: allow all origins explicitly (credentials=False avoids the
# CORS spec conflict where credentials + wildcard origin is forbidden).
# The API uses device_id in the body — no session cookies required.
app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
