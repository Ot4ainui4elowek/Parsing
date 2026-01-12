/**
 * Vacancy Manager - центральный менеджер для управления вакансиями
 * 
 * Логика:
 * 1. Проверяем БД сначала
 * 2. Если есть данные → отдаем сразу (cache) + фоновое обновление если нужно
 * 3. Если данных нет → парсим СЕЙЧАС (fresh)
 * 4. Поддержка семантического поиска через словарики
 * 5. Парсинг одного источника
 * 6. Пагинация по номеру страницы (page)
 */

import { prisma } from '../../db/index.js';
import { vacancyService } from '../../api/services/vacancy.service.js';
import { professionDictionaryService } from '../../api/services/profession-dictionary.service.js';
import { cacheService } from '../../api/services/cache.service.js';
import { RabotaMdParser } from '../../parsers/rabotaMd.js';
import { NineNineNineMdParser } from '../../parsers/nineNineNineMd.js';
import { MaklerMdParser } from '../../parsers/maklerMd.js';

export interface SearchFilters {
  keywords?: string[];
  locations?: string[];
  salaryMin?: number;
  experience?: string[];
  schedule?: string[];
  sources?: ('rabota.md' | '999.md' | 'makler.md')[];
  limit?: number;
  page?: number;          // Номер страницы (начиная с 1)
  useSemanticSearch?: boolean; // Использовать семантический поиск
}

export interface SearchResult {
  vacancies: any[];
  meta: {
    total: number;
    totalPages: number;   // Общее количество страниц
    source: 'cache' | 'fresh' | 'partial' | 'cache-paginated';
    lastUpdate: Date | null;
    updating: boolean;
    parseReason?: string;
    semanticMappings?: any; // Результаты семантического поиска
  };
}

export class VacancyManager {
  private static instance: VacancyManager;
  private readonly STALE_THRESHOLD = 12 * 60 * 60 * 1000; // 12 часов
  private parseQueue: any = null;

  private constructor() {}

  static getInstance(): VacancyManager {
    if (!VacancyManager.instance) {
      VacancyManager.instance = new VacancyManager();
    }
    return VacancyManager.instance;
  }

  setQueue(queue: any) {
    this.parseQueue = queue;
  }

  /**
   * Главный метод поиска вакансий
   * 
   * Логика:
   * 1. Если есть userId - проверяем Redis кэш для быстрой пагинации
   * 2. Если useSemanticSearch=true → семантический поиск через словарики
   * 3. Проверяем БД сначала
   * 4. Если есть данные → отдаем сразу (cache) + фоновое обновление
   * 5. Если данных нет → парсим СЕЙЧАС (fresh)
   */
  async search(filters: SearchFilters, userId?: string): Promise<SearchResult> {
    const sources = filters.sources || ['rabota.md', '999.md', 'makler.md'];
    const searchQuery = filters.keywords?.[0] || 'работа';
    const limit = filters.limit || 10;
    const page = filters.page || 1;

    console.log(`🔍 Поиск вакансий:`, { 
      keywords: filters.keywords, 
      sources,
      searchQuery,
      useSemanticSearch: filters.useSemanticSearch,
      userId: userId || 'anonymous',
      limit,
      page
    });

    // НОВАЯ ЛОГИКА: Проверяем Redis кэш для пагинации
    if (userId) {
      const cacheKey = cacheService.generateKey(userId, filters);
      const hasCache = await cacheService.hasCache(cacheKey);

      if (hasCache) {
        console.log(`📦 Найден кэш для пользователя ${userId}`);
        
        // Вычисляем offset из page
        const offset = (page - 1) * limit;
        
        // Получаем страницу из кэша
        const cachedPage = await cacheService.getPage(cacheKey, limit, offset);
        
        if (cachedPage) {
          // Получаем мета-информацию
          const cachedResults = await cacheService.getCachedResults(cacheKey);
          const total = cachedResults?.total || 0;
          const totalPages = Math.ceil(total / limit);
          
          return {
            vacancies: cachedPage,
            meta: {
              total,
              totalPages,
              source: 'cache-paginated',
              lastUpdate: cachedResults?.cachedAt || new Date(),
              updating: false
            }
          };
        }
      }
    }

    // Если включен семантический поиск - используем его
    if (filters.useSemanticSearch) {
      return this.searchWithSemantics(filters, userId);
    }

    // Обычный поиск
    return this.searchRegular(filters, userId);
  }

