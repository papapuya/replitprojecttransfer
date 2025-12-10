import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { projects, productsInProjects, templates } from '@shared/schema';

// Create SQLite database and tables
const sqlite = new Database('local.db');
const db = drizzle(sqlite);

async function migrate() {
  try {
    console.log('Creating database tables...');
    
    // Create projects table
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
    
    // Create products_in_projects table
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS products_in_projects (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT,
        files TEXT,
        html_code TEXT,
        preview_text TEXT,
        extracted_data TEXT,
        template TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
      )
    `);
    
    // Create templates table
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        is_default TEXT,
        created_at TEXT NOT NULL
      )
    `);
    
    // Insert default template
    const defaultTemplate = {
      id: 'default-template',
      name: 'Standard Produktbeschreibung',
      content: `<div class="product-description">
  <h2>{{productName}}</h2>
  <p>{{description}}</p>
  <h3>Technische Daten:</h3>
  <ul>
    {{#each technicalSpecs}}
    <li><strong>{{@key}}:</strong> {{this}}</li>
    {{/each}}
  </ul>
  <h3>Features:</h3>
  <ul>
    {{#each features}}
    <li>{{this}}</li>
    {{/each}}
  </ul>
</div>`,
      isDefault: 'true',
      createdAt: new Date().toISOString()
    };
    
    // Check if default template exists
    const existingTemplate = sqlite.prepare('SELECT id FROM templates WHERE id = ?').get('default-template');
    if (!existingTemplate) {
      sqlite.prepare(`
        INSERT INTO templates (id, name, content, is_default, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        defaultTemplate.id,
        defaultTemplate.name,
        defaultTemplate.content,
        defaultTemplate.isDefault,
        defaultTemplate.createdAt
      );
      console.log('Default template created');
    }
    
    console.log('Database migration completed successfully!');
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  } finally {
    sqlite.close();
  }
}

migrate().catch(console.error);

