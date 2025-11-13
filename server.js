// server.js
import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Ensure the API key is set
if (!process.env.GOOGLE_API_KEY) {
    console.error("❌ GOOGLE_API_KEY is not set in environment variables!");
    process.exit(1);
}

// Initialize Google GenAI client
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory session store
const chatSessions = new Map();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "src")));

// Chat API Endpoint
app.post("/api/chat", async (req, res) => {
    const { message, sessionId } = req.body;

    if (!message || !sessionId) {
        return res.status(400).json({ error: "Missing message or sessionId" });
    }

    let chat = chatSessions.get(sessionId);

    // Create a new session if it doesn’t exist
    if (!chat) {
        try {
            chat = ai.chats.create({
                model: "gemini-2.5-flash",
                config: {
                    systemInstruction:
                        "You are an expert Code Assistant. Keep responses concise, helpful, and formatted using markdown.",
                },
            });
            chatSessions.set(sessionId, chat);
            console.log(`🆕 New chat session created: ${sessionId}`);
        } catch (err) {
            console.error("❌ Failed to create chat session:", err);
            return res.status(500).json({ reply: "⚠️ Could not initialize AI session." });
        }
    }

    try {
        const result = await chat.sendMessage({ message });
        res.json({ reply: result.text });
    } catch (err) {
        console.error("❌ AI message error:", err);
        res.status(500).json({ reply: "⚠️ Error connecting to the AI server." });
    }
});

// Serve index.html
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "src", "index.html"));
});

// Fallback route
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, "src", "index.html"));
});

// Start server
app.listen(port, () => {
    console.log(`🚀 Server running on http://localhost:${port}`);
});
