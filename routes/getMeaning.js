// backend/routes/getMeaning.js

const express = require('express');
const router = express.Router();
const { getMeaningFromGemini } = require('../services/languageAPI');

// GET /api/getMeaning?word=example
router.get('/', async (req, res) => {
  const word = req.query.word;

  if (!word || typeof word !== 'string') {
    return res.status(400).json({ error: 'Word query parameter is required.' });
  }

  try {
    const { meaning, synonyms } = await getMeaningFromGemini(word);
    res.json({ meaning, synonyms });
  } catch (error) {
    console.error('Error in /getMeaning:', error.message);
    res.status(500).json({
      error: 'Failed to fetch meaning and synonyms',
      meaning: 'Unable to fetch meaning at the moment.',
      synonyms: 'Unable to fetch synonyms at the moment.'
    });
  }
});

module.exports = router;
