const LESSON_STOP_WORDS = new Set([
    "the", "a", "an", "of", "and", "to", "for", "with", "your", "into",
    "what", "is", "how", "does", "basics", "basic", "introduction", "intro",
    "understanding", "learn", "learning", "guide", "beginner", "beginners",
    "overview", "fundamentals", "getting", "started", "about"
]);

const DIRECT_LESSONS = {
    html: "https://developer.mozilla.org/en-US/docs/Learn/HTML",
    css: "https://developer.mozilla.org/en-US/docs/Learn/CSS",
    javascript: "https://developer.mozilla.org/en-US/docs/Learn/JavaScript",
    python: "https://docs.python.org/3/tutorial/"
};

function significantWords(text) {
    return (String(text || "").toLowerCase().match(/[a-z0-9]+/g) || [])
        .filter((word) => word.length > 2 && !LESSON_STOP_WORDS.has(word));
}

function isSkippedLesson(url) {
    if (!url) {
        return false;
    }

    try {
        const parsed = new URL(url);
        const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
        const path = parsed.pathname.toLowerCase();
        const discussionHosts = [
            "reddit.com",
            "quora.com",
            "stackoverflow.com",
            "stackexchange.com",
            "discord.com",
            "news.ycombinator.com",
            "facebook.com",
            "twitter.com",
            "x.com"
        ];
        const videoHosts = [
            "youtube.com",
            "youtu.be",
            "vimeo.com",
            "tiktok.com",
            "dailymotion.com",
            "twitch.tv",
            "rumble.com"
        ];

        if (host.includes("wikipedia.org")) {
            return true;
        }

        if (discussionHosts.some((site) => host === site || host.endsWith(`.${site}`))) {
            return true;
        }

        if (videoHosts.some((site) => host === site || host.endsWith(`.${site}`))) {
            return true;
        }

        return path.includes("/comments/")
            || path.includes("/forum")
            || path.includes("/watch")
            || path.includes("/videos")
            || path.replace(/\/$/, "").endsWith("/video")
            || /\.(mp4|mov|webm|m4v)$/.test(path);
    } catch {
        return false;
    }
}

function isRealLesson(url) {
    if (!url || !/^https?:\/\//i.test(url)) {
        return false;
    }

    try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();

        if (host.includes("google.") && parsed.pathname.startsWith("/search")) {
            return false;
        }

        return true;
    } catch {
        return false;
    }
}

function directLesson(title) {
    const words = significantWords(title);

    if (words.length === 1 && DIRECT_LESSONS[words[0]]) {
        return DIRECT_LESSONS[words[0]];
    }

    return "";
}

function conceptUrl(node) {
    if (isRealLesson(node.resource_url)) {
        return node.resource_url;
    }

    return directLesson(node.title);
}

function resourceLabel(node) {
    const url = conceptUrl(node);

    if (!url) {
        return "";
    }

    try {
        const parsed = new URL(url);
        const host = parsed.hostname.replace(/^www\./, "");
        const tail = parsed.pathname.split("/").filter(Boolean).pop();

        if (!tail) {
            return host;
        }

        const name = decodeURIComponent(tail)
            .replace(/\.\w+$/, "")
            .replace(/[-_]/g, " ");

        if (!name || name.length > 40) {
            return host;
        }

        return `${host} - ${name}`;
    } catch {
        return "";
    }
}

async function searchLessons(title, topic, skip) {
    const response = await fetch("http://127.0.0.1:8000/search-lesson", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            title,
            topic: topic || "",
            skip: skip || []
        })
    });

    if (!response.ok) {
        return [];
    }

    const data = await response.json();

    return (data.urls || []).filter((url) => isRealLesson(url) && !isSkippedLesson(url));
}

async function resolveLessonUrl(title, topic) {
    const urls = await searchLessons(title, topic, []);
    return urls[0] || "";
}

async function findMdnLesson(query) {
    const urls = await findMdnLessons(query);
    return urls[0] || "";
}

