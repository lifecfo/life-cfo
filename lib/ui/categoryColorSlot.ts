const SLOT_COUNT = 8;

export type CategorySlot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

// djb2 -- simple, stable string hash. Deterministic across runs and
// environments (not Object/Map insertion-order dependent, not random),
// so a given category string always lands on the same slot everywhere
// this is called.
function stableHash(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return hash >>> 0;
}

export function categoryColorSlot(category: string): CategorySlot {
  const normalized = category.trim().toLowerCase();
  const hash = stableHash(normalized);
  return ((hash % SLOT_COUNT) + 1) as CategorySlot;
}

export type CategoryColorClasses = {
  bg: string;
  text: string;
};

// Tailwind's JIT scanner only picks up class names that appear as
// literal strings somewhere in a scanned file (lib/**/*.{js,ts,jsx,tsx}
// is in tailwind.config.js's content globs, so this file qualifies) --
// it can't resolve `bg-category-${slot}` built at runtime. This table
// keeps every class name literal so all 8 variants actually compile.
const CATEGORY_COLOR_CLASSES: Record<CategorySlot, CategoryColorClasses> = {
  1: { bg: "bg-category-1", text: "text-category-1" },
  2: { bg: "bg-category-2", text: "text-category-2" },
  3: { bg: "bg-category-3", text: "text-category-3" },
  4: { bg: "bg-category-4", text: "text-category-4" },
  5: { bg: "bg-category-5", text: "text-category-5" },
  6: { bg: "bg-category-6", text: "text-category-6" },
  7: { bg: "bg-category-7", text: "text-category-7" },
  8: { bg: "bg-category-8", text: "text-category-8" },
};

export function categoryColorClasses(slot: CategorySlot): CategoryColorClasses {
  return CATEGORY_COLOR_CLASSES[slot];
}
