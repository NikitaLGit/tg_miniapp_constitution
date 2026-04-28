# Конституция РФ — Telegram Mini App

Поиск по статьям Конституции РФ с игровыми механиками. Работает как Telegram Mini App.

Mini App: `https://t.me/constitutionlnsbot`

## Функции

### Поиск
- По номеру статьи: введи `22` → сразу та статья
- По словам с частичным вводом: `свобо` → все статьи со словами на «свобо»
- FTS5 с подсветкой совпадений — выделяется только введённая часть слова
- Результаты отсортированы по номеру статьи

### Просмотр статьи
- Открывается снизу как bottom sheet
- Кнопка «Назад» в Telegram закрывает шит
- Фон под шитом заблокирован от прокрутки

### Система редкости
Каждой статье присвоена редкость в стиле игровых предметов:

| Редкость | Цвет | Количество | Примеры |
|---|---|---|---|
| Легендарная | Оранжевый | 6 | ст. 1, 2, 7, 10, 17, 29 |
| Эпическая | Фиолетовый | 15 | ст. 3, 4, 13, 20, 22, 80 |
| Редкая | Синий | 25 | ст. 19, 37, 40, 41, 43, 46 |
| Необычная | Зелёный | 40 | — |
| Обычная | Серый | ~51 | — |

Редкость отображается баблом в карточке поиска и в шапке открытой статьи.

### Мне повезёт
Кнопка на главном экране — открывает случайную статью. При выпадении эпической или легендарной запускается конфетти в цвет редкости:
- Легендарная → 90 оранжево-золотых частиц
- Эпическая → 60 фиолетовых частиц

### Избранное
- Звёздочка в правом верхнем углу открытой статьи — добавить/убрать
- Анимация при нажатии
- Хранится в `localStorage` — сохраняется между сессиями
- Кнопка «Избранное» на главном экране → список сохранённых статей

## Как устроено

```
parse.js      →   articles.json   →   seed.js   →   constitution.db
(kremlin.ru)      (137 статей)        (SQLite)       (в Docker image)
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
    ├── server.js             # Express: /search, /article/:id, /random
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
docker compose down && docker compose build && docker compose up -d
```

## API

| Endpoint | Описание |
|---|---|
| `GET /search?q=1` | Поиск по номеру статьи |
| `GET /search?q=свобода` | FTS5 полнотекстовый поиск |
| `GET /article/:id` | Полный текст статьи по id |
| `GET /random` | Случайная статья (id + article_number) |

Все запросы требуют заголовок `x-init-data` с Telegram `initData`.  
Без `BOT_TOKEN` в `.env` — авторизация отключена (dev режим).

## Nginx

```nginx
location /constitution/ {
    proxy_pass http://constitution-backend:3002/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```
