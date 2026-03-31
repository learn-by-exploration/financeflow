const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const createAttachmentRepository = require('../repositories/attachment.repository');
const createTransactionRepository = require('../repositories/transaction.repository');
const { NotFoundError, ValidationError, ForbiddenError } = require('../errors');

const ALLOWED_MIMES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp',
  'application/pdf'
];

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

module.exports = function createAttachmentRoutes({ db, audit }) {
  const router = express.Router();
  const attachmentRepo = createAttachmentRepository({ db });
  const txRepo = createTransactionRepository({ db });

  // Configure multer disk storage
  const storage = multer.diskStorage({
    destination(req, file, cb) {
      const uploadDir = path.join(process.env.DB_DIR || path.join(__dirname, '..', '..', 'data'), 'uploads', String(req.user.id));
      fs.mkdirSync(uploadDir, { recursive: true });
      cb(null, uploadDir);
    },
    filename(req, file, cb) {
      const uuid = crypto.randomUUID();
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${uuid}-${safeName}`);
    }
  });

  function fileFilter(req, file, cb) {
    if (!ALLOWED_MIMES.includes(file.mimetype)) {
      return cb(new ValidationError('File type not allowed. Accepted: images and PDF'));
    }
    cb(null, true);
  }

  const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_SIZE } });

  // POST /api/transactions/:id/attachments — Upload attachment
  router.post('/transactions/:id/attachments', (req, res, next) => {
    const tx = txRepo.findById(req.params.id, req.user.id);
    if (!tx) return next(new NotFoundError('Transaction'));

    upload.single('file')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new ValidationError('File too large. Maximum size is 5MB'));
        }
        return next(err);
      }
      if (!req.file) {
        return next(new ValidationError('No file provided'));
      }

      try {
        const attachment = attachmentRepo.create({
          transaction_id: tx.id,
          user_id: req.user.id,
          filename: req.file.filename,
          original_name: req.file.originalname,
          mime_type: req.file.mimetype,
          size: req.file.size,
          file_path: req.file.path
        });

        audit.log(req.user.id, 'attachment.create', 'attachment', attachment.id);
        res.status(201).json({ attachment });
      } catch (e) { next(e); }
    });
  });

  // GET /api/transactions/:id/attachments — List attachments
  router.get('/transactions/:id/attachments', (req, res, next) => {
    try {
      const tx = txRepo.findById(req.params.id, req.user.id);
      if (!tx) throw new NotFoundError('Transaction');
      const attachments = attachmentRepo.findByTransaction(tx.id, req.user.id);
      res.json({ attachments });
    } catch (err) { next(err); }
  });

  // GET /api/attachments/:id — Download/view attachment
  router.get('/attachments/:id', (req, res, next) => {
    try {
      const attachment = attachmentRepo.findById(req.params.id);
      if (!attachment) throw new NotFoundError('Attachment');
      if (attachment.user_id !== req.user.id) throw new ForbiddenError();
      if (!fs.existsSync(attachment.file_path)) throw new NotFoundError('Attachment file');
      res.setHeader('Content-Type', attachment.mime_type);
      const safeName = attachment.original_name.replace(/["\\\n\r]/g, '_');
      res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
      const stream = fs.createReadStream(attachment.file_path);
      stream.pipe(res);
    } catch (err) { next(err); }
  });

  // DELETE /api/attachments/:id — Delete attachment
  router.delete('/attachments/:id', (req, res, next) => {
    try {
      const attachment = attachmentRepo.findById(req.params.id);
      if (!attachment) throw new NotFoundError('Attachment');
      if (attachment.user_id !== req.user.id) throw new ForbiddenError();

      // Remove file from disk
      if (fs.existsSync(attachment.file_path)) {
        fs.unlinkSync(attachment.file_path);
      }

      attachmentRepo.deleteById(attachment.id);
      audit.log(req.user.id, 'attachment.delete', 'attachment', attachment.id);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
};