  /**
   * Обычный поиск (без семантики)
   */
  private async searchRegular(filters: SearchFilters, userId?: string): Promise<SearchResult> {
    const sources = filters.sources || ['rabota.md', '999.md', 'makler.md'];
    const searchQuery = filters.keywords?.[0] || 'работа';
    const limit = filters.limit || 10;
    const page = filters.page || 1;

    // 1. СНАЧАЛА проверяем БД - получаем ВСЕ результаты для кэширования
    const allVacancies = await vacancyService.findByFilters({
      ...filters,
      sources,
      limit: undefined, // Берем ВСЕ вакансии
      page: undefined
    });

    console.log(`📊 Найдено в БД: ${allVacancies.length} вакансий`);

    // Кэшируем результаты если есть userId
    if (userId && allVacancies.length > 0) {
      const cacheKey = cacheService.generateKey(userId, filters);
      await cacheService.cacheSearchResults(cacheKey, allVacancies, filters);
    }

    // Вычисляем пагинацию
    const total = allVacancies.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const vacancies = allVacancies.slice(offset, offset + limit);

    console.log(`📄 Страница ${page}/${totalPages}, показываю ${vacancies.length} из ${total} вакансий`);

    // 2. Проверяем историю парсинга
    const parseHistory = await this.checkParseHistory(sources, searchQuery);
    
    console.log(`📊 История парсинга для "${searchQuery}":`);
    parseHistory.forEach(h => {
      console.log(`   ${h.source}: ${h.wasRecentlyParsed ? '✅ недавно' : '❌ устарел'} (${h.lastParse?.toLocaleString() || 'никогда'})`);
    });

    // 3. Определяем какие источники нужно обновить
    const sourcesToUpdate = parseHistory
      .filter(p => !p.wasRecentlyParsed)
      .map(p => p.source);

    // 4. ЕСЛИ В БД ЕСТЬ ДАННЫЕ → отдаем сразу
    if (allVacancies.length > 0) {
      console.log(`✅ Данные найдены в БД, возвращаю страницу ${page}`);
      
      // Фоновое обновление если нужно
      if (sourcesToUpdate.length > 0) {
        console.log(`⏰ Запускаю фоновое обновление для: ${sourcesToUpdate.join(', ')}`);
        this.scheduleBackgroundParsing(sourcesToUpdate as any, searchQuery);
      }

      const lastUpdate = parseHistory.reduce((latest, p) => {
        if (!p.lastParse) return latest;
        return !latest || p.lastParse > latest ? p.lastParse : latest;
      }, null as Date | null);

      return {
        vacancies,
        meta: {
          total,
          totalPages,
          source: 'cache',
          lastUpdate,
          updating: sourcesToUpdate.length > 0
        }
      };
    }

    // 5. ЕСЛИ В БД НЕТ ДАННЫХ → парсим СЕЙЧАС
    console.log(`\n📭 Данных нет в БД, запускаю синхронный парсинг`);
    console.log(`   Источники: ${sources.join(', ')}`);
    
    await this.parseNow(sources as any, filters, searchQuery);
    
    // Получаем свежие данные
    const freshVacancies = await vacancyService.findByFilters({
      ...filters,
      sources,
      limit: undefined,
      page: undefined
    });

    // Вычисляем пагинацию для свежих данных
    const freshTotal = freshVacancies.length;
    const freshTotalPages = Math.ceil(freshTotal / limit);
    const freshOffset = (page - 1) * limit;
    const freshPage = freshVacancies.slice(freshOffset, freshOffset + limit);
    
    console.log(`✅ Парсинг завершен. Найдено вакансий: ${freshTotal}`);
    
    return {
      vacancies: freshPage,
      meta: {
        total: freshTotal,
        totalPages: freshTotalPages,
        source: 'fresh',
        lastUpdate: new Date(),
        updating: false,
        parseReason: 'Нет данных в БД'
      }
    };
  }

