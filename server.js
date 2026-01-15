import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import fs from 'fs';
import cors from 'cors';
import dotenv from 'dotenv';
import { Resend } from 'resend';
import path from 'path';
import multer from 'multer'; // ← أضف هذه المكتبة
import bcrypt from 'bcrypt'; // ← نستخدمه لتشفير كلمة المرور
import mongoose from 'mongoose';
import BlogPost from './models/BlogPost.js';
import Project from './models/Project.js';
import Testimonial from './models/Testimonial.js';

// تحميل متغيرات البيئة
dotenv.config();

// استيراد النموذج

// حل __dirname في ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;
// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));


// تهيئة Resend
const resendClient = new Resend(process.env.Resend_URI);

app.use(express.static(path.join(__dirname, 'public')));


// --- تخزين كلمات المرور للمشرفين (في ملف أو قاعدة بيانات لاحقًا) ---
const SALT_ROUNDS = 10;

// تحميل بيانات المشرف من البيئة
const loadAdmins = () => {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    console.error('❌ يجب تحديد ADMIN_USERNAME و ADMIN_PASSWORD في ملف .env');
    process.exit(1);
  }

  // تشفير كلمة المرور عند التشغيل
  const hashedPassword = bcrypt.hashSync(password, SALT_ROUNDS);

  // إرجاع مصفوفة تحتوي على المشرف (في الذاكرة فقط)
  return [
    {
      id: 1,
      username,
      password: hashedPassword
    }
  ];
};

// تحميل المشرفين إلى الذاكرة
let admins = loadAdmins();

// --- نقطة نهاية تسجيل الدخول ---
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;

  const admin = admins.find(a => a.username === username);
  if (!admin) {
    return res.status(401).json({ error: 'Falscher Benutzername oder falsches Passwort' });
  }

  const isMatch = await bcrypt.compare(password, admin.password);
  if (!isMatch) {
    return res.status(401).json({ error: 'Falscher Benutzername oder falsches Passwort' });
  }

  // نعود برمز مصادقة بسيط (يمكنك استخدام JWT لاحقًا)
  res.json({ success: true, token: 'admin-auth-token-2025' });
});



// التأكد من وجود مجلد uploads
const uploadsDir = './uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// خدمة الملفات الثابتة
app.use('/uploads', express.static(uploadsDir));

// إعداد Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// دالة مساعدة لإنشاء رابط كامل للصورة
const getImageUrl = (req, filename) => {
  if (!filename) return '';
  if (filename.startsWith('https')) return filename;
  return `${req.protocol}://${req.get('host')}/uploads/${filename}`;
};

// --- API Routes ---

// GET: جميع المقالات المنشورة
app.get('/api/blog', async (req, res) => {
  try {
    const posts = await BlogPost.find({ published: true }).sort({ createdAt: -1 });
    res.json(posts);
  } catch (err) {
    console.error('خطأ في جلب المقالات:', err);
    res.status(500).json({ error: 'خطأ داخلي' });
  }
});

// GET: مقالة واحدة حسب slug
app.get('/api/blog/:slug', async (req, res) => {
  try {
    const post = await BlogPost.findOne({
      slug: req.params.slug,
      published: true
    });
    if (!post) {
      return res.status(404).json({ error: 'مقال غير موجود' });
    }
    res.json(post);
  } catch (err) {
    console.error('خطأ في جلب المقالة:', err);
    res.status(500).json({ error: 'خطأ داخلي' });
  }
});

// POST: إضافة مقالة جديدة
app.post('/api/blog', upload.single('image'), async (req, res) => {
  try {
    const body = req.body;
    const image = req.file 
      ? getImageUrl(req, req.file.filename) 
      : body.image || '';

    // التحقق من تكرار slug
    const existing = await BlogPost.findOne({ slug: body.slug });
    if (existing) {
      return res.status(400).json({ error: 'الـ slug مكرر' });
    }

    const newPost = new BlogPost({
      id: Date.now().toString(),
      title: JSON.parse(body.title),
      content: JSON.parse(body.content),
      slug: body.slug,
      image: image,
      published: body.published === 'true'
    });

    await newPost.save();
    res.status(201).json(newPost);
  } catch (err) {
    console.error('خطأ في إضافة المقالة:', err);
    if (err.code === 11000) {
      return res.status(400).json({ error: 'الـ slug مكرر' });
    }
    res.status(500).json({ error: 'فشل الحفظ' });
  }
});

