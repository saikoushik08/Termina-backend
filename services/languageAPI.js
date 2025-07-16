// backend/services/languageAPI.js

const { GoogleGenerativeAI } = require('@google/generative-ai');
const fetch = require('node-fetch');
require('dotenv').config();

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro-latest' }); // Fallback to 'gemini-pro' if needed

// Timeout wrapper for API calls
const timeout = (ms, promise) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('API call timed out')), ms);
    }),
  ]);
};

/**
 * Generates meaning and synonyms for a given word using Google Gemini, with Wordnik fallback.
 * @param {string} word
 * @returns {Promise<{meaning: string, synonyms: string}>}
 */
async function getMeaningFromGemini(word) {
  const prompt = `
Only respond with a valid JSON object.

Given a word: "${word}", return:
{"meaning": "...", "synonyms": "..., ..., ..."}

Do NOT include markdown, explanation, or extra text.
`;

  try {
    // Call Gemini API with 8-second timeout
    const result = await timeout(8000, model.generateContent(prompt));
    const text = result.response.text().trim();

    // Safer JSON parsing
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (parseErr) {
      // Try extracting JSON from response
      const jsonMatch = text.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No valid JSON found in Gemini response');
      }
    }

    // Validate response structure
    if (!parsed.meaning || !parsed.synonyms || typeof parsed.meaning !== 'string' || typeof parsed.synonyms !== 'string') {
      throw new Error('Incomplete or invalid JSON structure');
    }

    return {
      meaning: parsed.meaning.trim(),
      synonyms: parsed.synonyms.trim(),
    };
  } catch (err) {
    console.error(`❌ Gemini API error for word "${word}":`, err.message, err.stack);

    // Fallback to Wordnik API
    if (process.env.WORDNIK_API_KEY) {
      try {
        const meaningUrl = `https://api.wordnik.com/v4/word.json/${encodeURIComponent(word)}/definitions?limit=1&api_key=${process.env.WORDNIK_API_KEY}`;
        const synonymsUrl = `https://api.wordnik.com/v4/word.json/${encodeURIComponent(word)}/relatedWords?relationshipTypes=synonym&limit=5&api_key=${process.env.WORDNIK_API_KEY}`;

        const [meaningRes, synonymsRes] = await Promise.all([
          fetch(meaningUrl),
          fetch(synonymsUrl),
        ]);

        const meaningData = await meaningRes.json();
        const synonymsData = await synonymsRes.json();

        const meaning = meaningData[0]?.text || 'Unable to fetch meaning at the moment.';
        const synonyms = synonymsData[0]?.words?.join(', ') || 'Unable to fetch synonyms at the moment.';

        return { meaning, synonyms };
      } catch (wordnikErr) {
        console.error(`❌ Wordnik API error for word "${word}":`, wordnikErr.message, wordnikErr.stack);
      }
    }

    // Return fallback if both APIs fail
    return {
      meaning: 'Unable to fetch meaning at the moment.',
      synonyms: 'Unable to fetch synonyms at the moment.',
    };
  }
}

module.exports = {
  getMeaningFromGemini,
};