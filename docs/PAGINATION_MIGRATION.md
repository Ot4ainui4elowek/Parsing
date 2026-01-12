# 🔄 Миграция на новую пагинацию (v2.0)

## Что изменилось

### 1. **offset → page**

Вместо смещения (offset) теперь используется номер страницы (начиная с 1).

**Было:**
```bash
GET /api/vacancies?limit=50&offset=0    # Первые 50
GET /api/vacancies?limit=50&offset=50   # Следующие 50
GET /api/vacancies?limit=50&offset=100  # Еще 50
```

**Стало:**
```bash
GET /api/vacancies?limit=10&page=1   # Страница 1 (вакансии 1-10)
GET /api/vacancies?limit=10&page=2   # Страница 2 (вакансии 11-20)
GET /api/vacancies?limit=10&page=3   # Страница 3 (вакансии 21-30)
```

### 2. **Новый limit по умолчанию**

- **Было:** `limit=50`
- **Стало:** `limit=10`

### 3. **Добавлено totalPages**

Теперь в ответе есть количество страниц:

```json
{
  "meta": {
    "total": 150,
    "totalPages": 15,     // ← Новое поле!
    "currentPage": 1,
    "limit": 10
  }
}
```

### 4. **Кэширование результатов**

При указании `userId` результаты кэшируются в Redis:

```bash
# Первый запрос - собирает все данные
GET /api/vacancies?keywords=developer&userId=telegram_123&page=1

# Следующие запросы - из кэша (быстро!)
GET /api/vacancies?keywords=developer&userId=telegram_123&page=2
GET /api/vacancies?keywords=developer&userId=telegram_123&page=3
```

---

## Обновление кода

### JavaScript/TypeScript

**Было:**
```javascript
let offset = 0;
const limit = 50;

while (true) {
  const response = await fetch(`/api/vacancies?limit=${limit}&offset=${offset}`);
  const data = await response.json();
  
  if (data.data.length === 0) break;
  
  // Обработка
  offset += limit;
}
```

**Стало:**
```javascript
let page = 1;
const limit = 10;

while (true) {
  const response = await fetch(`/api/vacancies?limit=${limit}&page=${page}`);
  const data = await response.json();
  
  // Обработка
  
  if (page >= data.meta.totalPages) break; // ← Четкое условие остановки!
  page++;
}
```

### Python

**Было:**
```python
offset = 0
limit = 50

while True:
    response = requests.get(f'/api/vacancies?limit={limit}&offset={offset}')
    data = response.json()
    
    if len(data['data']) == 0:
        break
    
    # Обработка
    offset += limit
```

**Стало:**
```python
page = 1
limit = 10

while True:
    response = requests.get(f'/api/vacancies?limit={limit}&page={page}')
    data = response.json()
    
    # Обработка
    
    if page >= data['meta']['totalPages']:  # ← Четкое условие!
        break
    
    page += 1
```

### Telegram Bot

**Было:**
```typescript
let offset = 0;
const limit = 10;

while (true) {
  const { data } = await axios.get('/api/vacancies', {
    params: { keywords: query, limit, offset }
  });
  
  if (data.data.length === 0) break;
  
  await sendVacancies(data.data);
  offset += limit;
  
  await sleep(500);
}
```

**Стало:**
```typescript
let page = 1;
const limit = 10;
const userId = `telegram_${chatId}`; // Важно!

// Первый запрос
const { data: firstPage } = await axios.get('/api/vacancies', {
  params: { keywords: query, userId, limit, page: 1 }
});

const totalPages = firstPage.meta.totalPages;

// Отправляем первую страницу
await sendVacancies(firstPage.data);

// Остальные страницы
for (let page = 2; page <= totalPages; page++) {
  const { data } = await axios.get('/api/vacancies', {
    params: { keywords: query, userId, limit, page }
  });
  
  await sendVacancies(data.data);
  await sleep(500);
}
```

---

## Преимущества новой системы

### 1. **Понятная навигация**

```
page=1, page=2, page=3... 
vs 
offset=0, offset=50, offset=100...
```

### 2. **Четкое условие остановки**

Больше не нужно проверять `length === 0`, просто:
```javascript
if (page >= totalPages) break;
```

### 3. **Быстрая пагинация с кэшем**

При указании `userId`:
- 1-й запрос: собирает все данные (~500-1000мс)
- 2-й+ запросы: из Redis кэша (~10-20мс)

### 4. **Меньший limit по умолчанию**

- Подходит для ботов (10 вакансий = 1 сообщение)
- Меньше нагрузка на сеть
- Можно увеличить до 20-50 если нужно

---

## FAQ

### Что если я не передаю userId?

Система будет работать, но:
- Каждый запрос будет обращаться к БД
- Пагинация будет медленнее
- Рекомендуется всегда передавать `userId` для ботов

### Как долго живет кэш?

- TTL: **30 минут**
- Автоматически очищается
- Можно очистить вручную через API (будет добавлено)

### Можно ли изменить limit?

Да! Просто передай другой:
```bash
GET /api/vacancies?limit=20&page=1   # 20 вакансий на странице
GET /api/vacancies?limit=5&page=1    # 5 вакансий на странице
```

### Работает ли старый offset?

**Нет!** Параметр `offset` больше не поддерживается.
Используй `page`.

### Как узнать сколько всего страниц заранее?

Делай первый запрос и смотри `meta.totalPages`:

```javascript
const firstPage = await fetch('/api/vacancies?page=1');
const { meta } = await firstPage.json();

console.log(`Всего страниц: ${meta.totalPages}`);

// Теперь загружай остальные
for (let page = 2; page <= meta.totalPages; page++) {
  // ...
}
```

---

## Checklist для обновления

- [ ] Заменил `offset` на `page`
- [ ] Изменил условие остановки на `page >= totalPages`
- [ ] Добавил `userId` в запросы (для ботов)
- [ ] Обновил `limit` если нужно (по умолчанию 10)
- [ ] Протестировал пагинацию
- [ ] Обновил документацию бота (если есть)

---

## Поддержка

Вопросы? Смотри:
- [Документация API](./API.md#пагинация)
- [Примеры для ботов](./BOT_INTEGRATION.md)
- [FAQ](./FAQ.md)
