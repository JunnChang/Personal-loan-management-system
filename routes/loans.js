const express = require('express');
const router = express.Router();
const { sql, poolPromise } = require('../db');

async function setContextUser(pool, username) {
    const padded = username.substring(0, 128).padEnd(128, ' ');
    const buf = Buffer.from(padded, 'latin1');
    await pool.request()
        .input('ctx', sql.VarBinary(128), buf)
        .query('SET CONTEXT_INFO @ctx');
}

//must be logged in
function requireAuth(req, res, next) {
    if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
    next();
}

async function logAudit(pool, eventType, performedBy, recordId) {
    await pool.request()
        .input('EventType',        sql.NVarChar, eventType)
        .input('TableAffected',    sql.NVarChar, 'LoanApplications')
        .input('PerformedBy',      sql.NVarChar, performedBy)
        .input('AffectedRecordID', sql.Int,       recordId)
        .query(`
            INSERT INTO AuditLog (EventType, TableAffected, PerformedBy, AffectedRecordID)
            VALUES (@EventType, @TableAffected, @PerformedBy, @AffectedRecordID)
        `);
}

// fetch available loan products
router.get('/products', requireAuth, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .query('SELECT * FROM LoanProducts');
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// fetch applications (RLS enforced at DB level)
router.get('/', requireAuth, async (req, res) => {
    try {
        const pool = await poolPromise;

        const whoami = await pool.request()
            .query('SELECT SYSTEM_USER as sysuser, USER_NAME() as username');
        console.log('DB identity:', whoami.recordset[0]);

        let result;

        if (req.session.user.role === 'Customer') {
            result = await pool.request()
                .input('CustomerID', sql.Int, req.session.user.id)
                .query('SELECT * FROM LoanApplications WHERE CustomerID = @CustomerID ORDER BY SubmittedAt DESC');

        } else {
            result = await pool.request()
                .query('SELECT * FROM LoanApplications ORDER BY SubmittedAt DESC');
        }

        console.log('Loans fetched:', result.recordset.length);
        res.json(result.recordset);

    } catch (err) {
        console.error('Fetch error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// POST 
router.post('/apply', requireAuth, async (req, res) => {
    if (req.session.user.role !== 'Customer')
        return res.status(403).json({ error: 'Forbidden' });

    const { loanProductId, requestedAmount, monthlyIncome } = req.body;

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('CustomerID',      sql.Int,           req.session.user.id)
            .input('LoanProductID',   sql.Int,           loanProductId)
            .input('RequestedAmount', sql.Decimal(18,2), requestedAmount)
            .input('MonthlyIncome',   sql.Decimal(18,2), monthlyIncome)
            .query(`
                INSERT INTO LoanApplications
                    (CustomerID, LoanProductID, RequestedAmount, MonthlyIncome)
                VALUES
                    (@CustomerID, @LoanProductID, @RequestedAmount, @MonthlyIncome);
                SELECT SCOPE_IDENTITY() AS NewID;
            `);

        const newId = result.recordset[0].NewID;
        await logAudit(pool, 'INSERT', req.session.user.name, newId);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT 
router.put('/:id/status', requireAuth, async (req, res) => {
    if (req.session.user.role !== 'LoanOfficer')
        return res.status(403).json({ error: 'Forbidden' });

    const { status } = req.body;

    try {
        const pool = await poolPromise;
        await pool.request()
            .input('ApplicationID', sql.Int,     req.params.id)
            .input('Status',        sql.NVarChar, status)
            .query(`
                UPDATE LoanApplications
                SET Status = @Status
                WHERE ApplicationID = @ApplicationID
            `);

        await logAudit(pool, `UPDATE - ${status}`, req.session.user.name, parseInt(req.params.id));

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE 
router.delete('/:id', requireAuth, async (req, res) => {
    if (req.session.user.role !== 'Admin')
        return res.status(403).json({ error: 'Forbidden' });

    try {
        const pool = await poolPromise;
        await logAudit(pool, 'DELETE', req.session.user.name, parseInt(req.params.id));

        await pool.request()
            .input('ApplicationID', sql.Int, req.params.id)
            .query('DELETE FROM LoanApplications WHERE ApplicationID = @ApplicationID');

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;