// backend/services/languageAPI.js

const { GoogleGenerativeAI } = require('@google/generative-ai');
const fetch = require('node-fetch');
require('dotenv').config();

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

/**
 * Timeout wrapper for any async task (like an API call).
 */
const timeout = (ms, promise) => {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('API call timed out')), ms)
    ),
  ]);
};

/**
 * Generates meaning and synonyms for a given word using Gemini (fallback: Wordnik, then Free Dictionary API).
 * @param {string} word
 * @returns {Promise<{meaning: string, synonyms: string}>}
 */
async function getMeaningFromGemini(word) {
  const prompt = `
Only respond with a valid JSON object.

Given the word: "${word}", reply exactly like:
{
  "meaning": "short, clear meaning",
  "synonyms": "comma, separated, list"
}

Do NOT include any explanation, markdown, or extra formatting.
`;

  try {
    // Use Gemini API with timeout
    const result = await timeout(8000, model.generateContent(prompt));
    const text = result.response.text().trim();

    let parsed;
    try {
      // Try direct JSON
      parsed = JSON.parse(text);
    } catch {
      // Try extracting JSON block
      const jsonMatch = text.match(/\{[\s\S]*?\}/);
      if (!jsonMatch) throw new Error('No valid JSON in response');
      parsed = JSON.parse(jsonMatch[0]);
    }

    if (
      typeof parsed.meaning !== 'string' ||
      typeof parsed.synonyms !== 'string'
    ) {
      throw new Error('Invalid JSON structure');
    }

    return {
      meaning: parsed.meaning.trim(),
      synonyms: parsed.synonyms.trim(),
    };
  } catch (err) {
    console.error(`❌ Gemini API error for "${word}":`, err.message);

    // Fallback to Wordnik API if enabled
    if (process.env.WORDNIK_API_KEY) {
      try {
        const meaningUrl = `https://api.wordnik.com/v4/word.json/${encodeURIComponent(
          word
        )}/definitions?limit=1&api_key=${process.env.WORDNIK_API_KEY}`;
        const synonymsUrl = `https://api.wordnik.com/v4/word.json/${encodeURIComponent(
          word
        )}/relatedWords?relationshipTypes=synonym&limit=5&api_key=${process.env.WORDNIK_API_KEY}`;

        const [meaningRes, synonymsRes] = await Promise.all([
          fetch(meaningUrl),
          fetch(synonymsUrl),
        ]);

        const meaningData = await meaningRes.json();
        const synonymsData = await synonymsRes.json();

        const meaning =
          meaningData?.[0]?.text || null;
        const synonyms =
          synonymsData?.[0]?.words?.join(', ') || null;

        if (meaning && synonyms) {
          return { meaning, synonyms };
        }
      } catch (wordnikErr) {
        console.error(
          `❌ Wordnik API error for "${word}":`,
          wordnikErr.message
        );
      }
    }

    // Fallback to Free Dictionary API
    try {
      const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
      const res = await fetch(url);
      const json = await res.json();

      const meaning = json?.[0]?.meanings?.[0]?.definitions?.[0]?.definition;
      const synonymsArr = json?.[0]?.meanings?.[0]?.definitions?.[0]?.synonyms || [];

      return {
        meaning: meaning || 'Unable to fetch meaning at the moment.',
        synonyms: synonymsArr.length > 0 ? synonymsArr.join(', ') : 'Unable to fetch synonyms at the moment.',
      };
    } catch (freeDictErr) {
      console.error(`❌ Free Dictionary API error for "${word}":`, freeDictErr.message);
    }

    // Final fallback if everything fails
    return {
      meaning: 'Unable to fetch meaning at the moment.',
      synonyms: 'Unable to fetch synonyms at the moment.',
    };
  }
}

module.exports = {
  getMeaningFromGemini,
};
