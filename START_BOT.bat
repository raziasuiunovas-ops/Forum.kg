@echo off
echo ========================================
echo   Запуск Telegram бота для форума
echo ========================================
echo.

echo [1/3] Проверка зависимостей...
call npm install node-telegram-bot-api @types/node-telegram-bot-api tsx --silent

echo.
echo [2/3] Обновление базы данных...
call npm run db:push

echo.
echo [3/3] Запуск бота...
echo.
call npm run bot

pause
