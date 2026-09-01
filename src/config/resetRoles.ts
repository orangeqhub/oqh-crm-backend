import dotenv from 'dotenv';
import { query } from './database';
import pool from './database';

dotenv.config();

const ADMIN_EMAIL = 'pathanazamkhan09@gmail.com';
const HR_EMAIL = 'hrorangequantumhub@gmail.com';

const ROLES = [
  { department: 'Developers', designation: 'Developers' },
  { department: 'Digital Marketing', designation: 'Digital Marketing' },
  { department: 'Video Editing', designation: 'Video Editing' },
  { department: 'Graphic Designing', designation: 'Graphic Designing' },
  { department: 'Telecallers', designation: 'Telecallers' },
];

const resetRoles = async (): Promise<void> => {
  console.log('Starting role reset...');

  // Clear department/designation references on all employees
  await query(`UPDATE employees SET department_id = NULL, designation_id = NULL`);
  console.log('Cleared employee department/designation references.');

  // Remove existing designations and departments
  await query(`DELETE FROM designations`);
  await query(`DELETE FROM departments`);
  console.log('Removed existing departments and designations.');

  // Create the 5 roles as departments + designations
  for (const role of ROLES) {
    await query(
      `INSERT INTO departments (name, description) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING`,
      [role.department, `${role.department} role`]
    );
    const deptRes = await query(`SELECT id FROM departments WHERE name = $1`, [role.department]);
    const deptId = deptRes.rows[0]?.id;
    if (deptId != null) {
      await query(
        `INSERT INTO designations (title, department_id) VALUES ($1, $2) ON CONFLICT (title) DO NOTHING`,
        [role.designation, deptId]
      );
    }
  }
  console.log('Created the 5 roles.');

  // Assign existing non-admin/HR employees to "Developers"
  const devDept = await query(`SELECT id FROM departments WHERE name = 'Developers'`);
  const devDesig = await query(`SELECT id FROM designations WHERE title = 'Developers'`);
  const devDeptId = devDept.rows[0]?.id;
  const devDesigId = devDesig.rows[0]?.id;
  if (devDeptId != null && devDesigId != null) {
    await query(
      `UPDATE employees SET department_id = $1, designation_id = $2 WHERE email <> $3 AND email <> $4`,
      [devDeptId, devDesigId, ADMIN_EMAIL, HR_EMAIL]
    );
    console.log('Assigned existing non-admin/HR employees to Developers.');
  }

  console.log('Role reset complete.');
};

if (require.main === module) {
  resetRoles()
    .then(() => {
      pool.end();
      process.exit(0);
    })
    .catch((err) => {
      console.error('Role reset failed:', err);
      pool.end();
      process.exit(1);
    });
}

export default resetRoles;
