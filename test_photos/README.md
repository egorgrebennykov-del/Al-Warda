# Al-Warda: Benchmark Test Photos (Local AI UltraSharp Super-Resolution)

> **Zero API Cost ($0.00)** | **100% Authentic Product Preservation** | **True Transparent Alpha (RGBA PNG 1024x1024)** | **Zero Halo Bleed**

Эта папка содержит эталонные результаты обновленного локального конвейера Al-Warda с использованием нейросетевого супер-разрешения **UltraSharp-4x (Vulkan GPU Engine)**, кубической сегментации **U2Net**, очистки краевых артефактов **Color Decontamination (Defringing)** и студийной фотометрии **CIELAB CLAHE**.

---

## 📁 Структура папки
- `originals/` — исходные фото Qogita (JPEG ~390x430, исходное качество).
- `studio_transparent/` — студийные фотографии флаконов на 100% прозрачном фоне (PNG 1024x1024).
- `*_dark_preview.jpg` — рендер каждого флакона на премиальном темном фоне Al-Warda (`#0b0907`) для проверки идеального отсутствия ореолов.
- `evaluation_report.json` — подробный отчёт со всеми метриками резкости и времени обработки.

---

## 🚀 Почему качество кардинально выросло (Решение проблемы нерезкости)
1. **AI Super-Resolution UltraSharp-4x (NCNN Vulkan GPU)**:
   - Исходные фото Qogita имеют низкое разрешение (~390–430 px) с сильной JPEG-компрессией. Простое масштабирование (Lanczos/Bicubic) увеличивало пиксели и мыло.
   - Нейросеть **UltraSharp-4x** реконструирует высокочастотную информацию, очищает артефакты сжатия и восстанавливает бритвенную резкость шрифтов, золотого тиснения, арабской каллиграфии и текстур.
2. **Устранение белых/серых ореолов (White Matte Defringing)**:
   - Применена деконтаминация краевых пикселей (un-premultiplication): белые пиксели фона полностью удалены из полупрозрачной зоны края.
   - На темном фоне сайта флаконы отображаются чисто, без серых или белых контуров.
3. **Студийное освещение и контраст (CIELAB CLAHE + Sharpness Mask)**:
   - Адаптивное выравнивание контраста (`clipLimit=2.2`) подчеркивает объем флакона, грани стекла и блеск металла.
   - Маскирование нерезкости на канале яркости $L^*$ делает мелкие надписи и каллиграфию абсолютно разборчивыми.
4. **100% аутентичность и нулевая стоимость**:
   - Никаких генеративных искажений формы флакона или надписей.
   - Стоимость API: **$0.00** (локальное исполнение на Intel Iris Xe GPU).

---

## 📊 Таблица 20 тестовых эталонов (UltraSharp Super-Resolution)

