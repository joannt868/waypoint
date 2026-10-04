# Waypoint

Waypoint is a Chrome extension that turns a question into a learning route. You type what you want to learn, and it lays out the ideas in order, finds a real article for each one, and puts them on a map. You move from island to island as you read. An island only counts as done when you click **I understand**.

## How a journey works

1. Type a question in the extension. Waypoint builds a short path of concepts and finds an article or blog for each one. Videos and search pages are left out.
2. Open **Explore your map** to see the same route as islands. The extension and the map share one journey per question.
3. Click an island to open its lesson. The boat moves there, and the edge of that island changes. The inside stays plain until you click **I understand**.
4. **I understand** is what marks a big island done. Progress and the destination use only those marks.
5. If a lesson does not help, choose **This didn't help**. You can swap in another explanation, or describe what you are missing and get smaller islands beside that concept.
6. You can visit those smaller islands, and return to their big island, without marking them. You do not have to finish every smaller island.
7. You can skip a big island you never opened. If you opened one, or any smaller island attached to it, you have to mark that big island with **I understand** before you can open a later big island.
8. Past journeys are listed with a percent, most recent first. Opening one again brings you back to that map. Asking the same question again keeps a single map for it.

The map background follows the question, so different topics do not all look the same. The words stay on a plain surface so they remain easy to read.

## How the models are split

Grok plans the route. It chooses the concepts, the order, and which stop should come next after you have read a few pages.

Gemini writes the short explanation on each island, and the smaller lessons when you say you are lost.

Tavily searches for the lesson links.

## Run it

The extension talks to a backend on `http://127.0.0.1:8000`.

From the project folder, install the backend packages and start the server:

```bash
python3 -m venv venv
source venv/bin/activate
pip install fastapi uvicorn python-dotenv google-genai
uvicorn backend.main:app --reload
```

Create `backend/.env` with:

```
GEMINI_API_KEY=
XAI_API_KEY=
TAVILY_API_KEY=
```

Then load the extension in Chrome:

1. Open `chrome://extensions`
2. Turn on Developer mode
3. Click **Load unpacked** and choose the `frontend` folder

Reload the extension after frontend changes. Restart the backend after Python changes.
