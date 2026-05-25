const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { sql, poolPromise } = require('../db');

router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('Email', sql.NVarChar, email)
            .query(`
                SELECT u.UserID, u.FullName, u.PasswordHash, r.RoleName
                FROM Users u
                JOIN Roles r ON u.RoleID = r.RoleID
                WHERE u.Email = @Email AND u.IsActive = 1
            `);

        if (result.recordset.length === 0)
            return res.status(401).json({ error: 'Invalid credentials' });

        const user = result.recordset[0];

        const match = await bcrypt.compare(password, user.PasswordHash); 
        if (!match)
            return res.status(401).json({ error: 'Invalid credentials' });

        req.session.user = {
            id:   user.UserID,
            name: user.FullName,
            role: user.RoleName
        };

        res.json({ success: true, role: user.RoleName });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

router.get('/me', (req, res) => {
    if (!req.session.user)
        return res.status(401).json({ error: 'Not logged in' });
    res.json(req.session.user);
});

module.exports = router;