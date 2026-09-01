import { Request, Response } from 'express';
import { query } from '../config/database';
import { calculateWorkingHours, isLateCheckIn, calculateLateMinutes, reverseGeocode } from '../utils/helpers';

export const checkIn = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    const latitude = req.body.latitude != null ? parseFloat(req.body.latitude) : null;
    const longitude = req.body.longitude != null ? parseFloat(req.body.longitude) : null;

    const empRes = await query('SELECT id FROM employees WHERE user_id = $1', [userId]);
    if (empRes.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Employee not found.' });
      return;
    }

    const employeeId = empRes.rows[0].id;
    const today = new Date().toISOString().split('T')[0];

    // Check if already checked in today
    const existing = await query(
      'SELECT id, check_in_time FROM attendance WHERE employee_id = $1 AND date = $2',
      [employeeId, today]
    );

    if (existing.rows.length > 0) {
      res.status(400).json({ success: false, message: 'Already checked in today.' });
      return;
    }

    // Check if late (after 10:15 AM)
    const now = new Date();
    const isLate = isLateCheckIn(now);
    const lateMinutes = calculateLateMinutes(now);

    const status = isLate ? 'Late' : 'Present';

    const address = latitude != null && longitude != null ? await reverseGeocode(latitude, longitude) : null;

    const result = await query(
      `INSERT INTO attendance (employee_id, date, check_in_time, status, is_late, late_minutes, check_in_latitude, check_in_longitude, check_in_address) VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, $8) RETURNING *`,
      [employeeId, today, status, isLate, lateMinutes, latitude, longitude, address]
    );

    res.status(201).json({
      success: true,
      message: isLate ? `Checked in late (by ${lateMinutes} minute${lateMinutes === 1 ? '' : 's'}). Welcome!` : 'Checked in successfully. Welcome!',
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Check in error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const checkOut = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Not authenticated.' });
      return;
    }

    const empRes = await query('SELECT id FROM employees WHERE user_id = $1', [userId]);
    if (empRes.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Employee not found.' });
      return;
    }

    const employeeId = empRes.rows[0].id;
    const today = new Date().toISOString().split('T')[0];

    const latitude = req.body.latitude != null ? parseFloat(req.body.latitude) : null;
    const longitude = req.body.longitude != null ? parseFloat(req.body.longitude) : null;

    const existing = await query(
      'SELECT id, check_in_time, check_out_time FROM attendance WHERE employee_id = $1 AND date = $2',
      [employeeId, today]
    );

    if (existing.rows.length === 0) {
      res.status(400).json({ success: false, message: 'No check-in found for today. Please check in first.' });
      return;
    }

    if (existing.rows[0].check_out_time) {
      res.status(400).json({ success: false, message: 'Already checked out today.' });
      return;
    }

    const checkInTime = existing.rows[0].check_in_time;
    const workingHours = calculateWorkingHours(checkInTime, new Date());

    const address = latitude != null && longitude != null ? await reverseGeocode(latitude, longitude) : null;

    const result = await query(
      `UPDATE attendance SET check_out_time = NOW(), working_hours = $1, check_out_latitude = $2, check_out_longitude = $3, check_out_address = $4, updated_at = NOW() WHERE employee_id = $5 AND date = $6 RETURNING *`,
      [workingHours, latitude, longitude, address, employeeId, today]
    );

    res.status(200).json({
      success: true,
      message: `Checked out successfully. You worked ${workingHours} hours today.`,
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error('Check out error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const getAttendance = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 30;
    const employeeId = req.query.employeeId as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const status = req.query.status as string;
    const department = req.query.department as string;
    const offset = (page - 1) * limit;

    let whereClauses: string[] = [];
    let params: any[] = [];
    let paramIdx = 1;

    // If employee role, only show own attendance
    if (req.user?.role === 'employee' && !employeeId) {
      const empRes = await query('SELECT id FROM employees WHERE user_id = $1', [req.user.id]);
      if (empRes.rows.length > 0) {
        whereClauses.push(`a.employee_id = $${paramIdx}`);
        params.push(empRes.rows[0].id);
        paramIdx++;
      }
    } else if (employeeId) {
      whereClauses.push(`a.employee_id = $${paramIdx}`);
      params.push(employeeId);
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

    if (startDate) {
      whereClauses.push(`a.date >= $${paramIdx}`);
      params.push(startDate);
      paramIdx++;
    }

    if (endDate) {
      whereClauses.push(`a.date <= $${paramIdx}`);
      params.push(endDate);
      paramIdx++;
    }

    if (status) {
      whereClauses.push(`a.status = $${paramIdx}`);
      params.push(status);
      paramIdx++;
    }

    const whereStr = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const countRes = await query(`SELECT COUNT(*) FROM attendance a JOIN employees e ON a.employee_id = e.id LEFT JOIN departments d ON e.department_id = d.id ${whereStr}`, params);
    const totalCount = parseInt(countRes.rows[0].count);

    params.push(limit, offset);
    const attRes = await query(
      `SELECT a.*, e.first_name, e.last_name, e.employee_id as emp_code, d.name as department_name
       FROM attendance a
       JOIN employees e ON a.employee_id = e.id
       LEFT JOIN departments d ON e.department_id = d.id
       ${whereStr}
       ORDER BY a.date DESC, a.check_in_time DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      params
    );

    res.status(200).json({
      success: true,
      data: {
        attendance: attRes.rows,
        pagination: { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) },
      },
    });
  } catch (error: any) {
    console.error('Get attendance error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const getAttendanceReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const departmentId = req.query.departmentId as string;

    let empWhere = '';
    let params: any[] = [year, month];
    let paramIdx = 3;

    if (departmentId) {
      empWhere = `AND e.department_id = $${paramIdx}`;
      params.push(parseInt(departmentId));
      paramIdx++;
    }

    const reportRes = await query(
      `SELECT e.id, e.employee_id, e.first_name, e.last_name, d.name as department_name,
              COUNT(a.id) as total_days,
              COUNT(*) FILTER (WHERE a.status = 'Present') as present_days,
              COUNT(*) FILTER (WHERE a.status = 'Absent') as absent_days,
              COUNT(*) FILTER (WHERE a.status = 'Late') as late_days,
              COUNT(*) FILTER (WHERE a.status = 'Half Day') as half_day,
              ROUND(AVG(a.working_hours)::numeric, 2) as avg_working_hours,
              SUM(a.working_hours) as total_working_hours
       FROM employees e
       LEFT JOIN attendance a ON e.id = a.employee_id AND EXTRACT(MONTH FROM a.date) = $2 AND EXTRACT(YEAR FROM a.date) = $1
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE e.employment_status = 'Active' ${empWhere}
       GROUP BY e.id, e.employee_id, e.first_name, e.last_name, d.name
       ORDER BY e.first_name`,
      params
    );

    const summaryRes = await query(
      `SELECT
        COUNT(DISTINCT a.employee_id) as total_employees,
        COUNT(*) as total_records,
        COUNT(*) FILTER (WHERE a.status = 'Present') as total_present,
        COUNT(*) FILTER (WHERE a.status = 'Absent') as total_absent,
        COUNT(*) FILTER (WHERE a.status = 'Late') as total_late,
        ROUND(AVG(a.working_hours)::numeric, 2) as avg_working_hours
       FROM attendance a
       JOIN employees e ON a.employee_id = e.id
       WHERE EXTRACT(MONTH FROM a.date) = $1 AND EXTRACT(YEAR FROM a.date) = $2 ${departmentId ? `AND e.department_id = $3` : ''}`,
      departmentId ? [month, year, parseInt(departmentId)] : [month, year]
    );

    res.status(200).json({
      success: true,
      data: {
        month,
        year,
        summary: summaryRes.rows[0],
        employees: reportRes.rows,
      },
    });
  } catch (error: any) {
    console.error('Get attendance report error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const markAttendance = async (req: Request, res: Response): Promise<void> => {
  try {
    const { employeeId, date, status, checkInTime, checkOutTime, notes } = req.body;

    if (!employeeId || !date || !status) {
      res.status(400).json({ success: false, message: 'employeeId, date, and status are required.' });
      return;
    }

    // Check if record exists
    const existing = await query(
      'SELECT id FROM attendance WHERE employee_id = $1 AND date = $2',
      [employeeId, date]
    );

    let workingHours = 0;
    if (checkInTime && checkOutTime) {
      workingHours = calculateWorkingHours(checkInTime, checkOutTime);
    }

    // Auto-mark as Late when the provided/effective check-in time is after 10:15 AM
    let isLate = false;
    let lateMinutes = 0;
    const effectiveCheckIn = checkInTime || (existing.rows.length > 0 ? existing.rows[0].check_in_time : null);
    if (effectiveCheckIn) {
      isLate = isLateCheckIn(effectiveCheckIn);
      lateMinutes = calculateLateMinutes(effectiveCheckIn);
    }
    const effectiveStatus = String(status).toLowerCase() === 'present' && isLate ? 'Late' : status;

    if (existing.rows.length > 0) {
      const result = await query(
        `UPDATE attendance SET status = $1, check_in_time = COALESCE($2, check_in_time), check_out_time = COALESCE($3, check_out_time), working_hours = $4, is_late = $5, late_minutes = $6, notes = COALESCE($7, notes), updated_at = NOW() WHERE employee_id = $8 AND date = $9 RETURNING *`,
        [effectiveStatus, checkInTime || null, checkOutTime || null, workingHours, isLate, lateMinutes, notes || null, employeeId, date]
      );
      res.status(200).json({ success: true, message: 'Attendance updated.', data: result.rows[0] });
    } else {
      const result = await query(
        `INSERT INTO attendance (employee_id, date, status, check_in_time, check_out_time, working_hours, is_late, late_minutes, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [employeeId, date, effectiveStatus, checkInTime || null, checkOutTime || null, workingHours, isLate, lateMinutes, notes || null]
      );
      res.status(201).json({ success: true, message: 'Attendance marked.', data: result.rows[0] });
    }
  } catch (error: any) {
    console.error('Mark attendance error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};
