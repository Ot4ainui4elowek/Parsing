/**
 * Сервис для кэширования результатов поиска вакансий
 * Использует Redis для быстрой пагинации
 */

import { Redis } from 'ioredis';
import crypto from 'crypto';
import { config } from '../../shared/config/index.js';
import { SearchFilters } from '../../shared/managers/vacancyManager.js';

export interface CachedSearchResult {
  vacancies: any[];
  total: number;
  filters: SearchFilters;
  cachedAt: Date;
}

export class CacheService {
  private redis: Redis;
  private readonly DEFAULT_TTL = 30 * 60; // 30 минут
  private readonly KEY_PREFIX = 'search';

  constructor() {
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      // Настройки для стабильности
      retryStrategy: (times) => {
        if (times > 3) return null; // Прекратить после 3 попыток
        return Math.min(times * 100, 3000); // Экспоненциальная задержка
      },
      maxRetriesPerRequest: 3,
    });

    this.redis.on('error', (err) => {
      console.error('❌ Redis Cache Error:', err.message);
    });

    this.redis.on('connect', () => {
      console.log('✅ Redis Cache подключен');
    });
  }

  /**
   * Генерация уникального ключа кэша на основе userId и фильтров
   */
  generateKey(userId: string, filters: SearchFilters): string {
    const filterHash = this.generateFilterHash(filters);
    return `${this.KEY_PREFIX}:${userId}:${filterHash}`;
  }

  /**
   * Генерация хэша от фильтров поиска
   * Одинаковые фильтры = одинаковый хэш
   */
  private generateFilterHash(filters: SearchFilters): string {
    // Нормализуем фильтры (сортируем массивы для консистентности)
    const normalized = {
      keywords: filters.keywords?.sort() || [],
      locations: filters.locations?.sort() || [],
      salaryMin: filters.salaryMin || null,
      experience: filters.experience?.sort() || [],
      schedule: filters.schedule?.sort() || [],
      sources: filters.sources?.sort() || [],
      useSemanticSearch: filters.useSemanticSearch || false,
    };

    // Хэшируем
    const filterString = JSON.stringify(normalized);
    return crypto.createHash('md5').update(filterString).digest('hex').substring(0, 8);
  }

  /**
   * Сохранить результаты поиска в кэш
   */
  async cacheSearchResults(
    key: string,
    vacancies: any[],
    filters: SearchFilters,
    ttl: number = this.DEFAULT_TTL
  ): Promise<void> {
    try {
      const data: CachedSearchResult = {
        vacancies,
        total: vacancies.length,
        filters,
        cachedAt: new Date(),
      };

      await this.redis.setex(key, ttl, JSON.stringify(data));
      console.log(`💾 Кэш сохранен: ${key} (${vacancies.length} вакансий, TTL: ${ttl}с)`);
    } catch (error) {
      console.error('❌ Ошибка сохранения в кэш:', error);
      // Не пробрасываем ошибку - кэш не критичен
    }
  }

  /**
   * Получить страницу из кэша
   */
  async getPage(key: string, limit: number, offset: number): Promise<any[] | null> {
    try {
      const cached = await this.redis.get(key);

      if (!cached) {
        return null;
      }

      const data: CachedSearchResult = JSON.parse(cached);

      // Вырезаем нужную страницу
      const page = data.vacancies.slice(offset, offset + limit);

      console.log(`📦 Из кэша: ${key} (страница ${Math.floor(offset / limit) + 1}, ${page.length} вакансий)`);

      return page;
    } catch (error) {
      console.error('❌ Ошибка чтения из кэша:', error);
      return null;
    }
  }

  /**
   * Получить полные результаты из кэша (для мета-информации)
   */
  async getCachedResults(key: string): Promise<CachedSearchResult | null> {
    try {
      const cached = await this.redis.get(key);

      if (!cached) {
        return null;
      }

      return JSON.parse(cached);
    } catch (error) {
      console.error('❌ Ошибка чтения из кэша:', error);
      return null;
    }
  }

  /**
   * Проверить существует ли кэш для ключа
   */
  async hasCache(key: string): Promise<boolean> {
    try {
      const exists = await this.redis.exists(key);
      return exists === 1;
    } catch (error) {
      console.error('❌ Ошибка проверки кэша:', error);
      return false;
    }
  }

  /**
   * Очистить весь кэш пользователя
   */
  async clearUserCache(userId: string): Promise<number> {
    try {
      const pattern = `${this.KEY_PREFIX}:${userId}:*`;
      const keys = await this.redis.keys(pattern);

      if (keys.length === 0) {
        return 0;
      }

      const deleted = await this.redis.del(...keys);
      console.log(`🗑️  Очищен кэш пользователя ${userId}: ${deleted} ключей`);

      return deleted;
    } catch (error) {
      console.error('❌ Ошибка очистки кэша:', error);
      return 0;
    }
  }

  /**
   * Очистить конкретный ключ кэша
   */
  async clearCache(key: string): Promise<boolean> {
    try {
      const deleted = await this.redis.del(key);
      return deleted === 1;
    } catch (error) {
      console.error('❌ Ошибка удаления из кэша:', error);
      return false;
    }
  }

  /**
   * Получить статистику кэша пользователя
   */
  async getUserCacheStats(userId: string): Promise<{
    totalKeys: number;
    keys: string[];
  }> {
    try {
      const pattern = `${this.KEY_PREFIX}:${userId}:*`;
      const keys = await this.redis.keys(pattern);

      return {
        totalKeys: keys.length,
        keys,
      };
    } catch (error) {
      console.error('❌ Ошибка получения статистики кэша:', error);
      return { totalKeys: 0, keys: [] };
    }
  }

  /**
   * Закрыть соединение с Redis
   */
  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}

// Singleton
export const cacheService = new CacheService();
