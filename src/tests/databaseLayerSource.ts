import fs from 'fs';
import path from 'path';

const servicesDir = path.join(__dirname, '..', 'services');
const barrelPath = path.join(servicesDir, 'databaseService.ts');

/** The database layer's topic files, in the order databaseService.ts
 *  re-exports them (the order the code had when it was one file). */
export function databaseLayerFiles(): string[] {
  const barrel = fs.readFileSync(barrelPath, 'utf8');
  const order: string[] = [];
  for (const match of barrel.matchAll(/from "\.\/database\/([\w-]+)"/g)) {
    const name = match[1];
    if (name && !order.includes(name)) order.push(name);
  }
  return order.map((name) => path.join(servicesDir, 'database', `${name}.ts`));
}

/** Every line of the database layer as one text: the topic files in order,
 *  then databaseService.ts. For tests that check what the queries say. */
export function readDatabaseLayer(): string {
  return [...databaseLayerFiles(), barrelPath]
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');
}

/** True for a file that belongs to the database layer, the only code allowed
 *  to use the Supabase client. */
export function isDatabaseLayerFile(file: string): boolean {
  const normalized = file.split(path.sep).join('/');
  return normalized.endsWith('src/services/databaseService.ts') ||
    normalized.includes('src/services/database/');
}