  /**
   * Поиск с семантическим маппингом
   * 
   * Логика:
   * 1. Делаем семантический поиск в словариках
   * 2. Находим все похожие специальности для каждого источника
   * 3. Ищем в БД по ОРИГИНАЛЬНОМУ запросу (не по точным совпадениям)
   * 4. Если нужен парсинг - парсим с ТОЧНЫМИ названиями из словариков
   */
  private async searchWithSemantics(filters: SearchFilters, userId?: string): Promise<SearchResult> {
    const sources = filters.sources || ['rabota.md', '999.md', 'makler.md'];
    const searchQuery = filters.keywords?.[0] || 'работа';
    const limit = filters.limit || 10;
    const page = filters.page || 1;

    console.log(`🧠 Семантический поиск для "${searchQuery}"`);

    // 1. Семантический поиск в словариках
    const mappings = await professionDictionaryService.findProfessionMappings(
      searchQuery,
      sources
    );

    console.log(`📋 Найдено совпадений в словариках:`, mappings.mappings.length);

    // 2. Ищем в БД по ОРИГИНАЛЬНОМУ запросу - берем ВСЕ для кэширования
    const allVacancies = await vacancyService.findByFilters({
      ...filters,
      sources,
      limit: undefined,
      page: undefined
    });

    console.log(`📊 Найдено в БД (по "${searchQuery}"): ${allVacancies.length} вакансий`);

    // Кэшируем результаты если есть userId
    if (userId && allVacancies.length > 0) {
      const cacheKey = cacheService.generateKey(userId, filters);
      await cacheService.cacheSearchResults(cacheKey, allVacancies, filters);
    }

    // Вычисляем пагинацию
    const total = allVacancies.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const vacancies = allVacancies.slice(offset, offset + limit);

    // 3. Если данные есть - возвращаем, проверяем актуальность
    if (allVacancies.length > 0) {
      // Проверяем был ли парсинг с ТОЧНЫМИ названиями из словариков
      const parseHistory = await Promise.all(
        mappings.mappings.map(async (mapping) => {
          const lastParse = await prisma.parseLog.findFirst({
            where: {
              source: mapping.source,
              searchQuery: mapping.profession, // ТОЧНОЕ название
              status: 'success'
            },
            orderBy: { createdAt: 'desc' }
          });

          return {
            source: mapping.source,
            profession: mapping.profession,
            lastParse: lastParse?.createdAt || null,
            wasRecentlyParsed: lastParse 
              ? Date.now() - lastParse.createdAt.getTime() < this.STALE_THRESHOLD
              : false
          };
        })
      );

      const sourcesToUpdate = parseHistory
        .filter(p => !p.wasRecentlyParsed)
        .map(p => ({ source: p.source, profession: p.profession }));

      if (sourcesToUpdate.length > 0) {
        console.log(`⏰ Запускаю фоновое обновление с точными названиями:`);
        sourcesToUpdate.forEach(s => {
          console.log(`   ${s.source}: "${s.profession}"`);
        });
        
        this.scheduleSemanticParsing(sourcesToUpdate);
      }

      return {
        vacancies,
        meta: {
          total,
          totalPages,
          source: 'cache',
          lastUpdate: new Date(),
          updating: sourcesToUpdate.length > 0,
          semanticMappings: mappings
        }
      };
    }

    // 4. Если данных нет - парсим СЕЙЧАС с точными названиями
    console.log(`\n📭 Данных нет, запускаю семантический парсинг`);
    
    await this.parseWithSemantics(mappings);
    
    // Получаем свежие данные
    const freshVacancies = await vacancyService.findByFilters({
      ...filters,
      sources,
      limit: undefined,
      page: undefined
    });

    // Вычисляем пагинацию для свежих данных
    const freshTotal = freshVacancies.length;
    const freshTotalPages = Math.ceil(freshTotal / limit);
    const freshOffset = (page - 1) * limit;
    const freshPage = freshVacancies.slice(freshOffset, freshOffset + limit);
    
    console.log(`✅ Парсинг завершен. Найдено вакансий: ${freshTotal}`);
    
    return {
      vacancies: freshPage,
      meta: {
        total: freshTotal,
        totalPages: freshTotalPages,
        source: 'fresh',
        lastUpdate: new Date(),
        updating: false,
        parseReason: 'Семантический поиск - нет данных в БД',
        semanticMappings: mappings
      }
    };
  }

