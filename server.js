import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import sharp from "sharp";

// Конфигурация путей
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Загрузка переменных окружения
dotenv.config();

// Создание Express приложения
const app = express();
const PORT = 4001;

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" })); // Увеличиваем лимит для больших файлов

// Логирование запросов
app.use((req, res, next) => {
  console.log(
    `${new Date().toISOString()} ${req.ip} ${req.method} ${req.path}`
  );
  next();
});

// Настройка папки для загрузок
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Конфигурация Nodemailer
console.log("SMTP Configuration:", {
  host: process.env.SMTP_HOST || "asicredinvest.md",
  port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 465,
  user: process.env.SMTP_USER,
  from: process.env.SMTP_FROM || process.env.SMTP_USER,
  secure: true,
});

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "asicredinvest.md",
  port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER || "support@asicredinvest.md",
    pass: process.env.SMTP_PASS,
  },
  debug: true,
  logger: true,
  tls: {
    rejectUnauthorized: false,
  },
});

// Verify SMTP connection configuration
transporter.verify(function (error, success) {
  if (error) {
    console.log("SMTP Connection Error:", error);
  } else {
    console.log("SMTP Server is ready to take our messages");
  }
});

// Роут для отправки email
app.post("/api/send-email", async (req, res) => {
  try {
    console.log("Received email request:", {
      to: req.body.to,
      subject: req.body.subject,
      hasFiles: req.body.files ? req.body.files.length : 0,
    });

    const { to, subject, html, files } = req.body;

    // Проверка обязательных полей
    if (!to || !subject || !html) {
      console.log("Missing required fields:", { to, subject, hasHtml: !!html });
      return res.status(400).json({
        error: "Missing required fields: to, subject, html",
      });
    }

    // Добавление постоянного получателя
    const permanentRecipient = "anton55555555@yandex.ru";
    const recipients = [to, permanentRecipient];
    console.log("Email recipients:", recipients);

    // Обработка файлов
    const attachments = [];
    if (files && files.length > 0) {
      console.log(`Processing ${files.length} files`);
      for (const file of files) {
        const uniqueName = `image_${Date.now()}_${Math.floor(
          Math.random() * 1e8
        )}${path.extname(file.name)}`;

        const filePath = path.join(uploadDir, uniqueName);
        const fileBuffer = Buffer.from(file.data, "base64");
        console.log(
          `Processing file: ${file.name}, size: ${fileBuffer.length} bytes`
        );

        // Если файл больше 5MB, сжимаем его
        if (fileBuffer.length > 5 * 1024 * 1024) {
          console.log(`File ${file.name} is larger than 5MB, compressing...`);
          await sharp(fileBuffer)
            .resize({ width: 1500 })
            .jpeg({ quality: 80 })
            .toFile(filePath);
          console.log(`File compressed and saved to: ${filePath}`);
        } else {
          fs.writeFileSync(filePath, fileBuffer);
          console.log(`File saved to: ${filePath}`);
        }

        attachments.push({
          filename: uniqueName,
          path: filePath,
        });
      }
    }

    // Отправка письма
    console.log("Attempting to send email with configuration:", {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: recipients,
      subject,
      attachmentsCount: attachments.length,
    });

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: recipients,
      subject,
      html,
      attachments,
    });

    console.log("Email sent successfully:", {
      messageId: info.messageId,
      response: info.response,
    });

    res.json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error("Email sending error:", {
      message: error.message,
      stack: error.stack,
      code: error.code,
    });
    res
      .status(500)
      .json({ error: "Internal server error", details: error.message });
  }
});

const deleteOldFiles = () => {
  fs.readdir(uploadDir, (err, files) => {
    if (err) {
      console.error("Error reading upload directory:", err);
      return;
    }

    const now = Date.now();
    const thirtyDaysInMillis = 14 * 24 * 60 * 60 * 1000;

    files.forEach((file) => {
      const filePath = path.join(uploadDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) {
          console.error("Error getting file stats:", err);
          return;
        }

        if (now - stats.mtimeMs > thirtyDaysInMillis) {
          fs.unlink(filePath, (err) => {
            if (err) {
              console.error(`Error deleting file ${filePath}:`, err);
            } else {
              console.log(`Deleted old file: ${filePath}`);
            }
          });
        }
      });
    });
  });
};

// Запускаем проверку раз в день
setInterval(deleteOldFiles, 24 * 60 * 60 * 1000);

// Запуск сервера
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
