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

// Serve static frontend from "src" folder
app.use(express.static(path.join(process.cwd(), "src")));
app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "src", "index.html"));
});

// Optional: Health check
app.get("/health", (req, res) => res.send("ok"));

// Chat API endpoint
app.post("/api/chat", async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message || !sessionId) {
    return res.status(400).json({ error: "Missing message or sessionId" });
  }

  if (!process.env.GOOGLE_API_KEY) {
    return res.status(503).json({
      reply:
        "⚠️ AI backend not configured. Set GOOGLE_API_KEY in App Settings.",
    });
  }

  try {
    // Import Google client dynamically
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const client = new GoogleGenerativeAI({ apiKey: process.env.GOOGLE_API_KEY });

    const response = await client.generateText({
      model: "chat-bison-001",
      prompt: message,
    });

    res.json({ reply: response.text || "No reply from AI." });
  } catch (err) {
    console.error("Error calling AI backend:", err);
    res.status(500).json({ reply: "⚠️ Server error contacting AI backend." });
  }
});

// Fallback for SPA routing
app.use((req, res) => {
  res.sendFile(path.join(process.cwd(), "src", "index.html"));
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
