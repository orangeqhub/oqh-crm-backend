import dotenv from 'dotenv';
import { query } from './database';
import pool from './database';

dotenv.config();

const ADMIN_EMAIL = 'pathanazamkhan09@gmail.com';
const HR_EMAIL = 'hrorangequantumhub@gmail.com';

const tableExists = async (name: string): Promise<boolean> => {
  const res = await query(
    `SELECT to_regclass($1) IS NOT NULL AS exists`,
    [name]
  );
  return res.rows[0]?.exists === true;
};

const cleanup = async (): Promise<void> => {
  console.log('Starting cleanup of demo data...');

  const tables = [
    'login_activity',
    'employee_documents',
    'employee_identity_cards',
    'employee_work_updates',
    'notifications',
    'attendance',
    'tasks',
    'project_members',
    'projects',
    'client_activities',
    'clients',
  ];

  for (const table of tables) {
    if (await tableExists(table)) {
      await query(`DELETE FROM ${table}`);
      console.log(`Cleared: ${table}`);
    }
  }

  // Remove employee login access: detach user links from all employees except admin/HR.
  if (await tableExists('employees')) {
    await query(
      `UPDATE employees SET user_id = NULL WHERE user_id IS NOT NULL
         AND email <> $1 AND email <> $2`,
      [ADMIN_EMAIL, HR_EMAIL]
    );
  }

  // Delete all user accounts that are not the admin/HR accounts
  if (await tableExists('users')) {
    await query(
      `DELETE FROM users WHERE email <> $1 AND email <> $2`,
      [ADMIN_EMAIL, HR_EMAIL]
    );
    console.log('Removed all non admin/hr user accounts.');
  }

  // Delete all employees that are not the admin/HR employee records
  if (await tableExists('employees')) {
    await query(
      `DELETE FROM employees WHERE email <> $1 AND email <> $2`,
      [ADMIN_EMAIL, HR_EMAIL]
    );
    console.log('Removed all demo employees.');
  }

  console.log('Cleanup completed. Run "npm run seed" to ensure admin/HR credentials are correct.');
};

if (require.main === module) {
  cleanup()
    .then(() => {
      pool.end();
      process.exit(0);
    })
    .catch((err) => {
      console.error('Cleanup failed:', err);
      pool.end();
      process.exit(1);
    });
}

export default cleanup;
