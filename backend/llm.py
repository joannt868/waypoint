import os
from dotenv import load_dotenv
from google import genai

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))


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

    response = client.models.generate_content(
        model="gemini-3.5-flash",
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

    return response.text