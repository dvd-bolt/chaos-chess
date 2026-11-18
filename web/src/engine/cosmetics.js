// Косметика: скины фигур и доски. Общий список для клиента и сервера (выдача владельцу).
export const SKINS = { classic: 'Классика', icefire: 'Лёд и пламя', bones: 'Кости', neon: 'Неон', gold: 'Золото', amethyst: 'Аметист', retro: 'Ретро', polar: 'Полярная звезда', night: 'Ночь',
  jade: 'Нефрит', crimson: 'Багрянец', herald: 'Глашатай' };
export const BOARDS = { classic: 'Камень', marble: 'Мрамор', forest: 'Лес', lava: 'Лава', night: 'Ночь', starry: 'Звёздная ночь', ocean: 'Океан', aurora: 'Сияние',
  sunset: 'Закат', dusk: 'Сумерки', banner: 'Знамя' };
export const SHOP_ITEMS = new Set(['amethyst', 'retro', 'starry', 'ocean', 'jade', 'sunset']); // только из магазина
// Откуда ещё берётся косметика (подсказка в Коллекции)
export const ITEM_SOURCE = { polar: 'Пропуск сезона, уровень 1', aurora: 'Пропуск сезона, уровень 2', crimson: 'Пропуск сезона, уровень 6',
  dusk: 'Сезон, бесплатная дорожка: уровень 3', banner: 'Пригласи друга — ему и тебе', herald: 'Пригласи 5 друзей' };
