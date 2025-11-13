// server.js
import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import GenerativeAI from "@google/generative-ai";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Initialize Google Generative AI client
const ai = new GenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY // Make sure this is set in Azure App Settings
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store active chat sessions
const chatSessions = new Map();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from 'src'
app.use(express.static(path.join(__dirname, "src")));

// API endpoint for AI chat
app.post("/api/chat", async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || !sessionId) {
      return res.status(400).json({ error: "Missing message or sessionId" });
    }

    let chat = chatSessions.get(sessionId);

    // Create new chat session if it doesn't exist
    if (!chat) {
      chat = ai.chat({
        model: "gemini-2.5-flash",
        systemInstruction:
          "You are an expert Code Assistant. Your primary function is to answer programming and coding-related questions. Keep your responses concise, helpful, and formatted clearly using markdown code blocks."
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

// Serve index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "src", "index.html"));
});

// Fallback route for 404
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "src", "index.html"));
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
