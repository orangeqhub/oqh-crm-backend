const { Client } = require('C:/Users/Umme/Downloads/oqh crm/backend/node_modules/pg');
const client = new Client({ host: 'localhost', port: 5432, database: 'oqh_crm', user: 'postgres', password: 'postgres123' });
(async () => {
  await client.connect();
  const tables = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  );
  console.log('TABLES:');
  for (const t of tables.rows) {
    const name = t.tablename;
    const r = await client.query(`SELECT COUNT(*)::int AS c FROM "${name}"`);
    console.log(`  ${name}: ${r.rows[0].c}`);
  }
  for (const t of ['company_settings','roles','departments','designations','users','employees']) {
    const r = await client.query(`SELECT * FROM "${t}"`);
    console.log(`\n=== ${t} (${r.rows.length}) ===`);
    console.log(JSON.stringify(r.rows));
  }
  await client.end();
})().catch(e => { console.error(e); process.exit(1); });
