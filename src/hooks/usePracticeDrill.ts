import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getPracticeList, practiceCategoryLabels } from '../domain/practiceList';
import type { PracticeCategory } from '../types/practice';

export function usePracticeDrill() {
  const [practiceCategory, setPracticeCategory] = useState<PracticeCategory>(() => {
    const saved = localStorage.getItem('spartan_practice_category');
    return (saved === 'programmer' || saved === 'beginner') ? saved : 'plant';
  });
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [currentCharIndex, setCurrentCharIndex] = useState(0);
  const [flashError, setFlashError] = useState(false);
  const flashTimeoutRef = useRef<number | null>(null);

  const practiceList = useMemo(
    () => getPracticeList(practiceCategory, { shuffle: true }),
    [practiceCategory]
  );

  const resetProgress = useCallback(() => {
    setCurrentWordIndex(0);
    setCurrentCharIndex(0);
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

    if (pressedChar === expectedChar) {
      if (currentCharIndex + 1 >= currentWord.node.romaji.length) {
        setCurrentCharIndex(0);
        setCurrentWordIndex(prev => (prev + 1) % practiceList.length);
      } else {
        setCurrentCharIndex(prev => prev + 1);
      }
      return;
    }

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
    practiceCategory,
    practiceCategoryLabels,
    practiceList,
    currentWordIndex,
    currentCharIndex,
    flashError,
    handleSetPracticeCategory,
    handleKeyCode,
    resetProgress,
  };
}
