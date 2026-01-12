/**
 * API роуты для работы со словариками специальностей
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { professionDictionaryService } from '../services/profession-dictionary.service.js';
import { updateAllDictionaries, updateDictionary } from '../../utils/dictionaries/index.js';

interface DictionaryQuery {
  source?: string;
  search?: string;
}

export async function dictionaryRoutes(fastify: FastifyInstance) {
  // GET /dictionaries - Получить все словарики
  fastify.get<{ Querystring: DictionaryQuery }>(
    '/dictionaries',
    async (request: FastifyRequest<{ Querystring: DictionaryQuery }>, reply: FastifyReply) => {
      try {
        const { source } = request.query;

        if (source) {
          // Получить словарик для конкретного источника
          const professions = await professionDictionaryService.getProfessionsBySource(source);

          return reply.send({
            success: true,
            data: {
              source,
              professions
            }
          });
        }

        // Получить все словарики
        const allProfessions = await professionDictionaryService.getAllProfessions();

        return reply.send({
          success: true,
          data: allProfessions
        });
      } catch (error: any) {
        request.log.error(error);
        return reply.status(500).send({
          success: false,
          error: 'Failed to fetch dictionaries',
          message: error.message
        });
      }
    }
  );

  // GET /dictionaries/search - Семантический поиск по словарикам
  fastify.get<{ Querystring: { query: string; sources?: string } }>(
    '/dictionaries/search',
    async (
      request: FastifyRequest<{ Querystring: { query: string; sources?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { query, sources } = request.query;

        if (!query) {
          return reply.status(400).send({
            success: false,
            error: 'Query parameter is required'
          });
        }

        const sourcesArray = sources ? sources.split(',') : undefined;
        const mappings = await professionDictionaryService.findProfessionMappings(
          query,
          sourcesArray
        );

        return reply.send({
          success: true,
          data: mappings
        });
      } catch (error: any) {
        request.log.error(error);
        return reply.status(500).send({
          success: false,
          error: 'Failed to search dictionaries',
          message: error.message
        });
      }
    }
  );

  // GET /dictionaries/stats - Статистика по словарикам
  fastify.get('/dictionaries/stats', async (request, reply) => {
    try {
      const stats = await professionDictionaryService.getStats();

      return reply.send({
        success: true,
        data: stats
      });
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch stats',
        message: error.message
      });
    }
  });

  // POST /dictionaries/update - Обновить словарики
  fastify.post<{ Body: { source?: string } }>(
    '/dictionaries/update',
    async (request: FastifyRequest<{ Body: { source?: string } }>, reply: FastifyReply) => {
      try {
        const { source } = request.body || {};

        if (source) {
          // Обновить словарик для одного источника
          if (!['rabota.md', '999.md', 'makler.md'].includes(source)) {
            return reply.status(400).send({
              success: false,
              error: 'Invalid source. Must be one of: rabota.md, 999.md, makler.md'
            });
          }

          await updateDictionary(source as any);

          return reply.send({
            success: true,
            message: `Dictionary for ${source} updated`
          });
        }

        // Обновить все словарики
        await updateAllDictionaries();

        return reply.send({
          success: true,
          message: 'All dictionaries updated'
        });
      } catch (error: any) {
        request.log.error(error);
        return reply.status(500).send({
          success: false,
          error: 'Failed to update dictionaries',
          message: error.message
        });
      }
    }
  );

  // DELETE /dictionaries - Очистить словарик
  fastify.delete<{ Body: { source: string } }>(
    '/dictionaries',
    async (request: FastifyRequest<{ Body: { source: string } }>, reply: FastifyReply) => {
      try {
        const { source } = request.body;

        if (!source) {
          return reply.status(400).send({
            success: false,
            error: 'Source parameter is required'
          });
        }

        const deleted = await professionDictionaryService.clearProfessions(source);

        return reply.send({
          success: true,
          message: `Deleted ${deleted} professions from ${source}`
        });
      } catch (error: any) {
        request.log.error(error);
        return reply.status(500).send({
          success: false,
          error: 'Failed to clear dictionary',
          message: error.message
        });
      }
    }
  );
}
