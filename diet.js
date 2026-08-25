// ══════════════════════════════════════════════════════════════════════════
// Arete — Diet Module
// ══════════════════════════════════════════════════════════════════════════

// ── AI FETCH HELPER (Gemini primary, Pollinations fallback) ──────────────
const _GEMINI_PROXY = 'https://arete-ai.oskarsteinicke.workers.dev';

// ── MEAL CACHE (skip AI for repeated meals) ─────────────────────────────
const _mealCache = (() => {
  try { return JSON.parse(localStorage.getItem('hvi_meal_cache') || '{}'); } catch { return {}; }
})();
function _cacheMeal(key, items) {
  _mealCache[key] = { items, ts: Date.now() };
  // Keep cache under 200 entries
  const entries = Object.entries(_mealCache).sort((a, b) => b[1].ts - a[1].ts);
  const pruned = Object.fromEntries(entries.slice(0, 200));
  localStorage.setItem('hvi_meal_cache', JSON.stringify(pruned));
}
function _getCachedMeal(text) {
  const key = text.toLowerCase().trim();
  const cached = _mealCache[key];
  if (cached && Date.now() - cached.ts < 7 * 86400000) return cached.items;
  return null;
}

async function _aiFetch(messages, { timeout = 30000, retries = 1, model = 'openai', jsonMode = false } = {}) {
  if (!navigator.onLine) throw new Error('offline');
  let lastErr;
  const _hasImages = messages.some(m => Array.isArray(m.content) && m.content.some(p => p.type === 'image_url'));

  // ── Vision requests: Gemini (native vision support) ──────────────────
  if (_hasImages) {
    for (let attempt = 0; attempt <= 1; attempt++) {
      try {
        const result = await _geminiRequest(messages, { timeout: 45000, jsonMode: false });
        if (result && result.length > 2) return result;
        console.warn('[vision] Gemini empty response');
        lastErr = new Error('Empty response');
      } catch (e) {
        console.warn('[vision] Gemini error:', e.message);
        lastErr = e;
        if (attempt === 0) await new Promise(r => setTimeout(r, 1500));
        else break;
      }
    }
    throw lastErr;
  }

  // ── Text requests: Groq first ────────────────────────────────────────
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await _groqRequest(messages, { timeout, jsonMode });
      if (result) return result;
    } catch (e) {
      lastErr = e;
      if (attempt === 0) await new Promise(r => setTimeout(r, 500));
    }
  }

  // ── Fallback: Gemini via proxy ───────────────────────────────────────
  try {
    const result = await _geminiRequest(messages, { timeout, jsonMode });
    if (result) return result;
  } catch (e) { lastErr = e; }

  // ── Last resort: Pollinations ────────────────────────────────────────
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), timeout);
    try {
      const body = { messages, model: 'openai', seed: 42, temperature: 0, private: true };
      if (jsonMode) body.jsonMode = true;
      const res = await fetch('https://text.pollinations.ai/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ac.signal,
        body: JSON.stringify(body)
      });
      clearTimeout(to);
      if (!res.ok) { lastErr = new Error(`HTTP ${res.status}`); continue; }
      const text = await res.text();
      if (!text || text.length < 2 || text.includes('"error"')) { lastErr = new Error('Bad response'); continue; }
      return text;
    } catch (e) {
      clearTimeout(to);
      lastErr = e;
      if (e.name === 'AbortError' && attempt < retries) continue;
      break;
    }
  }
  throw lastErr;
}

async function _groqRequest(messages, { timeout = 20000, jsonMode = false, vision = false } = {}) {
  const ac = new AbortController();
  const actualTimeout = vision ? 45000 : timeout;
  const to = setTimeout(() => ac.abort(), actualTimeout);
  try {
    const model = vision ? 'llama-3.2-11b-vision-preview' : 'llama-3.3-70b-versatile';
    const body = { messages, model, temperature: 0, max_tokens: 1024 };
    if (jsonMode && !vision) body.response_format = { type: 'json_object' };
    const res = await fetch(_GEMINI_PROXY + '/groq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ac.signal,
      body: JSON.stringify(body)
    });
    clearTimeout(to);
    if (!res.ok) {
      console.warn('[groq] vision request failed:', res.status);
      return null;
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text || text.length < 2) return null;
    return text;
  } catch (e) {
    clearTimeout(to);
    throw e;
  }
}

async function _geminiRequest(messages, { timeout = 30000, jsonMode = false } = {}) {
  // Convert OpenAI-style messages to Gemini format
  const systemParts = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
  const contents = messages.filter(m => m.role !== 'system').map(m => {
    // Handle multimodal (image) messages
    if (Array.isArray(m.content)) {
      const parts = m.content.map(p => {
        if (p.type === 'text') return { text: p.text };
        if (p.type === 'image_url') {
          const url = p.image_url?.url || '';
          const match = url.match(/^data:(.+?);base64,(.+)$/);
          if (match) return { inlineData: { mimeType: match[1], data: match[2] } };
        }
        return null;
      }).filter(Boolean);
      return { role: m.role === 'assistant' ? 'model' : 'user', parts };
    }
    return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] };
  });

  const genConfig = { temperature: 0 };
  if (jsonMode) genConfig.responseMimeType = 'application/json';

  const body = { contents, generationConfig: genConfig };
  if (systemParts) body.systemInstruction = { parts: [{ text: systemParts }] };

  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), timeout);
  try {
    const res = await fetch(_GEMINI_PROXY, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ac.signal, body: JSON.stringify(body)
    });
    clearTimeout(to);
    if (!res.ok) return null; // fall through to next provider
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text || text.length < 2) return null;
    return text;
  } catch (e) {
    clearTimeout(to);
    throw e;
  }
}

