import { Request, Response } from 'express';
import { query } from '../config/database';

export const getAdminDashboard = async (req: Request, res: Response): Promise<void> => {
  try {
    // Employee stats
    const totalEmployees = await query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE employment_status = 'Active') as active FROM employees`);

    // Department distribution
    const deptDistribution = await query(
      `SELECT d.name, COUNT(e.id) as count FROM departments d LEFT JOIN employees e ON d.id = e.department_id AND e.employment_status = 'Active' GROUP BY d.id, d.name ORDER BY count DESC`
    );

    // Attendance today
    const today = new Date().toISOString().split('T')[0];
    const todayAttendance = await query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'Present') as present,
        COUNT(*) FILTER (WHERE status = 'Absent') as absent,
        COUNT(*) FILTER (WHERE status = 'Late') as late,
        COUNT(*) as total
       FROM attendance WHERE date = $1`,
      [today]
    );

    // Project stats
    const projectStats = await query(
      `SELECT status, COUNT(*) as count FROM projects GROUP BY status`
    );
    const totalProjects = await query('SELECT COUNT(*) as total FROM projects');
    const avgProgress = await query('SELECT ROUND(AVG(progress)::numeric, 1) as avg FROM projects');

    // Task stats
    const taskStats = await query(
      `SELECT status, COUNT(*) as count FROM tasks GROUP BY status`
    );

    // Client stats
    const clientStats = await query(
      `SELECT lead_status, COUNT(*) as count FROM clients GROUP BY lead_status`
    );
    const totalClients = await query('SELECT COUNT(*) as total FROM clients');
    const totalValue = await query('SELECT SUM(project_value) as total FROM clients WHERE project_value IS NOT NULL');

    // Revenue / budget
    const budgetStats = await query(
      `SELECT SUM(budget) as total_budget, SUM(CASE WHEN status = 'In Progress' THEN budget ELSE 0 END) as active_budget FROM projects WHERE budget IS NOT NULL`
    );

    // Recent activity
    const recentProjects = await query(
      `SELECT p.id, p.name, p.status, p.progress, p.updated_at
       FROM projects p ORDER BY p.updated_at DESC LIMIT 5`
    );

    const upcomingFollowUps = await query(
      `SELECT c.id, c.company_name, c.contact_person, c.follow_up_date, c.lead_status
       FROM clients c WHERE c.follow_up_date >= CURRENT_DATE ORDER BY c.follow_up_date LIMIT 5`
    );

    // Work update submission rate
    const workUpdateRate = await query(
      `SELECT COUNT(DISTINCT employee_id) as submitted
       FROM employee_work_updates WHERE date = $1`,
      [today]
    );

    res.status(200).json({
      success: true,
      data: {
        employees: {
          total: parseInt(totalEmployees.rows[0].total),
          active: parseInt(totalEmployees.rows[0].active),
          byDepartment: deptDistribution.rows,
        },
        attendance: {
          today: todayAttendance.rows[0],
        },
        projects: {
          total: parseInt(totalProjects.rows[0].total),
          avgProgress: parseFloat(avgProgress.rows[0]?.avg || '0'),
          byStatus: projectStats.rows,
          budget: budgetStats.rows[0],
        },
        tasks: {
          byStatus: taskStats.rows,
        },
        clients: {
          total: parseInt(totalClients.rows[0].total),
          totalValue: parseFloat(totalValue.rows[0]?.total || '0'),
          byLeadStatus: clientStats.rows,
        },
        workUpdates: {
          submittedToday: parseInt(workUpdateRate.rows[0]?.submitted || '0'),
        },
        recentProjects: recentProjects.rows,
        upcomingFollowUps: upcomingFollowUps.rows,
      },
    });
  } catch (error: any) {
    console.error('Get admin dashboard error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const getHRDashboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Employee summary
    const empSummary = await query(
      `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE employment_status = 'Active') as active,
              COUNT(*) FILTER (WHERE employment_status = 'Inactive') as inactive
       FROM employees`
    );

    // Recent joins (last 30 days)
    const recentJoinees = await query(
      `SELECT e.first_name, e.last_name, e.employee_id, e.date_of_joining, d.name as department_name
       FROM employees e LEFT JOIN departments d ON e.department_id = d.id
       WHERE e.date_of_joining >= CURRENT_DATE - INTERVAL '30 days'
       ORDER BY e.date_of_joining DESC`
    );

    // Attendance today
    const todayAttendance = await query(
      `SELECT COUNT(*) FILTER (WHERE status = 'Present') as present,
              COUNT(*) FILTER (WHERE status = 'Absent') as absent,
              COUNT(*) FILTER (WHERE status = 'Late') as late,
              COUNT(*) as total
       FROM attendance WHERE date = $1`,
      [today]
    );

    // Work update submission rate
    const workUpdateSubmission = await query(
      `SELECT COUNT(DISTINCT employee_id) as submitted FROM employee_work_updates WHERE date = $1`,
      [today]
    );

    const activeEmpCount = await query(`SELECT COUNT(*) as count FROM employees WHERE employment_status = 'Active'`);

    // Attendance trend (last 7 days)
    const attendanceTrend = await query(
      `SELECT date,
              COUNT(*) FILTER (WHERE status = 'Present') as present,
              COUNT(*) FILTER (WHERE status = 'Absent') as absent,
              COUNT(*) FILTER (WHERE status = 'Late') as late
       FROM attendance
       WHERE date >= CURRENT_DATE - INTERVAL '7 days'
       GROUP BY date ORDER BY date`
    );

    // Department attendance
    const deptAttendance = await query(
      `SELECT d.name,
              COUNT(*) FILTER (WHERE a.status = 'Present') as present,
              COUNT(*) FILTER (WHERE a.status = 'Absent') as absent
       FROM attendance a
       JOIN employees e ON a.employee_id = e.id
       JOIN departments d ON e.department_id = d.id
       WHERE a.date = $1
       GROUP BY d.id, d.name`,
      [today]
    );

    // Upcoming birthdays
    const upcomingBirthdays = await query(
      `SELECT first_name, last_name, employee_id, date_of_birth
       FROM employees
       WHERE employment_status = 'Active' AND date_of_birth IS NOT NULL
       AND EXTRACT(MONTH FROM date_of_birth) = EXTRACT(MONTH FROM CURRENT_DATE + INTERVAL '7 days')
       AND EXTRACT(DAY FROM date_of_birth) >= EXTRACT(DAY FROM CURRENT_DATE)
       AND EXTRACT(DAY FROM date_of_birth) <= EXTRACT(DAY FROM CURRENT_DATE + INTERVAL '7 days')
       ORDER BY EXTRACT(MONTH FROM date_of_birth), EXTRACT(DAY FROM date_of_birth)`
    );

    res.status(200).json({
      success: true,
      data: {
        employees: {
          ...empSummary.rows[0],
          total: parseInt(empSummary.rows[0].total),
          active: parseInt(empSummary.rows[0].active),
          inactive: parseInt(empSummary.rows[0].inactive),
        },
        attendance: {
          today: todayAttendance.rows[0],
          trend: attendanceTrend.rows,
          byDepartment: deptAttendance.rows,
        },
        workUpdates: {
          submittedToday: parseInt(workUpdateSubmission.rows[0]?.submitted || '0'),
          totalActive: parseInt(activeEmpCount.rows[0]?.count || '0'),
        },
        recentJoinees: recentJoinees.rows,
        upcomingBirthdays: upcomingBirthdays.rows,
      },
    });
  } catch (error: any) {
    console.error('Get HR dashboard error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const getEmployeeDashboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const empRes = await query('SELECT id, first_name, last_name, employee_id, department_id, designation_id, date_of_joining FROM employees WHERE user_id = $1', [userId]);

    if (empRes.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Employee not found.' });
      return;
    }

    const employee = empRes.rows[0];
    const today = new Date().toISOString().split('T')[0];

    // Today's attendance
    const todayAttendance = await query(
      'SELECT * FROM attendance WHERE employee_id = $1 AND date = $2',
      [employee.id, today]
    );

    // Attendance summary (current month)
    const monthAttendance = await query(
      `SELECT COUNT(*) FILTER (WHERE status = 'Present') as present,
              COUNT(*) FILTER (WHERE status = 'Absent') as absent,
              COUNT(*) FILTER (WHERE status = 'Late') as late
       FROM attendance
       WHERE employee_id = $1 AND EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(YEAR FROM date) = EXTRACT(YEAR FROM CURRENT_DATE)`,
      [employee.id]
    );

    // My tasks
    const myTasks = await query(
      `SELECT t.*, p.name as project_name
       FROM tasks t LEFT JOIN projects p ON t.project_id = p.id
       WHERE t.assigned_to = $1
       ORDER BY CASE t.priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 WHEN 'Low' THEN 4 END`,
      [employee.id]
    );

    const taskStats = await query(
      `SELECT status, COUNT(*) as count FROM tasks WHERE assigned_to = $1 GROUP BY status`,
      [employee.id]
    );

    // Recent work updates
    const recentUpdates = await query(
      'SELECT * FROM employee_work_updates WHERE employee_id = $1 ORDER BY date DESC LIMIT 5',
      [employee.id]
    );

    // Recent projects
    const myProjects = await query(
      `SELECT p.id, p.name, p.status, p.progress, pm.role
       FROM project_members pm
       JOIN projects p ON pm.project_id = p.id
       WHERE pm.employee_id = $1
       ORDER BY p.updated_at DESC`,
      [employee.id]
    );

    // Unread notifications
    const unreadNotifs = await query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false',
      [userId]
    );

    res.status(200).json({
      success: true,
      data: {
        employee: {
          name: `${employee.first_name} ${employee.last_name}`,
          employeeId: employee.employee_id,
          dateOfJoining: employee.date_of_joining,
        },
        attendance: {
          today: todayAttendance.rows[0] || null,
          thisMonth: monthAttendance.rows[0],
        },
        tasks: {
          total: myTasks.rows.length,
          byStatus: taskStats.rows,
          items: myTasks.rows,
        },
        recentWorkUpdates: recentUpdates.rows,
        projects: myProjects.rows,
        unreadNotifications: parseInt(unreadNotifs.rows[0].count),
      },
    });
  } catch (error: any) {
    console.error('Get employee dashboard error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};
