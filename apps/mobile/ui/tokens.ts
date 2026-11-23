// The app's single token entry point (DESIGN_SYSTEM.md). The values are pure data in
// packages/core/src/design so they are unit-tested in Node (contrast, tiers, exam lock);
// components import them from here. Never write a hex, font size or duration elsewhere.
export * from '@school/core/design';
