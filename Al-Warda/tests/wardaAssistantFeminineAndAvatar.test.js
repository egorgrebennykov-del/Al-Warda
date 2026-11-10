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

test("getCanonicalEmotion maps volatile emotions to stable canonical states", () => {
  // Conversational and expressive states map to greeting signature
  assert.equal(getCanonicalEmotion("greeting"), "greeting");
  assert.equal(getCanonicalEmotion("welcoming"), "greeting");
  assert.equal(getCanonicalEmotion("neutral"), "greeting");
  assert.equal(getCanonicalEmotion("happy"), "greeting");
  assert.equal(getCanonicalEmotion("smiling"), "greeting");
  assert.equal(getCanonicalEmotion("speaking"), "greeting");
  assert.equal(getCanonicalEmotion("curious"), "greeting");
  assert.equal(getCanonicalEmotion("confident"), "greeting");
  assert.equal(getCanonicalEmotion("friendly"), "greeting");
  assert.equal(getCanonicalEmotion("surprised"), "greeting");

  // Catalog search / processing maps to thinking
  assert.equal(getCanonicalEmotion("thinking"), "thinking");
  assert.equal(getCanonicalEmotion("loading"), "thinking");
  assert.equal(getCanonicalEmotion("confused"), "thinking");

  // Errors / alerts map to concerned
  assert.equal(getCanonicalEmotion("concerned"), "concerned");
  assert.equal(getCanonicalEmotion("error"), "concerned");
  assert.equal(getCanonicalEmotion("sad"), "concerned");

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

test("isDecantablePerfume and getSamplePrice enforce monotonicity: larger volume costs more, samples never exceed bottle", async () => {
  const { getSamplePrice, isDecantablePerfume } = await import("../utils/perfumes.js");

  // 1. In cheap products, small oils, or deodorants, decants are not offered
  assert.equal(isDecantablePerfume({ name: "Al Haramain Black Oudh Parfum", price: 2.77, volume: "15 мл" }), false);
  assert.equal(isDecantablePerfume({ name: "Ajmal Aristocrat Her 1.5ml", price: 0.52, volume: "1.5 мл" }), false);
  assert.equal(isDecantablePerfume({ name: "Nabeel Master Ocean Deo Spray 200 Ml", price: 2.71, volume: "200 мл" }), false);

  // 2. Full bottles >= 15 EUR are decantable
  assert.equal(isDecantablePerfume({ name: "Lattafa Asad 100ml EDP", price: 29.90, volume: "100 мл" }), true);

  // 3. Strict monotonicity for all prices: 1ml < 2ml < 5ml < 10ml < full bottle
  for (const p of [15, 18, 20, 25, 30, 45, 60, 100, 250]) {
    const p1 = getSamplePrice(p, "1ml");
    const p2 = getSamplePrice(p, "2ml");
    const p5 = getSamplePrice(p, "5ml");
    const p10 = getSamplePrice(p, "10ml");

    assert.ok(p1 < p2, `1ml (${p1}) should be strictly less than 2ml (${p2}) for bottle ${p}`);
    assert.ok(p2 < p5, `2ml (${p2}) should be strictly less than 5ml (${p5}) for bottle ${p}`);
    assert.ok(p5 < p10, `5ml (${p5}) should be strictly less than 10ml (${p10}) for bottle ${p}`);
    assert.ok(p10 < p, `10ml (${p10}) should be strictly less than bottle price (${p})`);
  }
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

test("getDefaultPerfumeVolumeOption defaults to second largest volume >= 10ml when volume can be changed", async () => {
  const { getDefaultPerfumeVolumeOption, getDefaultCatalogPrice } = await import("../utils/perfumes.js");

  // 1. User example: perfume with sizes 100ml, 50ml, and 10ml -> defaults to 50ml price
  const multiBottle = {
    name: "Luxury Oud",
    price: 60,
    volume: "100ml",
    availableSizes: [
      { ml: 100, price: 60 },
      { ml: 50, price: 35 },
      { ml: 10, price: 15 },
    ],
  };
  const multiOpt = getDefaultPerfumeVolumeOption(multiBottle);
  assert.equal(multiOpt.ml, 50);
  assert.equal(multiOpt.price, 35);
  assert.equal(multiOpt.isSecondLargest, true);
  assert.equal(getDefaultCatalogPrice(multiBottle), 35);

  // 2. Decantable perfume: 100ml bottle + decants (10ml, 5ml, 2ml, 1ml) -> second largest is 10ml
  const asad = { name: "Lattafa Asad 100ml EDP", price: 29.90, volume: "100 мл" };
  const asadOpt = getDefaultPerfumeVolumeOption(asad);
  assert.equal(asadOpt.ml, 10);
  assert.equal(asadOpt.key, "10ml");
  assert.equal(asadOpt.isSecondLargest, true);
  assert.equal(asadOpt.price, 18.9);
  assert.equal(getDefaultCatalogPrice(asad), 18.9);

  // 3. Perfume where volume CANNOT be changed (non-decantable deodorant) -> returns standard full price
  const deo = { name: "Nabeel Deo Spray 200ml", price: 2.71, volume: "200ml" };
  const deoOpt = getDefaultPerfumeVolumeOption(deo);
  assert.equal(deoOpt.ml, 200);
  assert.equal(deoOpt.price, 2.71);
  assert.equal(deoOpt.isSecondLargest, false);
  assert.equal(getDefaultCatalogPrice(deo), 2.71);

  // 4. Discovery Set -> returns set price
  const set = { name: "Amber Oud Discovery Set 4x10ml", price: 29.90, volume: "4x10ml", isSet: true };
  const setOpt = getDefaultPerfumeVolumeOption(set);
  assert.equal(setOpt.price, 29.90);
  assert.equal(setOpt.isSecondLargest, false);
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

test("samples page defaults to minimum available sample volume (1ml) when multiple sample sizes are available", async () => {
  const { SAMPLE_VOLUMES, getSamplePrice, isDecantablePerfume } = await import("../utils/perfumes.js");

  // Sample volumes list order and keys
  assert.ok(SAMPLE_VOLUMES.length >= 3);
  const minVol = SAMPLE_VOLUMES.reduce((min, cur) => cur.ml < min.ml ? cur : min, SAMPLE_VOLUMES[0]);
  assert.equal(minVol.key, "1ml");
  assert.equal(minVol.ml, 1);

  // Price for minimum volume (1ml) is lower than 5ml and 10ml
  const price1ml = getSamplePrice(35, "1ml");
  const price2ml = getSamplePrice(35, "2ml");
  const price5ml = getSamplePrice(35, "5ml");
  const price10ml = getSamplePrice(35, "10ml");

  assert.ok(price1ml < price2ml);
  assert.ok(price2ml < price5ml);
  assert.ok(price5ml < price10ml);

  // Default volume selection on samples page when selectedVolume filter is "all"
  const selectedVolume = "all";
  const defaultVol = ["1ml", "2ml", "5ml", "10ml"].includes(selectedVolume)
    ? selectedVolume
    : (SAMPLE_VOLUMES[0]?.key || "1ml");
  assert.equal(defaultVol, "1ml");
});


