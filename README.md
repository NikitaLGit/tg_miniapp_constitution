# Конституция РФ — Telegram Mini App

Поиск по статьям Конституции РФ. Работает по номеру статьи и полнотекстовому поиску (FTS5).

## Как устроено

```
parse.js      →   articles.json   →   seed.js   →   constitution.db
(kremlin.ru)      (140 статей)        (SQLite)       (в Docker image)
                                                           ↓
                                                     server.js (Express)
                                                           ↓
                                                  nginx /constitution/
                                                           ↓
                                                  Telegram Mini App
```

**Источник данных:** `http://www.kremlin.ru/acts/constitution/item` — статический HTML, парсится один раз.

**База:** SQLite с FTS5 (`tokenize="unicode61"` для кириллицы). DB копируется в Docker image при сборке — никаких volumes.

**Auth:** Telegram `initData` HMAC-SHA256. Фронтенд передаёт `x-init-data` заголовок, backend проверяет подпись через `BOT_TOKEN`.

## Структура

```
constitution/
├── parse.js                  # парсер kremlin.ru (нет зависимостей)
├── seed.js                   # articles.json → SQLite FTS5
├── setup.sh                  # полный первичный запуск
├── package.json              # только better-sqlite3 для seed.js
├── docker-compose.yml
└── backend/
    ├── server.js             # Express: /search, /article/:id
    ├── Dockerfile
    ├── .env                  # BOT_TOKEN, PORT=3002
    ├── constitution.db       # генерируется seed.js, копируется в image
    └── public/
        └── index.html        # React (CDN) + Telegram WebApp SDK
```

## Первый запуск (setup)

```bash
chmod +x setup.sh && ./setup.sh
```

Что делает `setup.sh`:
1. Скачивает HTML с kremlin.ru и запускает `parse.js` → `articles.json`
2. Устанавливает `better-sqlite3` и запускает `seed.js` → `backend/constitution.db`
3. Собирает Docker image (DB копируется внутрь)
4. Запускает контейнер на порту `3002`

Если kremlin.ru недоступен — скачать вручную:
```bash
curl -A 'Mozilla/5.0' 'http://www.kremlin.ru/acts/constitution/item' -L -o kremlin.html
node parse.js --file kremlin.html
```

## Пересборка после изменений

```bash
# изменился server.js, index.html или .env
docker compose down && docker compose build && docker compose up -d

# пересоздать контейнер без rebuild (только .env изменился)
docker compose down && docker compose up -d
```

## API

| Endpoint | Описание |
|---|---|
| `GET /search?q=1` | Поиск по номеру статьи |
| `GET /search?q=свобода` | FTS5 полнотекстовый поиск |
| `GET /article/:id` | Полный текст статьи по id |

Все запросы требуют заголовок `x-init-data` с Telegram `initData`.  
Без `BOT_TOKEN` в `.env` — авторизация отключена (dev режим).

## Nginx

Добавлен блок в `/home/lns/claude/nginx-reverse-proxy/nginx.conf`:

```nginx
location /constitution/ {
    proxy_pass http://constitution-backend:3002/;
    ...
}
```

Mini App доступен в боте: `https://t.me/constitutionlnsbot`
