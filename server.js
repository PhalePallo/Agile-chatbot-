import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("src")); // Serve index.html, script.js, style.css

// Initialize Google Gemini client
const client = new GoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY, // Must be set in Azure App Settings
});

// Health check route
app.get("/health", (req, res) => {
  res.send("Server is alive!");
});

// Root route
app.get("/", (req, res) => {
  res.sendFile("index.html", { root: "src" });
});

// Chat endpoint
app.post("/chat", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const response = await client.generateText({
      model: "chat-bison-001",
      prompt,
    });

    res.json({ reply: response.text });
  } catch (error) {
    console.error("Error generating response:", error);
    res.status(500).json({ error: "Failed to generate response" });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
