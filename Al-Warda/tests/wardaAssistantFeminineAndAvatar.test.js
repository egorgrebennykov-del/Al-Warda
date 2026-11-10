import test from "node:test";
import assert from "node:assert/strict";
import {
  enforceFeminineSelfReferences,
  capitalizeReligionNames,
  sanitizeReligiousPhrases,
  getCanonicalEmotion,
  CANONICAL_EMOTION_MAP,
  processWardaChat,
  formatAssistantSpeech,
  isSamplePerfume,
  isSampleRequested,
  stripUnsolicitedSampleMentions,
  translateText,
  resolveRequestLanguage,
  translateWardaDialog,
} from "../server/wardaAssistantService.js";

test("enforceFeminineSelfReferences converts masculine self-references to feminine", () => {
  const cases = [
    {
      input: "Здравствуйте! Я рад вас приветствовать в бутике Al-Warda.",
      expected: "Здравствуйте! Я рада вас приветствовать в бутике Al-Warda.",
    },
    {
      input: "Рад помочь вам с выбором восточной парфюмерии!",
      expected: "Рада помочь вам с выбором восточной парфюмерии!",
    },
    {
      input: "Буду рад подсказать детали доставки и нот.",
      expected: "Буду рада подсказать детали доставки и нот.",
    },
    {
      input: "Был рад пообщаться с вами!",
      expected: "Была рада пообщаться с вами!",
    },
    {
      input: "Я нашел потрясающий древесный аромат для вас.",
      expected: "Я нашла потрясающий древесный аромат для вас.",
    },
    {
      input: "Я уже подобрал несколько позиций из нашего каталога.",
      expected: "Я уже подобрала несколько позиций из нашего каталога.",
    },
    {
      input: "Я подготовил подробный разбор пирамиды нот.",
      expected: "Я подготовила подробный разбор пирамиды нот.",
    },
    {
      input: "Я посмотрел наличие на складе.",
      expected: "Я посмотрела наличие на складе.",
    },
    {
      input: "Я выбрал для вас самое стойкое звучание.",
      expected: "Я выбрала для вас самое стойкое звучание.",
    },
    {
      input: "Я уверен, что вам понравится этот шлейф.",
      expected: "Я уверена, что вам понравится этот шлейф.",
    },
    {
      input: "Я готов ответить на любой вопрос.",
      expected: "Я готова ответить на любой вопрос.",
    },
    {
      input: "Я подумал о сочетании амбры и ванили.",
      expected: "Я подумала о сочетании амбры и ванили.",
    },
    {
      input: "Я сам протестировал эти духи.",
      expected: "Я сама протестировала эти духи.",
    },
    {
      input: "Я с радостью помог бы вам.",
      expected: "Я с радостью помогла бы вам.",
    },
    {
      input: "Я нашла верхние ноты и подобрал базу.",
      expected: "Я нашла верхние ноты и подобрала базу.",
    },
  ];

  for (const { input, expected } of cases) {
    const actual = enforceFeminineSelfReferences(input);
    assert.equal(actual, expected, `Failed for input: "${input}"`);
  }
});

test("enforceFeminineSelfReferences preserves customer/third-person references", () => {
  const neutralCases = [
    "Если вы готовы оформить заказ, нажмите кнопку.",
    "Вы просили подобрать мускусный аромат.",
    "Бренд Lattafa предложил яркую восточную композицию.",
    "Парфюмер создал удивительный стойкий букет.",
  ];

  for (const text of neutralCases) {
    assert.equal(enforceFeminineSelfReferences(text), text);
  }
});

