// backend/services/languageAPI.js

const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ⚠️ Correct model path and usage
const model = genAI.getGenerativeModel({ model: 'models/gemini-pro' });

async function getMeaningFromGemini(word) {
  const prompt = `
Only respond with a valid JSON object.

Given a word: "${word}", return:
{"meaning": "...", "synonyms": "..., ..., ..."}

Do NOT include markdown, explanation, or extra text.
`;

  try {
    const result = await model.generateContent({
      contents: [{ parts: [{ text: prompt }], role: 'user' }],
    });

    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) throw new Error('No valid JSON found');

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      meaning: parsed.meaning?.trim() || 'Meaning not found.',
      synonyms: parsed.synonyms?.trim() || 'Synonyms not found.',
    };
  } catch (err) {
    console.error('❌ Gemini API or parsing error:', err.message);
    return {
      meaning: 'Could not fetch meaning at the moment.',
      synonyms: 'Could not fetch synonyms at the moment.',
    };
  }
}

module.exports = { getMeaningFromGemini };