  /**
   * Парсинг с семантическими маппингами
   * Для каждого источника парсим с ТОЧНЫМ названием из словарика
   */
  private async parseWithSemantics(mappings: any): Promise<void> {
    console.log(`🚀 Запуск семантического парсинга`);

    // Группируем маппинги по источникам
    const groupedMappings: Record<string, any[]> = {};
    mappings.mappings.forEach((m: any) => {
      if (!groupedMappings[m.source]) {
        groupedMappings[m.source] = [];
      }
      groupedMappings[m.source].push(m);
    });

    // Парсим каждый источник с лучшим совпадением
    const parsePromises = Object.entries(groupedMappings).map(([source, matches]) => {
      // Берем лучшее совпадение (с максимальной similarity)
      const bestMatch = matches.sort((a, b) => b.similarity - a.similarity)[0];
      
      console.log(`   ${source}: парсинг "${bestMatch.profession}" (similarity: ${bestMatch.similarity})`);
      
      return this.parseSource(source, bestMatch.profession, Date.now());
    });

    await Promise.allSettled(parsePromises);
  }

  /**
   * Фоновый парсинг с семантическими маппингами
   */
  private async scheduleSemanticParsing(sourcesToUpdate: Array<{ source: string; profession: string }>) {
    if (!this.parseQueue) {
      console.log('   ⚠️  Worker не доступен, пропускаю фоновый парсинг');
      return;
    }

    for (const { source, profession } of sourcesToUpdate) {
      try {
        await this.parseQueue.add(
          `semantic-${source}-${profession}`,
          { source, searchQuery: profession, maxPages: 5 },
          { 
            priority: 5, 
            removeOnComplete: true,
            jobId: `semantic-${source}-${profession}-${Date.now()}`
          }
        );

        console.log(`   📋 Задача добавлена: ${source} "${profession}"`);
      } catch (error) {
        console.log(`   ⚠️  Не удалось добавить задачу для ${source}`);
      }
    }
  }

  private async checkParseHistory(sources: string[], searchQuery: string) {
    const history = await Promise.all(
      sources.map(async (source) => {
        const lastParse = await prisma.parseLog.findFirst({
          where: {
            source,
            status: 'success',
            searchQuery
          },
          orderBy: { createdAt: 'desc' }
        });

        const wasRecentlyParsed = lastParse 
          ? Date.now() - lastParse.createdAt.getTime() < this.STALE_THRESHOLD
          : false;

        return {
          source,
          lastParse: lastParse?.createdAt || null,
          wasRecentlyParsed
        };
      })
    );

    return history;
  }

  private async getLastSuccessfulParse(source: string): Promise<Date | null> {
    const log = await prisma.parseLog.findFirst({
      where: { source, status: 'success' },
      orderBy: { createdAt: 'desc' }
    });

    return log?.createdAt || null;
  }

