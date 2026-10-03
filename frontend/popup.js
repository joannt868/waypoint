chrome.storage.local.get({ pages: [] }, (data) => {
    const history = document.getElementById("history");
    const pageCount = document.getElementById("page-count");

    pageCount.textContent =
        `${data.pages.length} ${data.pages.length === 1 ? "page" : "pages"}`;

    if (data.pages.length === 0) {
        history.innerHTML = `
            <div class="page">
                <div class="page-title">No pages visited yet</div>
                <div class="page-url">Start browsing to begin your journey</div>
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

document.getElementById("clear-button").addEventListener("click", () => {
    chrome.storage.local.set({ pages: [] }, () => {
        location.reload();
    });
});