// PUT: تعديل مقالة
app.put('/api/blog/:id', upload.single('image'), async (req, res) => {
  try {
    const body = req.body;
    const image = req.file 
      ? getImageUrl(req, req.file.filename) 
      : body.image || '';

    const existingPost = await BlogPost.findOne({ id: req.params.id });
    if (!existingPost) {
      return res.status(404).json({ error: 'مقال غير موجود' });
    }

    const duplicate = await BlogPost.findOne({
      slug: body.slug,
      id: { $ne: req.params.id }
    });
    if (duplicate) {
      return res.status(400).json({ error: 'الـ slug مكرر' });
    }

    existingPost.title = JSON.parse(body.title);
    existingPost.content = JSON.parse(body.content);
    existingPost.slug = body.slug;
    existingPost.image = image;
    existingPost.published = body.published === 'true';

    await existingPost.save();
    res.json(existingPost);
  } catch (err) {
    console.error('خطأ في تعديل المقالة:', err);
    if (err.code === 11000) {
      return res.status(400).json({ error: 'الـ slug مكرر' });
    }
    res.status(500).json({ error: 'فشل التحديث' });
  }
});

// DELETE: حذف مقالة
app.delete('/api/blog/:id', async (req, res) => {
  try {
    const result = await BlogPost.findOneAndDelete({ id: req.params.id });
    if (!result) {
      return res.status(404).json({ error: 'مقال غير موجود' });
    }
    res.json({ message: 'تم الحذف بنجاح' });
  } catch (err) {
    console.error('خطأ في الحذف:', err);
    res.status(500).json({ error: 'فشل الحذف' });
  }
});


