/**
 * Job для парсинга вакансий из указанного источника
 */

import { Job } from 'bullmq';
import { RabotaMdParser } from '../../parsers/rabotaMd.js';
import { NineNineNineMdParser } from '../../parsers/nineNineNineMd.js';
import { MaklerMdParser } from '../../parsers/maklerMd.js';
import { vacancyService } from '../../api/services/vacancy.service.js';
import { prisma } from '../../db/index.js';

interface ParseJobData {
  source: 'rabota.md' | '999.md' | 'makler.md';
  searchQuery?: string;
  maxPages?: number;
}

export async function parseJobProcessor(job: Job<ParseJobData>) {
  const { source, searchQuery, maxPages = 5 } = job.data;
  const startTime = Date.now();

  job.log(`Starting parse for ${source}`);

  try {
    let vacancies: any[] = [];

    // Выбираем парсер в зависимости от источника
    switch (source) {
      case 'rabota.md': {
        const parser = new RabotaMdParser({
          parseDetails: true,
          cacheEnabled: true,
        });

        const result = await parser.parse({
          baseUrl: 'https://www.rabota.md',
          searchQuery: searchQuery || 'it',
          maxPages,
        });

        vacancies = result.vacancies;
        break;
      }
      
      case '999.md': {
        const parser = new NineNineNineMdParser({
          parseDetails: true,
          cacheEnabled: true,
          headless: true,
          concurrency: 3
        });

        const result = await parser.parse({
          baseUrl: 'https://999.md',
          searchQuery: searchQuery || 'работа',
          maxPages,
        });

        vacancies = result.vacancies;
        break;
      }
      
      case 'makler.md': {
        const parser = new MaklerMdParser({
          parseDetails: true,
          cacheEnabled: true,
          headless: true,
          concurrency: 3
        });

        const result = await parser.parse({
          baseUrl: 'https://makler.md',
          searchQuery: searchQuery || 'работа',
          maxPages,
        });

        vacancies = result.vacancies;
        break;
      }
      
      default:
        throw new Error(`Parser for source ${source} not implemented`);
    }

    job.log(`Found ${vacancies.length} vacancies`);

    // Сохраняем в БД
    const { created, updated } = await vacancyService.saveVacancies(vacancies);

    const duration = Date.now() - startTime;

    // Логируем результат
    await prisma.parseLog.create({
      data: {
        source,
        searchQuery, // Сохраняем поисковый запрос
        status: 'success',
        vacanciesFound: vacancies.length,
        vacanciesNew: created,
        duration,
      },
    });

    job.log(`Parsing completed: ${created} new, ${updated} updated`);

    return {
      success: true,
      source,
      found: vacancies.length,
      created,
      updated,
      duration,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;

    // Логируем ошибку
    await prisma.parseLog.create({
      data: {
        source,
        searchQuery, // Сохраняем поисковый запрос и при ошибке
        status: 'error',
        duration,
        error: error.message,
      },
    });

    job.log(`Parsing failed: ${error.message}`);

    throw error;
  }
}