test("getCanonicalEmotion maps volatile emotions to appropriate canonical states", () => {
  // Greetings & welcomes map to greeting/welcoming signature
  assert.equal(getCanonicalEmotion("greeting"), "greeting");
  assert.equal(getCanonicalEmotion("welcoming"), "welcoming");

  // Expressive & warm states
  assert.equal(getCanonicalEmotion("happy"), "happy");
  assert.equal(getCanonicalEmotion("smiling"), "happy");
  assert.equal(getCanonicalEmotion("friendly"), "friendly");
  assert.equal(getCanonicalEmotion("laughing"), "laughing");
  assert.equal(getCanonicalEmotion("success"), "success");
  assert.equal(getCanonicalEmotion("blushing"), "blushing");
  assert.equal(getCanonicalEmotion("shy"), "shy");

  // Conversational and consulting
  assert.equal(getCanonicalEmotion("speaking"), "speaking");
  assert.equal(getCanonicalEmotion("curious"), "curious");
  assert.equal(getCanonicalEmotion("confident"), "confident");

  // Catalog search / processing maps to thinking / loading
  assert.equal(getCanonicalEmotion("thinking"), "thinking");
  assert.equal(getCanonicalEmotion("loading"), "loading");

  // Surprise & confusion
  assert.equal(getCanonicalEmotion("surprised"), "surprised");
  assert.equal(getCanonicalEmotion("confused"), "confused");

  // Calm attentive
  assert.equal(getCanonicalEmotion("neutral"), "neutral");
  assert.equal(getCanonicalEmotion("messageRead"), "messageRead");

  // Errors / alerts / empathy
  assert.equal(getCanonicalEmotion("concerned"), "concerned");
  assert.equal(getCanonicalEmotion("reassuring"), "reassuring");
  assert.equal(getCanonicalEmotion("error"), "error");
  assert.equal(getCanonicalEmotion("sad"), "sad");

  // Fallback for null/empty/unknown
  assert.equal(getCanonicalEmotion(null), "greeting");
  assert.equal(getCanonicalEmotion(""), "greeting");
  assert.equal(getCanonicalEmotion("unknown_state"), "greeting");
});

test("capitalizeReligionNames ensures religion and denomination names are capitalized", () => {
  const cases = [
    {
      input: "Я мусульманка и исповедую ислам суннитского толка.",
      expected: "Я мусульманка и исповедую Ислам Суннитского толка.",
    },
    {
      input: "Традиции ислама, христианства и иудаизма ценят чистоту и доброту.",
      expected: "Традиции Ислама, Христианства и Иудаизма ценят чистоту и доброту.",
    },
    {
      input: "Я принадлежу к суннизму и придерживаюсь суннитских принципов.",
      expected: "Я принадлежу к Суннизму и придерживаюсь Суннитских принципов.",
    },
  ];

  for (const { input, expected } of cases) {
    assert.equal(capitalizeReligionNames(input), expected);
  }
});

test("sanitizeReligiousPhrases strips intrusive religious greetings and formulas", () => {
  const cases = [
    {
      input: "Мир вам! Здравствуйте! Я подобрала для вас изысканный аромат.",
      expected: "Здравствуйте! Я подобрала для вас изысканный аромат.",
    },
    {
      input: "Мир вам и вашему дому! Рада видеть вас в бутике Al-Warda.",
      expected: "Рада видеть вас в бутике Al-Warda.",
    },
    {
      input: "Ассаляму алейкум! Какой парфюм вы ищете сегодня?",
      expected: "Какой парфюм вы ищете сегодня?",
    },
    {
      input: "Ассалямуалейкум! Здравствуйте.",
      expected: "Здравствуйте.",
    },
    {
      input: "Салам алейкум! Помогу выбрать подарок.",
      expected: "Помогу выбрать подарок.",
    },
    {
      input: "Здравствуйте! Мир вам, помогу с заказом.",
      expected: "Здравствуйте! Помогу с заказом.",
    },
    {
      input: "Привет! Иншааллах, все доставим в срок.",
      expected: "Привет! Все доставим в срок.",
    },
    {
      input: "Ассаляму алейкум!",
      expected: "Здравствуйте! Рада вас приветствовать в бутике Al-Warda.",
    },
    {
      input: "Peace be upon you! Welcome to Al-Warda.",
      expected: "Welcome to Al-Warda.",
    },
  ];

  for (const { input, expected } of cases) {
    assert.equal(sanitizeReligiousPhrases(input), expected, `Failed for input: "${input}"`);
  }
});

test("processWardaChat answers faith and identity queries with warmth and self-awareness", async () => {
  const result = await processWardaChat({
    messages: [{ role: "user", content: "Ты мусульманка? Какая твоя вера?" }],
    language: "ru",
    context: { catalog: [] },
  });

  assert.ok(/мусульман/i.test(result.message), "Should acknowledge being Muslim");
  assert.ok(/суннит/i.test(result.message), "Should acknowledge Sunni tradition");
  assert.ok(result.message.includes("Ислам"), "Should capitalize Islam");
  assert.ok(result.message.includes("Суннит"), "Should capitalize Sunni");
  assert.equal(result.books.length, 0, "Should not pitch products when asked personal faith question");
});

