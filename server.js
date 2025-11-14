// server.js (resilient startup for Azure Node App)
import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";

// Lazy import / init for Google GenAI
let ai = null;
let genAiError = null;

async function initGenAi() {
  try {
    const { GoogleGenAI } = await import("@google/genai");
    ai = new GoogleGenAI({});
    console.log("✅ GoogleGenAI client initialized");
  } catch (err) {
    genAiError = err;
    console.error("❌ GoogleGenAI initialization failed:", err?.message ?? err);
  }
}

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory chat sessions
const chatSessions = new Map();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "src")));

// Start GenAI init asynchronously
initGenAi().catch(e => console.error("GenAI init unexpected error:", e));

// Helper function to retry GenAI API calls
async function sendWithRetry(chat, message, retries = 3, delayMs = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await chat.sendMessage({ message });
      return result.text ?? "⚠️ No reply text from AI.";
    } catch (err) {
      if (err.status === 503) {
        console.warn(`GenAI busy, retrying ${i + 1}/${retries}...`);
        await new Promise(r => setTimeout(r, delayMs * (i + 1)));
      } else {
        throw err;
      }
    }
  }
  return "⚠️ AI model is currently overloaded. Please try again in a few seconds.";
}

// Chat endpoint
app.post("/api/chat", async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    if (!message || !sessionId) {
      return res.status(400).json({ error: "Missing message or sessionId" });
    }

    if (!ai) {
      return res.json({
        reply:
          "⚠️ Chat backend is up but the AI client is not available. Check server logs for details."
      });
    }

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

    const aiReply = await sendWithRetry(chat, message);
    return res.json({ reply: aiReply });

  } catch (error) {
    console.error("❌ Server error during /api/chat:", error);
    return res.json({
      reply: "⚠️ Unexpected server error. Please try again."
    });
  }
});

// Serve main page and fallback for 404
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "src", "index.html"));
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "src", "index.html"));
});

app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port} (PORT=${port})`);
  if (genAiError) {
    console.warn("⚠️ GoogleGenAI client failed to initialize — check credentials and dependencies.");
  }
});
