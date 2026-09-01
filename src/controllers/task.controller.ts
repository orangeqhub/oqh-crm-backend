import { Request, Response } from 'express';
import { query } from '../config/database';

export const getTasks = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const status = req.query.status as string;
    const priority = req.query.priority as string;
    const projectId = req.query.projectId as string;
    const assignedTo = req.query.assignedTo as string;
    const offset = (page - 1) * limit;

    let whereClauses: string[] = [];
    let params: any[] = [];
    let paramIdx = 1;

    if (search) {
      whereClauses.push(`(t.title ILIKE $${paramIdx} OR t.description ILIKE $${paramIdx})`);
      params.push(`%${search}%`);
      paramIdx++;
    }

    if (status) {
      whereClauses.push(`t.status = $${paramIdx}`);
      params.push(status);
      paramIdx++;
    }

    if (priority) {
      whereClauses.push(`t.priority = $${paramIdx}`);
      params.push(priority);
      paramIdx++;
    }

    if (projectId) {
      whereClauses.push(`t.project_id = $${paramIdx}`);
      params.push(parseInt(projectId));
      paramIdx++;
    }

    if (assignedTo) {
      whereClauses.push(`t.assigned_to = $${paramIdx}`);
      params.push(assignedTo);
      paramIdx++;
    }

    const whereStr = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const countRes = await query(`SELECT COUNT(*) FROM tasks t ${whereStr}`, params);
    const totalCount = parseInt(countRes.rows[0].count);

    params.push(limit, offset);
    const taskRes = await query(
      `SELECT t.*, p.name as project_name,
              a.first_name as assignee_first_name, a.last_name as assignee_last_name,
              b.first_name as assigner_first_name, b.last_name as assigner_last_name
       FROM tasks t
       LEFT JOIN projects p ON t.project_id = p.id
       LEFT JOIN employees a ON t.assigned_to = a.id
       LEFT JOIN employees b ON t.assigned_by = b.id
       ${whereStr}
       ORDER BY
         CASE t.priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 WHEN 'Low' THEN 4 END,
         t.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      params
    );

    res.status(200).json({
      success: true,
      data: {
        tasks: taskRes.rows,
        pagination: { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) },
      },
    });
  } catch (error: any) {
    console.error('Get tasks error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const getTaskById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const taskRes = await query(
      `SELECT t.*, p.name as project_name, p.client_id,
              a.first_name as assignee_first_name, a.last_name as assignee_last_name, a.email as assignee_email,
              b.first_name as assigner_first_name, b.last_name as assigner_last_name
       FROM tasks t
       LEFT JOIN projects p ON t.project_id = p.id
       LEFT JOIN employees a ON t.assigned_to = a.id
       LEFT JOIN employees b ON t.assigned_by = b.id
       WHERE t.id = $1`,
      [id]
    );

    if (taskRes.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Task not found.' });
      return;
    }

    res.status(200).json({
      success: true,
      data: taskRes.rows[0],
    });
  } catch (error: any) {
    console.error('Get task by ID error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const createTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, description, projectId, assignedTo, priority, status, startDate, dueDate, completionPercentage } = req.body;

    if (!title) {
      res.status(400).json({ success: false, message: 'Task title is required.' });
      return;
    }

    const userId = req.user?.id;
    let assignedByEmpId = null;
    if (userId) {
      const empRes = await query('SELECT id FROM employees WHERE user_id = $1', [userId]);
      if (empRes.rows.length > 0) assignedByEmpId = empRes.rows[0].id;
    }

    const result = await query(
      `INSERT INTO tasks (title, description, project_id, assigned_to, assigned_by, priority, status, start_date, due_date, completion_percentage) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [title, description || null, projectId || null, assignedTo || null, assignedByEmpId, priority || 'Medium', status || 'To Do', startDate || null, dueDate || null, completionPercentage || 0]
    );

    // Create notification for assigned employee
    if (assignedTo) {
      const assigneeUser = await query('SELECT user_id FROM employees WHERE id = $1', [assignedTo]);
      if (assigneeUser.rows.length > 0 && assigneeUser.rows[0].user_id) {
        await query(
          `INSERT INTO notifications (user_id, title, message, type, link) VALUES ($1, $2, $3, $4, $5)`,
          [assigneeUser.rows[0].user_id, 'New Task Assigned', `You have been assigned a new task: ${title}`, 'info', `/tasks/${result.rows[0].id}`]
        );
      }
    }

    res.status(201).json({
      success: true,
      message: 'Task created successfully.',
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Create task error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const updateTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { title, description, projectId, assignedTo, priority, status, startDate, dueDate, completionPercentage } = req.body;

    const existing = await query('SELECT id FROM tasks WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Task not found.' });
      return;
    }

    const result = await query(
      `UPDATE tasks SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        project_id = COALESCE($3, project_id),
        assigned_to = COALESCE($4, assigned_to),
        priority = COALESCE($5, priority),
        status = COALESCE($6, status),
        start_date = COALESCE($7, start_date),
        due_date = COALESCE($8, due_date),
        completion_percentage = COALESCE($9, completion_percentage),
        updated_at = NOW()
       WHERE id = $10 RETURNING *`,
      [title, description, projectId, assignedTo, priority, status, startDate, dueDate, completionPercentage, id]
    );

    res.status(200).json({
      success: true,
      message: 'Task updated successfully.',
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Update task error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const updateTaskStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, completionPercentage } = req.body;

    if (!status) {
      res.status(400).json({ success: false, message: 'Status is required.' });
      return;
    }

    const existing = await query('SELECT id FROM tasks WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Task not found.' });
      return;
    }

    const result = await query(
      `UPDATE tasks SET status = $1, completion_percentage = COALESCE($2, completion_percentage), updated_at = NOW() WHERE id = $3 RETURNING *`,
      [status, completionPercentage !== undefined ? completionPercentage : null, id]
    );

    res.status(200).json({
      success: true,
      message: 'Task status updated.',
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Update task status error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const getMyTasks = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const empRes = await query('SELECT id FROM employees WHERE user_id = $1', [userId]);

    if (empRes.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Employee not found.' });
      return;
    }

    const employeeId = empRes.rows[0].id;
    const status = req.query.status as string;

    let whereClause = 'WHERE t.assigned_to = $1';
    let params: any[] = [employeeId];

    if (status) {
      whereClause += ' AND t.status = $2';
      params.push(status);
    }

    const result = await query(
      `SELECT t.*, p.name as project_name,
              b.first_name as assigner_first_name, b.last_name as assigner_last_name
       FROM tasks t
       LEFT JOIN projects p ON t.project_id = p.id
       LEFT JOIN employees b ON t.assigned_by = b.id
       ${whereClause}
       ORDER BY
         CASE t.priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 WHEN 'Low' THEN 4 END,
         t.due_date ASC NULLS LAST`,
      params
    );

    res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    console.error('Get my tasks error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};
