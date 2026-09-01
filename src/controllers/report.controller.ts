import { Request, Response } from 'express';
import { query } from '../config/database';

export const getAttendanceReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const departmentId = req.query.departmentId as string;

    let deptFilter = '';
    const params: any[] = [year, month];
    let paramIdx = 3;

    if (departmentId) {
      deptFilter = `AND e.department_id = $${paramIdx}`;
      params.push(parseInt(departmentId));
      paramIdx++;
    }

    const report = await query(
      `SELECT e.id, e.employee_id, e.first_name, e.last_name, d.name as department_name,
              COUNT(a.*) FILTER (WHERE a.status = 'Present') as present_days,
              COUNT(a.*) FILTER (WHERE a.status = 'Absent') as absent_days,
              COUNT(a.*) FILTER (WHERE a.status = 'Late') as late_days,
              COUNT(a.*) FILTER (WHERE a.status = 'Half Day') as half_days,
              ROUND(AVG(a.working_hours)::numeric, 2) as avg_hours,
              SUM(a.working_hours) as total_hours
       FROM employees e
       LEFT JOIN attendance a ON e.id = a.employee_id AND EXTRACT(MONTH FROM a.date) = $2 AND EXTRACT(YEAR FROM a.date) = $1
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE e.employment_status = 'Active' ${deptFilter}
       GROUP BY e.id, e.employee_id, e.first_name, e.last_name, d.name
       ORDER BY d.name, e.first_name`,
      params
    );

    const summary = await query(
      `SELECT
        COUNT(DISTINCT a.employee_id) as employees_with_data,
        ROUND(AVG(a.working_hours)::numeric, 2) as overall_avg_hours,
        COUNT(*) FILTER (WHERE a.status = 'Present') as total_present,
        COUNT(*) FILTER (WHERE a.status = 'Absent') as total_absent,
        COUNT(*) FILTER (WHERE a.status = 'Late') as total_late
       FROM attendance a
       JOIN employees e ON a.employee_id = e.id
       WHERE EXTRACT(MONTH FROM a.date) = $1 AND EXTRACT(YEAR FROM a.date) = $2 ${departmentId ? `AND e.department_id = $3` : ''}`,
      departmentId ? [month, year, parseInt(departmentId)] : [month, year]
    );

    res.status(200).json({
      success: true,
      data: {
        month, year,
        summary: summary.rows[0],
        details: report.rows,
      },
    });
  } catch (error: any) {
    console.error('Get attendance report error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const getEmployeeReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const departmentId = req.query.departmentId as string;

    let deptFilter = '';
    const params: any[] = [];
    let paramIdx = 1;

    if (departmentId) {
      deptFilter = `WHERE e.department_id = $${paramIdx}`;
      params.push(parseInt(departmentId));
      paramIdx++;
    }

    const byDepartment = await query(
      `SELECT d.name, COUNT(e.id) as count FROM departments d LEFT JOIN employees e ON d.id = e.department_id AND e.employment_status = 'Active' GROUP BY d.id, d.name ORDER BY count DESC`
    );

    const byDesignation = await query(
      `SELECT des.title, COUNT(e.id) as count FROM designations des LEFT JOIN employees e ON des.id = e.designation_id AND e.employment_status = 'Active' GROUP BY des.id, des.title ORDER BY count DESC`
    );

    const byGender = await query(
      `SELECT gender, COUNT(*) as count FROM employees WHERE employment_status = 'Active' AND gender IS NOT NULL GROUP BY gender`
    );

    const byEmploymentType = await query(
      `SELECT employment_type, COUNT(*) as count FROM employees WHERE employment_status = 'Active' GROUP BY employment_type`
    );

    const recentJoinees = await query(
      `SELECT e.first_name, e.last_name, e.employee_id, e.date_of_joining, d.name as department_name
       FROM employees e LEFT JOIN departments d ON e.department_id = d.id
       WHERE e.employment_status = 'Active' ORDER BY e.date_of_joining DESC LIMIT 10`
    );

    const totalActive = await query(`SELECT COUNT(*) as count FROM employees WHERE employment_status = 'Active'`);

    res.status(200).json({
      success: true,
      data: {
        totalActive: parseInt(totalActive.rows[0].count),
        byDepartment: byDepartment.rows,
        byDesignation: byDesignation.rows,
        byGender: byGender.rows,
        byEmploymentType: byEmploymentType.rows,
        recentJoinees: recentJoinees.rows,
      },
    });
  } catch (error: any) {
    console.error('Get employee report error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const getClientReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const byStatus = await query('SELECT lead_status, COUNT(*) as count FROM clients GROUP BY lead_status ORDER BY count DESC');
    const byIndustry = await query('SELECT industry, COUNT(*) as count FROM clients WHERE industry IS NOT NULL GROUP BY industry ORDER BY count DESC');
    const totalValue = await query('SELECT SUM(project_value) as total, AVG(project_value) as average FROM clients WHERE project_value IS NOT NULL');
    const bySource = await query('SELECT lead_source, COUNT(*) as count FROM clients WHERE lead_source IS NOT NULL GROUP BY lead_source ORDER BY count DESC');

    const recentClients = await query(
      `SELECT id, client_code, company_name, contact_person, lead_status, project_value, created_at
       FROM clients ORDER BY created_at DESC LIMIT 10`
    );

    res.status(200).json({
      success: true,
      data: {
        byStatus: byStatus.rows,
        byIndustry: byIndustry.rows,
        bySource: bySource.rows,
        totalValue: totalValue.rows[0],
        recentClients: recentClients.rows,
      },
    });
  } catch (error: any) {
    console.error('Get client report error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const getProjectReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const byStatus = await query('SELECT status, COUNT(*) as count FROM projects GROUP BY status ORDER BY count DESC');
    const byPriority = await query('SELECT priority, COUNT(*) as count FROM projects GROUP BY priority ORDER BY count DESC');
    const budgetStats = await query('SELECT SUM(budget) as total_budget, AVG(budget) as avg_budget, COUNT(*) as with_budget FROM projects WHERE budget IS NOT NULL');
    const avgProgress = await query('SELECT ROUND(AVG(progress)::numeric, 1) as avg_progress FROM projects');

    const projectsWithTasks = await query(
      `SELECT p.name, p.status, p.progress, COUNT(t.id) as task_count,
              COUNT(t.id) FILTER (WHERE t.status = 'Done') as completed_tasks
       FROM projects p LEFT JOIN tasks t ON p.id = t.project_id
       GROUP BY p.id, p.name, p.status, p.progress ORDER BY p.name`
    );

    res.status(200).json({
      success: true,
      data: {
        byStatus: byStatus.rows,
        byPriority: byPriority.rows,
        budgetStats: budgetStats.rows[0],
        avgProgress: parseFloat(avgProgress.rows[0]?.avg_progress || '0'),
        projectsWithTasks: projectsWithTasks.rows,
      },
    });
  } catch (error: any) {
    console.error('Get project report error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};

export const exportCSV = async (req: Request, res: Response): Promise<void> => {
  try {
    const type = req.query.type as string;
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();

    let csvData = '';
    let filename = '';

    switch (type) {
      case 'attendance': {
        filename = `attendance_report_${year}_${month}.csv`;
        const data = await query(
          `SELECT e.employee_id, e.first_name, e.last_name, d.name as department,
                  a.date, a.status, a.check_in_time, a.check_out_time, a.working_hours, a.is_late
           FROM attendance a
           JOIN employees e ON a.employee_id = e.id
           LEFT JOIN departments d ON e.department_id = d.id
           WHERE EXTRACT(MONTH FROM a.date) = $1 AND EXTRACT(YEAR FROM a.date) = $2
           ORDER BY e.first_name, a.date`,
          [month, year]
        );
        csvData = 'Employee ID,First Name,Last Name,Department,Date,Status,Check In,Check Out,Working Hours,Late\n';
        for (const row of data.rows) {
          csvData += `"${row.employee_id}","${row.first_name}","${row.last_name}","${row.department || ''}","${row.date}","${row.status}","${row.check_in_time || ''}","${row.check_out_time || ''}","${row.working_hours}","${row.is_late}"\n`;
        }
        break;
      }
      case 'employees': {
        filename = 'employees_report.csv';
        const data = await query(
          `SELECT e.employee_id, e.first_name, e.last_name, e.email, e.phone, e.gender,
                  d.name as department, des.title as designation, e.date_of_joining, e.employment_type, e.employment_status
           FROM employees e
           LEFT JOIN departments d ON e.department_id = d.id
           LEFT JOIN designations des ON e.designation_id = des.id
           ORDER BY e.first_name`
        );
        csvData = 'Employee ID,First Name,Last Name,Email,Phone,Gender,Department,Designation,Date of Joining,Type,Status\n';
        for (const row of data.rows) {
          csvData += `"${row.employee_id}","${row.first_name}","${row.last_name}","${row.email}","${row.phone || ''}","${row.gender || ''}","${row.department || ''}","${row.designation || ''}","${row.date_of_joining || ''}","${row.employment_type}","${row.employment_status}"\n`;
        }
        break;
      }
      case 'clients': {
        filename = 'clients_report.csv';
        const data = await query(
          `SELECT client_code, company_name, contact_person, email, phone, industry, lead_status, project_value, lead_source
           FROM clients ORDER BY company_name`
        );
        csvData = 'Client Code,Company,Contact Person,Email,Phone,Industry,Lead Status,Project Value,Lead Source\n';
        for (const row of data.rows) {
          csvData += `"${row.client_code}","${row.company_name}","${row.contact_person || ''}","${row.email || ''}","${row.phone || ''}","${row.industry || ''}","${row.lead_status}","${row.project_value || ''}","${row.lead_source || ''}"\n`;
        }
        break;
      }
      case 'projects': {
        filename = 'projects_report.csv';
        const data = await query(
          `SELECT p.name, c.company_name as client, p.status, p.priority, p.progress, p.budget, p.start_date, p.expected_end_date
           FROM projects p LEFT JOIN clients c ON p.client_id = c.id ORDER BY p.name`
        );
        csvData = 'Project,Client,Status,Priority,Progress,Budget,Start Date,Expected End Date\n';
        for (const row of data.rows) {
          csvData += `"${row.name}","${row.client || ''}","${row.status}","${row.priority}","${row.progress}","${row.budget || ''}","${row.start_date || ''}","${row.expected_end_date || ''}"\n`;
        }
        break;
      }
      default:
        res.status(400).json({ success: false, message: 'Invalid export type. Use: attendance, employees, clients, projects' });
        return;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csvData);
  } catch (error: any) {
    console.error('Export CSV error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};