// ── LOCAL FOOD DATABASE (fallback when AI is unavailable) ────────────────
const _FOOD_DB = {
  'egg':        { name:'Egg', calories:78, protein:6, carbs:1, fat:5 },
  'eggs':       { name:'Egg', calories:78, protein:6, carbs:1, fat:5 },
  'banana':     { name:'Banana', calories:105, protein:1, carbs:27, fat:0 },
  'apple':      { name:'Apple', calories:95, protein:0, carbs:25, fat:0 },
  'rice':       { name:'Rice (1 cup)', calories:206, protein:4, carbs:45, fat:0 },
  'chicken':    { name:'Chicken breast (150g)', calories:231, protein:43, carbs:0, fat:5 },
  'chicken breast': { name:'Chicken breast (150g)', calories:231, protein:43, carbs:0, fat:5 },
  'salmon':     { name:'Salmon (150g)', calories:280, protein:35, carbs:0, fat:15 },
  'bread':      { name:'Bread (2 slices)', calories:160, protein:6, carbs:30, fat:2 },
  'toast':      { name:'Toast (2 slices)', calories:160, protein:6, carbs:30, fat:2 },
  'oats':       { name:'Oats (80g)', calories:300, protein:10, carbs:54, fat:6 },
  'oatmeal':    { name:'Oatmeal (80g)', calories:300, protein:10, carbs:54, fat:6 },
  'milk':       { name:'Milk (250ml)', calories:150, protein:8, carbs:12, fat:8 },
  'yogurt':     { name:'Yogurt (200g)', calories:150, protein:12, carbs:18, fat:4 },
  'greek yogurt':{ name:'Greek yogurt (200g)', calories:130, protein:20, carbs:8, fat:4 },
  'pasta':      { name:'Pasta (200g cooked)', calories:280, protein:10, carbs:56, fat:2 },
  'steak':      { name:'Steak (200g)', calories:460, protein:50, carbs:0, fat:28 },
  'avocado':    { name:'Avocado', calories:240, protein:3, carbs:12, fat:22 },
  'peanut butter':{ name:'Peanut butter (2 tbsp)', calories:190, protein:7, carbs:7, fat:16 },
  'protein shake':{ name:'Protein shake', calories:160, protein:30, carbs:8, fat:2 },
  'whey':       { name:'Whey protein scoop', calories:120, protein:24, carbs:3, fat:1 },
  'big mac':    { name:'Big Mac', calories:550, protein:25, carbs:45, fat:30 },
  'fries':      { name:'Fries (large)', calories:490, protein:7, carbs:66, fat:23 },
  'pizza':      { name:'Pizza (2 slices)', calories:570, protein:24, carbs:64, fat:22 },
  'burger':     { name:'Burger', calories:500, protein:28, carbs:40, fat:25 },
  'sandwich':   { name:'Sandwich', calories:400, protein:20, carbs:45, fat:15 },
  'salad':      { name:'Salad (mixed)', calories:150, protein:5, carbs:12, fat:10 },
  'coffee':     { name:'Coffee (black)', calories:5, protein:0, carbs:0, fat:0 },
  'latte':      { name:'Latte', calories:190, protein:10, carbs:18, fat:8 },
  'orange juice':{ name:'Orange juice (250ml)', calories:112, protein:2, carbs:26, fat:0 },
  'almonds':    { name:'Almonds (30g)', calories:170, protein:6, carbs:6, fat:15 },
  'cheese':     { name:'Cheese (30g)', calories:110, protein:7, carbs:1, fat:9 },
  'butter':     { name:'Butter (1 tbsp)', calories:100, protein:0, carbs:0, fat:11 },
  'olive oil':  { name:'Olive oil (1 tbsp)', calories:120, protein:0, carbs:0, fat:14 },
  'potato':     { name:'Potato (medium)', calories:160, protein:4, carbs:37, fat:0 },
  'sweet potato':{ name:'Sweet potato', calories:112, protein:2, carbs:26, fat:0 },
  'broccoli':   { name:'Broccoli (100g)', calories:34, protein:3, carbs:7, fat:0 },
  'tuna':       { name:'Tuna (can)', calories:180, protein:40, carbs:0, fat:2 },
  'bacon':      { name:'Bacon (3 strips)', calories:130, protein:9, carbs:0, fat:10 },
  'honey':      { name:'Honey (1 tbsp)', calories:64, protein:0, carbs:17, fat:0 },
  'chocolate':  { name:'Chocolate (40g)', calories:210, protein:3, carbs:24, fat:12 },
  'ice cream':  { name:'Ice cream (1 scoop)', calories:140, protein:2, carbs:16, fat:7 },
  'beer':       { name:'Beer (330ml)', calories:150, protein:1, carbs:13, fat:0 },
  'wine':       { name:'Wine (150ml)', calories:125, protein:0, carbs:4, fat:0 },
  'sushi':      { name:'Sushi (6 pcs)', calories:300, protein:14, carbs:42, fat:7 },
  'burrito':    { name:'Burrito', calories:650, protein:30, carbs:70, fat:25 },
  'wrap':       { name:'Wrap', calories:400, protein:22, carbs:40, fat:16 },
  'smoothie':   { name:'Smoothie', calories:250, protein:8, carbs:45, fat:5 },
  'cereal':     { name:'Cereal (1 bowl + milk)', calories:280, protein:8, carbs:48, fat:5 },
  'granola':    { name:'Granola (60g)', calories:270, protein:6, carbs:36, fat:12 },
  'pancakes':   { name:'Pancakes (3)', calories:350, protein:10, carbs:50, fat:12 },
  'waffle':     { name:'Waffle', calories:220, protein:6, carbs:33, fat:8 },
  'waffles':    { name:'Waffles (2)', calories:440, protein:12, carbs:66, fat:16 },
  'french toast':{ name:'French toast (2 slices)', calories:350, protein:12, carbs:40, fat:16 },
  'bagel':      { name:'Bagel', calories:270, protein:10, carbs:53, fat:2 },
  'croissant':  { name:'Croissant', calories:230, protein:5, carbs:26, fat:12 },
  'muffin':     { name:'Muffin', calories:340, protein:5, carbs:50, fat:14 },
  'donut':      { name:'Donut', calories:270, protein:4, carbs:31, fat:14 },
  'cottage cheese':{ name:'Cottage cheese (200g)', calories:180, protein:24, carbs:8, fat:5 },
  'cream cheese':{ name:'Cream cheese (2 tbsp)', calories:100, protein:2, carbs:2, fat:9 },
  'hummus':     { name:'Hummus (60g)', calories:100, protein:5, carbs:9, fat:6 },
  'trail mix':  { name:'Trail mix (40g)', calories:200, protein:5, carbs:18, fat:13 },
  'protein bar':{ name:'Protein bar', calories:220, protein:20, carbs:24, fat:8 },
  'energy bar': { name:'Energy bar', calories:250, protein:8, carbs:40, fat:8 },
  'jerky':      { name:'Beef jerky (30g)', calories:80, protein:13, carbs:3, fat:1 },
  'popcorn':    { name:'Popcorn (large)', calories:370, protein:7, carbs:53, fat:16 },
  'chips':      { name:'Chips (small bag)', calories:270, protein:3, carbs:28, fat:17 },
  'crackers':   { name:'Crackers (8)', calories:140, protein:3, carbs:22, fat:5 },
  'rice cake':  { name:'Rice cake', calories:35, protein:1, carbs:7, fat:0 },
  'rice cakes':  { name:'Rice cakes (2)', calories:70, protein:2, carbs:14, fat:0 },
  'pork':       { name:'Pork chop (200g)', calories:350, protein:40, carbs:0, fat:20 },
  'lamb':       { name:'Lamb (200g)', calories:420, protein:40, carbs:0, fat:28 },
  'turkey':     { name:'Turkey breast (150g)', calories:200, protein:38, carbs:0, fat:4 },
  'shrimp':     { name:'Shrimp (150g)', calories:140, protein:28, carbs:2, fat:2 },
  'prawns':     { name:'Prawns (150g)', calories:140, protein:28, carbs:2, fat:2 },
  'cod':        { name:'Cod (150g)', calories:140, protein:30, carbs:0, fat:1 },
  'tilapia':    { name:'Tilapia (150g)', calories:165, protein:34, carbs:0, fat:3 },
  'tofu':       { name:'Tofu (200g)', calories:180, protein:20, carbs:4, fat:10 },
  'tempeh':     { name:'Tempeh (100g)', calories:190, protein:20, carbs:8, fat:11 },
  'lentils':    { name:'Lentils (1 cup cooked)', calories:230, protein:18, carbs:40, fat:1 },
  'chickpeas':  { name:'Chickpeas (1 cup)', calories:270, protein:15, carbs:45, fat:4 },
  'black beans':{ name:'Black beans (1 cup)', calories:230, protein:15, carbs:41, fat:1 },
  'beans':      { name:'Beans (1 cup cooked)', calories:230, protein:15, carbs:41, fat:1 },
  'quinoa':     { name:'Quinoa (1 cup cooked)', calories:220, protein:8, carbs:39, fat:4 },
  'couscous':   { name:'Couscous (1 cup)', calories:176, protein:6, carbs:36, fat:0 },
  'noodles':    { name:'Noodles (200g cooked)', calories:280, protein:8, carbs:56, fat:2 },
  'ramen':      { name:'Ramen', calories:450, protein:16, carbs:60, fat:16 },
  'pho':        { name:'Pho', calories:400, protein:22, carbs:48, fat:12 },
  'soup':       { name:'Soup (1 bowl)', calories:200, protein:10, carbs:20, fat:8 },
  'chili':      { name:'Chili (1 bowl)', calories:380, protein:28, carbs:30, fat:16 },
  'curry':      { name:'Curry with rice', calories:550, protein:22, carbs:60, fat:24 },
  'stir fry':   { name:'Stir fry with rice', calories:450, protein:25, carbs:50, fat:16 },
  'fried rice':  { name:'Fried rice', calories:400, protein:12, carbs:52, fat:16 },
  'pad thai':   { name:'Pad Thai', calories:500, protein:20, carbs:60, fat:20 },
  'tacos':      { name:'Tacos (3)', calories:540, protein:24, carbs:48, fat:26 },
  'taco':       { name:'Taco', calories:180, protein:8, carbs:16, fat:9 },
  'quesadilla': { name:'Quesadilla', calories:470, protein:22, carbs:40, fat:24 },
  'nachos':     { name:'Nachos', calories:550, protein:18, carbs:52, fat:30 },
  'hot dog':    { name:'Hot dog', calories:310, protein:11, carbs:26, fat:18 },
  'chicken wings':{ name:'Chicken wings (6)', calories:480, protein:36, carbs:12, fat:32 },
  'wings':      { name:'Wings (6)', calories:480, protein:36, carbs:12, fat:32 },
  'nuggets':    { name:'Chicken nuggets (8)', calories:360, protein:20, carbs:24, fat:20 },
  'chicken nuggets':{ name:'Chicken nuggets (8)', calories:360, protein:20, carbs:24, fat:20 },
  'fish and chips':{ name:'Fish and chips', calories:750, protein:30, carbs:65, fat:40 },
  'kebab':      { name:'Kebab', calories:600, protein:35, carbs:50, fat:28 },
  'doner':      { name:'Doner kebab', calories:600, protein:35, carbs:50, fat:28 },
  'shawarma':   { name:'Shawarma wrap', calories:550, protein:30, carbs:48, fat:26 },
  'falafel':    { name:'Falafel wrap', calories:480, protein:16, carbs:54, fat:22 },
  'fried chicken':{ name:'Fried chicken (2 pcs)', calories:480, protein:36, carbs:18, fat:30 },
  'mac and cheese':{ name:'Mac and cheese', calories:450, protein:18, carbs:48, fat:22 },
  'lasagna':    { name:'Lasagna (1 serving)', calories:480, protein:26, carbs:40, fat:24 },
  'risotto':    { name:'Risotto', calories:420, protein:12, carbs:56, fat:16 },
  'spaghetti':  { name:'Spaghetti with sauce', calories:400, protein:16, carbs:58, fat:12 },
  'bolognese':  { name:'Spaghetti bolognese', calories:500, protein:24, carbs:58, fat:18 },
  'carbonara':  { name:'Pasta carbonara', calories:550, protein:22, carbs:52, fat:28 },
  'poke bowl':  { name:'Poke bowl', calories:500, protein:28, carbs:55, fat:16 },
  'acai bowl':  { name:'Acai bowl', calories:400, protein:8, carbs:64, fat:14 },
  'caesar salad':{ name:'Caesar salad', calories:350, protein:18, carbs:14, fat:26 },
  'cobb salad': { name:'Cobb salad', calories:500, protein:32, carbs:12, fat:36 },
  'greek salad':{ name:'Greek salad', calories:220, protein:8, carbs:10, fat:18 },
  'grilled cheese':{ name:'Grilled cheese', calories:400, protein:14, carbs:36, fat:22 },
  'blt':        { name:'BLT sandwich', calories:400, protein:18, carbs:36, fat:22 },
  'club sandwich':{ name:'Club sandwich', calories:500, protein:28, carbs:42, fat:24 },
  'sub':        { name:'Sub sandwich', calories:500, protein:24, carbs:50, fat:22 },
  'panini':     { name:'Panini', calories:450, protein:22, carbs:44, fat:20 },
  'croissant sandwich':{ name:'Croissant sandwich', calories:420, protein:18, carbs:34, fat:24 },
  'dim sum':    { name:'Dim sum (6 pcs)', calories:320, protein:16, carbs:32, fat:14 },
  'spring roll':{ name:'Spring rolls (2)', calories:200, protein:6, carbs:24, fat:10 },
  'dumplings':  { name:'Dumplings (6)', calories:300, protein:14, carbs:36, fat:10 },
  'edamame':    { name:'Edamame (100g)', calories:120, protein:12, carbs:9, fat:5 },
  'miso soup':  { name:'Miso soup', calories:60, protein:4, carbs:6, fat:2 },
  'orange':     { name:'Orange', calories:62, protein:1, carbs:15, fat:0 },
  'strawberries':{ name:'Strawberries (150g)', calories:48, protein:1, carbs:12, fat:0 },
  'blueberries':{ name:'Blueberries (100g)', calories:57, protein:1, carbs:14, fat:0 },
  'grapes':     { name:'Grapes (150g)', calories:104, protein:1, carbs:27, fat:0 },
  'mango':      { name:'Mango', calories:135, protein:1, carbs:35, fat:1 },
  'pineapple':  { name:'Pineapple (150g)', calories:75, protein:1, carbs:20, fat:0 },
  'watermelon': { name:'Watermelon (200g)', calories:60, protein:1, carbs:15, fat:0 },
  'pear':       { name:'Pear', calories:100, protein:1, carbs:27, fat:0 },
  'peach':      { name:'Peach', calories:60, protein:1, carbs:15, fat:0 },
  'dates':      { name:'Dates (3)', calories:200, protein:2, carbs:54, fat:0 },
  'raisins':    { name:'Raisins (40g)', calories:120, protein:1, carbs:32, fat:0 },
  'spinach':    { name:'Spinach (100g)', calories:23, protein:3, carbs:4, fat:0 },
  'kale':       { name:'Kale (100g)', calories:35, protein:3, carbs:6, fat:1 },
  'carrots':    { name:'Carrots (100g)', calories:41, protein:1, carbs:10, fat:0 },
  'tomato':     { name:'Tomato', calories:22, protein:1, carbs:5, fat:0 },
  'cucumber':   { name:'Cucumber', calories:16, protein:1, carbs:4, fat:0 },
  'corn':       { name:'Corn on the cob', calories:90, protein:3, carbs:19, fat:1 },
  'mushrooms':  { name:'Mushrooms (100g)', calories:22, protein:3, carbs:3, fat:0 },
  'peppers':    { name:'Bell pepper', calories:30, protein:1, carbs:7, fat:0 },
  'onion':      { name:'Onion', calories:44, protein:1, carbs:10, fat:0 },
  'garlic bread':{ name:'Garlic bread (2 slices)', calories:280, protein:6, carbs:32, fat:14 },
  'naan':       { name:'Naan bread', calories:260, protein:9, carbs:45, fat:5 },
  'pita':       { name:'Pita bread', calories:170, protein:6, carbs:33, fat:1 },
  'tortilla':   { name:'Tortilla', calories:140, protein:4, carbs:24, fat:4 },
  'rice bowl':  { name:'Rice bowl', calories:400, protein:15, carbs:60, fat:10 },
  'acai':       { name:'Acai bowl', calories:400, protein:8, carbs:64, fat:14 },
  'cappuccino': { name:'Cappuccino', calories:120, protein:6, carbs:10, fat:6 },
  'espresso':   { name:'Espresso', calories:5, protein:0, carbs:0, fat:0 },
  'mocha':      { name:'Mocha', calories:290, protein:10, carbs:36, fat:12 },
  'hot chocolate':{ name:'Hot chocolate', calories:240, protein:8, carbs:36, fat:8 },
  'tea':        { name:'Tea', calories:2, protein:0, carbs:0, fat:0 },
  'green tea':  { name:'Green tea', calories:2, protein:0, carbs:0, fat:0 },
  'cola':       { name:'Cola (330ml)', calories:140, protein:0, carbs:39, fat:0 },
  'soda':       { name:'Soda (330ml)', calories:140, protein:0, carbs:39, fat:0 },
  'juice':      { name:'Juice (250ml)', calories:112, protein:1, carbs:26, fat:0 },
  'milkshake':  { name:'Milkshake', calories:420, protein:12, carbs:60, fat:16 },
  'water':      { name:'Water', calories:0, protein:0, carbs:0, fat:0 },
  'coconut water':{ name:'Coconut water (330ml)', calories:60, protein:0, carbs:15, fat:0 },
  'whiskey':    { name:'Whiskey (45ml)', calories:105, protein:0, carbs:0, fat:0 },
  'vodka':      { name:'Vodka (45ml)', calories:97, protein:0, carbs:0, fat:0 },
  'gin':        { name:'Gin & tonic', calories:170, protein:0, carbs:14, fat:0 },
  'cocktail':   { name:'Cocktail', calories:220, protein:0, carbs:24, fat:0 },
  'margarita':  { name:'Margarita', calories:270, protein:0, carbs:20, fat:0 },
};

function _localFoodLookup(text) {
  const lower = text.toLowerCase();
  const items = [];
  // Try to match quantities like "2 eggs", "3 slices of bread"
  const words = lower.replace(/[,\.!?]/g, ' ').split(/\s+and\s+|\s*,\s*|\s*\+\s*/);
  for (const phrase of words) {
    const trimmed = phrase.trim();
    if (!trimmed) continue;
    const qMatch = trimmed.match(/^(\d+)\s*x?\s*(.+)/);
    const qty = qMatch ? parseInt(qMatch[1]) : 1;
    const foodName = qMatch ? qMatch[2].trim() : trimmed;
    // Search database
    let found = _FOOD_DB[foodName];
    if (!found) {
      // Fuzzy: check if any key is contained in the phrase or vice versa
      for (const [key, val] of Object.entries(_FOOD_DB)) {
        if (foodName.includes(key) || key.includes(foodName)) { found = val; break; }
      }
    }
    if (found) {
      items.push({
        name: qty > 1 ? `${qty}x ${found.name}` : found.name,
        calories: found.calories * qty,
        protein: found.protein * qty,
        carbs: found.carbs * qty,
        fat: found.fat * qty,
      });
    }
  }
  return items.length ? items : null;
}

// ── ADAPTIVE NUTRITION HELPERS ────────────────────────────────────────────
function computeTrend(wl) {
  const entries = Object.entries(wl).sort((a,b) => a[0].localeCompare(b[0]));
  if (!entries.length) return [];
  let ema = entries[0][1];
  return entries.map(([date, raw]) => {
    ema = 0.1 * raw + 0.9 * ema;
    return { date, raw, ema };
  });
}

function computeWeeklyAvgCalories(ml) {
  const dates = Object.keys(ml).filter(d => {
    const meals = (ml[d] || {}).meals || [];
    return meals.length > 0;
  }).sort().reverse().slice(0, 7);
  if (dates.length < 3) return null;
  const total = dates.reduce((sum, d) => {
    const meals = (ml[d] || {}).meals || [];
    return sum + meals.reduce((s, m) => s + m.items.reduce((s2, it) => s2 + (it.calories || 0), 0), 0);
  }, 0);
  return Math.round(total / dates.length);
}

function computeTDEE(wl, ml) {
  const trend = computeTrend(wl);
  if (trend.length < 7) return null;
  const avgCal = computeWeeklyAvgCalories(ml);
  if (avgCal === null) return null;
  const last7 = trend.slice(-7);
  // 7700 kcal is per KILOGRAM, so the trend delta has to be in kg
  const weightChange = toKg(last7[last7.length - 1].ema - last7[0].ema);
  const weightChangeCalsPerDay = (weightChange * 7700) / 7;
  return Math.round(Math.min(6000, Math.max(1200, avgCal - weightChangeCalsPerDay)));
}

function computeAdaptiveTarget(tdee, goalType, wl) {
  if (tdee === null) return null;
  const offsets = { cut: -400, maintain: 0, bulk: 300 };
  const calories = Math.round(tdee + (offsets[goalType] || 0));
  const entries = Object.entries(wl).sort((a,b) => b[0].localeCompare(a[0]));
  // 2.2 g of protein per KILOGRAM of bodyweight; the 80 fallback is already kg
  const bwKg = entries.length ? toKg(entries[0][1]) : 80;
  return { calories, protein: Math.round(bwKg * 2.2) };
}

