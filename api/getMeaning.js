// backend/api/getMeaning.js

const { getMeaningFromGemini } = require('../services/languageAPI');

async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*'); // Replace '*' with your extension's origin in production
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const { word } = req.query;

  // Validate input
  if (!word || typeof word !== 'string') {
    return res.status(400).json({ error: 'Word query parameter is required and must be a string.' });
  }

  const trimmedWord = word.trim();
  if (trimmedWord.length === 0 || trimmedWord.length > 50 || !/^[a-zA-Z\s-]+$/.test(trimmedWord)) {
    return res.status(400).json({ error: 'Word must be 1-50 characters long and contain only letters, spaces, or hyphens.' });
  }

  try {
    const { meaning, synonyms, source } = await getMeaningFromGemini(trimmedWord);

    console.log(`✅ Meaning and synonyms fetched from "${source}" for word: "${trimmedWord}"`);

    res.status(200).json({ meaning, synonyms, source }); // Send source in response
  } catch (error) {
    console.error(`❌ Error in /api/getMeaning for word "${trimmedWord}":`, error.message, error.stack);
    res.status(500).json({
      error: 'Failed to fetch meaning and synonyms',
      meaning: 'Unable to fetch meaning at the moment.',
      synonyms: 'Unable to fetch synonyms at the moment.',
      source: 'none'
    });
  }
}

module.exports = handler;
