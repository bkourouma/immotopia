import multer from 'multer';
import { Request } from 'express';
import * as path from 'path';

// Configure multer storage
const storage = multer.memoryStorage(); // Store in memory, we'll save to disk in service

// File filter for media uploads
// Note: req.body.mediaType might not be available when this filter runs
// because multer processes files before text fields. So we check the file's
// mimetype directly and allow both images and videos. Final validation
// happens in the service layer based on the actual mediaType from req.body.
export const mediaFileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (!file.mimetype) {
    cb(new Error('File type could not be determined'));
    return;
  }

  // Allow all supported image types (for PHOTO)
  const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  // Allow all supported video types (for VIDEO)
  const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];

  // Combine all allowed types - final validation happens in service layer
  const allAllowedTypes = [...allowedImageTypes, ...allowedVideoTypes];

  if (allAllowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    // Try to get mediaType from body if available (might not be set yet)
    const mediaType = req.body?.mediaType || 'PHOTO';
    if (mediaType === 'VIDEO') {
      cb(new Error('Invalid file type for video. Allowed: MP4, WebM, QuickTime'));
    } else {
      cb(new Error('Invalid file type for photo. Allowed: JPEG, PNG, WebP'));
    }
  }
};

// File filter for document uploads
export const documentFileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/tiff'
  ];

  if (file.mimetype && allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type for document. Allowed: PDF, DOC, DOCX, JPEG, PNG, TIFF'));
  }
};

// Multer instance for media uploads
export const uploadMedia = multer({
  storage,
  fileFilter: mediaFileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max file size
  }
});

// Multer instance for document uploads
export const uploadDocument = multer({
  storage,
  fileFilter: documentFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max file size
  }
});
