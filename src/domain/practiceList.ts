import { plantDictionary } from '../assets/dictionaries/plantDictionaryData';
import {
  beginnerWords,
  practiceCategoryLabels,
  programmerWords,
} from '../assets/dictionaries/practiceWords';
import type {
  FlatWord,
  PlantNode,
  PracticeCategory,
  PracticeEntry,
} from '../types/practice';

export { practiceCategoryLabels };
export type { PlantNode, PracticeCategory, PracticeEntry };

export function getFlatPracticeList(
  options: { shuffle?: boolean } = {}
): PracticeEntry[] {
  const list: PracticeEntry[] = [];

  plantDictionary.forEach(group => {
    group.genuses.forEach(g => {
      g.species.forEach(s => {
        list.push({
          node: { ...s },
          path: s.japanese
        });

        list.push({
          node: {
            level: 'genus',
            japanese: `${g.genus.japanese}${s.japanese}`,
            romaji: `${g.genus.romaji}${s.romaji}`
          },
          path: `${g.genus.japanese} ➔ ${s.japanese}`
        });

        list.push({
          node: {
            level: 'family',
            japanese: `${group.family.japanese}${g.genus.japanese}${s.japanese}`,
            romaji: `${group.family.romaji}${g.genus.romaji}${s.romaji}`
          },
          path: `${group.family.japanese} ➔ ${g.genus.japanese} ➔ ${s.japanese}`
        });
      });
    });
  });

  return shuffleEntries(list, options.shuffle);
}

function toEntries(words: FlatWord[], options: { shuffle?: boolean }): PracticeEntry[] {
  const list: PracticeEntry[] = words.map(w => ({
    node: { level: 'species', japanese: w.japanese, romaji: w.romaji },
    path: w.path
  }));

  return shuffleEntries(list, options.shuffle);
}

function shuffleEntries<T>(entries: T[], shouldShuffle = false): T[] {
  if (!shouldShuffle) return entries;

  for (let i = entries.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [entries[i], entries[j]] = [entries[j], entries[i]];
  }
  return entries;
}

export function getPracticeList(
  category: PracticeCategory,
  options: { shuffle?: boolean } = {}
): PracticeEntry[] {
  switch (category) {
    case 'programmer':
      return toEntries(programmerWords, options);
    case 'beginner':
      return toEntries(beginnerWords, options);
    case 'plant':
    default:
      return getFlatPracticeList(options);
  }
}
