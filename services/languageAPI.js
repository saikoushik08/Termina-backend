const { GoogleGenerativeAI } = require('@google/generative-ai');
const fetch = require('node-fetch');
require('dotenv').config();

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Timeout wrapper
const timeout = (ms, promise) => {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('API call timed out')), ms)
    ),
  ]);
};

/**
 * Get meaning + synonyms using Gemini → Wordnik → Free Dictionary fallback
 * @param {string} word
 * @returns {Promise<{meaning: string, synonyms: string, source: string}>}
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
  `.trim();

  // -------- Tier 1: Gemini --------
  try {
    const result = await timeout(8000, model.generateContent(prompt));
    const text = result.response.text().trim();

    // Detect rate limit in Gemini's response if possible
    // This depends on the actual error format returned by Gemini API
    // For example, if the API returns a 429 or an error message containing "limit"
    if (/limit/i.test(text)) {
      throw new Error('Gemini API usage limit exceeded');
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
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

    const response = {
      source: 'gemini',
      meaning: parsed.meaning.trim(),
      synonyms: parsed.synonyms.trim(),
    };

    console.log(`✅ Fetched from Gemini for "${word}"`);
    return response;
  } catch (err) {
    console.error(`❌ Gemini API error for "${word}":`, err.message);

    // If error is rate limit related, fall back immediately to Wordnik
    if (/limit/i.test(err.message)) {
      console.warn(`⚠️ Gemini limit hit, falling back to Wordnik for "${word}"`);

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

          return {
            source: 'wordnik',
            meaning:
              meaningData?.[0]?.text || 'Unable to fetch meaning at the moment.',
            synonyms:
              synonymsData?.[0]?.words?.join(', ') ||
              'Unable to fetch synonyms at the moment.',
          };
        } catch (wordnikErr) {
          console.error(`❌ Wordnik API error for "${word}":`, wordnikErr.message);
          // If Wordnik also fails, continue to Free Dictionary fallback below
        }
      }
    }
  }

  // -------- Tier 2: Wordnik fallback (normal flow if Gemini errored but not limit) --------
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

      const response = {
        source: 'wordnik',
        meaning:
          meaningData?.[0]?.text || 'Unable to fetch meaning at the moment.',
        synonyms:
          synonymsData?.[0]?.words?.join(', ') ||
          'Unable to fetch synonyms at the moment.',
      };

      console.log(`✅ Fetched from Wordnik for "${word}"`);
      return response;
    } catch (wordnikErr) {
      console.error(`❌ Wordnik API error for "${word}":`, wordnikErr.message);
    }
  }

  // -------- Tier 3: Free Dictionary API fallback --------
  try {
    const freeURL = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(
      word
    )}`;
    const freeRes = await fetch(freeURL);
    const freeData = await freeRes.json();

    const meaning =
      freeData?.[0]?.meanings?.[0]?.definitions?.[0]?.definition ||
      'Unable to fetch meaning.';

    const synonymsSet = new Set();

    freeData?.[0]?.meanings?.forEach((m) => {
      m.definitions?.forEach((def) => {
        if (Array.isArray(def.synonyms)) {
          def.synonyms.forEach((s) => synonymsSet.add(s));
        }
      });
    });

    const response = {
      source: 'free-dictionary',
      meaning,
      synonyms:
        Array.from(synonymsSet).slice(0, 5).join(', ') ||
        'Unable to fetch synonyms.',
    };

    console.log(`✅ Fetched from Free Dictionary for "${word}"`);
    return response;
  } catch (freeErr) {
    console.error(
      `❌ Free Dictionary API error for "${word}":`,
      freeErr.message
    );
  }

  // -------- Final fallback (nothing worked) --------
  console.warn(`⚠️ All sources failed for "${word}"`);
  return {
    source: 'none',
    meaning: 'Unable to fetch meaning at the moment.',
    synonyms: 'Unable to fetch synonyms at the moment.',
  };
}

module.exports = {
  getMeaningFromGemini,
};
