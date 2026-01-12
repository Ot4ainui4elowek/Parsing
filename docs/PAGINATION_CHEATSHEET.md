# 🚀 Шпаргалка по Пагинации v2.0

Быстрая справка по новой системе пагинации

---

## 📌 Основы

### Параметры запроса
```
page     - Номер страницы (с 1)           [по умолчанию: 1]
limit    - Вакансий на странице           [по умолчанию: 10]
userId   - ID пользователя для кэша       [опционально]
```

### Структура ответа
```json
{
  "data": [...],
  "meta": {
    "total": 150,        // Всего вакансий
    "totalPages": 15,    // Всего страниц
    "currentPage": 1,    // Текущая страница
    "limit": 10          // Вакансий на странице
  }
}
```

---

## 📖 Примеры запросов

### Базовые
```bash
# Первая страница (по умолчанию)
GET /api/vacancies?keywords=developer

# Конкретная страница
GET /api/vacancies?keywords=developer&page=2

# Изменить количество на странице
GET /api/vacancies?keywords=developer&page=1&limit=20

# С кэшированием (для ботов)
GET /api/vacancies?keywords=developer&userId=telegram_123&page=1
```

### С фильтрами
```bash
# Удаленная работа, страница 2
GET /api/vacancies?schedule=remote&page=2&limit=10

# По зарплате и локации
GET /api/vacancies?salaryMin=1000&locations=chisinau&page=1

# Джуны в IT
GET /api/vacancies?keywords=developer&experience=no_experience&page=1
```

---

## 💻 Примеры кода

### JavaScript
```javascript
// Загрузить одну страницу
const page = 1;
const response = await fetch(
  `/api/vacancies?keywords=developer&page=${page}&limit=10`
);
const data = await response.json();

console.log(`Страница ${data.meta.currentPage}/${data.meta.totalPages}`);
```

### Python
```python
# Загрузить одну страницу
page = 1
response = requests.get('/api/vacancies', params={
    'keywords': 'developer',
    'page': page,
    'limit': 10
})
data = response.json()

print(f"Страница {data['meta']['currentPage']}/{data['meta']['totalPages']}")
```

---

## 🔄 Загрузка всех страниц

### JavaScript
```javascript
async function fetchAllPages() {
  let page = 1;
  let allVacancies = [];
  
  while (true) {
    const response = await fetch(`/api/vacancies?page=${page}&userId=user123`);
    const data = await response.json();
    
    allVacancies.push(...data.data);
    
    if (page >= data.meta.totalPages) break;
    page++;
  }
  
  return allVacancies;
}
```

### Python
```python
def fetch_all_pages():
    page = 1
    all_vacancies = []
    
    while True:
        response = requests.get('/api/vacancies', params={
            'page': page,
            'userId': 'user123'
        })
        data = response.json()
        
        all_vacancies.extend(data['data'])
        
        if page >= data['meta']['totalPages']:
            break
        page += 1
    
    return all_vacancies
```

---

## 🤖 Telegram Bot

### Простая версия
```typescript
bot.onText(/\/search (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1];
  const userId = `telegram_${chatId}`;
  
  let page = 1;
  
  while (true) {
    const { data } = await axios.get('/api/vacancies', {
      params: { keywords: query, userId, page, limit: 5 }
    });
    
    if (data.data.length === 0) break;
    
    // Отправить вакансии
    await sendVacancies(chatId, data.data);
    
    if (page >= data.meta.totalPages) break;
    page++;
    
    await sleep(500); // Задержка
  }
});
```

