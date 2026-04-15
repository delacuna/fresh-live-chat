import type { GenreTemplate } from './types.js';
import rpg from '../genre-templates/rpg.json';
import mystery from '../genre-templates/mystery.json';
import actionHorror from '../genre-templates/action-horror.json';
import storyGeneral from '../genre-templates/story-general.json';
import gameplayHints from '../genre-templates/gameplay-hints.json';

export const ALL_GENRE_TEMPLATES: GenreTemplate[] = [
  rpg as GenreTemplate,
  mystery as GenreTemplate,
  actionHorror as GenreTemplate,
  storyGeneral as GenreTemplate,
  gameplayHints as GenreTemplate,
];

export function getAllGenreTemplates(): GenreTemplate[] {
  return ALL_GENRE_TEMPLATES;
}