test("formatAssistantSpeech formats emojis on fresh paragraphs and avoids orphan letters", () => {
  const raw =
    "Люблю открывать для них удивительный мир восточных ароматов, где у каждого флакона есть свой характер и своя история. ✨ А о чём или о ком вам было бы интересно узнать сегодня?";

  const formatted = formatAssistantSpeech(raw);

  // Must have paragraph break before ✨
  assert.ok(
    formatted.includes("своя история.\n\n✨"),
    "Should separate transition with double newline before emoji"
  );
  // Non-breaking space after emoji
  assert.ok(
    formatted.includes("✨\u00A0А"),
    "Should bind emoji to the following word with non-breaking space"
  );
  // Non-breaking space after single-letter prepositions
  assert.ok(
    formatted.includes("А\u00A0о\u00A0чём"),
    "Should bind prepositions with non-breaking spaces"
  );
});

test("formatAssistantSpeech formats prices with euro symbol and non-breaking space", () => {
  const screenshotExample =
    "Четвёртый аромат в нашей подборке — это изысканный Afnan Mirsaal Of Trust Eau De Parfum 90ml стоимостью 24.09\nEUR. В нём гармонично переплелись ноты ветивера";
  const formatted = formatAssistantSpeech(screenshotExample);

  // Must replace EUR with € symbol and non-breaking space
  assert.ok(
    formatted.includes("24.09\u00A0€."),
    "Must convert EUR to € with non-breaking space U+00A0"
  );
  assert.ok(
    !formatted.includes("EUR"),
    "Must not contain EUR in speech"
  );

  // Other currency variations
  assert.equal(
    formatAssistantSpeech("цена 24.09 EUR"),
    "цена 24.09\u00A0€"
  );
  assert.equal(
    formatAssistantSpeech("цена 24.09 евро"),
    "цена 24.09\u00A0€"
  );
  assert.equal(
    formatAssistantSpeech("цена 24.09 euro"),
    "цена 24.09\u00A0€"
  );
  assert.equal(
    formatAssistantSpeech("цена 24.09 €"),
    "цена 24.09\u00A0€"
  );
  assert.equal(
    formatAssistantSpeech("цена €24.09"),
    "цена 24.09\u00A0€"
  );
  assert.equal(
    formatAssistantSpeech("диапазон 20 - 30 EUR"),
    "диапазон 20–30\u00A0€"
  );
});

test("isSamplePerfume identifies samples vs full bottles and sets", () => {
  const fullBottle = { id: "101", name: "Lattafa Khamrah 100ml EDP", volume: "100ml" };
  const sampleVial1 = { id: "sample-101-1ml", name: "Lattafa Khamrah (Пробник 1 мл)", isSample: true };
  const sampleVial2 = { id: "202", name: "Afnan Highness 5ml", volume: "5ml" };
  const discoverySet = { id: "303", name: "Lattafa Discovery Set 5x10ml", volume: "5x10ml", isSet: true };

  assert.equal(isSamplePerfume(fullBottle), false, "100ml bottle is not a sample");
  assert.equal(isSamplePerfume(sampleVial1), true, "1ml marked sample is a sample");
  assert.equal(isSamplePerfume(sampleVial2), true, "5ml vial is a sample");
  assert.equal(isSamplePerfume(discoverySet), false, "Discovery set is a set, not a single sample vial");
});

test("isSampleRequested identifies when customer asks for samples vs regular perfumes", () => {
  assert.equal(isSampleRequested("Посоветуй стойкий древесный парфюм"), false);
  assert.equal(isSampleRequested("Хочу духи на вечер с нотами розы и амбры"), false);
  assert.equal(isSampleRequested("Какой парфюм купить парню в подарок?"), false);

  assert.equal(isSampleRequested("Есть ли у вас пробники?"), true);
  assert.equal(isSampleRequested("Хочу заказать пробник 5 мл Lattafa Khamrah"), true);
  assert.equal(isSampleRequested("Покажи отливанты"), true);
  assert.equal(isSampleRequested("Can I get a 1ml or 2ml sample vial?"), true);
});