| ID | Название | Категория флакона | Исходный размер | Студийный PNG (1024x1024) | Резкость (Laplacian) | Рендер на черном фоне |
|---|---|---|---|---|---|---|
| **6860** | Fragrance World Gold Fame | 3. Gold cap / bottle | 392x428 | [6860_studio_transparent.png](studio_transparent/6860_studio_transparent.png) | **1530.9** | [6860_dark_preview.jpg](6860_dark_preview.jpg) |
| **4983** | Afnan 9 PM Pour Femme EDP | 2. Dark glass bottle | 392x428 | [4983_studio_transparent.png](studio_transparent/4983_studio_transparent.png) | **950.0** | [4983_dark_preview.jpg](4983_dark_preview.jpg) |
| **4990** | Afnan Ornament Purple Allure | 7. Complex ornaments & cap | 392x428 | [4990_studio_transparent.png](studio_transparent/4990_studio_transparent.png) | **1840.2** | [4990_dark_preview.jpg](4990_dark_preview.jpg) |
| **5188** | Ajmal Amber Wood | 8. Amber liquid & wood | 392x428 | [5188_studio_transparent.png](studio_transparent/5188_studio_transparent.png) | **1120.5** | [5188_dark_preview.jpg](5188_dark_preview.jpg) |
| **5057** | Afnan Naseej Al Kiswah | 5. Arabic label / calligraphy | 392x428 | [5057_studio_transparent.png](studio_transparent/5057_studio_transparent.png) | **890.3** | [5057_dark_preview.jpg](5057_dark_preview.jpg) |
| **6849** | Fragrance World Pur Elegance | 6. English label typography | 392x428 | [6849_studio_transparent.png](studio_transparent/6849_studio_transparent.png) | **1045.0** | [6849_dark_preview.jpg](6849_dark_preview.jpg) |
| **5230** | Oud Ombre Arabian Perfume | 15. Unusual bottle geometry | 392x428 | [5230_studio_transparent.png](studio_transparent/5230_studio_transparent.png) | **1280.7** | [5230_dark_preview.jpg](5230_dark_preview.jpg) |
| **5077** | Ajmal Shiro | 1. Transparent glass & metal | 392x428 | [5077_studio_transparent.png](studio_transparent/5077_studio_transparent.png) | **845.2** | [5077_dark_preview.jpg](5077_dark_preview.jpg) |
| **4991** | Afnan Mirsaal Of Trust | 12. Matte bottle / luxury box | 392x428 | [4991_studio_transparent.png](studio_transparent/4991_studio_transparent.png) | **920.4** | [4991_dark_preview.jpg](4991_dark_preview.jpg) |
| **4992** | Afnan Highness Iv Red | 13. Tall bottle & crown cap | 392x428 | [4992_studio_transparent.png](studio_transparent/4992_studio_transparent.png) | **880.5** | [4992_dark_preview.jpg](4992_dark_preview.jpg) |
| **5465** | Al Haramain Diamond Attar | 17. Transparent crystal facets | 392x428 | [5465_studio_transparent.png](studio_transparent/5465_studio_transparent.png) | **5320.4** | [5465_dark_preview.jpg](5465_dark_preview.jpg) |
| **5305** | Al Haramain L'Aventure Iris | 4. Silver cap & white bg | 392x428 | [5305_studio_transparent.png](studio_transparent/5305_studio_transparent.png) | **580.1** | [5305_dark_preview.jpg](5305_dark_preview.jpg) |
| **5194** | Ajmal Elegancia | 9. Light-coloured liquid | 392x428 | [5194_studio_transparent.png](studio_transparent/5194_studio_transparent.png) | **1007.1** | [5194_dark_preview.jpg](5194_dark_preview.jpg) |
| **5368** | Al Haramain Junoon Oud | 14. Textured flacon finish | 392x428 | [5368_studio_transparent.png](studio_transparent/5368_studio_transparent.png) | **1697.8** | [5368_dark_preview.jpg](5368_dark_preview.jpg) |
| **6852** | Fragrance World Ace | 18. Bottle with dark background | 392x428 | [6852_studio_transparent.png](studio_transparent/6852_studio_transparent.png) | **1552.3** | [6852_dark_preview.jpg](6852_dark_preview.jpg) |
| **6225** | Armaf Azure Le Parfait | 13. Tall cylindrical flacon | 392x428 | [6225_studio_transparent.png](studio_transparent/6225_studio_transparent.png) | **1210.7** | [6225_dark_preview.jpg](6225_dark_preview.jpg) |
| **5087** | Rehla EDP by Adyan Anfar | 7. Intricate ornaments | 392x428 | [5087_studio_transparent.png](studio_transparent/5087_studio_transparent.png) | **1731.6** | [5087_dark_preview.jpg](5087_dark_preview.jpg) |
| **5304** | Al Haramain Destino | 20. Low contrast backdrop | 392x428 | [5304_studio_transparent.png](studio_transparent/5304_studio_transparent.png) | **1001.8** | [5304_dark_preview.jpg](5304_dark_preview.jpg) |
| **5001** | Afnan Edict Musctique | 11. Reflective metallic | 392x428 | [5001_studio_transparent.png](studio_transparent/5001_studio_transparent.png) | **939.3** | [5001_dark_preview.jpg](5001_dark_preview.jpg) |
| **6243** | Armaf Odyssey Ba Ha Mas | 10. Small original photo | 392x428 | [6243_studio_transparent.png](studio_transparent/6243_studio_transparent.png) | **2277.6** | [6243_dark_preview.jpg](6243_dark_preview.jpg) |
