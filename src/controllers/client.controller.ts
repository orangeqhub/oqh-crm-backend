import { Request, Response } from 'express';
import { query } from '../config/database';
import { generateClientCode } from '../utils/helpers';

export const getClients = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || '';
    const status = req.query.status as string;
    const leadStatus = req.query.leadStatus as string;
    const industry = req.query.industry as string;
    const department = req.query.department as string;
    const offset = (page - 1) * limit;

    let whereClauses: string[] = [];
    let params: any[] = [];
    let paramIdx = 1;

    if (search) {
      whereClauses.push(`(c.company_name ILIKE $${paramIdx} OR c.contact_person ILIKE $${paramIdx} OR c.client_code ILIKE $${paramIdx} OR c.email ILIKE $${paramIdx})`);
      params.push(`%${search}%`);
      paramIdx++;
    }

    if (status) {
      whereClauses.push(`c.status = $${paramIdx}`);
      params.push(status);
      paramIdx++;
    }

    if (leadStatus) {
      whereClauses.push(`c.lead_status = $${paramIdx}`);
      params.push(leadStatus);
      paramIdx++;
    }

    if (industry) {
      whereClauses.push(`c.industry ILIKE $${paramIdx}`);
      params.push(`%${industry}%`);
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

    const whereStr = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const countRes = await query(`SELECT COUNT(*) FROM clients c LEFT JOIN employees e ON c.assigned_to = e.id LEFT JOIN departments d ON e.department_id = d.id ${whereStr}`, params);
    const totalCount = parseInt(countRes.rows[0].count);

    params.push(limit, offset);
    const clientRes = await query(
      `SELECT c.*, e.first_name as assigned_first_name, e.last_name as assigned_last_name, d.name as assigned_department
       FROM clients c
       LEFT JOIN employees e ON c.assigned_to = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       ${whereStr}
       ORDER BY c.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      params
    );

    res.status(200).json({
      success: true,
      data: {
        clients: clientRes.rows,
        pagination: { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) },
      },
    });
  } catch (error: any) {
    console.error('Get clients error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const getClientById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const clientRes = await query(
      `SELECT c.*, e.first_name as assigned_first_name, e.last_name as assigned_last_name, e.email as assigned_email, d.name as assigned_department
       FROM clients c
       LEFT JOIN employees e ON c.assigned_to = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE c.id = $1`,
      [id]
    );

    if (clientRes.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Client not found.' });
      return;
    }

    const activitiesRes = await query(
      `SELECT ca.*, e.first_name as performed_first_name, e.last_name as performed_last_name
       FROM client_activities ca
       LEFT JOIN employees e ON ca.performed_by = e.id
       WHERE ca.client_id = $1
       ORDER BY ca.created_at DESC`,
      [id]
    );

    const projectsRes = await query(
      `SELECT * FROM projects WHERE client_id = $1 ORDER BY created_at DESC`,
      [id]
    );

    res.status(200).json({
      success: true,
      data: {
        ...clientRes.rows[0],
        activities: activitiesRes.rows,
        projects: projectsRes.rows,
      },
    });
  } catch (error: any) {
    console.error('Get client by ID error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const createClient = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      companyName, contactPerson, email, phone, alternatePhone, website,
      address, city, state, country, industry, servicesRequired,
      projectRequirements, budget, projectValue, leadSource,
      leadStatus, assignedTo, followUpDate, notes
    } = req.body;

    if (!companyName) {
      res.status(400).json({ success: false, message: 'Company name is required.' });
      return;
    }

    const clientCode = generateClientCode();

    const result = await query(
      `INSERT INTO clients (client_code, company_name, contact_person, email, phone, alternate_phone, website, address, city, state, country, industry, services_required, project_requirements, budget, project_value, lead_source, lead_status, assigned_to, follow_up_date, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21) RETURNING *`,
      [clientCode, companyName, contactPerson || null, email || null, phone || null, alternatePhone || null, website || null, address || null, city || null, state || null, country || 'India', industry || null, servicesRequired || null, projectRequirements || null, budget || null, projectValue || null, leadSource || null, leadStatus || 'New', assignedTo || null, followUpDate || null, notes || null]
    );

    // Log activity
    const userId = req.user?.id;
    let empId = null;
    if (userId) {
      const empRes = await query('SELECT id FROM employees WHERE user_id = $1', [userId]);
      if (empRes.rows.length > 0) empId = empRes.rows[0].id;
    }

    await query(
      `INSERT INTO client_activities (client_id, activity_type, description, performed_by) VALUES ($1, $2, $3, $4)`,
      [result.rows[0].id, 'Created', `Client ${companyName} added to system`, empId]
    );

    res.status(201).json({
      success: true,
      message: 'Client created successfully.',
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Create client error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const updateClient = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      companyName, contactPerson, email, phone, alternatePhone, website,
      address, city, state, country, industry, servicesRequired,
      projectRequirements, budget, projectValue, leadSource,
      leadStatus, assignedTo, followUpDate, notes, status
    } = req.body;

    const existing = await query('SELECT id FROM clients WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Client not found.' });
      return;
    }

    const result = await query(
      `UPDATE clients SET
        company_name = COALESCE($1, company_name),
        contact_person = COALESCE($2, contact_person),
        email = COALESCE($3, email),
        phone = COALESCE($4, phone),
        alternate_phone = COALESCE($5, alternate_phone),
        website = COALESCE($6, website),
        address = COALESCE($7, address),
        city = COALESCE($8, city),
        state = COALESCE($9, state),
        country = COALESCE($10, country),
        industry = COALESCE($11, industry),
        services_required = COALESCE($12, services_required),
        project_requirements = COALESCE($13, project_requirements),
        budget = COALESCE($14, budget),
        project_value = COALESCE($15, project_value),
        lead_source = COALESCE($16, lead_source),
        lead_status = COALESCE($17, lead_status),
        assigned_to = COALESCE($18, assigned_to),
        follow_up_date = COALESCE($19, follow_up_date),
        notes = COALESCE($20, notes),
        status = COALESCE($21, status),
        updated_at = NOW()
       WHERE id = $22 RETURNING *`,
      [companyName, contactPerson, email, phone, alternatePhone, website, address, city, state, country, industry, servicesRequired, projectRequirements, budget, projectValue, leadSource, leadStatus, assignedTo, followUpDate, notes, status, id]
    );

    res.status(200).json({
      success: true,
      message: 'Client updated successfully.',
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Update client error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const addClientActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { activityType, description, followUpDate } = req.body;

    const existing = await query('SELECT id FROM clients WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Client not found.' });
      return;
    }

    const userId = req.user?.id;
    let empId = null;
    if (userId) {
      const empRes = await query('SELECT id FROM employees WHERE user_id = $1', [userId]);
      if (empRes.rows.length > 0) empId = empRes.rows[0].id;
    }

    const result = await query(
      `INSERT INTO client_activities (client_id, activity_type, description, performed_by, follow_up_date) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, activityType || 'Note', description || '', empId, followUpDate || null]
    );

    // Update client follow-up date
    if (followUpDate) {
      await query('UPDATE clients SET follow_up_date = $1, updated_at = NOW() WHERE id = $2', [followUpDate, id]);
    }

    res.status(201).json({
      success: true,
      message: 'Activity added successfully.',
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Add client activity error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const getClientActivities = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const countRes = await query('SELECT COUNT(*) FROM client_activities WHERE client_id = $1', [id]);
    const totalCount = parseInt(countRes.rows[0].count);

    const result = await query(
      `SELECT ca.*, e.first_name as performed_first_name, e.last_name as performed_last_name
       FROM client_activities ca
       LEFT JOIN employees e ON ca.performed_by = e.id
       WHERE ca.client_id = $1
       ORDER BY ca.created_at DESC
       LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );

    res.status(200).json({
      success: true,
      data: {
        activities: result.rows,
        pagination: { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) },
      },
    });
  } catch (error: any) {
    console.error('Get client activities error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const getClientStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const totalRes = await query('SELECT COUNT(*) as total FROM clients');
    const statusRes = await query('SELECT lead_status, COUNT(*) as count FROM clients GROUP BY lead_status');
    const industryRes = await query('SELECT industry, COUNT(*) as count FROM clients WHERE industry IS NOT NULL GROUP BY industry ORDER BY count DESC');
    const valueRes = await query('SELECT SUM(project_value) as total_value, AVG(project_value) as avg_value FROM clients WHERE project_value IS NOT NULL');
    const recentClients = await query('SELECT id, client_code, company_name, contact_person, lead_status, created_at FROM clients ORDER BY created_at DESC LIMIT 5');

    res.status(200).json({
      success: true,
      data: {
        total: parseInt(totalRes.rows[0].total),
        byLeadStatus: statusRes.rows,
        byIndustry: industryRes.rows,
        value: valueRes.rows[0],
        recentClients: recentClients.rows,
      },
    });
  } catch (error: any) {
    console.error('Get client stats error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};
