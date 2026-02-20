// ── Users ────────────────────────────────────────────────
export interface Profile {
  id: string
  full_name: string
  phone: string | null
  avatar_url: string | null
  role: "user" | "admin"
  email_notifications: boolean
  last_login_at: string | null
  created_at: string
  updated_at: string
}

// ── Instructors ──────────────────────────────────────────
export interface Instructor {
  id: string
  slug: string
  full_name: string
  bio: string | null
  avatar_url: string | null
  specialties: string[]
  years_experience: number | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// ── Courses ──────────────────────────────────────────────
export interface Course {
  id: string
  title: string
  slug: string
  description: string | null
  short_description: string | null
  category: "baile" | "tatuaje"
  price: number
  is_free: boolean
  thumbnail_url: string | null
  preview_video_url: string | null
  instructor_id: string
  instructor?: Instructor
  legacy_instructor_name: string | null
  rating_avg: number | null
  reviews_count: number
  is_published: boolean
  published_at: string | null
  lessons?: Lesson[]
  created_at: string
  updated_at: string
}

// ── Lessons ──────────────────────────────────────────────
export interface Lesson {
  id: string
  course_id: string
  title: string
  description: string | null
  bunny_video_id: string
  bunny_library_id: string
  duration_seconds: number
  sort_order: number
  is_free: boolean
  created_at: string
  updated_at: string
}

// ── Cart ─────────────────────────────────────────────────
export interface CartItem {
  id: string
  user_id: string
  course_id: string
  added_at: string
  course?: Course
}

// ── Discount Rules ───────────────────────────────────────
export interface DiscountRule {
  id: string
  name: string
  category: "baile" | "tatuaje" | null
  min_courses: number
  discount_type: "percentage" | "fixed"
  discount_value: number
  is_active: boolean
  created_at: string
  updated_at: string
}

// ── Orders & Payments ────────────────────────────────────
export interface Order {
  id: string
  user_id: string | null
  customer_name_snapshot: string
  customer_email_snapshot: string
  customer_phone_snapshot: string | null
  reference: string
  subtotal: number
  discount_amount: number
  total: number
  discount_rule_id: string | null
  status: "pending" | "approved" | "declined" | "voided" | "refunded" | "chargeback"
  wompi_transaction_id: string | null
  payment_method: string | null
  payment_detail: string | null
  currency: string
  is_user_anonymized: boolean
  anonymized_at: string | null
  created_at: string
  approved_at: string | null
  reverted_at: string | null
  updated_at: string
  items?: OrderItem[]
}

export interface OrderItem {
  id: string
  order_id: string
  course_id: string | null
  course_title_snapshot: string
  price_at_purchase: number
  created_at: string
  course?: Course
}

export interface PaymentEvent {
  id: string
  order_id: string
  source: "webhook" | "reconciliation" | "manual"
  wompi_transaction_id: string | null
  external_status: string
  mapped_status: string
  is_applied: boolean
  reason: string | null
  payload_hash: string
  payload_json: Record<string, unknown>
  processed_at: string
}

// ── Enrollments & Progress ───────────────────────────────
export interface Enrollment {
  id: string
  user_id: string
  course_id: string
  source: "purchase" | "free"
  order_id: string | null
  enrolled_at: string
}

export interface CourseProgress {
  id: string
  user_id: string
  course_id: string
  last_lesson_id: string | null
  completed_lessons: number
  is_completed: boolean
  last_accessed_at: string
}

export interface LessonProgress {
  id: string
  user_id: string
  lesson_id: string
  completed: boolean
  completed_at: string | null
  video_position: number
}

// ── Email Outbox ────────────────────────────────────────────
export interface OrderEmailOutbox {
  id: string
  order_id: string
  email_type: string
  status: "pending" | "sent" | "failed"
  attempts: number
  next_attempt_at: string
  last_error: string | null
  sent_at: string | null
  created_at: string
  updated_at: string
}

// ── Notifications ────────────────────────────────────────
export interface CourseNotification {
  id: string
  course_id: string
  sent_by: string
  recipients_count: number
  sent_at: string
}

// ── Reviews ──────────────────────────────────────────────
export interface Review {
  id: string
  user_id: string
  course_id: string
  rating: number
  text: string | null
  is_visible: boolean
  created_at: string
  updated_at: string
  user?: Pick<Profile, "id" | "full_name" | "avatar_url">
}

// ── Audit ────────────────────────────────────────────────
export interface AdminAuditLog {
  id: string
  admin_user_id: string
  action: string
  entity_type: string
  entity_id: string | null
  before_data: Record<string, unknown> | null
  after_data: Record<string, unknown> | null
  result: "success" | "failure"
  metadata: Record<string, unknown> | null
  created_at: string
}

// ── Editorial ────────────────────────────────────────────
export interface Post {
  id: string
  title: string
  slug: string
  content: string | null
  excerpt: string | null
  cover_image_url: string | null
  is_published: boolean
  published_at: string | null
  created_at: string
  updated_at: string
}

export interface Event {
  id: string
  title: string
  description: string | null
  image_url: string | null
  event_date: string
  location: string | null
  is_published: boolean
  created_at: string
  updated_at: string
}

export interface GalleryItem {
  id: string
  image_url: string
  caption: string | null
  category: "baile" | "tatuaje"
  sort_order: number
  created_at: string
  updated_at: string
}

// ── Contact ──────────────────────────────────────────────
export interface ContactMessage {
  id: string
  name: string
  email: string
  subject: string | null
  message: string
  is_read: boolean
  created_at: string
}
