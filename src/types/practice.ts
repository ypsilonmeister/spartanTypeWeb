export interface PlantNode {
  level: 'family' | 'genus' | 'species';
  japanese: string;
  romaji: string;
}

export interface PlantGroup {
  family: PlantNode;
  genuses: {
    genus: PlantNode;
    species: PlantNode[];
  }[];
}

export type PracticeCategory = 'plant' | 'programmer' | 'beginner';

export interface PracticeEntry {
  node: PlantNode;
  path: string;
  /**
   * Where this entry sits in its dictionary's classification, root-first
   * (e.g. ['バラ科', 'サクラ属', 'ソメイヨシノ'] or ['制御', 'IF']).
   * The growth tree turns these into branches, so several entries that drill
   * the same word at different depths share one leaf.
   */
  segments: string[];
}

export interface FlatWord {
  japanese: string;
  romaji: string;
  path: string;
}
