require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: 'info@edwardmeijer.nl',
        pass: process.env.SMTP_PASS
    }
});

const mailOptions = {
    from: '"Test Pianotechnicus via PianoPlanner" <info@pianoplanner.com>',
    to: 'e.meijer@mac.com',
    replyTo: 'test-technicus@example.com',  // Dit zou het email van de technicus zijn
    subject: '🎹 Test - Afspraak Bevestiging',
    html: `
        <h2>Test Bevestigingsmail</h2>
        <p>Dit is een test om de Reply-To header te controleren.</p>
        <p><strong>Als je op "Beantwoorden" klikt, zou de email moeten gaan naar:</strong></p>
        <p style="background: #f0f0f0; padding: 10px; font-family: monospace;">test-technicus@example.com</p>
        <p>En NIET naar info@pianoplanner.com of info@edwardmeijer.nl</p>
        <hr>
        <p style="color: #666; font-size: 12px;">Verzonden via PianoPlanner</p>
    `
};

console.log('📧 Sending test email with Reply-To header...');
console.log('   From:', mailOptions.from);
console.log('   To:', mailOptions.to);
console.log('   Reply-To:', mailOptions.replyTo);

transporter.sendMail(mailOptions, (err, info) => {
    if (err) {
        console.error('❌ Error:', err.message);
    } else {
        console.log('✅ Email sent! Message ID:', info.messageId);
        console.log('\n📬 Check je inbox op e.meijer@mac.com');
        console.log('   Klik op "Beantwoorden" en check of het adres test-technicus@example.com is');
    }
    process.exit(err ? 1 : 0);
});
