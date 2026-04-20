const { Pool } = require('pg');
const pool = new Pool({
    connectionString: "postgresql://postgres:yA6Hy3ZiRHbIMhoh@db.rmzourfcjodclcowbuhs.supabase.co:5432/postgres",
    ssl: { rejectUnauthorized: false }
});