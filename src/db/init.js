require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function init() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  try {
    await pool.query(schema);
    console.log('✅ Schema aplicado correctamente.');
  } catch (err) {
    console.error('❌ Error aplicando el schema:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

init();
