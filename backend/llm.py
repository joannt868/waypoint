import os
from dotenv import load_dotenv
from google import genai

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

def clean_json_response(text):
    text = text.strip()

    # Remove Markdown code fences if Gemini adds them
    if text.startswith("```"):
        lines = text.splitlines()

        if lines[0].startswith("```"):
            lines = lines[1:]

        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]

        text = "\n".join(lines).strip()

    # If Gemini adds extra text around the JSON,
    # extract the JSON object.
    start = text.find("{")
    end = text.rfind("}")

    if start != -1 and end != -1:
        text = text[start:end + 1]

    return text


def generate_learning_map(topic: str):
    prompt = f"""
You are helping build Waypoint, an application that helps people learn
a topic by navigating through a sequence of concepts.

The user's learning goal is:

{topic}

Generate a learning map with:
- 5 to 8 concepts
- Each concept should have an id, title, description, and difficulty from 1 to 5
- Create edges showing which concepts should be learned before others

Return ONLY valid JSON in this exact format:

{{
  "topic": "{topic}",
  "nodes": [
    {{
      "id": "unique-id",
      "title": "Concept title",
      "description": "Short description",
      "difficulty": 1
    }}
  ],
  "edges": [
    {{
      "source": "first-node-id",
      "target": "next-node-id"
    }}
  ]
}}
"""

    try:
        response = client.models.generate_content(
            model="gemini-3.5-flash",
            contents=prompt
        )
    except Exception:
        response = client.models.generate_content(
            model="gemini-3.5-flash-lite",
            contents=prompt
        )

    return response.text



def generate_next_waypoint(goal, current_node, visited_nodes, nodes, edges):
    prompt = f"""
You are the navigation engine for Waypoint, an application that helps
people learn a topic by navigating through a sequence of concepts.

Learning goal:
{goal}

Current concept:
{current_node}

Concepts already visited:
{visited_nodes}

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

    response = client.models.generate_content(
        model="gemini-3.5-flash",
        contents=prompt
    )

    return clean_json_response(response.text)