import test from "node:test";
import assert from "node:assert/strict";
import {
  enforceFeminineSelfReferences,
  getCanonicalEmotion,
  CANONICAL_EMOTION_MAP,
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
