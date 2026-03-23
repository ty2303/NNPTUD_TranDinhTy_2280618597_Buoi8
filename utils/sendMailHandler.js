let nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
    host: process.env.MAILTRAP_HOST || "sandbox.smtp.mailtrap.io",
    port: Number(process.env.MAILTRAP_PORT || 2525),
    secure: false,
    auth: {
        user: process.env.MAILTRAP_USER || "",
        pass: process.env.MAILTRAP_PASS || "",
    },
});

module.exports = {
    sendMail: async function (to, url) {
        await transporter.sendMail({
            from: process.env.MAIL_FROM || '"admin@" <admin@nnptud.com>',
            to: to,
            subject: "mail reset password",
            text: "Click vao day de doi mat khau: " + url,
            html: 'Click vao <a href="' + url + '">day</a> de doi mat khau',
        });
    },
    sendNewUserPasswordMail: async function (to, username, password) {
        await transporter.sendMail({
            from: process.env.MAIL_FROM || '"admin@" <admin@nnptud.com>',
            to: to,
            subject: "Thong tin tai khoan moi",
            text: "Tai khoan cua ban da duoc tao. Username: " + username + ". Password: " + password,
            html:
                "<h2>Thong tin tai khoan moi</h2>" +
                "<p>Chao <b>" + username + "</b>, tai khoan cua ban da duoc tao thanh cong.</p>" +
                "<p><b>Username:</b> " + username + "</p>" +
                "<p><b>Password tam thoi:</b> " + password + "</p>" +
                "<p>Vui long dang nhap va doi mat khau ngay sau lan dang nhap dau tien.</p>",
        });
    }
}