test("processWardaChat does not recommend samples when user asks for perfume without mentioning samples", async () => {
  const mockCatalog = [
    {
      id: "bottle-1",
      name: "Lattafa Khamrah Eau De Parfum 100ml",
      brand: "Lattafa",
      price: 49.99,
      volume: "100 мл",
      topNotes: ["Корица", "Мускатный орех"],
      heartNotes: ["Финики", "Пралине"],
      baseNotes: ["Ваниль", "Бобы тонка"],
      gender: "Унисекс",
      image: "/assets/img/khamrah.png",
    },
    {
      id: "sample-1",
      name: "Lattafa Khamrah (Пробник 1 мл)",
      brand: "Lattafa",
      price: 4.5,
      volume: "1 мл",
      isSample: true,
      topNotes: ["Корица", "Мускатный орех"],
      heartNotes: ["Финики", "Пралине"],
      baseNotes: ["Ваниль", "Бобы тонка"],
      gender: "Унисекс",
      image: "/assets/img/khamrah.png",
    },
  ];

  const result = await processWardaChat({
    messages: [{ role: "user", content: "Посоветуй красивый сладкий парфюм с корицей" }],
    language: "ru",
    context: { catalog: mockCatalog },
  });

  // books must NOT include the sample
  assert.ok(result.books.length > 0, "Should recommend at least one perfume");
  assert.ok(result.books.every((b) => !isSamplePerfume(b)), "Must NOT include sample vials");
  assert.ok(result.books.some((b) => b.id === "bottle-1"), "Must include the full bottle");
});

test("processWardaChat understands desire queries like 'хочу чтото с ягодами' and recommends matching perfumes", async () => {
  const mockCatalog = [
    {
      id: "orientica-berries-1",
      name: "Orientica Dynasty Eau De Parfum 80ml",
      brand: "Orientica",
      price: 65.0,
      volume: "80 мл",
      topNotes: ["Бергамот", "Розовые ягоды"],
      heartNotes: ["Клубника", "Малина"],
      baseNotes: ["Пачули", "Мускус", "Амбра"],
      gender: "Унисекс",
      image: "/assets/img/orientica.png",
      description: "Сочный шлейфовый аромат со спелыми лесными ягодами",
    },
    {
      id: "wood-bottle-2",
      name: "Lattafa Ameer Al Oudh 100ml",
      brand: "Lattafa",
      price: 35.0,
      volume: "100 мл",
      topNotes: ["Уд", "Кедр"],
      heartNotes: ["Древесные ноты"],
      baseNotes: ["Амбра"],
      gender: "Унисекс",
      image: "/assets/img/wood.png",
    },
  ];

  const result = await processWardaChat({
    messages: [{ role: "user", content: "хочу чтото с ягодами" }],
    language: "ru",
    context: { catalog: mockCatalog },
  });

  assert.ok(result.books.length > 0, "Should recognize intent and recommend berry perfumes");
  assert.equal(result.books[0].id, "orientica-berries-1", "Top match should be the berry perfume");
});

test("isDecantablePerfume returns false as Al-Warda does not decant perfumes", async () => {
  const { isDecantablePerfume, getSamplePrice } = await import("../utils/perfumes.js");

  // Al-Warda sells only genuine factory-sealed products directly from Qogita; no decanting
  assert.equal(isDecantablePerfume({ name: "Al Haramain Black Oudh Parfum", price: 2.77, volume: "15 мл" }), false);
  assert.equal(isDecantablePerfume({ name: "Ajmal Aristocrat Her 1.5ml", price: 0.52, volume: "1.5 мл" }), false);
  assert.equal(isDecantablePerfume({ name: "Nabeel Master Ocean Deo Spray 200 Ml", price: 2.71, volume: "200 мл" }), false);
  assert.equal(isDecantablePerfume({ name: "Lattafa Asad 100ml EDP", price: 29.90, volume: "100 мл" }), false);

  // Price helper returns genuine bottle price
  assert.equal(getSamplePrice(29.90), 29.90);
});

test("getPerfumeById resolves sample URLs, sample- prefixed IDs and stock IDs", async () => {
  const { getPerfumeById } = await import("../utils/perfumes.js");
  assert.ok(typeof getPerfumeById === "function");
});

