import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔌 Тестируем подключение к БД...\n');
  
  try {
    // 1. Создаем тестового пользователя
    const user = await prisma.user.create({
      data: {
        telegramId: 123456789n,
        username: 'testuser',
        firstName: 'Тест',
        lastName: 'Тестович'
      }
    });
    console.log('✅ Пользователь создан:', {
      id: user.id,
      telegramId: user.telegramId.toString(),
      username: user.username
    });
    
    // 2. Создаем настройки для него
    const settings = await prisma.userSettings.create({
      data: {
        userId: user.id,
        language: 'ru',
        notificationsOn: true,
        maxNotifications: 5
      }
    });
    console.log('✅ Настройки созданы:', settings);
    
    // 3. Создаем подписку
    const subscription = await prisma.subscription.create({
      data: {
        userId: user.id,
        isActive: true,
        filters: {
          keywords: ['JavaScript', 'Node.js'],
          salaryMin: 100000,
          location: 'Москва'
        },
        sources: ['hh', 'rabota']
      }
    });
    console.log('✅ Подписка создана:', subscription);
    
    // 4. Создаем тестовую вакансию
    const vacancy = await prisma.vacancy.create({
      data: {
        title: 'Senior Node.js Developer',
        company: 'Tech Corp',
        description: 'Ищем опытного разработчика на Node.js',
        location: 'Москва',
        salaryMin: 150000,
        salaryMax: 250000,
        salaryCurrency: 'RUB',
        experience: 'between_3_and_6',
        employment: 'full',
        schedule: 'remote',
        skills: ['Node.js', 'PostgreSQL', 'Docker'],
        source: 'hh',
        sourceId: 'test-123',
        sourceUrl: 'https://hh.ru/vacancy/test-123',
        publishedAt: new Date(),
        rawData: { original: 'test data' }
      }
    });
    console.log('✅ Вакансия создана:', {
      id: vacancy.id,
      title: vacancy.title,
      company: vacancy.company
    });
    
    // 5. Читаем все обратно
    console.log('\n📋 Читаем данные из БД:');
    
    const allUsers = await prisma.user.findMany({
      include: {
        settings: true,
        subscriptions: true
      }
    });
    console.log(`   Пользователей: ${allUsers.length}`);
    
    const allVacancies = await prisma.vacancy.findMany();
    console.log(`   Вакансий: ${allVacancies.length}`);
    
    // 6. Удаляем тестовые данные
    await prisma.subscription.delete({ where: { id: subscription.id } });
    await prisma.userSettings.delete({ where: { id: settings.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.vacancy.delete({ where: { id: vacancy.id } });
    
    console.log('\n🗑️  Тестовые данные удалены');
    console.log('✅ Все работает отлично!\n');
    
  } catch (error) {
    console.error('❌ Ошибка:', error);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());