function injectAdaptiveStyles() {
  if (document.getElementById('diet-adaptive-styles')) return;
  const s = document.createElement('style');
  s.id = 'diet-adaptive-styles';
  s.textContent = `
    .da-section{background:var(--surface);border:1px solid var(--border2);border-radius:var(--radius);padding:16px;margin:16px 24px}
    .da-stat{text-align:center}
    .da-stat-val{font-size:20px;font-weight:700;color:var(--accent-b);font-family:var(--serif)}
    .da-stat-lbl{font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-top:2px}
    .da-goal-btns{display:flex;gap:6px;margin:12px 0 8px}
    .da-goal-btn{flex:1;padding:10px 0;border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:transparent;color:var(--text-dim);font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer;transition:all .2s}
    .da-goal-btn.active{background:rgba(154,130,86,0.15);border-color:var(--accent);color:var(--accent-b)}
    .da-apply{display:inline-block;margin-top:8px;padding:8px 20px;border:1px solid var(--accent);border-radius:10px;background:rgba(154,130,86,0.1);color:var(--accent-b);font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer;transition:all .2s}
    .da-apply:active{transform:scale(0.97)}
    .da-rec{display:flex;gap:16px;justify-content:center;margin-top:10px}
    .da-rec-item{text-align:center}
    .da-rec-val{font-size:16px;font-weight:700;font-family:var(--serif)}
    .da-rec-lbl{font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px}
    .dw-section{background:var(--surface2);border-radius:14px;padding:16px;margin:16px 24px}
    .dw-logged{font-size:14px;color:var(--text);margin-bottom:10px}
    .dw-input-row{display:flex;gap:8px;align-items:center}
    .dw-input{flex:1;padding:10px 12px;border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:var(--surface);color:var(--text);font-size:14px}
    .dw-log-btn{padding:10px 18px;border:none;border-radius:10px;background:var(--accent);color:#fff;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer}
    .dw-log-btn:active{transform:scale(0.97)}
    .dw-drift{margin-top:12px;padding:12px 14px;background:rgba(176,132,72,0.08);border:1px solid rgba(217,180,106,0.28);border-radius:12px}
    .dw-drift-text{font-size:12px;line-height:1.5;color:var(--text-dim)}
    .dw-drift-text strong{color:var(--text)}
    .dw-drift-arrow{color:var(--accent-b);font-weight:700}
    .dw-history{margin-top:10px;font-size:12px;color:var(--text-dim)}
    .dw-history-item{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.04)}
    .dw-trend-link{display:block;margin-top:10px;font-size:12px;color:var(--accent-b);cursor:pointer;text-align:right}
    .dt-chart{margin:16px 24px;background:var(--surface2);border-radius:14px;padding:16px;overflow:hidden}
    .dt-placeholder{padding:32px 24px;text-align:center;font-size:13px;color:var(--text-dim)}
    .fs-row{background:var(--surface2);border-radius:8px;padding:10px 14px;margin-bottom:4px;cursor:pointer;border:1px solid transparent;transition:all .2s}
    .fs-row:hover{background:var(--surface);border-color:rgba(255,255,255,0.08)}
    .fs-row.selected{border-color:var(--accent)}
    .fs-row-name{font-size:13px;color:var(--text);margin-bottom:2px}
    .fs-row-macros{font-size:11px;color:var(--text-dim)}
    .fs-status{color:var(--text-dim);font-size:13px;padding:12px 0}
    .fs-input-row{display:flex;gap:8px;align-items:center;margin-bottom:8px}
    .fs-search-btn{padding:10px 18px;border:none;border-radius:10px;background:var(--accent);color:#fff;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer;white-space:nowrap}
    .fs-search-btn:active{transform:scale(0.97)}
    .fs-grams-row{display:flex;gap:8px;align-items:center;margin-bottom:8px}
    .fs-grams-label{font-size:12px;color:var(--text-dim);white-space:nowrap}
  `;
  document.head.appendChild(s);
}

function getDayMacros() {
  const freshLog = LS.get('hvi_meal_log', {});
  const t = today(), meals = (freshLog[t] || {}).meals || [];
  return meals.reduce((acc, m) => {
    m.items.forEach(it => { acc.cal += it.calories||0; acc.p += it.protein||0; acc.c += it.carbs||0; acc.f += it.fat||0; });
    return acc;
  }, { cal:0, p:0, c:0, f:0 });
}

function _buildCalorieTrendChart() {
  const data = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString('en-CA');
    const meals = (mealLog[key] || {}).meals || [];
    const cal = meals.reduce((s, m) => s + m.items.reduce((s2, it) => s2 + (it.calories||0), 0), 0);
    data.push({ day: d.toLocaleDateString('en-US',{weekday:'narrow'}), cal, key });
  }
  if (data.every(d => d.cal === 0)) return '';
  const goal = dietMeta.dailyGoals.calories;
  const maxCal = Math.max(goal, ...data.map(d => d.cal)) * 1.1;
  const W = 320, H = 80, ML = 4, MR = 4;
  const cW = W - ML - MR;
  const x = i => ML + (i / (data.length - 1)) * cW;
  const y = v => H - 8 - ((v / maxCal) * (H - 16));
  const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.cal).toFixed(1)}`).join(' ');
  const goalY = y(goal).toFixed(1);
  return `<div class="da-section ani" style="margin:0 24px 8px;padding:12px 12px 8px">
    <div class="sec-lbl" style="padding:0 0 6px;font-size:9px">14-DAY CALORIES</div>
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block">
      <line x1="${ML}" y1="${goalY}" x2="${W-MR}" y2="${goalY}" stroke="var(--accent)" stroke-width="0.5" stroke-dasharray="4,3" opacity="0.5"/>
      <text x="${W-MR}" y="${goalY-3}" fill="var(--accent)" font-size="7" text-anchor="end" opacity="0.6">goal</text>
      <polyline points="${pts}" fill="none" stroke="var(--cal)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${data.map((d,i) => d.cal > 0 ? `<circle cx="${x(i).toFixed(1)}" cy="${y(d.cal).toFixed(1)}" r="2" fill="var(--cal)"/>` : '').join('')}
    </svg>
  </div>`;
}

function renderDiet() {
  mealLog = LS.get('hvi_meal_log', {});
  weightLog = LS.get('hvi_weight_log', {});
  // Training-adjusted targets (non-destructive; base dailyGoals untouched)
  const goals = (typeof getTodaysMacroTargets === 'function') ? getTodaysMacroTargets() : dietMeta.dailyGoals;
  const m = getDayMacros();
  const meals = (mealLog[today()] || {}).meals || [];

  const rings = [
    { label:'Calories', val:m.cal, goal:goals.calories, color:'var(--cal)', unit:'' },
    { label:'Protein', val:m.p, goal:goals.protein, color:'var(--pro)', unit:'g' },
    { label:'Carbs', val:m.c, goal:goals.carbs, color:'var(--carb)', unit:'g' },
    { label:'Fat', val:m.f, goal:goals.fat, color:'var(--fat)', unit:'g' },
  ].map(r => `<div class="d-ring-item"><div class="d-ring-wrap">${ring(26,r.goal?r.val/r.goal:0,3,r.color)}<div class="d-ring-val">${r.val}</div></div><div class="d-ring-label">${r.label}</div></div>`).join('');

  // Expenditure section
  const tdee = computeTDEE(weightLog, mealLog);
  const avgCal = computeWeeklyAvgCalories(mealLog);
  const goalType = dietMeta.goalType || 'maintain';
  const adaptive = computeAdaptiveTarget(tdee, goalType, weightLog);

  const goalBtns = ['cut','maintain','bulk'].map(g =>
    `<button class="da-goal-btn${g===goalType?' active':''}" onclick="setGoalType('${g}')">${g.toUpperCase()}</button>`
  ).join('');

  let adaptiveRec = '';
  if (adaptive) {
    adaptiveRec = `<div class="da-rec">
      <div class="da-rec-item"><div class="da-rec-val" style="color:var(--cal)">${adaptive.calories}</div><div class="da-rec-lbl">Cal Target</div></div>
      <div class="da-rec-item"><div class="da-rec-val" style="color:var(--pro)">${adaptive.protein}g</div><div class="da-rec-lbl">Protein</div></div>
    </div>
    <div style="text-align:center"><button class="da-apply" onclick="applyAdaptiveTarget()">APPLY</button></div>`;
  }

  const expenditureHTML = `<div class="da-section ani">
    <div class="sec-lbl" style="padding:0 0 10px">Expenditure</div>
    <div class="s-grid" style="margin:0">
      <div class="s-card da-stat"><div class="da-stat-val">${tdee !== null ? tdee.toLocaleString() : '—'}</div><div class="da-stat-lbl">${tdee !== null ? 'Est. TDEE' : 'Log 7+ days to unlock'}</div></div>
      <div class="s-card da-stat"><div class="da-stat-val">${avgCal !== null ? avgCal.toLocaleString() : '—'}</div><div class="da-stat-lbl">Avg Cal (7d)</div></div>
    </div>
    <div class="da-goal-btns">${goalBtns}</div>
    ${adaptiveRec}
  </div>`;

  // Weight section
  const t = today();
  const todayWeight = weightLog[t];
  const recentWeights = Object.entries(weightLog).sort((a,b) => b[0].localeCompare(a[0])).slice(0, 7);
  const recentHTML = recentWeights.length ? recentWeights.map(([d, w]) =>
    `<div class="dw-history-item"><span>${fmtDate(d)}</span><span>${w} ${wtUnit()}</span></div>`
  ).join('') : '<div style="font-size:12px;color:var(--text-dim)">No weights logged yet.</div>';

  const weightHTML = `<div class="dw-section ani">
    <div class="sec-lbl" style="padding:0 0 10px">Weight</div>
    ${todayWeight ? `<div class="dw-logged">Today: <strong>${todayWeight} ${wtUnit()}</strong></div>` : ''}
    <div class="dw-input-row">
      <input class="dw-input" type="number" step="0.1" min="20" max="600" id="wt-input" placeholder="Weight (${wtUnit()})" ${todayWeight ? `value="${todayWeight}"` : ''}>
      <button class="dw-log-btn" onclick="logWeight()">LOG WEIGHT</button>
    </div>
    <div class="dw-history">${recentHTML}</div>
    ${bodyweightDriftHTML()}
    ${Object.keys(weightLog).length >= 3 ? `<div class="dw-trend-link" onclick="go('dietTrend')">VIEW TREND \u2192</div>` : ''}
  </div>`;

  const mealsHTML = meals.length ? meals.map((ml, mi) => {
    const mCal = ml.items.reduce((s,i) => s + (i.calories||0), 0);
    const mP = ml.items.reduce((s,i) => s + (i.protein||0), 0);
    const itemsHTML = ml.items.map(it => `<div class="d-meal-item">${esc(it.name)} \u2014 ${it.calories}cal, ${it.protein}P, ${it.carbs}C, ${it.fat}F</div>`).join('');
    return `<div class="d-meal"><div class="d-meal-head"><div class="d-meal-name">${esc(ml.name)}</div><div style="display:flex;align-items:center;gap:8px"><div class="d-meal-cal">${mCal} cal</div><button class="d-del-btn" onclick="deleteMeal(${mi},'${esc(ml.id || '')}')">\u00D7</button></div></div>
      <div class="d-meal-macros">${mP}P</div>${itemsHTML}</div>`;
  }).join('') : '<p style="padding:0 24px;font-size:13px;color:var(--text-dim)">No meals logged today.</p>';

  document.getElementById('view').innerHTML = `
    <div class="page-head ani"><div class="page-title">Nutrition</div><div class="page-sub">Fuel your body with intention.</div></div>
    <div class="d-rings ani">${rings}</div>
    ${typeof macroAdjustBadgeHTML === 'function' ? macroAdjustBadgeHTML() : ''}
    ${_buildCalorieTrendChart()}
    ${expenditureHTML}
    <div class="sec-lbl">Today's Meals</div>
    <div class="ani">${mealsHTML}</div>
    <div style="display:flex;gap:8px;padding:16px 24px 8px">
      <button class="w-action-btn" style="margin:0;flex:1" onclick="go('dietAddMeal')">+ Add Meal</button>
      <button class="w-action-btn" style="margin:0;flex:1" onclick="go('dietRecipes')">Recipes</button>
    </div>
    <button class="w-action-btn" onclick="go('dietGoals')">Edit Daily Goals</button>
    ${weightHTML}`;
  // Connected system: auto-complete habits linked to protein/calorie targets
  if (typeof checkNutritionTriggers === 'function') checkNutritionTriggers();
}

// Deleting used to splice by array index out of the in-memory copy. That copy
// can lag what's on disk — getDayMacros() re-reads fresh for exactly that
// reason — so a stale index could remove the wrong meal, and writing the whole
// stale object back could resurrect one that had already been deleted. Work
// from fresh storage and match on the meal's id.
function deleteMeal(mi, id) {
  const t = today();
  const fresh = LS.get('hvi_meal_log', {});
  const meals = (fresh[t] || {}).meals || [];
  if (!meals.length) return;

  let idx = -1;
  if (id) idx = meals.findIndex(m => m && m.id === id);
  // Meals logged before ids existed fall back to the index
  if (idx < 0 && !id && mi >= 0 && mi < meals.length) idx = mi;
  if (idx < 0) { go('diet'); return; }   // already gone; just refresh

  const meal = meals[idx];
  if (!confirm(`Delete "${meal && meal.name ? meal.name : 'this meal'}"?`)) return;
  meals.splice(idx, 1);
  fresh[t].meals = meals;
  mealLog = fresh;
  LS.set('hvi_meal_log', mealLog);
  go('diet');
}

// ── NATURAL-LANGUAGE MEAL PARSER ──────────────────────────────────────────
const WORD_NUMS = { a:1, an:1, one:1, half:0.5, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10 };
const UNIT_G = { g:1, gr:1, gram:1, grams:1, ml:1, mls:1, milliliter:1, millilitre:1 };
const UNIT_CUP = { cup:240, cups:240 };
const UNIT_TBSP = { tbsp:15, tablespoon:15, tablespoons:15 };
const UNIT_TSP = { tsp:5, teaspoon:5, teaspoons:5 };
const UNIT_OZ = { oz:28.35, ounce:28.35, ounces:28.35 };
const UNIT_LB = { lb:453.6, lbs:453.6, pound:453.6, pounds:453.6 };
const UNIT_EACH = { piece:1, pieces:1, slice:1, slices:1, scoop:1, scoops:1, whole:1, each:1, x:1 };

function _toGrams(qty, unitRaw, food) {
  const u = (unitRaw || '').toLowerCase().replace(/[^a-z]/g,'');
  if (UNIT_G[u])    return qty * UNIT_G[u];
  if (UNIT_CUP[u])  return qty * UNIT_CUP[u];
  if (UNIT_TBSP[u]) return qty * UNIT_TBSP[u];
  if (UNIT_TSP[u])  return qty * UNIT_TSP[u];
  if (UNIT_OZ[u])   return qty * UNIT_OZ[u];
  if (UNIT_LB[u])   return qty * UNIT_LB[u];
  if (UNIT_EACH[u]) return qty * (food.each || 100);
  // no unit → treat as count if food has "each", else grams
  return qty * (food.each ? food.each : 100);
}

function _findFood(text) {
  const t = text.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  let best = null, bestScore = 0;
  for (const f of FOOD_DB) {
    for (const n of f.names) {
      if (t === n) return f;
      const tHasN = t.includes(n), nHasT = n.includes(t);
      if (tHasN || nHasT) {
        const score = n.length / Math.max(t.length, n.length);
        if (score > bestScore) { bestScore = score; best = f; }
      }
    }
  }
  return bestScore >= 0.35 ? best : null;
}

function _parseChunk(chunk) {
  let s = chunk.toLowerCase().trim();
  // Remove leading "a", "an", filler words
  s = s.replace(/^(some|about|approx\.?|approximately)\s+/i, '');

  // Match: <qty> <unit> <food> OR <qty> <food>
  const re = /^([0-9]+(?:[.,][0-9]+)?|[a-z]+)\s+([a-z]+)?\s*(?:of\s+)?(.+)$/;
  const m = s.match(re);
  let qty = 1, unit = '', foodText = s;

  if (m) {
    const rawQty = m[1];
    const tok2   = (m[2] || '').toLowerCase();
    const rest   = (m[3] || '').toLowerCase().trim();

    // Is rawQty a number or word-number?
    const numVal = parseFloat(rawQty.replace(',','.'));
    const wordVal = WORD_NUMS[rawQty.toLowerCase()];
    if (!isNaN(numVal)) {
      qty = numVal;
      // Is tok2 a unit?
      const unitCheck = tok2.replace(/[^a-z]/g,'');
      const allUnits = {...UNIT_G,...UNIT_CUP,...UNIT_TBSP,...UNIT_TSP,...UNIT_OZ,...UNIT_LB,...UNIT_EACH};
      if (allUnits[unitCheck]) { unit = unitCheck; foodText = rest; }
      else { foodText = (tok2 + ' ' + rest).trim(); }
    } else if (wordVal !== undefined) {
      qty = wordVal;
      const unitCheck = tok2.replace(/[^a-z]/g,'');
      const allUnits = {...UNIT_G,...UNIT_CUP,...UNIT_TBSP,...UNIT_TSP,...UNIT_OZ,...UNIT_LB,...UNIT_EACH};
      if (allUnits[unitCheck]) { unit = unitCheck; foodText = rest; }
      else { foodText = (tok2 + ' ' + rest).trim(); }
    }
  }

  const food = _findFood(foodText);
  if (!food) return null;

  const grams = _toGrams(qty, unit, food);
  const scale = grams / 100;
  const label = chunk.trim().replace(/\s+/g,' ');
  return {
    name: label.charAt(0).toUpperCase() + label.slice(1),
    calories: Math.round(food.cal * scale),
    protein:  Math.round(food.pro * scale * 10) / 10,
    carbs:    Math.round(food.carb * scale * 10) / 10,
    fat:      Math.round(food.fat * scale * 10) / 10,
  };
}

// Robustly extract the first complete JSON array using bracket depth matching
function _extractJsonArray(str) {
  // Try direct parse first (ideal case: response is pure JSON array)
  const trimmed = str.trim();
  if (trimmed.startsWith('[')) {
    try { JSON.parse(trimmed); return trimmed; } catch(e) {}
  }
  // If response is a JSON object, check for array value or wrap single item
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed);
      const arrVal = Object.values(obj).find(v => Array.isArray(v));
      if (arrVal) return JSON.stringify(arrVal);
      // Single food object with calories — wrap in array
      if (obj.calories !== undefined || obj.name) return JSON.stringify([obj]);
    } catch(e) {}
  }
  // Bracket-depth extraction fallback
  const start = str.indexOf('[');
  if (start === -1) return null;
  let depth = 0, inStr = false, esc2 = false;
  for (let i = start; i < str.length; i++) {
    const c = str[i];
    if (esc2)          { esc2 = false; continue; }
    if (c === '\\' && inStr) { esc2 = true; continue; }
    if (c === '"')     { inStr = !inStr; continue; }
    if (inStr)         continue;
    if (c === '[')     depth++;
    if (c === ']') { depth--; if (depth === 0) return str.slice(start, i + 1); }
  }
  return null;
}

async function calculateMealDescription() {
  const ta = document.getElementById('describe-textarea');
  const out = document.getElementById('describe-output');
  const btn = document.getElementById('calc-macros-btn');
  if (!ta || !out) return;
  const text = ta.value.trim();
  if (!text) { out.innerHTML = '<p class="dm-hint">Describe what you ate above.</p>'; return; }

  out.innerHTML = '<p class="dm-hint" style="text-align:center">‣ Calculating macros…</p>';
  if (btn) { btn.disabled = true; btn.textContent = 'Calculating…'; }

  // Check cache first
  const cached = _getCachedMeal(text);
  if (cached) {
    _parsedMealItems = cached;
    _renderParsedItems(out);
    out.insertAdjacentHTML('afterbegin', '<p class="dm-hint" style="font-size:11px;opacity:0.6;margin-bottom:8px">⚡ Loaded from cache</p>');
    if (btn) { btn.disabled = false; btn.textContent = 'CALCULATE MACROS'; }
    return;
  }

  try {
    const sysPrompt =
      'You are a nutrition macro calculator that ONLY outputs JSON. Never output any text, explanation, or markdown — ONLY a raw JSON array.\n\n' +
      'INPUT: A description of food or a meal (may be vague, slang, brand names, restaurant items, any language).\n' +
      'OUTPUT: A JSON array where each element has exactly these keys: "name" (string), "calories" (integer), "protein" (integer), "carbs" (integer), "fat" (integer).\n\n' +
      'RULES:\n' +
      '- All macro values MUST be integers (no decimals, no strings)\n' +
      '- Use typical serving sizes when quantity is not specified\n' +
      '- If quantity is given (e.g. "2 eggs"), combine into ONE item with total macros\n' +
      '- Include portion size in the name when helpful, e.g. "Oats (80g)"\n' +
      '- If unidentifiable, estimate anyway — never refuse\n' +
      '- NEVER wrap in markdown code fences\n' +
      '- Your ENTIRE response must be parseable by JSON.parse()\n\n' +
      'EXAMPLE:\n' +
      'Input: "bowl of oats with banana and honey"\n' +
      'Output: [{"name":"Oats (80g)","calories":300,"protein":10,"carbs":54,"fat":6},{"name":"Banana","calories":89,"protein":1,"carbs":23,"fat":0},{"name":"Honey (1 tbsp)","calories":64,"protein":0,"carbs":17,"fat":0}]';

    const raw = await _aiFetch([
      { role: 'system', content: sysPrompt },
      { role: 'user', content: 'Calculate macros for: ' + text }
    ], { jsonMode: true });
    // Strip any markdown fences, then use bracket-depth extraction
    const clean = raw.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
    const jsonStr = _extractJsonArray(clean);
    if (!jsonStr) {
      out.innerHTML = `<p class="dm-hint dm-warn">Could not find JSON in response. Raw: ${esc(raw.slice(0,300))}</p>`;
      return;
    }
    let items;
    try { items = JSON.parse(jsonStr); } catch(pe) {
      out.innerHTML = `<p class="dm-hint dm-warn">Parse error: ${esc(String(pe))}. Raw: ${esc(raw.slice(0,300))}</p>`;
      return;
    }
    if (!Array.isArray(items) || !items.length) throw new Error('Empty result');

    _parsedMealItems = items.map(it => ({
      name:     String(it.name || 'Food'),
      calories: Math.round(Number(it.calories) || 0),
      protein:  Math.round(Number(it.protein)  || 0),
      carbs:    Math.round(Number(it.carbs)     || 0),
      fat:      Math.round(Number(it.fat)       || 0),
    }));
    _cacheMeal(text.toLowerCase().trim(), _parsedMealItems);
    _renderParsedItems(out);
  } catch(e) {
    // Fallback to local database
    const localItems = _localFoodLookup(text);
    if (localItems) {
      _parsedMealItems = localItems;
      _renderParsedItems(out);
      out.insertAdjacentHTML('afterbegin', '<p class="dm-hint" style="font-size:11px;opacity:0.6;margin-bottom:8px">⚡ Estimated from local database (AI unavailable)</p>');
      return;
    }
    if (e.message === 'offline') {
      out.innerHTML = `<p class="dm-hint dm-warn">You're offline. Try common foods like "2 eggs and toast" or add items manually.</p>`;
    } else if (e.name === 'AbortError') {
      out.innerHTML = `<p class="dm-hint dm-warn">AI service timed out. Try again, or use simpler descriptions like "chicken and rice".</p>`;
    } else {
      out.innerHTML = `<p class="dm-hint dm-warn">AI service unavailable. Try simpler foods like "oats with banana" or add items manually.</p>`;
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'CALCULATE MACROS'; }
  }
}

