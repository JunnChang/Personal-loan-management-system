require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'plms_secret_key_2025',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        maxAge: 1000 * 60 * 60  // 1 hour
    }
}));



// Routes
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth',  require('./routes/auth'));
app.use('/api/loans', require('./routes/loans'));
app.use('/api/admin', require('./routes/admin'));

//help for error logging
app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`PLMS running at http://localhost:${PORT}`);
});