from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()


class Goal(BaseModel):
    topic: str


@app.get("/")
def home():
    return {"message": "Waypoint backend is running!"}


@app.post("/generate-map")
def generate_map(goal: Goal):
    return {
        "topic": goal.topic,
        "nodes": [
            {
                "id": "basics",
                "title": "The Basics",
                "description": f"Introduction to {goal.topic}",
                "difficulty": 1
            },
            {
                "id": "fundamentals",
                "title": "Fundamentals",
                "description": f"Core concepts behind {goal.topic}",
                "difficulty": 2
            },
            {
                "id": "applications",
                "title": "Applications",
                "description": f"Real-world applications of {goal.topic}",
                "difficulty": 3
            }
        ],
        "edges": [
            {
                "source": "basics",
                "target": "fundamentals"
            },
            {
                "source": "fundamentals",
                "target": "applications"
            }
        ]
    }