const DEFAULT_API_BASE = 'https://tenncoach-production.up.railway.app/api';
const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || DEFAULT_API_BASE;

async function req(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
  });
  return res.json();
}

export const authAPI = {
  login: (email: string, password: string, timezone?: string, role: 'coach' | 'student' = 'coach') =>
    req('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, role, timezone }),
    }),
  googleLogin: (credential: string, timezone?: string, role: 'coach' | 'student' = 'coach') =>
    req('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential, role, timezone }),
    }),
  appleLogin: (identityToken: string, timezone?: string, role: 'coach' | 'student' = 'coach', fullName?: { givenName?: string | null; familyName?: string | null } | null, email?: string | null) =>
    req('/auth/apple', {
      method: 'POST',
      body: JSON.stringify({ identityToken, role, timezone, fullName, email }),
    }),
  forgotPassword: (email: string, role: 'coach' | 'student') =>
    req('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    }),
};

export const coachesAPI = {
  getById: (id: string | number) => req(`/coaches/${id}`),
  create: (data: {
    name: string;
    email: string;
    password: string;
    timezone?: string;
  }) =>
    req('/coaches', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string | number, data: object) =>
    req(`/coaches/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  setActive: (id: string | number, active: boolean) =>
    req(`/coaches/${id}/active`, { method: 'PATCH', body: JSON.stringify({ active }) }),
  deleteAccount: (id: string | number) =>
    req(`/coaches/${id}`, { method: 'DELETE' }),
};

export const bookingsAPI = {
  getForCoach: (coachId: string | number) => req(`/bookings/coach/${coachId}`),

  confirm: (bookingId: number) =>
    req(`/bookings/${bookingId}/confirm`, { method: 'PATCH' }),

  reject: (bookingId: number, reason?: string) =>
    req(`/bookings/${bookingId}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({ reject_reason: reason }),
    }),

  cancel: (bookingId: number, reason?: string) =>
    req(`/bookings/${bookingId}/cancel`, {
      method: 'PATCH',
      body: JSON.stringify({ cancelled_by: 'coach', reason }),
    }),

  proposeTime: (
    bookingId: number,
    data: { counter_date: string; counter_start: string; counter_end: string; counter_note?: string },
  ) =>
    req(`/bookings/${bookingId}/propose-time`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  requestReschedule: (
    bookingId: number,
    data: {
      reschedule_date: string;
      reschedule_start: string;
      reschedule_end: string;
      reschedule_note?: string;
    },
  ) =>
    req(`/bookings/${bookingId}/reschedule`, {
      method: 'PATCH',
      body: JSON.stringify({ requested_by: 'coach', ...data }),
    }),

  acceptReschedule: (bookingId: number) =>
    req(`/bookings/${bookingId}/reschedule/accept`, { method: 'PATCH' }),

  declineReschedule: (bookingId: number) =>
    req(`/bookings/${bookingId}/reschedule/decline`, { method: 'PATCH' }),

  markAttended: (bookingId: number) =>
    req(`/bookings/${bookingId}/attended`, { method: 'PATCH' }),

  markNoShow: (bookingId: number) =>
    req(`/bookings/${bookingId}/no-show`, { method: 'PATCH' }),

  unmarkAttendance: (bookingId: number) =>
    req(`/bookings/${bookingId}/unmark-attendance`, { method: 'PATCH' }),

  remind: (bookingId: number) =>
    req(`/bookings/${bookingId}/remind`, {
      method: 'POST',
      body: JSON.stringify({ reminded_by: 'coach' }),
    }),
};

