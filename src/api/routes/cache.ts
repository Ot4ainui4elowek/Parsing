/**
 * API роуты для управления кэшем
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { cacheService } from '../services/cache.service.js';

export async function cacheRoutes(fastify: FastifyInstance) {
  // GET /cache/stats/:userId - Статистика кэша пользователя
  fastify.get<{ Params: { userId: string } }>(
    '/cache/stats/:userId',
    async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      try {
        const stats = await cacheService.getUserCacheStats(request.params.userId);

        return reply.send({
          success: true,
          data: stats
        });
      } catch (error: any) {
        request.log.error(error);
        return reply.status(500).send({
          success: false,
          error: 'Failed to get cache stats',
          message: error.message
        });
      }
    }
  );

  // DELETE /cache/:userId - Очистить кэш пользователя
  fastify.delete<{ Params: { userId: string } }>(
    '/cache/:userId',
    async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      try {
        const deleted = await cacheService.clearUserCache(request.params.userId);

        return reply.send({
          success: true,
          message: `Cleared cache for user ${request.params.userId}`,
          deleted
        });
      } catch (error: any) {
        request.log.error(error);
        return reply.status(500).send({
          success: false,
          error: 'Failed to clear cache',
          message: error.message
        });
      }
    }
  );
}
