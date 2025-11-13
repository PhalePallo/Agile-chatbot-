// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "src"))); // serve UI from src

// Try to import the installed Google client (you have @google/generative-ai installed)
let googleClient = null;
try {
  const mod = await import("@google/generative-ai").catch(() => null);
  if (mod) {
    const GoogleGenerativeAI = mod.GoogleGenerativeAI ?? mod.default ?? mod;
    try {
      googleClient = new GoogleGenerativeAI({ apiKey: process.env.GOOGLE_API_KEY });
      console.log("Google client initialized: @google/generative-ai");
    } catch (err) {
      // if instantiation fails, still keep the module for inspection
      googleClient = GoogleGenerativeAI;
      console.warn("Google module loaded but could not instantiate — will attempt method calls dynamically.");
    }
  } else {
    console.warn("@google/generative-ai not found in node_modules");
  }
} catch (e) {
  console.error("Error importing Google SDK:", e && e.message ? e.message : e);
}

// In-memory chat sessions
const chatSessions = new Map();

// Important: endpoint that matches your front-end fetch('/api/chat', ...)
app.post("/api/chat", async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    if (!message || !sessionId) {
      return res.status(400).json({ error: "Missing message or sessionId" });
    }

    // ensure session exists
    if (!chatSessions.has(sessionId)) {
      chatSessions.set(sessionId, []);
      console.log(`New session created: ${sessionId}`);
    }

    if (!googleClient) {
      console.error("Google client missing. Ensure GOOGLE_API_KEY is set and package installed.");
      return res.status(500).json({
        reply:
          "⚠️ Server not configured to call the AI provider. Check server logs and ensure GOOGLE_API_KEY app setting and the @google package are present.",
      });
    }

    // Attempt common call shapes for @google/generative-ai
    // 1) client.generateText(...)
    if (typeof googleClient.generateText === "function") {
      const result = await googleClient.generateText({ model: "chat-bison-001", prompt: message });
      const aiText = result?.text ?? result?.output ?? JSON.stringify(result);
      chatSessions.get(sessionId).push({ user: message, ai: aiText });
      return res.json({ reply: aiText });
    }

    // 2) client.responses.generate(...)
    if (googleClient.responses && typeof googleClient.responses.generate === "function") {
      const response = await googleClient.responses.generate({ model: "models/chat-bison-001", input: message });
      let aiText = null;
      if (typeof response?.outputText === "string") aiText = response.outputText;
      else if (response?.output?.length) aiText = response.output.map(o => o.content?.map(c => c.text).join("") ?? "").join("\n");
      else aiText = JSON.stringify(response);
      chatSessions.get(sessionId).push({ user: message, ai: aiText });
      return res.json({ reply: aiText });
    }

    // 3) fallback: try calling a 'generate' or 'create' function if available
    if (typeof googleClient.generate === "function") {
      const r = await googleClient.generate({ model: "chat-bison-001", prompt: message });
      const aiText = r?.text ?? JSON.stringify(r);
      chatSessions.get(sessionId).push({ user: message, ai: aiText });
      return res.json({ reply: aiText });
    }

    // If no known method matched:
    console.error("No compatible method found on googleClient. Keys:", Object.keys(googleClient || {}).slice(0, 50));
    return res.status(500).json({
      reply: "⚠️ AI client found but no compatible method detected. Check server logs for available client methods.",
    });
  } catch (err) {
    console.error("Server error during /api/chat:", err && err.stack ? err.stack : err);
    return res.status(500).json({ reply: "⚠️ Error connecting to the AI server." });
  }
});

// Serve index.html for SPA fallback (so direct page loads work)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "src", "index.html"));
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
