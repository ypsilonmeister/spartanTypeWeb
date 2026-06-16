# Generate Custom Practice Dictionary Skill (`/spartan-custom:generate-dictionary`)

This skill converts a raw indented text hierarchy of Japanese plant terms into structured TypeScript records for the `plantDictionary.ts` data store, automatically generating correct Hepburn Romaji representations.

## Purpose
Eases vocabulary updates and lets users test custom drill-down exercises without manually typing complex nested arrays and mappings.

## Input Format
The script accepts a hierarchical indented outline:
- Indent `0` spaces: Family (e.g. `キク科`)
- Indent `2` spaces: Genus (e.g. `タンポポ属`)
- Indent `4` spaces: Species (e.g. `セイヨウタンポポ`)

## Instructions

1. **Prepare Vocabulary Input**:
   - Write your indented text items to a temporary file (e.g., `scripts/my_terms.txt`) or pass them directly as terminal arguments.

2. **Execute Generation Command**:
   - Run `node scripts/generate_dictionary.cjs <file_path>` using the `run_command` tool.
   - The script will automatically:
     - Map Katakana characters to matching English uppercase letters.
     - Convert standard endings like `科` to `KA` and `属` to `ZOKU`.
     - Automatically parse indent levels.
     - Write the updated array directly into `src/utils/plantDictionary.ts`.

3. **Verify App Build**:
   - Run `npm run build` using the `run_command` tool to verify the new typescript structure compiles with zero errors.
