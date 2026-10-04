// =========================
// Learning state
// =========================

let learningGoal = "";
let learningNodes = [];
let learningEdges = [];
let recommendedOrder = [];
let visitedNodes = [];
let currentNode = "";
let activeMapId = "";

function orderedLearningNodes() {
    const remaining = new Map(learningNodes.map((node) => [node.id, node]));
    const ordered = [];

    recommendedOrder.forEach((id) => {
        if (!remaining.has(id)) {
            return;
        }

        ordered.push(remaining.get(id));
        remaining.delete(id);
    });

    learningNodes.forEach((node) => {
        if (remaining.has(node.id)) {
            ordered.push(node);
        }
    });

    return ordered;
}

function renderJourneyProgress() {
    const list = document.getElementById("progress-list");
    const count = document.getElementById("progress-count");
    const percentLabel = document.getElementById("progress-percent");
    const fill = document.getElementById("progress-fill");
    const nodes = orderedLearningNodes();
    const total = nodes.length;
    const completed = nodes.filter((node) => visitedNodes.includes(node.id)).length;
    const percent = total === 0 ? 0 : Math.min(100, Math.round((completed / total) * 100));
    const currentId = currentNode || "";

    count.textContent = total === 0
        ? "0 / 0 concepts"
        : `${completed} / ${total} concepts completed`;
    percentLabel.textContent = `${percent}%`;
    fill.style.width = `${percent}%`;
    fill.classList.toggle("complete", total > 0 && percent === 100);

    if (total === 0) {
        list.innerHTML = `
            <div class="progress-empty">Generate a map to track progress</div>
        `;
        return;
    }

    list.innerHTML = nodes.map((node) => {
        const visited = visitedNodes.includes(node.id);
        const isCurrent = node.id === currentId;
        let state = "upcoming";
        let mark = "○";

        const finished = total > 0 && completed >= total;

        if (!finished && isCurrent) {
            state = "current";
            mark = "🚤";
        } else if (visited) {
            state = "done";
            mark = "✓";
        }

        return `
            <div class="progress-item ${state}">
                <span class="progress-mark">${mark}</span>
                <span class="progress-name">${escapeHtml(node.title)}</span>
                ${!finished && isCurrent ? `<span class="progress-here">You are here</span>` : ""}
            </div>
        `;
    }).join("");
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

const DESTINATION_THEMES = [
    { pattern: /stock|market|invest|finance|money|bank|trading|economy/, icons: ["📈", "💰", "🏦"] },
    { pattern: /plane|airplane|flight|fly|airport|aviation|aircraft/, icons: ["✈️", "☁️", "🛫"] },
    { pattern: /neural|machine learning|artificial|algorithm/, icons: ["🧠", "🔗", "💻"] },
    { pattern: /immune|antibod|virus|cell|disease|health/, icons: ["🛡️", "🔬", "💊"] },
    { pattern: /revolution|french|france|paris|history|empire|king/, icons: ["⚜️", "📜", "🏛️"] },
    { pattern: /space|planet|star|orbit|moon|galaxy|nasa/, icons: ["🚀", "🌙", "✨"] },
    { pattern: /music|song|piano|guitar|melody/, icons: ["🎵", "🎹", "🎶"] },
    { pattern: /ocean|sea|marine|whale|coral/, icons: ["🐠", "🐚", "⚓"] }
];

function getDestinationTheme(goal) {
    const text = String(goal || "").toLowerCase();
    const match = DESTINATION_THEMES.find((theme) => theme.pattern.test(text));

    return match || { icons: ["🏝️", "✨", "🗺️"] };
}

function journeyIsComplete() {
    const nodes = orderedLearningNodes();

    return nodes.length > 0 && nodes.every((node) => visitedNodes.includes(node.id));
}

function lastMainVisited() {
    const ids = new Set(learningNodes.map((node) => node.id));

    for (let index = visitedNodes.length - 1; index >= 0; index -= 1) {
        if (ids.has(visitedNodes[index])) {
            return visitedNodes[index];
        }
    }

    return "";
}

async function savePopupMap(keepTime) {
    if (!learningNodes.length) {
        return;
    }

    const library = await readMaps();
    const stillThere = library.savedMaps.some((item) => item.id === activeMapId);

    if (!stillThere) {
        const same = library.savedMaps.find((item) => topicKey(item.topic) === topicKey(learningGoal));
        activeMapId = same ? same.id : `map-${Date.now()}`;
    }

    const existing = library.savedMaps.find((item) => item.id === activeMapId);

    if (existing) {
        learningNodes.forEach((node) => {
            const saved = (existing.nodes || []).find((item) => item.id === node.id);

            if (saved && saved.details) {
                node.details = saved.details;
            }
        });
        visitedNodes = [...new Set([...(existing.visitedNodes || []), ...visitedNodes])];
    }

    const savedMaps = await writeMapRecord({
        id: activeMapId,
        topic: learningGoal,
        nodes: learningNodes,
        edges: learningEdges,
        recommended_order: recommendedOrder,
        visitedNodes: visitedNodes
    }, true, keepTime);

    renderSavedMaps(document.getElementById("saved-maps"), savedMaps);
}

function getNodeState(node) {
    if (journeyIsComplete()) {
        return visitedNodes.includes(node.id) ? "completed" : "upcoming";
    }

    if (node.id === currentNode) {
        return "current";
    }

    if (visitedNodes.includes(node.id)) {
        return "completed";
    }

    return "upcoming";
}

function renderIsland(node, sailed) {
    const state = getNodeState(node);
    const island = document.createElement("div");
    const source = resourceLabel(node);

    island.className = "waypoint-stop";
    island.innerHTML = `
        <div class="sea-route ${sailed ? "sailed" : ""}"></div>
        <div class="island ${state}">
            <div class="island-mark">
                <span class="island-emoji">🏝️</span>
                ${state === "current" ? `<span class="boat">🚤</span>` : ""}
            </div>
            <div class="island-copy">
                <div class="island-title">${escapeHtml(node.title)}</div>
                ${state === "completed" ? `<div class="island-note">Visited</div>` : ""}
                ${state === "current" ? `<div class="island-note">You are here</div>` : ""}
                <div class="island-desc">${escapeHtml(node.description || "")}</div>
                <div class="island-source">${escapeHtml(source)}</div>
            </div>
        </div>
    `;

    const body = island.querySelector(".island");
    const anotherButton = document.createElement("button");
    anotherButton.type = "button";
    anotherButton.className = "another-lesson";
    anotherButton.textContent = "This didn't help";

    anotherButton.addEventListener("click", async (event) => {
        event.stopPropagation();

        anotherButton.disabled = true;
        anotherButton.textContent = "Looking...";

        const url = await replaceLesson(node, learningGoal);
        await savePopupMap();
        const sourceElement = island.querySelector(".island-source");

        if (url && sourceElement) {
            sourceElement.textContent = resourceLabel(node);
        }

        anotherButton.disabled = false;
        anotherButton.textContent = url ? "This didn't help" : "No other lesson found";
    });

    island.querySelector(".island-copy").appendChild(anotherButton);

    body.addEventListener("click", async () => {
        await openLesson(node, learningGoal);
        currentNode = node.id;

        if (!visitedNodes.includes(node.id)) {
            visitedNodes.push(node.id);
        }

        await savePopupMap();

        renderLearningJourney();
        renderJourneyProgress();
    });

    return island;
}

function renderDestination() {
    const theme = getDestinationTheme(learningGoal);
    const complete = journeyIsComplete();
    const nodes = orderedLearningNodes();
    const last = nodes[nodes.length - 1];
    const sailed = Boolean(last) && visitedNodes.includes(last.id);
    const destination = document.createElement("div");

    destination.className = `destination ${complete ? "reached" : ""}`;
    destination.innerHTML = `
        <div class="sea-route ${sailed ? "sailed" : ""}"></div>
        <div class="destination-land">
            ${complete ? `<span class="boat destination-boat">🚤</span>` : ""}
            <div class="destination-icons">${theme.icons.join(" ")}</div>
            <div class="destination-label">Destination</div>
            <div class="destination-title">${escapeHtml(learningGoal || "Your goal")}</div>
            ${complete ? `<div class="destination-done">Journey complete. You've reached your destination.</div>` : ""}
        </div>
    `;

    return destination;
}

function renderLearningJourney() {
    const map = document.getElementById("map");
    const mapSection = document.getElementById("map-section");
    const nodes = orderedLearningNodes();

    map.innerHTML = "";
    map.className = "ocean";

    nodes.forEach((node, index) => {
        const previous = nodes[index - 1];
        const sailed = Boolean(previous) && visitedNodes.includes(previous.id) && (
            visitedNodes.includes(node.id) || node.id === currentNode
        );

        map.appendChild(renderIsland(node, index > 0 && sailed));
    });

    map.appendChild(renderDestination());
    mapSection.classList.remove("hidden");
}

function renderLearningNodes() {
    renderLearningJourney();
}

// =========================
// Browsing history
// =========================

chrome.storage.local.get({ pages: [] }, (data) => {

    const history = document.getElementById("history");
    const pageCount = document.getElementById("page-count");

    pageCount.textContent =
        `${data.pages.length} ${data.pages.length === 1 ? "page" : "pages"}`;

    if (data.pages.length === 0) {

        history.innerHTML = `
            <div class="page">
                <div class="page-title">No pages visited yet</div>
                <div class="page-url">
                    Start browsing to begin your journey
                </div>
            </div>
        `;

        return;
    }

    history.innerHTML = "";

    data.pages.forEach((page) => {

        const pageElement = document.createElement("div");
        pageElement.className = "page";

        const title = document.createElement("div");
        title.className = "page-title";
        title.textContent = page.title || "Untitled page";

        const url = document.createElement("div");
        url.className = "page-url";
        url.textContent = page.url;

        pageElement.appendChild(title);
        pageElement.appendChild(url);

        history.appendChild(pageElement);
    });

    updateNextWaypoint().catch((error) => {
        console.error("Error finding next waypoint:", error);
    });

});

chrome.storage.local.get({
    mapData: null,
    learningGoal: "",
    visitedNodes: [],
    savedMaps: [],
    activeMapId: ""
}, async (data) => {

    const library = await readMaps(data);

    activeMapId = library.activeMapId;
    renderSavedMaps(document.getElementById("saved-maps"), library.savedMaps);

    const record = library.savedMaps.find((item) => item.id === library.activeMapId) || library.savedMaps[0];

    if (!record) {
        return;
    }

    activeMapId = record.id;
    learningGoal = data.learningGoal || record.topic || "";
    learningEdges = record.edges || [];
    recommendedOrder = record.recommended_order || [];
    visitedNodes = record.visitedNodes || [];
    learningNodes = record.nodes || [];

    try {
        const linked = await ensureResourceLinks({
            topic: record.topic,
            nodes: learningNodes,
            edges: learningEdges,
            recommended_order: recommendedOrder
        }, learningGoal);
        learningNodes = linked.nodes;
    } catch (error) {
        console.error("Error finding learning links:", error);
    }

    currentNode = lastMainVisited();
    renderLearningNodes(learningNodes);
    renderJourneyProgress();
    await savePopupMap(true);

});


// =========================
// Generate learning map
// =========================

document.getElementById("generate-button").addEventListener("click", async () => {

    const input = document.getElementById("goal-input");
    const button = document.getElementById("generate-button");
    const loading = document.getElementById("loading");
    const mapSection = document.getElementById("map-section");
    const map = document.getElementById("map");

    const goal = input.value.trim();

    if (!goal) {
        input.focus();
        return;
    }

    // Show loading state
    button.disabled = true;
    loading.classList.remove("hidden");
    mapSection.classList.add("hidden");

    try {

        const response = await fetch("http://127.0.0.1:8000/generate-map", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                topic: goal
            })
        });

        if (!response.ok) {
            throw new Error(`Backend returned ${response.status}`);
        }

        const data = await response.json();

        console.log("Learning map:", data);

        learningGoal = goal;
        learningNodes = data.nodes;
        learningEdges = data.edges;
        recommendedOrder = data.recommended_order || [];
        visitedNodes = [];
        currentNode = "";

        const linked = await ensureResourceLinks(data, goal);
        const library = await readMaps();
        const same = library.savedMaps.find((item) => topicKey(item.topic) === topicKey(goal));
        const id = same ? same.id : `map-${Date.now()}`;

        learningNodes = linked.nodes;
        activeMapId = id;

        const savedMaps = library.savedMaps.filter((item) => item.id !== id && topicKey(item.topic) !== topicKey(goal));
        savedMaps.unshift({
            id: id,
            topic: goal,
            nodes: linked.nodes,
            edges: linked.edges || [],
            recommended_order: linked.recommended_order || [],
            visitedNodes: [],
            updatedAt: Date.now()
        });

        await chrome.storage.local.set({
            savedMaps: savedMaps,
            activeMapId: id,
            mapData: linked,
            learningGoal: goal,
            visitedNodes: [],
            nextWaypoint: null,
            pages: []
        });

        renderLearningNodes(linked.nodes);
        renderJourneyProgress();
        renderSavedMaps(document.getElementById("saved-maps"), sortMaps(savedMaps));

    } catch (error) {

        console.error("Error generating learning map:", error);

        map.innerHTML = `
            <div class="page">
                <div class="page-title">
                    Could not generate learning map
                </div>

                <div class="page-url">
                    Make sure the Waypoint backend is running.
                </div>
            </div>
        `;

        mapSection.classList.remove("hidden");

    } finally {

        button.disabled = false;
        loading.classList.add("hidden");

    }

});

async function updateNextWaypoint() {

    const data = await chrome.storage.local.get({
        pages: [],
        mapData: null,
        learningGoal: "",
        visitedNodes: []
    });

    if (!data.mapData || data.pages.length < 3) {
        return;
    }

    if (data.nextWaypoint) {
        return;
    }

    const response = await fetch("http://127.0.0.1:8000/next-waypoint", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            goal: data.learningGoal,
            current_node: data.visitedNodes[data.visitedNodes.length - 1] || "",
            visited_nodes: data.visitedNodes,
            pages: data.pages,
            nodes: data.mapData.nodes,
            edges: data.mapData.edges
        })
    });

    if (!response.ok) {
        throw new Error(`Backend returned ${response.status}`);
    }

    const nextWaypoint = await response.json();

    await chrome.storage.local.set({
        nextWaypoint: nextWaypoint
    });

    console.log("Next waypoint:", nextWaypoint);
}

// =========================
// Explore map
// =========================

document.getElementById("map-button").addEventListener("click", () => {
    chrome.tabs.create({
        url: chrome.runtime.getURL("map.html")
    });
});

// =========================
// Clear journey
// =========================

renderJourneyProgress();

document.getElementById("clear-button").addEventListener("click", () => {

    chrome.storage.local.set({ pages: [] }, () => {
        location.reload();
    });

});


