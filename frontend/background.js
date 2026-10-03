chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== "complete") {
        return;
    }

    if (!tab.url || !tab.url.startsWith("http")) {
        return;
    }

    const page = {
        title: tab.title,
        url: tab.url,
        timestamp: Date.now()
    };

    chrome.storage.local.get({ pages: [] }, (data) => {
        const pages = data.pages;

        pages.push(page);

        chrome.storage.local.set({
            pages: pages
        });
    });
});