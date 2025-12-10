import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from "@shared/schema";

const sqlite = new Database('local.db');
const db = drizzle(sqlite, { schema });

async function migrateCustomAttributes() {
  console.log('Adding custom attributes columns to products_in_projects table...');
  
  try {
    // Add new columns to products_in_projects table
    await sqlite.exec(`
      ALTER TABLE products_in_projects 
      ADD COLUMN custom_attributes TEXT;
    `);
    console.log('Added custom_attributes column');
  } catch (error) {
    console.log('custom_attributes column might already exist:', error);
  }

  try {
    await sqlite.exec(`
      ALTER TABLE products_in_projects 
      ADD COLUMN exact_product_name TEXT;
    `);
    console.log('Added exact_product_name column');
  } catch (error) {
    console.log('exact_product_name column might already exist:', error);
  }

  try {
    await sqlite.exec(`
      ALTER TABLE products_in_projects 
      ADD COLUMN article_number TEXT;
    `);
    console.log('Added article_number column');
  } catch (error) {
    console.log('article_number column might already exist:', error);
  }

  console.log('Custom attributes migration completed successfully!');
}

migrateCustomAttributes().catch((err) => {
  console.error('Custom attributes migration failed:', err);
  process.exit(1);
});

