import { Request, Response } from 'express';
import { query } from '../config/database';

export const getProjects = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || '';
    const status = req.query.status as string;
    const priority = req.query.priority as string;
    const offset = (page - 1) * limit;

    let whereClauses: string[] = [];
    let params: any[] = [];
    let paramIdx = 1;

    if (search) {
      whereClauses.push(`(p.name ILIKE $${paramIdx} OR p.description ILIKE $${paramIdx})`);
      params.push(`%${search}%`);
      paramIdx++;
    }

    if (status) {
      whereClauses.push(`p.status = $${paramIdx}`);
      params.push(status);
      paramIdx++;
    }

    if (priority) {
      whereClauses.push(`p.priority = $${paramIdx}`);
      params.push(priority);
      paramIdx++;
    }

    const whereStr = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const countRes = await query(`SELECT COUNT(*) FROM projects p ${whereStr}`, params);
    const totalCount = parseInt(countRes.rows[0].count);

    params.push(limit, offset);
    const projRes = await query(
      `SELECT p.*, c.company_name as client_name, c.contact_person,
              e.first_name as pm_first_name, e.last_name as pm_last_name
       FROM projects p
       LEFT JOIN clients c ON p.client_id = c.id
       LEFT JOIN employees e ON p.project_manager_id = e.id
       ${whereStr}
       ORDER BY p.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      params
    );

    // Get member count for each project
    for (const project of projRes.rows) {
      const memberCount = await query('SELECT COUNT(*) as count FROM project_members WHERE project_id = $1', [project.id]);
      project.memberCount = parseInt(memberCount.rows[0].count);

      const members = await query(
        `SELECT pm.role, e.first_name, e.last_name, e.employee_id
         FROM project_members pm
         JOIN employees e ON pm.employee_id = e.id
         WHERE pm.project_id = $1`,
        [project.id]
      );
      project.members = members.rows;
    }

    res.status(200).json({
      success: true,
      data: {
        projects: projRes.rows,
        pagination: { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) },
      },
    });
  } catch (error: any) {
    console.error('Get projects error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const getProjectById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const projRes = await query(
      `SELECT p.*, c.company_name as client_name, c.contact_person, c.email as client_email, c.phone as client_phone,
              e.first_name as pm_first_name, e.last_name as pm_last_name, e.email as pm_email
       FROM projects p
       LEFT JOIN clients c ON p.client_id = c.id
       LEFT JOIN employees e ON p.project_manager_id = e.id
       WHERE p.id = $1`,
      [id]
    );

    if (projRes.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Project not found.' });
      return;
    }

    const project = projRes.rows[0];

    const membersRes = await query(
      `SELECT pm.*, e.first_name, e.last_name, e.email, e.employee_id, d.name as department_name
       FROM project_members pm
       JOIN employees e ON pm.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE pm.project_id = $1`,
      [id]
    );

    const tasksRes = await query(
      `SELECT t.*, e.first_name as assignee_first_name, e.last_name as assignee_last_name
       FROM tasks t
       LEFT JOIN employees e ON t.assigned_to = e.id
       WHERE t.project_id = $1
       ORDER BY t.created_at DESC`,
      [id]
    );

    res.status(200).json({
      success: true,
      data: {
        ...project,
        members: membersRes.rows,
        tasks: tasksRes.rows,
      },
    });
  } catch (error: any) {
    console.error('Get project by ID error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const createProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, clientId, description, startDate, expectedEndDate, status, priority, projectManagerId, budget } = req.body;

    if (!name) {
      res.status(400).json({ success: false, message: 'Project name is required.' });
      return;
    }

    const result = await query(
      `INSERT INTO projects (name, client_id, description, start_date, expected_end_date, status, priority, project_manager_id, budget) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [name, clientId || null, description || null, startDate || null, expectedEndDate || null, status || 'Not Started', priority || 'Medium', projectManagerId || null, budget || null]
    );

    res.status(201).json({
      success: true,
      message: 'Project created successfully.',
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Create project error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const updateProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, clientId, description, startDate, expectedEndDate, actualEndDate, status, priority, projectManagerId, budget, progress } = req.body;

    const existing = await query('SELECT id FROM projects WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Project not found.' });
      return;
    }

    const result = await query(
      `UPDATE projects SET
        name = COALESCE($1, name),
        client_id = COALESCE($2, client_id),
        description = COALESCE($3, description),
        start_date = COALESCE($4, start_date),
        expected_end_date = COALESCE($5, expected_end_date),
        actual_end_date = COALESCE($6, actual_end_date),
        status = COALESCE($7, status),
        priority = COALESCE($8, priority),
        project_manager_id = COALESCE($9, project_manager_id),
        budget = COALESCE($10, budget),
        progress = COALESCE($11, progress),
        updated_at = NOW()
       WHERE id = $12 RETURNING *`,
      [name, clientId, description, startDate, expectedEndDate, actualEndDate, status, priority, projectManagerId, budget, progress, id]
    );

    res.status(200).json({
      success: true,
      message: 'Project updated successfully.',
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Update project error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const assignMembers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { employees, action } = req.body; // action: 'add' or 'remove'

    const existing = await query('SELECT id FROM projects WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Project not found.' });
      return;
    }

    if (action === 'remove') {
      for (const emp of employees) {
        await query('DELETE FROM project_members WHERE project_id = $1 AND employee_id = $2', [id, emp.employeeId]);
      }
    } else {
      for (const emp of employees) {
        await query(
          `INSERT INTO project_members (project_id, employee_id, role) VALUES ($1, $2, $3) ON CONFLICT (project_id, employee_id) DO UPDATE SET role = $3`,
          [id, emp.employeeId, emp.role || 'Member']
        );
      }
    }

    const membersRes = await query(
      `SELECT pm.*, e.first_name, e.last_name, e.employee_id
       FROM project_members pm
       JOIN employees e ON pm.employee_id = e.id
       WHERE pm.project_id = $1`,
      [id]
    );

    res.status(200).json({
      success: true,
      message: `Members ${action === 'remove' ? 'removed' : 'added'} successfully.`,
      data: membersRes.rows,
    });
  } catch (error: any) {
    console.error('Assign members error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const getProjectStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const totalRes = await query('SELECT COUNT(*) as total FROM projects');
    const statusRes = await query('SELECT status, COUNT(*) as count FROM projects GROUP BY status');
    const priorityRes = await query('SELECT priority, COUNT(*) as count FROM projects GROUP BY priority');
    const budgetRes = await query('SELECT SUM(budget) as total_budget, AVG(budget) as avg_budget FROM projects WHERE budget IS NOT NULL');
    const progressRes = await query('SELECT ROUND(AVG(progress)::numeric, 1) as avg_progress FROM projects');

    const recentProjects = await query(
      `SELECT p.id, p.name, p.status, p.progress, c.company_name as client_name
       FROM projects p LEFT JOIN clients c ON p.client_id = c.id
       ORDER BY p.updated_at DESC LIMIT 5`
    );

    res.status(200).json({
      success: true,
      data: {
        total: parseInt(totalRes.rows[0].total),
        byStatus: statusRes.rows,
        byPriority: priorityRes.rows,
        budget: budgetRes.rows[0],
        avgProgress: parseFloat(progressRes.rows[0]?.avg_progress || '0'),
        recentProjects: recentProjects.rows,
      },
    });
  } catch (error: any) {
    console.error('Get project stats error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};