export const groupLessonsAPI = {
  getForCoach: (coachId: string | number) => req(`/group-lessons/coach/${coachId}`),
  getRequestsForCoach: (coachId: string | number) =>
    req(`/group-lessons/coach/${coachId}/requests`),
  create: (data: object) =>
    req('/group-lessons', { method: 'POST', body: JSON.stringify(data) }),
  update: (groupLessonId: number, data: object) =>
    req(`/group-lessons/${groupLessonId}`, { method: 'PUT', body: JSON.stringify(data) }),
  confirmRequest: (registrationId: number) =>
    req(`/group-lessons/registrations/${registrationId}/confirm`, { method: 'PATCH' }),
  rejectRequest: (registrationId: number) =>
    req(`/group-lessons/registrations/${registrationId}/reject`, { method: 'PATCH' }),
  cancelLesson: (groupLessonId: number) =>
    req(`/group-lessons/${groupLessonId}/cancel`, { method: 'PATCH' }),
  markGroupAttended: (registrationId: number) =>
    req(`/group-lessons/registrations/${registrationId}/attended`, { method: 'PATCH' }),
  markGroupNoShow: (registrationId: number) =>
    req(`/group-lessons/registrations/${registrationId}/no-show`, { method: 'PATCH' }),
};

export const messagesAPI = {
  getConversations: (userId: string | number) =>
    req(`/messages/${userId}/conversations`),
  getThread: (userId: string | number, otherId: string | number) =>
    req(`/messages/conversation/${userId}/${otherId}`),
  send: (senderId: number, receiverId: number, subject: string, body: string) =>
    req('/messages', {
      method: 'POST',
      body: JSON.stringify({ sender_id: senderId, receiver_id: receiverId, subject, body }),
    }),
  markAsRead: (messageId: string | number) =>
    req(`/messages/${messageId}/read`, {
      method: 'PUT',
      body: JSON.stringify({ is_read: true }),
    }),
};

export const notificationsAPI = {
  getForUser: (userId: string | number) => req(`/notifications/${userId}`),
  markRead: (notificationId: number) =>
    req(`/notifications/${notificationId}/read`, { method: 'PATCH' }),
  markAllRead: (userId: string | number) =>
    req(`/notifications/user/${userId}/read-all`, { method: 'PATCH' }),
};

