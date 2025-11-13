document.addEventListener("DOMContentLoaded", () => {

    const newChatBtn = document.getElementById("newChatBtn");
    const chatModal = document.getElementById("chatModal");
    const closeModalButton = document.getElementById("closeModal");
    const chatContainer = document.getElementById("chatContainer");
    const userInput = document.getElementById("userInput");
    const sendBtn = document.getElementById("sendBtn");
    const bodyContent = document.querySelector(".history-grid");

    let currentChat = [];
    let chatCounter = 0;
    let chatSessionId = null;
    let allChats = JSON.parse(localStorage.getItem("chatHistory")) || [];

    if (newChatBtn) {
        newChatBtn.addEventListener("click", () => {
            if (chatModal) chatModal.style.display = "flex";
            startNewChat();
        });
    }

    if (closeModalButton) {
        closeModalButton.addEventListener("click", () => {
            if (chatModal) chatModal.style.display = "none";
        });
    }

    window.addEventListener("click", (e) => {
        if (e.target === chatModal) chatModal.style.display = "none";
    });

    function startNewChat() {
        if (!chatContainer) return;
        chatContainer.innerHTML = "";
        currentChat = [];
        chatCounter = allChats.length + 1;
        chatSessionId = `chat_${Date.now()}_${chatCounter}`;

        const newChatEntry = {
            id: chatSessionId,
            title: `Chat #${chatCounter}`,
            messages: []
        };

        allChats.push(newChatEntry);
        saveAllChats();
        renderChatCards();
    }

    function loadChat(chat) {
        if (!chatContainer) return;
        chatContainer.innerHTML = "";
        currentChat = chat.messages;
        chatSessionId = chat.id;

        currentChat.forEach(msg => displayMessage(msg.sender, { reply: msg.text }));

        if (chatModal) chatModal.style.display = "flex";
    }

    function saveAllChats() {
        localStorage.setItem("chatHistory", JSON.stringify(allChats));
    }

    function renderChatCards() {
        if (!bodyContent) return;
        document.querySelectorAll(".text-box").forEach(el => el.remove());

        allChats.forEach(chat => {
            const card = document.createElement("div");
            card.classList.add("text-box");
            card.textContent = chat.title;
            bodyContent.appendChild(card);

            card.addEventListener("click", () => loadChat(chat));
        });
    }

    function displayMessage(sender, content) {
        if (!chatContainer) return;
        const messageDiv = document.createElement("div");
        messageDiv.classList.add("message", sender === "user" ? "user-message" : "ai-message");

        let text = content.reply ?? String(content);
        text = text.replace(/```([\s\S]*?)```/g, (match, code) => {
            code = code.replace(/</g, "&lt;").replace(/>/g, "&gt;");
            return `<pre><code>${code.trim()}</code></pre>`;
        });
        text = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        messageDiv.innerHTML = `<strong>${sender === "user" ? "You" : "AI"}:</strong> ${text}`;

        chatContainer.appendChild(messageDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    async function sendMessage() {
        if (!userInput) return;
        const userMessage = userInput.value.trim();
        if (!userMessage) return;

        displayMessage("user", userMessage);
        currentChat.push({ sender: "user", text: userMessage });
        userInput.value = "";

        const typingDiv = document.createElement("div");
        typingDiv.classList.add("message", "ai-message", "typing-indicator");
        typingDiv.innerHTML = "<em>AI is typing...</em>";
        chatContainer.appendChild(typingDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;

        const aiReply = await getAIResponse(userMessage);
        typingDiv.remove();
        displayMessage("ai", aiReply);
        currentChat.push({ sender: "ai", text: aiReply.reply });

        const chatIndex = allChats.findIndex(c => c.id === chatSessionId);
        if (chatIndex > -1) {
            allChats[chatIndex].messages = currentChat;
            saveAllChats();
        }
    }

    async function getAIResponse(userMessage) {
        if (!isCodingRelated(userMessage)) {
            return { reply: "🚫 I'm only able to answer coding-related questions." };
        }
        try {
            const response = await fetch(`${window.location.origin}/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: userMessage })
            });
            const data = await response.json();
            return { reply: data.reply ?? "⚠️ No response from AI." };
        } catch {
            return { reply: "⚠️ Error connecting to the AI server." };
        }
    }

    function isCodingRelated(message) {
        const allowedTopics = ["code","coding","programming","developer","software","algorithm","api","debug","bug","function","class","html","css","javascript","python","java","c#","c++","git","bash","powershell","sql","ruby","react","scss","bootstrap","c","golang","typescript","swift","php","r"];
        return allowedTopics.some(topic => message.toLowerCase().includes(topic));
    }

    if (sendBtn) sendBtn.addEventListener("click", sendMessage);
    if (userInput) userInput.addEventListener("keypress", e => {
        if (e.key === "Enter") { e.preventDefault(); sendMessage(); }
    });

    renderChatCards();

});
