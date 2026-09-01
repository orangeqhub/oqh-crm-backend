import { Request, Response } from 'express';
import { query } from '../config/database';

export const getSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await query('SELECT * FROM company_settings ORDER BY setting_key');
    
    const settings: Record<string, string> = {};
    result.rows.forEach((row: any) => {
      settings[row.setting_key] = row.setting_value;
    });

    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error: any) {
    console.error('Get settings error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const updateSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    const settings = req.body;

    if (!settings || typeof settings !== 'object') {
      res.status(400).json({ success: false, message: 'Settings object is required.' });
      return;
    }

    for (const [key, value] of Object.entries(settings)) {
      await query(
        `INSERT INTO company_settings (setting_key, setting_value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_at = NOW()`,
        [key, value as string]
      );
    }

    const updated = await query('SELECT * FROM company_settings ORDER BY setting_key');
    const result: Record<string, string> = {};
    updated.rows.forEach((row: any) => {
      result[row.setting_key] = row.setting_value;
    });

    res.status(200).json({
      success: true,
      message: 'Settings updated successfully.',
      data: result,
    });
  } catch (error: any) {
    console.error('Update settings error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const getDepartments = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await query(
      `SELECT d.*, COUNT(e.id) as employee_count
       FROM departments d
       LEFT JOIN employees e ON d.id = e.department_id AND e.employment_status = 'Active'
       GROUP BY d.id, d.name
       ORDER BY d.name`
    );

    res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    console.error('Get departments error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const createDepartment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description } = req.body;
    if (!name) {
      res.status(400).json({ success: false, message: 'Department name is required.' });
      return;
    }
    const result = await query(
      'INSERT INTO departments (name, description) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET description = $2 RETURNING *',
      [name, description || null]
    );
    res.status(201).json({ success: true, message: 'Department created.', data: result.rows[0] });
  } catch (error: any) {
    console.error('Create department error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const updateDepartment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    const result = await query(
      'UPDATE departments SET name = COALESCE($1, name), description = COALESCE($2, description) WHERE id = $3 RETURNING *',
      [name, description, id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Department not found.' });
      return;
    }
    res.status(200).json({ success: true, message: 'Department updated.', data: result.rows[0] });
  } catch (error: any) {
    console.error('Update department error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const deleteDepartment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const empCheck = await query('SELECT COUNT(*) FROM employees WHERE department_id = $1 AND employment_status = $2', [id, 'Active']);
    if (parseInt(empCheck.rows[0].count) > 0) {
      res.status(400).json({ success: false, message: 'Cannot delete department with active employees.' });
      return;
    }
    await query('DELETE FROM departments WHERE id = $1', [id]);
    res.status(200).json({ success: true, message: 'Department deleted.' });
  } catch (error: any) {
    console.error('Delete department error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const createDesignation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, department } = req.body;
    if (!title || !department) {
      res.status(400).json({ success: false, message: 'Title and department are required.' });
      return;
    }
    const deptRes = await query('SELECT id FROM departments WHERE name = $1', [department]);
    const departmentId = deptRes.rows[0]?.id || null;
    const result = await query(
      'INSERT INTO designations (title, department_id) VALUES ($1, $2) ON CONFLICT (title) DO UPDATE SET department_id = $2 RETURNING *',
      [title, departmentId]
    );
    res.status(201).json({ success: true, message: 'Designation created.', data: result.rows[0] });
  } catch (error: any) {
    console.error('Create designation error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const updateDesignation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { title } = req.body;
    const result = await query(
      'UPDATE designations SET title = COALESCE($1, title) WHERE id = $2 RETURNING *',
      [title, id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Designation not found.' });
      return;
    }
    res.status(200).json({ success: true, message: 'Designation updated.', data: result.rows[0] });
  } catch (error: any) {
    console.error('Update designation error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const deleteDesignation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const empCheck = await query('SELECT COUNT(*) FROM employees WHERE designation_id = $1 AND employment_status = $2', [id, 'Active']);
    if (parseInt(empCheck.rows[0].count) > 0) {
      res.status(400).json({ success: false, message: 'Cannot delete designation with active employees.' });
      return;
    }
    await query('DELETE FROM designations WHERE id = $1', [id]);
    res.status(200).json({ success: true, message: 'Designation deleted.' });
  } catch (error: any) {
    console.error('Delete designation error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const getDesignations = async (req: Request, res: Response): Promise<void> => {
  try {
    const departmentId = req.query.departmentId as string;

    let whereClause = '';
    const params: any[] = [];

    if (departmentId) {
      whereClause = 'WHERE des.department_id = $1';
      params.push(parseInt(departmentId));
    }

    const result = await query(
      `SELECT des.*, d.name as department_name, COUNT(e.id) as employee_count
       FROM designations des
       LEFT JOIN departments d ON des.department_id = d.id
       LEFT JOIN employees e ON des.id = e.designation_id AND e.employment_status = 'Active'
       ${whereClause}
       GROUP BY des.id, des.title, d.name
       ORDER BY d.name, des.title`,
      params
    );

    res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    console.error('Get designations error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};
