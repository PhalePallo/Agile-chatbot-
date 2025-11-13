// server.js
import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import GenerativeAI from "@google/generative-ai"; // Correct import

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Log environment info
console.log("🚀 Starting server...");
console.log("NODE_ENV:", process.env.NODE_ENV);
console.log("PORT:", port);
console.log("GOOGLE_API_KEY set:", !!process.env.GOOGLE_API_KEY);

// Initialize Google Generative AI client
if (!process.env.GOOGLE_API_KEY) {
    console.error("❌ GOOGLE_API_KEY is not set. Please define it in environment variables.");
    process.exit(1); // Stop the app if API key is missing
}

const ai = new GenerativeAI({ apiKey: process.env.GOOGLE_API_KEY });

// File paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store active chat sessions
const chatSessions = new Map();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, "src")));

// Chat API endpoint
app.post("/api/chat", async (req, res) => {
    try {
        const { message, sessionId } = req.body;

        if (!message || !sessionId) {
            return res.status(400).json({ error: "Missing message or sessionId" });
        }

        let chat = chatSessions.get(sessionId);

        // Create a new chat session if none exists
        if (!chat) {
            chat = ai.chats.create({
                model: "gemini-2.5-flash",
                config: {
                    systemInstruction:
                        "You are an expert Code Assistant. Answer programming and coding questions concisely and clearly, using markdown code blocks where appropriate.",
                },
            });
            chatSessions.set(sessionId, chat);
            console.log(`🆕 New chat session created: ${sessionId}`);
        }

        // Send user message to AI
        const result = await chat.sendMessage({ message });
        const aiReply = result.text;

        res.json({ reply: aiReply });
    } catch (error) {
        console.error("❌ Server error during chat:", error);
        res.status(500).json({ reply: "⚠️ Error connecting to the AI server." });
    }
});

// Serve index.html for root
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "src", "index.html"));
});

// Fallback route
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, "src", "index.html"));
});

// Start server
app.listen(port, () => {
    console.log(`✅ Server running on http://localhost:${port}`);
});  
