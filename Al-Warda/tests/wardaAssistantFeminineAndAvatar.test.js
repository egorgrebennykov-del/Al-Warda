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
