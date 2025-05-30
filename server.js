import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
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

// Log the environment variables to the console
console.log("ENV:", process.env);

// Создание Express приложения
const app = express();
const PORT = 4001;

// Middleware
app.use(cors());
app.use(express.json());

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

// Конфигурация Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || "";
    const uniqueName = `${Date.now()}-${Math.floor(Math.random() * 1e8)}${ext}`;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

// Конфигурация Nodemailer
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.yandex.ru",
  port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Роут для отправки email
app.post("/api/send-email", upload.array("attachments"), async (req, res) => {
  try {
    const { to, subject, html } = req.body;
    const files = req.files || [];

    // Проверка обязательных полей
    if (!to || !subject || !html) {
      return res.status(400).json({
        error: "Missing required fields: to, subject, html",
      });
    }

    // Добавление постоянного получателя
    const permanentRecipient = "anton55555555@yandex.ru"; // Замените на нужный адрес
    const recipients = [to, permanentRecipient]; // Массив получателей

    // Формирование вложений
    const attachments = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileSizeInMB = file.size / (1024 * 1024); // Размер в МБ

      const uniqueName = `image_${Date.now()}_${Math.floor(
        Math.random() * 1e8
      )}_${i + 1}${path.extname(file.originalname)}`;

      // Сжимаем изображение только если его размер больше 5 МБ
      if (fileSizeInMB > 5) {
        await sharp(file.path)
          .resize({ width: 1500 }) // Установите нужную ширину
          .jpeg({ quality: 80 }) // Установите качество
          .toFile(path.join(uploadDir, uniqueName));
      } else {
        // Если файл меньше 5 МБ, просто перемещаем его
        fs.renameSync(file.path, path.join(uploadDir, uniqueName));
      }

      attachments.push({
        filename: uniqueName,
        path: path.join(uploadDir, uniqueName),
      });

      // Удаляем оригинальный файл
      fs.unlink(file.path, (err) => {
        if (err) console.error(`Error deleting file ${file.path}:`, err);
      });
    }

    // Отправка письма
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: recipients, // Используем массив получателей
      subject,
      html,
      attachments,
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Email sending error:", error.message);
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

        // Если файл старше 14 дней, удаляем его
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
