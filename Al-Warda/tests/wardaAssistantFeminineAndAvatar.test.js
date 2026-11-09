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
