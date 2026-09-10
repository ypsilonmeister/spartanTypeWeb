import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { availableCategoriesByLang, getPracticeList } from '../domain/practiceList';
import { buildTreeSpec, buildTreeView, segmentKey } from '../domain/practiceTree';
import type { LeafProgress } from '../domain/practiceTree';
import { useLanguage } from './useLanguage';
import type { Lang } from '../types/i18n';
import type { PracticeCategory, PracticeEntry } from '../types/practice';

interface DrillState {
  /** Which dictionary this progress belongs to; see `freshDrill`. */
  dictionaryId: string;
  wordIndex: number;
  charIndex: number;
  correctCount: number;
  incorrectCount: number;
  combo: number;
  lastPressedKey: string | null;
  treeProgress: Map<string, LeafProgress>;
}

function dictionaryIdOf(category: PracticeCategory, lang: Lang): string {
  return `${category}:${lang}`;
}

function freshDrill(dictionaryId: string): DrillState {
  return {
    dictionaryId,
    wordIndex: 0,
    charIndex: 0,
    correctCount: 0,
    incorrectCount: 0,
    combo: 0,
    lastPressedKey: null,
    treeProgress: new Map(),
  };
}

function expectedCharOf(state: DrillState, list: PracticeEntry[]): string | undefined {
  return list[state.wordIndex]?.node.romaji[state.charIndex];
}

function bumpLeaf(
  progress: Map<string, LeafProgress>,
  key: string,
  field: keyof LeafProgress
): Map<string, LeafProgress> {
  const next = new Map(progress);
  const leaf = next.get(key) ?? { reps: 0, errors: 0 };
  next.set(key, { ...leaf, [field]: leaf[field] + 1 });
  return next;
}

/** Pure keystroke transition, so the state updater stays free of side effects. */
function applyKeystroke(
  state: DrillState,
  list: PracticeEntry[],
  pressedChar: string
): DrillState {
  const word = list[state.wordIndex];
  if (!word) return state;

  const next: DrillState = { ...state, lastPressedKey: pressedChar };
  const leafKey = segmentKey(word.segments);

  if (pressedChar !== word.node.romaji[state.charIndex]) {
    next.incorrectCount += 1;
    next.combo = 0;
    next.treeProgress = bumpLeaf(state.treeProgress, leafKey, 'errors');
    return next;
  }

  next.correctCount += 1;
  next.combo += 1;

  if (state.charIndex + 1 >= word.node.romaji.length) {
    // Clearing a word grows its leaf, and with it every branch back to the trunk.
    next.treeProgress = bumpLeaf(state.treeProgress, leafKey, 'reps');
    next.charIndex = 0;
    next.wordIndex = (state.wordIndex + 1) % list.length;
  } else {
    next.charIndex += 1;
  }

  return next;
}

export function usePracticeDrill() {
  const { lang, t } = useLanguage();
  const availableCategories = availableCategoriesByLang[lang];

  const [practiceCategory, setPracticeCategory] = useState<PracticeCategory>(() => {
    const saved = localStorage.getItem('spartan_practice_category');
    const isValid = saved === 'plant' || saved === 'programmer' || saved === 'beginner';
    return (isValid && availableCategories.includes(saved)) ? saved : availableCategories[0];
  });

  // If the stored category isn't offered in this language (e.g. 'plant' when the
  // browser is set to English), fall back to the first available one. Derived
  // directly during render rather than via an effect + setState round-trip.
  const effectiveCategory = availableCategories.includes(practiceCategory)
    ? practiceCategory
    : availableCategories[0];

  const [flashError, setFlashError] = useState(false);
  const flashTimeoutRef = useRef<number | null>(null);

  const dictionaryId = dictionaryIdOf(effectiveCategory, lang);
  const [storedDrill, setStoredDrill] = useState<DrillState>(() => freshDrill(dictionaryId));

  // Swapping dictionary — by category *or* by language — invalidates both the
  // word indices and every recorded leaf key, so a drill left over from the
  // previous list is discarded on read instead of through a reset effect.
  const drill = storedDrill.dictionaryId === dictionaryId
    ? storedDrill
    : freshDrill(dictionaryId);

  const updateDrill = useCallback((change: (current: DrillState) => DrillState) => {
    setStoredDrill(previous => change(
      previous.dictionaryId === dictionaryId ? previous : freshDrill(dictionaryId)
    ));
  }, [dictionaryId]);

  const practiceCategoryLabels = useMemo(
    () => Object.fromEntries(
      availableCategories.map(cat => [cat, t(`category.${cat}`)])
    ) as Record<PracticeCategory, string>,
    [availableCategories, t]
  );

  const practiceList = useMemo(
    () => getPracticeList(effectiveCategory, lang, { shuffle: true }),
    [effectiveCategory, lang]
  );

  // The tree is built from the dictionary in its declared order so branches
  // keep a stable arrangement, even though the drill itself is shuffled.
  const treeSpec = useMemo(
    () => buildTreeSpec(
      getPracticeList(effectiveCategory, lang),
      practiceCategoryLabels[effectiveCategory] ?? effectiveCategory
    ),
    [effectiveCategory, lang, practiceCategoryLabels]
  );

  const currentEntry = practiceList[drill.wordIndex];

  const practiceTree = useMemo(
    () => buildTreeView(treeSpec, drill.treeProgress, {
      activeKey: currentEntry ? segmentKey(currentEntry.segments) : null,
      activeRatio: currentEntry
        ? drill.charIndex / Math.max(1, currentEntry.node.romaji.length)
        : 0,
    }),
    [treeSpec, drill.treeProgress, drill.charIndex, currentEntry]
  );

  const resetProgress = useCallback(() => {
    setStoredDrill(freshDrill(dictionaryId));
  }, [dictionaryId]);

  const handleSetPracticeCategory = useCallback((category: PracticeCategory) => {
    setPracticeCategory(category);
    localStorage.setItem('spartan_practice_category', category);
  }, []);

  const handleKeyCode = useCallback((code: string) => {
    const pressedChar = code.startsWith('Key') ? code.substring(3).toUpperCase() : '';
    if (!pressedChar) return;

    const expectedChar = expectedCharOf(drill, practiceList);
    if (expectedChar === undefined) return;

    updateDrill(current => applyKeystroke(current, practiceList, pressedChar));

    if (pressedChar === expectedChar) return;

    setFlashError(true);
    if (flashTimeoutRef.current !== null) {
      window.clearTimeout(flashTimeoutRef.current);
    }
    flashTimeoutRef.current = window.setTimeout(() => {
      setFlashError(false);
      flashTimeoutRef.current = null;
    }, 150);
  }, [drill, practiceList, updateDrill]);

  useEffect(() => () => {
    if (flashTimeoutRef.current !== null) {
      window.clearTimeout(flashTimeoutRef.current);
    }
  }, []);

  return {
    practiceCategory: effectiveCategory,
    practiceCategoryLabels,
    practiceList,
    practiceTree,
    currentWordIndex: drill.wordIndex,
    currentCharIndex: drill.charIndex,
    correctCount: drill.correctCount,
    incorrectCount: drill.incorrectCount,
    combo: drill.combo,
    lastPressedKey: drill.lastPressedKey,
    flashError,
    handleSetPracticeCategory,
    handleKeyCode,
    resetProgress,
  };
}
