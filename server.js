// server.js (resilient startup - use this to avoid crashes when GenAI fails)
import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";

// Lazy import / init for Google GenAI (wrapped safely)
let ai = null;
let genAiError = null;
async function initGenAi() {
  try {
    // dynamic import so a missing native dependency doesn't crash at module-load time
    const { GoogleGenAI } = await import("@google/genai");
    ai = new GoogleGenAI({});
    console.log("✅ GoogleGenAI client initialized");
  } catch (err) {
    genAiError = err;
    console.error("❌ GoogleGenAI initialization failed:", err && err.message ? err.message : err);
    // keep going — we will respond with a friendly error from /api/chat
  }
}

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory sessions
const chatSessions = new Map();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "src")));

// Start GenAI init but don't await — allow server to start fast
initGenAi().catch(e => console.error("GenAI init unexpected error:", e));

// Chat endpoint
app.post("/api/chat", async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    if (!message || !sessionId) {
      return res.status(400).json({ error: "Missing message or sessionId" });
    }

    // If AI client failed to initialize, return helpful message instead of crashing
    if (!ai) {
      const friendly = {
        reply:
          "⚠️ Chat backend is up but the AI client is not available. This usually means missing credentials or a dependent package failed to load. Check server logs (LogFiles) for details."
      };
      console.warn("Responding with fallback because AI client is unavailable:", genAiError?.message ?? "unknown");
      return res.json(friendly);
    }

    // Create or reuse a conversation object from the SDK
    let chat = chatSessions.get(sessionId);
    if (!chat) {
      chat = ai.chats.create({
        model: "gemini-2.5-flash",
        config: {
          systemInstruction:
            "You are an expert Code Assistant. Answer concisely and provide code in markdown blocks.",
        },
      });
      chatSessions.set(sessionId, chat);
      console.log(`New chat session created: ${sessionId}`);
    }

    const result = await chat.sendMessage({ message });
    const aiReply = result.text ?? "⚠️ No reply text from AI.";
    return res.json({ reply: aiReply });
  } catch (error) {
    console.error("❌ Server error during /api/chat:", error);
    return res.status(500).json({ reply: "⚠️ Error connecting to the AI server." });
  }
});

// Serve index and fallback
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "src", "index.html"));
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "src", "index.html"));
});

app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port} (PORT=${port})`);
  if (genAiError) {
    console.warn("GoogleGenAI client failed to initialize — check credentials and dependencies.");
  }
});
