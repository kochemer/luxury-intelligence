/**
 * Migration script to update category names across historical data.
 * 
 * Renames:
 * - "AI & Strategy" -> "Artificial Intelligence News"
 * - "Luxury & Consumer" -> "Fashion & Luxury"
 * 
 * This script is idempotent - safe to run multiple times.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Category name mappings (old -> new)
const CATEGORY_MAPPINGS: Record<string, string> = {
  "AI & Strategy": "Artificial Intelligence News",
  "Luxury & Consumer": "Fashion & Luxury",
  // These stay the same but included for completeness
  "Ecommerce & Retail Tech": "Ecommerce & Retail Tech",
  "Jewellery Industry": "Jewellery Industry",
};

// Reverse mapping for checking if already migrated
const REVERSE_MAPPINGS: Record<string, string> = {
  "Artificial Intelligence News": "AI & Strategy",
  "Fashion & Luxury": "Luxury & Consumer",
};

function shouldMigrate(value: string): boolean {
  return value in CATEGORY_MAPPINGS && CATEGORY_MAPPINGS[value] !== value;
}

function migrateValue(value: any): any {
  if (typeof value === 'string' && shouldMigrate(value)) {
    return CATEGORY_MAPPINGS[value];
  }
  if (Array.isArray(value)) {
    return value.map(migrateValue);
  }
  if (value && typeof value === 'object') {
    const migrated: any = {};
    for (const [key, val] of Object.entries(value)) {
      // Migrate keys if they are category names
      const newKey = shouldMigrate(key) ? CATEGORY_MAPPINGS[key] : key;
      migrated[newKey] = migrateValue(val);
    }
    return migrated;
  }
  return value;
}

async function migrateFile(filePath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    const migrated = migrateValue(data);
    
    // Check if anything changed
    const originalStr = JSON.stringify(data, null, 2);
    const migratedStr = JSON.stringify(migrated, null, 2);
    
    if (originalStr === migratedStr) {
      return false; // No changes needed
    }
    
    // Write back
    await fs.writeFile(filePath, migratedStr, 'utf-8');
    return true; // Changes made
  } catch (err: any) {
    console.error(`Error migrating ${filePath}: ${err.message}`);
    return false;
  }
}

async function findJsonFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  async function walk(currentDir: string) {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
          files.push(fullPath);
        }
      }
    } catch (err: any) {
      // Skip directories that can't be read
      if (err.code !== 'ENOENT') {
        console.warn(`Warning: Could not read ${currentDir}: ${err.message}`);
      }
    }
  }
  
  await walk(dir);
  return files;
}

async function main() {
  const dataDir = path.join(__dirname, '../data');
  const weeksDir = path.join(dataDir, 'weeks');
  const digestsDir = path.join(dataDir, 'digests');
  
  console.log('=== Category Migration Script ===\n');
  console.log('Migrating category names:');
  console.log('  "AI & Strategy" -> "Artificial Intelligence News"');
  console.log('  "Luxury & Consumer" -> "Fashion & Luxury"\n');
  
  let totalFiles = 0;
  let migratedFiles = 0;
  
  // Find all JSON files
  const allFiles: string[] = [];
  
  try {
    const weeksFiles = await findJsonFiles(weeksDir);
    allFiles.push(...weeksFiles);
  } catch (err: any) {
    console.warn(`Warning: Could not read weeks directory: ${err.message}`);
  }
  
  try {
    const digestsFiles = await findJsonFiles(digestsDir);
    allFiles.push(...digestsFiles);
  } catch (err: any) {
    console.warn(`Warning: Could not read digests directory: ${err.message}`);
  }
  
  for (const file of allFiles) {
    totalFiles++;
    const relativePath = path.relative(process.cwd(), file);
    const changed = await migrateFile(file);
    
    if (changed) {
      migratedFiles++;
      console.log(`✓ Migrated: ${relativePath}`);
    }
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Total files checked: ${totalFiles}`);
  console.log(`Files migrated: ${migratedFiles}`);
  console.log(`Files already up-to-date: ${totalFiles - migratedFiles}`);
  
  if (migratedFiles > 0) {
    console.log(`\n✓ Migration complete!`);
  } else {
    console.log(`\n✓ No migration needed - all files are up-to-date.`);
  }
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
