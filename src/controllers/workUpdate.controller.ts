import { Request, Response } from 'express';
import { query } from '../config/database';

export const createWorkUpdate = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const empRes = await query('SELECT id FROM employees WHERE user_id = $1', [userId]);
    if (empRes.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Employee not found.' });
      return;
    }

    const employeeId = req.body.employeeId || empRes.rows[0].id;

    // Check role - employees can only submit for themselves
    if (req.user?.role === 'employee' && employeeId !== empRes.rows[0].id) {
      res.status(403).json({ success: false, message: 'Cannot submit work updates for other employees.' });
      return;
    }

    const { date, projectModule, taskAssigned, taskCompleted, developmentInProgress, testingStatus, nextDayTask, completionPercentage, notes, taskStatus } = req.body;

    const updateDate = date || new Date().toISOString().split('T')[0];

    // Check if already exists for this date
    const existing = await query(
      'SELECT id FROM employee_work_updates WHERE employee_id = $1 AND date = $2',
      [employeeId, updateDate]
    );

    if (existing.rows.length > 0) {
      res.status(409).json({ success: false, message: 'Work update already exists for this date. Use update endpoint instead.' });
      return;
    }

    const result = await query(
      `INSERT INTO employee_work_updates (employee_id, date, project_module, task_assigned, task_completed, development_in_progress, testing_status, next_day_task, completion_percentage, notes, task_status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [employeeId, updateDate, projectModule || null, taskAssigned || null, taskCompleted || null, developmentInProgress || null, testingStatus || 'Not Applicable', nextDayTask || null, completionPercentage || 0, notes || null, taskStatus || 'In Progress']
    );

    res.status(201).json({
      success: true,
      message: 'Work update submitted successfully.',
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Create work update error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const updateWorkUpdate = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const existing = await query('SELECT id, employee_id FROM employee_work_updates WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Work update not found.' });
      return;
    }

    // Check ownership
    if (req.user?.role === 'employee') {
      const empRes = await query('SELECT id FROM employees WHERE user_id = $1', [req.user.id]);
      if (empRes.rows.length === 0 || empRes.rows[0].id !== existing.rows[0].employee_id) {
        res.status(403).json({ success: false, message: 'Cannot update other employee\'s work updates.' });
        return;
      }
    }

    const { projectModule, taskAssigned, taskCompleted, developmentInProgress, testingStatus, nextDayTask, completionPercentage, notes, taskStatus } = req.body;

    const result = await query(
      `UPDATE employee_work_updates SET
        project_module = COALESCE($1, project_module),
        task_assigned = COALESCE($2, task_assigned),
        task_completed = COALESCE($3, task_completed),
        development_in_progress = COALESCE($4, development_in_progress),
        testing_status = COALESCE($5, testing_status),
        next_day_task = COALESCE($6, next_day_task),
        completion_percentage = COALESCE($7, completion_percentage),
        notes = COALESCE($8, notes),
        task_status = COALESCE($9, task_status),
        updated_at = NOW()
       WHERE id = $10 RETURNING *`,
      [projectModule, taskAssigned, taskCompleted, developmentInProgress, testingStatus, nextDayTask, completionPercentage, notes, taskStatus, id]
    );

    res.status(200).json({
      success: true,
      message: 'Work update updated successfully.',
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Update work update error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const getEmployeeWorkUpdates = async (req: Request, res: Response): Promise<void> => {
  try {
    const { employeeId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    const countRes = await query('SELECT COUNT(*) FROM employee_work_updates WHERE employee_id = $1', [employeeId]);
    const totalCount = parseInt(countRes.rows[0].count);

    const result = await query(
      `SELECT wu.*, e.first_name, e.last_name, e.employee_id as emp_code
       FROM employee_work_updates wu
       JOIN employees e ON wu.employee_id = e.id
       WHERE wu.employee_id = $1
       ORDER BY wu.date DESC
       LIMIT $2 OFFSET $3`,
      [employeeId, limit, offset]
    );

    res.status(200).json({
      success: true,
      data: {
        workUpdates: result.rows,
        pagination: { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) },
      },
    });
  } catch (error: any) {
    console.error('Get employee work updates error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const getAllWorkUpdates = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const departmentId = req.query.departmentId as string;
    const employeeId = req.query.employeeId as string;
    const offset = (page - 1) * limit;

    let whereClauses: string[] = [];
    let params: any[] = [];
    let paramIdx = 1;

    if (employeeId) {
      whereClauses.push(`wu.employee_id = $${paramIdx}`);
      params.push(employeeId);
      paramIdx++;
    }

    if (startDate) {
      whereClauses.push(`wu.date >= $${paramIdx}`);
      params.push(startDate);
      paramIdx++;
    }

    if (endDate) {
      whereClauses.push(`wu.date <= $${paramIdx}`);
      params.push(endDate);
      paramIdx++;
    }

    if (departmentId) {
      whereClauses.push(`e.department_id = $${paramIdx}`);
      params.push(parseInt(departmentId));
      paramIdx++;
    }

    const whereStr = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const countRes = await query(
      `SELECT COUNT(*) FROM employee_work_updates wu JOIN employees e ON wu.employee_id = e.id ${whereStr}`,
      params
    );
    const totalCount = parseInt(countRes.rows[0].count);

    params.push(limit, offset);
    const result = await query(
      `SELECT wu.*, e.first_name, e.last_name, e.employee_id as emp_code, d.name as department_name
       FROM employee_work_updates wu
       JOIN employees e ON wu.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       ${whereStr}
       ORDER BY wu.date DESC, e.first_name
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      params
    );

    res.status(200).json({
      success: true,
      data: {
        workUpdates: result.rows,
        pagination: { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) },
      },
    });
  } catch (error: any) {
    console.error('Get all work updates error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const getWorkUpdateStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const submittedToday = await query(
      `SELECT COUNT(DISTINCT employee_id) as count FROM employee_work_updates WHERE date = $1`,
      [today]
    );

    const totalEmployees = await query(
      `SELECT COUNT(*) as count FROM employees WHERE employment_status = 'Active'`
    );

    const avgCompletion = await query(
      `SELECT ROUND(AVG(completion_percentage)::numeric, 2) as avg_percentage
       FROM employee_work_updates
       WHERE date >= CURRENT_DATE - INTERVAL '7 days'`
    );

    const statusBreakdown = await query(
      `SELECT task_status, COUNT(*) as count
       FROM employee_work_updates
       WHERE date >= CURRENT_DATE - INTERVAL '7 days'
       GROUP BY task_status`
    );

    res.status(200).json({
      success: true,
      data: {
        submittedToday: parseInt(submittedToday.rows[0].count),
        totalEmployees: parseInt(totalEmployees.rows[0].count),
        submissionRate: totalEmployees.rows[0].count > 0
          ? parseFloat(((parseInt(submittedToday.rows[0].count) / parseInt(totalEmployees.rows[0].count)) * 100).toFixed(1))
          : 0,
        avgCompletion: parseFloat(avgCompletion.rows[0]?.avg_percentage || '0'),
        statusBreakdown: statusBreakdown.rows,
      },
    });
  } catch (error: any) {
    console.error('Get work update stats error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};