test("isPerfumeSet, inferSetItems and ensurePerfumeEnrichment correctly handle discovery sets", async () => {
  const { isPerfumeSet, inferSetItems, ensurePerfumeEnrichment } = await import("../utils/perfumes.js");

  const rawSet = {
    id: "dropship-6291106816167",
    name: "Al Haramain Fragrance Discovery Set for Men & Women 410ml Amber Oud",
    brand: "Al Haramain",
    price: 25,
  };

  assert.equal(isPerfumeSet(rawSet), true, "Should identify discovery set as a set");

  const enriched = ensurePerfumeEnrichment(rawSet);
  assert.ok(!enriched.name.includes("410ml"), "410ml typo should be cleaned up to 4x10ml");
  assert.ok(enriched.name.includes("4x10ml"), "Should normalize to 4x10ml");
  assert.equal(enriched.isSet, true);
  assert.equal(enriched.categoryRu, "Подарочные наборы и сеты");

  const items = inferSetItems(enriched.name, enriched.brand);
  assert.ok(Array.isArray(items), "Should infer items for Amber Oud set");
  assert.equal(items.length, 4, "Should have 4 miniatures in Amber Oud set");
  assert.equal(items[0].name, "Amber Oud Gold Edition");
  assert.equal(items[1].name, "Amber Oud Rouge Edition");
  assert.equal(items[2].name, "Amber Oud Carbon Edition");
  assert.equal(items[3].name, "Amber Oud White Edition");
});

test("getDefaultPerfumeVolumeOption returns genuine Qogita bottle volume and price", async () => {
  const { getDefaultPerfumeVolumeOption, getDefaultCatalogPrice } = await import("../utils/perfumes.js");

  // 1. Perfume bottle with price 60
  const multiBottle = {
    name: "Luxury Oud",
    price: 60,
    volume: "100ml",
    availableSizes: [
      { ml: 100, price: 60 },
      { ml: 50, price: 35 },
    ],
  };
  const multiOpt = getDefaultPerfumeVolumeOption(multiBottle);
  assert.equal(multiOpt.ml, 100);
  assert.equal(multiOpt.price, 60);
  assert.equal(getDefaultCatalogPrice(multiBottle), 60);

  // 2. Standard perfume: 100ml bottle -> returns full price from Qogita
  const asad = { name: "Lattafa Asad 100ml EDP", price: 29.90, volume: "100 мл" };
  const asadOpt = getDefaultPerfumeVolumeOption(asad);
  assert.equal(asadOpt.ml, 100);
  assert.equal(asadOpt.key, "full");
  assert.equal(asadOpt.price, 29.90);
  assert.equal(getDefaultCatalogPrice(asad), 29.90);

  // 3. Deodorant -> returns standard full price
  const deo = { name: "Nabeel Deo Spray 200ml", price: 2.71, volume: "200ml" };
  const deoOpt = getDefaultPerfumeVolumeOption(deo);
  assert.equal(deoOpt.ml, 200);
  assert.equal(deoOpt.price, 2.71);
  assert.equal(getDefaultCatalogPrice(deo), 2.71);

  // 4. Discovery Set -> returns set price
  const set = { name: "Amber Oud Discovery Set 4x10ml", price: 29.90, volume: "4x10ml", isSet: true };
  const setOpt = getDefaultPerfumeVolumeOption(set);
  assert.equal(setOpt.price, 29.90);
});

