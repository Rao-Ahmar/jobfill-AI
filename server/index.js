require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Initialize Google Gemini SDK
const genAI = new GoogleGenerativeAI(process.env.CLAUDE_API_KEY || process.env.GEMINI_API_KEY);

app.post('/api/generate', async (req, res) => {
  try {
    const { prompt, system, max_tokens, temperature, model = 'gemini-2.5-flash' } = req.body;
    
    // Convert Claude API params to Gemini format
    const generativeModel = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: system
    });

    const generationConfig = {
      temperature: temperature || 0.7,
      maxOutputTokens: max_tokens || 8192,
      responseMimeType: "application/json"
    };

    const result = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig,
    });
    
    const responseText = result.response.text();

    // Map the Gemini text response back into the format the frontend (claudeApi.js) expects
    res.json({
      content: [{ text: responseText }]
    });
    
  } catch (error) {
    console.error('Gemini API Error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate response' });
  }
});

app.listen(port, () => {
  console.log(`JobFill AI Proxy Server running on port ${port}`);
});
