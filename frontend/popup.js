// =========================
// Learning state
// =========================

let learningGoal = "";
let learningNodes = [];
let learningEdges = [];
let visitedNodes = [];
let currentNode = "";

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
        visitedNodes = [];
        currentNode = "";

        // Show the generated concepts
        map.innerHTML = "";

        data.nodes.forEach((node) => {

            const nodeElement = document.createElement("div");
            nodeElement.className = "map-node";

            nodeElement.innerHTML = `
                <div class="map-node-title">
                    ${node.title}
                </div>

                <div class="map-node-description">
                    ${node.description}
                </div>

                <div class="map-node-difficulty">
                    Difficulty: ${node.difficulty}/5
                </div>
            `;

            // Make the concept clickable
            nodeElement.addEventListener("click", async () => {

                console.log("Selected concept:", node.id);

                // Highlight the selected concept
                document.querySelectorAll(".map-node").forEach((element) => {
                    element.classList.remove("selected");
                });

                nodeElement.classList.add("selected");

                // Remember the current concept
                currentNode = node.id;

                // Add it to visited concepts if we haven't visited it yet
                if (!visitedNodes.includes(node.id)) {
                    visitedNodes.push(node.id);
                }

                try {

                    const response = await fetch("http://127.0.0.1:8000/next-waypoint", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            goal: learningGoal,
                            current_node: currentNode,
                            visited_nodes: visitedNodes,
                            nodes: learningNodes,
                            edges: learningEdges
                        })
                    });

                    if (!response.ok) {
                        throw new Error(`Backend returned ${response.status}`);
                    }

                    const nextWaypoint = await response.json();

                    console.log("Next waypoint:", nextWaypoint);

                } catch (error) {

                    console.error("Error finding next waypoint:", error);

                }

            });

            map.appendChild(nodeElement);
        });
        mapSection.classList.remove("hidden");

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


// =========================
// Clear journey
// =========================

document.getElementById("clear-button").addEventListener("click", () => {

    chrome.storage.local.set({ pages: [] }, () => {
        location.reload();
    });

});


