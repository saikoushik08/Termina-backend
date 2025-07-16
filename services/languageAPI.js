const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'models/gemini-1.5-pro-latest' });

/**
 * Generates meaning and synonyms for a given word using Google Gemini.
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
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) throw new Error('No valid JSON found in Gemini response');

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.meaning || !parsed.synonyms) {
      throw new Error('Incomplete JSON structure');
    }

    return {
      meaning: parsed.meaning.trim(),
      synonyms: parsed.synonyms.trim(),
    };
  } catch (err) {
    console.error('❌ Gemini API or parsing error:', err.message);
    return {
      meaning: 'Could not fetch meaning at the moment.',
      synonyms: 'Could not fetch synonyms at the moment.',
    };
  }
}

module.exports = {
  getMeaningFromGemini,
};
