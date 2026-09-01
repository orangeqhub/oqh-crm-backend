import { Request, Response } from 'express';
import { query } from '../config/database';
import { hashPassword, comparePassword, generateTokens, TokenPayload } from '../utils/helpers';
import { v4 as uuidv4 } from 'uuid';
import { generateEmployeeId } from '../utils/helpers';

export const registerUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, firstName, lastName, phone, departmentId, designationId, dateOfBirth, gender, address, city, state } = req.body;

    const existingUser = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      res.status(409).json({ success: false, message: 'User with this email already exists.' });
      return;
    }

    const existingEmp = await query('SELECT id FROM employees WHERE email = $1', [email]);
    if (existingEmp.rows.length > 0) {
      res.status(409).json({ success: false, message: 'Employee with this email already exists.' });
      return;
    }

    const passwordHash = await hashPassword(password);
    const userId = uuidv4();
    const employeeId = generateEmployeeId();

    // Get employee role
    const roleRes = await query("SELECT id FROM roles WHERE name = 'employee'");
    const roleId = roleRes.rows[0]?.id || 3;

    await query(
      `INSERT INTO users (id, email, password_hash, role_id) VALUES ($1, $2, $3, $4)`,
      [userId, email, passwordHash, roleId]
    );

    const empId = uuidv4();
    await query(
      `INSERT INTO employees (id, employee_id, user_id, first_name, last_name, email, phone, date_of_birth, gender, address, city, state, country, department_id, designation_id, date_of_joining, employment_type, employment_status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [empId, employeeId, userId, firstName, lastName, email, phone || null, dateOfBirth || null, gender || null, address || null, city || null, state || null, 'India', departmentId || null, designationId || null, new Date().toISOString().split('T')[0], 'Full-time', 'Active']
    );

    const userPayload: TokenPayload = { id: userId, email, role: 'employee', roleId };
    const tokens = generateTokens(userPayload);

    await query('UPDATE users SET refresh_token = $1 WHERE id = $2', [tokens.refreshToken, userId]);

    res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      data: {
        user: { id: userId, email, role: 'employee' },
        employee: { id: empId, employeeId, firstName, lastName, email },
        ...tokens,
      },
    });
  } catch (error: any) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const loginUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    const userRes = await query(
      `SELECT u.id, u.email, u.password_hash, u.is_active, r.name as role_name, r.id as role_id
       FROM users u JOIN roles r ON u.role_id = r.id
       WHERE u.email = $1`,
      [email]
    );

    if (userRes.rows.length === 0) {
      res.status(401).json({ success: false, message: 'Invalid email or password.' });
      return;
    }

    const user = userRes.rows[0];

    if (!user.is_active) {
      res.status(403).json({ success: false, message: 'Account is deactivated. Contact administrator.' });
      return;
    }

    const isValidPassword = await comparePassword(password, user.password_hash);
    if (!isValidPassword) {
      res.status(401).json({ success: false, message: 'Invalid email or password.' });
      return;
    }

    const userPayload: TokenPayload = { id: user.id, email: user.email, role: user.role_name, roleId: user.role_id };
    const tokens = generateTokens(userPayload);

    await query('UPDATE users SET refresh_token = $1, last_login = NOW() WHERE id = $2', [tokens.refreshToken, user.id]);

    // Get employee info
    const empRes = await query(
      `SELECT e.id, e.employee_id, e.first_name, e.last_name, e.email as emp_email, e.profile_photo,
              d.name as department_name, des.title as designation_title
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN designations des ON e.designation_id = des.id
       WHERE e.user_id = $1`,
      [user.id]
    );

    const employee = empRes.rows[0] || null;

    // Log login activity
    if (employee) {
      await query(
        `INSERT INTO login_activity (employee_id, login_time, ip_address, user_agent) VALUES ($1, NOW(), $2, $3)`,
        [employee.id, req.ip || 'unknown', req.get('user-agent') || 'unknown']
      );
    }

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: {
        user: {
          id: user.id,
          email: user.email,
          role: user.role_name,
          roleId: user.role_id,
          employee,
        },
        ...tokens,
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const logoutUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    await query('UPDATE users SET refresh_token = NULL WHERE id = $1', [userId]);

    // Update login activity
    const empRes = await query('SELECT id FROM employees WHERE user_id = $1', [userId]);
    if (empRes.rows.length > 0) {
      await query(
        `UPDATE login_activity SET logout_time = NOW(), session_duration = EXTRACT(EPOCH FROM (NOW() - login_time))::INTEGER WHERE employee_id = $1 AND logout_time IS NULL`,
        [empRes.rows[0].id]
      );
    }

    res.status(200).json({ success: true, message: 'Logged out successfully.' });
  } catch (error: any) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ success: false, message: 'Refresh token is required.' });
      return;
    }

    let decoded: any;
    try {
      const jwt = require('jsonwebtoken');
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || 'default_refresh_secret');
    } catch {
      res.status(401).json({ success: false, message: 'Invalid or expired refresh token.' });
      return;
    }

    const userRes = await query(
      `SELECT u.id, u.email, u.is_active, u.refresh_token, r.name as role_name, r.id as role_id
       FROM users u JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [decoded.id]
    );

    if (userRes.rows.length === 0) {
      res.status(401).json({ success: false, message: 'User not found.' });
      return;
    }

    const user = userRes.rows[0];

    if (!user.is_active) {
      res.status(403).json({ success: false, message: 'Account is deactivated.' });
      return;
    }

    if (user.refresh_token !== refreshToken) {
      res.status(401).json({ success: false, message: 'Refresh token does not match.' });
      return;
    }

    const userPayload: TokenPayload = { id: user.id, email: user.email, role: user.role_name, roleId: user.role_id };
    const tokens = generateTokens(userPayload);

    await query('UPDATE users SET refresh_token = $1 WHERE id = $2', [tokens.refreshToken, user.id]);

    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully.',
      data: tokens,
    });
  } catch (error: any) {
    console.error('Refresh token error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const getCurrentUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    const userRes = await query(
      `SELECT u.id, u.email, u.is_active, u.last_login, u.created_at, r.name as role_name, r.id as role_id
       FROM users u JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [userId]
    );

    if (userRes.rows.length === 0) {
      res.status(404).json({ success: false, message: 'User not found.' });
      return;
    }

    const user = userRes.rows[0];

    const empRes = await query(
      `SELECT e.*, d.name as department_name, des.title as designation_title,
              m.first_name as manager_first_name, m.last_name as manager_last_name
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN designations des ON e.designation_id = des.id
       LEFT JOIN employees m ON e.reporting_manager_id = m.id
       WHERE e.user_id = $1`,
      [userId]
    );

    res.status(200).json({
      success: true,
      data: {
        ...user,
        employee: empRes.rows[0] || null,
      },
    });
  } catch (error: any) {
    console.error('Get current user error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const changePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ success: false, message: 'Current and new password are required.' });
      return;
    }

    const userRes = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      res.status(404).json({ success: false, message: 'User not found.' });
      return;
    }

    const isValid = await comparePassword(currentPassword, userRes.rows[0].password_hash);
    if (!isValid) {
      res.status(401).json({ success: false, message: 'Current password is incorrect.' });
      return;
    }

    const newHash = await hashPassword(newPassword);
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, userId]);

    res.status(200).json({ success: true, message: 'Password changed successfully.' });
  } catch (error: any) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    const { firstName, lastName, phone, alternatePhone, dateOfBirth, gender, address, city, state, country, pincode, emergencyContactName, emergencyContactPhone } = req.body;

    const empRes = await query('SELECT id FROM employees WHERE user_id = $1', [userId]);
    if (empRes.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Employee profile not found.' });
      return;
    }

    await query(
      `UPDATE employees SET
        first_name = COALESCE($1, first_name),
        last_name = COALESCE($2, last_name),
        phone = COALESCE($3, phone),
        alternate_phone = COALESCE($4, alternate_phone),
        date_of_birth = COALESCE($5, date_of_birth),
        gender = COALESCE($6, gender),
        address = COALESCE($7, address),
        city = COALESCE($8, city),
        state = COALESCE($9, state),
        country = COALESCE($10, country),
        pincode = COALESCE($11, pincode),
        emergency_contact_name = COALESCE($12, emergency_contact_name),
        emergency_contact_phone = COALESCE($13, emergency_contact_phone),
        updated_at = NOW()
       WHERE user_id = $14`,
      [firstName, lastName, phone, alternatePhone, dateOfBirth, gender, address, city, state, country, pincode, emergencyContactName, emergencyContactPhone, userId]
    );

    const updatedEmp = await query(
      `SELECT e.*, d.name as department_name, des.title as designation_title
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN designations des ON e.designation_id = des.id
       WHERE e.user_id = $1`,
      [userId]
    );

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      data: updatedEmp.rows[0],
    });
  } catch (error: any) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};
