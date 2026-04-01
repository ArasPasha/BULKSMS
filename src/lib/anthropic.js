/**
 * Identifies an item from a photo using the Anthropic API (Claude vision).
 * NOTE: For production, proxy this through a backend Cloud Function to avoid
 * exposing your API key in the browser bundle.
 *
 * @param {string} base64Image - base64-encoded image data (no data URL prefix)
 * @param {string} mediaType  - MIME type, e.g. "image/jpeg"
 * @returns {Promise<string>} - detected item name
 */
export async function identifyItemFromPhoto(base64Image, mediaType = 'image/jpeg') {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Anthropic API key not configured');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 64,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64Image },
            },
            {
              type: 'text',
              text: 'What household item is in this photo? Reply with only the item name, 1-4 words, no punctuation.',
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'AI identification failed');
  }

  const data = await response.json();
  return data.content?.[0]?.text?.trim() ?? '';
}
