export const ru = {
  app: {
    name: 'NextAppointments',
    description: 'Система управления записью клиентов и расписанием команды.',
    bootstrapTitle: 'Фундамент приложения готов к настройке',
    bootstrapDescription: 'Здесь появится рабочее пространство для управления расписанием и записями.',
    skipToContent: 'Перейти к содержимому',
    loading: 'Загрузка…',
    error: 'Произошла ошибка',
    retry: 'Попробовать снова',
    empty: 'Пока нет данных',
  },
  errors: {
    BAD_REQUEST: 'Некорректный запрос',
    CONFLICT: 'Данные изменились. Обновите страницу и попробуйте снова.',
    FORBIDDEN: 'Действие запрещено',
    INTERNAL: 'Внутренняя ошибка сервера',
    NOT_FOUND: 'Не найдено',
    RATE_LIMITED: 'Слишком много запросов. Попробуйте позже.',
    UNAUTHENTICATED: 'Войдите в систему, чтобы продолжить.',
    UNSUPPORTED_MEDIA_TYPE: 'Ожидается JSON',
    VALIDATION_ERROR: 'Проверьте корректность введённых данных.',
  },
} as const;

export type TranslationKey = keyof typeof ru;
