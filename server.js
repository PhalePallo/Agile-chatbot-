// server.js
import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Initialize Google Generative AI client
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store active chat sessions
const chatSessions = new Map();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files (HTML, CSS, JS) from 'src'
app.use(express.static(path.join(__dirname, "src")));

// Gemini Chat API Endpoint
app.post("/api/chat", async (req, res) => {
    try {
        const { message, sessionId } = req.body;
        
        if (!message || !sessionId) {
            return res.status(400).json({ error: "Missing message or sessionId" });
        }

        let chat = chatSessions.get(sessionId);

        // Create new session if one doesn't exist
        if (!chat) {
            const model = genAI.getGenerativeModel({ 
                model: "gemini-pro",
                systemInstruction: "You are an expert Code Assistant. Your primary function is to answer programming and coding-related questions. Keep your responses concise, helpful, and formatted clearly using markdown code blocks."
            });
            
            chat = model.startChat({
                history: [],
                generationConfig: {
                    maxOutputTokens: 1000,
                },
            });
            
            chatSessions.set(sessionId, chat);
            console.log(`New chat session created: ${sessionId}`);
        }

        // Send user message and get AI reply with retry logic
        let retries = 3;
        let aiReply;
        
        while (retries > 0) {
            try {
                const result = await chat.sendMessage(message);
                aiReply = result.response.text();
                break;
            } catch (error) {
                if (error.status === 503 && retries > 1) {
                    console.log(`API overloaded, retrying... (${retries - 1} attempts left)`);
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
                    retries--;
                } else {
                    throw error;
                }
            }
        }

        res.json({ reply: aiReply });
        
    } catch (error) {
        console.error("❌ Server error during chat:", error.message);
        
        // Provide user-friendly error messages
        if (error.status === 503) {
            res.status(503).json({ 
                reply: "⚠️ The AI service is currently experiencing high traffic. Please try again in a moment." 
            });
        } else if (error.status === 429) {
            res.status(429).json({ 
                reply: "⚠️ Rate limit exceeded. Please wait a moment before sending another message." 
            });
        } else if (error.message?.includes("API key")) {
            res.status(500).json({ 
                reply: "⚠️ API configuration error. Please contact the administrator." 
            });
        } else {
            res.status(500).json({ 
                reply: "⚠️ Error connecting to the AI server. Please try again." 
            });
        }
    }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
    res.json({ 
        status: "ok", 
        timestamp: new Date().toISOString(),
        apiKeyConfigured: !!process.env.GOOGLE_API_KEY
    });
});

// Serve index.html
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "src", "index.html"));
});

// Fallback route
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, "src", "index.html"));
});

// Start server
app.listen(port, () => {
    console.log(`🚀 Server running on http://localhost:${port}`);
    console.log(`✅ API Key configured: ${!!process.env.GOOGLE_API_KEY}`);
});
