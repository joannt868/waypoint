from fastapi import FastAPI
from pydantic import BaseModel
import json

from .llm import generate_learning_map, generate_next_waypoint

app = FastAPI()


class Goal(BaseModel):
    topic: str


class WaypointRequest(BaseModel):
    goal: str
    current_node: str
    visited_nodes: list[str]
    nodes: list[dict]
    edges: list[dict]


@app.get("/")
def home():
    return {"message": "Waypoint backend is running!"}


@app.post("/generate-map")
def generate_map(goal: Goal):
    response = generate_learning_map(goal.topic)
    return json.loads(response)


@app.post("/next-waypoint")
def next_waypoint(request: WaypointRequest):
    response = generate_next_waypoint(
        request.goal,
        request.current_node,
        request.visited_nodes,
        request.nodes,
        request.edges
    )

    return json.loads(response)