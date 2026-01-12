/**
 * Сервис для работы с вакансиями в БД
 */

import { prisma } from '../../db/index.js';
import { Prisma, Vacancy } from '@prisma/client';
import { getAdapter } from '../../parsers/adapters/index.js';
import { Vacancy as ParsedVacancy } from '../../types/vacancy.js';

export class VacancyService {
  /**
   * Сохранить вакансии в БД (upsert - создать или обновить)
   */
  async saveVacancies(vacancies: ParsedVacancy[]): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;

    for (const vacancy of vacancies) {
      const adapter = getAdapter(vacancy.source as any);
      const prismaData = adapter.toPrisma(vacancy);

      const result = await prisma.vacancy.upsert({
        where: {
          source_sourceId: {
            source: prismaData.source,
            sourceId: prismaData.sourceId,
          },
        },
        create: prismaData,
        update: {
          ...prismaData,
          updatedAt: new Date(),
        },
      });

      // Проверяем была ли создана или обновлена
      if (result.createdAt.getTime() === result.updatedAt.getTime()) {
        created++;
      } else {
        updated++;
      }
    }

    return { created, updated };
  }

  /**
   * Найти вакансии по фильтрам
   */
  async findByFilters(filters: {
    keywords?: string[];
    locations?: string[];
    salaryMin?: number;
    experience?: string[];
    schedule?: string[];
    sources?: string[];
    publishedAfter?: Date;
    limit?: number;
    page?: number;
  }): Promise<Vacancy[]> {
    const where: Prisma.VacancyWhereInput = {};

    // Ключевые слова (поиск в title и description)
    if (filters.keywords && filters.keywords.length > 0) {
      where.OR = filters.keywords.map((keyword) => ({
        OR: [
          { title: { contains: keyword, mode: 'insensitive' } },
          { description: { contains: keyword, mode: 'insensitive' } },
        ],
      }));
    }

    // Локация
    if (filters.locations && filters.locations.length > 0) {
      where.location = {
        in: filters.locations,
        mode: 'insensitive',
      };
    }

    // Минимальная зарплата
    if (filters.salaryMin) {
      where.salaryMax = {
        gte: filters.salaryMin,
      };
    }

    // Опыт
    if (filters.experience && filters.experience.length > 0) {
      where.experience = {
        in: filters.experience,
      };
    }

    // График работы
    if (filters.schedule && filters.schedule.length > 0) {
      where.schedule = {
        in: filters.schedule,
      };
    }

    // Источники
    if (filters.sources && filters.sources.length > 0) {
      where.source = {
        in: filters.sources,
      };
    }

    // Дата публикации
    if (filters.publishedAfter) {
      where.publishedAt = {
        gte: filters.publishedAfter,
      };
    }

    return prisma.vacancy.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      take: filters.limit || 50,
      skip: filters.page || 0,
    });
  }

  /**
   * Получить вакансию по ID
   */
  async getById(id: string): Promise<Vacancy | null> {
    return prisma.vacancy.findUnique({
      where: { id },
    });
  }

  /**
   * Получить вакансию по source и sourceId
   */
  async getBySourceId(source: string, sourceId: string): Promise<Vacancy | null> {
    return prisma.vacancy.findUnique({
      where: {
        source_sourceId: { source, sourceId },
      },
    });
  }

  /**
   * Удалить старые вакансии (старше N дней)
   */
  async deleteOlderThan(days: number): Promise<number> {
    const date = new Date();
    date.setDate(date.getDate() - days);

    const result = await prisma.vacancy.deleteMany({
      where: {
        publishedAt: {
          lt: date,
        },
      },
    });

    return result.count;
  }

  /**
   * Получить статистику по источникам
   */
  async getStats(): Promise<{ source: string; count: number }[]> {
    const result = await prisma.vacancy.groupBy({
      by: ['source'],
      _count: {
        id: true,
      },
    });

    return result.map((r) => ({
      source: r.source,
      count: r._count.id,
    }));
  }

  /**
   * Получить время последнего парсинга для источника
   */
  async getLastParseTime(source: string): Promise<Date | null> {
    const log = await prisma.parseLog.findFirst({
      where: { source, status: 'success' },
      orderBy: { createdAt: 'desc' },
    });

    return log?.createdAt || null;
  }
}

// Singleton
export const vacancyService = new VacancyService();
