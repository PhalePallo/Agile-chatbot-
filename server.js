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
app.use(express.static(path.join(__dirname, "src"))); // serve static UI from src

// In-memory sessions (non-persistent)
const chatSessions = new Map();

// Helper: try to dynamically load an installed Google generative AI library and return a client + mode
async function initGoogleClient() {
  // We'll attempt several known packages / shapes and return an object describing how to call it.
  // This function does NOT throw on import failure; it returns null and logs helpful info.
  try {
    // Try the older/similar package names in order
    // 1) '@google/genai' (some examples use GoogleGenAI)
    try {
      const mod = await import("@google/genai").catch(() => null);
      if (mod) {
        // Common shapes (based on some community examples): mod.GoogleGenAI or mod.default
        const GoogleGenAI = mod.GoogleGenAI ?? mod.default ?? mod;
        const instance = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
        // This client often has chats.create(...) or sendMessage-like API — we detect usable method below
        return { lib: "@google/genai", client: instance };
      }
    } catch (e) {
      // continue to next
      console.log("Import @google/genai failed:", e && e.message ? e.message : e);
    }

    // 2) '@google/generative-ai' (installed in your environment)
    try {
      const mod = await import("@google/generative-ai").catch(() => null);
      if (mod) {
        // Examples differ: mod.GoogleGenerativeAI, mod.default, mod.TextServiceClient, mod.ResponsesClient
        // We'll try to get a usable object from available exports
        const GoogleGenerativeAI = mod.GoogleGenerativeAI ?? mod.default ?? mod;
        // Some libs expect new GoogleGenerativeAI({ apiKey }) or require a client factory.
        // Attempt to instantiate; if instantiation fails, still return raw module and handle later.
        let instance;
        try {
          instance = new GoogleGenerativeAI({ apiKey: process.env.GOOGLE_API_KEY });
        } catch (instErr) {
          // fallback: maybe the module exposes a client factory or different class; just return module
          instance = GoogleGenerativeAI;
        }
        return { lib: "@google/generative-ai", client: instance };
      }
    } catch (e) {
      console.log("Import @google/generative-ai failed:", e && e.message ? e.message : e);
    }

    // 3) '@google-ai/generativelanguage' sometimes used in examples
    try {
      const mod = await import("@google-ai/generativelanguage").catch(() => null);
      if (mod) {
        // return raw module, we'll inspect later
        return { lib: "@google-ai/generativelanguage", client: mod };
      }
    } catch (e) {
      console.log("Import @google-ai/generativelanguage failed:", e && e.message ? e.message : e);
    }

    // Nothing found
    console.warn("No supported Google generative AI client found in node_modules.");
    return null;
  } catch (topErr) {
    console.error("Unexpected error during initGoogleClient:", topErr);
    return null;
  }
}

let googleClientInfo = null; // will hold { lib, client } or null

// Initialize client once at startup (best-effort)
(async () => {
  googleClientInfo = await initGoogleClient();
  if (!googleClientInfo) {
    console.warn(
      "Google generative AI client not initialized. Ensure a supported package is installed and GOOGLE_API_KEY is set as an application setting."
    );
  } else {
    console.log("Google client initialized:", googleClientInfo.lib);
  }
})();

