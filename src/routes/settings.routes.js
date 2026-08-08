const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');

const { 
  getMe,
  updateMe,
  uploadMyAvatar,
  changeEmail,
  changePassword,
  deleteAccount
 } = require('../controllers/users.controller');
const { uploadAvatar } = require('../middleware/upload.middleware')
const { 
  listMyGenres,
  setGenreActive
} = require('../controllers/preferences.controller');
const {
  listMyStreamingServices,
  setStreamingServiceActive,
} = require('../controllers/streaming.controller');
const {
  getMyNotificationSettings,
  updateMyNotificationSettings,
} = require('../controllers/notifications.controller');

const router = express.Router();

router.use(requireAuth);

// Perfil -> userData
router.get('/users/me', getMe);
router.patch('/users/me', updateMe);
router.post('/users/me/avatar', uploadAvatar.single('avatar'), uploadMyAvatar);
router.patch('/users/me/email', changeEmail);
router.put('/users/me/password', changePassword);
router.delete('/users/me', deleteAccount);

// Géneros -> genres[]
router.get('/users/me/genres', listMyGenres);
router.put('/users/me/genres/:name', setGenreActive);

// Streaming -> streamingServices[]
router.get('/users/me/streaming-services', listMyStreamingServices);
router.put('/users/me/streaming-services/:name', setStreamingServiceActive);

// Notificaciones -> notificationsEnabled
router.get('/users/me/notifications', getMyNotificationSettings);
router.put('/users/me/notifications', updateMyNotificationSettings);

module.exports = router;
