# 🌐 API Documentation

## 📖 Содержание

- [Обзор](#обзор)
- [Запуск API](#запуск-api)
- [Эндпоинты](#эндпоинты)
- [Примеры использования](#примеры-использования)
- [Пагинация](#пагинация)
- [Ошибки](#ошибки)
- [Интеграция с ботом](#интеграция-с-ботом)

---

## 🎯 Обзор

API сервер на **Fastify** предоставляет REST API для доступа к вакансиям.

**Базовый URL:** `http://localhost:3000`

**Возможности:**
- Поиск вакансий с фильтрами
- Умная пагинация (по номеру страницы)
- Кэширование результатов для быстрой навигации
- Получение конкретной вакансии
- Семантический поиск через словари профессий
- Управление подписками (в разработке)
- Статистика

---

## 🚀 Запуск API

### Development режим

```bash
npm run dev:api
```

API запустится на `http://localhost:3000`

### Production режим

```bash
# Собрать проект
npm run build

# Запустить
npm run start:api
```

### Настройка порта

В `.env`:
```env
API_PORT=3000
API_HOST=0.0.0.0
```

---

## 📡 Эндпоинты

### 1. Health Check

**GET** `/health`

Проверка работоспособности API и подключения к БД.

**Ответ:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-05T12:30:00.000Z"
}
```

**Пример:**
```bash
curl http://localhost:3000/health
```

---

### 2. Получить список вакансий

**GET** `/api/vacancies`

Поиск вакансий с фильтрами и пагинацией.

**Query параметры:**

| Параметр | Тип | Описание | По умолчанию | Пример |
|----------|-----|----------|--------------|--------|
| `keywords` | string | Ключевые слова через запятую | - | `nodejs,javascript` |
| `locations` | string | Локации через запятую | - | `chisinau,balti` |
| `salaryMin` | number | Минимальная зарплата | - | `1000` |
| `experience` | string | Опыт работы | - | `no_experience,between_1_and_3` |
| `schedule` | string | График работы | - | `remote,hybrid` |
| `source` | string | Один источник | - | `rabota.md` |
| `sources` | string | Несколько источников через запятую | все 3 | `rabota.md,999.md` |
| `useSemanticSearch` | boolean | Использовать семантический поиск | false | `true` |
| `userId` | string | ID пользователя для кэширования | - | `telegram_12345` |
| `limit` | number | Количество результатов на странице | 10 | `20` |
| `page` | number | Номер страницы (начиная с 1) | 1 | `2` |

**Возможные значения `experience`:**
- `no_experience` - Без опыта
- `between_1_and_3` - 1-3 года
- `between_3_and_6` - 3-6 лет
- `more_than_6` - Более 6 лет

**Возможные значения `schedule`:**
- `remote` - Удаленная работа
- `office` - Офис
- `hybrid` - Гибрид
- `flexible` - Гибкий график

**Ответ:**
```json
{
  "success": true,
  "data": [
    {
      "id": "clx1234567890",
      "title": "Node.js Developer",
      "company": "Tech Corp",
      "description": "Ищем опытного разработчика...",
      "location": "Chișinău",
      "salaryMin": 1200,
      "salaryMax": 2000,
      "salaryCurrency": "USD",
      "experience": "between_3_and_6",
      "employment": "full",
      "schedule": "remote",
      "skills": ["Node.js", "PostgreSQL", "Docker"],
      "source": "rabota.md",
      "sourceId": "12345",
      "sourceUrl": "https://www.rabota.md/...",
      "publishedAt": "2024-01-05T10:30:00.000Z",
      "createdAt": "2024-01-05T11:00:00.000Z",
      "updatedAt": "2024-01-05T11:00:00.000Z"
    }
  ],
  "meta": {
    "total": 150,           // Общее количество вакансий
    "totalPages": 15,       // Общее количество страниц
    "currentPage": 1,       // Текущая страница
    "limit": 10,            // Вакансий на странице
    "source": "cache",      // Источник данных: cache | fresh | cache-paginated
    "lastUpdate": "2024-01-05T11:00:00.000Z",
    "updating": false       // Обновляются ли данные в фоне
  }
}
```

**Примеры запросов:**

```bash
# Все вакансии (первая страница)
curl "http://localhost:3000/api/vacancies"

# Вторая страница
curl "http://localhost:3000/api/vacancies?page=2"

# Поиск Node.js в Кишиневе с зарплатой от 1000$
curl "http://localhost:3000/api/vacancies?keywords=nodejs&locations=chisinau&salaryMin=1000"

# Удаленная работа для джунов, показать по 20 на странице
curl "http://localhost:3000/api/vacancies?schedule=remote&experience=no_experience,between_1_and_3&limit=20"

# Семантический поиск "программист" с пагинацией
curl "http://localhost:3000/api/vacancies?keywords=программист&useSemanticSearch=true&page=1&limit=15"

# Только с rabota.md
curl "http://localhost:3000/api/vacancies?source=rabota.md"

# С userId для кэширования (для бота)
curl "http://localhost:3000/api/vacancies?keywords=developer&userId=telegram_12345&page=2"
```

---

### 3. Получить конкретную вакансию

**GET** `/api/vacancies/:id`

Получить детали одной вакансии по ID.

**Параметры URL:**
- `id` - ID вакансии из БД

**Ответ:**
```json
{
  "success": true,
  "data": {
    "id": "clx1234567890",
    "title": "Node.js Developer",
    "company": "Tech Corp",
    "description": "...",
    "rawData": {
      "fullDescription": "Полное описание...",
      "education": "Высшее",
      "firstSeenAt": "2024-01-05T10:00:00.000Z"
    }
  }
}
```

**Пример:**
```bash
curl "http://localhost:3000/api/vacancies/clx1234567890"
```

**Ошибка 404:**
```json
{
  "success": false,
  "error": "Vacancy not found"
}
```

---

### 4. Принудительный парсинг

**POST** `/api/vacancies/force-parse`

Запустить парсинг вакансий прямо сейчас (не из кэша).

**Body параметры:**
```json
{
  "sources": ["rabota.md", "999.md"],  // Опционально
  "searchQuery": "программист"          // Опционально
}
```

**Ответ:**
```json
{
  "success": true,
  "message": "Parsing completed",
  "data": {
    "sources": ["rabota.md", "999.md"],
    "searchQuery": "программист",
    "vacanciesParsed": 145
  }
}
```

**Пример:**
```bash
curl -X POST "http://localhost:3000/api/vacancies/force-parse" \
  -H "Content-Type: application/json" \
  -d '{"sources": ["rabota.md"], "searchQuery": "developer"}'
```

---

### 5. Статистика

**GET** `/api/vacancies/stats`

Получить статистику по источникам.

**Ответ:**
```json
{
  "success": true,
  "data": [
    {
      "source": "rabota.md",
      "count": 1250,
      "lastParse": "2024-01-05T10:00:00.000Z",
      "isStale": false,
      "status": "fresh"
    },
    {
      "source": "999.md",
      "count": 890,
      "lastParse": "2024-01-04T15:00:00.000Z",
      "isStale": true,
      "status": "stale"
    },
    {
      "source": "makler.md",
      "count": 340,
      "lastParse": null,
      "isStale": true,
      "status": "empty"
    }
  ]
}
```

**Пример:**
```bash
curl "http://localhost:3000/api/vacancies/stats"
```

---

## 📄 Пагинация

### Как работает пагинация

Система использует **номера страниц** (`page`) вместо offset:

```
page=1, limit=10  →  вакансии 1-10
page=2, limit=10  →  вакансии 11-20
page=3, limit=10  →  вакансии 21-30
```

### Логика работы

1. **Первый запрос**: Система собирает ВСЕ вакансии по запросу из БД
2. **Кэширование**: Если указан `userId` - результаты кэшируются в Redis
3. **Пагинация**: Из всего набора вырезается нужная страница
4. **Следующие запросы**: Берутся из кэша (очень быстро)

### Пример последовательной навигации

```bash
# Страница 1
curl "http://localhost:3000/api/vacancies?keywords=developer&userId=bot_123&page=1&limit=10"
# Ответ: вакансии 1-10, totalPages: 15

# Страница 2 (из кэша)
curl "http://localhost:3000/api/vacancies?keywords=developer&userId=bot_123&page=2&limit=10"
# Ответ: вакансии 11-20, totalPages: 15

# Последняя страница
curl "http://localhost:3000/api/vacancies?keywords=developer&userId=bot_123&page=15&limit=10"
# Ответ: последние вакансии
```

### Определение когда остановиться

Используй `totalPages` из мета-информации:

```javascript
let currentPage = 1;
let response;

do {
  response = await fetch(`/api/vacancies?page=${currentPage}&limit=10`);
  const data = await response.json();
  
  // Обрабатываем вакансии
  console.log(`Страница ${currentPage}/${data.meta.totalPages}`);
  
  currentPage++;
  
  // Остановка когда дошли до последней страницы
} while (currentPage <= response.meta.totalPages);
```

### Для ботов

```typescript
async function getAllVacancies(filters: any) {
  const allVacancies = [];
  let currentPage = 1;
  let totalPages = 1;
  
  do {
    const { data } = await axios.get('/api/vacancies', {
      params: {
        ...filters,
        userId: 'telegram_user_123', // Важно для кэширования!
        page: currentPage,
        limit: 10
      }
    });
    
    allVacancies.push(...data.data);
    totalPages = data.meta.totalPages;
    currentPage++;
    
    console.log(`📄 Загружено ${currentPage-1}/${totalPages} страниц`);
    
  } while (currentPage <= totalPages);
  
  return allVacancies;
}
```

---

## 💻 Примеры использования

### JavaScript / Node.js

```javascript
// Простой поиск с пагинацией
const response = await fetch('http://localhost:3000/api/vacancies?keywords=nodejs&page=1&limit=5');
const data = await response.json();

console.log(`Найдено: ${data.meta.total} вакансий на ${data.meta.totalPages} страницах`);
console.log(`Показана страница ${data.meta.currentPage}`);

data.data.forEach(vacancy => {
  console.log(`- ${vacancy.title} at ${vacancy.company}`);
});

// С axios
import axios from 'axios';

const { data } = await axios.get('http://localhost:3000/api/vacancies', {
  params: {
    keywords: 'nodejs',
    salaryMin: 1000,
    schedule: 'remote',
    page: 2,
    limit: 15
  }
});

console.log(`Страница ${data.meta.currentPage} из ${data.meta.totalPages}`);
```

### Python

```python
import requests

response = requests.get('http://localhost:3000/api/vacancies', params={
    'keywords': 'python',
    'locations': 'chisinau',
    'salaryMin': 1000,
    'page': 1,
    'limit': 10
})

data = response.json()
print(f"Найдено: {data['meta']['total']} вакансий")
print(f"Страница {data['meta']['currentPage']} из {data['meta']['totalPages']}")

for vacancy in data['data']:
    print(f"- {vacancy['title']} at {vacancy['company']}")

# Загрузить все страницы
def fetch_all_pages(filters):
    all_vacancies = []
    current_page = 1
    
    while True:
        response = requests.get('http://localhost:3000/api/vacancies', 
            params={**filters, 'page': current_page})
        data = response.json()
        
        all_vacancies.extend(data['data'])
        
        if current_page >= data['meta']['totalPages']:
            break
            
        current_page += 1
        print(f"Загружено {current_page}/{data['meta']['totalPages']} страниц")
    
    return all_vacancies

vacancies = fetch_all_pages({'keywords': 'developer', 'limit': 20})
```

### cURL с пагинацией

```bash
# Первая страница
curl -G "http://localhost:3000/api/vacancies" \
  --data-urlencode "keywords=javascript,react" \
  --data-urlencode "locations=chisinau" \
  --data-urlencode "page=1" \
  --data-urlencode "limit=10"

# Вторая страница
curl -G "http://localhost:3000/api/vacancies" \
  --data-urlencode "keywords=javascript,react" \
  --data-urlencode "locations=chisinau" \
  --data-urlencode "page=2" \
  --data-urlencode "limit=10"
```

---

## ⚠️ Ошибки

### Стандартный формат ошибки

```json
{
  "success": false,
  "error": "Error message",
  "message": "Detailed error description"
}
```

### Коды ошибок

| Код | Описание |
|-----|----------|
| 200 | OK - Успешный запрос |
| 404 | Not Found - Ресурс не найден |
| 500 | Internal Server Error - Ошибка сервера |

### Примеры ошибок

**404 - Вакансия не найдена:**
```json
{
  "success": false,
  "error": "Vacancy not found"
}
```

**500 - Ошибка БД:**
```json
{
  "success": false,
  "error": "Failed to fetch vacancies",
  "message": "Database connection error"
}
```

---

## 🤖 Интеграция с ботом

### Telegram Bot с пагинацией

```typescript
import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const API_URL = 'http://localhost:3000';

// Хранилище текущих страниц пользователей
const userPages = new Map();

bot.onText(/\/search (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = `telegram_${chatId}`;
  const query = match[1]; // "nodejs remote"
  
  try {
    // Первая страница
    const { data } = await axios.get(`${API_URL}/api/vacancies`, {
      params: {
        keywords: query,
        userId: userId,  // Важно! Для кэширования
        page: 1,
        limit: 5
      }
    });
    
    if (data.data.length === 0) {
      bot.sendMessage(chatId, '❌ Вакансии не найдены');
      return;
    }
    
    // Сохраняем состояние
    userPages.set(userId, {
      query,
      currentPage: 1,
      totalPages: data.meta.totalPages
    });
    
    // Форматируем результаты
    const message = formatVacancies(data);
    
    // Кнопки навигации
    const keyboard = {
      inline_keyboard: [[
        { text: '➡️ Следующая', callback_data: 'next_page' }
      ]]
    };
    
    bot.sendMessage(chatId, message, { 
      reply_markup: data.meta.totalPages > 1 ? keyboard : undefined 
    });
    
  } catch (error) {
    bot.sendMessage(chatId, '❌ Ошибка при поиске вакансий');
    console.error(error);
  }
});

// Обработка кнопок пагинации
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = `telegram_${chatId}`;
  const action = query.data;
  
  const state = userPages.get(userId);
  if (!state) {
    bot.answerCallbackQuery(query.id, { text: 'Начните новый поиск' });
    return;
  }
  
  let newPage = state.currentPage;
  
  if (action === 'next_page' && state.currentPage < state.totalPages) {
    newPage++;
  } else if (action === 'prev_page' && state.currentPage > 1) {
    newPage--;
  }
  
  try {
    const { data } = await axios.get(`${API_URL}/api/vacancies`, {
      params: {
        keywords: state.query,
        userId: userId,
        page: newPage,
        limit: 5
      }
    });
    
    state.currentPage = newPage;
    userPages.set(userId, state);
    
    const message = formatVacancies(data);
    
    // Кнопки навигации
    const buttons = [];
    if (newPage > 1) {
      buttons.push({ text: '⬅️ Предыдущая', callback_data: 'prev_page' });
    }
    if (newPage < state.totalPages) {
      buttons.push({ text: '➡️ Следующая', callback_data: 'next_page' });
    }
    
    bot.editMessageText(message, {
      chat_id: chatId,
      message_id: query.message.message_id,
      reply_markup: { inline_keyboard: [buttons] }
    });
    
    bot.answerCallbackQuery(query.id);
    
  } catch (error) {
    bot.answerCallbackQuery(query.id, { text: 'Ошибка загрузки' });
  }
});

function formatVacancies(data: any): string {
  let message = `🔍 Найдено ${data.meta.total} вакансий\n`;
  message += `📄 Страница ${data.meta.currentPage}/${data.meta.totalPages}\n\n`;
  
  data.data.forEach((vacancy: any, i: number) => {
    const num = (data.meta.currentPage - 1) * data.meta.limit + i + 1;
    message += `${num}. ${vacancy.title}\n`;
    message += `   💼 ${vacancy.company}\n`;
    message += `   📍 ${vacancy.location || 'Не указана'}\n`;
    if (vacancy.salaryMin) {
      message += `   💰 $${vacancy.salaryMin}-${vacancy.salaryMax}\n`;
    }
    message += `   🔗 ${vacancy.sourceUrl}\n\n`;
  });
  
  return message;
}
```

### Простой бот без кнопок

```typescript
bot.onText(/\/search (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = `telegram_${chatId}`;
  const query = match[1];
  
  let currentPage = 1;
  let totalPages = 1;
  
  do {
    const { data } = await axios.get(`${API_URL}/api/vacancies`, {
      params: {
        keywords: query,
        userId: userId,
        page: currentPage,
        limit: 10
      }
    });
    
    if (data.data.length === 0 && currentPage === 1) {
      bot.sendMessage(chatId, '❌ Вакансии не найдены');
      return;
    }
    
    totalPages = data.meta.totalPages;
    
    // Отправляем вакансии текущей страницы
    const message = formatVacancies(data);
    await bot.sendMessage(chatId, message);
    
    currentPage++;
    
    // Задержка чтобы не спамить
    if (currentPage <= totalPages) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
  } while (currentPage <= totalPages);
  
  bot.sendMessage(chatId, `✅ Показаны все ${totalPages} страниц`);
});
```

---

## 🔒 Безопасность (для production)

### Rate Limiting

```typescript
// В будущем можно добавить rate limiting
import rateLimit from '@fastify/rate-limit';

await fastify.register(rateLimit, {
  max: 100,              // 100 запросов
  timeWindow: '1 minute' // за минуту
});
```

### CORS

```typescript
// Уже настроен в server.ts
await fastify.register(cors, {
  origin: 'https://yourdomain.com', // В production укажи домен
  methods: ['GET', 'POST']
});
```

### API Key (опционально)

```typescript
// Middleware для проверки API ключа
fastify.addHook('onRequest', async (request, reply) => {
  const apiKey = request.headers['x-api-key'];
  
  if (!apiKey || apiKey !== process.env.API_KEY) {
    reply.code(401).send({ error: 'Unauthorized' });
  }
});
```

---

## 📊 Мониторинг

### Логи

API логирует все запросы в консоль (в development режиме).

```bash
npm run dev:api

# Вывод:
🔍 Поиск вакансий: { keywords: ['nodejs'], page: 1, limit: 10 }
📊 Найдено в БД: 150 вакансий
📄 Страница 1/15, показываю 10 из 150 вакансий
{"level":30,"time":1704456789,"msg":"GET /api/vacancies"}
```

### Health Check

Настрой мониторинг через `/health`:

```bash
# Uptime Robot, Pingdom и т.д.
GET http://localhost:3000/health
```

---

## 🎯 Roadmap API

- [x] Пагинация по номеру страницы
- [x] Кэширование результатов для быстрой навигации
- [x] Семантический поиск
- [ ] Эндпоинты для подписок:
  - `POST /api/subscriptions` - Создать подписку
  - `GET /api/subscriptions/:userId` - Подписки пользователя
  - `DELETE /api/subscriptions/:id` - Удалить подписку
- [ ] Фильтр по дате публикации
- [ ] Сортировка результатов
- [ ] Поиск по компаниям
- [ ] Экспорт вакансий (CSV, JSON)
- [ ] GraphQL эндпоинт
- [ ] WebSocket для real-time обновлений

---

📖 **Читай далее:**
- [Документация по Worker](./WORKER.md)
- [Интеграция с ботом](./BOT_INTEGRATION.md)
- [Архитектура системы](./architecture/OVERVIEW.md)
