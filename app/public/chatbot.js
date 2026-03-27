(function () {
    var script = document.currentScript;
    if (!script) {
        return;
    }

    var clientKey = script.getAttribute("data-client");
    if (!clientKey) {
        console.error("Chatbot embed requires a data-client attribute.");
        return;
    }

    var origin = new URL(script.src, window.location.href).origin;
    var iframeUrl = origin + "/chatbot/embed?client=" + encodeURIComponent(clientKey);

    var container = document.createElement("div");
    container.style.position = "fixed";
    container.style.right = "20px";
    container.style.bottom = "20px";
    container.style.zIndex = "2147483000";
    container.style.fontFamily =
        "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

    var button = document.createElement("button");
    button.type = "button";
    button.textContent = "Chat";
    button.setAttribute("aria-label", "Open chatbot");
    button.style.width = "56px";
    button.style.height = "56px";
    button.style.border = "0";
    button.style.borderRadius = "999px";
    button.style.background = "#25D366";
    button.style.color = "#ffffff";
    button.style.cursor = "pointer";
    button.style.boxShadow = "0 16px 40px rgba(37, 211, 102, 0.35)";
    button.style.fontSize = "14px";
    button.style.fontWeight = "700";

    var panel = document.createElement("div");
    panel.style.display = "none";
    panel.style.width = "min(380px, calc(100vw - 24px))";
    panel.style.height = "min(720px, calc(100vh - 96px))";
    panel.style.marginTop = "12px";
    panel.style.borderRadius = "28px";
    panel.style.overflow = "hidden";
    panel.style.boxShadow = "0 24px 60px rgba(15, 23, 42, 0.22)";
    panel.style.background = "#ffffff";

    var iframe = document.createElement("iframe");
    iframe.src = iframeUrl;
    iframe.title = "AI Chatbot";
    iframe.loading = "lazy";
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "0";
    iframe.style.background = "transparent";

    panel.appendChild(iframe);

    var isOpen = false;
    button.addEventListener("click", function () {
        isOpen = !isOpen;
        panel.style.display = isOpen ? "block" : "none";
        button.textContent = isOpen ? "Close" : "Chat";
    });

    container.appendChild(button);
    container.appendChild(panel);
    document.body.appendChild(container);
})();
