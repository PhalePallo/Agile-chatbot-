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
app.use(express.static(path.join(__dirname, "src"))); // serve index.html, script.js, style.css

// Graceful logging for uncaught errors so we can see the cause in Log Stream
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err && err.stack ? err.stack : err);
  // allow process to exit so Azure restarts it; still log first
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason && reason.stack ? reason.stack : reason);
  process.exit(1);
});

// dynamic import of google client to avoid hard crash if shapes differ
let googleClient = null;
let clientInfo = { loaded: false, keys: [] };

async function initGoogleClient() {
  try {
    const mod = await import("@google/generative-ai").catch(() => null);
    if (!mod) {
      console.warn("@google/generative-ai package not found in node_modules");
      return;
    }

    // try common named export
    const GoogleGenerativeAI = mod.GoogleGenerativeAI ?? mod.default ?? mod;
    try {
      googleClient = new GoogleGenerativeAI({ apiKey: process.env.GOOGLE_API_KEY });
      clientInfo.loaded = true;
      clientInfo.keys = Object.keys(googleClient).slice(0, 100);
      console.log("Google client initialized:", "@google/generative-ai", clientInfo.keys);
    } catch (e) {
      // maybe module exports are different; store available keys for debugging
      clientInfo.loaded = false;
      clientInfo.keys = Object.keys(GoogleGenerativeAI || {}).slice(0, 100);
      console.warn("Google module imported but instantiation failed. Available keys:", clientInfo.keys, e && e.message);
      // keep 'googleClient' as the module (so we can try alternate call shapes)
      googleClient = GoogleGenerativeAI;
    }
  } catch (err) {
    console.error("Error importing google client:", err && err.stack ? err.stack : err);
  }
}

// initialize client at startup (non-blocking)
initGoogleClient().catch((e) => console.error("initGoogleClient error:", e));

// simple health check
app.get("/health", (req, res) => res.send("ok"));

// Serve root (index.html in src)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "src", "index.html"));
});

// The endpoint your front-end calls (script.js expects /api/chat)
app.post("/api/chat", async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    if (!message || !sessionId) return res.status(400).json({ error: "Missing message or sessionId" });

    if (!googleClient) {
      console.error("No google client available. Ensure package is installed and GOOGLE_API_KEY configured.");
      return res.status(500).json({ reply: "⚠️ AI backend not configured. Check server logs." });
    }

    // Try common SDK shapes: generateText, responses.generate, generate, chat or createChat...
    if (typeof googleClient.generateText === "function") {
      const r = await googleClient.generateText({ model: "chat-bison-001", prompt: message });
      const text = r?.text ?? JSON.stringify(r);
      return res.json({ reply: text });
    }

    if (googleClient.responses && typeof googleClient.responses.generate === "function") {
      const r = await googleClient.responses.generate({ model: "models/chat-bison-001", input: message });
      // try multiple response field shapes
      const text = r?.outputText ?? r?.output?.map(o => o.content?.map(c => c.text).join("") ?? "").join("\n") ?? JSON.stringify(r);
      return res.json({ reply: text });
    }

    if (typeof googleClient.generate === "function") {
      const r = await googleClient.generate({ model: "chat-bison-001", prompt: message });
      const text = r?.text ?? JSON.stringify(r);
      return res.json({ reply: text });
    }

    // last attempt: if the module itself is a function
    if (typeof googleClient === "function") {
      const r = await googleClient({ model: "chat-bison-001", prompt: message });
      const text = r?.text ?? JSON.stringify(r);
      return res.json({ reply: text });
    }

    console.error("No compatible method found on googleClient. Keys:", clientInfo.keys);
    return res.status(500).json({ reply: "⚠️ AI client loaded but no usable method found. Check logs." });

  } catch (err) {
    console.error("Error generating response:", err && err.stack ? err.stack : err);
    return res.status(500).json({ reply: "⚠️ Error connecting to the AI server." });
  }
});

// SPA fallback for client-side routes
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "src", "index.html"));
});

app.listen(port, () => console.log(`Server running on port ${port}`));
