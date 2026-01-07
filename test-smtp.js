const nodemailer = require('nodemailer');

// Vul hier je credentials in om te testen
const SMTP_USER = 'info@edwardmeijer.nl';
const SMTP_PASS = 'dxjrsusymbixgomg';

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
});

console.log('Testing SMTP connection...');
transporter.verify((err, success) => {
    if (err) {
        console.error('❌ SMTP Error:', err.message);
    } else {
        console.log('✅ SMTP connection successful!');
    }
    process.exit(err ? 1 : 0);
});
