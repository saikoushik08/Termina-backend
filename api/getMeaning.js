// backend/api/getMeaning.js

const { getMeaningFromGemini } = require('../services/languageAPI');

async function handler(req, res) {
  const { word } = req.query;

  if (!word || typeof word !== 'string') {
    return res.status(400).json({ error: 'Word query parameter is required.' });
  }

  try {
    const { meaning, synonyms } = await getMeaningFromGemini(word.trim());
    res.status(200).json({ meaning, synonyms });
  } catch (error) {
    console.error('Error in /api/getMeaning:', error.message);
    res.status(500).json({
      error: 'Failed to fetch meaning and synonyms',
      meaning: 'Unable to fetch meaning at the moment.',
      synonyms: 'Unable to fetch synonyms at the moment.',
    });
  }
}

module.exports = handler;
