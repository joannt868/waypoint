function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

const requestedMapId = new URLSearchParams(location.search).get("map");

chrome.storage.local.get({
    mapData: null,
    visitedNodes: [],
    nextWaypoint: null,
    savedMaps: [],
    activeMapId: ""
}, async (data) => {

    const library = await readMaps(data);
    let record = requestedMapId
        ? library.savedMaps.find((item) => item.id === requestedMapId)
        : null;

    if (!record) {
        record = library.savedMaps.find((item) => item.id === library.activeMapId) || library.savedMaps[0];
    }

    renderSavedMaps(document.getElementById("saved-maps"), library.savedMaps);

    if (!record) {
        document.getElementById("map-title").textContent =
            "No learning map yet";
        document.getElementById("voyage").innerHTML =
            `<div class="voyage-empty">Generate a learning map in the extension first.</div>`;
        return;
    }

    let mapData = {
        topic: record.topic,
        nodes: record.nodes || [],
        edges: record.edges || [],
        recommended_order: record.recommended_order || []
    };

    try {
        mapData = await ensureResourceLinks(mapData);
    } catch (error) {
        console.error("Error finding learning links:", error);
    }

    record.nodes = mapData.nodes;
    let visitedNodes = record.visitedNodes || [];
    const nextWaypoint = record.id === library.activeMapId ? data.nextWaypoint : null;

    document.getElementById("map-title").textContent =
        mapData.topic;

    const exploreButton = document.getElementById("explore-button");

    function orderedNodes() {
        const remaining = new Map(mapData.nodes.map((node) => [node.id, node]));
        const ordered = [];

        (mapData.recommended_order || []).forEach((id) => {
            if (!remaining.has(id)) {
                return;
            }

            ordered.push(remaining.get(id));
            remaining.delete(id);
        });

        mapData.nodes.forEach((node) => {
            if (remaining.has(node.id)) {
                ordered.push(node);
            }
        });

        return ordered;
    }

    const learningOrder = orderedNodes();
    const themes = [
        { pattern: /stock|market|invest|finance|money|bank|trading|economy/, icons: ["📈", "💰", "🏦"] },
        { pattern: /plane|airplane|flight|fly|airport|aviation|aircraft/, icons: ["✈️", "☁️", "🛫"] },
        { pattern: /neural|machine learning|artificial|algorithm/, icons: ["🧠", "🔗", "💻"] },
        { pattern: /immune|antibod|virus|cell|disease|health/, icons: ["🛡️", "🔬", "💊"] },
        { pattern: /revolution|french|france|paris|history|empire|king/, icons: ["⚜️", "📜", "🏛️"] },
        { pattern: /space|planet|star|orbit|moon|galaxy|nasa/, icons: ["🚀", "🌙", "✨"] },
        { pattern: /music|song|piano|guitar|melody/, icons: ["🎵", "🎹", "🎶"] },
        { pattern: /ocean|sea|marine|whale|coral/, icons: ["🐠", "🐚", "⚓"] }
    ];

    function destinationTheme(goal) {
        const text = String(goal || "").toLowerCase();
        const match = themes.find((theme) => theme.pattern.test(text));
        return match || { icons: ["🏝️", "✨", "🗺️"] };
    }

    function mainVisitedCount() {
        return learningOrder.filter((node) => visitedNodes.includes(node.id)).length;
    }

    function isComplete() {
        return learningOrder.length > 0 && mainVisitedCount() === learningOrder.length;
    }

    function findConcept(id) {
        for (const node of mapData.nodes) {
            if (node.id === id) {
                return node;
            }

            const detail = (node.details || []).find((item) => item.id === id);

            if (detail) {
                return detail;
            }
        }

        return null;
    }

    function currentNode() {
        if (visitedNodes.length > 0) {
            const found = findConcept(visitedNodes[visitedNodes.length - 1]);

            if (found) {
                return found;
            }
        }

        return learningOrder[0];
    }

    function anchorNode(current) {
        if (learningOrder.some((node) => node.id === current.id)) {
            return current;
        }

        return learningOrder.find((node) =>
            (node.details || []).some((detail) => detail.id === current.id)
        ) || learningOrder[0];
    }

    function suggestedNext(current) {
        const anchor = anchorNode(current);

        if (nextWaypoint) {
            const suggested = mapData.nodes.find(
                (node) => node.id === nextWaypoint.next_node
            );

            if (suggested && suggested.id !== current.id && !visitedNodes.includes(suggested.id)) {
                return suggested;
            }
        }

        const startIndex = Math.max(
            learningOrder.findIndex((node) => node.id === anchor.id),
            0
        );

        for (let index = startIndex + 1; index < learningOrder.length; index++) {
            if (!visitedNodes.includes(learningOrder[index].id)) {
                return learningOrder[index];
            }
        }

        return learningOrder.find(
            (node) => node.id !== current.id && !visitedNodes.includes(node.id)
        ) || null;
    }

    function updatePanel() {
        const current = currentNode();
        const next = suggestedNext(current);

        document.getElementById("current-title").textContent =
            current.title;

        document.getElementById("current-description").textContent =
            current.description;

        document.getElementById("current-source").textContent =
            resourceLabel(current);

        const pathNodes = visitedNodes
            .map((id) => {
                const node = findConcept(id);
                return node ? node.title : null;
            })
            .filter(Boolean);

        document.getElementById("path").textContent =
            pathNodes.length > 0
                ? pathNodes.join(" > ")
                : "You haven't opened any concepts yet";

        const last = learningOrder[learningOrder.length - 1];
        const onLast = Boolean(last) && anchorNode(current).id === last.id;

        if (onLast || !next) {
            document.getElementById("next-label").textContent = "JOURNEY";
            document.getElementById("next-title").textContent = "Journey complete";
            exploreButton.classList.add("hidden");
        } else {
            document.getElementById("next-label").textContent = "SUGGESTED NEXT";
            document.getElementById("next-title").textContent = next.title;
            exploreButton.textContent = "Open next lesson";
            exploreButton.classList.remove("hidden");
        }

        renderProgress(current);
    }

    function renderProgress(current) {
        const total = learningOrder.length;
        const completed = mainVisitedCount();
        const percent = total === 0 ? 0 : Math.min(100, Math.round((completed / total) * 100));
        const finished = isComplete();

        document.getElementById("progress-count").textContent =
            `${completed} / ${total} concepts completed`;
        document.getElementById("progress-percent").textContent = `${percent}%`;
        document.getElementById("progress-fill").style.width = `${percent}%`;

        document.getElementById("progress-list").innerHTML = learningOrder.map((node) => {
            const visited = visitedNodes.includes(node.id);
            const isCurrent = !finished && node.id === current.id;
            let state = "upcoming";
            let mark = "○";

            if (isCurrent) {
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
                    ${isCurrent ? `<span class="progress-here">${visitedNodes.length ? "You are here" : "Start here"}</span>` : ""}
                </div>
            `;
        }).join("");
    }

    function renderVoyage() {
        const voyage = document.getElementById("voyage");
        const current = currentNode();
        const complete = isComplete();
        const theme = destinationTheme(mapData.topic || "");

        voyage.innerHTML = "";

        learningOrder.forEach((node, index) => {
            const visited = visitedNodes.includes(node.id);
            const isCurrent = !complete && node.id === current.id;
            let state = "upcoming";
            let note = "";

            if (isCurrent) {
                state = "current";
                note = visitedNodes.length ? "You are here" : "Start here";
            } else if (visited) {
                state = "completed";
                note = "Visited";
            }

            const shape = index % 5;
            const stop = document.createElement("div");
            stop.className = `sea-stop ${index % 2 === 0 ? "left" : "right"} shore-${shape}`;
            stop.innerHTML = `
                <div class="island-card shape-${shape} ${state} ${visited ? "learned" : ""}" data-id="${escapeHtml(node.id)}">
                    <div class="island-mark">
                        <span>🏝️</span>
                    </div>
                    <div>
                        <div class="island-title">${escapeHtml(node.title)}</div>
                        ${note ? `<div class="island-note">${note}</div>` : ""}
                        <div class="island-desc">${escapeHtml(node.description || "")}</div>
                        <div class="island-source">${escapeHtml(resourceLabel(node))}</div>
                    </div>
                    ${isCurrent ? `<span class="boat">🚤</span>` : ""}
                </div>
            `;

            stop.querySelector(".island-card").addEventListener("click", () => {
                openConcept(node);
            });

            voyage.appendChild(stop);

            const details = node.details || [];

            if (!details.length) {
                return;
            }

            stop.classList.add("has-branch");
            const fan = branchLayout(details.length);
            const growRight = index % 2 === 0;

            details.forEach((detail, detailIndex) => {
                const detailVisited = visitedNodes.includes(detail.id);
                const detailCurrent = !complete && detail.id === current.id;
                let detailState = "upcoming";
                let detailNote = "";

                if (detailCurrent) {
                    detailState = "current";
                    detailNote = "You are here";
                } else if (detailVisited) {
                    detailState = "completed";
                    detailNote = "Visited";
                }

                const spot = fan[detailIndex];
                const radians = spot.angle * Math.PI / 180;
                const reach = Math.cos(radians) * spot.distance;
                const rise = Math.sin(radians) * spot.distance;
                const card = document.createElement("div");
                card.className = `island-card islet ${detailState} ${detailVisited ? "learned" : ""}`;
                card.dataset.id = detail.id;
                card.style.top = `calc(50% + ${rise}px)`;

                if (growRight) {
                    card.style.left = `calc(100% + ${reach}px)`;
                    card.style.transform = "translate(-50%, -50%)";
                } else {
                    card.style.right = `calc(100% + ${reach}px)`;
                    card.style.transform = "translate(50%, -50%)";
                }

                card.innerHTML = `
                    <div class="island-mark"><span>🏝️</span></div>
                    <div class="island-title">${escapeHtml(detail.title)}</div>
                    ${detailNote ? `<div class="island-note">${detailNote}</div>` : ""}
                    ${detailCurrent ? `<span class="boat">🚤</span>` : ""}
                `;
                card.addEventListener("click", () => {
                    openConcept(detail);
                });
                stop.appendChild(card);
            });
        });

        const last = learningOrder[learningOrder.length - 1];
        const destination = document.createElement("div");
        destination.className = `destination-wrap ${complete ? "reached" : ""}`;
        destination.innerHTML = `
            <div class="destination-land">
                ${complete ? `<span class="boat destination-boat">🚤</span>` : ""}
                <div class="destination-icons">${theme.icons.join(" ")}</div>
                <div class="destination-label">Destination</div>
                <div class="destination-title">${escapeHtml(mapData.topic || "Your goal")}</div>
                ${complete ? `<div class="destination-done">Journey complete. You've reached your destination.</div>` : ""}
            </div>
        `;
        voyage.appendChild(destination);
        requestAnimationFrame(drawRoutes);
    }

    function drawRoutes() {
        const voyage = document.getElementById("voyage");
        const points = [...voyage.querySelectorAll(".sea-stop > .island-card:not(.islet), .destination-land")];

        if (points.length < 2) {
            return;
        }

        let svg = voyage.querySelector(".route-lines");

        if (!svg) {
            svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("class", "route-lines");
            voyage.prepend(svg);
        }

        svg.setAttribute("width", voyage.scrollWidth);
        svg.setAttribute("height", voyage.scrollHeight);
        svg.innerHTML = "";

        const spots = points.map((point) => waterPoint(point, voyage));
        const path = pathThrough(spots, 0, spots.length - 1);

        const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
        line.setAttribute("d", path);
        svg.appendChild(line);

        voyage.querySelectorAll(".sea-stop.has-branch").forEach((stop) => {
            const parent = stop.querySelector(":scope > .island-card:not(.islet)");
            const islets = [...stop.querySelectorAll(":scope > .island-card.islet")];

            if (!parent || !islets.length) {
                return;
            }

            const towardBranch = stop.classList.contains("right") ? "left" : "right";
            const towardParent = towardBranch === "right" ? "left" : "right";
            const from = edgePoint(parent, voyage, towardBranch);

            islets.forEach((islet) => {
                const to = edgePoint(islet, voyage, towardParent);
                const controlX = from.x + (to.x - from.x) * 0.42;
                const branchLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
                branchLine.setAttribute("class", "branch-line");
                branchLine.setAttribute("d", `M ${from.x} ${from.y} Q ${controlX} ${from.y} ${to.x} ${to.y}`);
                svg.appendChild(branchLine);
            });
        });
    }

    window.addEventListener("resize", drawRoutes);

    function centerOf(element, voyage) {
        let x = element.offsetWidth / 2;
        let y = element.offsetHeight / 2;
        let node = element;

        while (node && node !== voyage) {
            x += node.offsetLeft;
            y += node.offsetTop;
            node = node.offsetParent;
        }

        return { x, y };
    }

    function branchLayout(count) {
        const plans = {
            1: [{ angle: 0, distance: 156 }],
            2: [
                { angle: -36, distance: 196 },
                { angle: 36, distance: 196 }
            ],
            3: [
                { angle: -44, distance: 214 },
                { angle: 0, distance: 164 },
                { angle: 44, distance: 214 }
            ],
            4: [
                { angle: -52, distance: 236 },
                { angle: -18, distance: 170 },
                { angle: 18, distance: 170 },
                { angle: 52, distance: 236 }
            ]
        };

        return plans[Math.min(Math.max(count, 1), 4)];
    }

    function edgePoint(element, voyage, side) {
        const center = centerOf(element, voyage);

        return {
            x: center.x + (side === "right" ? element.offsetWidth / 2 : -element.offsetWidth / 2),
            y: center.y
        };
    }

    function waterPoint(element, voyage) {
        const center = centerOf(element, voyage);

        return {
            x: center.x,
            y: center.y + element.offsetHeight / 2 + 6
        };
    }

    function curve(previous, spot) {
        const dip = Math.max(28, Math.min(72, Math.abs(spot.y - previous.y) * 0.22));
        const sway = previous.x < spot.x ? -24 : 24;
        const controlX = ((previous.x + spot.x) / 2) + sway;
        const controlY = ((previous.y + spot.y) / 2) + dip;

        return ` Q ${controlX} ${controlY} ${spot.x} ${spot.y}`;
    }

    function pathThrough(spots, startIndex, endIndex) {
        const step = startIndex < endIndex ? 1 : -1;
        let path = `M ${spots[startIndex].x} ${spots[startIndex].y}`;

        for (let index = startIndex; index !== endIndex; index += step) {
            path += curve(spots[index], spots[index + step]);
        }

        return path;
    }

    function moveBoat(from, to) {
        return new Promise((resolve) => {
            if (!from || !to || from === to) {
                resolve();
                return;
            }

            const voyage = document.getElementById("voyage");
            const spots = [waterPoint(from, voyage), waterPoint(to, voyage)];
            const startIndex = 0;
            const endIndex = 1;
            const measure = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            const probe = document.createElementNS("http://www.w3.org/2000/svg", "path");

            measure.setAttribute("width", voyage.scrollWidth);
            measure.setAttribute("height", voyage.scrollHeight);
            measure.style.position = "absolute";
            measure.style.left = "0";
            measure.style.top = "0";
            measure.style.pointerEvents = "none";
            probe.setAttribute("fill", "none");
            probe.setAttribute("stroke", "none");
            probe.setAttribute("d", pathThrough(spots, startIndex, endIndex));
            measure.appendChild(probe);
            voyage.appendChild(measure);

            const length = probe.getTotalLength();

            if (!length) {
                measure.remove();
                resolve();
                return;
            }

            const duration = Math.min(4600, Math.max(2200, length * 4.6));
            const goingLeft = spots[endIndex].x < spots[startIndex].x;
            const boat = document.createElement("div");
            const started = performance.now();

            boat.id = "traveler";
            boat.textContent = "🚤";
            voyage.appendChild(boat);
            from.querySelector(".boat")?.remove();

            function frame(now) {
                const t = Math.min(1, (now - started) / duration);
                const cruise = t * t * (3 - 2 * t);
                const distance = length * (0.1 + cruise * 0.8);
                const point = probe.getPointAtLength(distance);
                const rock = Math.sin(t * Math.PI * 2.5) * 5;

                boat.style.left = `${point.x}px`;
                boat.style.top = `${point.y + Math.sin(t * Math.PI * 3) * 4}px`;
                boat.style.transform = `translate(-50%, -40%) scaleX(${goingLeft ? -1 : 1}) rotate(${rock}deg)`;

                if (t < 1) {
                    requestAnimationFrame(frame);
                    return;
                }

                measure.remove();
                resolve();
            }

            requestAnimationFrame(frame);
        });
    }

    function hideHelp() {
        document.getElementById("help-panel").classList.add("hidden");
        document.getElementById("lost-box").classList.add("hidden");
        document.getElementById("help-status").textContent = "";
        document.getElementById("lost-note").value = "";
    }

    async function persistMap() {
        record.nodes = mapData.nodes;
        record.visitedNodes = visitedNodes;
        record.topic = mapData.topic || record.topic;
        const savedMaps = await writeMapRecord(record, false);
        renderSavedMaps(document.getElementById("saved-maps"), savedMaps);
    }

    async function openConcept(node) {
        const from = document.querySelector(".island-card.current");
        const to = document.querySelector(`[data-id="${CSS.escape(node.id)}"]`);

        hideHelp();
        await moveBoat(from, to);
        await openLesson(node, mapData.topic || "");

        visitedNodes = visitedNodes.filter((id) => id !== node.id);
        visitedNodes.push(node.id);

        await persistMap();
        renderVoyage();
        updatePanel();
    }

    async function addMissingPieces(parent, note) {
        const response = await fetch("http://127.0.0.1:8000/help-islands", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                topic: mapData.topic || "",
                title: parent.title,
                description: parent.description || "",
                note: note
            })
        });

        if (!response.ok) {
            throw new Error(`Backend returned ${response.status}`);
        }

        const data = await response.json();
        const room = 4 - (parent.details || []).length;
        const created = (data.nodes || []).slice(0, room);

        if (!created.length) {
            return 0;
        }

        const details = [];

        for (let index = 0; index < created.length; index += 1) {
            const item = created[index];
            const detail = {
                id: `${parent.id}-detail-${Date.now().toString(36)}-${index}`,
                title: item.title,
                description: item.description || "",
                parentId: parent.id
            };
            const url = (await searchLessons(detail.title, mapData.topic || "", []))[0] || "";

            if (url) {
                detail.resource_url = url;
            }

            details.push(detail);
        }

        parent.details = [...(parent.details || []), ...details];
        await persistMap();
        return details.length;
    }

    exploreButton.addEventListener("click", () => {
        const current = currentNode();
        const next = suggestedNext(current);
        openConcept(next || current);
    });

    document.getElementById("another-button").addEventListener("click", () => {
        const panel = document.getElementById("help-panel");
        panel.classList.remove("hidden");
        document.getElementById("lost-box").classList.add("hidden");
        document.getElementById("help-status").textContent = "";
    });

    document.getElementById("help-another").addEventListener("click", async () => {
        const button = document.getElementById("help-another");
        const current = currentNode();
        const status = document.getElementById("help-status");

        button.disabled = true;
        status.textContent = "Looking for another explanation...";

        const url = await replaceLesson(current, mapData.topic || "");
        await persistMap();

        button.disabled = false;
        status.textContent = url ? "Updated the lesson." : "No other lesson found.";
        renderVoyage();
        updatePanel();
        document.getElementById("help-panel").classList.remove("hidden");
    });

    document.getElementById("help-lost").addEventListener("click", () => {
        document.getElementById("lost-box").classList.remove("hidden");
        document.getElementById("lost-note").focus();
    });

    document.getElementById("lost-submit").addEventListener("click", async () => {
        const button = document.getElementById("lost-submit");
        const status = document.getElementById("help-status");
        const note = document.getElementById("lost-note").value.trim();
        const parent = anchorNode(currentNode());

        if (!note) {
            status.textContent = "Say what you're confused about.";
            return;
        }

        if ((parent.details || []).length >= 4) {
            status.textContent = "This island already has extra lessons.";
            return;
        }

        button.disabled = true;
        status.textContent = "Finding the missing pieces...";

        try {
            const added = await addMissingPieces(parent, note);

            status.textContent = added
                ? "Added smaller islands for what you're missing."
                : "Nothing extra to add. Try being a bit more specific.";
            renderVoyage();
            updatePanel();
            document.getElementById("help-panel").classList.remove("hidden");
            document.getElementById("lost-box").classList.remove("hidden");
        } catch (error) {
            console.error("Error adding missing lessons:", error);
            status.textContent = "Couldn't add those lessons. Make sure the backend is running.";
        }

        button.disabled = false;
    });

    await persistMap();
    renderVoyage();
    updatePanel();
});
