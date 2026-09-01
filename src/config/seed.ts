import dotenv from 'dotenv';
import { query } from './database';
import pool from './database';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { generateEmployeeId } from '../utils/helpers';

dotenv.config();

const ADMIN_EMAIL = 'pathanazamkhan09@gmail.com';
const ADMIN_PASSWORD = 'Azam@2026';
const ADMIN_FIRST_NAME = 'Pathan';
const ADMIN_LAST_NAME = 'Azam Khan';

const HR_EMAIL = 'hrorangequantumhub@gmail.com';
const HR_PASSWORD = 'Junnu@2026';
const HR_FIRST_NAME = 'Shaik';
const HR_LAST_NAME = 'Uzma Parveen';

const createOrUpdateAdminHR = async (): Promise<void> => {
  // Get role IDs
  const adminRole = await query(`SELECT id FROM roles WHERE name = 'admin'`);
  const hrRole = await query(`SELECT id FROM roles WHERE name = 'hr'`);
  const adminRoleId = adminRole.rows[0]?.id;
  const hrRoleId = hrRole.rows[0]?.id;

  // Admin user
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  let adminUserId = uuidv4();
  const adminUserRes = await query(`SELECT id FROM users WHERE email = $1`, [ADMIN_EMAIL]);
  if (adminUserRes.rows.length > 0) {
    adminUserId = adminUserRes.rows[0].id;
    await query(`UPDATE users SET password_hash = $1, role_id = $2, is_active = true, updated_at = NOW() WHERE id = $3`, [adminHash, adminRoleId, adminUserId]);
  } else {
    await query(`INSERT INTO users (id, email, password_hash, role_id, is_active) VALUES ($1, $2, $3, $4, true)`, [adminUserId, ADMIN_EMAIL, adminHash, adminRoleId]);
  }

  // Admin employee
  const adminEmpRes = await query(`SELECT id FROM employees WHERE user_id = $1`, [adminUserId]);
  if (adminEmpRes.rows.length > 0) {
    await query(
      `UPDATE employees SET first_name = $1, last_name = $2, email = $3, department_id = NULL, designation_id = NULL, employment_status = 'Active', updated_at = NOW() WHERE id = $4`,
      [ADMIN_FIRST_NAME, ADMIN_LAST_NAME, ADMIN_EMAIL, adminEmpRes.rows[0].id]
    );
  } else {
    const empId = uuidv4();
    await query(
      `INSERT INTO employees (id, employee_id, user_id, first_name, last_name, email, phone, city, state, country, date_of_joining, employment_type, employment_status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [empId, generateEmployeeId(), adminUserId, ADMIN_FIRST_NAME, ADMIN_LAST_NAME, ADMIN_EMAIL, '+91-9876543001', 'Noida', 'Uttar Pradesh', 'India', '2020-01-15', 'Full-time', 'Active']
    );
  }

  // HR user
  const hrHash = await bcrypt.hash(HR_PASSWORD, 12);
  let hrUserId = uuidv4();
  const hrUserRes = await query(`SELECT id FROM users WHERE email = $1`, [HR_EMAIL]);
  if (hrUserRes.rows.length > 0) {
    hrUserId = hrUserRes.rows[0].id;
    await query(`UPDATE users SET password_hash = $1, role_id = $2, is_active = true, updated_at = NOW() WHERE id = $3`, [hrHash, hrRoleId, hrUserId]);
  } else {
    await query(`INSERT INTO users (id, email, password_hash, role_id, is_active) VALUES ($1, $2, $3, $4, true)`, [hrUserId, HR_EMAIL, hrHash, hrRoleId]);
  }

  // HR employee
  const adminEmpIdRes = await query(`SELECT id FROM employees WHERE user_id = $1`, [adminUserId]);
  const adminEmpId = adminEmpIdRes.rows[0]?.id || null;
  const hrEmpRes = await query(`SELECT id FROM employees WHERE user_id = $1`, [hrUserId]);
  if (hrEmpRes.rows.length > 0) {
    await query(
      `UPDATE employees SET first_name = $1, last_name = $2, email = $3, department_id = NULL, designation_id = NULL, reporting_manager_id = $4, employment_status = 'Active', updated_at = NOW() WHERE id = $5`,
      [HR_FIRST_NAME, HR_LAST_NAME, HR_EMAIL, adminEmpId, hrEmpRes.rows[0].id]
    );
  } else {
    const empId = uuidv4();
    await query(
      `INSERT INTO employees (id, employee_id, user_id, first_name, last_name, email, phone, city, state, country, reporting_manager_id, date_of_joining, employment_type, employment_status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [empId, generateEmployeeId(), hrUserId, HR_FIRST_NAME, HR_LAST_NAME, HR_EMAIL, '+91-9876543002', 'Noida', 'Uttar Pradesh', 'India', adminEmpId, '2020-06-01', 'Full-time', 'Active']
    );
  }

  console.log('Admin and HR accounts are ready.');
};

const seedData = async (): Promise<void> => {
  try {
    console.log('Starting seed...');
    await createOrUpdateAdminHR();
    console.log('Seed completed successfully!');
  } catch (error) {
    console.error('Seed failed:', error);
    throw error;
  }
};

if (require.main === module) {
  seedData()
    .then(() => {
      pool.end();
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed error:', err);
      pool.end();
      process.exit(1);
    });
}

export default seedData;
