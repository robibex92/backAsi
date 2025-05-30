import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.yandex.ru",
  port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  debug: true, // Включаем отладку
  logger: true, // Логируем действия
});

export default transporter;
