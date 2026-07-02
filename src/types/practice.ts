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
}

export interface FlatWord {
  japanese: string;
  romaji: string;
  path: string;
}
