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

// Initialize Google GenAI client
const ai = new GoogleGenAI({});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store active chat sessions
const chatSessions = new Map();

// Middleware
app.use(cors());
app.use(express.json());

// ✅ Serve static files (HTML, CSS, JS) from 'src'
app.use(express.static(path.join(__dirname, "src")));

// Gemini Chat API Endpoint
app.post("/api/chat", async (req, res) => {
    try {
        const { message, sessionId } = req.body;

        if (!message || !sessionId) {
            return res.status(400).json({ error: "Missing message or sessionId" });
        }

        let chat = chatSessions.get(sessionId);

        // Create new session if one doesn’t exist
        if (!chat) {
            chat = ai.chats.create({
                model: "gemini-2.5-flash",
                config: {
                    systemInstruction:
                        "You are an expert Code Assistant. Your primary function is to answer programming and coding-related questions. Keep your responses concise, helpful, and formatted clearly using markdown code blocks.",
                },
            });
            chatSessions.set(sessionId, chat);
            console.log(`New chat session created: ${sessionId}`);
        }

        // Send user message and get AI reply
        const result = await chat.sendMessage({ message });
        const aiReply = result.text;

        res.json({ reply: aiReply });

    } catch (error) {
        console.error("❌ Server error during chat:", error);
        res.status(500).json({ reply: "⚠️ Error connecting to the AI server." });
    }
});

// ✅ Serve index.html
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "src", "index.html"));
});

// ✅ Fallback route
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, "src", "index.html"));
});

// Start server
app.listen(port, () => {
    console.log(`🚀 Server running on http://localhost:${port}`);
});