async function findMdnLessons(query) {
    const response = await fetch(
        "https://developer.mozilla.org/api/v1/search?" + new URLSearchParams({
            q: query,
            locale: "en-US"
        })
    );

    if (!response.ok) {
        return [];
    }

    const data = await response.json();
    const words = significantWords(query);

    if (words.length === 0) {
        return [];
    }

    const urls = [];

    for (const doc of (data.documents || []).slice(0, 8)) {
        let path = doc.mdn_url || "";
        const haystack = `${doc.title || ""} ${path}`.toLowerCase();

        if (!path.startsWith("/docs/") && !path.startsWith("/en-US/docs/")) {
            continue;
        }

        if (!words.every((word) => haystack.includes(word))) {
            continue;
        }

        if (path.startsWith("/docs/")) {
            path = `/en-US${path}`;
        }

        urls.push(`https://developer.mozilla.org${path}`);
    }

    return urls;
}

async function findWikipediaLesson(query) {
    const urls = await findWikipediaLessons(query);
    return urls[0] || "";
}

async function findWikipediaLessons(query, origin = "https://en.wikipedia.org") {
    const response = await fetch(
        `${origin}/w/api.php?` + new URLSearchParams({
            action: "query",
            generator: "search",
            gsrsearch: query,
            gsrlimit: "3",
            prop: "info",
            inprop: "url",
            format: "json",
            origin: "*"
        })
    );

    if (!response.ok) {
        return [];
    }

    const data = await response.json();
    const pages = data.query && data.query.pages ? Object.values(data.query.pages) : [];

    return pages
        .filter((item) => item.fullurl && !item.missing)
        .sort((a, b) => (a.index || 0) - (b.index || 0))
        .map((item) => item.fullurl);
}

const EASIER_SITES = [
    "khanacademy.org",
    "investopedia.com",
    "freecodecamp.org",
    "w3schools.com",
    "javascript.info",
    "theodinproject.com",
    "realpython.com",
    "mathsisfun.com",
    "wikihow.com",
    "geeksforgeeks.org",
    "simple.wikipedia.org",
    "developer.mozilla.org"
];

function easierRank(url) {
    let host = "";

    try {
        host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
        return null;
    }

    if (host.includes("google.") || host.includes("duckduckgo.") || host.includes("bing.")) {
        return null;
    }

    const preferred = EASIER_SITES.findIndex((site) => host === site || host.endsWith(`.${site}`));

    if (preferred !== -1) {
        return preferred;
    }

    if (host.endsWith("wikipedia.org")) {
        return 80;
    }

    return 40;
}

