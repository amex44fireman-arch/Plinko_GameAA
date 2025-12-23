/**
 * AR GAME SERVER (Express.js + MySQL)
 * Deploy this file to your VPS (Virtual Private Server).
 * 
 * SETUP:
 * 1. Install Node.js on VPS.
 * 2. Run: npm install express mysql2 cors body-parser bcrypt
 * 3. Run: node server.js
 */

const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcryptjs'); // Switched to bcryptjs for faster Render builds

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- Database Connection ---
// Replace with your real SQL credentials provided by your host
// Database Connection using Environment Variables for Security
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ar_game_db'
});

db.connect(err => {
    if (err) {
        console.error('❌ Database connection failed:', err.stack);
        return;
    }
    console.log('✅ Connected to MySQL Database.');
});

// --- Config ---
const ADMIN_WALLET_ID = 1; // The ID of your admin account in SQL

// --- Routes ---

// 1. Game Revenue Logic (House Edge)
// When a user hits *0, the frontend calls this to move funds to Admin
app.post('/api/game/loss', (req, res) => {
    const { userId, amount } = req.body;

    // 1. Deduct from User (Logic usually handled by game engine, but we log it)
    // 2. Add to Admin Wallet
    const sql = `UPDATE users SET balance = balance + ? WHERE id = ?`;

    db.query(sql, [amount, ADMIN_WALLET_ID], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });

        console.log(`[HOUSE REVENUE] Transferred ${amount} SYP from User ${userId} to Admin`);
        res.json({ success: true, message: 'Revenue Secured' });
    });
});

// 2. User Deposit
app.post('/api/bank/deposit', (req, res) => {
    const { userId, amount, method, proof } = req.body;
    // Insert into pending_transactions
    const sql = `INSERT INTO transactions (user_id, type, amount, method, proof, status) VALUES (?, 'deposit', ?, ?, ?, 'pending')`;
    db.query(sql, [userId, amount, method, proof], (err, result) => {
        res.json({ id: result.insertId, status: 'pending' });
    });
});

// 3. User Withdraw
app.post('/api/bank/withdraw', (req, res) => {
    const { userId, amount, method } = req.body;

    // Check balance first
    db.query('SELECT balance FROM users WHERE id = ?', [userId], (err, results) => {
        if (results[0].balance < amount) return res.status(400).json({ error: 'Insufficient funds' });

        // Deduct & Log
        const sql = `INSERT INTO transactions (user_id, type, amount, method, status) VALUES (?, 'withdraw', ?, ?, 'pending')`;
        db.query(sql, [userId, amount, method]);

        res.json({ status: 'pending' });
    });
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 AR Game API Server running on port ${PORT}`);
});