  private async parseNow(sources: string[], _filters: SearchFilters, searchQuery: string): Promise<any[]> {
    console.log(`\n🚀 Запуск парсинга: ${sources.join(', ')} для запроса "${searchQuery}"`);
    
    const startTime = Date.now();

    const parsePromises = sources.map(source => 
      this.parseSource(source, searchQuery, startTime)
    );
    
    const results = await Promise.allSettled(parsePromises);
    
    const allVacancies: any[] = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        allVacancies.push(...result.value);
      } else {
        console.error(`❌ Ошибка парсинга ${sources[index]}:`, result.reason);
      }
    });

    console.log(`\n✅ Парсинг завершен: ${allVacancies.length} вакансий за ${Date.now() - startTime}мс`);

    return allVacancies;
  }

  private async parseSource(
    source: string, 
    searchQuery: string,
    startTime: number
  ): Promise<any[]> {
    try {
      console.log(`   🔍 Парсинг ${source} (запрос: "${searchQuery}")...`);
      
      let vacancies: any[] = [];
      let parser: any;

      switch (source) {
        case 'rabota.md':
          parser = new RabotaMdParser({
            parseDetails: true,
            cacheEnabled: true,
            concurrency: 3
          });
          break;
          
        case '999.md':
          parser = new NineNineNineMdParser({
            parseDetails: true,
            cacheEnabled: true,
            concurrency: 3,
            headless: true
          });
          break;
          
        case 'makler.md':
          parser = new MaklerMdParser({
            parseDetails: true,
            cacheEnabled: true,
            concurrency: 3,
            headless: true
          });
          break;
          
        default:
          console.log(`   ⚠️  Парсер для ${source} не реализован`);
          return [];
      }

      const result = await parser.parse({
        baseUrl: source === 'rabota.md' ? 'https://www.rabota.md' : 
                 source === '999.md' ? 'https://999.md' :
                 'https://makler.md',
        searchQuery,
        maxPages: 10
      });

      vacancies = result.vacancies;

      if (vacancies.length > 0) {
        const { created, updated } = await vacancyService.saveVacancies(vacancies);
        
        console.log(`   ✅ ${source}: ${created} новых, ${updated} обновлено`);

        await prisma.parseLog.create({
          data: {
            source,
            searchQuery,
            status: 'success',
            vacanciesFound: vacancies.length,
            vacanciesNew: created,
            duration: Date.now() - startTime
          }
        });
      } else {
        console.log(`   ⚠️  ${source}: вакансий не найдено`);
        
        await prisma.parseLog.create({
          data: {
            source,
            searchQuery,
            status: 'success',
            vacanciesFound: 0,
            vacanciesNew: 0,
            duration: Date.now() - startTime
          }
        });
      }

      return vacancies;

    } catch (error: any) {
      console.error(`   ❌ Ошибка ${source}:`, error.message);
      
      await prisma.parseLog.create({
        data: {
          source,
          searchQuery,
          status: 'error',
          error: error.message,
          duration: Date.now() - startTime
        }
      });

      return [];
    }
  }

  private async scheduleBackgroundParsing(sources: string[], searchQuery: string) {
    if (!this.parseQueue) {
      console.log('   ⚠️  Worker не доступен, пропускаю фоновый парсинг');
      return;
    }

    for (const source of sources) {
      try {
        await this.parseQueue.add(
          `background-${source}-${searchQuery}`,
          { source, searchQuery, maxPages: 10 },
          { 
            priority: 5, 
            removeOnComplete: true,
            jobId: `bg-${source}-${searchQuery}-${Date.now()}`
          }
        );

        console.log(`   📋 Задача фонового парсинга добавлена: ${source}`);
      } catch (error) {
        console.log(`   ⚠️  Не удалось добавить задачу для ${source}:`, error);
      }
    }
  }

  async forceParse(sources?: string[], searchQuery?: string): Promise<{ success: boolean; results: any[] }> {
    const targetSources = sources || ['rabota.md', '999.md', 'makler.md'];
    const query = searchQuery || 'работа';
    
    console.log('🚀 Принудительный парсинг:', targetSources, `запрос: "${query}"`);

    const vacancies = await this.parseNow(targetSources, {}, query);
    
    return {
      success: true,
      results: vacancies
    };
  }

  async getStats() {
    const sources = ['rabota.md', '999.md', 'makler.md'];
    
    const stats = await Promise.all(
      sources.map(async (source) => {
        const count = await prisma.vacancy.count({ where: { source } });
        const lastParse = await this.getLastSuccessfulParse(source);
        const isStale = lastParse 
          ? Date.now() - lastParse.getTime() > this.STALE_THRESHOLD
          : true;

        return {
          source,
          count,
          lastParse,
          isStale,
          status: count === 0 ? 'empty' : isStale ? 'stale' : 'fresh'
        };
      })
    );

    return stats;
  }

  async cleanupOld(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getTime() - daysOld);

    const result = await prisma.vacancy.deleteMany({
      where: { publishedAt: { lt: cutoffDate } }
    });

    console.log(`🗑️  Удалено ${result.count} вакансий старше ${daysOld} дней`);
    return result.count;
  }
}

export const vacancyManager = VacancyManager.getInstance();
