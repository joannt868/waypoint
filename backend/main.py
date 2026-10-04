from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json

from .llm import generate_help_islands, generate_learning_map, generate_next_waypoint
from .resources import attach_resources, search_lesson_urls

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Goal(BaseModel):
    topic: str


class WaypointRequest(BaseModel):
    goal: str
    current_node: str
    visited_nodes: list[str]
    pages: list[dict]
    nodes: list[dict]
    edges: list[dict]


class LinksRequest(BaseModel):
    topic: str = ""
    nodes: list[dict]


class SearchRequest(BaseModel):
    title: str
    topic: str = ""
    skip: list[str] = []


class HelpRequest(BaseModel):
    topic: str = ""
    title: str
    description: str = ""
    note: str


@app.get("/")
def home():
    return {"message": "Waypoint backend is running!"}


@app.post("/generate-map")
def generate_map(goal: Goal):
    response = generate_learning_map(goal.topic)
    data = json.loads(response)

    if isinstance(data, dict) and isinstance(data.get("nodes"), list):
        try:
            attach_resources(data.get("topic") or goal.topic, data["nodes"])
        except Exception:
            pass

    return data


@app.post("/search-lesson")
def search_lesson(request: SearchRequest):
    return {
        "urls": search_lesson_urls(request.title, request.topic, request.skip)
    }


@app.post("/learning-links")
def learning_links(request: LinksRequest):
    nodes = attach_resources(request.topic, request.nodes)

    return {
        "links": [
            {
                "id": node.get("id"),
                "resource_url": node.get("resource_url"),
            }
            for node in nodes
        ]
    }


@app.post("/help-islands")
def help_islands(request: HelpRequest):
    note = request.note.strip()

    if not note:
        return {"nodes": []}

    response = generate_help_islands(
        request.topic,
        request.title,
        request.description,
        note[:500]
    )
    data = json.loads(response)
    nodes = data.get("nodes") if isinstance(data, dict) else []
    cleaned = []

    for node in nodes[:3]:
        if not isinstance(node, dict):
            continue

        title = str(node.get("title") or "").strip()

        if not title:
            continue

        cleaned.append({
            "title": title[:80],
            "description": str(node.get("description") or "").strip()[:160]
        })

    return {"nodes": cleaned}


@app.post("/next-waypoint")
def next_waypoint(request: WaypointRequest):
    response = generate_next_waypoint(
        request.goal,
        request.current_node,
        request.visited_nodes,
        request.pages,
        request.nodes,
        request.edges
    )

    return json.loads(response)