import { Request, Response } from 'express';
import { query } from '../config/database';

function getSalaryPeriod(year: number, month: number): { start: string; end: string } {
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const start = `${prevYear}-${String(prevMonth).padStart(2, '0')}-25`;
  const end = `${year}-${String(month).padStart(2, '0')}-25`;
  return { start, end };
}

function countWorkingDays(start: string, end: string): number {
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  let count = 0;
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0) count++;
  }
  return count;
}

export const getSalaryAnalysis = async (req: Request, res: Response): Promise<void> => {
  try {
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();

    const { start, end } = getSalaryPeriod(year, month);
    const workingDays = countWorkingDays(start, end);

    const empRes = await query(
      `SELECT e.id, e.employee_id, e.first_name, e.last_name, e.department_id, e.monthly_salary, d.name as department_name
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE e.employment_status = 'Active'
       ORDER BY e.first_name`
    );

    const attRes = await query(
      `SELECT employee_id,
              COUNT(*) FILTER (WHERE status IN ('Present', 'Late', 'Half Day')) as present_days,
              COUNT(*) FILTER (WHERE status IN ('Leave', 'Absent')) as holidays
       FROM attendance
       WHERE date >= $1 AND date <= $2
       GROUP BY employee_id`,
      [start, end]
    );

    const attMap = new Map<string, any>();
    attRes.rows.forEach((r) => attMap.set(r.employee_id, r));

    const employees = empRes.rows.map((emp) => {
      const att = attMap.get(emp.id) || {};
      const monthly = parseFloat(emp.monthly_salary || '0') || 0;
      const present = Number(att.present_days || 0) || 0;
      const holidays = Number(att.holidays || 0) || 0;

      const cutHolidays = holidays > 2 ? holidays - 2 : 0;
      const paidDays = present + Math.min(2, holidays);
      const salary = holidays > 2 && workingDays > 0 ? (monthly * paidDays) / workingDays : monthly;

      return {
        employeeId: emp.id,
        employeeCode: emp.employee_id,
        firstName: emp.first_name,
        lastName: emp.last_name,
        departmentName: emp.department_name || '',
        monthlySalary: monthly,
        workingDays,
        presentDays: present,
        holidays,
        paidDays,
        cutHolidays,
        fullSalary: holidays <= 2,
        salary: Math.round(salary * 100) / 100,
      };
    });

    const totalMonthly = employees.reduce((s, e) => s + e.monthlySalary, 0);
    const totalSalary = employees.reduce((s, e) => s + e.salary, 0);

    res.status(200).json({
      success: true,
      data: {
        month,
        year,
        start,
        end,
        workingDays,
        totalMonthly,
        totalSalary,
        employees,
      },
    });
  } catch (error: any) {
    console.error('Salary analysis error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error.' });
  }
};
