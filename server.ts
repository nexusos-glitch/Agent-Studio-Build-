import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.post("/api/polish", async (req, res) => {
    try {
      const { text, tone, length, language } = req.body;
      
      if (!text) {
        return res.status(400).json({ error: "Text is required" });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "Gemini API Key is not configured." });
      }

      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      let systemInstruction = "You are an expert text editor and copywriter. Your job is to polish the provided text.";
      if (tone) systemInstruction += ` Make the tone ${tone}.`;
      if (length) systemInstruction += ` Keep the length ${length}.`;
      if (language) systemInstruction += ` Translate or ensure the output is in ${language}.`;
      systemInstruction += " Reply ONLY with the polished text. Do not include any conversational filler.";

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: text,
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      });

      res.json({ polishedText: response.text });
    } catch (error: any) {
      console.error("Error calling Gemini API:", error);
      res.status(500).json({ error: error.message || "Failed to process text" });
    }
  });

  app.post("/api/suggest", async (req, res) => {
    try {
      const { text } = req.body;
      
      if (!text || text.trim().length < 3) {
        return res.json({ suggestions: [] });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "Gemini API Key is not configured." });
      }

      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const systemInstruction = "You are an auto-suggest autocomplete tool. Provide 3 short phrases (max 5 words each) that logically complete or continue the user's text. Reply with ONLY a JSON array of strings (e.g. [\"first suggestion\", \"second option\", \"third idea\"]).";

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: text,
        config: {
          systemInstruction,
          temperature: 0.3,
          responseMimeType: "application/json",
        },
      });

      let suggestions: string[] = [];
      try {
        if (response.text) {
          suggestions = JSON.parse(response.text);
        }
      } catch (e) {
        console.error("Failed to parse suggestions", e, response.text);
      }

      res.json({ suggestions });
    } catch (error: any) {
      console.error("Error in suggest API:", error);
      res.status(500).json({ error: "Failed to generate suggestions" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
