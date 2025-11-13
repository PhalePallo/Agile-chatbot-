import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai"; // correct named import

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Initialize Google Gemini client
const client = new GoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY, // must be set in Azure App Settings
});

app.get("/", (req, res) => {
  res.send("Chatbot server is running!");
});

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