// Collapse a multi-item result into the single row the user is editing, e.g.
// "rye bread with butter" comes back as two foods but belongs in one row.
function _mergeToOneItem(items, fallbackName) {
  const t = items.reduce((a, i) => ({
    calories: a.calories + (Number(i.calories) || 0),
    protein:  a.protein  + (Number(i.protein)  || 0),
    carbs:    a.carbs    + (Number(i.carbs)    || 0),
    fat:      a.fat      + (Number(i.fat)      || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  return {
    // A single result usually carries a better name than the user typed
    // ("Rye bread (2 slices)"), so prefer it.
    name: (items.length === 1 && items[0].name) ? String(items[0].name) : fallbackName,
    calories: Math.round(t.calories), protein: Math.round(t.protein),
    carbs: Math.round(t.carbs), fat: Math.round(t.fat),
  };
}

// Resolve one food name to macros using the same ladder as the meal describer:
// cache, then AI, then the local food database.
async function _macrosForFood(text) {
  const key = String(text || '').toLowerCase().trim();
  if (!key) return null;

  const cached = _getCachedMeal(key);
  if (cached && cached.length) return _mergeToOneItem(cached, text);

  try {
    const sysPrompt =
      'You are a nutrition macro calculator that ONLY outputs JSON. Never output any text, explanation, or markdown — ONLY a raw JSON array.\n\n' +
      'INPUT: The name of a single food or ingredient (may be vague, slang, a brand, or any language).\n' +
      'OUTPUT: A JSON array where each element has exactly these keys: "name" (string), "calories" (integer), "protein" (integer), "carbs" (integer), "fat" (integer).\n\n' +
      'RULES:\n' +
      '- Prefer ONE element unless the input clearly describes several foods\n' +
      '- All macro values MUST be integers\n' +
      '- Use a typical serving size when no quantity is given, and put it in the name, e.g. "Rye bread (2 slices)"\n' +
      '- If a quantity is given, combine it into the totals\n' +
      '- If unidentifiable, estimate anyway — never refuse\n' +
      '- NEVER wrap in markdown code fences\n' +
      '- Your ENTIRE response must be parseable by JSON.parse()';
    const raw = await _aiFetch([
      { role: 'system', content: sysPrompt },
      { role: 'user', content: 'Calculate macros for: ' + text }
    ], { jsonMode: true });
    const clean = raw.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
    const jsonStr = _extractJsonArray(clean);
    if (jsonStr) {
      const items = JSON.parse(jsonStr);
      if (Array.isArray(items) && items.length) {
        _cacheMeal(key, items);
        return _mergeToOneItem(items, text);
      }
    }
  } catch (e) {
    if (typeof trackFail === 'function') trackFail('macro_estimate', e && e.message);
  }

  const local = _localFoodLookup(text);
  if (local && local.length) return _mergeToOneItem(local, text);
  return null;
}

// Photo scan and text description share this list but render into different
// containers on the same screen. Remember which one is live so the edit,
// cancel and remove handlers — which call this with no argument — rebuild the
// list where the user is actually looking instead of the other section.
let _parsedOutId = 'describe-output';

function _renderParsedItems(out) {
  // An explicit container means a fresh set of results, so drop any row that
  // was left open for editing from the previous set.
  if (out && out.id) { _parsedOutId = out.id; _editingParsedIdx = -1; }
  if (!out) out = document.getElementById(_parsedOutId);
  if (!out) return;
  // Results only belong to the section that produced them
  const otherId = _parsedOutId === 'photo-output' ? 'describe-output' : 'photo-output';
  const other = document.getElementById(otherId);
  if (other) other.innerHTML = '';
  if (!_parsedMealItems.length) { out.innerHTML = ''; return; }
  const rows = _parsedMealItems.map((it, i) => {
    if (_recalcIdx === i) {
      return `<div class="dm-row">
        <div class="dm-row-name">${esc(it.name)}</div>
        <div class="dm-row-macros">‣ Estimating macros…</div>
      </div>`;
    }
    const editing = _editingParsedIdx === i;
    if (editing) {
      return `<div class="dm-row dm-row-editing">
        <input class="dm-edit-input dm-edit-name" value="${esc(it.name)}" placeholder="Name" id="pei-name-${i}">
        <div class="dm-edit-hint">Change the name and the macros are re-estimated automatically. Type numbers to override.</div>
        <div class="dm-edit-macros">
          <label class="dm-edit-field"><span>Cal</span><input type="number" value="${it.calories}" id="pei-cal-${i}"></label>
          <label class="dm-edit-field"><span>P</span><input type="number" value="${it.protein}" id="pei-p-${i}"></label>
          <label class="dm-edit-field"><span>C</span><input type="number" value="${it.carbs}" id="pei-c-${i}"></label>
          <label class="dm-edit-field"><span>F</span><input type="number" value="${it.fat}" id="pei-f-${i}"></label>
        </div>
        <div class="dm-edit-actions">
          <button class="dm-edit-save" onclick="_saveParsedEdit(${i})">Save</button>
          <button class="dm-edit-cancel" onclick="_editingParsedIdx=-1;_renderParsedItems()">Cancel</button>
        </div>
      </div>`;
    }
    return `<div class="dm-row" onclick="_editParsedItem(${i})" style="cursor:pointer">
      <div class="dm-row-name">${esc(it.name)}</div>
      <div class="dm-row-macros">${it.calories} cal · ${it.protein}P · ${it.carbs}C · ${it.fat}F</div>
      <button class="dm-remove" onclick="event.stopPropagation();_parsedMealItems.splice(${i},1);_renderParsedItems()">×</button>
    </div>`;
  }).join('');
  const total = _parsedMealItems.reduce((s,i) => s + i.calories, 0);
  out.innerHTML = `${rows}
    <div class="dm-total">${total} cal total</div>
    <div class="dm-hint" style="text-align:center;font-size:11px;margin-top:4px;opacity:0.5">Tap any item to edit</div>
    <button class="w-action-btn" style="width:100%;margin-top:10px" onclick="addAllDescribed()">ADD ALL TO MEAL</button>`;
}

let _editingParsedIdx = -1;
let _recalcIdx = -1;   // row currently having its macros re-estimated

function _editParsedItem(idx) {
  _editingParsedIdx = idx;
  _renderParsedItems();
}

// Renaming an item used to keep the old macros, so swapping white bread for rye
// changed the label and nothing else. A new name now re-estimates its macros —
// unless the numbers were edited too, in which case those were explicit and win.
async function _saveParsedEdit(idx) {
  const it = _parsedMealItems[idx];
  if (!it) return;
  // A missing field means "no change", never zero — losing someone's macros
  // because an input wasn't in the DOM would be silent data loss.
  const num = (suffix, cur) => {
    const el = document.getElementById('pei-' + suffix + '-' + idx);
    if (!el) return cur;
    const v = Number(el.value);
    return (el.value === '' || !isFinite(v)) ? 0 : Math.round(v);
  };
  const nameEl = document.getElementById('pei-name-' + idx);
  const newName = nameEl ? String(nameEl.value || '').trim() : String(it.name || '');
  const typed = {
    calories: num('cal', it.calories),
    protein:  num('p',   it.protein),
    carbs:    num('c',   it.carbs),
    fat:      num('f',   it.fat),
  };
  const macrosTouched = typed.calories !== it.calories || typed.protein !== it.protein ||
                        typed.carbs !== it.carbs || typed.fat !== it.fat;
  const nameChanged = !!newName && newName.toLowerCase() !== String(it.name || '').toLowerCase();

  if (!nameChanged || macrosTouched) {
    if (newName) it.name = newName;
    Object.assign(it, typed);
    _editingParsedIdx = -1;
    _renderParsedItems();
    return;
  }

  // Show the row as busy while the estimate is fetched
  it.name = newName;
  _editingParsedIdx = -1;
  _recalcIdx = idx;
  _renderParsedItems();

  let fresh = null;
  try { fresh = await _macrosForFood(newName); }
  catch (e) { if (typeof reportError === 'function') reportError('macro-recalc', e); }

  _recalcIdx = -1;
  // Guard against the list changing while the request was in flight
  const cur = _parsedMealItems[idx];
  if (!cur) { _renderParsedItems(); return; }
  if (fresh) {
    cur.name = fresh.name || newName;
    cur.calories = fresh.calories; cur.protein = fresh.protein;
    cur.carbs = fresh.carbs; cur.fat = fresh.fat;
  }
  _renderParsedItems();
  if (!fresh) {
    const out = document.getElementById(_parsedOutId);
    if (out) out.insertAdjacentHTML('afterbegin',
      '<p class="dm-hint dm-warn" style="font-size:11px;margin-bottom:8px">Couldn\'t estimate macros for that name — the previous values were kept. Edit them by hand or try a simpler name.</p>');
  }
}

function addAllDescribed() {
  if (!_parsedMealItems.length) return;
  curMealItems.push(..._parsedMealItems);
  _parsedMealItems = [];
  go('dietAddMeal');
}

// ── PHOTO MACRO SCANNER ──────────────────────────────────────────────────
function triggerFoodPhoto() {
  const inp = document.getElementById('food-photo-input');
  if (inp) inp.click();
}

async function handleFoodPhoto(input) {
  const file = input.files?.[0];
  if (!file) return;

  const out = document.getElementById('photo-output');
  if (out) out.innerHTML = '<p class="dm-hint" style="text-align:center">‣ Analyzing photo…</p>';

  // Show preview
  const preview = document.getElementById('photo-preview');
  if (preview) {
    const url = URL.createObjectURL(file);
    preview.innerHTML = `<img src="${url}" class="food-photo-img">`;
  }

  try {
    // Convert to base64
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    // Resize to reduce payload — keep small for vision API
    const resized = await _resizeImage(base64, 512);

    const sysPrompt =
      'You are a food nutrition analyzer with computer vision. You ONLY output JSON. Never output any text, explanation, or markdown — ONLY a raw JSON array.\n\n' +
      'INPUT: A photo of food.\n' +
      'OUTPUT: A JSON array where each element has exactly these keys: "name" (string), "calories" (integer), "protein" (integer), "carbs" (integer), "fat" (integer).\n\n' +
      'RULES:\n' +
      '- LOOK CAREFULLY at the actual image — identify foods by their color, texture, and shape\n' +
      '- Common visual cues: white/creamy = yoghurt/cream, yellow slices = banana, red = strawberry/tomato, brown = meat/bread, green = vegetables\n' +
      '- Bowls often contain yoghurt, oatmeal, or cereal — not grilled meat\n' +
      '- Identify every distinct food item visible in the photo\n' +
      '- All macro values MUST be integers\n' +
      '- Estimate portion sizes from visual cues (plate size, bowl size, utensils, etc.)\n' +
      '- If unsure, estimate based on typical portions — never refuse\n' +
      '- NEVER wrap in markdown code fences\n' +
      '- Your ENTIRE response must be parseable by JSON.parse()';

    const raw = await _aiFetch([
      { role: 'system', content: sysPrompt },
      { role: 'user', content: [
        { type: 'image_url', image_url: { url: resized } },
        { type: 'text', text: 'Return JSON array of macros for each food item in this photo.' }
      ]}
    ], { jsonMode: true });
    const clean = raw.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
    const jsonStr = _extractJsonArray(clean);

    if (!jsonStr) {
      if (typeof trackFail === 'function') trackFail('photo_scan', 'no_json');
      if (out) out.innerHTML = `<p class="dm-hint dm-warn">Could not identify food. Try a clearer photo or describe it instead.</p>`;
      return;
    }

    let items;
    try { items = JSON.parse(jsonStr); } catch(pe) {
      if (out) out.innerHTML = `<p class="dm-hint dm-warn">Parse error. Try again or describe your meal instead.</p>`;
      return;
    }
    if (!Array.isArray(items) || !items.length) throw new Error('No food detected');

    _parsedMealItems = items.map(it => ({
      name:     String(it.name || 'Food'),
      calories: Math.round(Number(it.calories) || 0),
      protein:  Math.round(Number(it.protein)  || 0),
      carbs:    Math.round(Number(it.carbs)     || 0),
      fat:      Math.round(Number(it.fat)       || 0),
    }));
    if (typeof track === 'function') track('food_photo_scan', { items_detected: _parsedMealItems.length });
    _renderParsedItems(out);

  } catch(e) {
    if (e.message === 'offline') {
      if (out) out.innerHTML = `<p class="dm-hint dm-warn">You're offline. Connect to the internet to analyze food photos.</p>`;
    } else if (e.name === 'AbortError') {
      if (out) out.innerHTML = `<p class="dm-hint dm-warn">AI service timed out. Please try again.</p>`;
    } else {
      if (out) out.innerHTML = `<p class="dm-hint dm-warn">AI service unavailable. Try again or describe your meal instead.</p>`;
    }
  }

  // Reset file input so same file can be re-selected
  input.value = '';
}

function _resizeImage(base64, maxDim) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      if (width <= maxDim && height <= maxDim) { resolve(base64); return; }
      const scale = Math.min(maxDim / width, maxDim / height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => resolve(base64);
    img.src = base64;
  });
}

function renderDietAddMeal() {
  const types = ['Breakfast','Lunch','Dinner','Snack'];
  const typeBtns = types.map(t => `<button class="d-type-btn${t===curMealType?' active':''}" onclick="setMealType('${t}')">${t}</button>`).join('');

  const itemsList = curMealItems.length ? curMealItems.map((it, i) =>
    `<div class="d-fi"><span>${esc(it.name)}</span><div style="display:flex;align-items:center;gap:8px"><span class="d-fi-macros">${it.calories}cal ${it.protein}P ${it.carbs}C ${it.fat}F</span><button class="d-del-btn" onclick="removeFoodItem(${i})">\u00D7</button></div></div>`
  ).join('') : '<p style="font-size:12px;color:var(--text-muted);padding:8px 0">No items added yet.</p>';

  const totalCal = curMealItems.reduce((s,i) => s + i.calories, 0);

  document.getElementById('view').innerHTML = `
    <button class="back" onclick="curMealItems=[];go('diet')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">Add Meal</div><div class="page-sub">Log what you ate.</div></div>
    <div class="d-type-btns">${typeBtns}</div>
    <div style="padding:0 24px">
      <div class="sec-lbl" style="padding:0 0 8px">Items${curMealItems.length ? ` \u00B7 ${totalCal} cal total` : ''}</div>
      <div class="d-items-list">${itemsList}</div>

      <div class="dm-section">
        <div class="dm-header">
          <span class="dm-icon">${typeof icon==='function'?icon('camera',18):''}</span>
          <span class="dm-header-text">Scan Food Photo</span>
          <span class="dm-header-sub">AI identifies & calculates</span>
        </div>
        <input type="file" accept="image/*" capture="environment" id="food-photo-input" style="display:none" onchange="handleFoodPhoto(this)">
        <button class="w-action-btn photo-scan-btn" style="width:100%;margin:0" onclick="triggerFoodPhoto()">
          ${typeof icon==='function'?icon('camera',16):''} TAKE PHOTO OR CHOOSE IMAGE
        </button>
        <div id="photo-preview" class="photo-preview"></div>
        <div id="photo-output" class="dm-output"></div>
      </div>

      <div class="dm-section">
        <div class="dm-header">
          <span class="dm-icon">‣</span>
          <span class="dm-header-text">Describe your meal</span>
          <span class="dm-header-sub">Instant macro calc</span>
        </div>
        <textarea class="dm-textarea" id="describe-textarea" rows="3" placeholder="e.g. Big Mac and large fries, a bowl of pasta with chicken, 2 eggs and toast with butter…"></textarea>
        <button class="w-action-btn" id="calc-macros-btn" style="width:100%;margin:8px 0 0" onclick="calculateMealDescription()">CALCULATE MACROS</button>
        <div id="describe-output" class="dm-output"></div>
      </div>

      <div class="dm-section">
        <div class="dm-header">
          <span class="dm-icon">\ud83d\udd0d</span>
          <span class="dm-header-text">Search Food Database</span>
          <span class="dm-header-sub">Open Food Facts \u2014 millions of foods</span>
        </div>
        <input class="search-input" type="text" id="food-search-input" placeholder="Search foods (e.g. chicken breast, oatmeal)\u2026" oninput="doFoodSearch(this.value)">
        <div id="food-search-results"></div>
      </div>

      ${_buildFavoritesSection()}

      <div class="j-lbl">Manual Entry</div>
      <input class="d-input" type="text" id="fi-name" placeholder="Food name (e.g. Chicken breast 200g)">
      <div class="d-input-row">
        <input class="d-input-sm" type="number" inputmode="decimal" id="fi-cal" placeholder="Cal">
        <input class="d-input-sm" type="number" inputmode="decimal" id="fi-p" placeholder="Protein">
        <input class="d-input-sm" type="number" inputmode="decimal" id="fi-c" placeholder="Carbs">
        <input class="d-input-sm" type="number" inputmode="decimal" id="fi-f" placeholder="Fat">
      </div>
      <button class="w-action-btn" style="width:100%;margin:12px 0" onclick="addFoodItem()">ADD ITEM</button>
      <button class="w-action-btn" style="width:100%;margin:0 0 12px;background:rgba(110,159,212,0.1);border-color:var(--pro);color:var(--pro)" onclick="go('dietRecipes')">QUICK ADD FROM RECIPES \u2192</button>
    </div>
    <button class="w-finish" onclick="saveMeal()"${curMealItems.length?'':' style="opacity:0.4;pointer-events:none"'}>SAVE MEAL</button>`;
}

function setMealType(t) { curMealType = t; go('dietAddMeal'); }

function addFoodItem() {
  const name = document.getElementById('fi-name')?.value?.trim();
  if (!name) return;
  const clamp = (v, max) => Math.max(0, Math.min(parseFloat(v) || 0, max));
  curMealItems.push({
    name,
    calories: clamp(document.getElementById('fi-cal')?.value, 15000),
    protein: clamp(document.getElementById('fi-p')?.value, 1000),
    carbs: clamp(document.getElementById('fi-c')?.value, 1000),
    fat: clamp(document.getElementById('fi-f')?.value, 1000),
  });
  go('dietAddMeal');
}

function removeFoodItem(i) { curMealItems.splice(i, 1); go('dietAddMeal'); }

// ── OPEN FOOD FACTS SEARCH ──────────────────────────────────────────────
// ── FOOD DATABASE ────────────────────────────────────────────────────────
// Built-in common foods (per typical serving) for instant search
const COMMON_FOODS = [
  // Proteins
  { name: 'Chicken Breast (grilled)', calories: 165, protein: 31, carbs: 0, fat: 3.6, serving: '100g' },
  { name: 'Chicken Thigh (skin-on)', calories: 209, protein: 26, carbs: 0, fat: 11, serving: '100g' },
  { name: 'Ground Beef (85/15)', calories: 215, protein: 26, carbs: 0, fat: 13, serving: '100g' },
  { name: 'Salmon Fillet', calories: 208, protein: 20, carbs: 0, fat: 13, serving: '100g' },
  { name: 'Tuna (canned, drained)', calories: 116, protein: 26, carbs: 0, fat: 1, serving: '100g' },
  { name: 'Eggs (whole, large)', calories: 72, protein: 6, carbs: 0.4, fat: 5, serving: '1 egg' },
  { name: 'Egg Whites', calories: 17, protein: 3.6, carbs: 0.2, fat: 0.1, serving: '1 white' },
  { name: 'Turkey Breast (deli)', calories: 104, protein: 18, carbs: 2, fat: 2, serving: '100g' },
  { name: 'Shrimp', calories: 85, protein: 20, carbs: 0, fat: 0.5, serving: '100g' },
  { name: 'Greek Yogurt (plain, 0%)', calories: 59, protein: 10, carbs: 3.6, fat: 0.4, serving: '100g' },
  { name: 'Greek Yogurt (plain, 2%)', calories: 73, protein: 10, carbs: 4, fat: 2, serving: '100g' },
  { name: 'Cottage Cheese (2%)', calories: 84, protein: 11, carbs: 4.3, fat: 2.3, serving: '100g' },
  { name: 'Whey Protein Scoop', calories: 120, protein: 24, carbs: 3, fat: 1.5, serving: '1 scoop (30g)' },
  { name: 'Tofu (firm)', calories: 76, protein: 8, carbs: 2, fat: 4.2, serving: '100g' },
  // Carbs
  { name: 'White Rice (cooked)', calories: 130, protein: 2.7, carbs: 28, fat: 0.3, serving: '100g' },
  { name: 'Brown Rice (cooked)', calories: 123, protein: 2.7, carbs: 26, fat: 1, serving: '100g' },
  { name: 'Pasta (cooked)', calories: 131, protein: 5, carbs: 25, fat: 1.1, serving: '100g' },
  { name: 'Bread (white, 1 slice)', calories: 79, protein: 2.7, carbs: 15, fat: 1, serving: '1 slice' },
  { name: 'Bread (whole wheat, 1 slice)', calories: 81, protein: 4, carbs: 14, fat: 1.1, serving: '1 slice' },
  { name: 'Oatmeal (dry)', calories: 150, protein: 5, carbs: 27, fat: 3, serving: '40g' },
  { name: 'Sweet Potato', calories: 86, protein: 1.6, carbs: 20, fat: 0.1, serving: '100g' },
  { name: 'Potato (baked)', calories: 93, protein: 2.5, carbs: 21, fat: 0.1, serving: '100g' },
  { name: 'Banana', calories: 105, protein: 1.3, carbs: 27, fat: 0.4, serving: '1 medium' },
  { name: 'Apple', calories: 95, protein: 0.5, carbs: 25, fat: 0.3, serving: '1 medium' },
  { name: 'Blueberries', calories: 57, protein: 0.7, carbs: 14, fat: 0.3, serving: '100g' },
  { name: 'Orange', calories: 62, protein: 1.2, carbs: 15, fat: 0.2, serving: '1 medium' },
  { name: 'Tortilla (flour, large)', calories: 218, protein: 5.7, carbs: 36, fat: 5, serving: '1 tortilla' },
  { name: 'Bagel', calories: 245, protein: 10, carbs: 48, fat: 1.5, serving: '1 bagel' },
  // Fats
  { name: 'Avocado', calories: 240, protein: 3, carbs: 13, fat: 22, serving: '1 medium' },
  { name: 'Peanut Butter', calories: 94, protein: 4, carbs: 3, fat: 8, serving: '1 tbsp' },
  { name: 'Almond Butter', calories: 98, protein: 3.4, carbs: 3, fat: 9, serving: '1 tbsp' },
  { name: 'Almonds', calories: 164, protein: 6, carbs: 6, fat: 14, serving: '28g' },
  { name: 'Walnuts', calories: 185, protein: 4.3, carbs: 3.9, fat: 18.5, serving: '28g' },
  { name: 'Olive Oil', calories: 119, protein: 0, carbs: 0, fat: 14, serving: '1 tbsp' },
  { name: 'Butter', calories: 102, protein: 0.1, carbs: 0, fat: 11.5, serving: '1 tbsp' },
  { name: 'Cheese (cheddar)', calories: 113, protein: 7, carbs: 0.4, fat: 9.3, serving: '28g' },
  { name: 'Mozzarella', calories: 85, protein: 6.3, carbs: 0.7, fat: 6.3, serving: '28g' },
  { name: 'Cream Cheese', calories: 51, protein: 0.9, carbs: 0.8, fat: 5, serving: '1 tbsp' },
  // Dairy & Drinks
  { name: 'Whole Milk', calories: 149, protein: 8, carbs: 12, fat: 8, serving: '1 cup (240ml)' },
  { name: 'Skim Milk', calories: 83, protein: 8, carbs: 12, fat: 0.2, serving: '1 cup (240ml)' },
  { name: 'Oat Milk', calories: 120, protein: 3, carbs: 16, fat: 5, serving: '1 cup (240ml)' },
  { name: 'Almond Milk (unsweetened)', calories: 30, protein: 1, carbs: 1, fat: 2.5, serving: '1 cup (240ml)' },
  { name: 'Orange Juice', calories: 112, protein: 1.7, carbs: 26, fat: 0.5, serving: '1 cup (240ml)' },
  // Snacks & Common
  { name: 'Protein Bar (average)', calories: 210, protein: 20, carbs: 22, fat: 8, serving: '1 bar' },
  { name: 'Granola Bar', calories: 140, protein: 3, carbs: 22, fat: 5, serving: '1 bar' },
  { name: 'Dark Chocolate (70%)', calories: 170, protein: 2.2, carbs: 13, fat: 12, serving: '28g' },
  { name: 'Honey', calories: 64, protein: 0.1, carbs: 17, fat: 0, serving: '1 tbsp' },
  { name: 'Hummus', calories: 25, protein: 1.2, carbs: 2, fat: 1.4, serving: '1 tbsp' },
  // Vegetables
  { name: 'Broccoli', calories: 55, protein: 3.7, carbs: 11, fat: 0.6, serving: '1 cup' },
  { name: 'Spinach (raw)', calories: 7, protein: 0.9, carbs: 1.1, fat: 0.1, serving: '1 cup' },
  { name: 'Mixed Salad Greens', calories: 10, protein: 1, carbs: 2, fat: 0.1, serving: '1 cup' },
  { name: 'Tomato', calories: 22, protein: 1.1, carbs: 4.8, fat: 0.2, serving: '1 medium' },
  { name: 'Cucumber', calories: 16, protein: 0.7, carbs: 3.6, fat: 0.1, serving: '1 cup sliced' },
  { name: 'Bell Pepper', calories: 31, protein: 1, carbs: 6, fat: 0.3, serving: '1 medium' },
  { name: 'Carrots', calories: 25, protein: 0.6, carbs: 6, fat: 0.1, serving: '1 medium' },
];

let _foodSearchResults = [];
let _foodSearchDebounce = null;

function doFoodSearch(q) {
  clearTimeout(_foodSearchDebounce);
  if (!q || q.length < 2) { _foodSearchResults = []; _renderFoodResults(); return; }

  // Search local database first (instant)
  const terms = q.toLowerCase().split(/\s+/);
  const localResults = COMMON_FOODS.filter(f => {
    const name = f.name.toLowerCase();
    return terms.every(t => name.includes(t));
  }).slice(0, 6).map(f => ({ ...f, per: f.serving, source: 'local' }));

  _foodSearchResults = localResults;
  _renderFoodResults();

  // Then search Open Food Facts for branded/packaged items (async)
  _foodSearchDebounce = setTimeout(async () => {
    try {
      const res = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=6&fields=product_name,nutriments,serving_size,brands`);
      const data = await res.json();
      const apiResults = (data.products || [])
        .filter(p => p.product_name && p.nutriments && (p.nutriments['energy-kcal_100g'] || p.nutriments['energy-kcal']) > 0)
        .map(p => {
          const n = p.nutriments;
          const servSize = p.serving_size || '100g';
          const hasPer = n['energy-kcal_serving'] && n['proteins_serving'] != null;
          return {
            name: p.product_name + (p.brands ? ` (${p.brands})` : ''),
            calories: Math.round(hasPer ? n['energy-kcal_serving'] : (n['energy-kcal_100g'] || n['energy-kcal'] || 0)),
            protein: Math.round(hasPer ? n['proteins_serving'] : (n.proteins_100g || n.proteins || 0)),
            carbs: Math.round(hasPer ? n['carbohydrates_serving'] : (n.carbohydrates_100g || n.carbohydrates || 0)),
            fat: Math.round(hasPer ? n['fat_serving'] : (n.fat_100g || n.fat || 0)),
            per: hasPer ? servSize : '100g',
            source: 'api',
          };
        }).slice(0, 5);
      // Combine: local first, then API results (deduped by name)
      const localNames = new Set(localResults.map(f => f.name.toLowerCase()));
      const combined = [...localResults, ...apiResults.filter(f => !localNames.has(f.name.toLowerCase()))];
      _foodSearchResults = combined;
      _renderFoodResults();
    } catch(e) {
      // Keep local results, just don't add API results
      console.warn('[food] API search failed:', e);
    }
  }, 500);
}

function _renderFoodResults() {
  const out = document.getElementById('food-search-results');
  if (!out) return;
  if (!_foodSearchResults.length) { out.innerHTML = ''; return; }
  out.innerHTML = _foodSearchResults.map((f, i) =>
    `<div class="food-result" onclick="selectFoodResult(${i})">
      <div class="food-result-name">${esc(f.name)}${f.source === 'api' ? ' <span style="font-size:10px;color:var(--text-dim);background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:4px">OFF</span>' : ''}</div>
      <div class="food-result-macros">${f.calories} cal · ${f.protein}P · ${f.carbs}C · ${f.fat}F <span style="color:var(--text-dim)">per ${esc(f.per)}</span></div>
    </div>`
  ).join('');
}

function selectFoodResult(i) {
  const f = _foodSearchResults[i];
  if (!f) return;
  curMealItems.push({ name: f.name, calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat });
  _foodSearchResults = [];
  go('dietAddMeal');
}

// ── MEAL FAVORITES ──────────────────────────────────────────────────────
function getMealFavorites() { return LS.get('hvi_meal_favorites', []); }

function saveMealAsFavorite() {
  if (!curMealItems.length) return;
  const favs = getMealFavorites();
  favs.unshift({ name: curMealType, items: [...curMealItems], savedAt: Date.now() });
  if (favs.length > 20) favs.length = 20;
  LS.set('hvi_meal_favorites', favs);
}

function logFavorite(i) {
  const favs = getMealFavorites();
  const fav = favs[i];
  if (!fav) return;
  const t = today();
  if (!mealLog[t]) mealLog[t] = { meals: [] };
  mealLog[t].meals.push({ id: genId('m'), name: fav.name, items: [...fav.items] });
  LS.set('hvi_meal_log', mealLog);
  awardXP(15, 'body');
  checkDailyQuests();
  go('diet');
}

function deleteFavorite(i) {
  const favs = getMealFavorites();
  favs.splice(i, 1);
  LS.set('hvi_meal_favorites', favs);
  go('dietAddMeal');
}

function getRecentMeals() {
  const recent = [];
  const seen = new Set();
  const dates = Object.keys(mealLog).sort().reverse().slice(0, 14);
  for (const d of dates) {
    for (const meal of (mealLog[d]?.meals || [])) {
      const key = meal.items.map(it => it.name).sort().join('|');
      if (!seen.has(key)) {
        seen.add(key);
        recent.push(meal);
        if (recent.length >= 8) return recent;
      }
    }
  }
  return recent;
}

function _buildFavoritesSection() {
  const favs = getMealFavorites();
  const recent = getRecentMeals();
  if (!favs.length && !recent.length) return '';

  let html = '<div class="dm-section"><div class="dm-header"><span class="dm-icon">' + (typeof icon==='function'?icon('star',18):'') + '</span><span class="dm-header-text">Quick Re-log</span><span class="dm-header-sub">Favorites & recent meals</span></div>';

  const SHOW_LIMIT = 3;

  if (favs.length) {
    html += '<div class="sec-lbl" style="padding:8px 0 4px;font-size:9px">FAVORITES</div>';
    html += favs.slice(0, SHOW_LIMIT).map((f, i) => {
      const cal = f.items.reduce((s, it) => s + (it.calories||0), 0);
      return `<div class="food-result" style="position:relative" onclick="logFavorite(${i})">
        <div class="food-result-name">${esc(f.name)} — ${f.items.map(it=>esc(it.name)).join(', ')}</div>
        <div class="food-result-macros">${cal} cal · tap to log</div>
        <button class="d-del-btn" style="position:absolute;right:8px;top:8px" onclick="event.stopPropagation();deleteFavorite(${i})">×</button>
      </div>`;
    }).join('');
    if (favs.length > SHOW_LIMIT) {
      html += `<div id="favs-extra" style="display:none">` + favs.slice(SHOW_LIMIT).map((f, i) => {
        const idx = i + SHOW_LIMIT;
        const cal = f.items.reduce((s, it) => s + (it.calories||0), 0);
        return `<div class="food-result" style="position:relative" onclick="logFavorite(${idx})">
          <div class="food-result-name">${esc(f.name)} — ${f.items.map(it=>esc(it.name)).join(', ')}</div>
          <div class="food-result-macros">${cal} cal · tap to log</div>
          <button class="d-del-btn" style="position:absolute;right:8px;top:8px" onclick="event.stopPropagation();deleteFavorite(${idx})">×</button>
        </div>`;
      }).join('') + `</div>`;
      html += `<div class="food-result" style="text-align:center;color:var(--accent);font-size:12px;cursor:pointer" onclick="document.getElementById('favs-extra').style.display='block';this.remove()">Show ${favs.length - SHOW_LIMIT} more ▾</div>`;
    }
  }

  if (recent.length) {
    html += '<div class="sec-lbl" style="padding:8px 0 4px;font-size:9px">RECENT MEALS</div>';
    html += recent.slice(0, SHOW_LIMIT).map((m, i) => {
      const cal = m.items.reduce((s, it) => s + (it.calories||0), 0);
      return `<div class="food-result" onclick="logRecentMeal(${i})">
        <div class="food-result-name">${esc(m.name)} — ${m.items.map(it=>esc(it.name)).join(', ')}</div>
        <div class="food-result-macros">${cal} cal · tap to log again</div>
      </div>`;
    }).join('');
    if (recent.length > SHOW_LIMIT) {
      html += `<div id="recent-extra" style="display:none">` + recent.slice(SHOW_LIMIT).map((m, i) => {
        const idx = i + SHOW_LIMIT;
        const cal = m.items.reduce((s, it) => s + (it.calories||0), 0);
        return `<div class="food-result" onclick="logRecentMeal(${idx})">
          <div class="food-result-name">${esc(m.name)} — ${m.items.map(it=>esc(it.name)).join(', ')}</div>
          <div class="food-result-macros">${cal} cal · tap to log again</div>
        </div>`;
      }).join('') + `</div>`;
      html += `<div class="food-result" style="text-align:center;color:var(--accent);font-size:12px;cursor:pointer" onclick="document.getElementById('recent-extra').style.display='block';this.remove()">Show ${recent.length - SHOW_LIMIT} more ▾</div>`;
    }
  }

  html += '</div>';
  return html;
}

function logRecentMeal(i) {
  const recent = getRecentMeals();
  const m = recent[i];
  if (!m) return;
  const t = today();
  if (!mealLog[t]) mealLog[t] = { meals: [] };
  mealLog[t].meals.push({ id: genId('m'), name: m.name, items: [...m.items] });
  LS.set('hvi_meal_log', mealLog);
  awardXP(15, 'body');
  checkDailyQuests();
  go('diet');
}

function saveMeal() {
  if (!curMealItems.length) return;
  if (typeof track === 'function') track('meal_logged', { meal_type: curMealType, items: curMealItems.length });
  saveMealAsFavorite();
  const t = today();
  if (!mealLog[t]) mealLog[t] = { meals: [] };
  mealLog[t].meals.push({ id: genId('m'), name: curMealType, items: [...curMealItems] });
  if (window.Arete) window.Arete.emit('meal:logged', { meal: curMealType });
  LS.set('hvi_meal_log', mealLog);
  awardXP(15, 'body');
  const _dm = getDayMacros();
  if (dietMeta.dailyGoals.protein > 0 && _dm.p >= dietMeta.dailyGoals.protein * 0.9) trackWeeklyProtein();
  checkDailyQuests();
  curMealItems = [];
  go('diet');
}

function renderDietRecipes() {
  const cats = ['Breakfast','Lunch','Dinner','Snack'];
  const groups = cats.map(cat => {
    const recs = RECIPES.filter(r => r.cat === cat);
    if (!recs.length) return '';
    return `<div class="sec-lbl" style="padding-top:16px">${cat}</div>` + recs.map(r => `
      <div class="d-recipe-card" onclick="go('dietRecipeDetail',{recipeId:'${r.id}'})">
        <div class="d-recipe-name">${r.name}</div>
        <div class="d-recipe-macros-row">${r.cal} cal \u00B7 ${r.p}P \u00B7 ${r.c}C \u00B7 ${r.f}F</div>
      </div>`).join('');
  }).join('');

  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('diet')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">Recipes</div><div class="page-sub">Quick meal ideas with macros.</div></div>
    <div class="d-recipe-grid ani">${groups}</div>`;
}

function renderDietRecipeDetail() {
  const r = RECIPES.find(x => x.id === curRecipeId);
  if (!r) { go('dietRecipes'); return; }
  const ingHTML = r.ing.map(i => `\u2022 ${esc(i)}`).join('<br>');

  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('dietRecipes')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">${esc(r.name)}</div>
      <div class="page-sub">${r.cal} cal \u00B7 ${r.p}g protein \u00B7 ${r.c}g carbs \u00B7 ${r.f}g fat</div></div>
    <div class="d-recipe-detail ani">
      <div class="sec-lbl" style="padding:0 0 8px">Ingredients</div>
      <div class="d-recipe-ing">${ingHTML}</div>
      <div class="sec-lbl" style="padding:16px 0 8px">Instructions</div>
      <div class="d-recipe-steps">${esc(r.steps)}</div>
    </div>
    <button class="w-finish" onclick="logRecipe('${r.id}')">Add to Today's Meals</button>`;
}

function logRecipe(id) {
  const r = RECIPES.find(x => x.id === id);
  if (!r) return;
  const t = today();
  if (!mealLog[t]) mealLog[t] = { meals: [] };
  mealLog[t].meals.push({
    id: genId('m'),
    name: r.cat,
    items: [{ name: r.name, calories: r.cal, protein: r.p, carbs: r.c, fat: r.f }]
  });
  LS.set('hvi_meal_log', mealLog);
  go('diet');
}

function renderDietGoals() {
  const g = dietMeta.dailyGoals;
  const _td = (typeof getTrainingDays === 'function') ? getTrainingDays() : [1, 2, 3, 4, 5];
  const _dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const tdBtns = _dayLabels.map((d, i) =>
    `<button class="sched-day-btn${_td.includes(i) ? ' active' : ''}" onclick="toggleTrainingDay(${i})" aria-pressed="${_td.includes(i)}">${d}</button>`
  ).join('');
  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('diet')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">Daily Goals</div><div class="page-sub">Set your daily macro targets.</div></div>
    <div class="d-goals-form ani">
      <div class="d-goals-row"><div class="d-goals-label">Calories</div><input class="d-goals-input" type="number" inputmode="decimal" id="dg-cal" value="${g.calories}"></div>
      <div class="d-goals-row"><div class="d-goals-label">Protein</div><input class="d-goals-input" type="number" inputmode="decimal" id="dg-p" value="${g.protein}"><span style="color:var(--text-muted);font-size:12px">g</span></div>
      <div class="d-goals-row"><div class="d-goals-label">Carbs</div><input class="d-goals-input" type="number" inputmode="decimal" id="dg-c" value="${g.carbs}"><span style="color:var(--text-muted);font-size:12px">g</span></div>
      <div class="d-goals-row"><div class="d-goals-label">Fat</div><input class="d-goals-input" type="number" inputmode="decimal" id="dg-f" value="${g.fat}"><span style="color:var(--text-muted);font-size:12px">g</span></div>
    </div>
    <div class="sec-lbl" style="padding:20px 24px 8px">Training Days</div>
    <div class="d-goals-form ani" style="display:block">
      <div style="font-size:12px;color:var(--text-dim);line-height:1.5;margin-bottom:12px">Carbs rise on training days and drop on rest days. Tap the days you train.</div>
      <div class="sched-day-row">${tdBtns}</div>
    </div>
    <button class="w-action-btn" style="margin-bottom:0" onclick="go('dietTDEE')">TDEE CALCULATOR</button>
    <button class="w-finish" onclick="saveDietGoals()">SAVE GOALS</button>`;
}

function toggleTrainingDay(i) {
  const cur = ((typeof getTrainingDays === 'function') ? getTrainingDays() : [1, 2, 3, 4, 5]).slice();
  const idx = cur.indexOf(i);
  if (idx >= 0) cur.splice(idx, 1); else cur.push(i);
  if (typeof setTrainingDays === 'function') setTrainingDays(cur);
  go('dietGoals');
}

function saveDietGoals() {
  const clampGoal = (v, fallback, max) => Math.max(1, Math.min(parseInt(v) || fallback, max));
  dietMeta.dailyGoals = {
    calories: clampGoal(document.getElementById('dg-cal')?.value, 2500, 15000),
    protein: clampGoal(document.getElementById('dg-p')?.value, 180, 1000),
    carbs: clampGoal(document.getElementById('dg-c')?.value, 280, 1500),
    fat: clampGoal(document.getElementById('dg-f')?.value, 80, 1000),
  };
  LS.set('hvi_diet_meta', dietMeta);
  go('diet');
}

// ── TDEE CALCULATOR ──────────────────────────────────────────────────────
function injectTDEEStyles() {
  if (document.getElementById('tdee-styles')) return;
  const s = document.createElement('style');
  s.id = 'tdee-styles';
  s.textContent = `
    .tp-pill{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);background:var(--surface);color:var(--text);cursor:pointer;width:100%;text-align:left;margin-bottom:6px;font-size:13px;letter-spacing:0.05em;transition:all .2s}
    .tp-pill.active{background:var(--surface2);border-color:var(--accent-b)}
    .tp-pill-sub{font-size:11px;color:var(--text-dim);text-align:right;max-width:55%}
    .tp-sex-row{display:flex;gap:8px;margin-bottom:8px}
    .tp-sex-btn{flex:1;padding:12px 16px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);background:var(--surface);color:var(--text);cursor:pointer;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;text-align:center;transition:all .2s}
    .tp-sex-btn.active{border-color:var(--accent);color:var(--accent-b)}
    .tp-input-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .tp-input-card{background:var(--surface2);border-radius:10px;padding:12px}
    .tp-input-label{font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px}
    .tp-input{width:100%;padding:8px 10px;border:1px solid rgba(255,255,255,0.08);border-radius:8px;background:var(--surface);color:var(--text);font-size:15px;box-sizing:border-box}
    .tp-result-box{background:var(--surface2);border-radius:14px;padding:20px;margin-top:16px;text-align:center}
    .tp-tdee-label{font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:1px}
    .tp-tdee-num{font-family:var(--serif);font-size:48px;color:var(--accent-b);margin:8px 0}
    .tp-tdee-unit{font-size:12px;color:var(--text-dim)}
    .tp-macro-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
    .tp-macro-card{background:var(--surface);border-radius:10px;padding:12px;text-align:center}
    .tp-macro-val{font-size:20px;font-weight:700;font-family:var(--serif)}
    .tp-macro-lbl{font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-top:2px}
    .tp-error{color:var(--fat);font-size:13px;padding:8px 0;text-align:center}
    .tp-confirm{color:var(--carb);font-size:13px;padding:8px 0;text-align:center}
  `;
  document.head.appendChild(s);
}

let _tdeeSex = 'male', _tdeeActivity = 'moderate', _tdeeGoal = 'maintain';

function renderDietTDEE() {
  injectTDEEStyles();
  if (tdeeProfile) {
    _tdeeSex = tdeeProfile.sex || 'male';
    _tdeeActivity = tdeeProfile.activity || 'moderate';
    _tdeeGoal = tdeeProfile.goal || 'maintain';
  }

  const activities = [
    ['sedentary', 'SEDENTARY', 'Desk job, little or no exercise'],
    ['light', 'LIGHTLY ACTIVE', 'Light exercise 1\u20133 days/week'],
    ['moderate', 'MODERATELY ACTIVE', 'Moderate exercise 3\u20135 days/week'],
    ['active', 'VERY ACTIVE', 'Hard exercise 6\u20137 days/week'],
    ['very_active', 'EXTREMELY ACTIVE', 'Physical job + hard training'],
  ];
  const goals = [
    ['cut', 'AGGRESSIVE CUT', '\u2212500 cal deficit'],
    ['cut_mild', 'MILD CUT', '\u2212250 cal deficit'],
    ['maintain', 'MAINTAIN', 'Eat at TDEE'],
    ['bulk_lean', 'LEAN BULK', '+250 cal surplus'],
    ['bulk', 'BULK', '+500 cal surplus'],
  ];

  const actHTML = activities.map(([k, lbl, sub]) =>
    `<button class="tp-pill tp-act${_tdeeActivity===k?' active':''}" onclick="_tdeeActivity='${k}';document.querySelectorAll('.tp-act').forEach(e=>e.classList.remove('active'));this.classList.add('active')">
      <span>${lbl}</span><span class="tp-pill-sub">${sub}</span></button>`
  ).join('');

  const goalHTML = goals.map(([k, lbl, sub]) =>
    `<button class="tp-pill tp-goal${_tdeeGoal===k?' active':''}" onclick="_tdeeGoal='${k}';document.querySelectorAll('.tp-goal').forEach(e=>e.classList.remove('active'));this.classList.add('active')">
      <span>${lbl}</span><span class="tp-pill-sub">${sub}</span></button>`
  ).join('');

  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('dietGoals')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">TDEE Calculator</div><div class="page-sub">Find your daily energy target.</div></div>

    <div style="padding:0 24px">
      <div class="sec-lbl ani" style="padding-top:8px">Your Stats</div>
      <div class="tp-sex-row ani">
        <button class="tp-sex-btn${_tdeeSex==='male'?' active':''}" id="tdee-male" onclick="_tdeeSex='male';document.getElementById('tdee-male').classList.add('active');document.getElementById('tdee-female').classList.remove('active')">MALE</button>
        <button class="tp-sex-btn${_tdeeSex==='female'?' active':''}" id="tdee-female" onclick="_tdeeSex='female';document.getElementById('tdee-female').classList.add('active');document.getElementById('tdee-male').classList.remove('active')">FEMALE</button>
      </div>
      <div class="tp-input-grid ani">
        <div class="tp-input-card"><div class="tp-input-label">Age (years)</div><input class="tp-input" type="number" id="tdee-age" min="10" max="100" value="${tdeeProfile?.age||''}"></div>
        <div class="tp-input-card"><div class="tp-input-label">Weight (${isImperial() ? 'lbs' : 'kg'})</div><input class="tp-input" type="number" id="tdee-weight" min="${isImperial() ? 44 : 20}" max="${isImperial() ? 660 : 300}" step="0.1" value="${tdeeProfile?.weight_kg ? (isImperial() ? Math.round(tdeeProfile.weight_kg * 2.205) : tdeeProfile.weight_kg) : ''}"></div>
        <div class="tp-input-card"><div class="tp-input-label">Height (${isImperial() ? 'in' : 'cm'})</div><input class="tp-input" type="number" id="tdee-height" min="${isImperial() ? 39 : 100}" max="${isImperial() ? 98 : 250}" value="${tdeeProfile?.height_cm ? (isImperial() ? Math.round(tdeeProfile.height_cm / 2.54) : tdeeProfile.height_cm) : ''}"></div>
      </div>

      <div class="sec-lbl ani" style="padding-top:20px">Activity Level</div>
      <div class="ani">${actHTML}</div>

      <div class="sec-lbl ani" style="padding-top:20px">Your Goal</div>
      <div class="ani">${goalHTML}</div>
    </div>

    <button class="w-finish" onclick="calculateTDEE()">CALCULATE</button>
    <div id="tdee-error"></div>
    <div id="tdee-results"></div>`;
}

// ── BODYWEIGHT DRIFT -> MACRO TARGETS ─────────────────────────────────────
// BMR is driven by bodyweight, so targets set months ago quietly stop matching
// the person using them. This surfaces the drift and offers a recalculation
// rather than performing one: silently moving someone's calorie goal is the
// wrong default, especially downwards.
const _WEIGHT_DRIFT_KG = 1.5;
// These two have to move together. 1.5kg shifts the target by 18-28 calories
// depending on activity level, so the guard sits below the smallest of those:
// set it higher and the weight threshold could never be reached, making any
// change to it silently do nothing.
const _WEIGHT_DRIFT_MIN_CAL = 15;

function bodyweightDrift() {
  const p = (typeof tdeeProfile !== 'undefined' && tdeeProfile) || null;
  if (!p || !(p.weight_kg > 0) || !(p.height_cm > 0) || !(p.age > 0)) return null;

  // weightLog is in display units; the profile is always kg
  const dates = Object.keys(weightLog || {}).sort();
  let latest = 0;
  for (let i = dates.length - 1; i >= 0; i--) {
    const v = parseFloat(weightLog[dates[i]]);
    if (v > 0) { latest = v; break; }
  }
  if (!latest) return null;
  const latestKg = isImperial() ? latest / 2.205 : latest;

  const deltaKg = latestKg - p.weight_kg;
  if (Math.abs(deltaKg) < _WEIGHT_DRIFT_KG) return null;

  const next = computeTDEETargets({
    weightKg: latestKg, heightCm: p.height_cm, age: p.age,
    sex: p.sex, activity: p.activity, goal: p.goal || 'maintain',
  });
  if (!next) return null;
  const current = (dietMeta && dietMeta.dailyGoals) || {};
  if (Math.abs((current.calories || 0) - next.target) < _WEIGHT_DRIFT_MIN_CAL) return null;

  return {
    deltaKg,
    latestKg,
    current: current.calories || 0,
    next,
    // Shown in the unit the user reads
    deltaShown: Math.abs(isImperial() ? deltaKg * 2.205 : deltaKg).toFixed(1),
  };
}

function bodyweightDriftHTML() {
  const d = bodyweightDrift();
  if (!d) return '';
  const dir = d.deltaKg < 0 ? 'lighter' : 'heavier';
  const arrow = d.next.target < d.current ? '\u2193' : '\u2191';
  return `<div class="dw-drift ani">
      <div class="dw-drift-text">
        You're <strong>${d.deltaShown} ${wtUnit()} ${dir}</strong> than when these targets were set.
        Recalculated they'd be <strong>${d.next.target.toLocaleString()} cal</strong>
        <span class="dw-drift-arrow">${arrow}</span> from ${d.current.toLocaleString()}.
      </div>
      <button class="w-action-btn" style="margin:10px 0 0;width:100%"
        onclick="applyBodyweightDrift()">UPDATE MY TARGETS</button>
    </div>`;
}

function applyBodyweightDrift() {
  const d = bodyweightDrift();
  if (!d) return;
  dietMeta.dailyGoals = {
    calories: d.next.target, protein: d.next.protein,
    carbs: d.next.carbs, fat: d.next.fat,
  };
  // Keep the profile in step, or the prompt would reappear immediately
  tdeeProfile.weight_kg = parseFloat(d.latestKg.toFixed(1));
  LS.set('hvi_tdee_profile', tdeeProfile);
  LS.set('hvi_diet_meta', dietMeta);
  if (typeof track === 'function') track('targets_recalculated', { delta_kg: Math.round(d.deltaKg) });
  go('diet');
}

// One implementation of the Mifflin-St Jeor chain, shared by the calculator and
// by the recalculation prompt that appears when bodyweight drifts. Two copies
// would drift apart the moment either was tuned.
const _TDEE_MULTIPLIERS = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
const _TDEE_OFFSETS = { cut: -500, cut_mild: -250, maintain: 0, bulk_lean: 250, bulk: 500 };
const _TDEE_SPLITS = {
  cut:       { p: 0.35, c: 0.35, f: 0.30 },
  cut_mild:  { p: 0.35, c: 0.35, f: 0.30 },
  maintain:  { p: 0.30, c: 0.40, f: 0.30 },
  bulk_lean: { p: 0.30, c: 0.45, f: 0.25 },
  bulk:      { p: 0.25, c: 0.50, f: 0.25 },
};

// weightKg / heightCm / age are metric; goal is one of the five above.
function computeTDEETargets({ weightKg, heightCm, age, sex, activity, goal }) {
  if (!(weightKg > 0) || !(heightCm > 0) || !(age > 0)) return null;
  const bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * age) + (sex === 'male' ? 5 : -161);
  const tdee = Math.round(bmr * (_TDEE_MULTIPLIERS[activity] || 1.55));
  const target = tdee + (_TDEE_OFFSETS[goal] || 0);
  const sp = _TDEE_SPLITS[goal] || _TDEE_SPLITS.maintain;
  return {
    bmr: Math.round(bmr), tdee, target,
    protein: Math.round((target * sp.p) / 4),
    carbs: Math.round((target * sp.c) / 4),
    fat: Math.round((target * sp.f) / 9),
  };
}

function calculateTDEE() {
  const age = parseFloat(document.getElementById('tdee-age')?.value);
  const rawWeight = parseFloat(document.getElementById('tdee-weight')?.value);
  const rawHeight = parseFloat(document.getElementById('tdee-height')?.value);
  const weight = isImperial() ? rawWeight / 2.205 : rawWeight;
  const height = isImperial() ? rawHeight * 2.54 : rawHeight;
  const errEl = document.getElementById('tdee-error');
  const resEl = document.getElementById('tdee-results');

  if (!age || !rawWeight || !rawHeight || age < 10 || weight < 20 || height < 100) {
    if (errEl) errEl.innerHTML = '<div class="tp-error">Please fill in all fields before calculating.</div>';
    if (resEl) resEl.innerHTML = '';
    return;
  }
  if (errEl) errEl.innerHTML = '';

  const calc = computeTDEETargets({
    weightKg: weight, heightCm: height, age, sex: _tdeeSex,
    activity: _tdeeActivity, goal: _tdeeGoal,
  });
  const bmr = calc.bmr, tdee = calc.tdee, target = calc.target;
  const protein_g = calc.protein, carbs_g = calc.carbs, fat_g = calc.fat;

  // Save profile
  tdeeProfile = { age, sex: _tdeeSex, weight_kg: weight, height_cm: height, activity: _tdeeActivity, goal: _tdeeGoal };
  LS.set('hvi_tdee_profile', tdeeProfile);

  resEl.innerHTML = `
    <div class="tp-result-box ani">
      <div class="tp-tdee-label">YOUR TDEE</div>
      <div class="tp-tdee-num">${tdee.toLocaleString()}</div>
      <div class="tp-tdee-unit">calories / day</div>

      <div class="s-grid" style="margin:16px 0 0">
        <div class="s-card"><div class="s-val">${Math.round(bmr).toLocaleString()}</div><div class="s-lbl">BMR</div></div>
        <div class="s-card"><div class="s-val">${tdee.toLocaleString()}</div><div class="s-lbl">TDEE</div></div>
        <div class="s-card"><div class="s-val">${target.toLocaleString()}</div><div class="s-lbl">Target</div></div>
      </div>

      <div class="sec-lbl" style="padding:20px 0 8px;text-align:left">Recommended Macros</div>
      <div class="tp-macro-grid">
        <div class="tp-macro-card"><div class="tp-macro-val" style="color:var(--cal)">${target.toLocaleString()}</div><div class="tp-macro-lbl">Calories</div></div>
        <div class="tp-macro-card"><div class="tp-macro-val" style="color:var(--pro)">${protein_g}g</div><div class="tp-macro-lbl">Protein</div></div>
        <div class="tp-macro-card"><div class="tp-macro-val" style="color:var(--carb)">${carbs_g}g</div><div class="tp-macro-lbl">Carbs</div></div>
        <div class="tp-macro-card"><div class="tp-macro-val" style="color:var(--fat)">${fat_g}g</div><div class="tp-macro-lbl">Fat</div></div>
      </div>
    </div>
    <button class="w-finish" onclick="applyTDEEGoals(${target},${protein_g},${carbs_g},${fat_g},'${_tdeeGoal}')">APPLY TO GOALS</button>
    <div id="tdee-confirm"></div>`;

  resEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// The calculator offers five goals; the rest of the app tracks three. Applying
// used to set the macro targets and leave goalType untouched, so choosing a
// mild cut set a deficit while the Diet screen still read MAINTAIN — and the
// adaptive recommendation, which reads goalType, then suggested eating back up
// to maintenance.
const _TDEE_GOAL_MAP = { cut: 'cut', cut_mild: 'cut', maintain: 'maintain', bulk_lean: 'bulk', bulk: 'bulk' };

function applyTDEEGoals(cal, p, c, f, goal) {
  dietMeta.dailyGoals = { calories: cal, protein: p, carbs: c, fat: f };
  if (goal && _TDEE_GOAL_MAP[goal]) dietMeta.goalType = _TDEE_GOAL_MAP[goal];
  LS.set('hvi_diet_meta', dietMeta);
  const el = document.getElementById('tdee-confirm');
  if (el) {
    el.innerHTML = '<div class="tp-confirm">\u2713 Goals updated</div>';
    setTimeout(() => { if (el) el.innerHTML = ''; }, 2000);
  }
}

// ── ADAPTIVE NUTRITION ACTIONS ────────────────────────────────────────────
function logWeight() {
  const val = parseFloat(document.getElementById('wt-input')?.value);
  if (!val || val < 20 || val > 300) return;
  weightLog[today()] = val;
  LS.set('hvi_weight_log', weightLog);
  if (window.Arete) window.Arete.emit('weight:logged', { value: val });
  go('diet');
}

function setGoalType(type) {
  dietMeta.goalType = type;
  LS.set('hvi_diet_meta', dietMeta);
  go('diet');
}

function applyAdaptiveTarget() {
  const tdee = computeTDEE(weightLog, mealLog);
  const adaptive = computeAdaptiveTarget(tdee, dietMeta.goalType || 'maintain', weightLog);
  if (!adaptive) return;
  dietMeta.dailyGoals.calories = adaptive.calories;
  dietMeta.dailyGoals.protein = adaptive.protein;
  LS.set('hvi_diet_meta', dietMeta);
  go('diet');
}

function renderDietTrend() {
  weightLog = LS.get('hvi_weight_log', {});
  const trend = computeTrend(weightLog);

  let chartHTML = '';
  if (trend.length < 3) {
    chartHTML = '<div class="dt-placeholder">Log your weight daily to see your trend.</div>';
  } else {
    const W = 320, H = 160, ML = 30, MB = 20;
    const cW = W - ML, cH = H - MB;
    const rawVals = trend.map(t => t.raw);
    const minW = Math.min(...rawVals) - 2, maxW = Math.max(...rawVals) + 2;
    const range = maxW - minW || 1;

    const x = i => ML + (i / (trend.length - 1)) * cW;
    const y = v => cH - ((v - minW) / range) * cH;

    const dots = trend.map((t, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(t.raw).toFixed(1)}" r="3" fill="var(--text-dim)" opacity="0.4"/>`).join('');
    const linePts = trend.map((t, i) => `${x(i).toFixed(1)},${y(t.ema).toFixed(1)}`).join(' ');
    const firstDate = trend[0].date.slice(5);
    const lastDate = trend[trend.length - 1].date.slice(5);

    chartHTML = `<div class="dt-chart ani">
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block">
        <line x1="${ML}" y1="${cH}" x2="${W}" y2="${cH}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
        <line x1="${ML}" y1="0" x2="${ML}" y2="${cH}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
        <text x="${ML}" y="${H - 4}" fill="var(--text-dim)" font-size="9">${firstDate}</text>
        <text x="${W}" y="${H - 4}" fill="var(--text-dim)" font-size="9" text-anchor="end">${lastDate}</text>
        <text x="${ML - 4}" y="12" fill="var(--text-dim)" font-size="9" text-anchor="end">${maxW.toFixed(1)}</text>
        <text x="${ML - 4}" y="${cH}" fill="var(--text-dim)" font-size="9" text-anchor="end">${minW.toFixed(1)}</text>
        ${dots}
        <polyline points="${linePts}" fill="none" stroke="var(--accent-b)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      </svg>
    </div>`;
  }

  document.getElementById('view').innerHTML = `
    <button class="back" onclick="go('diet')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg> Back</button>
    <div class="page-head ani"><div class="page-title">Weight Trend</div><div class="page-sub">Raw weights &amp; smoothed EMA trend.</div></div>
    ${chartHTML}`;
}
