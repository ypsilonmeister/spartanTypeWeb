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
          { level: 'species', japanese: 'カントウタンポポ', romaji: 'KANTOUTANPOPO' },
          { level: 'species', japanese: 'シロバナタンポポ', romaji: 'SHIROBANATANPOPO' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'キク属', romaji: 'KIKUZOKU' },
        species: [
          { level: 'species', japanese: 'リュウノウギク', romaji: 'RYUUNOUGIKU' },
          { level: 'species', japanese: 'ノジギク', romaji: 'NOJIGIKU' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'ヒマワリ属', romaji: 'HIMAWARIZOKU' },
        species: [
          { level: 'species', japanese: 'ヒマワリ', romaji: 'HIMAWARI' },
          { level: 'species', japanese: 'キクイモ', romaji: 'KIKUIMO' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'ヨモギ属', romaji: 'YOMOGIZOKU' },
        species: [
          { level: 'species', japanese: 'ヨモギ', romaji: 'YOMOGI' },
          { level: 'species', japanese: 'カワラヨモギ', romaji: 'KAWARAYOMOGI' }
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
          { level: 'species', japanese: 'ヤマザクラ', romaji: 'YAMAZAKURA' },
          { level: 'species', japanese: 'ウメ', romaji: 'UME' },
          { level: 'species', japanese: 'モモ', romaji: 'MOMO' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'バラ属', romaji: 'BARAZOKU' },
        species: [
          { level: 'species', japanese: 'ノイバラ', romaji: 'NOIBARA' },
          { level: 'species', japanese: 'ハマナス', romaji: 'HAMANASU' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'リンゴ属', romaji: 'RINGOZOKU' },
        species: [
          { level: 'species', japanese: 'セイヨウリンゴ', romaji: 'SEIYOURINGO' },
          { level: 'species', japanese: 'ズミ', romaji: 'ZUMI' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'キイチゴ属', romaji: 'KIICHIGOZOKU' },
        species: [
          { level: 'species', japanese: 'モミジイチゴ', romaji: 'MOMIJIICHIGO' },
          { level: 'species', japanese: 'クマイチゴ', romaji: 'KUMAICHIGO' }
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
          { level: 'species', japanese: 'トマト', romaji: 'TOMATO' },
          { level: 'species', japanese: 'ナス', romaji: 'NASU' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'トウガラシ属', romaji: 'TOUGARASHIZOKU' },
        species: [
          { level: 'species', japanese: 'トウガラシ', romaji: 'TOUGARASHI' },
          { level: 'species', japanese: 'ピーマン', romaji: 'PIIMAN' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'タバコ属', romaji: 'TABAKOZOKU' },
        species: [
          { level: 'species', japanese: 'タバコ', romaji: 'TABAKO' }
        ]
      }
    ]
  },
  {
    family: { level: 'family', japanese: 'バショウ科', romaji: 'BASHOUKA' },
    genuses: [
      {
        genus: { level: 'genus', japanese: 'バショウ属', romaji: 'BASHOUZOKU' },
        species: [
          { level: 'species', japanese: 'バナナ', romaji: 'BANANA' },
          { level: 'species', japanese: 'バショウ', romaji: 'BASHOU' },
          { level: 'species', japanese: 'リュウキュウバショウ', romaji: 'RYUUKYUUBASHOU' }
        ]
      }
    ]
  },
  {
    family: { level: 'family', japanese: 'イネ科', romaji: 'INEKA' },
    genuses: [
      {
        genus: { level: 'genus', japanese: 'イネ属', romaji: 'INEZOKU' },
        species: [
          { level: 'species', japanese: 'イネ', romaji: 'INE' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'コムギ属', romaji: 'KOMUGIZOKU' },
        species: [
          { level: 'species', japanese: 'パンコムギ', romaji: 'PANKOMUGI' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'タケ亜科', romaji: 'TAKEAKA' },
        species: [
          { level: 'species', japanese: 'マダケ', romaji: 'MADAKE' },
          { level: 'species', japanese: 'モウソウチク', romaji: 'MOUSOUCHIKU' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'トウモロコシ属', romaji: 'TOUMOROKOSHIZOKU' },
        species: [
          { level: 'species', japanese: 'トウモロコシ', romaji: 'TOUMOROKOSHI' }
        ]
      }
    ]
  },
  {
    family: { level: 'family', japanese: 'マメ科', romaji: 'MAMEKA' },
    genuses: [
      {
        genus: { level: 'genus', japanese: 'ダイズ属', romaji: 'DAIZUZOKU' },
        species: [
          { level: 'species', japanese: 'ダイズ', romaji: 'DAIZU' },
          { level: 'species', japanese: 'アズキ', romaji: 'AZUKI' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'フジ属', romaji: 'FUJIZOKU' },
        species: [
          { level: 'species', japanese: 'ノダフジ', romaji: 'NODAFUJI' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'ラッカセイ属', romaji: 'RAKKASEIZOKU' },
        species: [
          { level: 'species', japanese: 'ラッカセイ', romaji: 'RAKKASEI' }
        ]
      }
    ]
  },
  {
    family: { level: 'family', japanese: 'アブラナ科', romaji: 'ABURANAKA' },
    genuses: [
      {
        genus: { level: 'genus', japanese: 'アブラナ属', romaji: 'ABURANAZOKU' },
        species: [
          { level: 'species', japanese: 'キャベツ', romaji: 'KYABETSU' },
          { level: 'species', japanese: 'ハクサイ', romaji: 'HAKUSAI' },
          { level: 'species', japanese: 'ブロッコリー', romaji: 'BUROKKORII' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'ダイコン属', romaji: 'DAIKONZOKU' },
        species: [
          { level: 'species', japanese: 'ダイコン', romaji: 'DAIKON' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'ワサビ属', romaji: 'WASABIZOKU' },
        species: [
          { level: 'species', japanese: 'ワサビ', romaji: 'WASABI' }
        ]
      }
    ]
  },
  {
    family: { level: 'family', japanese: 'ウリ科', romaji: 'URIKA' },
    genuses: [
      {
        genus: { level: 'genus', japanese: 'キュウリ属', romaji: 'KYUURIZOKU' },
        species: [
          { level: 'species', japanese: 'キュウリ', romaji: 'KYUURI' },
          { level: 'species', japanese: 'メロン', romaji: 'MERON' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'スイカ属', romaji: 'SUIKAZOKU' },
        species: [
          { level: 'species', japanese: 'スイカ', romaji: 'SUIKA' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'カボチャ属', romaji: 'KABOCHAZOKU' },
        species: [
          { level: 'species', japanese: 'カボチャ', romaji: 'KABOCHA' }
        ]
      }
    ]
  },
  {
    family: { level: 'family', japanese: 'ユリ科', romaji: 'YURIKA' },
    genuses: [
      {
        genus: { level: 'genus', japanese: 'ユリ属', romaji: 'YURIZOKU' },
        species: [
          { level: 'species', japanese: 'ヤマユリ', romaji: 'YAMAYURI' },
          { level: 'species', japanese: 'テッポウユリ', romaji: 'TEPPOUYURI' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'チューリップ属', romaji: 'CHUURIPPUZOKU' },
        species: [
          { level: 'species', japanese: 'チューリップ', romaji: 'CHUURIPPU' }
        ]
      }
    ]
  },
  {
    family: { level: 'family', japanese: 'ブナ科', romaji: 'BUNAKA' },
    genuses: [
      {
        genus: { level: 'genus', japanese: 'コナラ属', romaji: 'KONARAZOKU' },
        species: [
          { level: 'species', japanese: 'コナラ', romaji: 'KONARA' },
          { level: 'species', japanese: 'クヌギ', romaji: 'KUNUGI' },
          { level: 'species', japanese: 'シラカシ', romaji: 'SHIRAKASHI' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'ブナ属', romaji: 'BUNAZOKU' },
        species: [
          { level: 'species', japanese: 'ブナ', romaji: 'BUNA' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'クリ属', romaji: 'KURIZOKU' },
        species: [
          { level: 'species', japanese: 'クリ', romaji: 'KURI' }
        ]
      }
    ]
  },
  {
    family: { level: 'family', japanese: 'マツ科', romaji: 'MATSUKA' },
    genuses: [
      {
        genus: { level: 'genus', japanese: 'マツ属', romaji: 'MATSUZOKU' },
        species: [
          { level: 'species', japanese: 'アカマツ', romaji: 'AKAMATSU' },
          { level: 'species', japanese: 'クロマツ', romaji: 'KUROMATSU' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'モミ属', romaji: 'MOMIZOKU' },
        species: [
          { level: 'species', japanese: 'モミ', romaji: 'MOMI' }
        ]
      }
    ]
  },
  {
    family: { level: 'family', japanese: 'ラン科', romaji: 'RANKA' },
    genuses: [
      {
        genus: { level: 'genus', japanese: 'シュンラン属', romaji: 'SHUNRANZOKU' },
        species: [
          { level: 'species', japanese: 'シュンラン', romaji: 'SHUNRAN' }
        ]
      },
      {
        genus: { level: 'genus', japanese: 'セッコク属', romaji: 'SEKKOKUZOKU' },
        species: [
          { level: 'species', japanese: 'セッコク', romaji: 'SEKKOKU' }
        ]
      }
    ]
  }
];

/**
 * Flattens the hierarchical dictionary into a linear practice list where each
 * word "evolves" by accumulating its ancestry as a prefix:
 *
 *   バナナ
 *   バショウ属バナナ
 *   バショウ科バショウ属バナナ
 *
 * The species node is the seed; the genus name, then the family name, are
 * prepended in successive evolution stages. The `node` returned for each entry
 * carries the *cumulative* japanese/romaji so the trainer types the full
 * grown form, while `path` shows the human-readable classification chain.
 *
 * Pass `{ shuffle: true }` to randomize the order in which entries appear
 * (Fisher-Yates). Each evolution stage is shuffled independently as its own
 * entry, so a fully-evolved form may appear before its bare-species seed.
 */
export function getFlatPracticeList(
  options: { shuffle?: boolean } = {}
): { node: PlantNode, path: string }[] {
  const list: { node: PlantNode, path: string }[] = [];

  plantDictionary.forEach(group => {
    group.genuses.forEach(g => {
      g.species.forEach(s => {
        // Stage 1: bare species (the seed)
        list.push({
          node: { ...s },
          path: s.japanese
        });

        // Stage 2: genus prefix prepended
        list.push({
          node: {
            level: 'genus',
            japanese: `${g.genus.japanese}${s.japanese}`,
            romaji: `${g.genus.romaji}${s.romaji}`
          },
          path: `${g.genus.japanese} ➔ ${s.japanese}`
        });

        // Stage 3: family + genus prefix prepended (fully evolved)
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

  if (options.shuffle) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }

  return list;
}