export const studentsAPI = {
  getById: (id: string | number) => req(`/students/${id}`),
  create: (data: {
    name: string;
    email: string;
    password: string;
    timezone?: string;
    zipCode?: string;
    gender?: string;
    referralCode?: string;
  }) =>
    req('/students', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string | number, data: object) =>
    req(`/students/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  saveStats: (id: string | number, statsData: object) =>
    req(`/students/${id}/stats`, {
      method: 'PATCH',
      body: JSON.stringify({ stats_data: JSON.stringify(statsData) }),
    }),
  deleteAccount: (id: string | number) =>
    req(`/students/${id}`, { method: 'DELETE' }),
};

export const studentBookingsAPI = {
  getForStudent: (studentId: string | number) => req(`/bookings/student/${studentId}`),
  cancel: (bookingId: number, reason?: string) =>
    req(`/bookings/${bookingId}/cancel`, {
      method: 'PATCH',
      body: JSON.stringify({ cancelled_by: 'student', reason }),
    }),
  cancelRequest: (bookingId: number) =>
    req(`/bookings/${bookingId}/cancel-request`, { method: 'PATCH' }),
  requestReschedule: (
    bookingId: number,
    data: { reschedule_date: string; reschedule_start: string; reschedule_end: string; reschedule_note?: string },
  ) =>
    req(`/bookings/${bookingId}/reschedule`, {
      method: 'PATCH',
      body: JSON.stringify({ requested_by: 'student', ...data }),
    }),
  acceptReschedule: (bookingId: number) =>
    req(`/bookings/${bookingId}/reschedule/accept`, { method: 'PATCH' }),
  declineReschedule: (bookingId: number) =>
    req(`/bookings/${bookingId}/reschedule/decline`, { method: 'PATCH' }),
  remind: (bookingId: number) =>
    req(`/bookings/${bookingId}/remind`, {
      method: 'POST',
      body: JSON.stringify({ reminded_by: 'student' }),
    }),
  reportCoachLate: (bookingId: number, studentId: number) =>
    req(`/bookings/${bookingId}/report-late`, {
      method: 'POST',
      body: JSON.stringify({ student_id: studentId }),
    }),
  acceptProposal: (bookingId: number) =>
    req(`/bookings/${bookingId}/confirm`, { method: 'PATCH' }),
};

export const coachesListAPI = {
  getAll: () => req('/coaches'),
  getById: (id: string | number) => req(`/coaches/${id}`),
};

export const reviewsAPI = {
  getForCoach: (coachId: string | number, studentId?: string | number) => {
    const query = studentId ? `?student_id=${encodeURIComponent(String(studentId))}` : '';
    return req(`/reviews/coach/${coachId}${query}`);
  },
  create: (coachId: string | number, data: { student_id: number; student_name: string; rating: number; body?: string }) =>
    req(`/reviews/coach/${coachId}`, { method: 'POST', body: JSON.stringify(data) }),
  delete: (reviewId: number, studentId: number) =>
    req(`/reviews/${reviewId}`, { method: 'DELETE', body: JSON.stringify({ student_id: studentId }) }),
  getByStudent: (studentId: string | number) => req(`/reviews/student/${studentId}`),
};

export const studentGroupLessonsAPI = {
  getAllPublic: (studentId?: string | number) => {
    const query = studentId ? `?student_id=${encodeURIComponent(String(studentId))}` : '';
    return req(`/group-lessons/public/all${query}`);
  },
  getPublicForCoach: (coachId: string | number, studentId?: string | number) => {
    const query = studentId ? `?student_id=${encodeURIComponent(String(studentId))}` : '';
    return req(`/group-lessons/public/coach/${coachId}${query}`);
  },
  getForStudent: (studentId: string | number) => req(`/group-lessons/student/${studentId}`),
  register: (groupLessonId: number, data: { student_id: number; student_name: string; student_rating?: string; student_email?: string; student_phone?: string; student_gender?: string }) =>
    req(`/group-lessons/${groupLessonId}/register`, { method: 'POST', body: JSON.stringify(data) }),
  requestCancel: (registrationId: number) =>
    req(`/group-lessons/registrations/${registrationId}/cancel-request`, { method: 'PATCH' }),
};

export const studentBookingRequestAPI = {
  create: (data: {
    coach_id: number; coach_user_id: number; student_id: number; student_name: string;
    coach_name: string; date: string; start_time: string; end_time: string;
    court_label?: string; court_address?: string; note?: string;
  }) => req('/bookings', { method: 'POST', body: JSON.stringify({ ...data, requested_by: 'student' }) }),
  getAvailableSlots: (coachId: string | number, date: string) =>
    req(`/bookings/available/${coachId}/${date}`),
};

export const messagesUnreadAPI = {
  getUnreadCount: (userId: string | number) => req(`/messages/${userId}/unread-count`),
};

export const questionsAPI = {
  getAll: (filters?: { state?: string; topic?: string }) => {
    const params = new URLSearchParams();
    if (filters?.state) params.append('state', filters.state);
    if (filters?.topic) params.append('topic', filters.topic);
    const q = params.toString();
    return req(`/questions${q ? `?${q}` : ''}`);
  },
  getById: (id: number) => req(`/questions/${id}`),
  getComments: (id: number) => req(`/questions/${id}/comments`),
  create: (data: { author_id: number; author_name: string; question: string; state: string; topic: string }) =>
    req('/questions', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: number, userId: number) =>
    req(`/questions/${id}`, { method: 'DELETE', body: JSON.stringify({ author_id: userId }) }),
  addComment: (id: number, data: { author_id: number; author_name: string; body: string; state: string }) =>
    req(`/questions/${id}/comments`, { method: 'POST', body: JSON.stringify(data) }),
  deleteComment: (questionId: number, commentId: number, userId: number) =>
    req(`/questions/${questionId}/comments/${commentId}`, { method: 'DELETE', body: JSON.stringify({ author_id: userId }) }),
};

export const coachBlocksAPI = {
  getBlocks: (coachId: string | number) => req(`/coaches/${coachId}/blocks`),
  addBlock: (
    coachId: string | number,
    data: { start_date: string; end_date: string; label?: string },
  ) =>
    req(`/coaches/${coachId}/blocks`, { method: 'POST', body: JSON.stringify(data) }),
  deleteBlock: (coachId: string | number, blockId: number) =>
    req(`/coaches/${coachId}/blocks/${blockId}`, { method: 'DELETE' }),
};

export const uploadAPI = {
  profilePicture: async (uri: string): Promise<{ url: string }> => {
    const formData = new FormData();
    const filename = uri.split('/').pop() || 'photo.jpg';
    const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    (formData as any).append('image', { uri, name: filename, type: mimeType });
    const response = await fetch(`${API_BASE}/upload/profile`, { method: 'POST', body: formData });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as any).error || 'Upload failed');
    }
    return response.json();
  },

  marketingPhotos: async (uris: string[]): Promise<{ urls: string[] }> => {
    const formData = new FormData();
    for (const uri of uris) {
      const filename = uri.split('/').pop() || 'photo.jpg';
      const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
      const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      (formData as any).append('images', { uri, name: filename, type: mimeType });
    }
    const response = await fetch(`${API_BASE}/upload/gallery`, { method: 'POST', body: formData });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as any).error || 'Upload failed');
    }
    return response.json();
  },
};

export const moderationAPI = {
  reportContent: (data: {
    reporter_user_id: number;
    reported_user_id?: number;
    content_type: 'post' | 'comment' | 'message' | 'user';
    content_id?: number;
    reason?: string;
  }) => req('/moderation/report', { method: 'POST', body: JSON.stringify(data) }),

  blockUser: (blockerUserId: number, blockedUserId: number) =>
    req('/moderation/block', {
      method: 'POST',
      body: JSON.stringify({ blocker_user_id: blockerUserId, blocked_user_id: blockedUserId }),
    }),

  unblockUser: (blockerUserId: number, blockedUserId: number) =>
    req('/moderation/block', {
      method: 'DELETE',
      body: JSON.stringify({ blocker_user_id: blockerUserId, blocked_user_id: blockedUserId }),
    }),

  getBlockedUsers: (userId: number) =>
    req(`/moderation/blocked/${userId}`),
};

export const recurringProgramsAPI = {
  getForCoach: (coachId: string | number) =>
    req(`/recurring-programs/coach/${coachId}`),
  getRegistrationsForCoach: (coachId: string | number) =>
    req(`/recurring-programs/coach/${coachId}/registrations`),
  confirmRegistration: (regId: number) =>
    req(`/recurring-programs/registrations/${regId}/confirm`, { method: 'PATCH' }),
  rejectRegistration: (regId: number) =>
    req(`/recurring-programs/registrations/${regId}/reject`, { method: 'PATCH' }),
  approveCancelRequest: (regId: number) =>
    req(`/recurring-programs/registrations/${regId}/approve-cancel`, { method: 'PATCH' }),
  declineCancelRequest: (regId: number) =>
    req(`/recurring-programs/registrations/${regId}/decline-cancel`, { method: 'PATCH' }),
  deactivate: (programId: number) =>
    req(`/recurring-programs/${programId}/deactivate`, { method: 'PATCH' }),
};

export const studentRecurringProgramsAPI = {
  getForStudent: (studentId: string | number) =>
    req(`/recurring-programs/student/${studentId}`),
  cancelRequest: (regId: number) =>
    req(`/recurring-programs/registrations/${regId}/cancel-request`, { method: 'PATCH' }),
};

export const paymentsAPI = {
  getTokenHistory: (coachUserId: string | number) =>
    req(`/payments/token-history/${coachUserId}`),
};
