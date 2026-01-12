/**
 * Сервис для работы со словариками специальностей
 * Поддержка семантического поиска и маппинга между сайтами
 */

import { prisma } from '../../db/index.js';

export interface ProfessionMapping {
  searchQuery: string;
  mappings: {
    source: string;
    profession: string;
    professionId?: string;
    similarity: number; // 0-1, насколько похоже
  }[];
}

export class ProfessionDictionaryService {
  /**
   * Сохранить словарик для источника
   * С автоматическим заполнением синонимов
   */
  async saveProfessions(
    source: string,
    professions: Array<{
      profession: string;
      professionId?: string;
      category?: string;
      synonyms?: string[];
    }>
  ) {
    console.log(`💾 Сохраняю ${professions.length} специальностей для ${source}`);

    const results = await Promise.allSettled(
      professions.map(async (prof) => {
        // Автоматически генерируем синонимы если не указаны
        const synonyms = prof.synonyms || this.generateSynonyms(prof.profession);
        
        return prisma.professionDictionary.upsert({
          where: {
            source_profession: {
              source,
              profession: prof.profession
            }
          },
          create: {
            source,
            profession: prof.profession,
            professionId: prof.professionId,
            category: prof.category,
            synonyms
          },
          update: {
            professionId: prof.professionId,
            category: prof.category,
            synonyms
          }
        });
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`✅ Сохранено: ${successful}, ошибок: ${failed}`);

    return { successful, failed };
  }

  /**
   * Автоматическая генерация синонимов
   * На основе слов в названии
   */
  private generateSynonyms(profession: string): string[] {
    const synonyms: string[] = [];
    const profLower = profession.toLowerCase();

    // Словарь синонимов
    const synonymMap: Record<string, string[]> = {
      'программист': ['разработчик', 'developer', 'кодер'],
      'разработчик': ['программист', 'developer'],
      'developer': ['программист', 'разработчик'],
      'it': ['ит', 'информационные технологии'],
      'менеджер': ['manager', 'управляющий'],
      'водитель': ['driver', 'шофер'],
      'бухгалтер': ['счетовод', 'accountant'],
      'дизайнер': ['designer'],
      'маркетолог': ['marketer', 'специалист по маркетингу'],
      'продавец': ['продажник', 'sales'],
    };

    // Ищем совпадения в словаре
    for (const [key, syns] of Object.entries(synonymMap)) {
      if (profLower.includes(key)) {
        synonyms.push(...syns);
      }
    }

    // Убираем дубликаты
    return [...new Set(synonyms)];
  }

  /**
   * Получить все специальности для источника
   */
  async getProfessionsBySource(source: string) {
    return prisma.professionDictionary.findMany({
      where: { source },
      orderBy: { profession: 'asc' }
    });
  }

  /**
   * Получить все специальности (для всех источников)
   */
  async getAllProfessions() {
    const professions = await prisma.professionDictionary.findMany({
      orderBy: [{ source: 'asc' }, { profession: 'asc' }]
    });

    // Группируем по источникам
    const grouped: Record<string, any[]> = {};
    professions.forEach(prof => {
      if (!grouped[prof.source]) {
        grouped[prof.source] = [];
      }
      grouped[prof.source].push(prof);
    });

    return grouped;
  }

  /**
   * Семантический поиск - находит подходящие специальности для каждого источника
   * 
   * Логика:
   * 1. Ищем точные совпадения
   * 2. Ищем совпадения в синонимах
   * 3. Ищем частичные совпадения (подстрока)
   */
  async findProfessionMappings(searchQuery: string, sources?: string[]): Promise<ProfessionMapping> {
    const targetSources = sources || ['rabota.md', '999.md', 'makler.md'];
    const searchLower = searchQuery.toLowerCase().trim();

    console.log(`🔍 Семантический поиск специальностей для "${searchQuery}"`);

    const mappings = await Promise.all(
      targetSources.map(async (source) => {
        // Получаем все специальности для источника
        const professions = await this.getProfessionsBySource(source);

        // Ищем совпадения
        const matches = professions
          .map(prof => {
            const profLower = prof.profession.toLowerCase();
            
            // 1. Точное совпадение
            if (profLower === searchLower) {
              return { ...prof, similarity: 1.0 };
            }

            // 2. Совпадение в синонимах
            const synonymMatch = prof.synonyms.find(
              syn => syn.toLowerCase() === searchLower
            );
            if (synonymMatch) {
              return { ...prof, similarity: 0.9 };
            }

            // 3. Частичное совпадение (подстрока)
            if (profLower.includes(searchLower) || searchLower.includes(profLower)) {
              return { ...prof, similarity: 0.7 };
            }

            // 4. Совпадение первых слов
            const searchWords = searchLower.split(/\s+/);
            const profWords = profLower.split(/\s+/);
            
            const commonWords = searchWords.filter(w => profWords.includes(w));
            if (commonWords.length > 0) {
              const similarity = commonWords.length / Math.max(searchWords.length, profWords.length);
              if (similarity > 0.5) {
                return { ...prof, similarity };
              }
            }

            return null;
          })
          .filter((m): m is NonNullable<typeof m> => m !== null)
          .sort((a, b) => b.similarity - a.similarity) // Сортируем по релевантности
          .slice(0, 3); // Берем топ-3

        if (matches.length > 0) {
          console.log(`   ${source}: найдено ${matches.length} совпадений (лучшая: "${matches[0].profession}", similarity: ${matches[0].similarity})`);
        } else {
          console.log(`   ${source}: совпадений не найдено`);
        }

        return {
          source,
          matches: matches.map(m => ({
            profession: m.profession,
            professionId: m.professionId || undefined,
            similarity: m.similarity
          }))
        };
      })
    );

    return {
      searchQuery,
      mappings: mappings
        .filter(m => m.matches.length > 0)
        .flatMap(m => m.matches.map(match => ({
          source: m.source,
          profession: match.profession,
          professionId: match.professionId,
          similarity: match.similarity
        })))
    };
  }

  /**
   * Получить статистику по словарикам
   */
  async getStats() {
    const sources = ['rabota.md', '999.md', 'makler.md'];
    
    const stats = await Promise.all(
      sources.map(async (source) => {
        const count = await prisma.professionDictionary.count({
          where: { source }
        });

        const lastUpdated = await prisma.professionDictionary.findFirst({
          where: { source },
          orderBy: { updatedAt: 'desc' },
          select: { updatedAt: true }
        });

        return {
          source,
          count,
          lastUpdated: lastUpdated?.updatedAt || null
        };
      })
    );

    return stats;
  }

  /**
   * Очистить словарик для источника
   */
  async clearProfessions(source: string) {
    const result = await prisma.professionDictionary.deleteMany({
      where: { source }
    });

    console.log(`🗑️  Удалено ${result.count} специальностей для ${source}`);
    return result.count;
  }
}

export const professionDictionaryService = new ProfessionDictionaryService();
