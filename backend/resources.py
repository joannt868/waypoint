import json
import os
import re
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

STOP_WORDS = {
    "the", "a", "an", "of", "and", "to", "for", "with", "your", "into",
    "what", "is", "how", "does", "basics", "basic", "introduction", "intro",
    "understanding", "learn", "learning", "guide", "beginner", "beginners",
    "overview", "fundamentals", "getting", "started", "about",
}

DIRECT_LESSONS = {
    "html": "https://developer.mozilla.org/en-US/docs/Learn/HTML",
    "css": "https://developer.mozilla.org/en-US/docs/Learn/CSS",
    "javascript": "https://developer.mozilla.org/en-US/docs/Learn/JavaScript",
    "python": "https://docs.python.org/3/tutorial/",
}

_cache = {}


def attach_resources(topic, nodes):
    """Add a real lesson URL to each concept. Does not call Gemini."""
    missing = [node for node in nodes if not is_real_lesson(node.get("resource_url")) and (node.get("title") or "").strip()]

    if not missing:
        return nodes

    with ThreadPoolExecutor(max_workers=min(6, len(missing))) as pool:
        futures = {
            pool.submit(find_learning_resource, node.get("title", ""), topic or ""): node
            for node in missing
        }

        for future in as_completed(futures):
            node = futures[future]

            try:
                url = future.result()
            except Exception:
                url = None

            node.pop("resource_checked", None)

            if url:
                node["resource_url"] = url

    return nodes


def find_learning_resource(title, topic=""):
    title = (title or "").strip()
    topic = (topic or "").strip()
    key = (title.lower(), topic.lower())

    if not title:
        return None

    if _cache.get(key):
        return _cache[key]

    urls = search_lesson_urls(title, topic)
    url = urls[0] if urls else None

    if url:
        _cache[key] = url

    return url


def search_lesson_urls(title, topic="", skip=None):
    title = (title or "").strip()
    topic = (topic or "").strip()

    if not title:
        return []

    query = title if not topic or topic.lower() in title.lower() else f"{title} {topic}"
    return tavily_search(f"{query} for beginners", skip or [])


def tavily_search(query, skip_urls):
    api_key = os.getenv("TAVILY_API_KEY")

    if not api_key:
        return []

    payload = json.dumps({
        "api_key": api_key,
        "query": query,
        "search_depth": "basic",
        "max_results": 8,
        "include_answer": False,
        "exclude_domains": [
            "wikipedia.org",
            "simple.wikipedia.org",
            "reddit.com",
            "quora.com",
            "stackoverflow.com",
            "stackexchange.com",
            "discord.com",
            "news.ycombinator.com",
            "youtube.com",
            "youtu.be",
            "m.youtube.com",
            "vimeo.com",
            "tiktok.com",
            "dailymotion.com",
            "twitch.tv",
            "rumble.com",
        ],
    }).encode()

    request = urllib.request.Request(
        "https://api.tavily.com/search",
        data=payload,
        headers={"Content-Type": "application/json"},
    )

    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            data = json.loads(response.read().decode("utf-8", "replace"))
    except Exception:
        return []

    skipped = {lesson_key(url) for url in skip_urls}
    urls = []

    for item in data.get("results") or []:
        url = item.get("url") or ""
        host = urllib.parse.urlparse(url).netloc.lower()

        if not url.startswith("http"):
            continue

        if is_skipped_site(url, host):
            continue

        if lesson_key(url) in skipped or url in urls:
            continue

        urls.append(url)

    return urls


def is_skipped_site(url, host):
    host = host.lower().removeprefix("www.")
    path = urllib.parse.urlparse(url).path.lower()
    discussion_hosts = (
        "reddit.com",
        "quora.com",
        "stackoverflow.com",
        "stackexchange.com",
        "discord.com",
        "news.ycombinator.com",
        "facebook.com",
        "twitter.com",
        "x.com",
    )
    video_hosts = (
        "youtube.com",
        "youtu.be",
        "vimeo.com",
        "tiktok.com",
        "dailymotion.com",
        "twitch.tv",
        "rumble.com",
    )

    if "wikipedia.org" in host or "google." in host or host.endswith("duckduckgo.com"):
        return True

    if any(host == site or host.endswith("." + site) for site in discussion_hosts):
        return True

    if any(host == site or host.endswith("." + site) for site in video_hosts):
        return True

    if "/comments/" in path or "/forum" in path or "/watch" in path or "/videos" in path:
        return True

    if path.rstrip("/").endswith("/video"):
        return True

    if path.endswith((".mp4", ".mov", ".webm", ".m4v")):
        return True

    return False


def lesson_key(url):
    parsed = urllib.parse.urlparse(url)
    host = parsed.netloc.lower().removeprefix("www.")
    path = parsed.path.rstrip("/").lower()
    return f"{host}{path}"


def direct_lesson(title):
    words = significant_words(title)

    if len(words) == 1 and words[0] in DIRECT_LESSONS:
        return DIRECT_LESSONS[words[0]]

    return None


def find_mdn(query):
    try:
        payload = fetch_json(
            "https://developer.mozilla.org/api/v1/search?" + urllib.parse.urlencode({
                "q": query,
                "locale": "en-US",
            })
        )
    except Exception:
        return None

    for doc in (payload.get("documents") or [])[:5]:
        path = doc.get("mdn_url") or ""
        title = doc.get("title") or ""

        if not path.startswith("/docs/") and not path.startswith("/en-US/docs/"):
            continue

        if not matches_query(query, f"{title} {path}"):
            continue

        if path.startswith("/docs/"):
            path = "/en-US" + path

        return "https://developer.mozilla.org" + path

    return None


def wikipedia_page(query):
    try:
        payload = fetch_json(
            "https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode({
                "action": "query",
                "generator": "search",
                "gsrsearch": query,
                "gsrlimit": 1,
                "prop": "info",
                "inprop": "url",
                "format": "json",
            }),
            "Waypoint/1.0 (educational browser extension)",
        )
    except Exception:
        return None

    pages = (payload.get("query") or {}).get("pages") or {}

    for page in pages.values():
        if page.get("missing"):
            continue

        if page.get("fullurl"):
            return page["fullurl"]

    return None


def significant_words(text):
    return [
        word for word in re.findall(r"[a-z0-9]+", text.lower())
        if len(word) > 2 and word not in STOP_WORDS
    ]


def matches_query(query, text):
    words = significant_words(query)

    if not words:
        return False

    haystack = text.lower()
    return all(word in haystack for word in words)


def is_real_lesson(url):
    if not url or not url.startswith("http"):
        return False

    host = urllib.parse.urlparse(url).netloc.lower()
    path = urllib.parse.urlparse(url).path.lower()

    if "google." in host and path.startswith("/search"):
        return False

    return True


def fetch_json(url, user_agent="Mozilla/5.0"):
    request = urllib.request.Request(url, headers={"User-Agent": user_agent})

    with urllib.request.urlopen(request, timeout=8) as response:
        return json.loads(response.read().decode("utf-8", "replace"))
