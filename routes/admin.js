const express = require('express');
const router = express.Router();
const { sql, poolPromise } = require('../db');
const bcrypt = require('bcrypt');

// Middleware
function requireAdmin(req, res, next) {
    if (!req.session.user || req.session.user.role !== 'Admin')
        return res.status(403).json({ error: 'Forbidden' });
    next();
}

// list all users
router.get('/users', requireAdmin, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .query(`
                SELECT u.UserID, u.FullName, u.Email, u.ICNumber,
                       r.RoleName, u.IsActive
                FROM Users u
                JOIN Roles r ON u.RoleID = r.RoleID
            `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// view audit log
router.get('/audit', requireAdmin, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .query('SELECT * FROM AuditLog ORDER BY EventTimestamp DESC');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// create a new user
router.post('/users', requireAdmin, async (req, res) => {
    const { fullName, icNumber, email, password, roleId } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10); // 10 = salt rounds

        const pool = await poolPromise;
        await pool.request()
            .input('FullName',     sql.NVarChar, fullName)
            .input('ICNumber',     sql.NVarChar, icNumber)
            .input('Email',        sql.NVarChar, email)
            .input('PasswordHash', sql.NVarChar, hashedPassword)
            .input('RoleID',       sql.Int,      roleId)
            .query(`
                INSERT INTO Users (FullName, ICNumber, Email, PasswordHash, RoleID)
                VALUES (@FullName, @ICNumber, @Email, @PasswordHash, @RoleID)
            `);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;