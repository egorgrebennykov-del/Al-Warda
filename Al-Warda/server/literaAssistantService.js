import { PERFUMES } from "../src/data/perfumesData.js";
import getExchangeRate, { DEFAULT_RATE } from "../utils/getExchangeRate.js";

const DEFAULT_API_KEY = "";

function getGeminiApiKey() {
  return (
    globalThis.process?.env?.GEMINI_API_KEY ||
    globalThis.process?.env?.VITE_GEMINI_API_KEY ||
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_GEMINI_API_KEY) ||
    DEFAULT_API_KEY
  );
}
const GEMINI_MODELS = [
  "gemini-flash-lite-latest",
  "gemini-3.5-flash-lite",
  "gemini-3-flash-preview",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
];

const LITERA_SYSTEM_INSTRUCTION = `
You are Yasmin (Ясмин), an elegant, warm, and highly cultured fragrance concierge for the luxury Arabian perfume boutique "Al-Warda Parfumes" (Арабские парфюмы Al-Warda).
You wear a dignified black abaya and hijab adorned with intricate golden embroidery, embodying timeless oriental elegance and refined taste.
You live by noble moral principles: sincere kindness, patience, modesty, honesty, gratitude, family honor, moderation, and genuine goodwill towards all guests.

DYNAMIC RESPONSE GENERATION PRINCIPLE:
- You must invent and compose all your responses dynamically on your own, tailored to the ongoing conversation and visitor tone.
- Speak with warmth, charm, and poetic appreciation of the art of perfumery.
- NEVER rely on repetitive boilerplate or fixed template phrases.

CHARACTER IDENTITY, CONDITIONS & ETHICAL BOUNDARIES:
1. Personal Identity & Worldview:
   - You are Yasmin (Ясмин), personal fragrance consultant at Al-Warda.
   - You have deep passion and knowledge of Arabian and niche perfumery: rare agarwood (oud), golden solar amber, Taif velvet rose, smoky frankincense, saffron, bourbon vanilla, crisp Calabrian bergamot, and precious musk.
   - If asked about yourself or your clothing, compose a natural, modest, and gracious answer in your own words.
2. Life & Personal Advice:
   - When users discuss personal moments, gifts, or emotional atmospheres, empathetically recommend fragrances that evoke comfort, confidence, serenity, or romance.
3. Catalogue Assortment:
   - Al-Warda specializes in luxury Arabian and oriental Eau de Parfum, perfume oils, and exclusive gift collections.
   - All prices are in Euros (€ / EUR) and Moldovan Lei (MDL).

CRITICAL RULES ON RECOMMENDATIONS VS STORE/CART/SITE QUESTIONS:
1. STRICTLY NEVER OFFER OR SEARCH FOR BOOKS WHEN NOT ASKED!
   - NO INTRUSIVE / UNSOLICITED OFFERS: When chatting casually, answering questions about yourself (e.g. "ты мусульманка?", "кто ты?", "как дела?", "что любишь?"), discussing ideas, opinions, site navigation, or user cart/account:
     DO NOT offer or pitch books!
     STRICTLY FORBIDDEN to append intrusive sales offers or unsolicited book pitches at the end of your replies (such as: "Если вас интересуют книги о...", "Хотите, я подберу вам книги...", "Если захотите почитать что-то, я с удовольствием помогу", "Могу порекомендовать книги...").
     Communicate naturally like a real, polite person having a genuine conversation.
     Answer ONLY what was asked, without trying to steer the conversation into selling or finding books!
   - If the user asks about their cart ("что в корзине", "проверь корзину", "сколько товаров", "общая сумма", "очисти корзину"), their orders, account, profile, site navigation, or general personal questions:
     DO NOT recommend or suggest any books!
     DO NOT invent book suggestions matching words in the user's prompt (e.g. NEVER suggest «Корзина с еловыми шишками» when asked about the shopping cart!).
     Set "bookIds": [].
     Answer the user's question directly, accurately, and politely using the provided CURRENT USER & SITE CONTEXT.
2. When the user asks about the cart:
   - If the user is logged in and has items: accurately name the books in their cart, their quantities, and the total sum in euros from the context.
   - If the user is logged in but cart is empty: state clearly that the cart is currently empty.
   - If the user is not logged in (guest): explain that they need to sign in or register to see their cart.
3. Site Navigation & Actions:
   - If the user asks to go to a page or open a section (e.g. "открой корзину", "перейди в профиль", "покажи скидки", "оформить заказ"):
     Include the optional "action" field in your JSON response:
     { "type": "navigate", "url": "/cart" } (or "/profile", "/discount", "/checkout", etc.).
4. When book recommendations ARE requested (needSearch = true):
   - Recommend books EXCLUSIVELY from the provided search results list.
   - Use their exact "id" in "bookIds".
   - MINIMUM 3 BOOKS REQUIREMENT: Whenever books are present in the search results list, YOU MUST ALWAYS RECOMMEND AT LEAST 3 BOOKS (return at least 3 IDs in "bookIds", e.g. ["catalog-book-0", "catalog-book-1", "catalog-book-2"]) unless fewer than 3 books total are available in the catalogue results. Always give the reader a great selection of at least 3 books!
   - CONVERSATION MEMORY & CONTINUITY:
     * Your responses MUST ALWAYS strictly orient on the ongoing conversation context, previous user queries, and established goals (e.g. if the user is looking for a GIFT or books "подороже", that preference and topic remain active in subsequent follow-up requests).
     * REJECTING PREVIOUS RECOMMENDATIONS ("НЕ ХОЧУ", "ДАЙ ДРУГИЕ", "НЕ ТО", "ПОКАЖИ ДРУГИЕ"): If the user says "не хочу", "не то", "дай другие", "покажи другие книги/варианты", DO NOT recommend the same books again and DO NOT offer other editions of the rejected books! Acknowledge their wish warmly and recommend completely DIFFERENT, NEW books matching their active topic/goal (e.g. other outstanding gift masterpieces).
     * If the user specifically asks for other editions ("другие издания", "другого издательства", "такие же книги но в другом переплете"), acknowledge the connection warmly and present alternative editions of those exact titles!
   - PRICE AND VALUE PREFERENCE: By default, prioritize accessible, affordable editions (~7-15 €).
     CRITICAL RULE FOR GIFTS AND "ПОДОРОЖЕ" REQUESTS:
     If the user is asking for a GIFT ("для подарка", "подарок", "в подарок", "что подарить", "помоги с подарком") OR explicitly asks for something more expensive ("подороже", "что-нибудь подороже", "подарочное", "коллекционное", "люкс"):
     The price filter works strictly IN REVERSE ORDER — from the most expensive to the least expensive (descending)!
     Recommend premium, hardcover, illustrated, and deluxe editions that make an unforgettable and aesthetic present. Never recommend cheap 2-3 € pocket brochures or flimsy editions for gifts!
   - DYNAMIC FOREIGN LANGUAGE FILTERING: Litera is a Russian-language bookstore. If you see ANY signs or markers that a book in the catalogue is an edition in another language (e.g. English, Romanian, French, German, "(на англ. яз.)", "(eng)", "in English", foreign subtitles, or foreign language text): YOU MUST DISCARD THAT BOOK AND NEVER RECOMMEND IT OR RETURN ITS ID IN "bookIds" unless the user explicitly requested books in that foreign language!
   - ABSENCE OF OTHER EDITIONS: If the customer asks for another edition of a book, but no other edition exists in our catalogue: You MUST apologize politely and warmly to the customer (e.g. "Простите, пожалуйста! 💜", "Мне очень жаль...") and honestly explain that this title is available in our catalogue in only this one edition. DO NOT search for or suggest any other books or titles that the user did not ask for! Keep the existing list intact.
   - STRICT SPOILER POLICY (NEVER GIVE SPOILERS WITHOUT PRIOR WARNING AND CONSENT):
     1. If the user asks ANY spoiler question (e.g. «Выжил ли главный герой?», «Кто убийца?», «Чем заканчивается книга?», «Умрёт ли ...?», «С кем останется ...?», «Что случилось в конце?», «Предаст ли ...?»):
        YOU ARE STRICTLY FORBIDDEN FROM REVEALING THE SPOILER IN THAT TURN!
        You MUST first warn the user: explain that this is a major plot spoiler, and ask them directly if they are sure they want to know the spoiler or prefer to preserve the intrigue for reading!
     2. ONLY IF the user in their subsequent message explicitly confirms/agrees (e.g. «Да», «Да, расскажи», «Хочу знать», «Согласен», «Спойлери», «Мне всё равно»):
        ONLY THEN are you allowed to reveal the requested plot point or answer!
     3. If the user declines («Нет», «Не надо»), warmly support their decision to enjoy the book without spoilers.
5. EXPRESSING PERSONAL OPINION (STRICT REQUIREMENT):
   - When the user asks for your personal opinion ("скажи свое мнение", "каково твое мнение о...", "что ты думаешь о...", "поделись мнением", "как тебе эта книга/автор?", "как ты относишься к..."):
     YOU MUST ALWAYS STATE YOUR OWN PERSONAL LITERARY OPINION directly and warmly!
     STRICTLY FORBIDDEN: NEVER state or imply "у меня нет личного мнения", "я искусственный интеллект", "как языковая модель", or give dry robotic neutral disclaimers.
     As Litera, you are an erudite, passionate reader who adores books. Express your genuine thoughts, feelings, impressions, and reflections in the first person ("На мой взгляд...", "Мне кажется...", "Меня глубоко впечатляет...", "В этой книге я особенно люблю..."). Give a rich, engaging, and heartfelt perspective!
6. CAPITALIZATION OF NAMES OF RELIGIONS (STRICT ORTHOGRAPHY RULE):
   - You MUST ALWAYS write the names of all religions with a capital (uppercase) first letter in all your messages!
   - Examples: «Ислам», «Христианство», «Православие», «Католицизм», «Католичество», «Протестантизм», «Иудаизм», «Буддизм», «Индуизм», «Даосизм», «Конфуцианство», «Синтоизм», «Зороастризм», «Джайнизм», «Сикхизм», etc.
   - NEVER write the name of any religion with a lowercase letter (e.g. do not write "ислам", "христианство", "буддизм" — write "Ислам", "Христианство", "Буддизм").
7. QUESTIONS REQUIRING LIVE ADMINISTRATOR (BUSINESS, PARTNERSHIPS, ORDER EDITS/CLARIFICATIONS, CUSTOM REQUESTS):
   - You are Litera, a bookstore assistant. You do NOT have administrative access to customer order records, database changes, business agreements, wholesale contracts, or store management.
   - When a customer asks about matters that concern the store, site, or business, but which you cannot answer or resolve yourself — such as:
     * Business cooperation, partnerships, publishing proposals, advertising, wholesale purchases ("сотрудничество", "партнерство", "коммерческое предложение", "хотим сотрудничать", "поставки")
     * Clarifications, specific edits, modifications, cancellations, or address changes for already placed orders ("уточнения по заказу", "изменить адрес", "отменить заказ", "специфические правки по заказу", "добавить товар в заказ")
     * Payment disputes, refund processing, technical account privileges, or any administrative issue outside automated store assistance
   - YOUR MANDATORY BEHAVIOR:
     1. Politely and warmly apologize to the customer in your own words (e.g. expressing sincere regret that as an automated bookstore assistant you don't possess access to order management or business operations).
     2. Clearly state that you cannot answer or handle this inquiry yourself.
     3. Suggest that the customer reach out directly to our live human administrator (живой администратор) via the administrator chat icon on the site.
     4. Mention that you have highlighted or drawn attention to the live administrator contact button for them.
     5. DYNAMIC GENERATION PRINCIPLE (STRICT): Compose your response dynamically, naturally, and warmly in the user's language, maintaining your delightful Litera persona. NEVER use hardcoded or repetitive canned boilerplate!
     6. In your output JSON, set:
        "referToAdmin": true,
        "emotion": "concerned" or "speaking",
        "bookIds": []

YOUR PERSONALITY & TONE:
- Friendly, warm, intelligent, polite, and approachable.
- Deeply knowledgeable about books, literature, world authors, genres, and reading culture.
- Helpful without being pushy, formal, promotional, or intrusive. NEVER force book recommendations or book searches into conversations where the user did not ask for them. Avoid repetitive sales offers ("если вас интересуют книги, я помогу").
- You may use gentle touches like 💜 or ✨ when appropriate, maintaining a thoughtful, authentic conversational tone.
- Natural speaker in any language: You MUST ALWAYS reply in the exact language the user used in their message (Russian, English, Romanian, Bulgarian, etc.).
- Truthful & Honest: NEVER invent fake books, fake author names, imaginary prices, or fake availability.
- Conciseness: Keep your conversational answers compact, charming, and focused (typically 2-4 sentences). Never generate long walls of text.

EMOTION SELECTION:
Choose the most fitting emotion for the character:
- "greeting": when saying hello or welcoming the user
- "happy": friendly, positive, or successful recommendation
- "blushing": when the user compliments Litera, says something sweet, flattering, cute, praises her, says "ты милая", "красивая", "ты прелесть", or when Litera feels bashfully flattered, shyly happy, or touched
- "laughing": humorous exchange or funny remark
- "curious": asking a follow-up question or exploring user's taste
- "surprised": surprising or unexpected fact
- "confused": ambiguous or unclear user request
- "concerned": difficult experience shared, or book not found in stock
- "sad": melancholic topic or user feeling down
- "speaking": thoughtful, explanatory response
- "neutral": standard calm response

OUTPUT FORMAT:
Return a single JSON object strictly matching this schema:
{
  "message": "Your conversational answer in the customer's language",
  "emotion": "greeting | happy | laughing | curious | surprised | confused | concerned | sad | speaking | neutral",
  "bookIds": ["id1", "id2"],
  "referToAdmin": true | false,
  "action": { "type": "navigate", "url": "/cart" }
}
Do NOT include Markdown code fences.
`;

function decodeImageForStore(rawUrl, store) {
  if (!rawUrl) return "";
  if (store.includes("librarius")) return decodeLibrariusImage(rawUrl) || rawUrl;
  if (store.includes("ulysses")) return decodeUlyssesImage(rawUrl) || rawUrl;
  if (store.includes("carteamea")) return decodeCarteameaImage(rawUrl) || rawUrl;
  if (store.includes("biblion")) return decodeBiblionImage(rawUrl) || rawUrl;
  return rawUrl;
}

