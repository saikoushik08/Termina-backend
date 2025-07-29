const supabase = require('../services/supabaseClient');
const { getMeaningFromGemini } = require('../services/languageAPI');

function isInvalidText(text) {
  if (!text) return true;
  const lowered = text.toLowerCase().trim();
  const failPhrases = [
    'unable to fetch',
    'not found',
    'no meaning',
    'no synonyms',
    'error',
    'undefined',
    'null',
  ];
  return failPhrases.some((phrase) => lowered.includes(phrase));
}

function isValidWordData({ meaning, synonyms }) {
  const meaningInvalid = isInvalidText(meaning);
  const synonymsInvalid = isInvalidText(synonyms);

  console.log('Validation check — Meaning invalid:', meaningInvalid, 'Synonyms invalid:', synonymsInvalid);

  // Return false if both meaning and synonyms are invalid
  return !(meaningInvalid && synonymsInvalid);
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const { word } = req.query;

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
    // 1. Check Supabase cache
    const { data: cachedData, error: fetchError } = await supabase
      .from('words')
      .select('meaning, synonyms, source')
      .eq('word', trimmedWord)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Supabase fetch error:', fetchError);
    }

    if (cachedData) {
      console.log(`🔁 Cache hit for "${trimmedWord}" from source: ${cachedData.source}`);
      return res.status(200).json({
        meaning: cachedData.meaning,
        synonyms: Array.isArray(cachedData.synonyms) ? cachedData.synonyms.join(', ') : cachedData.synonyms,
        source: cachedData.source,
      });
    }

    // 2. Not in cache → fetch from Gemini or fallback
    const result = await getMeaningFromGemini(trimmedWord);

    if (!result || !result.meaning || !result.synonyms) {
      console.error(`❌ Invalid response from getMeaningFromGemini for word "${trimmedWord}"`, result);
      return res.status(500).json({
        error: 'No meaning found',
        meaning: 'Meaning not found.',
        synonyms: 'Synonyms not found.',
        source: 'none',
      });
    }

    const { meaning, synonyms, source } = result;

    // Prepare synonyms array safely
    const synonymsArray = synonyms
      ? synonyms.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    // 3. Only save to Supabase if meaning and synonyms are valid
    if (isValidWordData({ meaning, synonyms })) {
      const { error: insertError } = await supabase.from('words').insert([
        {
          word: trimmedWord,
          meaning,
          synonyms: synonymsArray,
          source,
        },
      ]);

      if (insertError) {
        console.error(`❌ Supabase insert error for "${trimmedWord}":`, insertError);
      } else {
        console.log(`✅ Inserted "${trimmedWord}" into Supabase.`);
      }
    } else {
      console.log(`⚠️ Skipped saving "${trimmedWord}" due to invalid meaning and synonyms.`);
    }

    // 4. Return response
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
