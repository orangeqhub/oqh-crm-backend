import { Request, Response } from 'express';
import { query } from '../config/database';
import { generateCardNumber, generateVerificationToken } from '../utils/helpers';

export const generateIdentityCard = async (req: Request, res: Response): Promise<void> => {
  try {
    const { employeeId } = req.body;

    if (!employeeId) {
      res.status(400).json({ success: false, message: 'Employee ID is required.' });
      return;
    }

    const empRes = await query('SELECT id, first_name, last_name, employee_id, email FROM employees WHERE id = $1', [employeeId]);
    if (empRes.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Employee not found.' });
      return;
    }

    // Check if active card already exists
    const existingCard = await query(
      'SELECT id FROM employee_identity_cards WHERE employee_id = $1 AND is_active = true',
      [employeeId]
    );

    if (existingCard.rows.length > 0) {
      res.status(409).json({ success: false, message: 'Active identity card already exists for this employee.' });
      return;
    }

    const cardNumber = generateCardNumber();
    const verificationToken = generateVerificationToken();

    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);

    const result = await query(
      `INSERT INTO employee_identity_cards (employee_id, card_number, qr_code_url, verification_token, is_active, issued_date, expiry_date) VALUES ($1, $2, $3, $4, true, CURRENT_DATE, $5) RETURNING *`,
      [employeeId, cardNumber, `/verify/${verificationToken}`, verificationToken, expiryDate.toISOString().split('T')[0]]
    );

    res.status(201).json({
      success: true,
      message: 'Identity card generated successfully.',
      data: {
        ...result.rows[0],
        employee: empRes.rows[0],
      },
    });
  } catch (error: any) {
    console.error('Generate identity card error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const getIdentityCards = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const isActive = req.query.isActive as string;
    const offset = (page - 1) * limit;

    let whereClauses: string[] = [];
    let params: any[] = [];
    let paramIdx = 1;

    if (search) {
      whereClauses.push(`(e.first_name ILIKE $${paramIdx} OR e.last_name ILIKE $${paramIdx} OR ic.card_number ILIKE $${paramIdx} OR e.employee_id ILIKE $${paramIdx})`);
      params.push(`%${search}%`);
      paramIdx++;
    }

    if (isActive !== undefined) {
      whereClauses.push(`ic.is_active = $${paramIdx}`);
      params.push(isActive === 'true');
      paramIdx++;
    }

    const whereStr = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const countRes = await query(
      `SELECT COUNT(*) FROM employee_identity_cards ic JOIN employees e ON ic.employee_id = e.id ${whereStr}`,
      params
    );
    const totalCount = parseInt(countRes.rows[0].count);

    params.push(limit, offset);
    const result = await query(
      `SELECT ic.*, e.first_name, e.last_name, e.employee_id as emp_code, e.email, d.name as department_name
       FROM employee_identity_cards ic
       JOIN employees e ON ic.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       ${whereStr}
       ORDER BY ic.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      params
    );

    res.status(200).json({
      success: true,
      data: {
        cards: result.rows,
        pagination: { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) },
      },
    });
  } catch (error: any) {
    console.error('Get identity cards error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const getIdentityCardById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT ic.*, e.first_name, e.last_name, e.employee_id as emp_code, e.email, e.phone, e.gender, e.date_of_birth, e.date_of_joining, d.name as department_name, des.title as designation_title
       FROM employee_identity_cards ic
       JOIN employees e ON ic.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN designations des ON e.designation_id = des.id
       WHERE ic.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Identity card not found.' });
      return;
    }

    res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Get identity card by ID error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const deactivateIdentityCard = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const existing = await query('SELECT id FROM employee_identity_cards WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Identity card not found.' });
      return;
    }

    const result = await query(
      `UPDATE employee_identity_cards SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );

    res.status(200).json({
      success: true,
      message: 'Identity card deactivated successfully.',
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Deactivate identity card error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const verifyEmployee = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;

    const result = await query(
      `SELECT ic.*, e.first_name, e.last_name, e.employee_id as emp_code, e.email, e.phone, e.gender, e.date_of_birth, e.date_of_joining, e.employment_status, d.name as department_name, des.title as designation_title
       FROM employee_identity_cards ic
       JOIN employees e ON ic.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN designations des ON e.designation_id = des.id
       WHERE ic.verification_token = $1 AND ic.is_active = true`,
      [token]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        verified: false,
        message: 'Invalid or deactivated verification token.',
      });
      return;
    }

    const card = result.rows[0];

    res.status(200).json({
      success: true,
      verified: true,
      data: {
        name: `${card.first_name} ${card.last_name}`,
        employeeId: card.emp_code,
        department: card.department_name,
        designation: card.designation_title,
        cardNumber: card.card_number,
        issuedDate: card.issued_date,
        expiryDate: card.expiry_date,
        status: card.employment_status,
      },
    });
  } catch (error: any) {
    console.error('Verify employee error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};