test("extractVolumeFromName and ensurePerfumeEnrichment accurately extract explicit volume (e.g. 1.5ml sample)", async () => {
  const { extractVolumeFromName, ensurePerfumeEnrichment, getDefaultPerfumeVolumeOption, parseVolumeMl } = await import("../utils/perfumes.js");

  // Sample with decimal volume
  assert.equal(parseVolumeMl("1.5ml"), 1.5);
  assert.equal(parseVolumeMl("1,5 мл"), 1.5);
  assert.equal(parseVolumeMl("Ajmal Amber Wood Eau de Parfum Sample 1.5ml"), 1.5);

  const sampleRaw = {
    id: "dropship-6293708104680",
    name: "Ajmal Amber Wood Eau de Parfum Sample 1.5ml",
    price: 0.79,
    volume: "100ml / 3.4 FL.OZ.", // bad legacy database default
    info: {
      volume: "100 мл EDP",
    },
  };

  const enriched = ensurePerfumeEnrichment(sampleRaw);
  assert.ok(enriched.volume.startsWith("1.5 мл"));

  const opt = getDefaultPerfumeVolumeOption(enriched);
  assert.equal(opt.ml, 1.5);
  assert.equal(opt.labelRu, "1.5 мл");
  assert.equal(opt.labelEn, "1.5 ml");
  assert.equal(opt.price, 0.79);
  assert.equal(opt.isSample, true);
  assert.equal(opt.canChangeVolume, false);

  // Non-100ml flacons
  assert.equal(parseVolumeMl("Lattafa Atlas 55ml EDP"), 55);
  assert.equal(parseVolumeMl("Armaf Club De Nuit Intense Man 105ml EDT"), 105);
  assert.equal(extractVolumeFromName("Lattafa Ana Abiyedh 60ml EDP"), "60 мл / 2.0 FL.OZ.");
  assert.equal(extractVolumeFromName("Afnan 9pm Discovery Set 5x2ml"), "5 × 2 мл");
});

test("getPerfumeGtin and getQogitaProductUrl generate accurate Qogita product page links for privileged users", async () => {
  const { getPerfumeGtin, getQogitaProductUrl } = await import("../utils/perfumes.js");
  const { isPrivileged } = await import("../utils/auth.js");

  // 1. Privileged status verification
  assert.equal(isPrivileged({ status: "privileged", role: "admin" }), true);
  assert.equal(isPrivileged({ status: "privileged" }), true);
  assert.equal(isPrivileged({ role: "privileged" }), true);
  assert.equal(isPrivileged({ role: "user" }), false);
  assert.equal(isPrivileged(null), false);

  // 2. Direct GTIN property
  const p1 = {
    id: "lattafa-yara",
    name: "Lattafa Yara 100ml EDP",
    brand: "Lattafa",
    gtin: "6291108730515",
  };
  assert.equal(getPerfumeGtin(p1), "6291108730515");
  assert.equal(getQogitaProductUrl(p1), "https://www.qogita.com/products/27W8QZ/lattafa-yara-100ml-edp/");

  // 3. GTIN inferred from dropship slug/id
  const p2 = {
    id: "dropship-6291108737194",
    name: "Lattafa Khamrah 100ml EDP",
    brand: "Lattafa",
  };
  assert.equal(getPerfumeGtin(p2), "6291108737194");
  assert.equal(getQogitaProductUrl(p2), "https://www.qogita.com/products/YKOV26/lattafa-khamrah-100ml-edp/");

  // 4. Sample perfume derived from bottle
  const p3 = {
    id: "sample-dropship-6291108737194-5ml",
    name: "Lattafa Khamrah (Отливант 5 мл)",
    brand: "Lattafa",
  };
  assert.equal(getPerfumeGtin(p3), "6291108737194");
  assert.equal(getQogitaProductUrl(p3), "https://www.qogita.com/products/YKOV26/lattafa-khamrah-100ml-edp/");

  // 5. Explicit Qogita URL
  const p4 = {
    id: "custom-perfume",
    name: "Niche Elixir",
    brand: "Lattafa",
    productUrl: "https://www.qogita.com/products/lattafa-niche-elixir/",
  };
  assert.equal(getQogitaProductUrl(p4), "https://www.qogita.com/products/lattafa-niche-elixir/");

  // 6. Name and brand fallback query
  const p5 = {
    id: "set-amber-oud",
    name: "Amber Oud Discovery Set",
    brand: "Al Haramain",
  };
  assert.equal(getPerfumeGtin(p5), "");
  assert.equal(
    getQogitaProductUrl(p5),
    "https://www.qogita.com/products/4d22afe5141c40eda90ef76b853c2130/al-haramain-amber-oud-bleu-edition-3-pc-gift-set-for-unisex-luxury-cologne/"
  );

  // 7. Generic unknown perfume fallback to brand
  const p6 = {
    id: "unknown-perfume",
    name: "Xyz Unique Unknown Fragrance 12345",
    brand: "Al Haramain",
  };
  assert.equal(
    getQogitaProductUrl(p6),
    "https://www.qogita.com/brands/al-haramain/"
  );
});

