export interface Student {
  user_id?: string | number;
  name: string;
  email: string;
  phone?: string;
  zipCode?: string;
  gender?: string;
  bio?: string;
  profile_picture?: string;
  timezone?: string;
  Role?: number;
}

export interface Coach {
  user_id?: string | number;
  coach_id?: string | number;
  name: string;
  email: string;
  phone?: string;
  specialization?: string;
  bio?: string;
  availability?: string;
  token_balance?: number;
  profilePicture?: string;
  court_locations?: string;
  courtLocation?: string;
  courtAddress?: string;
  courtZipCode?: string;
  courtLatitude?: number | null;
  courtLongitude?: number | null;
  hourlyRate?: number;
  Hourly_pay?: number;
  Active?: string;
  Role?: number;
  experience?: number;
  coachType?: string;
  certifications?: string;
  promotion?: string;
  hide_price?: boolean;
  zip_code?: string;
  travel_radius_miles?: number;
  photos?: string;
}

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'rejected'
  | 'cancelled'
  | 'new_time_proposed'
  | 'reschedule_requested'
  | 'waitlisted'
  | 'cancel_requested';

export interface Booking {
  booking_id: number;
  coach_id: number;
  coach_user_id: number;
  student_id: number;
  student_name: string;
  student_gender?: string | null;
  coach_name: string;
  date: string;
  start_time: string;
  end_time: string;
  court_label?: string;
  court_address?: string;
  status: BookingStatus;
  note?: string;
  reject_reason?: string;
  requested_by?: 'student' | 'coach';
  counter_date?: string;
  counter_start?: string;
  counter_end?: string;
  counter_note?: string;
  reschedule_by?: string;
  reschedule_date?: string;
  reschedule_start?: string;
  reschedule_end?: string;
  reschedule_note?: string;
  no_show?: number | null;
  coach_reported_late?: number;
  is_group_lesson?: boolean;
  group_lesson_id?: number;
  group_registration_id?: number;
  created_at?: string;
}

export interface GroupLesson {
  group_lesson_id: number;
  coach_id: number;
  coach_user_id: number;
  coach_name: string;
  coach_display_name?: string | null;
  profile_picture?: string;
  description?: string;
  skill_level?: string | null;
  lesson_date: string;
  start_time: string;
  end_time: string;
  price: number;
  location: string;
  max_registration: number;
  waitlist_max: number;
  status: 'active' | 'cancelled';
  require_confirmation: boolean;
  waiver_text?: string | null;
  title?: string;
  registration_count?: number;
  waitlist_count?: number;
}

export interface GroupLessonRequest {
  registration_id: number;
  group_lesson_id: number;
  student_id: number;
  student_name: string;
  student_email?: string;
  status: 'pending' | 'confirmed' | 'rejected' | 'waitlisted';
  lesson_date?: string;
  start_time?: string;
  end_time?: string;
  no_show?: number | null;
  created_at?: string;
}

export interface Message {
  message_id?: string | number;
  sender_id: number;
  receiver_id: number;
  sender_name?: string;
  receiver_name?: string;
  subject?: string;
  body: string;
  is_read: number | boolean;
  created_at?: string;
}

export interface Conversation {
  other_user_id: number;
  other_user_name: string;
  last_message_date: string;
  unread_count: number;
}

export interface Notification {
  notification_id: number;
  user_id: number;
  type: 'booking_request' | 'booking_confirmed' | 'booking_rejected' | 'booking_cancelled' |
    'new_time_proposed' | 'cancel_request' | 'reschedule_request' | 'reschedule_accepted' |
    'reschedule_declined' | 'group_lesson_confirmed' | 'group_lesson_waitlisted' |
    'group_lesson_cancelled' | 'reminder' | string;
  message: string;
  is_read: number | boolean;
  created_at?: string;
}

export interface RecurringProgramSlot {
  day: string;
  start_time: string;
  end_time: string;
}

export interface RecurringProgram {
  program_id: number;
  coach_id: number;
  coach_user_id: number;
  coach_name: string;
  coach_display_name?: string | null;
  title: string | null;
  description: string;
  location: string;
  day_of_week?: string;
  start_time?: string;
  end_time?: string;
  skill_level?: string;
  schedule_slots: RecurringProgramSlot[];
  skill_levels?: string[] | null;
  season_start?: string | null;
  season_end?: string | null;
  price: number;
  max_registration: number;
  waitlist_max: number;
  status: 'active' | 'inactive';
  created_at?: string;
  upcoming_dates: { date: string; day: string; start_time: string; end_time: string }[];
  student_registration?: { reg_id: number; status: string; selected_date: string } | null;
  profile_picture?: string | null;
}

export interface RecurringProgramRegistration {
  reg_id: number;
  program_id: number;
  coach_id: number;
  coach_user_id: number;
  coach_name: string;
  profile_picture?: string | null;
  title: string | null;
  description: string;
  location: string;
  day_of_week?: string;
  start_time?: string;
  end_time?: string;
  schedule_slots: RecurringProgramSlot[] | null;
  program_status: string;
  registration_status: string;
  registered_at?: string;
  selected_date: string;
  cancel_requested_from?: string | null;
  price: number;
  max_registration: number;
  waitlist_max: number;
}

export interface RecurringProgramReg {
  reg_id: number;
  program_id: number;
  student_id: number;
  student_name: string;
  masked_student_name?: string;
  student_email?: string | null;
  student_phone?: string | null;
  student_gender?: string | null;
  student_rating?: string | null;
  selected_date: string;
  selected_level?: string | null;
  status: string;
  created_at?: string;
  cancel_requested_from?: string | null;
  day_of_week?: string;
  start_time?: string;
  end_time?: string;
  location?: string;
  description?: string;
}