// POST /api/chat - matches your front-end
app.post("/api/chat", async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    if (!message || !sessionId) {
      return res.status(400).json({ error: "Missing message or sessionId" });
    }

    // create session chat object if not exists
    let chat = chatSessions.get(sessionId);
    if (!chat) {
      chat = { messages: [] };
      chatSessions.set(sessionId, chat);
      console.log(`Created new session ${sessionId}`);
    }

    // if no google client available: return clear error (so UI shows it)
    if (!googleClientInfo || !googleClientInfo.client) {
      console.error("No Google client available. googleClientInfo:", googleClientInfo);
      return res.status(500).json({
        reply:
          "⚠️ Server not configured to call the AI provider. Check server logs and ensure a supported Google generative AI package is installed and the GOOGLE_API_KEY app setting is present.",
      });
    }

    const { lib, client } = googleClientInfo;

    // Try calling known shapes in order. We'll attempt multiple call signatures.
    // 1) If client has chats.create / chat.sendMessage (older genai shape)
    try {
      if (typeof client.chats?.create === "function") {
        const chatObj = client.chats.create({
          model: "gemini-2.5-flash",
          config: {
            systemInstruction:
              "You are an expert Code Assistant. Answer concisely and format code in markdown code blocks.",
          },
        });
        // Some implementations use chatObj.sendMessage
        if (typeof chatObj.sendMessage === "function") {
          const result = await chatObj.sendMessage({ message });
          const aiReply = result?.text ?? result?.reply ?? String(result);
          chat.messages.push({ sender: "user", text: message }, { sender: "ai", text: aiReply });
          return res.json({ reply: aiReply });
        }

        // some libs return a promise from create().sendMessage style - attempt chaining if available
        if (typeof chatObj.then === "function") {
          const resolved = await chatObj;
          if (resolved && typeof resolved.sendMessage === "function") {
            const result = await resolved.sendMessage({ message });
            const aiReply = result?.text ?? result?.reply ?? String(result);
            chat.messages.push({ sender: "user", text: message }, { sender: "ai", text: aiReply });
            return res.json({ reply: aiReply });
          }
        }
      }
    } catch (err) {
      console.info("genai chats.create attempt failed:", err && err.message ? err.message : err);
      // continue to next approach
    }

    // 2) If client has generateText (some versions used client.generateText)
    try {
      if (typeof client.generateText === "function") {
        const result = await client.generateText({
          model: "chat-bison-001",
          prompt: message,
        });
        const aiReply = result?.text ?? result?.output ?? JSON.stringify(result);
        chat.messages.push({ sender: "user", text: message }, { sender: "ai", text: aiReply });
        return res.json({ reply: aiReply });
      }
    } catch (err) {
      console.info("client.generateText attempt failed:", err && err.message ? err.message : err);
    }

    // 3) If module provides responses.generate (newer 'Responses' API shape)
    try {
      // example shapes:
      // client.responses.generate({ model: 'models/...', input: '...' })
      if (client.responses && typeof client.responses.generate === "function") {
        const response = await client.responses.generate({
          model: "models/chat-bison-001",
          input: message,
        });
        // response structure varies; try to extract text
        let aiReply = null;
        if (response?.output?.[0]?.content) {
          aiReply = response.output.map((o) => (o?.content?.[0]?.text ?? "")).join("\n");
        } else if (typeof response?.outputText === "string") {
          aiReply = response.outputText;
        } else if (response?.candidates?.[0]?.content) {
          aiReply = response.candidates[0].content;
        } else {
          aiReply = JSON.stringify(response);
        }
        chat.messages.push({ sender: "user", text: message }, { sender: "ai", text: aiReply });
        return res.json({ reply: aiReply });
      }
    } catch (err) {
      console.info("client.responses.generate attempt failed:", err && err.message ? err.message : err);
    }

    // 4) As a last attempt: if client is a function or default export that expects a REST-style call, try a generic generate (best-effort)
    try {
      if (typeof client === "function") {
        const result = await client({
          model: "chat-bison-001",
          input: message,
        });
        const aiReply = result?.text ?? JSON.stringify(result);
        chat.messages.push({ sender: "user", text: message }, { sender: "ai", text: aiReply });
        return res.json({ reply: aiReply });
      }
    } catch (err) {
      console.info("generic client() attempt failed:", err && err.message ? err.message : err);
    }

    // Nothing matched
    console.error(
      "No matching client method found for the installed Google package. googleClientInfo:",
      googleClientInfo && googleClientInfo.lib
    );
    console.error(
      "Available client keys:",
      Object.keys(googleClientInfo.client ?? {}).slice(0, 50)
    );

    return res.status(500).json({
      reply:
        "⚠️ AI client is installed but no compatible call was found. Check server logs for client shape and confirm which @google package and version is installed.",
    });
  } catch (error) {
    console.error("❌ Server error during chat:", error && error.stack ? error.stack : error);
    return res.status(500).json({ reply: "⚠️ Error connecting to the AI server." });
  }
});

// Serve index.html on other routes (fallback to SPA)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "src", "index.html"));
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
