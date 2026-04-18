const mysql = require('mysql2');

const db = mysql.createPool({
    host: "mysql-191e3242-gizie1873.d.aivencloud.com", // 🔴 from Aiven
    port: 13926,                      // 🔴 from Aiven (NOT 3306)
    user: "avnadmin",
    password: "AVNS_WWqElfqu_Z-eeD1_Cq0",
    database: "defaultdb",
    ssl: {
        rejectUnauthorized: false
    }
});

module.exports = db.promise();