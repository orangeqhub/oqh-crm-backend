import dotenv from 'dotenv';
import { query } from './database';
import pool from './database';

dotenv.config();

const createTables = async (): Promise<void> => {
  try {
    console.log('Starting database migration...');

    await query(`
      CREATE TABLE IF NOT EXISTS roles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) UNIQUE NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Table: roles');

    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role_id INTEGER REFERENCES roles(id),
        is_active BOOLEAN DEFAULT true,
        last_login TIMESTAMP,
        refresh_token TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Table: users');

    await query(`
      CREATE TABLE IF NOT EXISTS departments (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Table: departments');

    await query(`
      CREATE TABLE IF NOT EXISTS designations (
        id SERIAL PRIMARY KEY,
        title VARCHAR(100) UNIQUE NOT NULL,
        department_id INTEGER REFERENCES departments(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Table: designations');

    await query(`
      CREATE TABLE IF NOT EXISTS employees (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id VARCHAR(20) UNIQUE NOT NULL,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(20),
        alternate_phone VARCHAR(20),
        date_of_birth DATE,
        gender VARCHAR(20),
        address TEXT,
        city VARCHAR(100),
        state VARCHAR(100),
        country VARCHAR(100) DEFAULT 'India',
        emergency_contact_name VARCHAR(200),
        emergency_contact_phone VARCHAR(20),
        department_id INTEGER REFERENCES departments(id),
        designation_id INTEGER REFERENCES designations(id),
        reporting_manager_id UUID REFERENCES employees(id),
        date_of_joining DATE,
        employment_type VARCHAR(50) DEFAULT 'Full-time',
        employment_status VARCHAR(50) DEFAULT 'Active',
        monthly_salary NUMERIC(12,2) DEFAULT 0,
        profile_photo VARCHAR(500),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS monthly_salary NUMERIC(12,2) DEFAULT 0`);
    console.log('Column: employees.monthly_salary');
    await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS pincode VARCHAR(20)`);
    console.log('Column: employees.pincode');
    console.log('Table: employees');

    await query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id SERIAL PRIMARY KEY,
        employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        check_in_time TIMESTAMP,
        check_out_time TIMESTAMP,
        status VARCHAR(20) DEFAULT 'Present',
        working_hours DECIMAL(5,2) DEFAULT 0,
        is_late BOOLEAN DEFAULT false,
        late_minutes INT DEFAULT 0,
        check_in_latitude DECIMAL(10,8),
        check_in_longitude DECIMAL(11,8),
        check_out_latitude DECIMAL(10,8),
        check_out_longitude DECIMAL(11,8),
        check_in_address TEXT,
        check_out_address TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(employee_id, date)
      );
    `);
    console.log('Table: attendance');

    // Add columns to existing attendance tables (no-op if they already exist)
    await query(`ALTER TABLE attendance ADD COLUMN IF NOT EXISTS late_minutes INT DEFAULT 0`);
    await query(`ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_in_latitude DECIMAL(10,8)`);
    await query(`ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_in_longitude DECIMAL(11,8)`);
    await query(`ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_out_latitude DECIMAL(10,8)`);
    await query(`ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_out_longitude DECIMAL(11,8)`);
    await query(`ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_in_address TEXT`);
    await query(`ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_out_address TEXT`);
    console.log('Columns: attendance location');

    await query(`
      CREATE TABLE IF NOT EXISTS login_activity (
        id SERIAL PRIMARY KEY,
        employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
        login_time TIMESTAMP NOT NULL,
        logout_time TIMESTAMP,
        session_duration INTEGER DEFAULT 0,
        ip_address VARCHAR(50),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Table: login_activity');

    await query(`
      CREATE TABLE IF NOT EXISTS employee_work_updates (
        id SERIAL PRIMARY KEY,
        employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        project_module VARCHAR(200),
        task_assigned TEXT,
        task_completed TEXT,
        development_in_progress TEXT,
        testing_status VARCHAR(50) DEFAULT 'Not Applicable',
        next_day_task TEXT,
        completion_percentage INTEGER DEFAULT 0,
        notes TEXT,
        task_status VARCHAR(50) DEFAULT 'In Progress',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(employee_id, date)
      );
    `);
    console.log('Table: employee_work_updates');

    await query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        client_id INTEGER,
        description TEXT,
        start_date DATE,
        expected_end_date DATE,
        actual_end_date DATE,
        status VARCHAR(50) DEFAULT 'Not Started',
        priority VARCHAR(20) DEFAULT 'Medium',
        project_manager_id UUID REFERENCES employees(id),
        budget DECIMAL(12,2),
        progress INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Table: projects');

    await query(`
      CREATE TABLE IF NOT EXISTS project_members (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
        role VARCHAR(50) DEFAULT 'Member',
        assigned_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(project_id, employee_id)
      );
    `);
    console.log('Table: project_members');

    await query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title VARCHAR(300) NOT NULL,
        description TEXT,
        project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
        assigned_to UUID REFERENCES employees(id) ON DELETE SET NULL,
        assigned_by UUID REFERENCES employees(id),
        priority VARCHAR(20) DEFAULT 'Medium',
        status VARCHAR(50) DEFAULT 'To Do',
        start_date DATE,
        due_date DATE,
        completion_percentage INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Table: tasks');

    await query(`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        client_code VARCHAR(20) UNIQUE NOT NULL,
        company_name VARCHAR(200) NOT NULL,
        contact_person VARCHAR(200),
        email VARCHAR(255),
        phone VARCHAR(20),
        alternate_phone VARCHAR(20),
        website VARCHAR(300),
        address TEXT,
        city VARCHAR(100),
        state VARCHAR(100),
        country VARCHAR(100) DEFAULT 'India',
        industry VARCHAR(100),
        services_required TEXT,
        project_requirements TEXT,
        budget DECIMAL(12,2),
        project_value DECIMAL(12,2),
        lead_source VARCHAR(100),
        lead_status VARCHAR(50) DEFAULT 'New',
        assigned_to UUID REFERENCES employees(id),
        follow_up_date DATE,
        notes TEXT,
        status VARCHAR(50) DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Table: clients');

    await query(`
      CREATE TABLE IF NOT EXISTS client_activities (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
        activity_type VARCHAR(100),
        description TEXT,
        performed_by UUID REFERENCES employees(id),
        follow_up_date DATE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Table: client_activities');

    await query(`
      CREATE TABLE IF NOT EXISTS employee_identity_cards (
        id SERIAL PRIMARY KEY,
        employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
        card_number VARCHAR(50) UNIQUE NOT NULL,
        qr_code_url TEXT,
        verification_token VARCHAR(255) UNIQUE NOT NULL,
        is_active BOOLEAN DEFAULT true,
        issued_date DATE DEFAULT CURRENT_DATE,
        expiry_date DATE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Table: employee_identity_cards');

    await query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(200) NOT NULL,
        message TEXT,
        type VARCHAR(50) DEFAULT 'info',
        is_read BOOLEAN DEFAULT false,
        link VARCHAR(500),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Table: notifications');

    await query(`
      CREATE TABLE IF NOT EXISTS company_settings (
        id SERIAL PRIMARY KEY,
        setting_key VARCHAR(100) UNIQUE NOT NULL,
        setting_value TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Table: company_settings');

    await query(`
      CREATE TABLE IF NOT EXISTS employee_documents (
        id SERIAL PRIMARY KEY,
        employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
        document_type VARCHAR(100) NOT NULL,
        document_name VARCHAR(200) NOT NULL,
        file_path VARCHAR(500),
        uploaded_by UUID REFERENCES employees(id),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Table: employee_documents');

    await seedDefaults();

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
};

const seedDefaults = async (): Promise<void> => {
  // Seed roles
  const roles = ['admin', 'hr', 'employee'];
  for (const role of roles) {
    await query(
      `INSERT INTO roles (name, description) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING`,
      [role, `${role.charAt(0).toUpperCase() + role.slice(1)} role`]
    );
  }
  console.log('Seeded roles');

  // Seed departments (company roles)
  const departments = [
    { name: 'Developers', description: 'Software development and engineering' },
    { name: 'Digital Marketing', description: 'Digital marketing and campaigns' },
    { name: 'Video Editing', description: 'Video editing and production' },
    { name: 'Graphic Designing', description: 'Graphic design and creative' },
    { name: 'Telecallers', description: 'Telecalling and lead generation' },
  ];
  for (const dept of departments) {
    await query(
      `INSERT INTO departments (name, description) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING`,
      [dept.name, dept.description]
    );
  }
  console.log('Seeded departments');

  // Seed designations (one per role)
  const designations = [
    { title: 'Developers', department: 'Developers' },
    { title: 'Digital Marketing', department: 'Digital Marketing' },
    { title: 'Video Editing', department: 'Video Editing' },
    { title: 'Graphic Designing', department: 'Graphic Designing' },
    { title: 'Telecallers', department: 'Telecallers' },
  ];
    for (const desg of designations) {
    const deptRes = await query(`SELECT id FROM departments WHERE name = $1`, [desg.department]);
    if (deptRes.rows.length > 0) {
      await query(
        `INSERT INTO designations (title, department_id) VALUES ($1, $2) ON CONFLICT (title) DO NOTHING`,
        [desg.title, deptRes.rows[0].id]
      );
    }
  }
  console.log('Seeded designations');

  // Seed company settings
  const settings = [
    { key: 'company_name', value: 'Orange Quantum Hub' },
    { key: 'company_email', value: 'info@orangequantumhub.com' },
    { key: 'company_phone', value: '+91-9876543210' },
    { key: 'company_address', value: 'Sector 62, Noida, Uttar Pradesh 201301, India' },
    { key: 'company_website', value: 'https://orangequantumhub.com' },
    { key: 'work_start_time', value: '09:30' },
    { key: 'work_end_time', value: '18:30' },
    { key: 'late_threshold_minutes', value: '15' },
    { key: 'max_working_hours', value: '9' },
    { key: 'currency', value: 'INR' },
    { key: 'date_format', value: 'DD/MM/YYYY' },
    { key: 'timezone', value: 'Asia/Kolkata' },
    { key: 'leave_encashment_rate', value: '0' },
    { key: 'pf_percentage', value: '12' },
    { key: 'esi_percentage', value: '0.75' },
    { key: 'tax_regime', value: 'new' },
  ];
  for (const setting of settings) {
    await query(
      `INSERT INTO company_settings (setting_key, setting_value) VALUES ($1, $2) ON CONFLICT (setting_key) DO NOTHING`,
      [setting.key, setting.value]
    );
  }
  console.log('Seeded company settings');
};

// Run migration if called directly
if (require.main === module) {
  createTables()
    .then(() => {
      console.log('All migrations completed. Closing connection.');
      pool.end();
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration error:', err);
      pool.end();
      process.exit(1);
    });
}

export default createTables;
