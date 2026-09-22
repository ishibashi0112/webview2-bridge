export const EXCLUDED_DIRS: Set<string>;
export const EXCLUDED_FILES: Set<string>;
export function listTemplateFiles(root: string): string[];
export function bundledName(rel: string): string;
export const BUNDLED_RENAMES: Readonly<Record<string, string>>;