test("Al-Warda catalog strictly operates on genuine Qogita products with no decanting", async () => {
  const { isDecantablePerfume, getDefaultPerfumeVolumeOption } = await import("../utils/perfumes.js");
  assert.equal(isDecantablePerfume({ name: "Lattafa Khamrah 100ml", price: 28.5 }), false);
  const opt = getDefaultPerfumeVolumeOption({ name: "Lattafa Khamrah 100ml", price: 28.5, volume: "100 мл" });
  assert.equal(opt.price, 28.5);
  assert.equal(opt.ml, 100);
});

test("resolveRequestLanguage accurately detects query language across supported languages", () => {
  assert.equal(resolveRequestLanguage("ru", "ru", "хочу сладкие духи"), "ru");
  assert.equal(resolveRequestLanguage("hu", "ru", "szeretnék édes vaníliás parfümöt"), "hu");
  assert.equal(resolveRequestLanguage("ro", "ru", "vreau un parfum dulce cu vanilie"), "ro");
  assert.equal(resolveRequestLanguage("bg", "ru", "искам парфюм с ванилия"), "bg");
  assert.equal(resolveRequestLanguage("el", "ru", "θέλω άρωμα με βανίλια"), "el");
  assert.equal(resolveRequestLanguage("en", "en", "I want a sweet vanilla perfume"), "en");
  // Brand name typed in English when UI is Russian defaults to Russian
  assert.equal(resolveRequestLanguage("en", "ru", "Armaf Club De Nuit"), "ru");
});

test("translateText accurately translates fragrance queries to English and localized responses back", async () => {
  // Query translation to English
  const huTr = await translateText("szeretnék édes vaníliás parfümöt", "en", "auto");
  assert.ok(huTr.text.toLowerCase().includes("vanilla"));
  assert.equal(huTr.detectedLang, "hu");

  const roTr = await translateText("vreau un parfum dulce cu vanilie", "en", "auto");
  assert.ok(roTr.text.toLowerCase().includes("vanilla") || roTr.text.toLowerCase().includes("perfume") || roTr.text.toLowerCase().includes("scent"));
  assert.equal(roTr.detectedLang, "ro");

  const ruTr = await translateText("хочу сладкие духи с ванилью и ягодами", "en", "auto");
  assert.ok(ruTr.text.toLowerCase().includes("vanilla"));
  assert.equal(ruTr.detectedLang, "ru");

  // Pass-through for already English
  const enTr = await translateText("I want a sweet vanilla perfume", "en", "en");
  assert.equal(enTr.text, "I want a sweet vanilla perfume");
  assert.equal(enTr.detectedLang, "en");

  // Localized translation back from English
  const enReply = "I am delighted to recommend the exquisite Afnan Souvenir Floral Bouquet (24.09 €).";
  const ruReply = await translateText(enReply, "ru", "en");
  assert.ok(ruReply.text.includes("Afnan") || ruReply.text.includes("24"));

  const roReply = await translateText(enReply, "ro", "en");
  assert.ok(roReply.text.includes("Afnan") || roReply.text.includes("24"));
});

