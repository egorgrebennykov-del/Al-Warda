@echo off
chcp 65001 >nul
title Al-Warda - Локальная Генерация ИИ на Видеокарте (GPU)
color 0A

echo ===============================================================================
echo            AL-WARDA: ЛОКАЛЬНАЯ ГЕНЕРАЦИЯ И СУПЕР-РАЗРЕШЕНИЕ НА GPU
echo ===============================================================================
echo.
echo Видеокарта: Intel(R) Iris(R) Xe Graphics (Аппаратное ускорение Vulkan)
echo Нейросеть апскейла: Upscayl / Remacri-4x (Устранение артефактов и мыла)
echo Сегментация: RMBG-1.4 (Чистое студийное вырезание фона)
echo.
echo -------------------------------------------------------------------------------
echo [1] Запустить генерацию очереди на локальной видеокарте (до 20 товаров)
echo [2] Запустить непрерывную генерацию очереди на GPU (до 100 товаров)
echo [3] Перегенерировать конкретный товар по его ID (введите номер)
echo [4] Исправить ключевые товары со скриншотов (ID 5005, 5496, 5465)
echo [5] Синхронизировать и отправить готовые фото на сайт (Git commit ^& push)
echo [0] Выход
echo -------------------------------------------------------------------------------
echo.

set /p choice="Выберите действие [0-5]: "

if "%choice%"=="1" goto run_queue_20
if "%choice%"=="2" goto run_queue_100
if "%choice%"=="3" goto run_by_id
if "%choice%"=="4" goto run_fixes
if "%choice%"=="5" goto run_sync
if "%choice%"=="0" goto exit

echo Неверный выбор.
pause
goto exit

:run_queue_20
echo.
echo [Запуск] Обработка очереди товаров на GPU (макс. 20 шт)...
cd /d "%~dp0"
Al-Warda\.pilot-venv\Scripts\python.exe Al-Warda\scripts\generate_product_images.py --max-images 20 --local-gpu
echo.
echo Завершено!
pause
goto exit

:run_queue_100
echo.
echo [Запуск] Обработка большой очереди товаров на GPU (макс. 100 шт)...
cd /d "%~dp0"
Al-Warda\.pilot-venv\Scripts\python.exe Al-Warda\scripts\generate_product_images.py --max-images 100 --local-gpu
echo.
echo Завершено!
pause
goto exit

:run_by_id
echo.
set /p prod_id="Введите ID товара (например, 5005 или несколько через запятую): "
if "%prod_id%"=="" goto exit
echo.
echo [Запуск] Генерация товара ID %prod_id% на локальной видеокарте...
cd /d "%~dp0"
Al-Warda\.pilot-venv\Scripts\python.exe Al-Warda\scripts\generate_product_images.py --product-ids %prod_id% --local-gpu
echo.
echo Завершено!
pause
goto exit

:run_fixes
echo.
echo [Запуск] Перегенерация товаров 5005, 5496, 5465 с ультра-качеством на GPU...
cd /d "%~dp0"
Al-Warda\.pilot-venv\Scripts\python.exe Al-Warda\scripts\generate_product_images.py --product-ids 5005,5496,5465 --local-gpu
echo.
echo Завершено!
pause
goto exit

:run_sync
echo.
echo [Синхронизация] Фиксация готовых фотографий и отправка на GitHub...
cd /d "%~dp0"
git add Al-Warda/public/assets/img/generated-products/
git commit -m "feat(catalog): add authentic high-res AI GPU generated product images"
git push origin main
echo.
echo Синхронизация завершена! Фотографии доступны на сайте.
pause
goto exit

:exit
exit /b 0
