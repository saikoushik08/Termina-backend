// backend/services/languageAPI.js

const { GoogleGenerativeAI } = require('@google/generative-ai');
const fetch = require('node-fetch');
require('dotenv').config();

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Timeout wrapper
const timeout = (ms, promise) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('API call timed out')), ms)),
  ]);
};

/**
 * Get meaning and synonyms using Gemini (fallback: Wordnik → Free Dictionary)
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
    // Call Gemini with timeout
    const result = await timeout(8000, model.generateContent(prompt));
    const text = result.response.text().trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const jsonMatch = text.match(/\{[\s\S]*?\}/);
      if (!jsonMatch) throw new Error('No valid JSON in response');
      parsed = JSON.parse(jsonMatch[0]);
    }

    if (typeof parsed.meaning !== 'string' || typeof parsed.synonyms !== 'string') {
      throw new Error('Invalid JSON structure from Gemini');
    }

    return {
      meaning: parsed.meaning.trim(),
      synonyms: parsed.synonyms.trim(),
    };
  } catch (err) {
    console.error(`❌ Gemini API error for "${word}":`, err.message);
  }

  // --- Fallback: Wordnik ---
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
        meaningData?.[0]?.text || 'Unable to fetch meaning at the moment.';
      const synonyms =
        synonymsData?.[0]?.words?.join(', ') ||
        'Unable to fetch synonyms at the moment.';

      return { meaning, synonyms };
    } catch (wordnikErr) {
      console.error(`❌ Wordnik API error for "${word}":`, wordnikErr.message);
    }
  }

  // --- Final fallback: Free Dictionary API ---
  try {
    const dictUrl = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
    const dictRes = await fetch(dictUrl);
    const dictData = await dictRes.json();

    if (!Array.isArray(dictData)) throw new Error('Invalid dictionaryapi.dev response');

    const firstEntry = dictData[0];
    const firstMeaning = firstEntry?.meanings?.[0];
    const firstDefinition = firstMeaning?.definitions?.[0];

    const meaning = firstDefinition?.definition || 'Unable to fetch meaning at the moment.';
    const synonymsArr = firstDefinition?.synonyms || [];

    const synonyms = synonymsArr.length
      ? synonymsArr.join(', ')
      : 'Unable to fetch synonyms at the moment.';

    return { meaning, synonyms };
  } catch (dictErr) {
    console.error(`❌ DictionaryAPI error for "${word}":`, dictErr.message);
  }

  // --- Ultimate fallback (all failed) ---
  return {
    meaning: 'Unable to fetch meaning at the moment.',
    synonyms: 'Unable to fetch synonyms at the moment.',
  };
}

module.exports = {
  getMeaningFromGemini,
};
