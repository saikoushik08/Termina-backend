// backend/api/getMeaning.js

const supabase = require('../services/supabaseClient');
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

  const trimmedWord = word.trim().toLowerCase();
  if (
    trimmedWord.length === 0 ||
    trimmedWord.length > 50 ||
    !/^[a-zA-Z\s-]+$/.test(trimmedWord)
  ) {
    return res.status(400).json({
      error: 'Word must be 1-50 characters long and contain only letters, spaces, or hyphens.',
    });
  }

  try {
    // 1. Check if word exists in Supabase cache
    const { data: cachedData, error: fetchError } = await supabase
      .from('words')
      .select('meaning, synonyms, source')
      .eq('word', trimmedWord)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      // Unexpected error (other than no rows found)
      console.error('Supabase fetch error:', fetchError);
    }

    if (cachedData) {
      // Found in cache, return cached meaning + synonyms
      console.log(`🔁 Cache hit for "${trimmedWord}" from source: ${cachedData.source}`);
      return res.status(200).json({
        meaning: cachedData.meaning,
        synonyms: cachedData.synonyms.join(', '),
        source: cachedData.source,
      });
    }

    // 2. Not found in cache → fetch from AI/dictionary APIs
    const { meaning, synonyms, source } = await getMeaningFromGemini(trimmedWord);

    // 3. Save the new data to Supabase cache
    const { error: insertError } = await supabase.from('words').insert([
      {
        word: trimmedWord,
        meaning,
        synonyms: synonyms.split(',').map((s) => s.trim()), // Store synonyms as text array
        source,
      },
    ]);

    if (insertError) {
      console.error('Supabase insert error:', insertError);
    }

    // 4. Return fresh result
    console.log(`✅ Meaning and synonyms fetched from "${source}" for word: "${trimmedWord}"`);
    return res.status(200).json({
      meaning,
      synonyms,
      source,
    });
  } catch (error) {
    console.error(`❌ Error in /api/getMeaning for word "${trimmedWord}":`, error.message, error.stack);
    return res.status(500).json({
      error: 'Failed to fetch meaning and synonyms',
      meaning: 'Unable to fetch meaning at the moment.',
      synonyms: 'Unable to fetch synonyms at the moment.',
      source: 'none',
    });
  }
}

module.exports = handler;
