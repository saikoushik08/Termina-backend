// backend/api/getMeaning.js

const supabase = require('../services/supabaseClient');
const { getMeaningFromGemini } = require('../services/languageAPI');

async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*'); // In production, replace with specific origin
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
    // 1. Check Supabase cache first
    const { data: cachedData, error: fetchError } = await supabase
      .from('words')
      .select('meaning, synonyms, source')
      .eq('word', trimmedWord)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('⚠️ Supabase fetch error:', fetchError);
    }

    if (cachedData) {
      console.log(`🔁 Cache hit for "${trimmedWord}" from source: ${cachedData.source}`);
      return res.status(200).json({
        meaning: cachedData.meaning,
        synonyms: Array.isArray(cachedData.synonyms)
          ? cachedData.synonyms.join(', ')
          : '',
        source: cachedData.source,
      });
    }

    // 2. If not in cache, fetch from Gemini or fallback APIs
    const { meaning, synonyms, source } = await getMeaningFromGemini(trimmedWord);

    if (!meaning || !synonyms) {
      throw new Error('No meaning found');
    }

    // 3. Store in Supabase
    const insertPayload = {
      word: trimmedWord,
      meaning,
      synonyms: synonyms
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean), // clean & ensure non-empty
      source,
    };

    const { error: insertError } = await supabase.from('words').insert([insertPayload]);

    if (insertError) {
      console.error('⚠️ Supabase insert error:', insertError);
    }

    // 4. Return response
    console.log(`✅ Fetched from "${source}" and cached for "${trimmedWord}"`);
    return res.status(200).json({
      meaning,
      synonyms,
      source,
    });
  } catch (error) {
    console.error(`❌ Error in /api/getMeaning for word "${trimmedWord}":`, error.message);
    return res.status(500).json({
      error: 'Failed to fetch meaning and synonyms',
      meaning: 'Unable to fetch meaning at the moment.',
      synonyms: 'Unable to fetch synonyms at the moment.',
      source: 'none',
    });
  }
}

module.exports = handler;