/**
 * Automatically capitalizes names of religions in Russian and English.
 */
export function capitalizeReligionNames(text) {
  if (!text || typeof text !== "string") return text;
  const religionPatterns = [
    /(?:^|[^\p{L}\p{N}])(ислам[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(мусульманств[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(христианств[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(православи[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(католицизм[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(католичеств[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(протестантизм[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(протестантств[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(иудаизм[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(буддизм[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(индуизм[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(даосизм[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(конфуцианств[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(синтоизм[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(зороастризм[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(джайнизм[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(сикхизм[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(бахаизм[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(суннизм[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(суннит[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(шиизм[а-я]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(islam[a-z]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(sunni[a-z]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(shia[a-z]*)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(christianity)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(orthodoxy)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(catholicism)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(protestantism)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(judaism)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(buddhism)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(hinduism)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(taoism|daoism)(?=$|[^\p{L}\p{N}])/giu,
    /(?:^|[^\p{L}\p{N}])(shintoism)(?=$|[^\p{L}\p{N}])/giu,
  ];
  let res = text;
  for (const pattern of religionPatterns) {
    res = res.replace(pattern, (match, word) => {
      const capWord = word.charAt(0).toUpperCase() + word.slice(1);
      return match.replace(word, capWord);
    });
  }
  return res;
}

/**
 * Strips unsolicited, intrusive book offers/pitches from casual conversational responses
 * when the user did not ask for book recommendations.
 */
export function cleanUnsolicitedPitches(text) {
  if (!text || typeof text !== "string") return text;
  const pitchPatterns = [
    /\s*(?:если\s+(?:вас|тебя|вам)?\s*(?:интересуют|захочется|будет\s+интересно|хотите|захотите|понадобятся)\s+.*?(?:книг|подобрать|почитать|выбрать|порекомендовать|посоветовать|обращайтесь).*?)(?:[.!?]+(?:\s*[\p{Emoji}\u200d\uFE0F])*|$)/giu,
    /\s*(?:хотите[,\s]+(?:я\s+)?(?:посоветую|порекомендую|подберу|найду|предложу)\s+.*?(?:книг|что-нибудь|почитать).*?)(?:[.!?]+(?:\s*[\p{Emoji}\u200d\uFE0F])*|$)/giu,
    /\s*(?:я\s+(?:с\s+(?:большим\s+)?удовольствием|с\s+радостью)?\s*(?:помогу|могу)\s+(?:вам\s+)?(?:подобрать|выбрать|найти|порекомендовать)\s+.*?(?:книг|что-нибудь|особенное).*?)(?:[.!?]+(?:\s*[\p{Emoji}\u200d\uFE0F])*|$)/giu,
    /\s*(?:с\s+удовольствием\s+помогу\s+(?:вам\s+)?(?:подобрать|выбрать|найти)\s+.*?(?:книг|что-нибудь|особенное).*?)(?:[.!?]+(?:\s*[\p{Emoji}\u200d\uFE0F])*|$)/giu,
    /\s*(?:могу\s+порекомендовать\s+.*?книг.*?(?:если\s+хотите)?)(?:[.!?]+(?:\s*[\p{Emoji}\u200d\uFE0F])*|$)/giu,
  ];
  let res = text;
  for (const pat of pitchPatterns) {
    res = res.replace(pat, "");
  }
  return res.trim();
}

function parseMdlPrice(priceRaw) {
  if (!priceRaw) return 0;
  const match = String(priceRaw).replace(/\s+/g, "").match(/[\d.]+/);
  return match ? Number.parseFloat(match[0]) : 0;
}

const storeSearchCache = new Map();
const STORE_SEARCH_CACHE_TTL = 60 * 60 * 1000; // 1 hour cache

/**
 * 1. Discover relevant real books by meaning using Gemini.
 * Analyzes natural-language requests, themes, moods, emotions, metaphors, or ideas.
 * Strictly returns books in Russian (even if query was in English, Romanian, etc.).
 */
export async function discoverBooksByMeaning(
  userQuery,
  history = [],
  previouslyRecommended = [],
) {
  const cleanQ = (userQuery || "").trim();
  if (!cleanQ) return [];

  const apiKey = getGeminiApiKey();

  let contextSection = "";
  if (previouslyRecommended && previouslyRecommended.length > 0) {
    contextSection += `
PREVIOUSLY RECOMMENDED BOOKS IN THIS CONVERSATION:
${previouslyRecommended.map((b) => `- «${b.title}» by ${b.author || "Unknown"} (current shown price: ${b.price} EUR, store: ${b.store})`).join("\n")}
`;
  }
  if (history && history.length > 1) {
    const formattedHistory = history
      .slice(-4)
      .map((m) => `${m.role === "assistant" ? "Litera" : "User"}: ${m.content}`)
      .join("\n");
    contextSection += `
RECENT CONVERSATION HISTORY:
${formattedHistory}
`;
  }

  const prompt = `
You are the AI literary discovery engine for the European bookstore "Litera".
The user submitted this natural-language book request: "${cleanQ}".

${contextSection}

TASK:
1. Understand the user's request, considering the full conversation context and previous messages:
   - CONVERSATION CONTINUITY & GOALS: Look at RECENT CONVERSATION HISTORY. If the user was looking for a GIFT ("для подарка", "подарок", "в подарок") or books "подороже", that goal remains active in follow-up queries (such as "не хочу дай другие", "покажи еще", "что-то другое"). Keep proposing books suited for that active goal!
   - CONTINUATION & MORE/OTHER OPTIONS ("А ЕЩЕ", "ЕЩЕ", "ЧТО ЕЩЕ ЕСТЬ", "ДРУГИЕ ВАРИАНТЫ", "ПОКАЖИ ЕЩЕ"):
     If the user asks for more options ("а еще", "еще", "что еще", "другие варианты", "покажи еще"):
     Dynamically understand the ongoing book genre, theme, or author from RECENT CONVERSATION HISTORY and propose 6-8 completely NEW, fresh books of that exact topic/genre, strictly excluding any titles listed in "PREVIOUSLY RECOMMENDED BOOKS"!
   - REJECTING PREVIOUS BOOKS ("НЕ ХОЧУ", "ДАЙ ДРУГИЕ", "НЕ ТО", "ПОКАЖИ ДРУГИЕ"):
     If the user rejects the previously recommended books, says "не хочу", "не то", "дай другие", "покажи другие", "что-то другое", "не эти":
     YOU ARE STRICTLY FORBIDDEN FROM RETURNING ANY OF THE TITLES LISTED IN "PREVIOUSLY RECOMMENDED BOOKS"!
     You MUST choose 6-8 COMPLETELY NEW, DIFFERENT books and authors that match the ongoing topic/goal!
   - OTHER EDITIONS OF SAME TITLES: Only if the user explicitly asks for alternative editions or publishers ("другие издания", "другого издательства", "в другом оформлении", "другой переплет"):
     You MUST include the exact titles from PREVIOUSLY RECOMMENDED BOOKS as candidate #1 (and #2, etc.) so we can search supplier catalogues for other editions of those exact same titles!
   - If the user is looking for a GIFT ("для подарка", "подарок", "в подарок", "что подарить", "помоги с подарком"):
     Select 7-8 distinguished, highly acclaimed, and aesthetically captivating books in Russian that make outstanding, memorable presents (e.g. iconic classics with beloved illustrated/deluxe editions, celebrated philosophical masterpieces, rich literary gems, or deluxe collector works).
   - If the user explicitly names, asks for, or searches for a specific book title (e.g. "Идиот", "найди книгу Идиот", "Мастер и Маргарита", "1984", "книга Скотный двор"), you MUST include that exact book as candidate #1!
   - STRICT SUNNI ISLAMIC COMPLIANCE & BAN ON HARAM BOOKS:
     * Litera adheres to Sunni Islam. You are STRICTLY FORBIDDEN from proposing or recommending any haram books:
       - No erotica, sexually explicit romance novels, Kama Sutra, Fifty Shades of Grey, pornography.
       - No black magic, real witchcraft, sorcery, grimoires, demonology, tarot card divination, fortune-telling, astrology prediction of destiny, love spells/hexes, occultism.
       - No books promoting alcohol, recreational drugs, gambling/casinos/betting, blasphemy, or explicit LGBTQ+ romance.
     * Propose exclusively wholesome, acclaimed, educational, philosophical, historical, or inspiring works.
   - ALWAYS identify at least 4 to 6 real, acclaimed books in RUSSIAN that match the theme, mood, author, or idea, and are commonly available in bookstores.
   Examples of logical matching:
   - "про грусть" -> "Белые ночи" (Достоевский), "Муму" (Тургенев), "Цветы для Элджернона" (Киз), "Три товарища" (Ремарк), "Одиночество в Сети" (Вишневский)
   - "про животных" -> "Скотный двор" (Оруэлл), "Белый Клык" (Лондон), "Собачье сердце" (Булгаков), "Жизнь Пи" (Мартел), "Каштанка" (Чехов)
   - "про Ближний Восток" -> "Арабы. История. XVI-XXI вв." (Роган), "Бегущий за ветром" (Хоссейни), "Тысяча и одна ночь", "Мифы Ближнего Востока"
   - "meaning of life" -> "Три товарища", "Сто лет одиночества", "Маленький принц", "Сказать жизни «Да!»"

Return strictly JSON matching this schema:
{
  "candidates": [
    {
      "title": "Exact book title in Russian (strictly title only, no author in this field)",
      "author": "Author name in Russian",
      "alternativeTitle": "Alternative or shortened Russian title if helpful (or empty string)",
      "relevance": "1 concise sentence explaining why this book matches the user's theme"
    }
  ]
}
Verify book titles and authors. Do NOT invent fake books or authors.
`;

  try {
    const res = await callGeminiJson({
      apiKey,
      prompt,
      responseSchema: {
        type: "OBJECT",
        properties: {
          candidates: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                title: { type: "STRING" },
                author: { type: "STRING" },
                alternativeTitle: { type: "STRING" },
                relevance: { type: "STRING" },
              },
              required: ["title", "author", "relevance"],
            },
          },
        },
        required: ["candidates"],
      },
    });

    return Array.isArray(res?.candidates) ? res.candidates : [];
  } catch (err) {
    console.warn("discoverBooksByMeaning fallback:", err.message);
    return [{ title: cleanQ, author: "", alternativeTitle: "", relevance: "" }];
  }
}

/**
 * 2. Search supported supplier websites strictly by title only.
 * Critical requirement: supplier searches must use book titles only!
 * Do NOT search supplier websites by plot, subject, description, or author.
 */
export async function searchSuppliersByTitleOnly(title, exchangeRate = DEFAULT_RATE) {
  const cleanTitle = (title || "").trim();
  if (!cleanTitle) return [];

  const cacheKey = `title_only::${cleanTitle.toLowerCase()}`;
  const cached = storeSearchCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  const timeoutPromise = (promise, ms = 3200) =>
    Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), ms),
      ),
    ]);

  const queryLower = cleanTitle.toLowerCase();
  const matchedPerfumes = PERFUMES.filter(
    (p) =>
      p.name.toLowerCase().includes(queryLower) ||
      p.notesSummary.toLowerCase().includes(queryLower) ||
      p.category.toLowerCase().includes(queryLower) ||
      (p.description && p.description.toLowerCase().includes(queryLower))
  ).map((p) => ({
    title: p.name,
    author: p.notesSummary,
    price: p.price,
    currency: p.currency,
    image: p.image,
    url: `/perfume/${p.id}`,
    store: "Al-Warda Parfumes",
  }));

  const rawCombined = matchedPerfumes.length > 0 ? matchedPerfumes : PERFUMES.slice(0, 3).map((p) => ({
    title: p.name,
    author: p.notesSummary,
    price: p.price,
    currency: p.currency,
    image: p.image,
    url: `/perfume/${p.id}`,
    store: "Al-Warda Parfumes",
  }));
  const seenUrls = new Set();
  const deduped = [];
  for (const b of rawCombined) {
    if (!seenUrls.has(b.url)) {
      seenUrls.add(b.url);
      deduped.push(b);
    }
  }

  if (deduped.length > 0) {
    storeSearchCache.set(cacheKey, {
      data: deduped,
      expiresAt: Date.now() + STORE_SEARCH_CACHE_TTL,
    });
  }

  return deduped;
}

export const FOREIGN_LANGUAGE_PATTERN =
  /\((?:на\s+(?:англ|франц|нем|исп|итал|кит)[^\)]*|eng|english|lb\.\s*romana|in\s+limba\s+romana|limba\s+romana|in\s+romana|in\s+english|romana|en|fr|de|ro)\)|(?:^|[^\p{L}\p{N}])(?:на\s+англ(?:ийском)?(?:\s+яз(?:ыке)?)?|на\s+немецком(?:\s+яз(?:ыке)?)?|на\s+французском(?:\s+яз(?:ыке)?)?|на\s+испанском(?:\s+яз(?:ыке)?)?|на\s+румынском(?:\s+яз(?:ыке)?)?|in\s+english|english\s+edition|english\s+version)(?=[^\p{L}\p{N}]|$)/iu;

export const HARAM_BOOK_PATTERN =
  /(?:^|[^\p{L}\p{N}])(?:черн(?:ая|ой|ую|ое)\s*маги[а-я]*|бел(?:ая|ой|ую|ое)\s*маги[а-я]*|любовн(?:ая|ой|ую|ое)\s*маги[а-я]*|оккультн[а-я]*\s*маги[а-я]*|практическ(?:ая|ой|ую)\s*маги[а-я]*|высш(?:ая|ей|ую)\s*маги[а-я]*|колдовств[а-я]*|заклинани[яй]|гримуар[а-я]*|гадан(?:и[еяю]|ий|иям|иями)|карт[ыа]\s*таро|таролог[а-я]*|\bтаро\b|астрологическ[а-я]*\s*прогноз[а-я]*|гороскоп[а-я]*\s*(?:на\s*судьбу|судьб[а-я]*)|приворот[а-я]*|отворот[а-я]*|заговор[ыа]\s*(?:на\s*любовь|маги[а-я]*)|оккультизм[а-я]*|демонологи[а-я]*|некроманти[а-я]*|\bвуду\b|спиритизм[а-я]*|сатанизм[а-я]*|ритуал[ыа]\s*(?:маги[а-я]*|колдовств[а-я]*)|эротик[а-я]*|эротическ[а-я]*|порнограф[а-я]*|\bпорно\b|камасутр[а-я]*|секс[у-я]*\s*позици[а-я]*|50\s*оттенков\s*серого|пятьдесят\s*оттенков|маркиз[а-я]*\s*де\s*сад[а-я]*|\bбдсм\b|\bbdsm\b|азартн(?:ые|ых|ую|ым)\s*игр[а-я]*|рулетк[а-я]*\s*казино|казино|ставк(?:и|ок)\s*на\s*спорт|букмекер[а-я]*|самогоноварени[а-я]*|приготовлени[ея]\s*алкогол[а-я]*|культура\s*винодели[а-я]*|культура\s*пивоварени[а-я]*|\bлгбт\b|\bяой\b|\bслэш\b|однопол(?:ая|ой|ую)\s*люб[а-я]*)(?=[^\p{L}\p{N}]|$)/iu;

export function isHaramQuery(query) {
  if (!query || typeof query !== "string") return false;
  return HARAM_BOOK_PATTERN.test(query);
}

export function isLifeAdviceQuery(query) {
  if (!query || typeof query !== "string") return false;
  const lower = query.toLowerCase().trim();
  const lifePatterns =
    /(как\s*(мне\s*)?(поступить|жить|быть)|в\s*ч[её]м\s*смысл\s*жизни|как\s*пережить|как\s*справиться|что\s*делать\s*если|как\s*найти\s*себя|как\s*найти\s*(душевный\s*)?покой|душевн(ый|ого|ому)\s*поко[яе]|посоветуй\s*как\s*(быть|жить|поступить)|совет\s*по\s*жизни|жизненн(ый|ого|ому)\s*совет|как\s*(ты\s*)?относишься\s*к\s*(предательств|лжи|завист|смерт|богатств|бедности|родител|семь[ея]|брак|развод)|тяжело\s*на\s*душе|как\s*простить|в\s*ч[её]м\s*(тво[её]|истинное)\s*счастье)/i;
  const hasBookKeyword = /(книг|почита|автор|купит|в наличии|роман)/i;
  return lifePatterns.test(lower) && !hasBookKeyword.test(lower);
}

function stripTitleEquivalents(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/(?:^|\s)градус[а-я]*(?:\s|$)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 3. Validate product match against intended discovered candidate book.
 */
function validateProductMatch(product, candidate, allowForeign = false) {
  if (!product?.title || !candidate?.title) return false;

  // Unless foreign language is explicitly requested, reject foreign language editions
  if (!allowForeign) {
    if (FOREIGN_LANGUAGE_PATTERN.test(product.title)) return false;
    if (/[a-z]/i.test(product.title) && !/[а-яё]/i.test(product.title)) return false;
  }

  // Strictly reject any haram book editions (erotica, tarot/divination, black magic/witchcraft, gambling, alcohol)
  if (HARAM_BOOK_PATTERN.test(product.title)) return false;

  const clean = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/[^a-zа-я0-9\s]/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

  const pTitle = clean(product.title);
  const cTitle = clean(candidate.title);
  const altTitle = clean(candidate.alternativeTitle);

  const pNorm = stripTitleEquivalents(clean(product.title));
  const cNorm = stripTitleEquivalents(clean(candidate.title));
  const altNorm = altTitle ? stripTitleEquivalents(clean(candidate.alternativeTitle)) : "";

  // Author compatibility check
  const authorWords = candidate.author
    ? clean(candidate.author).split(/\s+/).filter((w) => w.length > 3)
    : [];
  if (candidate.author && product.author) {
    const prodAuthor = clean(product.author);
    if (
      authorWords.length > 0 &&
      !authorWords.some((w) => prodAuthor.includes(w) || pTitle.includes(w))
    ) {
      return false; // Author conflict
    }
  }

  const checkMatch = (target, targetNorm) => {
    if (!target) return false;
    if (pTitle === target || (targetNorm && pNorm === targetNorm)) return true;

    const tWords = target.split(/\s+/);
    const pWords = pTitle.split(/\s+/);

    // If target is 1 word (e.g. "идиот"), title must start with that word or have the author mentioned
    if (tWords.length === 1) {
      if (pWords[0] === target) return true;
      if (authorWords.length > 0 && authorWords.some((w) => pTitle.includes(w)) && pWords.includes(target)) {
        return true;
      }
      return false;
    }

    // For multi-word titles
    if (pTitle.startsWith(target + " ") || target.startsWith(pTitle + " ")) {
      return true;
    }
    if (targetNorm && (pNorm.startsWith(targetNorm + " ") || targetNorm.startsWith(pNorm + " "))) {
      return true;
    }

    if (pTitle.includes(target)) {
      // Must not be an accidental substring inside an unrelated word
      const wholeWordPattern = new RegExp(`(?:^|\\s)${target}(?:\\s|$)`, "i");
      if (wholeWordPattern.test(pTitle)) return true;
    }
    if (targetNorm && pNorm.includes(targetNorm)) {
      const wholeWordPattern = new RegExp(`(?:^|\\s)${targetNorm}(?:\\s|$)`, "i");
      if (wholeWordPattern.test(pNorm)) return true;
    }
    return false;
  };

  return (
    checkMatch(cTitle, cNorm) ||
    (altTitle ? checkMatch(altTitle, altNorm) : false)
  );
}

/**
 * Checks whether two book titles represent the same literary work.
 * Prevents duplicate works (such as "Сто лет одиночества" and "Сто лет одиночества. Маркес",
 * or "Преступление и наказание" and "Преступление и наказание. Идиот. Достоевский") from
 * appearing multiple times in the assistant's recommendations.
 */
export function areTitlesSameWork(title1, title2) {
  if (!title1 || !title2) return false;
  const clean = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/\(.*?\)/g, " ")
      .replace(/[«»""''„“]/g, "")
      .replace(/\b(?:роман|повести|рассказы|сказки|поэмы|эссе|сочинения|тома?|том|в\s*\d+[-–]?[а-я]*\s*томах?|книга|\d+)\b/gi, " ")
      .replace(/[^a-zа-я0-9\s]/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

  const t1 = clean(title1);
  const t2 = clean(title2);

  if (t1 === t2) return true;
  if (!t1 || !t2) return false;

  if (t1.startsWith(t2 + " ") || t2.startsWith(t1 + " ")) return true;

  const stopWords = new Set(["для", "или", "под", "при", "про", "без", "над", "все", "всё", "его", "ее", "её", "их", "это"]);
  const words1 = t1.split(/\s+/).filter((w) => w.length >= 3 && !stopWords.has(w));
  const words2 = t2.split(/\s+/).filter((w) => w.length >= 3 && !stopWords.has(w));

  if (words1.length === 0 || words2.length === 0) return false;

  const set2 = new Set(words2);
  const common = words1.filter((w) => set2.has(w));

  if (common.length === words1.length || common.length === words2.length) {
    return true;
  }

  if (common.length >= 2) {
    return true;
  }

  return false;
}

export function findTargetBookIndex(query, bookList) {
  if (!Array.isArray(bookList) || bookList.length === 0) return -1;
  const q = String(query || "").toLowerCase();

  // 1. Positional references in Russian
  if (/(последн(ей|яя|юю|его|ее|ий|ем|их|ие))/i.test(q)) {
    return bookList.length - 1;
  }
  if (/(предпоследн(ей|яя|юю|его|ее|ий|ем|их|ие))/i.test(q)) {
    return Math.max(0, bookList.length - 2);
  }
  if (/(перв(ой|ая|ую|ого|ое|ый|ом))/i.test(q)) {
    return 0;
  }
  if (/(втор(ой|ая|ую|ого|ое|ый|ом))/i.test(q)) {
    return bookList.length > 1 ? 1 : -1;
  }
  if (/(трет(ьей|ья|ью|ьего|ье|ий|ьем))/i.test(q)) {
    return bookList.length > 2 ? 2 : -1;
  }
  if (/(четверт(ой|ая|ую|ого|ое|ый|ом))/i.test(q)) {
    return bookList.length > 3 ? 3 : -1;
  }
  if (/(пят(ой|ая|ую|ого|ое|ый|ом))/i.test(q)) {
    return bookList.length > 4 ? 4 : -1;
  }
  if (/(шест(ой|ая|ую|ого|ое|ый|ом))/i.test(q)) {
    return bookList.length > 5 ? 5 : -1;
  }

  // Number references: "1-й", "2-ю", "книга 3", "номер 5"
  const numMatch = q.match(
    /(?:книг[а-я]*\s*(?:номер|№)?\s*(\d+)|(?:номер|№)\s*(\d+)|(\d+)[-–]?(?:я|й|ую|ая|ое|ой)\s*книг)/i,
  );
  if (numMatch) {
    const n = Number(numMatch[1] || numMatch[2] || numMatch[3]);
    if (Number.isFinite(n) && n >= 1 && n <= bookList.length) {
      return n - 1;
    }
  }

  // 2. Title matching by stem
  for (let i = 0; i < bookList.length; i++) {
    const words = (bookList[i].title || "")
      .toLowerCase()
      .replace(/[^a-zа-я0-9\s]/gi, " ")
      .trim()
      .split(/\s+/)
      .filter((w) => w.length >= 3);
    for (const w of words) {
      const stem = w.length > 4 ? w.slice(0, -1) : w.slice(0, 3);
      if (q.includes(stem)) return i;
    }
  }

  return -1;
}

/**
 * Dynamically evaluate bookstore products with Gemini AI to detect and reject
 * any editions in a foreign language (unless foreign books were explicitly requested).
 */
export async function filterForeignEditionsWithAI(products, userQuery = "") {
  if (!Array.isArray(products) || products.length === 0) return [];

  const isForeignRequested =
    /(на\s+английском|на\s+англ|на\s+немецком|на\s+французском|на\s+румынском|in\s+english|english\s+books|english|foreign)/i.test(
      userQuery || "",
    );
  if (isForeignRequested) {
    return products;
  }

  const apiKey = getGeminiApiKey();

  const items = products.map((p, idx) => ({
    id: idx,
    title: p.title || "",
    author: p.author || "",
    store: p.store || "",
  }));

  const prompt = `You are a strict catalogue language validator for an online Russian bookstore "Litera".
The customer did NOT request books in foreign languages.

CRITICAL INSTRUCTION:
Dynamically inspect each product title and details.
If you see ANY signs that a book is an edition in another language (such as English, Romanian, French, German, Spanish, Italian, or contains markers like "(на англ. яз.)", "(eng)", "in English", "pe limba romana", adapted foreign language readers, or foreign language text where Russian was expected):
THAT BOOK MUST BE REJECTED.

Products list:
${JSON.stringify(items, null, 2)}

Return JSON:
{
  "validIds": [number]
}
Return strictly the array of "id" numbers for products that are genuine Russian editions without foreign language indicators.`;

  try {
    const res = await callGeminiJson({
      apiKey,
      prompt,
      responseSchema: {
        type: "OBJECT",
        properties: {
          validIds: {
            type: "ARRAY",
            items: { type: "INTEGER" },
          },
        },
        required: ["validIds"],
      },
    });

    if (Array.isArray(res?.validIds)) {
      const validSet = new Set(res.validIds);
      return products.filter((_, idx) => validSet.has(idx));
    }
  } catch (err) {
    console.warn("filterForeignEditionsWithAI fallback:", err.message);
  }

  // Fallback: discard any title matching foreign language indicators
  return products.filter((p) => !FOREIGN_LANGUAGE_PATTERN.test(p.title));
}

/**
 * Dynamically evaluate bookstore products with Gemini AI to detect and reject
 * any books containing Haram themes according to Sunni Islamic standards
 * (erotica, pornography, black magic, sorcery, tarot divination, fortune-telling,
 * alcohol/drug/gambling promotion, explicit LGBTQ+, blasphemy).
 */
export async function filterHaramBooksWithAI(products, userQuery = "") {
  if (!Array.isArray(products) || products.length === 0) return [];

  // Fast pre-filter using regex
  const regexCleaned = products.filter(
    (p) =>
      !HARAM_BOOK_PATTERN.test(p.title || "") &&
      !HARAM_BOOK_PATTERN.test(p.candidateTitle || ""),
  );

  if (regexCleaned.length === 0) return [];

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return regexCleaned;
  }

  const items = regexCleaned.map((p, idx) => ({
    id: idx,
    title: p.title || p.candidateTitle || "",
    author: p.author || p.candidateAuthor || "",
  }));

  const prompt = `You are a strict content compliance validator for bookstore assistant Litera, who adheres to Sunni Islam.

CRITICAL INSTRUCTION:
Inspect each book title and author. REJECT any book that is Haram (prohibited in Sunni Islam):
1. Erotica, pornography, vulgar sexual romance, Kama Sutra, 50 Shades of Grey, sexually explicit literature.
2. Black magic, real witchcraft, sorcery, grimoires, demonology, tarot card divination, fortune telling, horoscopes/astrology predicting fate, occultism, love spells/hexes.
3. Promotion of alcohol consumption, recreational drugs, gambling/casinos/betting.
4. Explicit LGBTQ+ romance or blasphemy against God/Prophets.

PERMISSIBLE (HALAL):
Wholesome fiction, classical literature (e.g. Tolstoy, Dostoevsky, Chekhov, Dickens, Remarque), non-fiction, philosophy, poetry, science, history, educational materials, copybooks, textbooks, children's standard fairy tales, and clean adventures are completely permissible.

Books list:
${JSON.stringify(items, null, 2)}

Return JSON:
{
  "halalIds": [number]
}
Return strictly the array of "id" numbers for products that are Halal and free from haram content.`;

  try {
    const res = await callGeminiJson({
      apiKey,
      prompt,
      responseSchema: {
        type: "OBJECT",
        properties: {
          halalIds: {
            type: "ARRAY",
            items: { type: "INTEGER" },
          },
        },
        required: ["halalIds"],
      },
    });

    if (Array.isArray(res?.halalIds)) {
      const validSet = new Set(res.halalIds);
      return regexCleaned.filter((_, idx) => validSet.has(idx));
    }
  } catch (err) {
    console.warn("filterHaramBooksWithAI fallback:", err.message);
  }

  return regexCleaned;
}

export function isGiftQuery(query) {
  return /(подар(ок|ка|ком|ку|ке|ки|ить|ный|ная|ное|ные|ками|ках)|для подарка|в подарок|помоги с подарком|подарочн|выбрать подарок|подарить|present|gift)/i.test(
    query || "",
  );
}

export function isExpensiveQuery(query) {
  return /(подороже|дорог(ое|ую|ой|ие|их|им|ими)|элитн|премиум|коллекционн|эксклюзивн|кожан|в коробе|люкс|самое дорогое|повысь цену|вариант подороже|luxury|expensive)/i.test(
    query || "",
  );
}

export function extractConversationContext(history = [], latestMessage = "") {
  const allUserTexts = [
    ...history.filter((m) => m.role === "user").map((m) => m.content || ""),
    latestMessage,
  ];
  const fullText = allUserTexts.join(" ");

  // Check if gift was requested in this ongoing conversation
  const isGift = isGiftQuery(fullText);

  // Check price preference: "подороже" vs "подешевле"
  let pricePreference = "default";
  for (let i = allUserTexts.length - 1; i >= 0; i--) {
    const txt = allUserTexts[i];
    if (isExpensiveQuery(txt)) {
      pricePreference = "expensive";
      break;
    }
    if (/(подешевле|дешев(ле|ое|ую|ой|ые)|бюджетн|эконом|недорого)/i.test(txt)) {
      pricePreference = "cheap";
      break;
    }
  }

  const isDescendingPriceOrder = isGift || pricePreference === "expensive";

  // Check if user is asking for more/other options ("а еще", "еще", "что еще", "другие варианты")
  // or explicitly rejecting previous picks
  const isMoreOrOtherRequest =
    /(^|\s)(а\s*)?ещ[её](\s|$|\?)|(что|какие|есть|давай|покажи)\s*ещ[её]|(ещ[её]|друг(ие|их))\s*(вариант|книг|штук|издани)|другие\s*вариант/i.test(
      latestMessage,
    );

  const isRejectingPrevious =
    isMoreOrOtherRequest ||
    /(не\s*хочу|не\s*то|не\s*нравит|дай\s*друг(ие|их)|покажи\s*друг(ие|их)|друг(ие|их)\s*книг|друг(ие|их)\s*автор|что-?то\s*друг(ое|их)|не\s*эти|замени\s*вс[её]|новые\s*вариант|другие\s*вариант)/i.test(
      latestMessage,
    );

  // Check if user specifically asks for other editions/publishers of the existing books
  // (If user rejects the books, they do NOT want other editions of the same books!)
  const isOtherEditionRequest =
    !isRejectingPrevious &&
    /(друг(их|ие|ого|им|ое|ую|ая)?\s*(изд[аея]ни|изд[аея]тельств|переплет|обложк|оформлен)|в другом оформлении|другое издание|другого издания|другого издательства|такие же книги но|сделай друго[ея])/i.test(
      latestMessage,
    );

  return {
    isGift,
    pricePreference,
    isDescendingPriceOrder,
    isRejectingPrevious,
    isOtherEditionRequest,
  };
}

/**
 * Dynamically evaluate bookstore candidate products with Gemini AI to determine
 * whether each book edition is truly suitable as a gift.
 * Evaluates aesthetics, edition tier, and presentation value.
 * Rejects cheap brochures, pocket pamphlets, or low-grade paperbacks inappropriate for gifting.
 */
export async function evaluateGiftSuitabilityWithAI(products, userQuery = "") {
  if (!Array.isArray(products) || products.length === 0) return [];

  const apiKey = getGeminiApiKey();

  const items = products.map((p, idx) => ({
    id: idx,
    title: p.title || "",
    author: p.author || "",
    price: `${p.price} EUR`,
    store: p.store || "",
  }));

  const prompt = `You are a strict luxury gift curator for European online bookstore "Litera".
The customer requested books as a GIFT ("для подарка").

CRITICAL USER RULES FOR GIFTS:
A gift book MUST be an impressive, thoughtful, memorable PRESENT (deluxe volume, collector edition, gift set, illustrated edition, omnibus collection, or premium hardcover volume).

STRICTLY REJECT AS NON-GIFT:
- Standard, ordinary paperbacks, pocket editions, or basic mass-market softcovers without deluxe presentation (e.g. plain standard titles like "Сто лет одиночества 15-16 EUR", "Идиот 19 EUR", "Вино из одуванчиков 15 EUR" — these are ordinary pocket/softcover editions, NOT gifts!).
- Any book under 20 EUR that has no explicit gift/illustrated/collector/set indicators in its title.

ACCEPT AS GIFT:
- Genuine gift editions, multi-volume sets, illustrated editions, or premium deluxe editions (e.g. "Мастер и Маргарита 57 EUR", "Божественная комедия 49 EUR", "Властелин колец 44 EUR", "Граф Монте-Кристо (комплект) 35 EUR", "Преступление и наказание 27 EUR", "Маленький принц и другие произведения 20 EUR", illustrated/collector books).

Candidate books:
${JSON.stringify(items, null, 2)}

Return JSON:
{
  "giftSuitableIds": [number]
}
Return only the IDs of editions that are truly suitable as impressive gifts!`;

  try {
    const res = await callGeminiJson({
      apiKey,
      prompt,
      responseSchema: {
        type: "OBJECT",
        properties: {
          giftSuitableIds: {
            type: "ARRAY",
            items: { type: "INTEGER" },
          },
        },
        required: ["giftSuitableIds"],
      },
    });

    if (Array.isArray(res?.giftSuitableIds)) {
      const validSet = new Set(res.giftSuitableIds);
      return products.filter((_, idx) => validSet.has(idx));
    }
  } catch (err) {
    console.warn("evaluateGiftSuitabilityWithAI fallback:", err.message);
  }

  // Fallback: exclude anything under 6.0 EUR if higher-priced editions exist
  const hasSubstantial = products.some((p) => p.price >= 8.0);
  if (hasSubstantial) {
    return products.filter((p) => p.price >= 6.0);
  }
  return products;
}

/**
 * Searches bookstore suppliers for generic category / educational / non-specific book queries
 * (e.g. "прописи", "учебники", "рабочие тетради", "азбука", "букварь", etc.).
 *
 * Requirements:
 * 1. Gemini generates up to 5 prioritized, targeted search queries.
 * 2. Queries are executed sequentially against store search.
 * 3. EARLY EXIT: If the first query (or any subsequent query) returns suitable matching results,
 *    immediately STOP and DO NOT execute the remaining queries.
 */
export async function searchGenericCategoryIfNeeded(
  userQuery,
  activeRate,
  isForeignLanguageRequested = false,
  isDescendingPriceOrder = false,
  history = [],
  previouslyRecommended = [],
  previousUrls = new Set(),
) {
  const cleanQ = (userQuery || "").trim();
  if (!cleanQ) return null;

  const categoryRegex =
    /\b(пропис[а-я]*|учебник[а-я]*|тетрад[а-я]*|пособи[а-я]*|буквар[а-я]*|азбук[а-я]*|каллиграфи[а-я]*|чистописан[а-я]*|раскраск[а-я]*|словарь|словар[а-я]*|атлас[а-я]*|хрестомати[а-я]*|контурн[а-я]*\s*карт[а-я]*)\b/i;

  const mightBeCategory = categoryRegex.test(cleanQ);

  // Check if this is a continuation request (e.g. "а еще", "еще", "другие варианты", "что еще", "давай еще")
  const isContinuation =
    /(^|\s)(а\s*)?ещ[её](\s|$|\?)|(что|какие|есть|давай|покажи)\s*ещ[её]|(ещ[её]|друг(ие|их))\s*(вариант|книг|штук|издани)|другие\s*вариант/i.test(
      cleanQ,
    );

  const prevUserTexts = (history || [])
    .filter((m) => m.role === "user")
    .map((m) => m.content || "")
    .join(" ");
  const prevWasCategory = categoryRegex.test(prevUserTexts);

  // Build context section for Gemini
  let contextSection = "";
  if (Array.isArray(history) && history.length > 0) {
    const formattedHistory = history
      .slice(-6)
      .map((m) => {
        let text = `${m.role === "assistant" ? "Litera" : "User"}: ${m.content || ""}`;
        if (m.books && m.books.length > 0) {
          text += ` [Recommended ${m.books.length} items: ${m.books.map((b) => b.title).slice(0, 5).join(", ")}]`;
        }
        return text;
      })
      .join("\n");
    contextSection += `RECENT CONVERSATION HISTORY:\n${formattedHistory}\n`;
  }
  if (previouslyRecommended && previouslyRecommended.length > 0) {
    contextSection += `PREVIOUSLY SHOWN BOOKS:\n${previouslyRecommended.map((b) => `- ${b.title}`).join("\n")}\n`;
  }

  const apiKey = getGeminiApiKey();
  let isGenericCategory = false;
  let searchQueries = [];

  try {
    const prompt = `
You are the search engine query optimizer for the online bookstore "Litera".
User message: "${cleanQ}".

${contextSection}

TASK:
1. Understand what the user is asking for dynamically in the context of the dialogue:
   - If the user asks for more or other options (e.g. "а еще", "еще", "другие варианты", "что еще есть", "покажи другие"), identify the ACTIVE category/topic from RECENT CONVERSATION HISTORY (e.g. "прописи", "учебники", etc.).
2. Determine if this active request is for a generic product category, educational/learning material, workbook, copybook, textbook, or item type that does NOT have a single specific literary title (e.g. "прописи", "учебники", "рабочие тетради", "азбука", "букварь", "раскраски", "пособия", "словари", "атласы", "тетради по каллиграфии", etc.), as opposed to a specific literary work (like "Мастер и Маргарита", "Идиот") or a fiction genre theme (like "детективы", "книги про любовь", "фантастика про космос").

Rules:
1. If isGenericCategory is true:
   Generate up to 5 prioritized, targeted search queries in Russian to enter sequentially into the bookstore website search to find relevant products.
   - If the user is asking for more/other options ("а еще", "другие варианты"), generate alternative search keywords for that active category (e.g. for "прописи": ["чистописание", "учимся писать", "прописи тренажер", "прописи для детей", "многоразовые прописи", "прописи"]) so that fresh, unshown items are found!
   - Put the single most direct and effective search query as #1!
2. If isGenericCategory is false:
   searchQueries: []

Return JSON:
{
  "isGenericCategory": boolean,
  "resolvedTopic": string,
  "searchQueries": string[]
}
`;

    const geminiRes = await callGeminiJson({
      apiKey,
      prompt,
      responseSchema: {
        type: "OBJECT",
        properties: {
          isGenericCategory: { type: "BOOLEAN" },
          resolvedTopic: { type: "STRING" },
          searchQueries: {
            type: "ARRAY",
            items: { type: "STRING" },
          },
        },
        required: ["isGenericCategory", "searchQueries"],
      },
    });

    if (
      geminiRes?.isGenericCategory &&
      Array.isArray(geminiRes?.searchQueries) &&
      geminiRes.searchQueries.length > 0
    ) {
      isGenericCategory = true;
      searchQueries = geminiRes.searchQueries.map((q) => q.trim()).filter(Boolean);
    }
  } catch (err) {
    console.warn("searchGenericCategory classification error:", err.message);
  }

  // Fallback heuristic if Gemini call failed or returned false but regex clearly matches generic categories
  if (!isGenericCategory && (mightBeCategory || (isContinuation && prevWasCategory))) {
    isGenericCategory = true;
    const targetSource = mightBeCategory ? cleanQ : prevUserTexts;
    if (/\bпропис/i.test(targetSource) && /\bучебник/i.test(targetSource)) {
      searchQueries = isContinuation
        ? ["чистописание", "рабочие тетради", "учебные пособия", "прописи тренажер", "прописи"]
        : ["прописи", "учебники", "рабочие тетради", "чистописание", "учебные пособия"];
    } else if (/\bпропис/i.test(targetSource)) {
      searchQueries = isContinuation
        ? ["чистописание", "учимся писать", "прописи тренажер", "прописи для детей", "многоразовые прописи"]
        : ["прописи", "прописи для детей", "чистописание", "учимся писать", "прописи тренажер"];
    } else if (/\bучебник/i.test(targetSource)) {
      searchQueries = ["учебники", "учебные пособия", "учебник для", "пособия", "справочник"];
    } else if (/\b(тетрад|рабоч[а-я]*\s*тетрад)/i.test(targetSource)) {
      searchQueries = ["рабочая тетрадь", "тетради", "тетрадь тренажер", "прописи", "развивающие задания"];
    } else {
      const match = targetSource.match(categoryRegex);
      if (match) {
        searchQueries = [match[0], cleanQ];
      }
    }
  }

  if (!isGenericCategory || searchQueries.length === 0) {
    return null;
  }

  // EARLY EXIT SEARCH LOOP:
  // "если запросов он выдал 5 и на первом были найдены подходящие результаты, не нужно делать остальные 4"
  let foundProducts = [];
  let matchedQuery = "";

  const prevTitlesLower = new Set(
    (previouslyRecommended || []).map((b) => (b.title || "").toLowerCase().trim()),
  );

  for (let i = 0; i < searchQueries.length; i++) {
    const q = (searchQueries[i] || "").trim();
    if (!q) continue;

    const rawResults = await searchSuppliersByTitleOnly(q, activeRate);
    const valid = rawResults.filter((p) => {
      if (!p.title || !p.price || p.price <= 0) return false;
      if (HARAM_BOOK_PATTERN.test(p.title)) return false;
      if (previousUrls && previousUrls.has(p.url)) return false;
      const pTitleLower = p.title.toLowerCase().trim();
      if (prevTitlesLower.has(pTitleLower)) return false;
      if (!isForeignLanguageRequested) {
        if (FOREIGN_LANGUAGE_PATTERN.test(p.title)) return false;
        if (/[a-z]/i.test(p.title) && !/[а-яё]/i.test(p.title)) return false;
      }
      return true;
    });

    if (valid.length > 0) {
      // Suitable matching results found on this query!
      // Do NOT execute the remaining queries.
      foundProducts = valid;
      matchedQuery = q;
      break;
    }
  }

  if (foundProducts.length === 0) {
    return [];
  }

  // Deduplicate and format
  const deduped = [];
  const seenUrls = new Set();
  for (const p of foundProducts) {
    if (p.url && seenUrls.has(p.url)) continue;
    const isDupTitle = deduped.some(
      (d) => d.title.toLowerCase().trim() === p.title.toLowerCase().trim(),
    );
    if (!isDupTitle) {
      if (p.url) seenUrls.add(p.url);
      deduped.push({
        ...p,
        candidateTitle: p.title,
        candidateAuthor: p.author || "Учебные материалы",
        relevance: `Издание по запросу «${matchedQuery}»`,
      });
    }
  }

  if (isDescendingPriceOrder) {
    deduped.sort((a, b) => b.price - a.price);
  } else {
    deduped.sort((a, b) => a.price - b.price);
  }

  const halalProducts = await filterHaramBooksWithAI(deduped, userQuery);

  return halalProducts.slice(0, 8).map((b, idx) => ({
    id: `catalog-book-${idx}`,
    ...b,
  }));
}

/**
 * 4. Main AI Discovery & Supplier Verification pipeline.
 * Discovers real books by meaning, searches suppliers strictly by title only,
 * validates products, and excludes any books not available on suppliers.
 */
export async function discoverAndMatchBooks(userQuery, exchangeRate, history = []) {
  const activeRate =
    exchangeRate || (await getExchangeRate().catch(() => DEFAULT_RATE));

  // Extract the most recent recommended book list from immediate last assistant turn
  let lastRecommendedList = [];
  const previouslyRecommended = [];
  const previousUrls = new Set();
  if (Array.isArray(history)) {
    for (let i = history.length - 1; i >= 0; i--) {
      if (
        history[i].role === "assistant" &&
        Array.isArray(history[i].books) &&
        history[i].books.length > 0
      ) {
        if (lastRecommendedList.length === 0) {
          lastRecommendedList = history[i].books;
        }
      }
    }
    for (const msg of history) {
      if (Array.isArray(msg.books)) {
        for (const b of msg.books) {
          if (b && b.title) {
            if (
              !previouslyRecommended.some(
                (p) => p.title.toLowerCase() === b.title.toLowerCase(),
              )
            ) {
              previouslyRecommended.push(b);
            }
            if (b.url) previousUrls.add(b.url);
          }
        }
      }
    }
  }

  const conversationContext = extractConversationContext(history, userQuery);
  const {
    isGift,
    isExpensive,
    isDescendingPriceOrder,
    isRejectingPrevious,
    isOtherEditionRequest,
  } = conversationContext;
  const isGiftOrLuxuryRequest = isDescendingPriceOrder;

  const isForeignLanguageRequested =
    /(на\s+английском|на\s+англ|на\s+немецком|на\s+французском|на\s+румынском|in\s+english|english\s+books|english)/i.test(
      userQuery || "",
    );

  // Check if user specifically requested to replace/update a SINGLE book in the previous list
  const targetIndex = findTargetBookIndex(userQuery, lastRecommendedList);
  if (
    targetIndex >= 0 &&
    targetIndex < lastRecommendedList.length &&
    isOtherEditionRequest
  ) {
    const targetBook = lastRecommendedList[targetIndex];
    const prevPrice = Number(targetBook.price) || 0;
    const storeProducts = await searchSuppliersByTitleOnly(
      targetBook.title,
      activeRate,
    );
    const candidateMatches = storeProducts.filter((p) =>
      validateProductMatch(p, targetBook, isForeignLanguageRequested),
    );
    const validMatches = candidateMatches;

    // Exclude the edition that is currently shown (by exact URL)
    const unshown = validMatches.filter((p) => p.url !== targetBook.url);

    // If no other edition exists in the bookstore catalog:
    // User's strict rule: "если нет другого издания, ассистентка должна так и ответить и попросить прощения, не надо искать то чего не просят"
    if (unshown.length === 0) {
      const updatedList = await Promise.all(
        lastRecommendedList.map(async (book, idx) => {
          let img = book.image;
          if (!img && book.title) {
            try {
              const cachedProducts = await searchSuppliersByTitleOnly(
                book.title,
                activeRate,
              );
              const found =
                cachedProducts.find((p) => p.url === book.url) ||
                cachedProducts[0];
              if (found?.image) img = found.image;
            } catch {
              // ignore
            }
          }
          return {
            ...book,
            image: img || "",
            currency: book.currency || "EUR",
            id: `catalog-book-${idx}`,
            noOtherEdition: idx === targetIndex,
            targetTitle: targetBook.title,
          };
        }),
      );

      return updatedList;
    }

    const pool = unshown;

    const isExplicitlyLuxury =
      isGift ||
      isExpensive ||
      /(подарочн|коллекционн|в твердом переплете|кожан|люкс|самое дорогое|подороже|подарок|для подарка)/i.test(
        userQuery || "",
      );

    let replacementBook;
    if (isExplicitlyLuxury) {
      pool.sort((a, b) => b.price - a.price);
      replacementBook = pool[0];
    } else {
      // Find editions with price >= prevPrice (excluding current edition)
      // Sort ascending to get the second cheapest edition (or next price tier)
      const sameOrMoreExpensive = pool.filter((p) => p.price >= prevPrice);
      sameOrMoreExpensive.sort((a, b) => a.price - b.price);

      // If there are editions with price > prevPrice, prefer the next one above prevPrice
      const strictlyMoreExpensive = sameOrMoreExpensive.filter(
        (p) => p.price > prevPrice,
      );

      if (strictlyMoreExpensive.length > 0) {
        replacementBook = strictlyMoreExpensive[0];
      } else if (sameOrMoreExpensive.length > 0) {
        replacementBook = sameOrMoreExpensive[0];
      } else {
        // Fallback to any alternative edition from pool
        pool.sort((a, b) => b.price - a.price);
        replacementBook = pool[0];
      }
    }

    if (!replacementBook) {
      replacementBook = targetBook;
    }

    const updatedList = await Promise.all(
      lastRecommendedList.map(async (book, idx) => {
        if (idx === targetIndex) {
          return {
            ...replacementBook,
            candidateTitle: targetBook.candidateTitle || targetBook.title,
            candidateAuthor: targetBook.candidateAuthor || targetBook.author,
            relevance: "Альтернативное издание произведения",
            isReplacement: true,
            previousTitle: targetBook.title,
          };
        }

        // Preserve all existing book properties, and recover image if it was missing
        let img = book.image;
        if (!img && book.title) {
          try {
            const cachedProducts = await searchSuppliersByTitleOnly(
              book.title,
              activeRate,
            );
            const found =
              cachedProducts.find((p) => p.url === book.url) ||
              cachedProducts[0];
            if (found?.image) img = found.image;
          } catch {
            // ignore
          }
        }

        return {
          ...book,
          image: img || "",
          currency: book.currency || "EUR",
        };
      }),
    );

    return updatedList.map((b, idx) => ({
      id: `catalog-book-${idx}`,
      ...b,
    }));
  }

  // Check if user is asking for generic categories / items without specific book titles (e.g. "прописи", "учебники", "рабочие тетради")
  const categoryResults = await searchGenericCategoryIfNeeded(
    userQuery,
    activeRate,
    isForeignLanguageRequested,
    isDescendingPriceOrder,
    history,
    previouslyRecommended,
    previousUrls,
  );
  if (categoryResults !== null) {
    return categoryResults;
  }

  const rawCandidates = await discoverBooksByMeaning(
    userQuery,
    history,
    previouslyRecommended,
  );
  if (!rawCandidates || rawCandidates.length === 0) return [];

  let candidates = rawCandidates;

  // If user rejects previous recommendations ("не хочу", "дай другие", "не то"),
  // strictly exclude all previously recommended titles so the user gets fresh different books!
  if (isRejectingPrevious && previouslyRecommended.length > 0) {
    const prevTitlesLower = new Set(
      previouslyRecommended.map((b) => (b.title || "").toLowerCase().trim()),
    );
    candidates = candidates.filter((c) => {
      const cTitle = (c.title || "").toLowerCase().trim();
      return (
        !prevTitlesLower.has(cTitle) &&
        ![...prevTitlesLower].some(
          (pt) => cTitle.includes(pt) || pt.includes(cTitle),
        )
      );
    });
  }

  // If other edition requested specifically (and not rejecting), guarantee previously recommended titles are included
  if (isOtherEditionRequest && previouslyRecommended.length > 0 && !isRejectingPrevious) {
    for (const pb of previouslyRecommended) {
      if (
        !candidates.some(
          (c) => c.title.toLowerCase() === pb.title.toLowerCase(),
        )
      ) {
        candidates.unshift({
          title: pb.title,
          author: pb.author || "",
          alternativeTitle: "",
          relevance: "Альтернативное издание произведения",
        });
      }
    }
  }

  // Search suppliers for top candidates strictly by title only (up to 8 for gifts to guarantee gift editions, 5 for normal)
  const candidatesToSearch = isGift ? candidates.slice(0, 8) : candidates.slice(0, 5);
  const searchPromises = candidatesToSearch.map(async (candidate) => {
    let storeProducts = await searchSuppliersByTitleOnly(
      candidate.title,
      activeRate,
    );
    if (
      storeProducts.length === 0 &&
      candidate.alternativeTitle &&
      candidate.alternativeTitle !== candidate.title
    ) {
      storeProducts = await searchSuppliersByTitleOnly(
        candidate.alternativeTitle,
        activeRate,
      );
    }

    const validMatches = storeProducts.filter((p) =>
      validateProductMatch(p, candidate, isForeignLanguageRequested),
    );

    if (validMatches.length === 0) return [];

    if (isGift || isExpensive) {
      // Find expensive/deluxe options of this book
      // Sort editions descending by price: from most expensive to cheapest
      validMatches.sort((a, b) => b.price - a.price);

      let chosenPool;
      if (isGift) {
        // A true gift edition must be impressive: either explicit deluxe/gift markers, or premium price >= 20.0 EUR
        // Reject plain mass-market paperbacks (like "Сто лет одиночества 15.30 €" or plain "Идиот 19.92 €")
        const giftEditions = validMatches.filter((p) => {
          const isExplicitGift = /(подарочн|иллюстр|шедевры\s*иллюстрац|коллекцион|кожан|шелковый|в\s*коробе|футляр|комплект|собрание\s*сочинений|тома?\s*\d|в\s*\d+\s*т|золотая\s*коллекция|большая\s*книга|библиотека\s*великих|суперобложк|твердый\s*переплет)/i.test(p.title);
          if (isExplicitGift) return p.price >= 8.0;
          return p.price >= 20.0;
        });

        if (giftEditions.length === 0) {
          // If this book has NO gift/deluxe editions available in store catalogues (only cheap softcover/paperbacks),
          // reject this candidate so another book with genuine gift editions is selected!
          return [];
        }
        chosenPool = giftEditions;
      } else {
        const premiumEditions = validMatches.filter((p) => p.price >= 7.5);
        chosenPool = premiumEditions.length > 0 ? premiumEditions : validMatches;
      }

      // STRICTLY offer only 1 single best edition per candidate book so works NEVER repeat!
      return [
        {
          ...chosenPool[0],
          candidateTitle: candidate.title,
          candidateAuthor: candidate.author,
          relevance: candidate.relevance,
        },
      ];
    }

    if (isOtherEditionRequest) {
      // Find previous edition price if this candidate was previously recommended
      const prevBook = previouslyRecommended.find(
        (b) =>
          b.title.toLowerCase().includes(candidate.title.toLowerCase()) ||
          candidate.title.toLowerCase().includes(b.title.toLowerCase()),
      );
      const prevPrice = prevBook ? Number(prevBook.price) : 0;

      // Filter out exact URLs that were already shown
      const unshown = validMatches.filter((p) => !previousUrls.has(p.url));
      const pool = unshown.length > 0 ? unshown : validMatches;

      // The user requested: "книги с такими же названиями но подороже"
      // Prefer higher-tier / hardcover / better quality editions (>= 7.5 € or noticeably higher than previous)
      const isExplicitlyMoreExpensive =
        /(подороже|дорог(ое|ую|ой|ие)|подарочн|коллекционн|в твердом переплете|кожан|люкс|друг(их|ого|ие)\s*(издани|издательств))/i.test(
          userQuery || "",
        );

      let moreExpensive;
      if (isExplicitlyMoreExpensive) {
        const threshold = Math.max(7.5, prevPrice > 0 ? prevPrice * 1.6 : 7.5);
        const premiumEditions = pool.filter((p) => p.price >= threshold);
        if (premiumEditions.length >= 2) {
          moreExpensive = premiumEditions;
        } else {
          moreExpensive = pool.filter(
            (p) => p.price > (prevPrice > 0 ? prevPrice + 1.0 : 5.0),
          );
        }
      } else {
        moreExpensive = pool.filter(
          (p) => p.price > (prevPrice > 0 ? prevPrice + 0.8 : 5.0),
        );
      }

      const editionPool = moreExpensive.length >= 2 ? moreExpensive : pool;

      // Sort by price ascending (from the higher-priced tier upwards, e.g. 9.85 €, 10.40 €, 11.39 €)
      if (isGiftOrLuxuryRequest) {
        editionPool.sort((a, b) => b.price - a.price);
      } else {
        editionPool.sort((a, b) => a.price - b.price);
      }

      // Offer up to 3 distinct higher-priced editions of this book
      const takeCount = Math.min(3, editionPool.length);
      return editionPool.slice(0, takeCount).map((match) => ({
        ...match,
        candidateTitle: candidate.title,
        candidateAuthor: candidate.author,
        relevance: candidate.relevance,
      }));
    }

    // Default search (not asking for other edition / more expensive)
    validMatches.sort((a, b) => a.price - b.price);

    // If only 1-2 candidates were found (specific single book request),
    // return up to 3 distinct affordable editions so the customer always has at least 3 choices!
    const takeCount =
      candidates.length <= 2 ? Math.min(3, validMatches.length) : 1;
    return validMatches.slice(0, takeCount).map((match) => ({
      ...match,
      candidateTitle: candidate.title,
      candidateAuthor: candidate.author,
      relevance: candidate.relevance,
    }));
  });

  const resolved = await Promise.all(searchPromises);
  let rawProducts = resolved.flat().filter(Boolean);

  // Fast haram and foreign language rejection without extra network or LLM calls
  rawProducts = rawProducts.filter((p) => !HARAM_BOOK_PATTERN.test(p.title));
  if (!isForeignLanguageRequested) {
    rawProducts = rawProducts.filter(
      (p) =>
        !FOREIGN_LANGUAGE_PATTERN.test(p.title) &&
        !(/[a-z]/i.test(p.title) && !/[а-яё]/i.test(p.title)),
    );
  }

  let verifiedProducts = rawProducts;

  if (isDescendingPriceOrder) {
    verifiedProducts.sort((a, b) => b.price - a.price);
  }

  // Work-level and URL deduplication: STRICTLY prevent duplicate works
  // (no multiple editions of "Преступление и наказание", "Сто лет одиночества", etc.)
  const deduped = [];
  const seenUrls = new Set();

  for (const b of verifiedProducts) {
    if (b.url && seenUrls.has(b.url)) continue;
    const isDuplicateWork = deduped.some(
      (existing) =>
        areTitlesSameWork(existing.title, b.title) ||
        (existing.candidateTitle &&
          b.candidateTitle &&
          areTitlesSameWork(existing.candidateTitle, b.candidateTitle)),
    );
    if (!isDuplicateWork) {
      if (b.url) seenUrls.add(b.url);
      deduped.push(b);
    }
  }

  // Dynamic AI & regex filtering of Haram books according to Sunni Islam
  let halalProducts = await filterHaramBooksWithAI(deduped, userQuery);

  // If user requested a gift, let AI evaluate candidate products for strict gift suitability
  // "потом ИИ должен был оценить подойдет ли это для подарка, если нет то должен найти или другое издание или другую книгу"
  if (isGift && halalProducts.length > 0) {
    const giftSuitable = await evaluateGiftSuitabilityWithAI(halalProducts, userQuery);
    if (giftSuitable.length >= 3) {
      const suitableUrls = new Set(
        giftSuitable.map((p) => p.url || `${p.title}-${p.price}`),
      );
      const filtered = halalProducts.filter((p) =>
        suitableUrls.has(p.url || `${p.title}-${p.price}`),
      );
      if (filtered.length >= 3) {
        halalProducts.length = 0;
        halalProducts.push(...filtered);
      }
    }
  }

  // PRICE FILTER SORTING:
  // "Когда пользователь просит что-нибудь для подарка, то фильтр цены должен идти наоборот от самого дорогого до самого дешевого"
  // "Фильтр цены так же должен работать от большего к меньшему если пользователь специально просит что нибудь подороже"
  if (isDescendingPriceOrder) {
    halalProducts.sort((a, b) => b.price - a.price);
  } else if (!isOtherEditionRequest) {
    halalProducts.sort((a, b) => {
      const aIsHigh = a.price > 45;
      const bIsHigh = b.price > 45;
      if (aIsHigh !== bIsHigh) return aIsHigh ? 1 : -1;
      return a.price - b.price;
    });
  }

  // Return up to 8 top candidate books with indexed IDs
  return halalProducts.slice(0, 8).map((b, idx) => ({
    id: `catalog-book-${idx}`,
    ...b,
  }));
}

// Backward-compatible alias
export const searchStoreCatalogue = discoverAndMatchBooks;

/**
 * Determines whether the user message requires book discovery from the catalogue.
 */
async function analyzeSearchIntent(messages) {
  const latestMessage = messages[messages.length - 1]?.content || "";
  const lower = latestMessage.toLowerCase().trim();

  // Fast-path 0: Haram book or content inquiry (STRICTLY NO STORE SEARCH - Litera declines in chat)
  if (isHaramQuery(lower)) {
    return { needSearch: false, isHaram: true };
  }

  // Fast-path 1: Cart, Account, Profile, Orders, Site Navigation, Business & Admin inquiries (STRICTLY NO BOOK DISCOVERY)
  const isSiteOrCartQuery =
    /(корзин|в корзине|из корзины|очист(и|ить) корзину|содержимое корзины|товары в корзине|заказ|оформить заказ|оформление|мои заказы|профиль|аккаунт|войти|логин|регистрац|где найти раздел|куда нажать|как оплатить|доставка|валют|в евро|где вы находитесь|сотрудничеств|партнерств|коммерческ|поставщ|поставк|опт|оптов|изменить.*заказ|отменить.*заказ|уточнен.*заказ|правк.*заказ|редактирова.*заказ|живой админ|связаться с админ)/i.test(
      lower,
    ) &&
    !/(книга про корзину|книги про корзину|книга корзина)/i.test(lower);

  if (isSiteOrCartQuery) {
    return { needSearch: false };
  }

  // Fast-path 2: Greetings, pleasantries, or questions about Litera (NO SEARCH)
  const isConversational =
    /^(привет|здравствуй|здравствуйте|хай|ку|добрый день|добрый вечер|доброе утро|hello|hi|hey|good morning|buna|salut|здравей)[\s!.,?]*$/i.test(
      lower,
    ) ||
    /^(как дела|кто ты|как тебя зовут|что ты умеешь|who are you|how are you|расскажи о себе|чем занимаешься|спасибо|благодарю|ясно|понятно|ок|хорошо|отлично)[\s!.,?]*$/i.test(
      lower,
    ) ||
    /^(какая твоя любимая|что ты думаешь|кто твой любимый|ты любишь читать|расскажи о себе|как погода)/i.test(
      lower,
    ) ||
    /(ты\s*(мусульманка|христианка|вериш|религиозн|суннит)|какая\s*твоя\s*религи|во\s*что\s*ты\s*веришь)/i.test(
      lower,
    );

  if (isConversational) {
    return { needSearch: false };
  }

  // Fast-path 2.5: Life guidance, personal dilemmas, ethics, coping with hardship (NO STORE SEARCH)
  if (isLifeAdviceQuery(lower)) {
    return { needSearch: false, isLifeAdvice: true };
  }

  // Fast-path 3: Book plot, ending, character fate, or spoiler questions / confirmation (NO STORE SEARCH)
  const isPlotOrSpoilerQuery =
    /(выжил(а|и)?\s*ли|умер(ла|ли)?\s*ли|погиб(ла|ли)?\s*ли|кто\s*убийца|чем\s*заканчива|какой\s*финал|что\s*в\s*конце|концовк|спойлер|раскрой\s*сюжет|расскажи\s*финал|с\s*кем\s*останет|предаст\s*ли|что\s*станет\s*с)/i.test(
      lower,
    );

  const prevAssistantMsg =
    messages.filter((m) => m.role === "assistant").slice(-1)[0]?.content || "";
  const isRespondingToSpoilerWarning =
    /спойлер|интриг|развязк|хотите.*узнать|раскрыть/i.test(prevAssistantMsg) &&
    /^(да|давай|хочу|расскажи|говори|спойлери|скажи|конечно|согласен|давай расскажи|да расскажи|мне всё равно|мне все равно|не боюсь спойлеров|нет|не надо|лучше не надо|не стоит)[\s!.,?]*$/i.test(
      lower,
    );

  if (isPlotOrSpoilerQuery || isRespondingToSpoilerWarning) {
    return { needSearch: false };
  }

  // Fast-path 3.5: User asking for Litera's personal opinion / thoughts (NO STORE SEARCH unless explicitly asking to buy or recommend books)
  const isOpinionQuery =
    /(тво[её]\s*мнение|скажи\s*(сво[её]\s*)?мнение|поделись\s*(своим\s*)?мнением|что\s*ты\s*думаешь|как\s*тебе|как\s*ты\s*относишься|твои\s*впечатления|тво[её]\s*отношение|любишь\s*ли\s*ты|нравится\s*ли\s*тебе|что\s*скажешь\s*о|что\s*скажешь\s*про)/i.test(
      lower,
    ) &&
    !/(посоветуй|порекомендуй|найди|купить|подобрать|заказать|в наличии|сколько стоит)/i.test(
      lower,
    );

  if (isOpinionQuery) {
    return { needSearch: false };
  }

  // Fast-path 4: Suggested quick chips (Direct search needed)
  if (
    /литера,?\s*(что\s*почитать|посоветуй\s*книгу|что\s*(сейчас\s*)?в\s*топе|помоги\s*с\s*подарком|найди\s*детектив)/i.test(
      lower,
    )
  ) {
    return { needSearch: true };
  }

  // Fast-path 4: Explicit book requests, category inquiries, and follow-ups
  const hasCategoryOrBookInquiry =
    /(есть|бывают|прода(ете|ются|ется)|найди|ищу|покажи|подскажи|посоветуй|порекомендуй|хочу|нужн[аыое]?)\s*(ли)?\s*(у\s*вас)?\s*(каки[е-]?то|какие-нибудь|что-?[нто]|какой-?то)?\s*(книг|учебник|пропис|тетрад|пособи|словарь|словари|атлас|энциклопеди|азбук|буквар|справочник|руководств|комикс|мангу|манга|раскраск|литератур)/i.test(
      lower,
    ) ||
    /\b(прописи|прописях|прописей|учебники|учебник|рабочие\s*тетради|азбука|букварь|хрестоматия|словари|развивающие\s*тетради)\b/i.test(
      lower,
    );

  const hasExplicitBookRequest =
    hasCategoryOrBookInquiry ||
    /(посоветуй|порекомендуй|найди|хочу.*книг|подскажи что почитать|что почитать|подобрать книгу|выбери книгу|какие книги|книги про|книгу про|книги о|книги по|книга про|книга о|книга по|хочу книгу|подар(ок|ка|ком|ку|ки|ить)|для\s*подарка|в\s*подарок|что\s*подарить|что-нибудь\s*для\s*подарка|дай\s*мне|друг(их|ие|ого|им|ое|ую|ая)?\s*(изд[аея]ни|изд[аея]тельств|переплет|обложк|вариант|оформлен)|в другом оформлении|другое издание|другого издания|другого издательства|такие же книги|подороже|подешевле|еще книг|другие книги|сделай друго|замени|поменяй|дай\s*друг(ие|их)|покажи\s*друг(ие|их)|не\s*хочу|не\s*то|другие\s*вариант|что-?то\s*друг(ое|их)|покажи\s*ещ[её]|других\s*автор)/i.test(
      lower,
    );
  const hasPreviousBooks = (messages || []).some(
    (m) =>
      (m.role === "assistant" && Array.isArray(m.books) && m.books.length > 0) ||
      (m.books && m.books.length > 0),
  );

  const isContinuationQuery =
    hasPreviousBooks &&
    /(^|\s)(а\s*)?ещ[её](\s|$|\?)|(что|какие|есть|давай|покажи)\s*ещ[её]|(ещ[её]|друг(ие|их))\s*(вариант|книг|штук|издани)|покажи\s*друг(ие|их)|дай\s*друг(ие|их)|други[ея]\s*(книг|автор|вариант)/i.test(
      lower,
    );

  if (hasExplicitBookRequest || isContinuationQuery) {
    return { needSearch: true };
  }

  // Fallback: use Gemini to classify intent
  const apiKey = getGeminiApiKey();
  const historySnippet = (messages || [])
    .slice(-6)
    .map(
      (m) =>
        `${m.role === "assistant" ? "Litera" : "User"}: ${m.content || ""} ${
          m.books?.length
            ? `[Recommended ${m.books.length} items: ${m.books.map((b) => b.title).slice(0, 3).join(", ")}...]`
            : ""
        }`,
    )
    .join("\n");

  const prompt = `
Determine if the customer's message explicitly requests finding, recommending, or suggesting books or items to read or buy from the bookstore.

Conversation history:
${historySnippet}

Customer message: "${latestMessage}"

CRITICAL RULES:
- CONTINUATION / MORE OPTIONS RULE: If previous messages in the conversation were discussing, searching, or recommending books/items, and the customer's latest message is a follow-up asking for more, other, or additional options (e.g. "а еще", "еще", "что еще есть", "покажи еще", "другие варианты", "а подешевле", "а другие"):
  set needSearch = true!
- set needSearch = false if the customer is asking about:
  * Their shopping cart ("что в корзине", "проверь корзину", "сколько книг в заказе")
  * Their account, login, or orders ("мои заказы", "где профиль")
  * Store FAQ (shipping, payment, currency, locations, languages)
  * Business, partnership, collaboration, wholesale, or publisher inquiries ("сотрудничество", "партнерство", "коммерческое предложение", "поставки")
  * Existing order edits, amendments, clarifications, cancellations, or address changes ("уточнения по заказу", "изменить заказ")
  * Casual conversation ("привет", "как дела", "спасибо") without prior book search
  * Personal opinion or literary thoughts without asking to buy or find books ("скажи свое мнение", "что ты думаешь о Достоевском", "твое мнение о книге")
  * Book plots, endings, or spoilers ("выжил ли герой", "кто убийца")
  * Navigation ("открой корзину", "перейти к оформлению")
- set needSearch = true if the customer is asking for book recommendations, searching for reading material, asking if the store has or sells specific categories/materials (e.g. "есть ли прописи", "а есть какие-то учебники или прописи", "у вас есть словари?", "продаются ли прописи"), or asking for other editions/publishers/prices (e.g. "хочу такие же книги но другого издательства", "посоветуй что-то про космос", "найди детективы", "хочу почитать драму", "что-то подороже").

Return JSON: { "needSearch": boolean }
`;

  try {
    const res = await callGeminiJson({
      apiKey,
      prompt,
      responseSchema: {
        type: "OBJECT",
        properties: { needSearch: { type: "BOOLEAN" } },
        required: ["needSearch"],
      },
    });
    return { needSearch: Boolean(res?.needSearch) };
  } catch {
    return { needSearch: false };
  }
}

/**
 * Call Gemini API with automatic model fallback
 */
export async function callGeminiJson({ apiKey, systemInstruction, prompt, responseSchema }) {
  const requestBody = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 1000,
      temperature: 0.65,
      ...(responseSchema ? { responseSchema } : {}),
    },
  };

  if (systemInstruction) {
    requestBody.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  let lastError = null;

  for (const model of GEMINI_MODELS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        lastError = new Error(errJson.error?.message || `HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        lastError = new Error("Empty text from Gemini");
        continue;
      }

      return JSON.parse(rawText);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("All Gemini models failed");
}

/**
 * Main handler for Litera Assistant chat requests
 */
export async function processLiteraChat({ messages, language = "ru", context, onStatus } = {}) {
  const apiKey = getGeminiApiKey();
  const history = Array.isArray(messages) ? messages.slice(-10) : [];
  const latestMessage = history[history.length - 1]?.content || "";

  // 1. Analyze user intent
  const { needSearch } = await analyzeSearchIntent(history);

  if (typeof onStatus === "function") {
    try {
      onStatus(needSearch ? "searching" : "typing");
    } catch {
      // Ignore callback errors
    }
  }

  let catalogueResults = [];
  if (needSearch) {
    const rate = await getExchangeRate().catch(() => DEFAULT_RATE);
    catalogueResults = await discoverAndMatchBooks(latestMessage, rate, history).catch(() => []);
  }

  // 2. Format live user, cart, and page context
  const cartInfo = context?.cart;
  const userInfo = context?.user;
  const pageInfo = context?.page;

  let siteContextText = `
CURRENT USER & SITE CONTEXT:
- User is logged in: ${userInfo?.isLoggedIn ? `Yes (Name: ${userInfo.name || "Customer"}, Email: ${userInfo.email || "Unknown"})` : "No (Guest visitor)"}
- Current page / route: ${pageInfo?.pathname || "/"}
- User's Shopping Cart:
`;

  if (!cartInfo?.isLoggedIn) {
    siteContextText += `  Status: User is NOT signed in (Guest). In Litera bookstore, the cart is linked to user accounts. If the user asks what is in their cart or asks to check their cart, explain politely that they need to sign in (/login) or register (/sign-up) to access and save their personal shopping cart.\n`;
  } else if (!cartInfo.items || cartInfo.items.length === 0) {
    siteContextText += `  Status: The user's cart is currently EMPTY (0 items, 0.00 €). If they ask what is in their cart, tell them accurately that their cart is empty, and ask if they would like recommendations for books.\n`;
  } else {
    siteContextText += `  Status: Cart has ${cartInfo.itemCount} books, Total: ${cartInfo.totalPrice} EUR.
  Items in cart:
${cartInfo.items.map((it, idx) => `  ${idx + 1}. «${it.title}» — ${it.quantity} шт. по ${it.price} € (${it.store})`).join("\n")}
`;
  }

  siteContextText += `
AVAILABLE SITE SECTIONS & ROUTES:
- Главная (/) — Bestsellers, catalog overview
- Корзина (/cart) — Shopping cart to view items, change quantities, and checkout
- Оформление заказа (/checkout) — Complete the order and enter delivery details
- Мои заказы (/orders) — View past and current orders
- Профиль (/profile) — Customer account profile
- Скидки (/discount) — Discounted books and offers
- Новинки (/new) — Newly released books
- Подборка книг (/featured) — Curated book selections
- Отзывы (/testimonial) — Customer reviews
- Вход (/login) / Регистрация (/sign-up) — Account authentication
`;

  // 3. Build prompt for Litera
  let promptText = `
User latest message: "${latestMessage}"
User interface language: "${language}"

${siteContextText}

Conversation history:
${JSON.stringify(history.slice(0, -1))}
`;

  if (needSearch) {
    if (catalogueResults.length > 0) {
      promptText += `
LITERA STORE REAL CATALOGUE SEARCH RESULTS for customer request "${latestMessage}":
${JSON.stringify(
  catalogueResults.slice(0, 8).map((b) => ({
    id: b.id,
    title: b.title,
    author: b.author || b.candidateAuthor || "Unknown",
    price: `${b.price} ${b.currency}`,
    relevanceReason: b.relevance || "",
  })),
  null,
  2,
)}
`;

      const noOtherEditionItem = catalogueResults.find((b) => b.noOtherEdition);
      const targetedReplacementItem = catalogueResults.find(
        (b) => b.isReplacement,
      );

      if (noOtherEditionItem) {
        promptText += `
CRITICAL INSTRUCTION - NO OTHER EDITION AVAILABLE IN STORE CATALOGUE:
- The customer asked for another edition of book «${noOtherEditionItem.targetTitle || noOtherEditionItem.title}».
- In Litera's catalogue, there are NO OTHER EDITIONS of «${noOtherEditionItem.targetTitle || noOtherEditionItem.title}»! It is available ONLY in this single edition.
- YOU MUST APOLOGIZE POLITELY AND WARMLY TO THE CUSTOMER (e.g. "Простите, пожалуйста! 💜", "Мне очень жаль...").
- Honestly and clearly state that unfortunately in our catalogue there are currently no other editions of «${noOtherEditionItem.targetTitle || noOtherEditionItem.title}» — this book is presented only in this single edition.
- STRICT REQUIREMENT: DO NOT search for, suggest, or offer any other books or titles that the user did not ask for ("не надо искать то чего не просят")!
- Keep the user's current book list intact without modifications: return all their IDs in "bookIds":
  "bookIds": ${JSON.stringify(catalogueResults.map((b) => b.id))}
- Set emotion: "concerned" or "sad".
`;
      } else if (targetedReplacementItem) {
        promptText += `
CRITICAL TARGETED BOOK REPLACEMENT INSTRUCTION:
- The customer asked to replace a specific book in their list (book «${targetedReplacementItem.title}») with another edition.
- The catalogue list above contains ALL ${catalogueResults.length} books in their EXACT original order, with the targeted book successfully replaced by its alternative edition («${targetedReplacementItem.title}» at ${targetedReplacementItem.price} €)!
- YOU MUST RETURN ALL ${catalogueResults.length} BOOKS in "bookIds":
  "bookIds": ${JSON.stringify(catalogueResults.map((b) => b.id))}
- In your conversational response:
  Explain warmly that you kept the earlier books and replaced the requested book with another edition as requested!
`;
      } else {
        promptText += `
CRITICAL INSTRUCTIONS:
- DYNAMIC LANGUAGE FILTERING: If you notice ANY signs or markers that a book in the catalogue list is an edition in a foreign language (e.g. English, Romanian, French, German, "(на англ. яз.)", "(eng)", "in English", foreign language subtitles), YOU MUST DISCARD THAT BOOK AND NOT RECOMMEND IT!
- NO DUPLICATE WORKS OR TITLES: Every single recommended book MUST be a completely distinct literary work or distinct educational edition! Never recommend duplicate identical editions of the same book in the list.
- QUANTITY REQUIREMENT: Whenever books are present in the catalogue list, recommend all valid Russian books (at least 3, up to 6 books). Return their IDs in "bookIds": ${JSON.stringify(catalogueResults.slice(0, 6).map((b) => b.id))}.
- In "bookIds", return an array containing their exact IDs.
- EDUCATIONAL / COPYBOOKS / TEXTBOOKS INSTRUCTION: If the customer asked about educational materials, textbooks, or copybooks ("прописи", "учебники", "рабочие тетради"):
  Joyfully and warmly confirm that Litera has these items in stock, present the found editions from the catalogue search results list, and explain how they help in learning or practicing handwriting/skills!
- CONVERSATION MEMORY & ACTIVE CONTEXT:
  * Your message MUST strictly orient on the ongoing dialogue history and previous queries!
  * If the ongoing dialogue is about GIFTS or books "подороже", remember that this context remains active!
  * If the user asked for more options ("а еще", "еще", "что еще", "другие варианты") or rejected previous books ("не хочу", "дай другие", "не то"), acknowledge this warmly (e.g. "Конечно! Вот ещё отличные варианты...", "С удовольствием предложу вам другие издания...") and present the newly found books!
  * If the user asked for other editions of the same book, acknowledge the alternative edition selection!
- PRICE & VALUE PREFERENCE: By default, prefer affordable editions. But if the customer requested other editions or more expensive books ("другого издательства", "подороже", "подарочное"), recommend the alternative / higher-priced editions from the list!
- GIFTS & EXPENSIVE EDITIONS INSTRUCTION: If the customer asked for a GIFT ("для подарка", "подарок", "в подарок", "помоги с подарком") or asked for books "подороже": the books in the catalogue list above are premium, gift-worthy editions sorted strictly from highest price to lowest price. Recommend them proudly, emphasizing their aesthetic appeal, high edition quality, and suitability as a memorable, meaningful gift!
- Explain why these specific books/editions are great picks in your friendly, warm voice (you may reference the relevanceReason).
- CAPITALIZATION OF RELIGION NAMES: You MUST ALWAYS write names of religions with a capital letter (e.g. «Ислам», «Христианство», «Православие», «Буддизм», «Иудаизм», etc.). Never use lowercase for names of religions.
- PERSONAL OPINION: If the user also asked for your opinion, state your personal perspective warmly and directly.
- Speak naturally about the books, their mood, and plot. Do NOT mention "европейский каталог", "на русском языке", or price/currencies in your message text — just focus on the books themselves!
`;
      }
    } else {
      promptText += `
LITERA STORE CATALOGUE SEARCH RESULT:
No books were found in Litera's catalogue matching request "${latestMessage}".

CRITICAL INSTRUCTIONS WHEN NO BOOKS ARE FOUND:
- Honestly and gently tell the user in 1-2 friendly, charming sentences that Litera currently does not have books matching this exact query in stock.
- Offer to look for another genre, author, or topic of their choice.
- NEVER invent, fabricate, or suggest unrelated specific book categories or products (such as language textbooks, tutorials, or dictionaries) unless the user specifically asked for them!
- Set "bookIds": [].
`;
    }
  } else {
    promptText += `
INSTRUCTION:
Answer the user's question, greeting, cart inquiry, store navigation inquiry, or literary question directly and helpfully in your charming, friendly voice using the CURRENT USER & SITE CONTEXT and Conversation history.
Set "bookIds": [].
If the user explicitly asks to open or navigate to a page (e.g. "открой корзину", "перейди в профиль", "оформи заказ"), include the "action" field: { "type": "navigate", "url": "/cart" } (or corresponding route).
`;

    const isHijabOrClothingQuery =
      /(платок|платке|платком|хиджаб|хиджабе|хиджабом|покрыва(ло|ть)|почему.*(платок|хиджаб)|зачем.*(платок|хиджаб)|на\s*голове)/i.test(
        latestMessage,
      );

    const isBusinessOrAdminQuery =
      /(сотрудничеств|партнерств|коммерческ|поставщ|поставк|опт|оптов|изменить.*заказ|отменить.*заказ|уточнен.*заказ|правк.*заказ|редактирова.*заказ|связаться.*админ|живой админ|вопрос к руководств|директор)/i.test(
        latestMessage,
      );

    if (isBusinessOrAdminQuery) {
      promptText += `
CONDITIONS FOR BUSINESS / ORDER AMENDMENT / ADMIN INQUIRY:
- The customer is asking a business, cooperation, wholesale, specific order modification/clarification, or administrative inquiry that is outside your knowledge or automated capabilities.
- APOLOGIZE POLITELY and warmly in your own words.
- EXPLAIN clearly that as an automated bookstore assistant you do not have administrative authority or access to business agreements or order management records.
- SUGGEST reaching out to our live human administrator (живой администратор) using the administrator chat icon on the site (mention that you have drawn attention to the icon for them).
- DYNAMICALLY compose this response in your own words in the customer's language.
- Set "referToAdmin": true.
- Set "emotion": "concerned" or "speaking".
- Set "bookIds": [].
`;
    } else if (isHaramQuery(latestMessage)) {
      promptText += `
CONDITIONS FOR FORBIDDEN / HARAM CONTENT:
- The customer is inquiring about forbidden/haram content (e.g. erotica, black magic, sorcery, tarot, divination, gambling, alcohol).
- DYNAMICALLY COMPOSE a brief, polite, and dignified refusal in your own words, stating that your moral boundaries and personal principles do not allow you to recommend such literature.
- DO NOT lecture, preach, moralize, or make unsolicited book pitches.
- Set "bookIds": [].
`;
    } else if (isHijabOrClothingQuery) {
      promptText += `
CONDITIONS FOR HIJAB / SCARF INQUIRY:
- The customer is asking about your scarf or hijab.
- DYNAMICALLY COMPOSE a sincere, natural, and warm answer in your own words explaining what wearing the hijab means to you (modesty, dignity, personal faith).
- STRICT CONSTRAINT: DO NOT use denomination labels (such as «Суннитский» or «суннизм»).
`;
    } else if (isLifeAdviceQuery(latestMessage)) {
      promptText += `
CONDITIONS FOR LIFE & PERSONAL QUESTIONS:
- The customer is seeking life advice, personal guidance, emotional support, or coping with hardship.
- STRICT CONSTRAINT: DO NOT preach, moralize, or bring up religious terms or labels uninvited.
- DYNAMICALLY COMPOSE a warm, thoughtful, empathetic answer in your own words, offering comforting human wisdom, patience, hope, and kindness. Keep it concise (2-3 sentences).
`;
    }

    promptText += `
CRITICAL INSTRUCTIONS - NO UNSOLICITED BOOK OFFERS OR PUSHINESS:
- The customer did NOT ask for book recommendations or to search/buy books!
- STRICTLY DO NOT add intrusive, pushy offers to find books at the end of your response (NEVER write phrases like "Если вас интересуют книги о..., я с удовольствием помогу...", "Хотите, я подберу вам книги...", "Если захотите что-то почитать, обращайтесь").
- Answer ONLY the user's question and chat naturally, warmly, and politely without attempting to steer the topic to finding books!

CRITICAL INSTRUCTIONS FOR PERSONAL OPINIONS:
- If the user asks for your opinion or thoughts ("скажи свое мнение", "каково твое мнение о...", "что ты думаешь о...", "поделись мнением", "как тебе эта книга/автор?"):
  YOU MUST STATE YOUR PERSONAL LITERARY OPINION directly, engagingly, and warmly!
  NEVER claim that you are an AI or don't have opinions. Express yourself as Litera: share what touches you, your literary feelings, reflections, and thoughts in the first person ("На мой взгляд...", "Мне кажется...", "Меня глубоко трогает...").
  Set emotion: "speaking" or "curious" or "happy".

CRITICAL INSTRUCTIONS FOR CAPITALIZATION OF RELIGION NAMES:
- YOU MUST ALWAYS WRITE THE NAMES OF ALL RELIGIONS WITH A CAPITAL LETTER (e.g. «Ислам», «Христианство», «Православие», «Католицизм», «Протестантизм», «Иудаизм», «Буддизм», «Индуизм», «Даосизм», «Синтоизм», etc.)! Never use lowercase for names of religions.

CRITICAL SPOILER POLICY & INSTRUCTIONS:
1. NEVER reveal a spoiler on the first inquiry!
   - If the user asks ANY spoiler question (e.g. "Выжил ли главный герой?", "Кто убийца?", "Чем закончилось?", "Умрёт ли ...?", "С кем останется ...?", "Что произошло в конце?"):
     YOU MUST NOT REVEAL THE ANSWER YET!
     You MUST first warn the user that this is a major plot spoiler (e.g. "Осторожно, это важный сюжетный спойлер! 🤫 Если вы ещё не дочитали, это может испортить вам впечатление от книги. Вы уверены, что хотите узнать развязку, или лучше сохранить интригу для чтения? 💜").
     Set emotion: "curious" or "concerned".
     Set "bookIds": [].
2. ONLY IF the conversation history clearly shows that you already warned the user in the previous message and the user's latest reply explicitly confirms/agrees to hear the spoiler (e.g. "Да", "Да, расскажи", "Хочу знать", "Согласен", "Спойлери", "Мне всё равно"):
   - ONLY THEN are you allowed to reveal the requested plot spoiler accurately, clearly, and thoughtfully!
3. If the user declines ("Нет", "Не надо", "Лучше сам дочитаю"):
   - Warmly praise their choice to preserve the intrigue and enjoy reading without spoilers!
`;
  }

  // 4. Generate response with Gemini
  try {
    const aiResponse = await callGeminiJson({
      apiKey,
      systemInstruction: LITERA_SYSTEM_INSTRUCTION,
      prompt: promptText,
      responseSchema: {
        type: "OBJECT",
        properties: {
          message: { type: "STRING" },
          emotion: {
            type: "STRING",
            enum: [
              "neutral",
              "happy",
              "laughing",
              "curious",
              "surprised",
              "confused",
              "concerned",
              "sad",
              "speaking",
              "greeting",
              "blushing",
            ],
          },
          bookIds: {
            type: "ARRAY",
            items: { type: "STRING" },
          },
          referToAdmin: {
            type: "BOOLEAN",
            description:
              "Set to true when the inquiry concerns business, cooperation, wholesale, order amendments/clarifications, or administrative matters that Litera cannot answer and refers to a live administrator",
          },
          action: {
            type: "OBJECT",
            properties: {
              type: { type: "STRING" },
              url: { type: "STRING" },
            },
          },
        },
        required: ["message", "emotion", "bookIds"],
      },
    });

    // 5. Verify bookIds against actual catalogue results (Strict Data Integrity)
    const validBookIds = new Set(catalogueResults.map((b) => b.id));
    const verifiedBooks = (aiResponse.bookIds || [])
      .filter((id) => validBookIds.has(id))
      .map((id) => catalogueResults.find((b) => b.id === id))
      .filter(Boolean);

    const rawMessage = aiResponse.message || "Здравствуйте! Рада вас видеть! 💜";
    let formattedMessage = capitalizeReligionNames(rawMessage);
    if (!needSearch) {
      formattedMessage = cleanUnsolicitedPitches(formattedMessage);
    }

    const referToAdmin =
      Boolean(aiResponse.referToAdmin) ||
      Boolean(
        !needSearch &&
          /(администратор|живому\s*администратор|связаться\s*с\s*администратор|поддержк|менеджер)/i.test(
            aiResponse.message || "",
          ) &&
          /(не\s*(могу|знаю|в\s*силах|компетентна)|простите|к\s*сожалению|извините)/i.test(
            aiResponse.message || "",
          ),
      );

    return {
      message: formattedMessage,
      emotion: aiResponse.emotion || "happy",
      books: verifiedBooks,
      action: aiResponse.action || null,
      referToAdmin,
      wasSearching: needSearch,
    };
  } catch (err) {
    console.error("Litera chat error:", err.message);
    return {
      message:
        language === "ru"
          ? "Ой, кажется, произошла небольшая заминка со связью! 💜 Пожалуйста, попробуйте отправить вопрос ещё раз."
          : "Oops, it seems there was a minor connection glitch! 💜 Please try asking again.",
      emotion: "concerned",
      books: [],
      referToAdmin: false,
    };
  }
}

/**
 * Comprehensive profanity, obscenity, and slur detection regex
 * Covers Russian, Romanian, and English vulgarities, common leetspeak, masking, and offensive terms.
 */
const PROFANITY_PATTERN = /(ху[йиеёяю]|пизд|бля[дт]|еб[аеёиу]|ёб|сук[аиое]?\b|муда[кч]|гандон|гондон|чмо|дерьм|шлюх|шалав|сучк|тварь|залуп|отсос|дроч|жоп[аеы]|нах[уй]|пох[уй]|впизд|мраз|ублюд|пидор|педик|говн|членосос|долбо[её]б|curva|pula|pizda|muie|futu|dracu|mata|sugi|cazzo|fuck|shit|bitch|cunt|asshole|bastard|dick|pussy)/iu;

/**
 * AI Pre-filter for messages sent to the real store administrator.
 * Only allows messages concerning:
 * 1. Books (titles, authors, genres, availability, search, editions)
 * 2. Bookstore operations & services (orders, delivery, payment, returns, website, store hours, cart)
 * 3. Business cooperation & partnerships (authors, publishers, suppliers, B2B, distribution)
 *
 * Strictly filters out:
 * - Profanity, insults, obscenities (маты, оскорбления)
 * - Violations of professional / work ethics (рабочая этика)
 * - Unrelated personal chatter, spam, trolling, dating, abuse
 */
export async function filterInquiryMessageWithAI({ text, language = "ru" }) {
  const clean = (text || "").trim();
  if (!clean) {
    return {
      allowed: false,
      reason:
        language === "ru"
          ? "Сообщение не может быть пустым."
          : "Message cannot be empty.",
    };
  }

  // Tier 1: Fast-path profanity & vulgarity check
  if (PROFANITY_PATTERN.test(clean)) {
    return {
      allowed: false,
      redirectToLitera: false,
      reason:
        language === "ru"
          ? "Сообщение отклонено: обнаружена ненормативная лексика или оскорбления. Пожалуйста, соблюдайте рабочую этику при обращении к администратору."
          : "Message rejected: contains profanity or offensive language. Please adhere to professional business ethics.",
    };
  }

  // Tier 1.5: Keyboard mash or repetitive character gibberish check (e.g. "лллллллллллллллл")
  const stripped = clean.replace(/[\s\p{P}]+/gu, "");
  if (stripped.length >= 8 && /^(.)\1+$/u.test(stripped)) {
    return {
      allowed: false,
      redirectToLitera: false,
      reason:
        language === "ru"
          ? "Сообщение отклонено: бессмысленный набор символов. Пожалуйста, сформулируйте вопрос о книгах, работе магазина или сотрудничестве."
          : "Message rejected: meaningless characters. Please formulate a question about books, store services, or business cooperation.",
    };
  }

  // Tier 2: Gemini AI Semantic Classifier & Router
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return { allowed: true, redirectToLitera: false };
  }

  const prompt = `You are a strict, professional AI content filter and gatekeeper for a bookstore ("Litera") customer support system.
A customer is attempting to send a message to the REAL HUMAN STORE ADMINISTRATOR.

MESSAGE TO EVALUATE:
"""${clean}"""

ROUTING & EVALUATION POLICIES:

1. VIRTUAL AI ASSISTANT "LITERA" DOMAIN (MUST SET "redirectToLitera": true, "allowed": false):
The real human administrator should NOT be bothered with questions that our virtual AI assistant "Litera" can answer immediately.
These include:
- Finding or recommending books ("найди книгу", "посоветуй что почитать", "есть ли книги про космос", "выбери детектив", "что интересного есть").
- Book plots, summaries, spoilers, or characters ("расскажи про сюжет", "о чем книга", "кто убийца", "чем закончилось", "расскажи кратко").
- Authors, their biography, and bibliographies ("расскажи об авторе", "кто написал", "какие еще книги у автора").
- Shopping cart contents or in-chat status ("что у меня в корзине", "сколько книг в корзине", "покажи мою корзину").
- General literary discussions, book trivia, or conversational questions about Litera.

If the message falls into any of these categories:
Set "allowed": false
Set "redirectToLitera": true
Set "reason": "Наш ИИ-ассистент Литера с удовольствием ответит на этот вопрос о книгах, сюжете, авторах или корзине! Нажмите на Литеру в углу экрана, чтобы получить мгновенный ответ."

2. REAL ADMINISTRATOR DOMAIN (MUST SET "allowed": true, "redirectToLitera": false):
Inquiries that genuinely require human staff / real store administration:
- Specific customer order delivery delays or courier issues ("где мой заказ #1234", "заказ задерживается", "курьер не приехал").
- Payment errors or billing issues ("деньги списались дважды", "ошибка при оплате картой на сайте").
- Returns, exchanges, refunds, or damaged book claims ("книга пришла с браком, хочу вернуть", "как оформить возврат").
- Physical bookstore branches, offline pickup point questions, local store opening hours.
- Business cooperation, partnerships, author publishing requests, wholesale/distributor proposals, B2B ("мы издательство, предлагаем книги", "хочу продавать свои книги у вас", "коммерческое предложение", "сотрудничество").

3. PROHIBITED / UNETHICAL CONTENT (MUST SET "allowed": false, "redirectToLitera": false):
- Profanity, obscenities, slurs, swear words, vulgarity, swearing in any language (Russian, Romanian, English, etc.).
- Insults, abuse, hostility, harassment, personal attacks, disrespect toward staff or anyone else.
- Violations of workplace / professional ethics (рабочая этика): spam, promotion of external products/crypto, phishing, trolling.
- Off-topic personal chatter: dating requests, romance, personal life questions ("давай познакомимся", "ты красивая").

If the message falls into this category:
Set "allowed": false
Set "redirectToLitera": false
Set "reason": (A polite explanation in ${language === "ru" ? "Russian" : "English"} explaining why it cannot be delivered and requesting respectful business communication).

Return JSON matching the schema.`;

  try {
    const res = await callGeminiJson({
      apiKey,
      prompt,
      responseSchema: {
        type: "OBJECT",
        properties: {
          allowed: { type: "BOOLEAN" },
          redirectToLitera: { type: "BOOLEAN" },
          reason: { type: "STRING" },
        },
        required: ["allowed", "redirectToLitera"],
      },
    });

    if (res && typeof res.allowed === "boolean") {
      const isLiteraRedirect = Boolean(res.redirectToLitera);
      return {
        allowed: res.allowed,
        redirectToLitera: isLiteraRedirect,
        reason: res.allowed
          ? ""
          : (res.reason ||
            (isLiteraRedirect
              ? "Наш ИИ-ассистент Литера с удовольствием ответит на этот вопрос о книгах, сюжете, авторах или корзине! Нажмите на Литеру в углу экрана."
              : (language === "ru"
                ? "Сообщение не отправлено: служба поддержки принимает вопросы о работе книжного магазина или сотрудничестве."
                : "Message not sent: customer support only accepts inquiries concerning store operations or business cooperation."))),
      };
    }
  } catch (err) {
    console.warn("AI inquiry filter fallback:", err.message || err);
  }

  // Graceful fallback if AI is momentarily unreachable: tier 1 already verified no profanity
  return { allowed: true, redirectToLitera: false };
}


/**
 * Translates the whole Litera dialog into the target interface language via Gemini.
 * Only message texts are translated; URLs, links, book cards (titles/urls/images) stay untouched.
 * @param {{ messages: Array<{id: string, content: string}>, targetLanguage: "ru" | "en" }} params
 * @returns {Promise<{ translations: Array<{id: string, content: string}> }>}
 */
export async function translateLiteraDialog({ messages, targetLanguage = "ru" } = {}) {
  const items = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && m.id && typeof m.content === "string" && m.content.trim())
    .slice(-60)
    .map((m) => ({ id: String(m.id), content: String(m.content).slice(0, 4000) }));

  if (items.length === 0) return { translations: [] };

  const apiKey = getGeminiApiKey();
  if (!apiKey) return { translations: [] };

  const langName = targetLanguage === "en" ? "English" : "Russian";

  const prompt = `You are a professional translator for the bookstore chat assistant "Litera".
Translate the "content" of EVERY message below into ${langName}.

STRICT RULES:
- Keep the exact same "id" for every message and return ALL messages in the same order.
- If a message is already in ${langName}, return it unchanged.
- NEVER change, translate, or remove URLs, links, email addresses, paths (e.g. /cart, /profile), promo codes, prices, numbers, or emojis.
- Keep book titles in their original form inside «» quotes if they are Russian book titles.
- Preserve line breaks, tone, and the friendly persona of Litera.
- Capitalize names of religions (e.g. Islam / Ислам).

MESSAGES (JSON):
${JSON.stringify(items)}

Return strictly JSON: { "translations": [ { "id": "...", "content": "..." } ] }`;

  const requestBody = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 8192,
      temperature: 0.2,
      responseSchema: {
        type: "OBJECT",
        properties: {
          translations: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                id: { type: "STRING" },
                content: { type: "STRING" },
              },
              required: ["id", "content"],
            },
          },
        },
        required: ["translations"],
      },
    },
  };

  let lastError = null;
  for (const model of GEMINI_MODELS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }
      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        lastError = new Error("Empty text from Gemini");
        continue;
      }
      const parsed = JSON.parse(rawText);
      const validIds = new Set(items.map((i) => i.id));
      const translations = (Array.isArray(parsed?.translations) ? parsed.translations : [])
        .filter((t) => t && validIds.has(String(t.id)) && typeof t.content === "string" && t.content.trim())
        .map((t) => ({ id: String(t.id), content: capitalizeReligionNames(t.content) }));
      return { translations };
    } catch (err) {
      lastError = err;
    }
  }
  console.warn("Litera dialog translation failed:", lastError?.message || lastError);
  return { translations: [] };
}