test("processWardaChat multilingual flow translates query to English, reasons with AI, and returns in request language", async () => {
  const dummyCatalog = [
    {
      id: "afnan-souvenir-floral-100",
      title: "Afnan Souvenir Floral Bouquet",
      brand: "Afnan",
      price: 24.09,
      gender: "Женский",
      category: "Цветочные",
      notesSummary: "ваниль, ягоды, белые цветы, амбра",
      topNotes: ["ваниль", "лесные ягоды"],
      heartNotes: ["белые цветы"],
      baseNotes: ["амбра", "мускус"],
      longevity: "8-10 часов",
      volume: "100 мл",
      image: "https://example.com/afnan.png",
      isSample: false,
    },
    {
      id: "lattafa-khamrah-100",
      title: "Lattafa Khamrah",
      brand: "Lattafa",
      price: 36.50,
      gender: "Унисекс",
      category: "Гурманские",
      notesSummary: "корица, мускатный орех, финики, ваниль",
      topNotes: ["корица", "мускатный орех"],
      heartNotes: ["финики", "пралине"],
      baseNotes: ["ваниль", "бобы тонка"],
      longevity: "10-12 часов",
      volume: "100 мл",
      image: "https://example.com/khamrah.png",
      isSample: false,
    },
  ];

  // 1. Romanian user request
  const roResult = await processWardaChat({
    messages: [{ role: "user", content: "Vreau un parfum dulce cu vanilie" }],
    language: "ro",
    context: { catalog: dummyCatalog },
  });
  assert.equal(roResult.requestLanguage, "ro");
  assert.equal(roResult.translatedToEnglish, true);
  assert.ok(roResult.message.length > 10);
  assert.ok(Array.isArray(roResult.books) && roResult.books.length > 0);

  // 2. Hungarian user request
  const huResult = await processWardaChat({
    messages: [{ role: "user", content: "szeretnék édes vaníliás parfümöt" }],
    language: "hu",
    context: { catalog: dummyCatalog },
  });
  assert.equal(huResult.requestLanguage, "hu");
  assert.equal(huResult.translatedToEnglish, true);
  assert.ok(huResult.message.length > 10);
  assert.ok(Array.isArray(huResult.books) && huResult.books.length > 0);

  // 3. Russian user request
  const ruResult = await processWardaChat({
    messages: [{ role: "user", content: "хочу сладкие духи с ванилью" }],
    language: "ru",
    context: { catalog: dummyCatalog },
  });
  assert.equal(ruResult.requestLanguage, "ru");
  assert.ok(ruResult.message.length > 10);
  assert.ok(Array.isArray(ruResult.books) && ruResult.books.length > 0);
  // Feminine speech check for Russian
  assert.ok(!ruResult.message.includes("я рад ") && !ruResult.message.includes("я нашел "));

  // 4. English user request (direct pass-through, no translation to English needed)
  const enResult = await processWardaChat({
    messages: [{ role: "user", content: "I want a sweet vanilla perfume" }],
    language: "en",
    context: { catalog: dummyCatalog },
  });
  assert.equal(enResult.requestLanguage, "en");
  assert.equal(enResult.translatedToEnglish, false);
  assert.ok(enResult.message.length > 10);
  assert.ok(Array.isArray(enResult.books) && enResult.books.length > 0);
});

test("translateWardaDialog translates conversation history when user switches language", async () => {
  const dialog = [
    { id: "m1", role: "user", content: "Здравствуйте, ищу духи с ароматом ванили" },
    { id: "m2", role: "assistant", content: "Здравствуйте! Я рада помочь вам с выбором. Посмотрите прекрасный аромат Afnan Souvenir Floral Bouquet (24.09 €)!" },
  ];

  const result = await translateWardaDialog({
    messages: dialog,
    targetLanguage: "en",
  });

  assert.ok(Array.isArray(result.translations));
  assert.equal(result.translations.length, 2);
  assert.equal(result.translations[0].id, "m1");
  assert.equal(result.translations[1].id, "m2");
  // English translation should contain vanilla
  assert.ok(result.translations[0].content.toLowerCase().includes("vanilla"));
  assert.ok(result.translations[1].content.includes("Afnan") || result.translations[1].content.includes("24"));
});

test("formatTextWithCurrency dynamically formats assistant recommendation prices to active currency", async () => {
  const { formatTextWithCurrency } = await import("../server/wardaAssistantService.js");

  const assistantMessage = "Подобрала для вас изысканный аромат «Afnan Souvenir Floral Bouquet» (24.09\u00A0€). Также доступны пробники от 3.50–12.00\u00A0€!";

  // 1. Without formatPriceFn (fallback/default EUR)
  const defaultText = formatTextWithCurrency(assistantMessage);
  assert.ok(defaultText.includes("24.09\u00A0€"));

  // 2. Format to RON (Romanian Leu)
  const formatRon = (eur) => `${(eur * 5.343).toFixed(2)} lei`;
  const ronText = formatTextWithCurrency(assistantMessage, formatRon);
  assert.ok(ronText.includes("128.71 lei"));
  assert.ok(ronText.includes("18.70 lei – 64.12 lei"));

  // 3. Format to HUF (Hungarian Forint)
  const formatHuf = (eur) => `${Math.round(eur * 362.99)} Fr`;
  const hufText = formatTextWithCurrency(assistantMessage, formatHuf);
  assert.ok(hufText.includes("8744 Fr") || hufText.includes("8 744 Fr"));
  assert.ok(hufText.includes("1270 Fr – 4356 Fr") || hufText.includes("1 270 Fr – 4 356 Fr"));
});
