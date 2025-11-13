// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(process.cwd(), "src"))); // Serve frontend

// Health check
app.get("/health", (req, res) => res.send("ok"));

// Root route
app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "src", "index.html"));
});

// Chat endpoint
app.post("/api/chat", async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || !sessionId) {
      return res.status(400).json({ error: "Missing message or sessionId" });
    }

    if (!process.env.GOOGLE_API_KEY) {
      return res.json({
        reply:
          "⚠️ AI backend not configured. Set the GOOGLE_API_KEY app setting in Azure.",
      });
    }

    // If you want to connect to Google Gemini, you can add client initialization here
    // For now, just return a placeholder
    res.json({ reply: `You said: ${message}` });
  } catch (err) {
    console.error("Error in /api/chat:", err);
    res.status(500).json({ reply: "⚠️ Server error" });
  }
});

// Fallback for SPA routes
app.use((req, res) => {
  res.status(200).sendFile(path.join(process.cwd(), "src", "index.html"));
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
