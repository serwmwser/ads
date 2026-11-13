# Архитектура ads-ru (ads.himeet.online)

Российская доска объявлений / white-label движок. Отдельный проект от международного HiMeet.

## 1. Два отдельных проекта

| | HiMeet (международный) | ads-ru (Россия) |
|---|---|---|
| Сайт | https://himeet.online | https://ads.himeet.online |
| Репозиторий | serwmwser/serwmwser.github.io | serwmwser/ads-ru |
| Сервер | VPS 84.200.80.66 (api.himeet.online) | российский сервер (Timeweb / Yandex Cloud) |
| Данные | SQLite, chess-bet/server | БД только в РФ (152-ФЗ) |
| Вход | свои аккаунты HiMeet | телефон + SMS, позже ЕСИА |
| Общий код | нет | нет |

Правило: ничего не импортируется между проектами, общих БД и общих ключей нет.
На himeet.online/ads/ остаётся старая страница «Международная доска объявлений».

## 2. Слои

    Браузер / Android WebView / чужой сайт (виджет)
            |
      Статика (GitHub Pages сейчас, затем nginx на RU-сервере)
            |  fetch /api/...
      API (Node, backend/src)  <-- единая точка, API-first
            |
      БД (SQLite сейчас, PostgreSQL потом)

Принцип API-first: сайт, мобильное приложение, виджеты и кабинеты используют один и тот же REST API.
Никакой логики только на странице.

## 3. База данных

- Сейчас: SQLite (node:sqlite, Node >= 22.5), файл вне репозитория.
- SQL пишется совместимым с PostgreSQL: плейсхолдеры $1, $2, TEXT/INTEGER, без SQLite-специфики.
- Миграции: backend/sql/001_init.sql (13 таблиц), далее 002_engine.sql и т.д., запуск через backend/src/migrate.js.
- Переход на PostgreSQL: заменить backend/src/db.js, SQL не переписывается.

## 4. География

- 85 регионов, 1134 города (web/seo/data/geo.json, источник Wikipedia через pensnarik/russian-cities).
- Таблицы регионов и городов заполняются из geo.json при миграции.
- SEO-страницы: /<регион>/<город>/<категория>/ генерирует web/seo/build-seo.mjs.

## 5. Авторизация

1. Телефон + SMS-код (backend/src/auth.js, sms.js) - основной способ на старте.
2. ЕСИА (Госуслуги) - модуль backend/src/esia.js, выключен флагом ESIA_ENABLED=0.
   Для подключения нужно юридическое лицо или ИП и заявка в Минцифры. Это не техническая, а организационная задача.
3. Роли: user, moderator, admin. Кабинеты: пользователя, модератора, администратора, партнёра (white-label).

## 6. Модули backend (план файлов)

    backend/src/
      ads.js        объявления: создание, список, поиск, фильтры
      esia.js       вход через Госуслуги (выключен)
      admin.js      модерация, пользователи, тарифы, статистика
      widgets.js    публичный API для виджета
      payments.js   оплата тарифов (уже есть)
      auth.js       вход (уже есть)

## 7. Виджеты и white-label

- web/public/ads-widget.js: подключается одной строкой script, рисует ленту объявлений в контейнере.
- Резервный вариант: iframe-страница /embed/ с параметрами region, city, category.
- Партнёр получает ключ API, лимиты и привязку к своему домену.

## 8. Мобильное приложение

- Первый релиз в RuStore: Kotlin + WebView, загружает https://ads.himeet.online.
- Нативные части добавляются позже: push, камера для фото объявлений.

## 9. Деплой

- Сейчас: статика на GitHub Pages (workflow pages.yml), домен ads.himeet.online.
- Целевой вариант: Docker Compose на российском сервере: api + nginx + (позже) postgres.
- Файлы: Dockerfile, docker-compose.yml, docs/deploy-ru.md.

## 10. Безопасность и закон

- Персональные данные хранятся и обрабатываются на сервере в РФ (152-ФЗ).
- Нужно уведомление Роскомнадзора, политика обработки ПД и согласие при регистрации.
- Секреты только в .env (см. .env.example), в git не попадают.
- Это техническое описание, не юридическая консультация: договор и документы согласуйте с юристом.

## 11. Порядок разработки (по одному файлу)

1. docs/architecture.md (этот файл)
2. backend/sql/002_engine.sql
3. backend/src/ads.js и подключение в server.js
4. backend/src/admin.js
5. backend/src/esia.js (выключен)
6. web/public/ads-widget.js и /embed/
7. Dockerfile, docker-compose.yml, docs/deploy-ru.md
8. Страницы кабинетов
9. Android WebView