async function findEasierLessons(query) {
    const urls = [];

    for (const endpoint of [
        "https://html.duckduckgo.com/html/",
        "https://lite.duckduckgo.com/lite/"
    ]) {
        try {
            const response = await fetch(`${endpoint}?${new URLSearchParams({
                q: `${query} explained simply`
            })}`);

            if (!response.ok) {
                continue;
            }

            const html = await response.text();

            for (const match of html.matchAll(/uddg=([^&"']+)/g)) {
                urls.push(decodeURIComponent(match[1]));
            }

            for (const match of html.matchAll(/href="(https?:\/\/[^"]+)"[^>]*class="result-link"|class="result-link"[^>]*href="(https?:\/\/[^"]+)"/g)) {
                urls.push(match[1] || match[2]);
            }

            if (urls.length > 0) {
                break;
            }
        } catch (error) {
            console.error("Lesson lookup failed:", error);
        }
    }

    return urls
        .filter((url) => {
            const rank = easierRank(url);
            return rank !== null && rank < 40;
        })
        .sort((a, b) => easierRank(a) - easierRank(b));
}

async function findSimpleWikipediaLesson(query) {
    const urls = await findWikipediaLessons(query, "https://simple.wikipedia.org");
    return urls[0] || "";
}

function lessonKey(url) {
    try {
        const parsed = new URL(url);
        const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
        const path = parsed.pathname.replace(/\/$/, "").toLowerCase();
        return `${host}${path}`;
    } catch {
        return String(url || "").toLowerCase();
    }
}

async function lessonChoices(title, topic, skip) {
    return searchLessons(title, topic, skip || []);
}

async function replaceLesson(node, topic) {
    const current = conceptUrl(node);
    const skipped = new Set((node.skipped_urls || []).map(lessonKey));

    if (current) {
        skipped.add(lessonKey(current));
    }

    const choices = await lessonChoices(node.title, topic || "", [...(node.skipped_urls || []), current].filter(Boolean));
    const next = choices.find((url) => !skipped.has(lessonKey(url))) || "";

    node.skipped_urls = node.skipped_urls || [];

    if (current && !node.skipped_urls.some((url) => lessonKey(url) === lessonKey(current))) {
        node.skipped_urls.push(current);
    }

    if (next) {
        node.resource_url = next;
    }

    return next;
}

async function ensureResourceLinks(mapData, topic) {
    const nodes = mapData.nodes || [];
    let changed = false;

    await Promise.all(nodes.map(async (node) => {
        const replaceSaved = isSkippedLesson(node.resource_url);

        if (isRealLesson(node.resource_url) && !replaceSaved) {
            return;
        }

        const url = (await searchLessons(
            node.title,
            topic || mapData.topic || "",
            replaceSaved ? [node.resource_url] : []
        ))[0] || "";

        if (node.resource_checked) {
            delete node.resource_checked;
            changed = true;
        }

        if (url && node.resource_url !== url) {
            node.resource_url = url;
            changed = true;
        }
    }));

    if (changed) {
        mapData.nodes = nodes;
    }

    return mapData;
}

async function openLesson(node, topic) {
    let url = conceptUrl(node);

    if (!url) {
        url = await resolveLessonUrl(node.title, topic || "");

        if (url) {
            node.resource_url = url;
        }
    }

    if (!url) {
        return "";
    }

    node.resource_url = url;
    chrome.tabs.create({ url });

    return url;
}

function orderedMapNodes(mapData) {
    const nodes = (mapData && mapData.nodes) || [];
    const remaining = new Map(nodes.map((node) => [node.id, node]));
    const ordered = [];

    (mapData.recommended_order || []).forEach((id) => {
        if (!remaining.has(id)) {
            return;
        }

        ordered.push(remaining.get(id));
        remaining.delete(id);
    });

    nodes.forEach((node) => {
        if (remaining.has(node.id)) {
            ordered.push(node);
        }
    });

    return ordered;
}

function progressFor(mapData, visitedNodes) {
    const nodes = orderedMapNodes(mapData);
    const visited = visitedNodes || [];
    const done = nodes.filter((node) => visited.includes(node.id)).length;
    const total = nodes.length;
    const percent = total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100));

    return { done, total, percent };
}

function mapPageUrl(id) {
    const base = chrome.runtime.getURL("map.html");

    return id ? `${base}?map=${encodeURIComponent(id)}` : base;
}

function topicKey(topic) {
    return String(topic || "").trim().toLowerCase();
}

function betterMap(current, candidate) {
    const currentDone = progressFor(current, current.visitedNodes).done;
    const candidateDone = progressFor(candidate, candidate.visitedNodes).done;

    if (candidateDone !== currentDone) {
        return candidateDone > currentDone ? candidate : current;
    }

    return (candidate.updatedAt || 0) > (current.updatedAt || 0) ? candidate : current;
}

function dedupeMaps(savedMaps, activeMapId) {
    const kept = [];

    savedMaps.forEach((map) => {
        const key = topicKey(map.topic);

        if (!key) {
            kept.push(map);
            return;
        }

        const index = kept.findIndex((item) => topicKey(item.topic) === key);

        if (index < 0) {
            kept.push(map);
            return;
        }

        kept[index] = betterMap(kept[index], map);
    });

    const keptIds = new Set(kept.map((map) => map.id));
    let nextActive = activeMapId;

    if (activeMapId && !keptIds.has(activeMapId)) {
        const active = savedMaps.find((map) => map.id === activeMapId);
        const survivor = active && kept.find((map) => topicKey(map.topic) === topicKey(active.topic));

        if (survivor) {
            nextActive = survivor.id;
        }
    }

    return {
        savedMaps: kept,
        activeMapId: nextActive,
        changed: kept.length !== savedMaps.length || nextActive !== activeMapId
    };
}

async function readMaps(existing) {
    const data = existing || await chrome.storage.local.get({
        savedMaps: [],
        activeMapId: "",
        mapData: null,
        visitedNodes: []
    });
    let savedMaps = Array.isArray(data.savedMaps) ? data.savedMaps : [];
    let activeMapId = data.activeMapId || "";
    const deduped = dedupeMaps(savedMaps, activeMapId);

    savedMaps = deduped.savedMaps;
    activeMapId = deduped.activeMapId;

    if (deduped.changed) {
        await chrome.storage.local.set({
            savedMaps: savedMaps,
            activeMapId: activeMapId
        });
    }

    if (!savedMaps.length && data.mapData && data.mapData.nodes) {
        activeMapId = activeMapId || `map-${Date.now()}`;
        savedMaps = [{
            id: activeMapId,
            topic: data.mapData.topic || "",
            nodes: data.mapData.nodes,
            edges: data.mapData.edges || [],
            recommended_order: data.mapData.recommended_order || [],
            visitedNodes: data.visitedNodes || [],
            updatedAt: Date.now()
        }];
        await chrome.storage.local.set({
            savedMaps: savedMaps,
            activeMapId: activeMapId
        });
    }

    return {
        savedMaps: sortMaps(savedMaps),
        activeMapId: activeMapId
    };
}

function sortMaps(maps) {
    return [...maps].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

async function writeMapRecord(record, makeActive, keepTime) {
    const data = await chrome.storage.local.get({
        savedMaps: [],
        activeMapId: ""
    });
    const savedMaps = Array.isArray(data.savedMaps) ? data.savedMaps : [];
    const next = {
        id: record.id,
        topic: record.topic || "",
        nodes: record.nodes || [],
        edges: record.edges || [],
        recommended_order: record.recommended_order || [],
        visitedNodes: record.visitedNodes || [],
        updatedAt: Date.now()
    };
    let index = savedMaps.findIndex((item) => item.id === next.id);

    if (index < 0 && topicKey(next.topic)) {
        index = savedMaps.findIndex((item) => topicKey(item.topic) === topicKey(next.topic));
    }

    if (index >= 0) {
        const previous = savedMaps[index];
        next.id = previous.id;
        next.visitedNodes = [...new Set([
            ...(previous.visitedNodes || []),
            ...(next.visitedNodes || [])
        ])];

        if (keepTime) {
            next.updatedAt = previous.updatedAt || next.updatedAt;
        }

        savedMaps[index] = next;
    } else {
        savedMaps.unshift(next);
    }

    const ordered = sortMaps(savedMaps);
    const patch = { savedMaps: ordered };

    if (makeActive || next.id === data.activeMapId) {
        patch.activeMapId = next.id;
        patch.learningGoal = next.topic;
        patch.visitedNodes = next.visitedNodes;
        patch.mapData = {
            topic: next.topic,
            nodes: next.nodes,
            edges: next.edges,
            recommended_order: next.recommended_order
        };
    }

    await chrome.storage.local.set(patch);
    return ordered;
}

async function touchSavedMap(id) {
    const data = await chrome.storage.local.get({ savedMaps: [] });
    const savedMaps = Array.isArray(data.savedMaps) ? data.savedMaps : [];
    const index = savedMaps.findIndex((item) => item.id === id);

    if (index < 0) {
        return savedMaps;
    }

    const map = savedMaps[index];
    map.updatedAt = Date.now();
    savedMaps.splice(index, 1);
    savedMaps.unshift(map);
    await chrome.storage.local.set({ savedMaps: savedMaps });
    return savedMaps;
}

function renderSavedMaps(container, maps) {
    if (!container) {
        return;
    }

    function escapeText(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;");
    }

    if (!maps || !maps.length) {
        container.innerHTML = `<div class="maps-empty">Your maps will show up here</div>`;
        return;
    }

    const ordered = sortMaps(maps);

    container.innerHTML = ordered.map((map) => {
        const progress = progressFor(map, map.visitedNodes);

        return `
            <button class="saved-map" type="button" data-map-id="${escapeText(map.id)}">
                <span class="saved-map-top">
                    <span class="saved-map-title">${escapeText(map.topic || "Untitled map")}</span>
                    <span class="saved-map-percent">${progress.percent}%</span>
                </span>
                <span class="saved-map-track"><span style="width: ${progress.percent}%"></span></span>
            </button>
        `;
    }).join("");

    container.querySelectorAll(".saved-map").forEach((button) => {
        button.addEventListener("click", async () => {
            await touchSavedMap(button.dataset.mapId);
            chrome.tabs.create({
                url: mapPageUrl(button.dataset.mapId)
            });
        });
    });
}
