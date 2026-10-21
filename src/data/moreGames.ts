/**
 * Other Bible Games Project titles shown in "More Games". Add entries as the
 * games become available; leave `url` undefined until a game really has a
 * public address (never point to a page that does not exist yet).
 *
 * Example:
 *   { id: 'bible-quiz', titleKey: 'more.games.bibleQuiz.title',
 *     descriptionKey: 'more.games.bibleQuiz.description', url: 'https://…' }
 */
export interface MoreGame {
  id: string;
  titleKey: string;
  descriptionKey: string;
  url?: string;
}

export const MORE_GAMES: MoreGame[] = [];
