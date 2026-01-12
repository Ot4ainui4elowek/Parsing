/**
 * BullMQ Worker для фоновых задач
 * С поддержкой VacancyManager
 */

import { Worker, Queue } from 'bullmq';
import { config } from '../shared/config/index.js';
import { parseJobProcessor } from './jobs/parseJob.js';
import { notifyJobProcessor } from './jobs/notifyJob.js';
import { prisma } from '../db/index.js';
import { vacancyManager } from '../shared/managers/vacancyManager.js';

// Настройки Redis подключения
const connection = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
};

let parseQueue: Queue | null = null;
let notifyQueue: Queue | null = null;
let parseWorker: Worker | null = null;
let notifyWorker: Worker | null = null;

async function startWorker() {
  try {
    console.log('🔄 Попытка подключения к Redis...');
    console.log(`   Host: ${connection.host}:${connection.port}`);
    
    // Создаем очередь для парсинга
    parseQueue = new Queue('parse', { connection });

    // Создаем очередь для уведомлений
    notifyQueue = new Queue('notify', { connection });

    // Проверяем подключение
    await parseQueue.waitUntilReady();
    console.log('✅ Redis подключен успешно!');

    // Регистрируем очередь в VacancyManager
    vacancyManager.setQueue(parseQueue);

    // Создаем worker для обработки задач парсинга
    parseWorker = new Worker('parse', parseJobProcessor, {
      connection,
      concurrency: config.worker.concurrency,
      limiter: {
        max: 10, // максимум 10 задач
        duration: 60000, // в минуту
      },
    });

    // Создаем worker для уведомлений
    notifyWorker = new Worker('notify', notifyJobProcessor, {
      connection,
      concurrency: 1, // По одному, чтобы не спамить
    });

    // Обработчики событий для парсинга
    parseWorker.on('completed', (job) => {
      console.log(`✅ Парсинг ${job.id} завершен:`, job.returnvalue);
    });

    parseWorker.on('failed', (job, err) => {
      console.error(`❌ Парсинг ${job?.id} провалился:`, err.message);
    });

    parseWorker.on('error', (err) => {
      console.error('❌ Worker ошибка:', err);
    });

    // Обработчики для уведомлений
    notifyWorker.on('completed', (job) => {
      console.log(`✅ Проверка подписок ${job.id} завершена:`, job.returnvalue);
    });

    notifyWorker.on('failed', (job, err) => {
      console.error(`❌ Проверка подписок ${job?.id} провалилась:`, err.message);
    });

    // Добавляем периодическую задачу парсинга (каждые 6 часов)
    await parseQueue.add(
      'periodic-rabota',
      {
        source: 'rabota.md',
        searchQuery: 'it',
        maxPages: 3,
      },
      {
        repeat: {
          every: config.worker.parseInterval, // 6 часов
        },
        jobId: 'periodic-rabota-parse',
      }
    );

    // Добавляем периодическую задачу проверки подписок (каждые 2 часа)
    await notifyQueue.add(
      'check-subscriptions',
      {},
      {
        repeat: {
          every: config.worker.notifyInterval, // 2 часа
        },
        jobId: 'periodic-subscriptions-check',
      }
    );

    // Добавляем задачу парсинга сразу при старте
    await parseQueue.add('initial-rabota', {
      source: 'rabota.md',
      searchQuery: 'it',
      maxPages: 3,
    });

    console.log('🔧 Worker запущен');
    console.log(`📊 Concurrency: ${config.worker.concurrency}`);
    console.log(`⏰ Интервал парсинга: ${config.worker.parseInterval / 1000 / 60} минут`);
    console.log(`🔔 Интервал проверки подписок: ${config.worker.notifyInterval / 1000 / 60} минут`);

    // Graceful shutdown
    const shutdown = async () => {
      console.log('Останавливаю worker...');
      if (parseWorker) await parseWorker.close();
      if (notifyWorker) await notifyWorker.close();
      if (parseQueue) await parseQueue.close();
      if (notifyQueue) await notifyQueue.close();
      await prisma.$disconnect();
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error: any) {
    console.error('❌ Не удалось подключиться к Redis:');
    console.error('   Ошибка:', error.message);
    console.error('   Стек:', error.stack);
    console.log('');
    console.log('⚠️  Worker не запущен. Возможные причины:');
    console.log('   1. Redis не запущен (запустите: redis-server)');
    console.log('   2. Неправильный хост/порт в конфигурации');
    console.log('   3. Неправильный пароль Redis');
    console.log('');
    console.log('💡 API будет работать без фоновых задач.');
    console.log('   Фоновое обновление вакансий будет недоступно.');
    
    // Не выходим из процесса, чтобы не крашить всё приложение
    // API сможет работать без Worker
  }
}

// Запускаем Worker
startWorker().catch(err => {
  console.error('Fatal error starting worker:', err);
  process.exit(1);
});

// Экспортируем очереди для использования в других модулях
export { parseQueue, notifyQueue };
