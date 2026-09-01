import { Request, Response } from 'express';
import { query } from '../config/database';
import { generateEmployeeId, hashPassword } from '../utils/helpers';
import { v4 as uuidv4 } from 'uuid';

export const getEmployees = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || '';
    const departmentId = req.query.departmentId as string;
    const department = req.query.department as string;
    const designationId = req.query.designationId as string;
    const status = (req.query.status as string) || 'Active';
    const offset = (page - 1) * limit;

    let whereClauses: string[] = [];
    let params: any[] = [];
    let paramIdx = 1;

    if (search) {
      whereClauses.push(`(e.first_name ILIKE $${paramIdx} OR e.last_name ILIKE $${paramIdx} OR e.email ILIKE $${paramIdx} OR e.employee_id ILIKE $${paramIdx})`);
      params.push(`%${search}%`);
      paramIdx++;
    }

    if (departmentId) {
      whereClauses.push(`e.department_id = $${paramIdx}`);
      params.push(parseInt(departmentId));
      paramIdx++;
    }

    if (department) {
      const names = department.split(',').map((n) => n.trim()).filter(Boolean);
      if (names.length > 0) {
        whereClauses.push(`d.name = ANY($${paramIdx})`);
        params.push(names);
        paramIdx++;
      }
    }

    if (designationId) {
      whereClauses.push(`e.designation_id = $${paramIdx}`);
      params.push(parseInt(designationId));
      paramIdx++;
    }

    if (status) {
      whereClauses.push(`e.employment_status = $${paramIdx}`);
      params.push(status);
      paramIdx++;
    }

    const whereStr = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const countRes = await query(`SELECT COUNT(*) FROM employees e LEFT JOIN departments d ON e.department_id = d.id ${whereStr}`, params);
    const totalCount = parseInt(countRes.rows[0].count);

    params.push(limit, offset);
    const empRes = await query(
      `SELECT e.*, d.name as department_name, des.title as designation_title,
              m.first_name as manager_first_name, m.last_name as manager_last_name
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN designations des ON e.designation_id = des.id
       LEFT JOIN employees m ON e.reporting_manager_id = m.id
       ${whereStr}
       ORDER BY e.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      params
    );

    res.status(200).json({
      success: true,
      data: {
        employees: empRes.rows,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      },
    });
  } catch (error: any) {
    console.error('Get employees error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const getEmployeeById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const empRes = await query(
      `SELECT e.*, d.name as department_name, des.title as designation_title,
              m.first_name as manager_first_name, m.last_name as manager_last_name, m.email as manager_email
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN designations des ON e.designation_id = des.id
       LEFT JOIN employees m ON e.reporting_manager_id = m.id
       WHERE e.id::text = $1 OR e.employee_id = $1`,
      [id]
    );

    if (empRes.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Employee not found.' });
      return;
    }

    const employee = empRes.rows[0];

    // Get recent attendance
    const attendanceRes = await query(
      `SELECT * FROM attendance WHERE employee_id = $1 ORDER BY date DESC LIMIT 10`,
      [employee.id]
    );

    // Get recent work updates
    const workUpdatesRes = await query(
      `SELECT * FROM employee_work_updates WHERE employee_id = $1 ORDER BY date DESC LIMIT 5`,
      [employee.id]
    );

    // Get assigned tasks
    const tasksRes = await query(
      `SELECT t.*, p.name as project_name FROM tasks t LEFT JOIN projects p ON t.project_id = p.id WHERE t.assigned_to = $1 ORDER BY t.created_at DESC LIMIT 10`,
      [employee.id]
    );

    // Get identity card
    const cardRes = await query(
      `SELECT * FROM employee_identity_cards WHERE employee_id = $1 AND is_active = true`,
      [employee.id]
    );

    res.status(200).json({
      success: true,
      data: {
        ...employee,
        recentAttendance: attendanceRes.rows,
        recentWorkUpdates: workUpdatesRes.rows,
        tasks: tasksRes.rows,
        identityCard: cardRes.rows[0] || null,
      },
    });
  } catch (error: any) {
    console.error('Get employee by ID error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const createEmployee = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      email, firstName, lastName, phone, alternatePhone,
      dateOfBirth, gender, address, city, state, country,
      emergencyContactName, emergencyContactPhone,
      departmentId, designationId, reportingManagerId,
      dateOfJoining, employmentType, monthlySalary, password
    } = req.body;

    // Look for an existing employee record (including previously deactivated ones)
    const roleRes = await query("SELECT id FROM roles WHERE name = 'employee'");
    const roleId = roleRes.rows[0]?.id || 3;
    const passwordHash = password ? await hashPassword(password) : null;

    const existingEmp = await query('SELECT id, user_id FROM employees WHERE email = $1', [email]);
    if (existingEmp.rows.length > 0) {
      const existing = existingEmp.rows[0];
      const existingUserRes = await query('SELECT id FROM users WHERE email = $1', [email]);
      let userId = existing.user_id || existingUserRes.rows[0]?.id || null;

      if (!userId) {
        if (existingUserRes.rows.length > 0) {
          userId = existingUserRes.rows[0].id;
        } else {
          userId = uuidv4();
          await query(
            `INSERT INTO users (id, email, password_hash, role_id, is_active) VALUES ($1, $2, $3, $4, true)`,
            [userId, email, passwordHash, roleId]
          );
        }
      } else if (passwordHash) {
        await query(
          `UPDATE users SET is_active = true, password_hash = $1, updated_at = NOW() WHERE id = $2`,
          [passwordHash, userId]
        );
      } else {
        await query(
          `UPDATE users SET is_active = true, updated_at = NOW() WHERE id = $1`,
          [userId]
        );
      }

      await query(
        `UPDATE employees SET user_id = $1, first_name = $2, last_name = $3, phone = $4, alternate_phone = $5, date_of_birth = $6, gender = $7, address = $8, city = $9, state = $10, country = $11, emergency_contact_name = $12, emergency_contact_phone = $13, department_id = $14, designation_id = $15, reporting_manager_id = $16, date_of_joining = $17, employment_type = $18, employment_status = 'Active', monthly_salary = $19, updated_at = NOW() WHERE id = $20`,
        [userId, firstName, lastName, phone || null, alternatePhone || null, dateOfBirth || null, gender || null, address || null, city || null, state || null, country || 'India', emergencyContactName || null, emergencyContactPhone || null, departmentId || null, designationId || null, reportingManagerId || null, dateOfJoining || new Date().toISOString().split('T')[0], employmentType || 'Full-time', monthlySalary || 0, existing.id]
      );

      const created = await query(
        `SELECT e.*, d.name as department_name, des.title as designation_title
         FROM employees e
         LEFT JOIN departments d ON e.department_id = d.id
         LEFT JOIN designations des ON e.designation_id = des.id
         WHERE e.id = $1`,
        [existing.id]
      );

      res.status(200).json({
        success: true,
        message: 'Employee reactivated successfully.',
        data: created.rows[0],
      });
      return;
    }

    // No existing employee: check for an orphaned user account (e.g. previous employee deleted without cleanup)
    const existingUser = await query('SELECT id FROM users WHERE email = $1', [email]);
    let userId: string | null = null;
    if (existingUser.rows.length > 0) {
      userId = existingUser.rows[0].id;
      if (passwordHash) {
        await query(
          `UPDATE users SET is_active = true, password_hash = $1, updated_at = NOW() WHERE id = $2`,
          [passwordHash, userId]
        );
      } else {
        await query(
          `UPDATE users SET is_active = true, updated_at = NOW() WHERE id = $1`,
          [userId]
        );
      }
    } else {
      // Create a fresh login account for the employee
      userId = uuidv4();
      await query(
        `INSERT INTO users (id, email, password_hash, role_id, is_active) VALUES ($1, $2, $3, $4, true)`,
        [userId, email, passwordHash, roleId]
      );
    }

    const empId = uuidv4();
    const empCode = generateEmployeeId();

    await query(
      `INSERT INTO employees (id, employee_id, user_id, first_name, last_name, email, phone, alternate_phone, date_of_birth, gender, address, city, state, country, emergency_contact_name, emergency_contact_phone, department_id, designation_id, reporting_manager_id, date_of_joining, employment_type, employment_status, monthly_salary) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
      [empId, empCode, userId, firstName, lastName, email, phone || null, alternatePhone || null, dateOfBirth || null, gender || null, address || null, city || null, state || null, country || 'India', emergencyContactName || null, emergencyContactPhone || null, departmentId || null, designationId || null, reportingManagerId || null, dateOfJoining || new Date().toISOString().split('T')[0], employmentType || 'Full-time', 'Active', monthlySalary || 0]
    );

    const created = await query(
      `SELECT e.*, d.name as department_name, des.title as designation_title
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN designations des ON e.designation_id = des.id
       WHERE e.id = $1`,
      [empId]
    );

    res.status(201).json({
      success: true,
      message: 'Employee created successfully.',
      data: created.rows[0],
    });
  } catch (error: any) {
    console.error('Create employee error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const updateEmployee = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      firstName, lastName, phone, alternatePhone,
      dateOfBirth, gender, address, city, state, country,
      emergencyContactName, emergencyContactPhone,
      departmentId, designationId, reportingManagerId,
      dateOfJoining, employmentType, employmentStatus, monthlySalary, password
    } = req.body;

    const existing = await query('SELECT id FROM employees WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Employee not found.' });
      return;
    }

    if (password) {
      const emp = await query('SELECT user_id FROM employees WHERE id = $1', [id]);
      const passwordHash = await hashPassword(password);
      if (emp.rows[0]?.user_id) {
        await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, emp.rows[0].user_id]);
      }
    }

    const columns: Record<string, string> = {
      firstName: 'first_name',
      lastName: 'last_name',
      email: 'email',
      phone: 'phone',
      alternatePhone: 'alternate_phone',
      dateOfBirth: 'date_of_birth',
      gender: 'gender',
      address: 'address',
      city: 'city',
      state: 'state',
      country: 'country',
      pincode: 'pincode',
      emergencyContactName: 'emergency_contact_name',
      emergencyContactPhone: 'emergency_contact_phone',
      emergencyContact: 'emergency_contact_phone',
      departmentId: 'department_id',
      designationId: 'designation_id',
      reportingManagerId: 'reporting_manager_id',
      dateOfJoining: 'date_of_joining',
      employmentType: 'employment_type',
      employmentStatus: 'employment_status',
      status: 'employment_status',
      monthlySalary: 'monthly_salary',
    };

    const blankToNull = (val: any): any => (val == null || val === '') ? null : val;

    const sets: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    for (const [bodyKey, col] of Object.entries(columns)) {
      if (!(bodyKey in req.body)) continue;
      let val = req.body[bodyKey];
      val = bodyKey === 'monthlySalary' ? (val != null && val !== '' ? parseFloat(val) : 0) : blankToNull(val);
      sets.push(`${col} = $${paramIdx}`);
      values.push(val);
      paramIdx++;
    }

    values.push(id);
    await query(
      `UPDATE employees SET ${sets.join(', ')}${sets.length > 0 ? ',' : ''} updated_at = NOW() WHERE id = $${paramIdx}`,
      values
    );

    const updated = await query(
      `SELECT e.*, d.name as department_name, des.title as designation_title
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN designations des ON e.designation_id = des.id
       WHERE e.id = $1`,
      [id]
    );

    res.status(200).json({
      success: true,
      message: 'Employee updated successfully.',
      data: updated.rows[0],
    });
  } catch (error: any) {
    console.error('Update employee error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const deactivateEmployee = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const existing = await query('SELECT id, user_id FROM employees WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Employee not found.' });
      return;
    }

    await query(
      `UPDATE employees SET employment_status = 'Inactive', updated_at = NOW() WHERE id = $1`,
      [id]
    );

    // Deactivate associated user account
    if (existing.rows[0].user_id) {
      await query('UPDATE users SET is_active = false WHERE id = $1', [existing.rows[0].user_id]);
    }

    res.status(200).json({
      success: true,
      message: 'Employee deactivated successfully.',
    });
  } catch (error: any) {
    console.error('Deactivate employee error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const getEmployeeStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const totalRes = await query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE employment_status = 'Active') as active FROM employees`);
    const deptRes = await query(
      `SELECT d.name, COUNT(e.id) as count FROM departments d LEFT JOIN employees e ON d.id = e.department_id AND e.employment_status = 'Active' GROUP BY d.id, d.name ORDER BY count DESC`
    );
    const genderRes = await query(
      `SELECT gender, COUNT(*) as count FROM employees WHERE employment_status = 'Active' GROUP BY gender`
    );
    const typeRes = await query(
      `SELECT employment_type, COUNT(*) as count FROM employees WHERE employment_status = 'Active' GROUP BY employment_type`
    );

    res.status(200).json({
      success: true,
      data: {
        total: parseInt(totalRes.rows[0].total),
        active: parseInt(totalRes.rows[0].active),
        byDepartment: deptRes.rows,
        byGender: genderRes.rows,
        byType: typeRes.rows,
      },
    });
  } catch (error: any) {
    console.error('Get employee stats error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};
