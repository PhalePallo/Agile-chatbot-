// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend (index.html, script.js, style.css) from "src"
app.use(express.static(path.join(process.cwd(), "src")));

// Try to initialise Google client if package is present.
// We don't assume a particular method exists — we'll try multiple common names and fall back gracefully.
let googleClient = null;
let googleClientName = null;

try {
  // Try the common named import used in your repo
  // (note: one of @google packages might be installed; we try-catch to avoid crashing)
  // eslint-disable-next-line no-unused-vars
  const maybe = await import("@google/generative-ai").catch(() => null);
  if (maybe && maybe.GoogleGenerativeAI) {
    googleClient = new maybe.GoogleGenerativeAI({ apiKey: process.env.GOOGLE_API_KEY });
    googleClientName = "@google/generative-ai.GoogleGenerativeAI";
    console.log("Google client initialized: @google/generative-ai (GoogleGenerativeAI)");
  } else {
    const maybe2 = await import("@google/genai").catch(() => null);
    if (maybe2 && maybe2.GoogleGenAI) {
      googleClient = new maybe2.GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
      googleClientName = "@google/genai.GoogleGenAI";
      console.log("Google client initialized: @google/genai (GoogleGenAI)");
    } else {
      // try other package that appeared in logs
      const maybe3 = await import("@google/generative-ai").catch(() => null);
      if (maybe3 && maybe3.default) {
        googleClient = new maybe3.default({ apiKey: process.env.GOOGLE_API_KEY });
        googleClientName = "@google/generative-ai.default";
        console.log("Google client initialized: @google/generative-ai (default export)");
      } else {
        console.log("No recognized Google SDK imported. continuing without a configured AI client.");
      }
    }
  }
} catch (err) {
  console.error("Error while importing Google SDK (non-fatal):", err?.message || err);
}

// Health route
app.get("/health", (req, res) => res.send("ok"));

// Root route (serve index)
app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "src", "index.html"));
});

// Main API endpoint that the frontend calls
app.post("/api/chat", async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    if (!message || !sessionId) {
      return res.status(400).json({ error: "Missing message or sessionId" });
    }

    // If no Google client configured, return a helpful message (not a crash).
    if (!googleClient) {
      console.warn("No Google client available in environment.");
      return res.status(503).json({
        reply:
          "⚠️ AI backend not configured on the server. Set the GOOGLE_API_KEY app setting and ensure the correct @google package is installed.",
      });
    }

    // Try a few possible SDK call shapes (different versions of SDKs expose different method names).
    // 1) common name: generateText
    if (typeof googleClient.generateText === "function") {
      const r = await googleClient.generateText({
        model: "chat-bison-001",
        prompt: message,
      });
      // shape may differ; try common fields
      const text = r?.text || r?.output?.text || JSON.stringify(r).slice(0, 1000);
      return res.json({ reply: text });
    }

    // 2) nested text.generate (some SDKs)
    if (googleClient.text && typeof googleClient.text.generate === "function") {
      const r = await googleClient.text.generate({
        model: "chat-bison-001",
        prompt: message,
      });
      const text = r?.output?.[0]?.content?.[0]?.text || r?.text || JSON.stringify(r).slice(0, 1000);
      return res.json({ reply: text });
    }

    // 3) chat-style APIs
    if (googleClient.chat && typeof googleClient.chat.create === "function") {
      const r = await googleClient.chat.create({
        model: "chat-bison-001",
        messages: [{ role: "user", content: message }],
      });
      const text = r?.choices?.[0]?.message?.content || r?.text || JSON.stringify(r).slice(0, 1000);
      return res.json({ reply: text });
    }

    // 4) older genai packages (GoogleGenAI / GoogleGenAI.chats)
    if (googleClient.chats && typeof googleClient.chats.create === "function") {
      // some libs create a chat and send messages; adapt if available
      const chat = await googleClient.chats.create({ model: "gemini-2.5-flash" }).catch(() => null);
      if (chat && typeof chat.sendMessage === "function") {
        const r = await chat.sendMessage({ message });
        const text = r?.text || JSON.stringify(r).slice(0, 1000);
        return res.json({ reply: text });
      }
    }

    // If we reached here, the SDK is present but none of the expected methods were found.
    console.error("Google SDK present but no recognized generation method found. Available keys:", Object.keys(googleClient || {}));
    return res.status(500).json({
      reply:
        "⚠️ AI SDK is present but not compatible with this server code. Check server logs for available client methods.",
    });
  } catch (err) {
    console.error("Server error during /api/chat:", err);
    return res.status(500).json({ reply: "⚠️ Server error while contacting AI backend." });
  }
});

// Fallback - serve SPA index for routes that frontend handles
app.use((req, res) => {
  res.status(200).sendFile(path.join(process.cwd(), "src", "index.html"));
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
