import json
import os
import urllib.request

from dotenv import load_dotenv
from google import genai

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

GROK_URL = "https://api.x.ai/v1/chat/completions"
GROK_MODELS = ("grok-4.7", "grok-4.3")


def clean_json_response(text):
    text = text.strip()

    if text.startswith("```"):
        lines = text.splitlines()

        if lines[0].startswith("```"):
            lines = lines[1:]

        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]

        text = "\n".join(lines).strip()

    start = text.find("{")
    end = text.rfind("}")

    if start != -1 and end != -1:
        text = text[start:end + 1]

    return text


def grok_text(prompt):
    key = os.getenv("XAI_API_KEY")

    if not key:
        raise RuntimeError("XAI_API_KEY is missing")

    last_error = None

    for model in GROK_MODELS:
        body = json.dumps({
            "model": model,
            "messages": [
                {"role": "system", "content": "Return only valid JSON."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.4,
        }).encode()
        request = urllib.request.Request(
            GROK_URL,
            data=body,
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
        )

        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                payload = json.loads(response.read().decode())
            return payload["choices"][0]["message"]["content"]
        except Exception as error:
            last_error = error

    raise last_error


def gemini_text(prompt, model):
    response = client.models.generate_content(
        model=model,
        contents=prompt,
    )
    return response.text


def generate_learning_map(topic: str):
    prompt = f"""
You are planning a learning journey for Waypoint.
Decide the concepts, how hard each one is, which concept comes before another, and the order to learn them.
Do not write the lesson explanations. Another step writes those.

The user's learning goal is:

{topic}

Plan a learning map with:
- 5 to 8 concepts
- Each concept needs an id, title, and difficulty from 1 to 5
- Edges showing which concepts should be learned before others
- recommended_order containing the concept ids in the order they should generally be learned

Return ONLY valid JSON in this exact format:

{{
  "topic": "{topic}",
  "nodes": [
    {{
      "id": "unique-id",
      "title": "Concept title",
      "difficulty": 1
    }}
  ],
  "edges": [
    {{
      "source": "first-node-id",
      "target": "next-node-id"
    }}
  ],
  "recommended_order": [
    "first-node-id",
    "second-node-id"
  ]
}}
"""

    data = json.loads(clean_json_response(grok_text(prompt)))

    if isinstance(data, dict) and isinstance(data.get("nodes"), list):
        try:
            write_concept_descriptions(topic, data["nodes"])
        except Exception:
            for node in data["nodes"]:
                node["description"] = node.get("description") or node.get("title") or ""

    return json.dumps(data)


def write_concept_descriptions(topic, nodes):
    concepts = [
        {
            "id": node.get("id"),
            "title": node.get("title"),
            "difficulty": node.get("difficulty"),
        }
        for node in nodes
        if node.get("id") and node.get("title")
    ]
    prompt = f"""
Write the beginner explanation shown on each stop of a learning journey.
One short sentence each. Plain words. Do not add new concepts.

Goal: {topic}
Concepts:
{json.dumps(concepts)}

Return ONLY valid JSON:

{{
  "nodes": [
    {{
      "id": "same-id",
      "description": "One short sentence"
    }}
  ]
}}
"""

    try:
        text = gemini_text(prompt, "gemini-3.5-flash")
    except Exception:
        text = gemini_text(prompt, "gemini-3.5-flash-lite")

    written = json.loads(clean_json_response(text))
    by_id = {}

    for item in written.get("nodes") or []:
        if isinstance(item, dict) and item.get("id"):
            by_id[item["id"]] = str(item.get("description") or "").strip()

    for node in nodes:
        description = by_id.get(node.get("id"))
        node["description"] = description or node.get("title") or ""


def generate_next_waypoint(goal, current_node, visited_nodes, pages, nodes, edges):
    prompt = f"""
You are choosing the next stop on a learning journey that was already planned.
Look at the goal, where the learner is, which concepts they already opened, and which pages they actually read.

Learning goal:
{goal}

Current concept:
{current_node}

Concepts already visited:
{visited_nodes}

Pages the learner has visited:
{pages}

Available learning nodes:
{nodes}

Learning connections:
{edges}

Choose the single best next concept for the learner.

The next concept should:
- Not already be in visited_nodes
- Be connected to the current concept when possible
- Make sense as the next learning step
- Help the learner progress toward the overall goal

Return ONLY valid JSON in this exact format:

{{
  "next_node": "node-id",
  "reason": "Brief explanation of why this should be the next concept."
}}
"""

    return clean_json_response(grok_text(prompt))


def generate_help_islands(topic, title, description, note):
    prompt = f"""
A learner is stuck on one concept in a learning map.
Turn their note into the smaller lessons they are missing.
These are basics or details, not another copy of the same concept.

Goal: {topic}
Concept: {title}
About that concept: {description}
What they said: {note}

Return 1 to 3 lessons. Use only what their note needs.
Return ONLY valid JSON:

{{
  "nodes": [
    {{
      "title": "Short lesson title",
      "description": "One short sentence"
    }}
  ]
}}
"""

    try:
        text = gemini_text(prompt, "gemini-3.5-flash-lite")
    except Exception:
        text = gemini_text(prompt, "gemini-3.5-flash")

    return clean_json_response(text)
