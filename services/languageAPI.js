// backend/services/languageAPI.js

const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

/**
 * Generates meaning and synonyms for a given word using Google Gemini.
 * @param {string} word
 * @returns {Promise<{meaning: string, synonyms: string}>}
 */
async function getMeaningFromGemini(word) {
  const prompt = `You are a dictionary assistant. Provide the following for the word: "${word}".
  
Provide:
1. A short and clear meaning (1-2 lines).
2. 5 to 7 common synonyms (if any).

Format your response as a JSON object like this:
{
  "meaning": "...",
  "synonyms": "..., ..., ..."
}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // Extract JSON from the Gemini response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Gemini response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      meaning: (parsed.meaning || 'Meaning not found').trim(),
      synonyms: (parsed.synonyms || 'No synonyms found').trim()
    };
  } catch (err) {
    console.error('❌ Failed to get or parse Gemini response:', err);
    return {
      meaning: 'Could not fetch meaning at the moment.',
      synonyms: 'Could not fetch synonyms at the moment.'
    };
  }
}

module.exports = {
  getMeaningFromGemini
};
