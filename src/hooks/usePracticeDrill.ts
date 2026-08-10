import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { availableCategoriesByLang, getPracticeList } from '../domain/practiceList';
import { useLanguage } from './useLanguage';
import type { PracticeCategory } from '../types/practice';

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

  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [currentCharIndex, setCurrentCharIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [incorrectCount, setIncorrectCount] = useState(0);
  const [lastPressedKey, setLastPressedKey] = useState<string | null>(null);
  const [flashError, setFlashError] = useState(false);
  const flashTimeoutRef = useRef<number | null>(null);

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

  const resetProgress = useCallback(() => {
    setCurrentWordIndex(0);
    setCurrentCharIndex(0);
    setCorrectCount(0);
    setIncorrectCount(0);
    setLastPressedKey(null);
  }, []);

  const handleSetPracticeCategory = useCallback((category: PracticeCategory) => {
    setPracticeCategory(category);
    localStorage.setItem('spartan_practice_category', category);
    resetProgress();
  }, [resetProgress]);

  const handleKeyCode = useCallback((code: string) => {
    const currentWord = practiceList[currentWordIndex];
    if (!currentWord) return;

    const expectedChar = currentWord.node.romaji[currentCharIndex];
    const pressedChar = code.startsWith('Key') ? code.substring(3).toUpperCase() : '';
    if (!pressedChar) return;

    setLastPressedKey(pressedChar);

    if (pressedChar === expectedChar) {
      setCorrectCount(prev => prev + 1);
      if (currentCharIndex + 1 >= currentWord.node.romaji.length) {
        setCurrentCharIndex(0);
        setCurrentWordIndex(prev => (prev + 1) % practiceList.length);
      } else {
        setCurrentCharIndex(prev => prev + 1);
      }
      return;
    }

    setIncorrectCount(prev => prev + 1);
    setFlashError(true);
    if (flashTimeoutRef.current !== null) {
      window.clearTimeout(flashTimeoutRef.current);
    }
    flashTimeoutRef.current = window.setTimeout(() => {
      setFlashError(false);
      flashTimeoutRef.current = null;
    }, 150);
  }, [currentCharIndex, currentWordIndex, practiceList]);

  useEffect(() => () => {
    if (flashTimeoutRef.current !== null) {
      window.clearTimeout(flashTimeoutRef.current);
    }
  }, []);

  return {
    practiceCategory: effectiveCategory,
    practiceCategoryLabels,
    practiceList,
    currentWordIndex,
    currentCharIndex,
    correctCount,
    incorrectCount,
    lastPressedKey,
    flashError,
    handleSetPracticeCategory,
    handleKeyCode,
    resetProgress,
  };
}
