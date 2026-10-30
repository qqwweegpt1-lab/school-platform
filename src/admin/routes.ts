import type { Route } from '../router.ts';
import { loginForm, loginSubmit, logout, passwordForm, passwordSubmit } from './auth.ts';
import { announcementCreate, announcementDelete, announcementEdit, announcementNew, announcementsList, announcementStatus, announcementUpdate } from './announcements.ts';
import { dashboard } from './dashboard.ts';
import { initiativeCreate, initiativeDelete, initiativeEdit, initiativeNew, initiativesList, initiativeUpdate } from './initiatives.ts';
import { mediaDelete, mediaEdit, mediaList, mediaPreview, mediaStatus, mediaUpdate, mediaUpload } from './media.ts';
import { addNote, changeStatus, deleteRequest, downloadAttachment, requestDetail, requestsList } from './requests.ts';
import { clearDemo, settingsForm, settingsSave, userCreate, userReset, usersList, userToggle } from './settings.ts';
import { surveyCreate, surveyDelete, surveyEdit, surveyItemAdd, surveyItemDelete, surveyNew, surveysList, surveyUpdate } from './surveys.ts';
import { guard } from './ui.ts';

const staff = (h: (c: any) => void | Promise<void>) => guard(h);
const admin = (h: (c: any) => void | Promise<void>) => guard(h, { admin: true });

/** كل مسارات الإدارة محمية على الخادم: تسجيل دخول ثم صلاحية الدور */
export const adminRoutes: Route[] = [
  // الدخول (عام)
  { method: 'GET', pattern: '/admin/login', handler: (c) => loginForm(c) },
  { method: 'POST', pattern: '/admin/login', handler: loginSubmit },
  { method: 'POST', pattern: '/admin/logout', handler: logout },

  { method: 'GET', pattern: '/admin', handler: staff(dashboard) },
  { method: 'GET', pattern: '/admin/password', handler: staff((c) => passwordForm(c)) },
  { method: 'POST', pattern: '/admin/password', handler: staff(passwordSubmit) },

  // الطلبات
  { method: 'GET', pattern: '/admin/requests', handler: staff(requestsList) },
  { method: 'GET', pattern: '/admin/requests/:id', handler: staff(requestDetail) },
  { method: 'POST', pattern: '/admin/requests/:id/status', handler: staff(changeStatus) },
  { method: 'POST', pattern: '/admin/requests/:id/note', handler: staff(addNote) },
  { method: 'POST', pattern: '/admin/requests/:id/delete', handler: admin(deleteRequest) },
  { method: 'GET', pattern: '/admin/attachments/:id', handler: staff(downloadAttachment) },

  // الإعلانات (المشرفة والموظفون؛ الحذف للمشرفة فقط)
  { method: 'GET', pattern: '/admin/announcements', handler: staff(announcementsList) },
  { method: 'GET', pattern: '/admin/announcements/new', handler: staff((c) => announcementNew(c)) },
  { method: 'POST', pattern: '/admin/announcements/new', handler: staff(announcementCreate) },
  { method: 'GET', pattern: '/admin/announcements/:id/edit', handler: staff((c) => announcementEdit(c)) },
  { method: 'POST', pattern: '/admin/announcements/:id/edit', handler: staff(announcementUpdate) },
  { method: 'POST', pattern: '/admin/announcements/:id/status', handler: staff(announcementStatus) },
  { method: 'POST', pattern: '/admin/announcements/:id/delete', handler: staff(announcementDelete) },

  // المبادرات
  { method: 'GET', pattern: '/admin/initiatives', handler: admin(initiativesList) },
  { method: 'GET', pattern: '/admin/initiatives/new', handler: admin((c) => initiativeNew(c)) },
  { method: 'POST', pattern: '/admin/initiatives/new', handler: admin(initiativeCreate) },
  { method: 'GET', pattern: '/admin/initiatives/:id/edit', handler: admin((c) => initiativeEdit(c)) },
  { method: 'POST', pattern: '/admin/initiatives/:id/edit', handler: admin(initiativeUpdate) },
  { method: 'POST', pattern: '/admin/initiatives/:id/delete', handler: admin(initiativeDelete) },

  // الاستبانات
  { method: 'GET', pattern: '/admin/surveys', handler: admin(surveysList) },
  { method: 'GET', pattern: '/admin/surveys/new', handler: admin((c) => surveyNew(c)) },
  { method: 'POST', pattern: '/admin/surveys/new', handler: admin(surveyCreate) },
  { method: 'GET', pattern: '/admin/surveys/:id/edit', handler: admin((c) => surveyEdit(c)) },
  { method: 'POST', pattern: '/admin/surveys/:id/edit', handler: admin(surveyUpdate) },
  { method: 'POST', pattern: '/admin/surveys/:id/items', handler: admin(surveyItemAdd) },
  { method: 'POST', pattern: '/admin/surveys/:id/items/:item/delete', handler: admin(surveyItemDelete) },
  { method: 'POST', pattern: '/admin/surveys/:id/delete', handler: admin(surveyDelete) },

  // الوسائط
  { method: 'GET', pattern: '/admin/media', handler: admin((c) => mediaList(c)) },
  { method: 'POST', pattern: '/admin/media', handler: admin(mediaUpload), bigBody: 'media' },
  { method: 'GET', pattern: '/admin/media/:id/file', handler: admin(mediaPreview) },
  { method: 'GET', pattern: '/admin/media/:id/edit', handler: admin((c) => mediaEdit(c)) },
  { method: 'POST', pattern: '/admin/media/:id/edit', handler: admin(mediaUpdate) },
  { method: 'POST', pattern: '/admin/media/:id/status', handler: admin(mediaStatus) },
  { method: 'POST', pattern: '/admin/media/:id/delete', handler: admin(mediaDelete) },

  // الإعدادات والمستخدمون والبيانات التجريبية
  { method: 'GET', pattern: '/admin/settings', handler: admin((c) => settingsForm(c)) },
  { method: 'POST', pattern: '/admin/settings', handler: admin(settingsSave) },
  { method: 'GET', pattern: '/admin/users', handler: admin((c) => usersList(c)) },
  { method: 'POST', pattern: '/admin/users', handler: admin(userCreate) },
  { method: 'POST', pattern: '/admin/users/:id/toggle', handler: admin(userToggle) },
  { method: 'POST', pattern: '/admin/users/:id/reset', handler: admin(userReset) },
  { method: 'POST', pattern: '/admin/demo/clear', handler: admin(clearDemo) },
];