### С кнопками навигации
```typescript
const userStates = new Map();

bot.onText(/\/search (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1];
  const userId = `telegram_${chatId}`;
  
  // Первая страница
  const { data } = await axios.get('/api/vacancies', {
    params: { keywords: query, userId, page: 1, limit: 5 }
  });
  
  // Сохранить состояние
  userStates.set(userId, {
    query,
    currentPage: 1,
    totalPages: data.meta.totalPages
  });
  
  // Показать с кнопками
  const message = formatVacancies(data);
  const keyboard = {
    inline_keyboard: [[
      { text: '➡️ Следующая', callback_data: 'next' }
    ]]
  };
  
  bot.sendMessage(chatId, message, { reply_markup: keyboard });
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = `telegram_${chatId}`;
  const state = userStates.get(userId);
  
  if (!state) return;
  
  let newPage = state.currentPage;
  if (query.data === 'next' && newPage < state.totalPages) {
    newPage++;
  } else if (query.data === 'prev' && newPage > 1) {
    newPage--;
  }
  
  // Загрузить новую страницу
  const { data } = await axios.get('/api/vacancies', {
    params: { 
      keywords: state.query, 
      userId, 
      page: newPage,
      limit: 5 
    }
  });
  
  state.currentPage = newPage;
  userStates.set(userId, state);
  
  // Обновить сообщение
  const message = formatVacancies(data);
  const buttons = [];
  
  if (newPage > 1) {
    buttons.push({ text: '⬅️ Пред.', callback_data: 'prev' });
  }
  if (newPage < state.totalPages) {
    buttons.push({ text: '➡️ След.', callback_data: 'next' });
  }
  
  bot.editMessageText(message, {
    chat_id: chatId,
    message_id: query.message.message_id,
    reply_markup: { inline_keyboard: [buttons] }
  });
  
  bot.answerCallbackQuery(query.id);
});
```

---

## ⚡ Производительность

### С userId (кэширование)
```
Запрос 1: ~500мс   (собирает все данные, кэширует)
Запрос 2: ~15мс    (из кэша) ⚡
Запрос 3: ~15мс    (из кэша) ⚡
...

Кэш живет: 30 минут
```

### Без userId (без кэширования)
```
Запрос 1: ~500мс   (запрос в БД)
Запрос 2: ~500мс   (запрос в БД)
Запрос 3: ~500мс   (запрос в БД)
```

**Рекомендация:** Всегда передавай `userId` для ботов!

---

## 🔍 Условия остановки

### Правильно ✅
```javascript
if (page >= response.meta.totalPages) {
  console.log('Последняя страница!');
  break;
}
```

### Неправильно ❌
```javascript
// НЕ используй это!
if (response.data.length === 0) break;
```

---

## 🎨 Форматирование для бота

```typescript
function formatVacancies(data: any): string {
  let message = `🔍 Найдено ${data.meta.total} вакансий\n`;
  message += `📄 Страница ${data.meta.currentPage}/${data.meta.totalPages}\n\n`;
  
  data.data.forEach((vacancy: any, i: number) => {
    const num = (data.meta.currentPage - 1) * data.meta.limit + i + 1;
    
    message += `${num}. **${vacancy.title}**\n`;
    message += `   💼 ${vacancy.company}\n`;
    message += `   📍 ${vacancy.location || 'Не указана'}\n`;
    
    if (vacancy.salaryMin) {
      message += `   💰 $${vacancy.salaryMin}`;
      if (vacancy.salaryMax) message += `-${vacancy.salaryMax}`;
      message += `\n`;
    }
    
    message += `   🔗 [Посмотреть](${vacancy.sourceUrl})\n\n`;
  });
  
  return message;
}
```

---

## 📊 Примеры значений limit

```bash
# Для ботов (рекомендуется)
limit=5-10      # Удобно читать в мессенджере

# Для веб-приложений
limit=15-20     # Стандартная пагинация

# Для массовой загрузки
limit=50        # Меньше запросов
```

---

## 🐛 Troubleshooting

### Кэш не работает
```bash
# Проверь Redis
redis-cli ping
# Должен вернуть: PONG

# Проверь что передаешь userId
GET /api/vacancies?userId=test123&page=1
```

### Медленные запросы
```bash
# Используй userId для кэширования
GET /api/vacancies?userId=telegram_123&page=2

# Проверь что Redis запущен
```

### Ошибка при большом page
```bash
# page не может быть больше totalPages
# Проверяй: page <= totalPages
```

---

## 📚 Полная документация

- **API.md** - полная документация API
- **PAGINATION_MIGRATION.md** - руководство по миграции
- **BOT_INTEGRATION.md** - примеры для ботов
- **PROJECT_STATUS.md** - текущее состояние проекта

---

## ✅ Checklist использования

- [ ] Использую `page` вместо `offset`
- [ ] Проверяю `totalPages` для остановки
- [ ] Передаю `userId` для кэширования
- [ ] Установил правильный `limit`
- [ ] Обрабатываю ошибки
- [ ] Добавил задержки между запросами

---

🚀 **Готово к использованию!**

Версия: 2.0 | Дата: 12.01.2026