// API Route: إرسال عرض السعر
app.post('/api/send-quote', async (req, res) => {
  try {
    const { name, email, service, projectDetails, budget, deadline } = req.body;

    // التحقق من البيانات
    if (!name || !email || !service || !projectDetails) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // إرسال البريد عبر Resend
    const emailResponse = await resendClient.emails.send({
      from: 'onboarding@resend.dev', // يمكنك تغييره لاحقًا
      to: ['abrahim71192@gmail.com'], // البريد الذي تستقبل عليه
      subject: `طلب عرض سعر جديد: ${service}`,
      reply_to: email, // حتى ترد على العميل مباشرة من البريد
      text: `
        تم استلام طلب عرض سعر جديد:

        الاسم: ${name}
        البريد: ${email}
        الخدمة: ${service}
        التفاصيل: ${projectDetails}
        الميزانية: ${budget || 'غير محددة'}
        الموعد النهائي: ${deadline || 'غير محدد'}

        يمكنك الرد على هذا البريد مباشرة.
      `,
      html: `
        <h2>طلب عرض سعر جديد</h2>
        <p><strong>الاسم:</strong> ${name}</p>
        <p><strong>البريد:</strong> ${email}</p>
        <p><strong>الخدمة:</strong> ${service}</p>
        <p><strong>التفاصيل:</strong><br>${projectDetails.replace(/\n/g, '<br>')}</p>
        <p><strong>الميزانية:</strong> ${budget || 'غير محددة'} SAR</p>
        <p><strong>الموعد النهائي:</strong> ${deadline || 'غير محدد'}</p>
        <hr>
        <p><em>يمكنك الرد على هذا البريد مباشرة للرد على العميل.</em></p>
      `,
    });

    res.json({ success: true, data: emailResponse });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

app.post('/api/send-contact', async (req, res) => {
  try {
    const { name, email, phone, message } = req.body;

    // التحقق من الحقول
    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // إرسال البريد عبر Resend
    const emailResponse = await resendClient.emails.send({
      from: 'onboarding@resend.dev',
      to: ['abrahim71192@gmail.com'], // بريدك لتستقبل عليه
      reply_to: email, // حتى ترد على العميل مباشرة
      subject: `رسالة تواصل جديدة من ${name}`,
      text: `
        اسم المرسل: ${name}
        البريد: ${email}
        الهاتف: ${phone || 'غير متوفر'}
        الرسالة: ${message}
      `,
      html: `
        <h2>رسالة تواصل جديدة</h2>
        <p><strong>الاسم:</strong> ${name}</p>
        <p><strong>البريد:</strong> ${email}</p>
        <p><strong>الهاتف:</strong> ${phone || 'غير متوفر'}</p>
        <p><strong>الرسالة:</strong><br>${message.replace(/\n/g, '<br>')}</p>
        <hr>
        <p><em>يمكنك الرد على هذا البريد مباشرة.</em></p>
      `,
    });

    res.json({ success: true, data: emailResponse });
  } catch (error) {
    console.error('Error sending contact email:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});


// GET: جميع المشاريع (للاستخدام في الواجهة الأمامية)
app.get('/api/projects', async (req, res) => {
  try {
    const projects = await Project.find().sort({ order: 1, createdAt: -1 });
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: 'فشل جلب المشاريع' });
  }
});

// POST: إضافة مشروع
app.post('/api/projects', upload.single('img'), async (req, res) => {
  try {
    const body = req.body;
    const img = req.file 
      ? getImageUrl(req, req.file.filename)
      : body.img || '';

    const newProject = new Project({
      title: JSON.parse(body.title),
      category: JSON.parse(body.category),
      description: JSON.parse(body.description),
      img: img,
      url: body.url || '',
      order: parseInt(body.order) || 0
    });

    await newProject.save();
    res.status(201).json(newProject);
  } catch (err) {
    res.status(500).json({ error: 'فشل إضافة المشروع' });
  }
});

// PUT: تعديل مشروع
app.put('/api/projects/:id', upload.single('img'), async (req, res) => {
  try {
    const body = req.body;
    const img = req.file 
      ? getImageUrl(req, req.file.filename)
      : body.img || '';

    const updated = await Project.findByIdAndUpdate(
      req.params.id,
      {
        title: JSON.parse(body.title),
        category: JSON.parse(body.category),
        description: JSON.parse(body.description),
        img: img,
        url: body.url || '',
        order: parseInt(body.order) || 0
      },
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ error: 'مشروع غير موجود' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'فشل التعديل' });
  }
});

// DELETE: حذف مشروع
app.delete('/api/projects/:id', async (req, res) => {
  try {
    const deleted = await Project.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'مشروع غير موجود' });
    res.json({ message: 'تم الحذف' });
  } catch (err) {
    res.status(500).json({ error: 'فشل الحذف' });
  }
});

// GET: جميع الآراء
app.get('/api/testimonials', async (req, res) => {
  try {
    const testimonials = await Testimonial.find().sort({ order: 1, createdAt: -1 });
    res.json(testimonials);
  } catch (err) {
    res.status(500).json({ error: 'فشل جلب الآراء' });
  }
});

// POST: إضافة رأي
app.post('/api/testimonials', async (req, res) => {
  try {
    const { name, role, company, content, rating = 5, order = 0 } = req.body;
    const newTestimonial = new Testimonial({
      name,
      role: JSON.parse(role),
      company,
      content: JSON.parse(content),
      rating,
      order
    });
    await newTestimonial.save();
    res.status(201).json(newTestimonial);
  } catch (err) {
    res.status(500).json({ error: 'فشل الإضافة' });
  }
});

// PUT: تعديل رأي
app.put('/api/testimonials/:id', async (req, res) => {
  try {
    const { name, role, company, content, rating = 5, order = 0 } = req.body;
    const updated = await Testimonial.findByIdAndUpdate(
      req.params.id,
      {
        name,
        role: JSON.parse(role),
        company,
        content: JSON.parse(content),
        rating,
        order
      },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ error: 'رأي غير موجود' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'فشل التعديل' });
  }
});

// DELETE: حذف رأي
app.delete('/api/testimonials/:id', async (req, res) => {
  try {
    const deleted = await Testimonial.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'رأي غير موجود' });
    res.json({ message: 'تم الحذف' });
  } catch (err) {
    res.status(500).json({ error: 'فشل الحذف' });
  }
});


app.get('*', (req, res) => {
 res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// اتصال بقاعدة البيانات
// بدء الخادم فورًا
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
});

// الاتصال بـ MongoDB بعد بدء الخادم
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ تم الاتصال بقاعدة بيانات MongoDB');
  })
  .catch((err) => {
    console.error('❌ فشل الاتصال بـ MongoDB:', err);
    // لا تُنهِ العملية هنا في production (اختياري، حسب الحاجة)
    // لكن احذر: بعض الـ endpoints قد تفشل لاحقًا
  });
