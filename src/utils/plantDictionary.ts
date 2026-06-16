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

export const plantDictionary: PlantGroup[] = [
  {
    family: { level: 'family', japanese: 'キク科', romaji: 'KIKUKA' },
    genuses: [
      {
        genus: { level: 'genus', japanese: 'タンポポ属', romaji: 'TANPOPOZOKU' },
        species: [
          { level: 'species', japanese: 'セイヨウタンポポ', romaji: 'SEIYOUTANPOPO' },
          { level: 'species', japanese: 'カントウタンポポ', romaji: 'KANTOUTANPOPO' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'キク属', romaji: 'KIKUZOKU' },
        species: [
          { level: 'species', japanese: 'リュウノウギク', romaji: 'RYUUNOUGIKU' }
        ]
      }
    ]
  },
  {
    family: { level: 'family', japanese: 'バラ科', romaji: 'BARAKA' },
    genuses: [
      {
        genus: { level: 'genus', japanese: 'サクラ属', romaji: 'SAKURAZOKU' },
        species: [
          { level: 'species', japanese: 'ソメイヨシノ', romaji: 'SOMEIYOSHINO' },
          { level: 'species', japanese: 'ヤマザクラ', romaji: 'YAMAZAKURA' }
        ]
      }
    ]
  },
  {
    family: { level: 'family', japanese: 'ナス科', romaji: 'NASUKA' },
    genuses: [
      {
        genus: { level: 'genus', japanese: 'ナス属', romaji: 'NASUZOKU' },
        species: [
          { level: 'species', japanese: 'ジャガイモ', romaji: 'JAGAIMO' },
          { level: 'species', japanese: 'トマト', romaji: 'TOMATO' }
        ]
      }
    ]
  }
];

/**
 * Flattens the hierarchical dictionary into a linear list of words to type,
 * simulating a drill-down path (Family -> Genus -> Species).
 */
export function getFlatPracticeList(): { node: PlantNode, path: string }[] {
  const list: { node: PlantNode, path: string }[] = [];
  
  plantDictionary.forEach(group => {
    const familyPath = group.family.japanese;
    list.push({ node: group.family, path: familyPath });
    
    group.genuses.forEach(g => {
      const genusPath = `${familyPath} ➔ ${g.genus.japanese}`;
      list.push({ node: g.genus, path: genusPath });
      
      g.species.forEach(s => {
        const speciesPath = `${genusPath} ➔ ${s.japanese}`;
        list.push({ node: s, path: speciesPath });
      });
    });
  });
  
  return list;
}
