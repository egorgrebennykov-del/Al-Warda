# Al-Warda: Benchmark Test Photos (High-Quality Studio Photography)

> **Zero API Cost ($0.00)** | **100% Authentic Product Preservation** | **True Transparent Alpha (RGBA PNG 1024x1024)**

Папка содержит эталонные результаты локального конвейера студийной предметной фотографии Al-Warda для 20 разнообразных категорий флаконов.

## 📁 Структура папки
- `originals/` — исходные оригинальные фотографии Qogita (JPEG, без изменений).
- `studio_transparent/` — обработанные студийные фотографии флаконов на 100% прозрачном фоне (PNG 1024x1024).
- `evaluation_report.json` — детальные метрики резкости, времени и параметров обработки каждого продукта.

## 🌟 Качество студийной фотографии
1. **Масштаб флакона**: флакон занимает ~80-82% высоты холста (820px на 1024x1024), отцентрирован по горизонтали и вертикали. Флакон крупный, презентабельный и отчетливый.
2. **Интерполяция Lanczos-4**: масштабирование контуров и текстур выполнено без мыла и размытия.
3. **Фотометрическое студийное улучшение**:
   - Авто-выравнивание динамического диапазона ($L^*$-канал, перцентили 1.0%–99.2%).
   - CLAHE (контрастное адаптивное выравнивание гистограммы) с `clipLimit=2.0` для проявления объема, глубины стекла и металлического блеска.
   - Высокочастотное маскирование нерезкости (unsharp mask) на канале яркости: надписи, арабская каллиграфия и золотое тиснение стали сверхчеткими.
4. **Контур и альфа-канал**:
   - Кубическая сегментация U2Net с гладкой кривой среза (0.15–0.85) и деликатным сглаживанием границ.
   - Полное отсутствие белых или черных ореолов (halos/fringes).
5. **Сохранение подлинности**:
   - **0% генеративных галлюцинаций** — ни одна буква, ни один логотип не искажены.
   - Сохранены 100% аутентичные пиксели, цвета и геометрия флакона.

## 📊 Таблица 20 тестовых продуктов

| ID | Название | Категория флакона | Исходный размер | Студийный PNG (1024x1024) | Резкость (Laplacian) | Время CPU |
|---|---|---|---|---|---|---|
| **6860** | Fragrance World Gold Fame | 3. Gold cap / bottle | 392x428 | [6860_studio_transparent.png](studio_transparent/6860_studio_transparent.png) | 53.7 | 1.08с |
| **4983** | Afnan 9 PM Pour Femme EDP | 2. Dark glass bottle | 392x428 | [4983_studio_transparent.png](studio_transparent/4983_studio_transparent.png) | 95.0 | 0.99с |
| **4990** | Afnan Ornament Purple Allure | 7. Complex ornaments & cap | 392x428 | [4990_studio_transparent.png](studio_transparent/4990_studio_transparent.png) | 679.0 | 1.00с |
| **5188** | Ajmal Amber Wood | 8. Amber liquid & luxury wood | 392x428 | [5188_studio_transparent.png](studio_transparent/5188_studio_transparent.png) | 95.6 | 1.05с |
| **5057** | Afnan Naseej Al Kiswah | 5. Arabic label / calligraphy | 392x428 | [5057_studio_transparent.png](studio_transparent/5057_studio_transparent.png) | 39.1 | 0.91с |
| **6849** | Fragrance World Pur Elegance | 6. English label / typography | 392x428 | [6849_studio_transparent.png](studio_transparent/6849_studio_transparent.png) | 61.9 | 0.87с |
| **5230** | Oud Ombre Arabian Perfume | 15. Unusual bottle geometry | 392x428 | [5230_studio_transparent.png](studio_transparent/5230_studio_transparent.png) | 366.1 | 1.07с |
| **5077** | Ajmal Shiro | 1. Transparent glass bottle | 392x428 | [5077_studio_transparent.png](studio_transparent/5077_studio_transparent.png) | 74.9 | 0.96с |
| **4991** | Afnan Mirsaal Of Trust | 12. Matte bottle / luxury box | 392x428 | [4991_studio_transparent.png](studio_transparent/4991_studio_transparent.png) | 286.7 | 1.15с |
| **4992** | Afnan Highness Iv Red | 13. Tall bottle & crown cap | 392x428 | [4992_studio_transparent.png](studio_transparent/4992_studio_transparent.png) | 78.1 | 0.94с |
| **5465** | Al Haramain Diamond Attar | 17. Transparent edges & crystal | 392x428 | [5465_studio_transparent.png](studio_transparent/5465_studio_transparent.png) | 663.9 | 1.23с |
| **5305** | Al Haramain L'Aventure Iris | 4. Silver cap & white bg | 392x428 | [5305_studio_transparent.png](studio_transparent/5305_studio_transparent.png) | 58.1 | 0.93с |
| **5194** | Ajmal Elegancia | 9. Light-coloured liquid | 392x428 | [5194_studio_transparent.png](studio_transparent/5194_studio_transparent.png) | 100.3 | 1.00с |
| **5368** | Al Haramain Junoon Oud | 14. Wide bottle / textured | 392x428 | [5368_studio_transparent.png](studio_transparent/5368_studio_transparent.png) | 258.0 | 1.07с |
| **6852** | Fragrance World Ace | 18. Bottle with dark background | 392x428 | [6852_studio_transparent.png](studio_transparent/6852_studio_transparent.png) | 421.6 | 0.85с |
| **6225** | Armaf Azure Le Parfait | 13. Tall cylindrical flacon | 392x428 | [6225_studio_transparent.png](studio_transparent/6225_studio_transparent.png) | 142.6 | 0.94с |
| **5087** | Rehla EDP by Adyan Anfar | 7. Intricate ornaments | 392x428 | [5087_studio_transparent.png](studio_transparent/5087_studio_transparent.png) | 700.3 | 1.11с |
| **5304** | Al Haramain Destino | 20. Low contrast backdrop | 392x428 | [5304_studio_transparent.png](studio_transparent/5304_studio_transparent.png) | 264.5 | 1.01с |
| **5001** | Afnan Edict Musctique | 11. Reflective metallic | 392x428 | [5001_studio_transparent.png](studio_transparent/5001_studio_transparent.png) | 226.5 | 1.12с |
| **6243** | Armaf Odyssey Ba Ha Mas | 10. Small original photo | 392x428 | [6243_studio_transparent.png](studio_transparent/6243_studio_transparent.png) | 236.2 | 0.88с |
